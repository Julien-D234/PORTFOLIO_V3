import { and, asc, eq, exists, inArray, or } from "drizzle-orm";
import {
  mediaFile, project, projectImage, projectTag, projectTranslation, tag,
} from "../db/schema";
import type { Db } from "../db/types";
import { defaultLocale, isLocale, type Locale } from "@/i18n/config";

/**
 * Lectures PUBLIQUES des projets. Règle absolue : seuls les projets au statut
 * `published` sont visibles ; un brouillon ne sort jamais d'ici (même si on
 * connaît son slug ou l'id d'une de ses images). Aucune colonne interne
 * (createdBy, etc.) n'est exposée.
 */

export interface PublicProjectCard {
  slug: string;
  title: string;
  summary: string;
  startedAt: string | null;
  coverImageId: string | null;
  coverAlt: string;
  tags: string[];
}

export interface PublicGalleryImage {
  fileId: string;
  alt: string;
  caption: string;
}

export interface PublicProjectDetail extends Omit<PublicProjectCard, "coverImageId" | "coverAlt"> {
  description: string;
  repoUrl: string | null;
  liveUrl: string | null;
  gallery: PublicGalleryImage[];
}

const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
export const isValidSlug = (s: unknown): s is string =>
  typeof s === "string" && s.length > 0 && s.length <= 80 && SLUG_RE.test(s);

/** Valeur de la langue demandée, sinon repli sur le français si vide. */
export const withFallback = (value: string | undefined, fr: string | undefined): string =>
  value && value.trim() ? value : (fr ?? "");

type Tr = { title: string; summary: string; description: string; coverAlt: string };
const EMPTY: Tr = { title: "", summary: "", description: "", coverAlt: "" };

function resolveTr(by: Map<string, Tr>, lang: Locale): Tr {
  const fr = by.get(defaultLocale) ?? EMPTY;
  const cur = by.get(lang) ?? EMPTY;
  return {
    title: withFallback(cur.title, fr.title),
    summary: withFallback(cur.summary, fr.summary),
    description: withFallback(cur.description, fr.description),
    coverAlt: withFallback(cur.coverAlt, fr.coverAlt),
  };
}

async function loadTranslations(db: Db, ids: string[]) {
  const out = new Map<string, Map<string, Tr>>();
  if (!ids.length) return out;
  const rows = await db.select().from(projectTranslation).where(inArray(projectTranslation.projectId, ids));
  for (const r of rows) {
    const m = out.get(r.projectId) ?? new Map<string, Tr>();
    m.set(r.lang, r);
    out.set(r.projectId, m);
  }
  return out;
}

async function loadTags(db: Db, ids: string[]) {
  const out = new Map<string, string[]>();
  if (!ids.length) return out;
  const rows = await db
    .select({ projectId: projectTag.projectId, name: tag.name })
    .from(projectTag)
    .innerJoin(tag, eq(tag.id, projectTag.tagId))
    .where(inArray(projectTag.projectId, ids))
    .orderBy(asc(tag.name), asc(tag.id));
  for (const r of rows) out.set(r.projectId, [...(out.get(r.projectId) ?? []), r.name]);
  return out;
}

const coerceLang = (l: string): Locale => (isLocale(l) ? l : defaultLocale);

export async function listPublishedProjects(db: Db, lang: string): Promise<PublicProjectCard[]> {
  const L = coerceLang(lang);
  const rows = await db
    .select({
      id: project.id,
      slug: project.slug,
      startedAt: project.startedAt,
      coverImageId: project.coverImageId,
    })
    .from(project)
    .where(eq(project.status, "published"))
    .orderBy(asc(project.position), asc(project.createdAt), asc(project.id));
  const ids = rows.map((r) => r.id);
  const [trs, tags] = await Promise.all([loadTranslations(db, ids), loadTags(db, ids)]);
  const cards: PublicProjectCard[] = [];
  for (const r of rows) {
    const t = resolveTr(trs.get(r.id) ?? new Map(), L);
    if (!t.title.trim()) continue; // défense : un publié sans titre n'est pas affiché
    cards.push({
      slug: r.slug,
      title: t.title,
      summary: t.summary,
      startedAt: r.startedAt,
      coverImageId: r.coverImageId,
      coverAlt: t.coverAlt || t.title,
      tags: tags.get(r.id) ?? [],
    });
  }
  return cards;
}

export async function getPublishedProject(
  db: Db,
  slug: string,
  lang: string,
): Promise<PublicProjectDetail | null> {
  if (!isValidSlug(slug)) return null;
  const L = coerceLang(lang);
  const [p] = await db
    .select({
      id: project.id,
      slug: project.slug,
      startedAt: project.startedAt,
      repoUrl: project.repoUrl,
      liveUrl: project.liveUrl,
    })
    .from(project)
    .where(and(eq(project.slug, slug), eq(project.status, "published")))
    .limit(1);
  if (!p) return null;
  const [trs, tags, imgs] = await Promise.all([
    loadTranslations(db, [p.id]),
    loadTags(db, [p.id]),
    db
      .select()
      .from(projectImage)
      .where(eq(projectImage.projectId, p.id))
      .orderBy(asc(projectImage.position), asc(projectImage.id)),
  ]);
  const t = resolveTr(trs.get(p.id) ?? new Map(), L);
  if (!t.title.trim()) return null;
  return {
    slug: p.slug,
    title: t.title,
    summary: t.summary,
    description: t.description,
    startedAt: p.startedAt,
    repoUrl: p.repoUrl,
    liveUrl: p.liveUrl,
    tags: tags.get(p.id) ?? [],
    gallery: imgs.map((i) => ({
      fileId: i.fileId,
      alt: L === "en" ? withFallback(i.altEn, i.altFr) : i.altFr,
      caption: L === "en" ? withFallback(i.captionEn, i.captionFr) : i.captionFr,
    })),
  };
}

/**
 * Une image peut-elle être servie au public ? Uniquement si elle sert de
 * couverture ou de galerie à un projet PUBLIÉ. (L'admin prévisualise ses
 * brouillons par un chemin distinct, protégé par requireApi.)
 */
export async function isMediaPublic(db: Db, fileId: string): Promise<boolean> {
  const published = eq(project.status, "published");
  const [row] = await db
    .select({ id: mediaFile.id })
    .from(mediaFile)
    .where(
      and(
        eq(mediaFile.id, fileId),
        or(
          exists(
            db.select({ x: project.id }).from(project).where(and(published, eq(project.coverImageId, mediaFile.id))),
          ),
          exists(
            db
              .select({ x: projectImage.id })
              .from(projectImage)
              .innerJoin(project, eq(project.id, projectImage.projectId))
              .where(and(published, eq(projectImage.fileId, mediaFile.id))),
          ),
        ),
      ),
    )
    .limit(1);
  return !!row;
}
