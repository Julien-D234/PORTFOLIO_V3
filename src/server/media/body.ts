/**
 * Lit le corps d'une requête avec un plafond d'octets, sans jamais bufferiser
 * plus que la limite (le Content-Length annoncé n'est pas digne de confiance :
 * on compte les octets réellement reçus).
 */
export async function readBodyCapped(req: Request, maxBytes: number): Promise<Buffer | "TOO_LARGE" | null> {
  const declared = Number(req.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) return "TOO_LARGE";
  if (!req.body) return null;
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => {});
      return "TOO_LARGE";
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}
