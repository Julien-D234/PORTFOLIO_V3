import { eq } from "drizzle-orm";
import { writeAudit } from "../auth/audit";
import { user } from "../db/schema";
import type { Db } from "../db/types";

/** Lève le verrouillage temporaire (échecs de connexion) d'un compte. false si le compte n'existe pas. */
export async function unlockUser(db: Db, targetId: string, ctx: { actorId: string; ip?: string | null }): Promise<boolean> {
  const rows = await db
    .update(user)
    .set({ failedLoginCount: 0, lockedUntil: null })
    .where(eq(user.id, targetId))
    .returning({ id: user.id });
  if (rows.length === 0) return false;
  await writeAudit(db, { actorId: ctx.actorId, action: "user.unlocked", targetId, ip: ctx.ip });
  return true;
}
