import { getDb } from "@/server/db";
import { allowRequest } from "@/server/rate-limit";
import { requireApi } from "@/server/guards";
import { clientIp, isSameOrigin, json, readJson } from "@/server/http";
import { getMediaStore } from "@/server/media";
import { saveProject } from "@/server/projects/mutations";
import { saveProjectSchema } from "@/lib/project-schema";

const STATUS = { NOT_FOUND: 404, SLUG_TAKEN: 409, MEDIA_MISSING: 422, NOT_PUBLISHABLE: 422, SLUG_MISMATCH: 422 } as const;

/** Enregistre le projet en entier (contenu fr/en, liens, tags, couverture, galerie). */
export async function POST(req: Request, ctx: RouteContext<"/api/admin/projects/[id]">) {
  if (!isSameOrigin(req)) return json({ error: "FORBIDDEN" }, 403);
  const g = await requireApi("admin");
  if ("response" in g) return g.response;
  const { id } = await ctx.params;
  const db = getDb();
  if (!(await allowRequest(db, `admin-project:${g.user.id}`, { windowSeconds: 60, max: 60 }))) {
    return json({ error: "RATE_LIMITED" }, 429);
  }
  const parsed = saveProjectSchema.safeParse(await readJson(req, 64 * 1024));
  if (!parsed.success) return json({ error: "VALIDATION" }, 400);
  const r = await saveProject(db, getMediaStore(), id, parsed.data, { actorId: g.user.id, ip: clientIp(req) });
  if (!r.ok) return json({ error: r.error }, STATUS[r.error]);
  return json({ ok: true });
}
