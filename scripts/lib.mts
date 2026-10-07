import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "../src/server/db/schema";
import type { Db } from "../src/server/db/types";

export function connect() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL manquant");
  const pool = new Pool({ connectionString: url, max: 2 });
  return { pool, db: drizzle(pool, { schema }) as unknown as Db };
}
