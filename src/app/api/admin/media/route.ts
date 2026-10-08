import { getDb } from "@/server/db";
import { allowRequest } from "@/server/rate-limit";
import { requireApi } from "@/server/guards";
import { clientIp, isSameOrigin, json } from "@/server/http";
import { MAX_UPLOAD_BYTES } from "@/server/media/image";
import { readBodyCapped } from "@/server/media/body";
import { getMediaStore } from "@/server/media";
import { uploadImage } from "@/server/media/service";

/**
 * Upload d'une image : corps BRUT du fichier (pas de multipart), POST depuis
 * l'admin. Chaîne : Origin → admin → rate-limit → plafond d'octets → contrôle
 * par octets magiques + ré-encodage (voir src/server/media/image.ts).
 */
export async function POST(req: Request) {
  if (!isSameOrigin(req)) return json({ error: "FORBIDDEN" }, 403);
  const g = await requireApi("admin");
  if ("response" in g) return g.response;
  const db = getDb();
  if (!(await allowRequest(db, `media-upload:${g.user.id}`, { windowSeconds: 60, max: 30 }))) {
    return json({ error: "RATE_LIMITED" }, 429);
  }
  const body = await readBodyCapped(req, MAX_UPLOAD_BYTES);
  if (body === "TOO_LARGE") return json({ error: "TOO_LARGE" }, 413);
  if (!body) return json({ error: "EMPTY" }, 400);

  const r = await uploadImage(db, getMediaStore(), body, { actorId: g.user.id, ip: clientIp(req) });
  if (!r.ok) return json({ error: r.reason }, r.reason === "TOO_LARGE" ? 413 : 422);
  return json(r.media, 201);
}
