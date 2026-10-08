import { getDb } from "@/server/db";
import { allowRequest } from "@/server/rate-limit";
import { requireApi } from "@/server/guards";
import { clientIp, isSameOrigin, json, readJson } from "@/server/http";
import { getMediaStore } from "@/server/media";
import { deleteProject } from "@/server/projects/mutations";
import { deleteProjectSchema } from "@/lib/project-schema";

/** Suppression définitive : le corps doit contenir le slug exact (confirmation). */
export async function POST(req: Request, ctx: RouteContext<"/api/admin/projects/[id]/delete">) {
  if (!isSameOrigin(req)) return json({ error: "FORBIDDEN" }, 403);
  const g = await requireApi("admin");
  if ("response" in g) return g.response;
  const { id } = await ctx.params;
  const db = getDb();
  if (!(await allowRequest(db, `admin-project:${g.user.id}`, { windowSeconds: 60, max: 60 }))) {
    return json({ error: "RATE_LIMITED" }, 429);
  }
  const parsed = deleteProjectSchema.safeParse(await readJson(req, 1024));
  if (!parsed.success) return json({ error: "VALIDATION" }, 400);
  const r = await deleteProject(db, getMediaStore(), id, parsed.data.slug, { actorId: g.user.id, ip: clientIp(req) });
  if (!r.ok) return json({ error: r.error }, r.error === "NOT_FOUND" ? 404 : 422);
  return json({ ok: true });
}
