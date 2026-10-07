import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import * as schema from "@/server/db/schema";
import { isLocked, lockUntilFor, MAX_FAILED_LOGINS } from "@/server/auth/authz";
import { login, makeEnv, seedUser, type TestEnv } from "./helpers/auth-env";

describe("règles de verrouillage (pures)", () => {
  it("ne verrouille qu'au seuil", () => {
    expect(lockUntilFor(MAX_FAILED_LOGINS - 1)).toBeNull();
    expect(lockUntilFor(MAX_FAILED_LOGINS)).toBeInstanceOf(Date);
  });
  it("isLocked tient compte de la date", () => {
    const now = new Date();
    expect(isLocked({ lockedUntil: null }, now)).toBe(false);
    expect(isLocked({ lockedUntil: new Date(now.getTime() + 1000) }, now)).toBe(true);
    expect(isLocked({ lockedUntil: new Date(now.getTime() - 1000) }, now)).toBe(false);
  });
});

let env: TestEnv;
beforeAll(async () => {
  env = await makeEnv();
  await seedUser(env, { email: "a@test.dev" });
  await seedUser(env, { email: "b@test.dev" });
}, 60_000);
afterAll(async () => env.client.close());

const row = async (email: string) =>
  (await env.db.select().from(schema.user).where(eq(schema.user.email, email)))[0];

describe("verrouillage de compte", () => {
  it("verrouille après 10 échecs, même avec le bon mot de passe, sans révéler le verrou", async () => {
    for (let i = 0; i < MAX_FAILED_LOGINS; i++) {
      expect((await login(env, "a@test.dev", "mauvais-mot-de-passe-1")).res.status).toBe(401);
    }
    const u = await row("a@test.dev");
    expect(u.lockedUntil).not.toBeNull();
    const locked = await login(env, "a@test.dev"); // bon mot de passe
    const unknown = await login(env, "inconnu@test.dev", "mauvais-mot-de-passe-1");
    expect(locked.res.status).toBe(401);
    expect(await locked.res.json()).toEqual(await unknown.res.json());
    const actions = (await env.db.select().from(schema.auditLog)).map((a) => a.action);
    expect(actions).toContain("account_locked");
    expect(actions.filter((a) => a === "login_failed")).toHaveLength(MAX_FAILED_LOGINS);
  });
  it("ne prolonge pas le verrou pendant les tentatives bloquées", async () => {
    const before = (await row("a@test.dev")).lockedUntil!.getTime();
    await login(env, "a@test.dev", "encore-mauvais-1");
    expect((await row("a@test.dev")).lockedUntil!.getTime()).toBe(before);
  });
  it("se déverrouille après le délai et remet le compteur à zéro", async () => {
    await env.db.update(schema.user).set({ lockedUntil: new Date(Date.now() - 1000) }).where(eq(schema.user.email, "a@test.dev"));
    expect((await login(env, "a@test.dev")).res.status).toBe(200);
    const u = await row("a@test.dev");
    expect(u.failedLoginCount).toBe(0);
    expect(u.lockedUntil).toBeNull();
  });
  it("une connexion réussie remet le compteur à zéro avant le seuil", async () => {
    for (let i = 0; i < 3; i++) await login(env, "b@test.dev", "mauvais-mot-de-passe-1");
    expect((await row("b@test.dev")).failedLoginCount).toBe(3);
    expect((await login(env, "b@test.dev")).res.status).toBe(200);
    expect((await row("b@test.dev")).failedLoginCount).toBe(0);
  });
  it("n'affecte pas les autres comptes", async () => {
    expect((await row("b@test.dev")).lockedUntil).toBeNull();
  });
});
