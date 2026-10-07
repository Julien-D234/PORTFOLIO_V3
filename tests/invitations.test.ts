import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import * as schema from "@/server/db/schema";
import {
  acceptInvitation, createInvitedUser, generateToken, hashToken, INVITATION_TTL_MS, isWellFormedToken, issueInvitation,
} from "@/server/admin/invitations";
import { allowRequest } from "@/server/rate-limit";
import { call, login, makeEnv, seedUser, type TestEnv } from "./helpers/auth-env";

const NEW_PWD = "my-brand-new-password-1";
let env: TestEnv;
let adminId: string;
beforeAll(async () => {
  env = await makeEnv();
  adminId = (await seedUser(env, { email: "admin@test.dev", role: "admin" })).id;
}, 60_000);
afterAll(async () => env.client.close());

const row = async (id: string) => (await env.db.select().from(schema.user).where(eq(schema.user.id, id)))[0];
const invitations = (userId: string) => env.db.select().from(schema.invitation).where(eq(schema.invitation.userId, userId));
const invite = async (email: string, role: "user" | "admin" = "user") => {
  const r = await createInvitedUser(env.db, env.auth, { email, name: "N", role }, { actorId: adminId, ip: "1.1.1.1" });
  if (!r.ok) throw new Error("create failed");
  return r;
};

describe("jetons", () => {
  it("256 bits, base64url, hash SHA-256 hex", () => {
    const t = generateToken();
    expect(isWellFormedToken(t)).toBe(true);
    expect(new Set(Array.from({ length: 50 }, generateToken)).size).toBe(50);
    expect(hashToken(t)).toMatch(/^[0-9a-f]{64}$/);
  });
  it("rejette les jetons mal formés", () => {
    for (const bad of ["", "abc", "a".repeat(44), `${"a".repeat(42)}!`, null, undefined, 42, {}, ["a"]])
      expect(isWellFormedToken(bad)).toBe(false);
  });
});

describe("création d'un compte invité", () => {
  it("crée le compte sans mot de passe connu et stocke uniquement le hash", async () => {
    const r = await invite("New.User@Test.dev");
    const u = await row(r.userId);
    expect(u.email).toBe("new.user@test.dev");
    expect(u.role).toBe("user");
    expect(u.mustChangePassword).toBe(false);
    const [inv] = await invitations(r.userId);
    expect(inv.tokenHash).toBe(hashToken(r.token));
    expect(JSON.stringify(inv)).not.toContain(r.token);
    expect(inv.expiresAt.getTime() - Date.now()).toBeGreaterThan(INVITATION_TTL_MS - 60_000);
    expect(inv.expiresAt.getTime() - Date.now()).toBeLessThanOrEqual(INVITATION_TTL_MS);
    // personne ne peut se connecter avant d'avoir utilisé le lien
    expect((await login(env, "new.user@test.dev")).res.status).toBe(401);
  });
  it("refuse un e-mail déjà pris (insensible à la casse)", async () => {
    await invite("dup@test.dev");
    const r = await createInvitedUser(env.db, env.auth, { email: "DUP@test.dev", name: "x", role: "user" }, { actorId: adminId });
    expect(r).toEqual({ ok: false, reason: "EMAIL_TAKEN" });
  });
  it("audite sans jamais écrire le jeton", async () => {
    const r = await invite("audit@test.dev");
    const logs = await env.db.select().from(schema.auditLog).where(eq(schema.auditLog.targetId, r.userId));
    expect(logs.map((l) => l.action).sort()).toEqual(["invitation.created", "user.created"]);
    expect(JSON.stringify(logs)).not.toContain(r.token);
    expect(logs.every((l) => l.actorId === adminId)).toBe(true);
  });
});

