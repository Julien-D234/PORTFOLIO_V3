import { z } from "zod";
import { getAuth } from "@/server/auth";
import { getDb } from "@/server/db";
import { acceptInvitation } from "@/server/admin/invitations";
import { allowRequest } from "@/server/rate-limit";
import { clientIp, isSameOrigin, json, readJson } from "@/server/http";

const body = z.object({ token: z.string().max(200), password: z.string().max(1024) });

export async function POST(req: Request) {
  if (!isSameOrigin(req)) return json({ error: "FORBIDDEN" }, 403);
  const ip = clientIp(req);
  const db = getDb();
  if (!(await allowRequest(db, `welcome:${ip ?? "unknown"}`, { windowSeconds: 60, max: 10 }))) {
    return json({ error: "RATE_LIMITED" }, 429);
  }
  const parsed = body.safeParse(await readJson(req));
  if (!parsed.success) return json({ error: "INVALID_LINK" }, 400);

  const auth = getAuth();
  const res = await acceptInvitation(db, auth, { ...parsed.data, ip });
  if (!res.ok) return json({ error: res.reason }, 400);

  // Connexion immédiate avec le mot de passe qui vient d'être choisi (hooks de verrouillage inclus).
  const signIn = await auth.api
    .signInEmail({ body: { email: res.email, password: parsed.data.password }, headers: req.headers, asResponse: true })
    .catch(() => null);
  const headers = new Headers({ "Cache-Control": "no-store", "content-type": "application/json" });
  for (const c of signIn?.headers.getSetCookie() ?? []) headers.append("set-cookie", c);
  return new Response(JSON.stringify({ ok: true, signedIn: !!signIn?.ok }), { status: 200, headers });
}
