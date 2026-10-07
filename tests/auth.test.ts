import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import * as schema from "@/server/db/schema";
import { PASSWORD, call, login, makeEnv, seedUser, type TestEnv } from "./helpers/auth-env";

let env: TestEnv;
let adminCookie: string;
let userCookie: string;
let adminId: string;
let userId: string;

beforeAll(async () => {
  env = await makeEnv();
  adminId = (await seedUser(env, { email: "admin@test.dev", role: "admin" })).id;
  userId = (await seedUser(env, { email: "user@test.dev" })).id;
  adminCookie = (await login(env, "admin@test.dev")).cookie;
  userCookie = (await login(env, "user@test.dev")).cookie;
}, 60_000);
afterAll(async () => env.client.close());

describe("connexion", () => {
  it("accepte des identifiants valides et pose un cookie de session HttpOnly", async () => {
    const { res, cookie } = await login(env, "user@test.dev");
    expect(res.status).toBe(200);
    expect(cookie).toContain("session_token");
    expect(res.headers.getSetCookie().join(";").toLowerCase()).toContain("httponly");
    expect(res.headers.getSetCookie().join(";").toLowerCase()).toContain("samesite=lax");
  });
  it("répond de façon identique pour un mauvais mot de passe et un compte inconnu", async () => {
    const a = await login(env, "user@test.dev", "mauvais-mot-de-passe-1");
    const b = await login(env, "inconnu@test.dev", "mauvais-mot-de-passe-1");
    expect(a.res.status).toBe(401);
    expect(b.res.status).toBe(401);
    expect(await a.res.json()).toEqual(await b.res.json());
  });
  it("stocke les mots de passe en Argon2id", async () => {
    const [acc] = await env.db.select().from(schema.account).where(eq(schema.account.userId, userId));
    expect(acc.password).toMatch(/^\$argon2id\$/);
  });
  it("refuse un utilisateur banni", async () => {
    await seedUser(env, { email: "banni@test.dev", banned: true });
    const { res } = await login(env, "banni@test.dev");
    expect(res.status).toBe(403);
  });
});

describe("pas d'inscription publique", () => {
  it("sign-up est refusé pour un anonyme", async () => {
    const r = await call(env, "POST", "/sign-up/email", {
      body: { email: "intrus@test.dev", name: "x", password: PASSWORD },
    });
    expect(r.status).toBeGreaterThanOrEqual(400);
    const rows = await env.db.select().from(schema.user).where(eq(schema.user.email, "intrus@test.dev"));
    expect(rows).toHaveLength(0);
  });
});

describe("matrice d'accès aux endpoints admin", () => {
  const adminEndpoints: [string, "GET" | "POST", unknown?][] = [
    ["/admin/list-users?limit=5", "GET"],
    ["/admin/create-user", "POST", { email: "n@test.dev", password: PASSWORD, name: "N", role: "user" }],
    ["/admin/set-role", "POST", { userId: "x", role: "admin" }],
    ["/admin/ban-user", "POST", { userId: "x" }],
    ["/admin/remove-user", "POST", { userId: "x" }],
    ["/admin/set-user-password", "POST", { userId: "x", newPassword: PASSWORD }],
  ];
  for (const [p, m, body] of adminEndpoints) {
    it(`anonyme → ${m} ${p.split("?")[0]} refusé`, async () => {
      const r = await call(env, m, p, { body });
      expect([401, 403]).toContain(r.status);
    });
    it(`utilisateur → ${m} ${p.split("?")[0]} refusé`, async () => {
      const r = await call(env, m, p, { cookie: userCookie, body });
      expect(r.status).toBe(403);
    });
  }
  it("admin → list-users autorisé", async () => {
    const r = await call(env, "GET", "/admin/list-users?limit=50", { cookie: adminCookie });
    expect(r.status).toBe(200);
    expect(r.json!.users.length).toBeGreaterThanOrEqual(2);
  });
  it("un utilisateur ne peut pas se promouvoir admin", async () => {
    const r = await call(env, "POST", "/admin/set-role", { cookie: userCookie, body: { userId, role: "admin" } });
    expect(r.status).toBe(403);
    const [u] = await env.db.select().from(schema.user).where(eq(schema.user.id, userId));
    expect(u.role).toBe("user");
  });
  it("l'usurpation d'identité est bloquée même pour un admin", async () => {
    const r = await call(env, "POST", "/admin/impersonate-user", { cookie: adminCookie, body: { userId } });
    expect(r.status).toBe(403);
  });
});

