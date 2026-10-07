import { sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import type { Db } from "./db/types";

/**
 * Limiteur à fenêtre fixe, persistant (table rate_limit, partagée avec Better Auth
 * sous un préfixe "app:" pour éviter toute collision). Atomique : un seul UPSERT.
 * Renvoie true si la requête est AUTORISÉE.
 */
export async function allowRequest(
  db: Db,
  key: string,
  opts: { windowSeconds: number; max: number },
  now = Date.now(),
): Promise<boolean> {
  const k = `app:${key}`.slice(0, 200);
  const windowMs = opts.windowSeconds * 1000;
  const res = await db.execute(sql`
    INSERT INTO rate_limit (id, key, count, last_request)
    VALUES (${randomUUID()}, ${k}, 1, ${now})
    ON CONFLICT (key) DO UPDATE SET
      count = CASE WHEN ${now} - rate_limit.last_request > ${windowMs} THEN 1 ELSE rate_limit.count + 1 END,
      last_request = CASE WHEN ${now} - rate_limit.last_request > ${windowMs} THEN ${now} ELSE rate_limit.last_request END
    RETURNING count
  `);
  const rows = (res as unknown as { rows: { count: number }[] }).rows;
  return (rows[0]?.count ?? 1) <= opts.max;
}
