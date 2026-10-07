import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthMiddleware, getSessionFromCtx } from "better-auth/api";
import { admin } from "better-auth/plugins";
import { and, count, eq, like, ne, sql } from "drizzle-orm";
import * as schema from "../db/schema";
import type { Db } from "../db/types";
import { writeAudit } from "./audit";
import { isLocked, lockUntilFor } from "./authz";
import { hashPassword, verifyPassword } from "./password";

export interface AuthOptions {
  secret: string;
  baseURL: string;
  production: boolean;
  /** Désactive le rate-limit (tests uniquement). */
  disableRateLimit?: boolean;
  /** Plugin Next (cookies dans les Server Actions) injecté par l'appelant. */
  extraPlugins?: unknown[];
}

export const MIN_PASSWORD_LENGTH = 12;
const ADMIN_MUTATIONS = ["/admin/set-role", "/admin/remove-user", "/admin/ban-user"];
const AUDITED = [
  "/admin/create-user",
  "/admin/set-role",
  "/admin/ban-user",
  "/admin/unban-user",
  "/admin/remove-user",
  "/admin/set-user-password",
  "/admin/revoke-user-sessions",
  "/change-password",
];

const INVALID_CREDENTIALS = { message: "Invalid email or password", code: "INVALID_EMAIL_OR_PASSWORD" };

