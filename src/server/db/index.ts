import "server-only";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { env } from "../env";
import * as schema from "./schema";
import type { Db } from "./types";

// Singleton partagé via globalThis : les bundles RSC / route handlers de Next ont chacun leur copie du module.
const g = globalThis as unknown as { __portfolioDb?: Db };

export function getDb(): Db {
  if (!g.__portfolioDb) {
    // DB_POOL_MAX=1 : nécessaire avec `npm run dev:db` (le serveur PGlite n'accepte qu'une connexion à la fois).
    const pool = new Pool({ connectionString: env().DATABASE_URL, max: Number(process.env.DB_POOL_MAX) || 10 });
    g.__portfolioDb = drizzle(pool, { schema });
  }
  return g.__portfolioDb;
}
