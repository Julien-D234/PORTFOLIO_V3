import { randomBytes } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Stockage disque des images, hors de public/. Les noms de fichiers sont
 * construits UNIQUEMENT à partir d'un id aléatoire validé (32 hex) : aucune
 * entrée utilisateur n'entre dans un chemin (pas de path traversal possible).
 */

const ID_RE = /^[a-f0-9]{32}$/;
export const isMediaId = (s: unknown): s is string => typeof s === "string" && ID_RE.test(s);
export const newMediaId = () => randomBytes(16).toString("hex");

export type Variant = "full" | "thumb";

export interface MediaStore {
  save(id: string, files: { full: Buffer; thumb: Buffer }): Promise<void>;
  read(id: string, variant: Variant): Promise<Buffer | null>;
  remove(id: string): Promise<void>;
}

export function createMediaStore(dir: string): MediaStore {
  const root = path.resolve(dir);
  const file = (id: string, v: Variant) => {
    if (!isMediaId(id)) throw new Error("invalid media id");
    return path.join(root, v === "thumb" ? `${id}.thumb.webp` : `${id}.webp`);
  };
  return {
    async save(id, files) {
      await mkdir(root, { recursive: true, mode: 0o750 });
      const written: string[] = [];
      try {
        for (const [v, buf] of [["full", files.full], ["thumb", files.thumb]] as const) {
          const final = file(id, v);
          const tmp = `${final}.${randomBytes(4).toString("hex")}.tmp`;
          await writeFile(tmp, buf, { mode: 0o640, flag: "wx" });
          await rename(tmp, final);
          written.push(final);
        }
      } catch (e) {
        await Promise.all(written.map((f) => rm(f, { force: true })));
        throw e;
      }
    },
    async read(id, variant) {
      if (!isMediaId(id)) return null;
      return readFile(file(id, variant)).catch(() => null);
    },
    async remove(id) {
      await Promise.all((["full", "thumb"] as const).map((v) => rm(file(id, v), { force: true })));
    },
  };
}
