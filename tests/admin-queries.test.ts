import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import * as schema from "@/server/db/schema";
import { writeAudit } from "@/server/auth/audit";
import {
  deriveStatus, escapeLike, getUser, listAudit, listAuditActions, listUsers, normalizePaging,
} from "@/server/admin/queries";
import { login, makeEnv, seedUser, type TestEnv } from "./helpers/auth-env";

describe("fonctions pures", () => {
  it("normalizePaging borne et ignore les entrées invalides", () => {
    expect(normalizePaging({})).toEqual({ page: 1, pageSize: 20 });
    expect(normalizePaging({ page: "-3", pageSize: "abc" })).toEqual({ page: 1, pageSize: 20 });
    expect(normalizePaging({ page: "2.5" }).page).toBe(1);
    expect(normalizePaging({ pageSize: "99999" }).pageSize).toBe(100);
    expect(normalizePaging({ page: ["2"] }).page).toBe(1);
  });
  it("escapeLike neutralise les jokers", () => {
    expect(escapeLike("a%b_c\\d")).toBe("a\\%b\\_c\\\\d");
  });
  it("deriveStatus", () => {
    const now = new Date();
    const past = new Date(now.getTime() - 1000);
    const future = new Date(now.getTime() + 1000);
    expect(deriveStatus({ banned: false, banExpires: null, lockedUntil: null }, now)).toBe("active");
    expect(deriveStatus({ banned: true, banExpires: null, lockedUntil: null }, now)).toBe("banned");
    expect(deriveStatus({ banned: true, banExpires: past, lockedUntil: null }, now)).toBe("active");
    expect(deriveStatus({ banned: true, banExpires: future, lockedUntil: null }, now)).toBe("banned");
    expect(deriveStatus({ banned: false, banExpires: null, lockedUntil: future }, now)).toBe("locked");
    expect(deriveStatus({ banned: false, banExpires: null, lockedUntil: past }, now)).toBe("active");
  });
});

let env: TestEnv;
let adminId: string;
beforeAll(async () => {
  env = await makeEnv();
  adminId = (await seedUser(env, { email: "admin@test.dev", role: "admin" })).id;
  for (let i = 0; i < 25; i++) await seedUser(env, { email: `user${String(i).padStart(2, "0")}@test.dev` });
  await seedUser(env, { email: "100%_odd@test.dev" });
  await seedUser(env, { email: "banned@test.dev", banned: true });
}, 120_000);
afterAll(async () => env.client.close());

describe("listUsers", () => {
  it("pagine et compte", async () => {
    const p1 = await listUsers(env.db, { page: 1, pageSize: 10 });
    const p3 = await listUsers(env.db, { page: 3, pageSize: 10 });
    expect(p1.total).toBe(28);
    expect(p1.pageCount).toBe(3);
    expect(p1.items).toHaveLength(10);
    expect(p3.items).toHaveLength(8);
    const ids = new Set([...p1.items, ...(await listUsers(env.db, { page: 2, pageSize: 10 })).items, ...p3.items].map((u) => u.id));
    expect(ids.size).toBe(28);
  });
  it("page hors limites : vide, sans erreur", async () => {
    const p = await listUsers(env.db, { page: 999 });
    expect(p.items).toEqual([]);
    expect(p.total).toBe(28);
  });
  it("recherche par e-mail, nom, insensible à la casse", async () => {
    expect((await listUsers(env.db, { q: "USER07" })).items.map((u) => u.email)).toEqual(["user07@test.dev"]);
    expect((await listUsers(env.db, { q: "admin" })).total).toBe(1);
  });
  it("la recherche est littérale (pas de joker, pas d'injection)", async () => {
    expect((await listUsers(env.db, { q: "%" })).total).toBe(1);
    expect((await listUsers(env.db, { q: "_" })).total).toBe(1);
    expect((await listUsers(env.db, { q: "' OR 1=1 --" })).total).toBe(0);
    expect((await listUsers(env.db, { q: "x'; DROP TABLE \"user\"; --" })).total).toBe(0);
    expect((await listUsers(env.db)).total).toBe(28);
  });
  it("expose le statut et aucun champ sensible", async () => {
    const all = await listUsers(env.db, { pageSize: 100 });
    expect(all.items.find((u) => u.email === "banned@test.dev")?.status).toBe("banned");
    const json = JSON.stringify(all);
    expect(json).not.toMatch(/"(password|token|accessToken|refreshToken|idToken)"|\$argon2|scrypt/i);
    for (const u of all.items) expect(Object.keys(u)).not.toContain("password");
  });
});

