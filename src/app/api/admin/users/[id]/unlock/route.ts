import { getDb } from "@/server/db";
import { unlockUser } from "@/server/admin/actions";
import { allowRequest } from "@/server/rate-limit";
import { requireApi } from "@/server/guards";
import { clientIp, isSameOrigin, json } from "@/server/http";

/** Lève le verrouillage temporaire d'un compte (échecs de connexion répétés). */
export async function POST(req: Request, ctx: RouteContext<"/api/admin/users/[id]/unlock">) {
  if (!isSameOrigin(req)) return json({ error: "FORBIDDEN" }, 403);
  const g = await requireApi("admin");
  if ("response" in g) return g.response;
  const { id } = await ctx.params;
  const db = getDb();
  if (!(await allowRequest(db, `admin-unlock:${g.user.id}`, { windowSeconds: 60, max: 30 }))) {
    return json({ error: "RATE_LIMITED" }, 429);
  }
  if (!(await unlockUser(db, id, { actorId: g.user.id, ip: clientIp(req) }))) return json({ error: "NOT_FOUND" }, 404);
  return json({ ok: true });
}
