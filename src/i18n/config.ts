// Ajouter une langue : l'ajouter ici + créer messages/<code>.json + l'ajouter dans dictionaries.ts
export const locales = ["fr", "en"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "fr";
export const LOCALE_COOKIE = "NEXT_LOCALE";

export function isLocale(value: string | undefined | null): value is Locale {
  return !!value && (locales as readonly string[]).includes(value);
}

/** Choisit la langue : cookie valide > en-tête Accept-Language (avec q) > défaut. */
export function negotiateLocale(
  cookieValue: string | undefined | null,
  acceptLanguage: string | undefined | null,
): Locale {
  if (isLocale(cookieValue)) return cookieValue;
  if (acceptLanguage) {
    const ranked = acceptLanguage
      .split(",")
      .map((part) => {
        const [tag, ...params] = part.trim().split(";");
        const q = params.map((p) => p.trim()).find((p) => p.startsWith("q="));
        const weight = q ? Number.parseFloat(q.slice(2)) : 1;
        return { tag: tag.toLowerCase(), weight: Number.isNaN(weight) ? 0 : weight };
      })
      .filter((x) => x.tag && x.weight > 0)
      .sort((a, b) => b.weight - a.weight);
    for (const { tag } of ranked) {
      const base = tag.split("-")[0];
      if (isLocale(base)) return base;
    }
  }
  return defaultLocale;
}
