import { z } from "zod";

/** Limites partagées entre validation serveur (Zod) et champs du formulaire admin. */
export const LIMITS = {
  title: 120,
  summary: 200,
  description: 10_000,
  alt: 200,
  caption: 300,
  url: 300,
  tag: 30,
  tags: 15,
  gallery: 30,
  slug: 80,
  maxPosition: 9999,
} as const;

const MEDIA_ID_RE = /^[a-f0-9]{32}$/;
export const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

// Texte brut : pas de NUL (rejeté par Postgres), retours à la ligne normalisés.
const noNul = (s: string) => !s.includes("\u0000");
const plain = (max: number) =>
  z.string().max(max).refine(noNul).transform((s) => s.replace(/\r\n?/g, "\n").trim());
const oneLine = (max: number) =>
  z.string().max(max).refine(noNul).refine((s) => !/[\r\n]/.test(s)).transform((s) => s.trim());

/** https uniquement, sans identifiants intégrés (user:pass@). */
const httpsUrl = z
  .string()
  .trim()
  .max(LIMITS.url)
  .refine((s) => {
    try {
      const u = new URL(s);
      return u.protocol === "https:" && !u.username && !u.password && u.hostname.includes(".");
    } catch {
      return false;
    }
  });
const optionalUrl = z.union([httpsUrl, z.literal(""), z.null()]).transform((v) => (v ? v : null));

const isoDate = z
  .string()
  .refine((s) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
    if (!m) return false;
    const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
  });
const optionalDate = z.union([isoDate, z.literal(""), z.null()]).transform((v) => (v ? v : null));

export const slugSchema = z.string().trim().max(LIMITS.slug).regex(SLUG_RE);

const translation = z.object({
  title: oneLine(LIMITS.title),
  summary: oneLine(LIMITS.summary),
  description: plain(LIMITS.description),
  coverAlt: oneLine(LIMITS.alt),
});

const tagName = oneLine(LIMITS.tag).pipe(z.string().min(1));

export const saveProjectSchema = z.object({
  slug: slugSchema,
  position: z.number().int().min(0).max(LIMITS.maxPosition),
  repoUrl: optionalUrl,
  liveUrl: optionalUrl,
  startedAt: optionalDate,
  coverImageId: z.union([z.string().regex(MEDIA_ID_RE), z.null()]),
  translations: z.object({ fr: translation, en: translation }),
  tags: z.array(tagName).max(LIMITS.tags),
  gallery: z
    .array(
      z.object({
        fileId: z.string().regex(MEDIA_ID_RE),
        altFr: oneLine(LIMITS.alt),
        altEn: oneLine(LIMITS.alt),
        captionFr: oneLine(LIMITS.caption),
        captionEn: oneLine(LIMITS.caption),
      }),
    )
    .max(LIMITS.gallery),
});
export type SaveProjectInput = z.infer<typeof saveProjectSchema>;

export const createProjectSchema = z.object({ slug: slugSchema });
export const deleteProjectSchema = z.object({ slug: z.string().max(LIMITS.slug) });
