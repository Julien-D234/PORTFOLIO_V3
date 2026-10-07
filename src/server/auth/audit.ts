import { randomUUID } from "node:crypto";
import { auditLog } from "../db/schema";
import type { Db } from "../db/types";

export async function writeAudit(
  db: Db,
  entry: {
    actorId?: string | null;
    action: string;
    targetId?: string | null;
    metadata?: Record<string, unknown>;
    ip?: string | null;
  },
) {
  await db.insert(auditLog).values({
    id: randomUUID(),
    actorId: entry.actorId ?? null,
    action: entry.action,
    targetId: entry.targetId ?? null,
    metadata: entry.metadata ? JSON.stringify(entry.metadata) : null,
    ip: entry.ip ?? null,
  });
}
