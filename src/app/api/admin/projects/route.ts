import { getDb } from "@/server/db";
import { allowRequest } from "@/server/rate-limit";
import { requireApi } from "@/server/guards";
import { clientIp, isSameOrigin, json, readJson } from "@/server/http";
import { createProject } from "@/server/projects/mutations";
import { createProjectSchema } from "@/lib/project-schema";

/** Crée un brouillon vide à partir d'un slug. */
export async function POST(req: Request) {
  if (!isSameOrigin(req)) return json({ error: "FORBIDDEN" }, 403);
  const g = await requireApi("admin");
  if ("response" in g) return g.response;
  const db = getDb();
  if (!(await allowRequest(db, `admin-project:${g.user.id}`, { windowSeconds: 60, max: 60 }))) {
    return json({ error: "RATE_LIMITED" }, 429);
  }
  const parsed = createProjectSchema.safeParse(await readJson(req, 1024));
  if (!parsed.success) return json({ error: "VALIDATION" }, 400);
  const r = await createProject(db, parsed.data.slug, { actorId: g.user.id, ip: clientIp(req) });
  if (!r.ok) return json({ error: r.error }, 409);
  return json({ id: r.id }, 201);
}
