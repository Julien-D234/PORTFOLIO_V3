/** Remplace {clé} dans un message i18n. */
export function fmt(msg: string, vars: Record<string, string | number>): string {
  return msg.replace(/\{(\w+)\}/g, (_, k: string) => (k in vars ? String(vars[k]) : `{${k}}`));
}

export function fmtDate(d: Date | null | undefined, lang: string): string {
  if (!d) return "—";
  return new Intl.DateTimeFormat(lang, { dateStyle: "short", timeStyle: "short", timeZone: "UTC" }).format(d) + " UTC";
}

/** Première valeur d'un paramètre d'URL (peut être un tableau ou absent). */
export function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

/** Date « AAAA-MM-JJ » (colonne date, sans fuseau) → « octobre 2026 ». */
export function fmtMonth(isoDate: string | null | undefined, lang: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate ?? "");
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  // Date.UTC « déborde » (mois 13 → janvier suivant) : on exige l'aller-retour exact.
  if (d.toISOString().slice(0, 10) !== isoDate) return null;
  return new Intl.DateTimeFormat(lang, { year: "numeric", month: "long", timeZone: "UTC" }).format(d);
}

/** Lien externe affichable : https uniquement (défense en profondeur, déjà validé à l'écriture). */
export function safeHttpsUrl(u: string | null | undefined): string | null {
  if (!u) return null;
  try {
    const url = new URL(u);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}
