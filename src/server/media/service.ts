import { eq } from "drizzle-orm";
import { mediaFile, project, projectImage } from "../db/schema";
import type { Db } from "../db/types";
import { writeAudit } from "../auth/audit";
import { ImageError, processImage, type ImageErrorCode } from "./image";
import { newMediaId, type MediaStore } from "./store";

export interface UploadedMedia {
  id: string;
  width: number;
  height: number;
  bytes: number;
}

export type UploadResult =
  | { ok: true; media: UploadedMedia }
  | { ok: false; reason: ImageErrorCode };

/** À appeler APRÈS requireApi("admin") + isSameOrigin + rate-limit. */
export async function uploadImage(
  db: Db,
  store: MediaStore,
  input: Buffer,
  ctx: { actorId: string; ip?: string | null },
): Promise<UploadResult> {
  let processed;
  try {
    processed = await processImage(input);
  } catch (e) {
    if (e instanceof ImageError) return { ok: false, reason: e.code };
    throw e;
  }
  const id = newMediaId();
  await store.save(id, processed);
  try {
    await db.insert(mediaFile).values({
      id,
      mime: "image/webp",
      width: processed.width,
      height: processed.height,
      bytes: processed.full.length,
      createdBy: ctx.actorId,
    });
    await writeAudit(db, {
      actorId: ctx.actorId,
      action: "media.uploaded",
      targetId: id,
      metadata: { bytes: processed.full.length, width: processed.width, height: processed.height },
      ip: ctx.ip,
    });
  } catch (e) {
    await store.remove(id); // pas de fichier orphelin si la base échoue
    throw e;
  }
  return { ok: true, media: { id, width: processed.width, height: processed.height, bytes: processed.full.length } };
}

/** Supprime un média inutilisé (ni couverture, ni galerie) : ligne + fichiers. */
export async function deleteMedia(
  db: Db,
  store: MediaStore,
  id: string,
  ctx: { actorId: string; ip?: string | null },
): Promise<"deleted" | "not_found" | "in_use"> {
  const [m] = await db.select({ id: mediaFile.id }).from(mediaFile).where(eq(mediaFile.id, id)).limit(1);
  if (!m) return "not_found";
  const [used] = await db
    .select({ id: project.id })
    .from(project)
    .where(eq(project.coverImageId, id))
    .limit(1);
  const [inGallery] = await db
    .select({ id: projectImage.id })
    .from(projectImage)
    .where(eq(projectImage.fileId, id))
    .limit(1);
  if (used || inGallery) return "in_use";
  await db.delete(mediaFile).where(eq(mediaFile.id, id));
  await store.remove(id);
  await writeAudit(db, { actorId: ctx.actorId, action: "media.deleted", targetId: id, ip: ctx.ip });
  return "deleted";
}

/** Ids des médias sans aucun usage (pour un nettoyage ultérieur). */
export async function listUnusedMediaIds(db: Db): Promise<string[]> {
  const rows = await db.select({ id: mediaFile.id, c: project.id, g: projectImage.id })
    .from(mediaFile)
    .leftJoin(project, eq(project.coverImageId, mediaFile.id))
    .leftJoin(projectImage, eq(projectImage.fileId, mediaFile.id));
  return [...new Set(rows.filter((r) => !r.c && !r.g).map((r) => r.id))];
}
