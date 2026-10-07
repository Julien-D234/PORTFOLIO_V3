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
