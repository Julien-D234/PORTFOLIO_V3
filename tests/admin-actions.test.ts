import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import * as schema from "@/server/db/schema";
import { unlockUser } from "@/server/admin/actions";
import { call, login, makeEnv, seedUser, type TestEnv } from "./helpers/auth-env";

let env: TestEnv;
let adminId: string;
let adminCookie: string;
beforeAll(async () => {
  env = await makeEnv();
  adminId = (await seedUser(env, { email: "admin@test.dev", role: "admin" })).id;
  adminCookie = (await login(env, "admin@test.dev")).cookie;
}, 60_000);
afterAll(async () => env.client.close());

const row = async (id: string) => (await env.db.select().from(schema.user).where(eq(schema.user.id, id)))[0];
const audit = async (action: string, targetId: string) =>
  (await env.db.select().from(schema.auditLog)).filter((l) => l.action === action && l.targetId === targetId);
const post = (path: string, body: unknown) => call(env, "POST", path, { cookie: adminCookie, body });

describe("actions admin (endpoints Better Auth utilisés par l'UI)", () => {
  it("rôle : promotion puis rétrogradation, auditées", async () => {
    const t = await seedUser(env, { email: "role@test.dev" });
    expect((await post("/admin/set-role", { userId: t.id, role: "admin" })).status).toBe(200);
    expect((await row(t.id)).role).toBe("admin");
    expect((await post("/admin/set-role", { userId: t.id, role: "user" })).status).toBe(200);
    expect((await row(t.id)).role).toBe("user");
    expect(await audit("admin.set-role", t.id)).toHaveLength(2);
  });

  it("ban avec motif et durée, puis déban", async () => {
    const t = await seedUser(env, { email: "ban@test.dev" });
    const r = await post("/admin/ban-user", { userId: t.id, banReason: "spam", banExpiresIn: 3600 });
    expect(r.status).toBe(200);
    const b = await row(t.id);
    expect(b.banned).toBe(true);
    expect(b.banReason).toBe("spam");
    const left = b.banExpires!.getTime() - Date.now();
    expect(left).toBeGreaterThan(3_500_000);
    expect(left).toBeLessThanOrEqual(3_600_000);
    expect((await login(env, "ban@test.dev")).res.status).not.toBe(200);
    expect((await post("/admin/unban-user", { userId: t.id })).status).toBe(200);
    expect((await row(t.id)).banned).toBe(false);
    expect((await login(env, "ban@test.dev")).res.status).toBe(200);
    expect(await audit("admin.unban-user", t.id)).toHaveLength(1);
  });

  it("révocation des sessions", async () => {
    const t = await seedUser(env, { email: "rev@test.dev" });
    const { cookie } = await login(env, "rev@test.dev");
    expect((await post("/admin/revoke-user-sessions", { userId: t.id })).status).toBe(200);
    expect((await call(env, "GET", "/get-session", { cookie })).json).toBeNull();
    expect(await audit("admin.revoke-user-sessions", t.id)).toHaveLength(1);
  });

  it("suppression, auditée", async () => {
    const t = await seedUser(env, { email: "del@test.dev" });
    expect((await post("/admin/remove-user", { userId: t.id })).status).toBe(200);
    expect(await row(t.id)).toBeUndefined();
    expect(await audit("admin.remove-user", t.id)).toHaveLength(1);
  });

  it("LAST_ADMIN : le seul admin ne peut être ni rétrogradé, ni banni, ni supprimé", async () => {
    const other = await seedUser(env, { email: "solo@test.dev", role: "admin" });
    // on bannit tous les autres admins sauf `solo` en passant par la base, puis on tente via l'API depuis admin@
    await env.db.update(schema.user).set({ banned: true }).where(eq(schema.user.id, adminId));
    for (const [p, b] of [
      ["/admin/set-role", { userId: other.id, role: "user" }],
      ["/admin/ban-user", { userId: other.id }],
      ["/admin/remove-user", { userId: other.id }],
    ] as const) {
      const r = await call(env, "POST", p, { cookie: (await login(env, "solo@test.dev")).cookie, body: b });
      expect(r.status).toBe(403);
      expect(JSON.stringify(r.json)).toContain("LAST_ADMIN");
    }
    await env.db.update(schema.user).set({ banned: false }).where(eq(schema.user.id, adminId));
  });
});

describe("déverrouillage", () => {
  it("remet à zéro le compteur et le verrou, et journalise", async () => {
    const t = await seedUser(env, { email: "lock@test.dev" });
    await env.db.update(schema.user).set({ failedLoginCount: 10, lockedUntil: new Date(Date.now() + 600_000) }).where(eq(schema.user.id, t.id));
    expect(await unlockUser(env.db, t.id, { actorId: adminId, ip: "1.1.1.1" })).toBe(true);
    const u = await row(t.id);
    expect(u.failedLoginCount).toBe(0);
    expect(u.lockedUntil).toBeNull();
    const logs = await audit("user.unlocked", t.id);
    expect(logs).toHaveLength(1);
    expect(logs[0].actorId).toBe(adminId);
    expect((await login(env, "lock@test.dev")).res.status).toBe(200);
  });
  it("compte inconnu : false, aucun audit", async () => {
    expect(await unlockUser(env.db, "nope", { actorId: adminId })).toBe(false);
    expect(await audit("user.unlocked", "nope")).toHaveLength(0);
  });
});
