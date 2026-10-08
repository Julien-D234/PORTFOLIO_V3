import { asc, count, desc, eq, inArray, sql } from "drizzle-orm";
import {
  project, projectImage, projectTag, projectTranslation, tag,
} from "../db/schema";
import type { Db } from "../db/types";
import { defaultLocale } from "@/i18n/config";

/**
 * Lectures réservées à l'administration (brouillons inclus). À n'appeler QUE
 * derrière requireAdmin / requireApi("admin") : aucune vérification de droits ici.
 */

export interface AdminProjectRow {
  id: string;
  slug: string;
  status: "draft" | "published";
  position: number;
  title: string; // fr (repli : en)
  tags: string[];
  startedAt: string | null;
  updatedAt: Date;
}

export interface AdminProjectTranslation {
  title: string;
  summary: string;
  description: string;
  coverAlt: string;
}

export interface AdminProjectDetail {
  id: string;
  slug: string;
  status: "draft" | "published";
  position: number;
  repoUrl: string | null;
  liveUrl: string | null;
  startedAt: string | null;
  coverImageId: string | null;
  publishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  translations: Record<string, AdminProjectTranslation>;
  tags: { id: string; name: string }[];
  gallery: {
    id: string;
    fileId: string;
    position: number;
    altFr: string;
    altEn: string;
    captionFr: string;
    captionEn: string;
  }[];
}

const asStatus = (s: string): "draft" | "published" => (s === "published" ? "published" : "draft");

export async function listAdminProjects(db: Db): Promise<AdminProjectRow[]> {
  const rows = await db
    .select({
      id: project.id,
      slug: project.slug,
      status: project.status,
      position: project.position,
      startedAt: project.startedAt,
      updatedAt: project.updatedAt,
    })
    .from(project)
    .orderBy(asc(project.position), desc(project.createdAt), asc(project.id));
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const trs = await db
    .select({ projectId: projectTranslation.projectId, lang: projectTranslation.lang, title: projectTranslation.title })
    .from(projectTranslation)
    .where(inArray(projectTranslation.projectId, ids));
  const tagRows = await db
    .select({ projectId: projectTag.projectId, name: tag.name })
    .from(projectTag)
    .innerJoin(tag, eq(tag.id, projectTag.tagId))
    .where(inArray(projectTag.projectId, ids))
    .orderBy(asc(tag.name), asc(tag.id));
  return rows.map((r) => {
    const mine = trs.filter((t) => t.projectId === r.id);
    const fr = mine.find((t) => t.lang === defaultLocale)?.title.trim();
    const any = mine.find((t) => t.title.trim())?.title;
    return {
      ...r,
      status: asStatus(r.status),
      title: fr || any || "",
      tags: tagRows.filter((t) => t.projectId === r.id).map((t) => t.name),
    };
  });
}

export async function getAdminProject(db: Db, id: string): Promise<AdminProjectDetail | null> {
  const [p] = await db.select().from(project).where(eq(project.id, id)).limit(1);
  if (!p) return null;
  const [trs, tags, gallery] = await Promise.all([
    db.select().from(projectTranslation).where(eq(projectTranslation.projectId, id)),
    db
      .select({ id: tag.id, name: tag.name })
      .from(projectTag)
      .innerJoin(tag, eq(tag.id, projectTag.tagId))
      .where(eq(projectTag.projectId, id))
      .orderBy(asc(tag.name), asc(tag.id)),
    db
      .select({
        id: projectImage.id,
        fileId: projectImage.fileId,
        position: projectImage.position,
        altFr: projectImage.altFr,
        altEn: projectImage.altEn,
        captionFr: projectImage.captionFr,
        captionEn: projectImage.captionEn,
      })
      .from(projectImage)
      .where(eq(projectImage.projectId, id))
      .orderBy(asc(projectImage.position), asc(projectImage.id)),
  ]);
  return {
    ...p,
    status: asStatus(p.status),
    translations: Object.fromEntries(
      trs.map((t) => [t.lang, { title: t.title, summary: t.summary, description: t.description, coverAlt: t.coverAlt }]),
    ),
    tags,
    gallery,
  };
}

/** Tags existants avec leur nombre d'usages (suggestions dans l'éditeur). */
export async function listTags(db: Db): Promise<{ id: string; name: string; uses: number }[]> {
  return db
    .select({ id: tag.id, name: tag.name, uses: sql<number>`count(${projectTag.projectId})::int` })
    .from(tag)
    .leftJoin(projectTag, eq(projectTag.tagId, tag.id))
    .groupBy(tag.id, tag.name)
    .orderBy(asc(tag.name));
}

export async function countProjects(db: Db): Promise<number> {
  const [{ n }] = await db.select({ n: count() }).from(project);
  return n;
}
