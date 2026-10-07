import { hash, verify } from "@node-rs/argon2";

// Paramètres OWASP (Argon2id, 19 MiB / t=2 minimum ; on est plus exigeant).
const opts = {
  algorithm: 2, // Argon2id (const enum non utilisable avec isolatedModules)
  memoryCost: 65536, // 64 MiB
  timeCost: 3,
  parallelism: 1,
  outputLen: 32,
} as const;

export const hashPassword = (password: string) => hash(password, opts);

export async function verifyPassword(data: { hash: string; password: string }) {
  try {
    return await verify(data.hash, data.password);
  } catch {
    return false; // hash illisible => refus, jamais d'exception qui fuit
  }
}
