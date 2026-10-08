import { randomUUID } from "node:crypto";
import { and, eq, inArray, notExists, sql } from "drizzle-orm";
import { writeAudit } from "../auth/audit";
import {
  mediaFile, project, projectImage, projectTag, projectTranslation, tag,
} from "../db/schema";
import type { Db } from "../db/types";
import { deleteMedia } from "../media/service";
import type { MediaStore } from "../media/store";
import type { SaveProjectInput } from "@/lib/project-schema";

/**
 * Écritures sur les projets. À n'appeler QU'après requireApi("admin") +
 * isSameOrigin + validation Zod (saveProjectSchema). Les actions refusées ne
 * sont pas auditées ; les métadonnées d'audit ne contiennent jamais de contenu.
 */

type Ctx = { actorId: string; ip?: string | null };
export type MutationError =
  | "NOT_FOUND" | "SLUG_TAKEN" | "MEDIA_MISSING" | "NOT_PUBLISHABLE" | "SLUG_MISMATCH";

const PG_UNIQUE = "23505";
const isUniqueViolation = (e: unknown): boolean => {
  // drizzle enveloppe parfois l'erreur driver dans `cause`
  for (let x: unknown = e, i = 0; x && i < 4; i++, x = (x as { cause?: unknown }).cause) {
    if ((x as { code?: string }).code === PG_UNIQUE) return true;
  }
  return false;
};

export async function createProject(
  db: Db, slug: string, ctx: Ctx,
): Promise<{ ok: true; id: string } | { ok: false; error: "SLUG_TAKEN" }> {
  const id = randomUUID();
  try {
    await db.insert(project).values({
      id,
      slug,
      status: "draft",
      position: sql`(select coalesce(max(position), 0) + 1 from project)` as unknown as number,
    });
  } catch (e) {
    if (isUniqueViolation(e)) return { ok: false, error: "SLUG_TAKEN" };
    throw e;
  }
  await db.insert(projectTranslation).values([{ projectId: id, lang: "fr" }, { projectId: id, lang: "en" }]);
  await writeAudit(db, { actorId: ctx.actorId, action: "project.created", targetId: id, metadata: { slug }, ip: ctx.ip });
  return { ok: true, id };
}

/** Un projet publié exige un titre et un résumé en français. */
export const isPublishable = (fr: { title: string; summary: string }) =>
  fr.title.trim().length > 0 && fr.summary.trim().length > 0;

export async function saveProject(
  db: Db, store: MediaStore, id: string, input: SaveProjectInput, ctx: Ctx,
): Promise<{ ok: true } | { ok: false; error: MutationError }> {
  const [current] = await db.select({ status: project.status, slug: project.slug }).from(project).where(eq(project.id, id)).limit(1);
  if (!current) return { ok: false, error: "NOT_FOUND" };
  if (current.status === "published" && !isPublishable(input.translations.fr)) {
    return { ok: false, error: "NOT_PUBLISHABLE" };
  }

  const wanted = [...new Set([...(input.coverImageId ? [input.coverImageId] : []), ...input.gallery.map((g) => g.fileId)])];
  if (wanted.length) {
    const found = await db.select({ id: mediaFile.id }).from(mediaFile).where(inArray(mediaFile.id, wanted));
    if (found.length !== wanted.length) return { ok: false, error: "MEDIA_MISSING" };
  }
  const before = await db.select({ fileId: projectImage.fileId }).from(projectImage).where(eq(projectImage.projectId, id));
  const [prev] = await db.select({ cover: project.coverImageId }).from(project).where(eq(project.id, id)).limit(1);

  try {
    await db.transaction(async (tx) => {
      await tx.update(project).set({
        slug: input.slug,
        position: input.position,
        repoUrl: input.repoUrl,
        liveUrl: input.liveUrl,
        startedAt: input.startedAt,
        coverImageId: input.coverImageId,
        updatedAt: new Date(),
      }).where(eq(project.id, id));

      await tx.delete(projectTranslation).where(eq(projectTranslation.projectId, id));
      await tx.insert(projectTranslation).values(
        (["fr", "en"] as const).map((lang) => ({ projectId: id, lang, ...input.translations[lang] })),
      );

      // Tags : réutilisation insensible à la casse, création sinon.
      const seen = new Set<string>();
      const tagIds: string[] = [];
      for (const name of input.tags) {
        const key = name.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        const lookup = () => tx.select({ id: tag.id }).from(tag).where(sql`lower(${tag.name}) = ${key}`).limit(1);
        let [t] = await lookup();
        if (!t) {
          await tx.insert(tag).values({ id: randomUUID(), name }).onConflictDoNothing();
          [t] = await lookup();
        }
        tagIds.push(t.id);
      }
      await tx.delete(projectTag).where(eq(projectTag.projectId, id));
      if (tagIds.length) await tx.insert(projectTag).values(tagIds.map((tagId) => ({ projectId: id, tagId })));
      await tx.delete(tag).where(notExists(tx.select({ x: projectTag.tagId }).from(projectTag).where(eq(projectTag.tagId, tag.id))));

      await tx.delete(projectImage).where(eq(projectImage.projectId, id));
      if (input.gallery.length) {
        await tx.insert(projectImage).values(
          input.gallery.map((g, position) => ({ id: randomUUID(), projectId: id, position, ...g })),
        );
      }
    });
  } catch (e) {
    if (isUniqueViolation(e)) return { ok: false, error: "SLUG_TAKEN" };
    throw e;
  }

  // Médias retirés du projet et plus utilisés nulle part : suppression (ligne + fichiers).
  const dropped = new Set([...before.map((b) => b.fileId), ...(prev?.cover ? [prev.cover] : [])]);
  for (const f of wanted) dropped.delete(f);
  for (const f of dropped) await deleteMedia(db, store, f, ctx);

  await writeAudit(db, { actorId: ctx.actorId, action: "project.updated", targetId: id, metadata: { slug: input.slug }, ip: ctx.ip });
  return { ok: true };
}