describe("acceptInvitation", () => {
  it("définit le mot de passe, usage unique, révoque les sessions", async () => {
    const r = await invite("flow@test.dev");
    const res = await acceptInvitation(env.db, env.auth, { token: r.token, password: NEW_PWD, ip: "2.2.2.2" });
    expect(res).toMatchObject({ ok: true, userId: r.userId, email: "flow@test.dev" });
    expect((await login(env, "flow@test.dev", NEW_PWD)).res.status).toBe(200);
    expect((await row(r.userId)).mustChangePassword).toBe(false);
    // second usage : refusé, mot de passe inchangé
    expect(await acceptInvitation(env.db, env.auth, { token: r.token, password: "another-password-99" })).toEqual({ ok: false, reason: "INVALID_LINK" });
    expect((await login(env, "flow@test.dev", "another-password-99")).res.status).toBe(401);
    const logs = await env.db.select().from(schema.auditLog).where(eq(schema.auditLog.action, "invitation.used"));
    expect(logs.find((l) => l.targetId === r.userId)?.actorId).toBeNull();
    expect(JSON.stringify(logs)).not.toContain(r.token);
    expect(JSON.stringify(logs)).not.toContain(NEW_PWD);
  });
  it("usage du lien sur un compte existant : change le mot de passe et révoque les sessions", async () => {
    const r = await invite("reset@test.dev");
    await acceptInvitation(env.db, env.auth, { token: r.token, password: NEW_PWD });
    const { cookie } = await login(env, "reset@test.dev", NEW_PWD);
    expect((await call(env, "GET", "/get-session", { cookie })).json?.user?.email).toBe("reset@test.dev");
    const again = await issueInvitation(env.db, r.userId, { actorId: adminId }, new Date());
    await acceptInvitation(env.db, env.auth, { token: again.token, password: "reset-password-0987" });
    expect((await call(env, "GET", "/get-session", { cookie })).json).toBeNull(); // ancienne session morte
    expect((await login(env, "reset@test.dev", NEW_PWD)).res.status).toBe(401);
    expect((await login(env, "reset@test.dev", "reset-password-0987")).res.status).toBe(200);
  });
  it("réponse identique : jeton inconnu, mal formé, expiré", async () => {
    const r = await invite("exp@test.dev");
    const INVALID = { ok: false, reason: "INVALID_LINK" };
    expect(await acceptInvitation(env.db, env.auth, { token: generateToken(), password: NEW_PWD })).toEqual(INVALID);
    expect(await acceptInvitation(env.db, env.auth, { token: "nope", password: NEW_PWD })).toEqual(INVALID);
    expect(await acceptInvitation(env.db, env.auth, { token: undefined, password: NEW_PWD })).toEqual(INVALID);
    const future = new Date(Date.now() + INVITATION_TTL_MS + 1000);
    expect(await acceptInvitation(env.db, env.auth, { token: r.token, password: NEW_PWD }, future)).toEqual(INVALID);
    // juste avant l'expiration : valide
    const almost = new Date(Date.now() + INVITATION_TTL_MS - 60_000);
    expect((await acceptInvitation(env.db, env.auth, { token: r.token, password: NEW_PWD }, almost)).ok).toBe(true);
  });
  it("mot de passe hors politique : refusé SANS consommer le jeton", async () => {
    const r = await invite("pol@test.dev");
    for (const bad of ["short", "x".repeat(129), "", undefined, 12345678901234, ["a".repeat(20)]])
      expect(await acceptInvitation(env.db, env.auth, { token: r.token, password: bad })).toEqual({ ok: false, reason: "PASSWORD_POLICY" });
    expect((await acceptInvitation(env.db, env.auth, { token: r.token, password: NEW_PWD })).ok).toBe(true);
  });
  it("compte banni : refusé, jeton conservé jusqu'au déban", async () => {
    const r = await invite("ban@test.dev");
    await env.db.update(schema.user).set({ banned: true }).where(eq(schema.user.id, r.userId));
    expect(await acceptInvitation(env.db, env.auth, { token: r.token, password: NEW_PWD })).toEqual({ ok: false, reason: "INVALID_LINK" });
    expect((await invitations(r.userId))[0].usedAt).toBeNull();
    await env.db.update(schema.user).set({ banned: false }).where(eq(schema.user.id, r.userId));
    expect((await acceptInvitation(env.db, env.auth, { token: r.token, password: NEW_PWD })).ok).toBe(true);
  });
  it("concurrence : un seul des deux appels réussit", async () => {
    const r = await invite("race@test.dev");
    const results = await Promise.all([
      acceptInvitation(env.db, env.auth, { token: r.token, password: NEW_PWD }),
      acceptInvitation(env.db, env.auth, { token: r.token, password: "other-password-12345" }),
    ]);
    expect(results.filter((x) => x.ok)).toHaveLength(1);
  });
  it("lève le verrouillage du compte", async () => {
    const r = await invite("lock@test.dev");
    await env.db.update(schema.user).set({ failedLoginCount: 10, lockedUntil: new Date(Date.now() + 600_000) }).where(eq(schema.user.id, r.userId));
    await acceptInvitation(env.db, env.auth, { token: r.token, password: NEW_PWD });
    const u = await row(r.userId);
    expect(u.lockedUntil).toBeNull();
    expect(u.failedLoginCount).toBe(0);
  });
});

describe("regénération", () => {
  it("invalide l'ancien lien", async () => {
    const r = await invite("regen@test.dev");
    const n = await issueInvitation(env.db, r.userId, { actorId: adminId }, new Date());
    expect(n.token).not.toBe(r.token);
    expect(await invitations(r.userId)).toHaveLength(1);
    expect(await acceptInvitation(env.db, env.auth, { token: r.token, password: NEW_PWD })).toEqual({ ok: false, reason: "INVALID_LINK" });
    expect((await acceptInvitation(env.db, env.auth, { token: n.token, password: NEW_PWD })).ok).toBe(true);
  });
  it("l'invitation est supprimée avec le compte", async () => {
    const r = await invite("gone@test.dev");
    await env.db.delete(schema.user).where(eq(schema.user.id, r.userId));
    expect(await invitations(r.userId)).toHaveLength(0);
  });
});

describe("allowRequest (limiteur)", () => {
  it("bloque au-delà du plafond puis repart après la fenêtre", async () => {
    const o = { windowSeconds: 60, max: 3 };
    const t = 1_000_000;
    const out = [];
    for (let i = 0; i < 5; i++) out.push(await allowRequest(env.db, "t1", o, t + i));
    expect(out).toEqual([true, true, true, false, false]);
    expect(await allowRequest(env.db, "t1", o, t + 61_000)).toBe(true);
    expect(await allowRequest(env.db, "t2", o, t)).toBe(true); // clés indépendantes
  });
});