export function createAuth(db: Db, opts: AuthOptions) {
  /** Nombre d'admins actifs (non bannis), hors utilisateur `excludeId`. */
  async function otherActiveAdmins(excludeId: string) {
    const [row] = await db
      .select({ n: count() })
      .from(schema.user)
      .where(
        and(like(schema.user.role, "%admin%"), eq(schema.user.banned, false), ne(schema.user.id, excludeId)),
      );
    return row?.n ?? 0;
  }

  const findByEmail = async (email: unknown) => {
    if (typeof email !== "string") return undefined;
    const [u] = await db.select().from(schema.user).where(sql`lower(${schema.user.email}) = ${email.trim().toLowerCase()}`);
    return u;
  };

  return betterAuth({
    secret: opts.secret,
    baseURL: opts.baseURL,
    trustedOrigins: [opts.baseURL],
    database: drizzleAdapter(db, { provider: "pg", schema }),

    emailAndPassword: {
      enabled: true,
      disableSignUp: true, // pas d'inscription publique : comptes créés par un admin
      minPasswordLength: MIN_PASSWORD_LENGTH,
      maxPasswordLength: 128,
      autoSignIn: false,
      revokeSessionsOnPasswordReset: true,
      password: { hash: hashPassword, verify: verifyPassword },
    },

    user: {
      additionalFields: {
        mustChangePassword: { type: "boolean", required: false, defaultValue: false, input: false },
        locale: { type: "string", required: false, defaultValue: "fr", input: false },
      },
    },

    session: {
      expiresIn: 60 * 60 * 24 * 7,
      updateAge: 60 * 60 * 24,
      // Pas de cache cookie : un bannissement/changement de rôle doit être immédiat.
      cookieCache: { enabled: false },
    },

    rateLimit: {
      enabled: !opts.disableRateLimit,
      storage: "database",
      modelName: "rateLimit",
      window: 60,
      max: 60,
      customRules: {
        "/sign-in/email": { window: 60, max: 5 },
        "/change-password": { window: 60, max: 5 },
        "/request-password-reset": { window: 300, max: 3 },
      },
    },

    advanced: {
      useSecureCookies: opts.production,
      defaultCookieAttributes: { httpOnly: true, sameSite: "lax", secure: opts.production },
      ipAddress: { ipAddressHeaders: ["x-forwarded-for"] },
    },

    plugins: [
      admin({
        defaultRole: "user",
        adminRoles: ["admin"],
        bannedUserMessage: "Account unavailable.",
      }),
      ...((opts.extraPlugins as never[]) ?? []),
    ],

    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        // L'usurpation d'identité est désactivée : surface d'attaque inutile ici.
        if (ctx.path === "/admin/impersonate-user") {
          throw new APIError("FORBIDDEN", { message: "Impersonation disabled" });
        }
        // Compte verrouillé : même réponse qu'un mauvais mot de passe (pas d'énumération de comptes).
        if (ctx.path === "/sign-in/email") {
          const u = await findByEmail((ctx.body as { email?: unknown } | undefined)?.email);
          if (u && isLocked(u)) throw new APIError("UNAUTHORIZED", INVALID_CREDENTIALS);
        }
        // Le plugin admin ne applique pas minPasswordLength : on le fait ici.
        if (ctx.path === "/admin/create-user" || ctx.path === "/admin/set-user-password") {
          const b = (ctx.body ?? {}) as { password?: unknown; newPassword?: unknown };
          const pwd = ctx.path === "/admin/create-user" ? b.password : b.newPassword;
          if (typeof pwd !== "string" || pwd.length < MIN_PASSWORD_LENGTH || pwd.length > 128) {
            throw new APIError("BAD_REQUEST", { message: "PASSWORD_POLICY" });
          }
        }
        if (ADMIN_MUTATIONS.includes(ctx.path)) {
          const body = (ctx.body ?? {}) as { userId?: string; role?: string | string[] };
          if (!body.userId) return;
          const [target] = await db.select().from(schema.user).where(eq(schema.user.id, body.userId));
          if (!target || !target.role.split(",").includes("admin")) return;
          const stays =
            ctx.path === "/admin/set-role" &&
            [body.role ?? []].flat().some((r) => r === "admin");
          if (stays) return;
          if ((await otherActiveAdmins(target.id)) === 0) {
            throw new APIError("FORBIDDEN", { message: "LAST_ADMIN" });
          }
        }
      }),

      after: createAuthMiddleware(async (ctx) => {
        if (ctx.path === "/sign-in/email") {
          const ip = ctx.request?.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
          const u = await findByEmail((ctx.body as { email?: unknown } | undefined)?.email);
          if (!u) return;
          const returned = ctx.context.returned;
          if (returned instanceof APIError) {
            // Seuls les échecs d'identifiants comptent (pas les bans ni le rate-limit) ; un compte déjà verrouillé n'est pas prolongé.
            if (returned.statusCode !== 401 || isLocked(u)) return;
            const [row] = await db
              .update(schema.user)
              .set({ failedLoginCount: sql`${schema.user.failedLoginCount} + 1` })
              .where(eq(schema.user.id, u.id))
              .returning({ n: schema.user.failedLoginCount });
            const until = lockUntilFor(row?.n ?? 0);
            await writeAudit(db, { actorId: null, action: "login_failed", targetId: u.id, ip });
            if (until) {
              await db.update(schema.user).set({ lockedUntil: until }).where(eq(schema.user.id, u.id));
              await writeAudit(db, { actorId: null, action: "account_locked", targetId: u.id, ip });
            }
          } else if (!(returned instanceof Error) && (u.failedLoginCount > 0 || u.lockedUntil)) {
            await db.update(schema.user).set({ failedLoginCount: 0, lockedUntil: null }).where(eq(schema.user.id, u.id));
          }
          return;
        }
        if (!AUDITED.includes(ctx.path)) return;
        const returned = ctx.context.returned;
        if (returned instanceof APIError || returned instanceof Error) return; // échec : rien à journaliser ici

        const session = await getSessionFromCtx(ctx).catch(() => null);
        const body = (ctx.body ?? {}) as { userId?: string; role?: unknown };
        const created = (returned as { user?: { id?: string } } | undefined)?.user?.id;
        const targetId = created ?? body.userId ?? session?.user.id ?? null;

        // Mot de passe défini par un admin => changement obligatoire à la prochaine connexion.
        if ((ctx.path === "/admin/create-user" || ctx.path === "/admin/set-user-password") && targetId) {
          await db.update(schema.user).set({ mustChangePassword: true }).where(eq(schema.user.id, targetId));
        }
        // L'utilisateur vient de choisir son propre mot de passe.
        if (ctx.path === "/change-password" && session) {
          await db.update(schema.user).set({ mustChangePassword: false }).where(eq(schema.user.id, session.user.id));
        }

        await writeAudit(db, {
          actorId: session?.user.id ?? null,
          action: ctx.path.replace(/^\//, "").replaceAll("/", "."),
          targetId,
          metadata: ctx.path === "/admin/set-role" ? { role: body.role } : undefined,
          ip: ctx.request?.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
        });
      }),
    },
  });
}

export type Auth = ReturnType<typeof createAuth>;