export async function setPublished(
  db: Db, id: string, published: boolean, ctx: Ctx,
): Promise<{ ok: true } | { ok: false; error: "NOT_FOUND" | "NOT_PUBLISHABLE" }> {
  const [p] = await db.select({ slug: project.slug }).from(project).where(eq(project.id, id)).limit(1);
  if (!p) return { ok: false, error: "NOT_FOUND" };
  if (published) {
    const [fr] = await db.select({ title: projectTranslation.title, summary: projectTranslation.summary })
      .from(projectTranslation)
      .where(and(eq(projectTranslation.projectId, id), eq(projectTranslation.lang, "fr")));
    if (!fr || !isPublishable(fr)) return { ok: false, error: "NOT_PUBLISHABLE" };
  }
  await db.update(project).set({
    status: published ? "published" : "draft",
    ...(published ? { publishedAt: sql`coalesce(${project.publishedAt}, now())` } : {}),
    updatedAt: new Date(),
  }).where(eq(project.id, id));
  await writeAudit(db, {
    actorId: ctx.actorId, action: published ? "project.published" : "project.unpublished",
    targetId: id, metadata: { slug: p.slug }, ip: ctx.ip,
  });
  return { ok: true };
}

/** Suppression : exige de retaper le slug ; supprime aussi les images devenues orphelines. */
export async function deleteProject(
  db: Db, store: MediaStore, id: string, confirmSlug: string, ctx: Ctx,
): Promise<{ ok: true } | { ok: false; error: "NOT_FOUND" | "SLUG_MISMATCH" }> {
  const [p] = await db.select({ slug: project.slug, cover: project.coverImageId }).from(project).where(eq(project.id, id)).limit(1);
  if (!p) return { ok: false, error: "NOT_FOUND" };
  if (confirmSlug !== p.slug) return { ok: false, error: "SLUG_MISMATCH" };
  const files = await db.select({ fileId: projectImage.fileId }).from(projectImage).where(eq(projectImage.projectId, id));
  await db.delete(project).where(eq(project.id, id));
  await db.delete(tag).where(notExists(db.select({ x: projectTag.tagId }).from(projectTag).where(eq(projectTag.tagId, tag.id))));
  const ids = new Set([...files.map((f) => f.fileId), ...(p.cover ? [p.cover] : [])]);
  for (const f of ids) await deleteMedia(db, store, f, ctx);
  await writeAudit(db, { actorId: ctx.actorId, action: "project.deleted", targetId: id, metadata: { slug: p.slug }, ip: ctx.ip });
  return { ok: true };
}
