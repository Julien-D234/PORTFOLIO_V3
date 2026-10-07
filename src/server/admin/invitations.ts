import { and, eq, gt, isNull, lt, or } from "drizzle-orm";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { account, invitation, session, user } from "../db/schema";
import type { Db } from "../db/types";
import { writeAudit } from "../auth/audit";
import { isBanned } from "../auth/authz";
import { MIN_PASSWORD_LENGTH, type Auth } from "../auth/create-auth";

/**
 * Invitation = lien à usage unique permettant de choisir son mot de passe.
 * Jeton : 256 bits aléatoires ; seul le SHA-256 est stocké. Expiration 48 h.
 * Le jeton n'est JAMAIS journalisé (ni audit, ni logs).
 */
export const INVITATION_TTL_MS = 48 * 60 * 60 * 1000;
const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/; // 32 octets en base64url
const MAX_PASSWORD = 128;

export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");
export const generateToken = () => randomBytes(32).toString("base64url");
export const isWellFormedToken = (t: unknown): t is string => typeof t === "string" && TOKEN_RE.test(t);

type Actor = { actorId: string; ip?: string | null };

/** Émet un nouveau lien pour un compte ; invalide les liens non utilisés précédents. */
export async function issueInvitation(
  db: Db,
  userId: string,
  a: Actor & { regenerate?: boolean },
  now = new Date(),
): Promise<{ token: string; expiresAt: Date }> {
  const token = generateToken();
  const expiresAt = new Date(now.getTime() + INVITATION_TTL_MS);
  await db.transaction(async (tx) => {
    await tx.delete(invitation).where(and(eq(invitation.userId, userId), isNull(invitation.usedAt)));
    // Ménage : invitations expirées ou consommées depuis plus de 30 jours.
    await tx.delete(invitation).where(
      or(lt(invitation.expiresAt, new Date(now.getTime() - 30 * 86_400_000)), lt(invitation.usedAt, new Date(now.getTime() - 30 * 86_400_000))),
    );
    await tx.insert(invitation).values({
      id: randomUUID(), userId, tokenHash: hashToken(token), createdBy: a.actorId, expiresAt,
    });
  });
  await writeAudit(db, {
    actorId: a.actorId,
    action: a.regenerate ? "invitation.regenerated" : "invitation.created",
    targetId: userId,
    metadata: { expiresAt: expiresAt.toISOString() },
    ip: a.ip,
  });
  return { token, expiresAt };
}

export type CreateInvitedResult =
  | { ok: true; userId: string; token: string; expiresAt: Date }
  | { ok: false; reason: "EMAIL_TAKEN" };

/**
 * Crée un compte avec un mot de passe aléatoire que personne ne connaît, puis
 * émet l'invitation. Passe par l'adaptateur interne (pas par l'endpoint admin
 * de Better Auth) : on n'a pas le hook « mot de passe défini par un admin ».
 */
export async function createInvitedUser(
  db: Db,
  auth: Auth,
  input: { email: string; name: string; role: "user" | "admin"; locale?: string },
  a: Actor,
): Promise<CreateInvitedResult> {
  const ctx = await auth.$context;
  const email = input.email.trim().toLowerCase();
  if (await ctx.internalAdapter.findUserByEmail(email)) return { ok: false, reason: "EMAIL_TAKEN" };

  let created: { id: string };
  try {
    created = await ctx.internalAdapter.createUser(
      { email, name: input.name, emailVerified: true, role: input.role, mustChangePassword: false, locale: input.locale ?? "fr" } as never,
      { method: "admin" } as never,
    );
    await ctx.internalAdapter.linkAccount({
      userId: created.id,
      providerId: "credential",
      accountId: created.id,
      password: await ctx.password.hash(randomBytes(32).toString("base64url")),
    });
  } catch (e) {
    // Course sur l'index unique lower(email) : même réponse que la vérification amont.
    if (await ctx.internalAdapter.findUserByEmail(email)) return { ok: false, reason: "EMAIL_TAKEN" };
    throw e;
  }
  await writeAudit(db, { actorId: a.actorId, action: "user.created", targetId: created.id, metadata: { role: input.role, invited: true }, ip: a.ip });
  const inv = await issueInvitation(db, created.id, a);
  return { ok: true, userId: created.id, ...inv };
}

class Rollback extends Error {}

export type AcceptResult =
  | { ok: true; userId: string; email: string }
  | { ok: false; reason: "INVALID_LINK" | "PASSWORD_POLICY" };

/**
 * Consomme le lien et définit le mot de passe. Même résultat (INVALID_LINK) pour
 * un jeton mal formé, inconnu, expiré, déjà utilisé, ou dont le compte est banni.
 * La politique de mot de passe est vérifiée AVANT de consommer le jeton.
 */
export async function acceptInvitation(
  db: Db,
  auth: Auth,
  input: { token: unknown; password: unknown; ip?: string | null },
  now = new Date(),
): Promise<AcceptResult> {
  const INVALID = { ok: false, reason: "INVALID_LINK" } as const;
  if (!isWellFormedToken(input.token)) return INVALID;
  const tokenHash = hashToken(input.token);

  // Pré-contrôle bon marché : évite de payer un hachage Argon2 pour un jeton bidon.
  const [pre] = await db.select({ id: invitation.id }).from(invitation)
    .where(and(eq(invitation.tokenHash, tokenHash), isNull(invitation.usedAt), gt(invitation.expiresAt, now))).limit(1);
  if (!pre) return INVALID;

  const pwd = input.password;
  if (typeof pwd !== "string" || pwd.length < MIN_PASSWORD_LENGTH || pwd.length > MAX_PASSWORD) {
    return { ok: false, reason: "PASSWORD_POLICY" };
  }
  const passwordHash = await (await auth.$context).password.hash(pwd);

  try {
    return await db.transaction(async (tx) => {
      // Consommation atomique : un seul gagnant même en cas de requêtes concurrentes.
      const [used] = await tx.update(invitation).set({ usedAt: now })
        .where(and(eq(invitation.tokenHash, tokenHash), isNull(invitation.usedAt), gt(invitation.expiresAt, now)))
        .returning({ userId: invitation.userId });
      if (!used) throw new Rollback();

      const [u] = await tx.select({ id: user.id, email: user.email, banned: user.banned, banExpires: user.banExpires })
        .from(user).where(eq(user.id, used.userId));
      if (!u || isBanned(u, now)) throw new Rollback(); // le jeton reste utilisable après un éventuel déban

      const updated = await tx.update(account).set({ password: passwordHash, updatedAt: now })
        .where(and(eq(account.userId, u.id), eq(account.providerId, "credential"))).returning({ id: account.id });
      if (updated.length === 0) throw new Rollback();

      await tx.delete(session).where(eq(session.userId, u.id)); // révoque toute session existante
      await tx.update(user).set({ mustChangePassword: false, failedLoginCount: 0, lockedUntil: null, updatedAt: now })
        .where(eq(user.id, u.id));
      await writeAudit(tx as unknown as Db, { actorId: null, action: "invitation.used", targetId: u.id, ip: input.ip });
      return { ok: true as const, userId: u.id, email: u.email };
    });
  } catch (e) {
    if (e instanceof Rollback) return INVALID;
    throw e;
  }
}