describe("gestion des comptes par l'admin", () => {
  it("création : mot de passe temporaire + changement obligatoire + audit", async () => {
    const r = await call(env, "POST", "/admin/create-user", {
      cookie: adminCookie,
      body: { email: "nouveau@test.dev", password: PASSWORD, name: "Nouveau", role: "user" },
    });
    expect(r.status).toBe(200);
    const [u] = await env.db.select().from(schema.user).where(eq(schema.user.email, "nouveau@test.dev"));
    expect(u.role).toBe("user");
    expect(u.mustChangePassword).toBe(true);
    const logs = await env.db.select().from(schema.auditLog);
    expect(logs.some((l) => l.action === "admin.create-user" && l.actorId === adminId && l.targetId === u.id)).toBe(true);
  });
  it("refuse un mot de passe trop court (création et réinitialisation)", async () => {
    const t = await seedUser(env, { email: "pw@test.dev" });
    const reset = await call(env, "POST", "/admin/set-user-password", { cookie: adminCookie, body: { userId: t.id, newPassword: "short" } });
    expect(reset.status).toBe(400);
    const r = await call(env, "POST", "/admin/create-user", {
      cookie: adminCookie,
      body: { email: "court@test.dev", password: "short", name: "C", role: "user" },
    });
    expect(r.status).toBeGreaterThanOrEqual(400);
  });
  it("bannir révoque les sessions existantes immédiatement", async () => {
    const t = await seedUser(env, { email: "cible@test.dev" });
    const { cookie } = await login(env, "cible@test.dev");
    expect((await call(env, "GET", "/get-session", { cookie })).json?.user?.email).toBe("cible@test.dev");
    const ban = await call(env, "POST", "/admin/ban-user", { cookie: adminCookie, body: { userId: t.id } });
    expect(ban.status).toBe(200);
    expect((await call(env, "GET", "/get-session", { cookie })).json).toBeNull();
  });
  it("changer son mot de passe lève l'obligation", async () => {
    await call(env, "POST", "/admin/create-user", {
      cookie: adminCookie,
      body: { email: "chg@test.dev", password: PASSWORD, name: "Chg", role: "user" },
    });
    const { cookie } = await login(env, "chg@test.dev");
    const r = await call(env, "POST", "/change-password", {
      cookie,
      body: { currentPassword: PASSWORD, newPassword: "un-autre-mot-de-passe-9", revokeOtherSessions: true },
    });
    expect(r.status).toBe(200);
    const [u] = await env.db.select().from(schema.user).where(eq(schema.user.email, "chg@test.dev"));
    expect(u.mustChangePassword).toBe(false);
  });
});

describe("garde-fou dernier admin", () => {
  it("impossible de rétrograder / bannir / supprimer le dernier admin", async () => {
    // un 2e admin pour pouvoir agir sur le 1er sans s'auto-cibler
    const other = await seedUser(env, { email: "admin2@test.dev", role: "admin" });
    const c2 = (await login(env, "admin2@test.dev")).cookie;
    // on retire d'abord admin2 de la liste des admins actifs en ne gardant qu'admin@
    expect((await call(env, "POST", "/admin/set-role", { cookie: adminCookie, body: { userId: other.id, role: "user" } })).status).toBe(200);
    for (const [p, body] of [
      ["/admin/set-role", { userId: adminId, role: "user" }],
      ["/admin/remove-user", { userId: adminId }],
      ["/admin/ban-user", { userId: adminId }],
    ] as const) {
      const r = await call(env, "POST", p, { cookie: adminCookie, body });
      expect(r.status, p).toBe(403);
    }
    const [a] = await env.db.select().from(schema.user).where(eq(schema.user.id, adminId));
    expect(a.role).toBe("admin");
    expect(a.banned).toBe(false);
    void c2;
  });
});
