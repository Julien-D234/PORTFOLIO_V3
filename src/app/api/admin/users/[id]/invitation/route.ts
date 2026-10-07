import { eq } from "drizzle-orm";
import { z } from "zod";
import { isLocale } from "@/i18n/config";
import { getDb } from "@/server/db";
import { user } from "@/server/db/schema";
import { issueInvitation } from "@/server/admin/invitations";
import { allowRequest } from "@/server/rate-limit";
import { requireApi } from "@/server/guards";
import { clientIp, invitationLink, isSameOrigin, json, readJson } from "@/server/http";

const body = z.object({ lang: z.string().refine(isLocale) });

/** Regénère un lien (première connexion ou réinitialisation) : invalide l'ancien. */
export async function POST(req: Request, ctx: RouteContext<"/api/admin/users/[id]/invitation">) {
  if (!isSameOrigin(req)) return json({ error: "FORBIDDEN" }, 403);
  const g = await requireApi("admin");
  if ("response" in g) return g.response;
  const { id } = await ctx.params;
  const db = getDb();
  if (!(await allowRequest(db, `admin-invite:${g.user.id}`, { windowSeconds: 60, max: 20 }))) {
    return json({ error: "RATE_LIMITED" }, 429);
  }
  const parsed = body.safeParse(await readJson(req));
  if (!parsed.success) return json({ error: "VALIDATION" }, 400);
  const [target] = await db.select({ id: user.id }).from(user).where(eq(user.id, id)).limit(1);
  if (!target) return json({ error: "NOT_FOUND" }, 404);

  const inv = await issueInvitation(db, target.id, { actorId: g.user.id, ip: clientIp(req), regenerate: true });
  return json({ link: invitationLink(parsed.data.lang, inv.token), expiresAt: inv.expiresAt.toISOString() });
}
