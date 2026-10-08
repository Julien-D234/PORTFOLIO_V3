import { getDb } from "@/server/db";
import { allowRequest } from "@/server/rate-limit";
import { requireApi } from "@/server/guards";
import { clientIp, isSameOrigin, json } from "@/server/http";
import { setPublished } from "@/server/projects/mutations";

export async function POST(req: Request, ctx: RouteContext<"/api/admin/projects/[id]/publish">) {
  if (!isSameOrigin(req)) return json({ error: "FORBIDDEN" }, 403);
  const g = await requireApi("admin");
  if ("response" in g) return g.response;
  const { id } = await ctx.params;
  const db = getDb();
  if (!(await allowRequest(db, `admin-project:${g.user.id}`, { windowSeconds: 60, max: 60 }))) {
    return json({ error: "RATE_LIMITED" }, 429);
  }
  const r = await setPublished(db, id, true, { actorId: g.user.id, ip: clientIp(req) });
  if (!r.ok) return json({ error: r.error }, r.error === "NOT_FOUND" ? 404 : 422);
  return json({ ok: true });
}
