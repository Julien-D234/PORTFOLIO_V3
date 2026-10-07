import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { randomUUID } from "node:crypto";
import path from "node:path";
import * as schema from "@/server/db/schema";
import type { Db } from "@/server/db/types";
import { createAuth } from "@/server/auth/create-auth";

export const BASE = "http://localhost:3000";
export const PASSWORD = "correct-horse-battery-1";

/** Base Postgres en mémoire (WASM) migrée avec les vraies migrations Drizzle. */
export async function makeEnv() {
  const client = new PGlite();
  const db = drizzle(client, { schema }) as unknown as Db;
  await migrate(drizzle(client), { migrationsFolder: path.resolve(__dirname, "../../drizzle") });
  const auth = createAuth(db, {
    secret: "test-secret-test-secret-test-secret-123456",
    baseURL: BASE,
    production: false,
    disableRateLimit: true,
  });
  return { db, auth, client };
}
export type TestEnv = Awaited<ReturnType<typeof makeEnv>>;

/** Crée un compte directement (équivalent du script create-admin). */
export async function seedUser(
  env: TestEnv,
  o: { email: string; role?: "user" | "admin"; mustChangePassword?: boolean; banned?: boolean },
) {
  const ctx = await env.auth.$context;
  const u = await ctx.internalAdapter.createUser({
    email: o.email,
    name: o.email.split("@")[0],
    emailVerified: true,
    role: o.role ?? "user",
    banned: o.banned ?? false,
    mustChangePassword: o.mustChangePassword ?? false,
  } as never, { method: "admin" } as never);
  await ctx.internalAdapter.linkAccount({
    userId: u.id,
    providerId: "credential",
    accountId: u.id,
    password: await ctx.password.hash(PASSWORD),
  });
  return u;
}

/** Connexion via le vrai endpoint HTTP ; renvoie l'en-tête Cookie à rejouer. */
export async function login(env: TestEnv, email: string, password = PASSWORD) {
  const res = await env.auth.handler(
    new Request(`${BASE}/api/auth/sign-in/email`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: BASE },
      body: JSON.stringify({ email, password }),
    }),
  );
  const cookie = res.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
  return { res, cookie };
}

export async function call(
  env: TestEnv,
  method: "GET" | "POST",
  p: string,
  o: { cookie?: string; body?: unknown } = {},
) {
  const res = await env.auth.handler(
    new Request(`${BASE}/api/auth${p}`, {
      method,
      headers: {
        "content-type": "application/json",
        origin: BASE,
        ...(o.cookie ? { cookie: o.cookie } : {}),
      },
      body: o.body ? JSON.stringify(o.body) : undefined,
    }),
  );
  let json: unknown = null;
  try { json = await res.json(); } catch {}
  return { status: res.status, // eslint-disable-next-line @typescript-eslint/no-explicit-any
    json: json as Record<string, any> | null, res };
}
export const id = () => randomUUID();
