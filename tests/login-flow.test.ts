import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import * as schema from "@/server/db/schema";
import { PASSWORD, call, login, makeEnv, seedUser, type TestEnv } from "./helpers/auth-env";

describe("rate-limit de connexion (actif)", () => {
  let env: TestEnv;
  beforeAll(async () => {
    env = await makeEnv({ rateLimit: true });
    await seedUser(env, { email: "rl@test.dev" });
  }, 60_000);
  afterAll(async () => env.client.close());

  it("renvoie 429 après 5 tentatives par minute", async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 7; i++) statuses.push((await login(env, "rl@test.dev", "mauvais-mot-de-passe-1")).res.status);
    expect(statuses.slice(0, 5).every((s) => s === 401)).toBe(true);
    expect(statuses.slice(5)).toEqual([429, 429]);
  });
});

describe("changement de mot de passe forcé", () => {
  let env: TestEnv;
  beforeAll(async () => {
    env = await makeEnv();
    await seedUser(env, { email: "must@test.dev", mustChangePassword: true });
  }, 60_000);
  afterAll(async () => env.client.close());

  it("la connexion indique mustChangePassword, puis le changement lève le drapeau", async () => {
    const { res, cookie } = await login(env, "must@test.dev");
    expect(res.status).toBe(200);
    expect(((await res.json()) as { user: { mustChangePassword: boolean } }).user.mustChangePassword).toBe(true);
    const r = await call(env, "POST", "/change-password", {
      cookie,
      body: { currentPassword: PASSWORD, newPassword: "un-tout-nouveau-mdp-9", revokeOtherSessions: true },
    });
    expect(r.status).toBe(200);
    const [u] = await env.db.select().from(schema.user).where(eq(schema.user.email, "must@test.dev"));
    expect(u.mustChangePassword).toBe(false);
    expect((await login(env, "must@test.dev", "un-tout-nouveau-mdp-9")).res.status).toBe(200);
    expect((await login(env, "must@test.dev")).res.status).toBe(401);
  });
  it("refuse un mauvais mot de passe actuel", async () => {
    await seedUser(env, { email: "m2@test.dev", mustChangePassword: true });
    const { cookie } = await login(env, "m2@test.dev");
    const r = await call(env, "POST", "/change-password", {
      cookie, body: { currentPassword: "faux-mot-de-passe-1", newPassword: "un-tout-nouveau-mdp-9" },
    });
    expect(r.status).toBeGreaterThanOrEqual(400);
  });
  it("la déconnexion invalide la session", async () => {
    const { cookie } = await login(env, "must@test.dev", "un-tout-nouveau-mdp-9");
    expect((await call(env, "POST", "/sign-out", { cookie, body: {} })).status).toBe(200);
    expect((await call(env, "GET", "/get-session", { cookie })).json).toBeNull();
  });
});
