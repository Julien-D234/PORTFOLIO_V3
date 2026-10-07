// Crée le PREMIER administrateur (jamais depuis l'interface web).
//   npm run create-admin -- --email moi@exemple.fr --name "Moi"
// Le mot de passe est demandé en saisie masquée (ou via ADMIN_PASSWORD pour un usage CI).
import { count, like } from "drizzle-orm";
import { createInterface } from "node:readline";
import { Writable } from "node:stream";
import { z } from "zod";
import { createAuth, MIN_PASSWORD_LENGTH } from "../src/server/auth/create-auth";
import { user } from "../src/server/db/schema";
import { connect } from "./lib.mts";

function arg(name: string) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
}

function askHidden(question: string): Promise<string> {
  let muted = false;
  const out = new Writable({
    write(chunk, _enc, cb) {
      if (!muted) process.stdout.write(chunk);
      cb();
    },
  });
  const rl = createInterface({ input: process.stdin, output: out, terminal: true });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      process.stdout.write("\n");
      resolve(answer);
    });
    muted = true;
  });
}

const input = z
  .object({
    email: z.email(),
    name: z.string().trim().min(1).max(100),
  })
  .parse({ email: arg("email"), name: arg("name") ?? "Admin" });

const password = process.env.ADMIN_PASSWORD ?? (await askHidden("Mot de passe : "));
if (password.length < MIN_PASSWORD_LENGTH || password.length > 128) {
  console.error(`Mot de passe invalide (${MIN_PASSWORD_LENGTH} à 128 caractères).`);
  process.exit(1);
}
if (!process.env.ADMIN_PASSWORD && password !== (await askHidden("Confirmer : "))) {
  console.error("Les mots de passe ne correspondent pas.");
  process.exit(1);
}

const { db, pool } = connect();
const [{ n }] = await db.select({ n: count() }).from(user).where(like(user.role, "%admin%"));
if (n > 0 && !process.argv.includes("--force")) {
  console.error("Un administrateur existe déjà. Utiliser --force pour en créer un autre.");
  await pool.end();
  process.exit(1);
}

const auth = createAuth(db, {
  secret: process.env.BETTER_AUTH_SECRET ?? "x".repeat(32),
  baseURL: process.env.BETTER_AUTH_URL ?? "http://localhost:3000",
  production: false,
  disableRateLimit: true,
});
const ctx = await auth.$context;
if (await ctx.internalAdapter.findUserByEmail(input.email)) {
  console.error("Cet email existe déjà.");
  await pool.end();
  process.exit(1);
}
const created = await ctx.internalAdapter.createUser({
  email: input.email,
  name: input.name,
  emailVerified: true,
  role: "admin",
  mustChangePassword: false,
} as never, { method: "admin" } as never);
await ctx.internalAdapter.linkAccount({
  userId: created.id,
  providerId: "credential",
  accountId: created.id,
  password: await ctx.password.hash(password),
});
console.log(`Administrateur créé : ${input.email} (id ${created.id})`);
await pool.end();
