import { z } from "zod";
import { defaultLocale, isLocale, type Locale } from "@/i18n/config";

export const PASSWORD_MIN = 12;
export const PASSWORD_MAX = 128;

export const loginSchema = z.object({
  email: z.string().trim().min(1).max(254).pipe(z.email()),
  password: z.string().min(1).max(PASSWORD_MAX),
});

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1).max(PASSWORD_MAX),
    newPassword: z.string().min(PASSWORD_MIN).max(PASSWORD_MAX),
    confirmPassword: z.string(),
  })
  .refine((v) => v.newPassword === v.confirmPassword, { path: ["confirmPassword"], message: "MISMATCH" })
  .refine((v) => v.newPassword !== v.currentPassword, { path: ["newPassword"], message: "SAME_PASSWORD" });

/** Pages vers lesquelles on accepte de rediriger après connexion (liste blanche, sans le préfixe de langue). */
const ALLOWED_PREFIXES = ["", "/change-password", "/profile", "/admin", "/projects", "/games"];

/**
 * Redirection post-connexion sûre : uniquement un chemin interne, dans la langue donnée,
 * dont le premier segment est en liste blanche. Sinon : accueil de la langue.
 */
export function safeRedirect(next: unknown, locale: string | undefined): string {
  const lang: Locale = isLocale(locale) ? locale : defaultLocale;
  const fallback = `/${lang}`;
  if (typeof next !== "string" || next.length === 0 || next.length > 512) return fallback;
  // Caractères de contrôle, antislash, « // » ou « /\ » : vecteurs classiques d'open redirect.
  if (!next.startsWith("/") || next.startsWith("//") || /[\\\u0000-\u001f\u007f]/.test(next)) return fallback;
  let url: URL;
  try {
    url = new URL(next, "http://internal.invalid");
  } catch {
    return fallback;
  }
  if (url.origin !== "http://internal.invalid") return fallback;
  const [, first, ...rest] = url.pathname.split("/");
  if (first !== lang) return fallback;
  const section = rest.length ? `/${rest[0]}` : "";
  if (!ALLOWED_PREFIXES.includes(section)) return fallback;
  return url.pathname + url.search;
}

export type LoginErrorKey = "invalid" | "rateLimited" | "unavailable" | "network" | "validation";

/** Traduit une réponse de /api/auth/sign-in/email en clé d'erreur générique. */
export function loginErrorKey(status: number): LoginErrorKey {
  if (status === 429) return "rateLimited";
  if (status === 403) return "unavailable"; // banni : message neutre, sans motif
  if (status >= 500) return "network";
  return "invalid"; // 401 et tout le reste : identique compte inconnu / mauvais mot de passe / verrouillé
}