describe("getUser", () => {
  it("renvoie null si inconnu", async () => {
    expect(await getUser(env.db, "nope")).toBeNull();
    expect(await getUser(env.db, "' OR '1'='1")).toBeNull();
  });
  it("renvoie les sessions actives, sans jeton", async () => {
    await login(env, "admin@test.dev");
    await login(env, "admin@test.dev");
    const [{ id: expiredUser }] = await env.db.select({ id: schema.user.id }).from(schema.user).where(eq(schema.user.email, "user01@test.dev"));
    await env.db.insert(schema.session).values({
      id: "old", token: "SECRET-TOKEN", userId: expiredUser, expiresAt: new Date(Date.now() - 1000),
    });
    const a = await getUser(env.db, adminId);
    expect(a?.user.email).toBe("admin@test.dev");
    expect(a?.sessions).toHaveLength(2);
    const b = await getUser(env.db, expiredUser);
    expect(b?.sessions).toHaveLength(0); // expirée ignorée
    const json = JSON.stringify([a, b]);
    expect(json).not.toMatch(/"(password|token)"|SECRET-TOKEN|\$argon2|scrypt/i);
  });
});

describe("listAudit", () => {
  beforeAll(async () => {
    for (let i = 0; i < 12; i++)
      await writeAudit(env.db, { actorId: adminId, action: i % 2 ? "user_banned" : "role_changed", targetId: adminId, metadata: { i }, ip: "1.2.3.4" });
    await writeAudit(env.db, { actorId: "deleted-actor", action: "user_removed", targetId: "gone" });
    await env.db.insert(schema.auditLog).values({ id: "bad", action: "weird", metadata: "{not json" });
  });
  it("pagine, jointure e-mail, plus récent d'abord", async () => {
    const p = await listAudit(env.db, { page: 1, pageSize: 5 });
    expect(p.total).toBeGreaterThanOrEqual(14);
    expect(p.items).toHaveLength(5);
    const dates = p.items.map((r) => r.createdAt.getTime());
    expect([...dates].sort((a, b) => b - a)).toEqual(dates);
  });
  it("filtre par action et par cible", async () => {
    const a = await listAudit(env.db, { action: "user_banned", pageSize: 100 });
    expect(a.items.every((r) => r.action === "user_banned")).toBe(true);
    expect(a.items[0].actorEmail).toBe("admin@test.dev");
    expect(a.items[0].targetEmail).toBe("admin@test.dev");
    expect(a.items[0].metadata).toHaveProperty("i");
    const t = await listAudit(env.db, { target: "gone" });
    expect(t.items).toHaveLength(1);
    expect(t.items[0].actorEmail).toBeNull();
    expect((await listAudit(env.db, { action: "x' OR '1'='1" })).total).toBe(0);
  });
  it("métadonnées invalides tolérées", async () => {
    const p = await listAudit(env.db, { action: "weird" });
    expect(p.items[0].metadata).toBeNull();
  });
  it("liste les actions distinctes", async () => {
    const acts = await listAuditActions(env.db);
    expect(acts).toEqual(expect.arrayContaining(["user_banned", "role_changed", "user_removed"]));
    expect(new Set(acts).size).toBe(acts.length);
  });
});
