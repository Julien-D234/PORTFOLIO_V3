import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { defaultLocale, isLocale, type Locale } from "@/i18n/config";
import { getAuth } from "./auth";
import { authorize, type AuthUser, type Role } from "./auth/authz";

/**
 * Gardes d'accès CÔTÉ SERVEUR. C'est la vraie barrière : à appeler au début de
 * chaque page, Server Action et Route Handler protégés (proxy.ts ne suffit pas).
 */

/** Session courante relue en base à chaque requête (pas de cache cookie). */
export const getSessionUser = cache(async (): Promise<AuthUser | null> => {
  const session = await getAuth().api.getSession({ headers: await headers() });
  return (session?.user as AuthUser | undefined) ?? null;
});

interface GuardOptions {
  locale?: string;
  /** Autorise l'accès à la page « changer mon mot de passe » malgré l'obligation. */
  allowMustChangePassword?: boolean;
}
const loc = (l?: string): Locale => (isLocale(l) ? l : defaultLocale);

async function guard(role: Role | undefined, o: GuardOptions): Promise<AuthUser> {
  const r = authorize(await getSessionUser(), { role, allowMustChangePassword: o.allowMustChangePassword });
  if (r.ok) return r.user;
  switch (r.reason) {
    case "unauthenticated":
    case "banned":
      redirect(`/${loc(o.locale)}/login`);
    case "must-change-password":
      redirect(`/${loc(o.locale)}/change-password`);
    case "forbidden":
      // 404 plutôt que 403 : ne révèle pas l'existence des pages d'administration.
      notFound();
  }
}

export const requireUser = (o: GuardOptions = {}) => guard(undefined, o);
export const requireAdmin = (o: GuardOptions = {}) => guard("admin", o);

/** Variante pour Route Handlers : renvoie une Response au lieu de rediriger. */
export async function requireApi(role?: Role): Promise<{ user: AuthUser } | { response: Response }> {
  const r = authorize(await getSessionUser(), { role });
  if (r.ok) return { user: r.user };
  const status = r.reason === "unauthenticated" ? 401 : 403;
  return { response: Response.json({ error: r.reason.toUpperCase().replaceAll("-", "_") }, { status }) };
}
