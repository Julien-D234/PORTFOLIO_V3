import "server-only";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { env } from "../env";
import * as schema from "./schema";
import type { Db } from "./types";

let db: Db | undefined;

export function getDb(): Db {
  if (!db) {
    const pool = new Pool({ connectionString: env().DATABASE_URL, max: 10 });
    db = drizzle(pool, { schema });
  }
  return db;
}
