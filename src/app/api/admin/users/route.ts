import { z } from "zod";
import { isLocale } from "@/i18n/config";
import { getAuth } from "@/server/auth";
import { getDb } from "@/server/db";
import { createInvitedUser } from "@/server/admin/invitations";
import { allowRequest } from "@/server/rate-limit";
import { requireApi } from "@/server/guards";
import { clientIp, invitationLink, isSameOrigin, json, readJson } from "@/server/http";

const body = z.object({
  email: z.string().trim().min(1).max(254).pipe(z.email()),
  name: z.string().trim().min(1).max(100),
  role: z.enum(["user", "admin"]),
  lang: z.string().refine(isLocale),
});

export async function POST(req: Request) {
  if (!isSameOrigin(req)) return json({ error: "FORBIDDEN" }, 403);
  const g = await requireApi("admin");
  if ("response" in g) return g.response;
  const db = getDb();
  if (!(await allowRequest(db, `admin-create:${g.user.id}`, { windowSeconds: 60, max: 20 }))) {
    return json({ error: "RATE_LIMITED" }, 429);
  }
  const parsed = body.safeParse(await readJson(req));
  if (!parsed.success) return json({ error: "VALIDATION" }, 400);
  const { email, name, role, lang } = parsed.data;

  const r = await createInvitedUser(db, getAuth(), { email, name, role, locale: lang }, { actorId: g.user.id, ip: clientIp(req) });
  if (!r.ok) return json({ error: r.reason }, 409);
  return json({ id: r.userId, link: invitationLink(lang, r.token), expiresAt: r.expiresAt.toISOString() }, 201);
}
