import "server-only";
import { env } from "./env";

/** IP client : lue dans X-Forwarded-For (sûr uniquement derrière Caddy, cf. HANDOFF). */
export function clientIp(req: Request): string | null {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
}

/**
 * Défense CSRF des Route Handlers à cookie : l'en-tête Origin d'une requête POST
 * doit être exactement l'origine du site. (SameSite=Lax est la seconde barrière.)
 */
export function isSameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  return !!origin && origin === new URL(env().BETTER_AUTH_URL).origin;
}

export const noStore = { "Cache-Control": "no-store" } as const;

export const json = (body: unknown, status = 200, extra: HeadersInit = {}) =>
  Response.json(body, { status, headers: { ...noStore, ...extra } });

/** Lit un corps JSON de taille bornée ; null si invalide ou trop gros. */
export async function readJson(req: Request, maxBytes = 4096): Promise<unknown | null> {
  const text = await req.text().catch(() => null);
  if (text === null || text.length > maxBytes) return null;
  try { return JSON.parse(text); } catch { return null; }
}

/** URL absolue du lien d'invitation. Le jeton est dans le fragment (#) : jamais envoyé au serveur ni dans Referer. */
export function invitationLink(lang: string, token: string): string {
  return `${new URL(env().BETTER_AUTH_URL).origin}/${lang}/welcome#token=${token}`;
}
