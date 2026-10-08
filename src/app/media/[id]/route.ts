import { getDb } from "@/server/db";
import { requireApi } from "@/server/guards";
import { getMediaStore } from "@/server/media";
import { isMediaId } from "@/server/media/store";
import { isMediaPublic } from "@/server/projects/public";

/**
 * Sert une image : uniquement si l'id est valide ET (l'image appartient à un
 * projet publié OU l'appelant est admin, pour prévisualiser ses brouillons).
 * Tout le reste → 404 (on ne distingue pas « brouillon » de « inexistant »).
 */
const notFound = () => new Response(null, { status: 404, headers: { "Cache-Control": "no-store" } });

export async function GET(req: Request, ctx: RouteContext<"/media/[id]">) {
  const { id } = await ctx.params;
  if (!isMediaId(id)) return notFound();
  const variant = new URL(req.url).searchParams.get("v") === "thumb" ? "thumb" : "full";

  let cache = "public, max-age=31536000, immutable";
  if (!(await isMediaPublic(getDb(), id))) {
    const g = await requireApi("admin");
    if ("response" in g) return notFound();
    cache = "private, no-store";
  }
  const data = await getMediaStore().read(id, variant);
  if (!data) return notFound();
  return new Response(new Uint8Array(data), {
    headers: {
      "Content-Type": "image/webp",
      "Content-Length": String(data.length),
      "Cache-Control": cache,
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "Content-Disposition": "inline",
    },
  });
}
