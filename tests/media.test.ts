import { afterAll, beforeAll, describe, expect, it } from "vitest";
import sharp from "sharp";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";
import * as schema from "@/server/db/schema";
import { detectImageType, ImageError, MAX_UPLOAD_BYTES, processImage } from "@/server/media/image";
import { createMediaStore, isMediaId, newMediaId } from "@/server/media/store";
import { readBodyCapped } from "@/server/media/body";
import { deleteMedia, listUnusedMediaIds, uploadImage } from "@/server/media/service";
import { isMediaPublic } from "@/server/projects/public";
import { makeEnv, seedUser, type TestEnv } from "./helpers/auth-env";

const solid = (w: number, h: number) => ({ create: { width: w, height: h, channels: 3 as const, background: "#3366cc" } });
const jpeg = (w = 800, h = 600) => sharp(solid(w, h)).jpeg().toBuffer();
const png = (w = 800, h = 600) => sharp(solid(w, h)).png().toBuffer();
const webp = (w = 800, h = 600) => sharp(solid(w, h)).webp().toBuffer();
const code = async (p: Promise<unknown>) => p.then(() => "ok", (e) => (e instanceof ImageError ? e.code : `other:${e}`));

describe("détection par octets", () => {
  it("reconnaît jpeg/png/webp", async () => {
    expect(detectImageType(await jpeg())).toBe("jpeg");
    expect(detectImageType(await png())).toBe("png");
    expect(detectImageType(await webp())).toBe("webp");
  });
  it("refuse SVG, GIF, HTML, PDF, exécutables, vide", () => {
    const t = (s: string | number[]) => detectImageType(typeof s === "string" ? Buffer.from(s) : Uint8Array.from(s));
    expect(t('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>')).toBeNull();
    expect(t("GIF89a\x01\x00\x01\x00")).toBeNull();
    expect(t("<html><script>1</script>")).toBeNull();
    expect(t("%PDF-1.7")).toBeNull();
    expect(t([0x4d, 0x5a, 0x90, 0x00])).toBeNull(); // MZ
    expect(t([])).toBeNull();
    expect(t("RIFF\x00\x00\x00\x00WAVE")).toBeNull();
  });
});

describe("processImage", () => {
  it("jpeg/png/webp → WebP, plafonné à 1920, miniature 480", async () => {
    for (const input of [await jpeg(3000, 2000), await png(3000, 2000), await webp(3000, 2000)]) {
      const r = await processImage(input);
      expect(r).toMatchObject({ width: 1920, height: 1280 });
      expect(detectImageType(r.full)).toBe("webp");
      const tm = await sharp(r.thumb).metadata();
      expect(tm.format).toBe("webp");
      expect(tm.width).toBe(480);
    }
  });
  it("n'agrandit jamais une petite image", async () => {
    const r = await processImage(await jpeg(800, 600));
    expect(r).toMatchObject({ width: 800, height: 600 });
  });
  it("supprime EXIF/GPS et applique l'orientation", async () => {
    const withExif = await sharp(solid(400, 200))
      .withExif({ IFD0: { Copyright: "secret-copyright" }, IFD3: { GPSLatitudeRef: "N" } })
      .withMetadata({ orientation: 6 })
      .jpeg()
      .toBuffer();
    expect((await sharp(withExif).metadata()).exif).toBeTruthy();
    const r = await processImage(withExif);
    const m = await sharp(r.full).metadata();
    expect(m.exif).toBeUndefined();
    expect(r.full.includes(Buffer.from("secret-copyright"))).toBe(false);
    expect(r).toMatchObject({ width: 200, height: 400 }); // pivotée par l'orientation 6
  });
  it("refuse : vide, trop gros, type interdit, corrompu, polyglotte, tronqué", async () => {
    expect(await code(processImage(Buffer.alloc(0)))).toBe("EMPTY");
    expect(await code(processImage(Buffer.alloc(MAX_UPLOAD_BYTES + 1, 1)))).toBe("TOO_LARGE");
    expect(await code(processImage(Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'/>")))).toBe("UNSUPPORTED_TYPE");
    expect(await code(processImage(Buffer.from("GIF89a....")))).toBe("UNSUPPORTED_TYPE");
    // en-tête JPEG valide + contenu quelconque (script) : le décodage échoue
    expect(await code(processImage(Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from("<script>alert(1)</script>")])))).toBe("INVALID_IMAGE");
    const j = await jpeg(1200, 900);
    expect(await code(processImage(j.subarray(0, 200)))).toBe("INVALID_IMAGE");
    const p = await png();
    expect(await code(processImage(p.subarray(0, 60)))).toBe("INVALID_IMAGE");
  });
  it("refuse bombe de décompression et images trop petites", async () => {
    const bomb = await png(7000, 7000); // quelques Ko compressés, 49 Mpx décodés
    expect(bomb.length).toBeLessThan(MAX_UPLOAD_BYTES);
    expect(await code(processImage(bomb))).toBe("BAD_DIMENSIONS");
    expect(await code(processImage(await png(50, 50)))).toBe("BAD_DIMENSIONS");
    expect(await code(processImage(await png(4000, 50)))).toBe("BAD_DIMENSIONS");
  });
  it("un faux .jpg qui est un PNG est ré-encodé en WebP (le type vient des octets)", async () => {
    const r = await processImage(await png());
    expect(detectImageType(r.full)).toBe("webp");
  });
});

describe("store (chemins)", () => {
  let dir: string;
  beforeAll(async () => { dir = await mkdtemp(path.join(os.tmpdir(), "media-")); });
  afterAll(async () => { await rm(dir, { recursive: true, force: true }); });

  it("ids : 32 hex uniquement", () => {
    expect(isMediaId(newMediaId())).toBe(true);
    for (const s of ["", "../etc/passwd", "a".repeat(31), "A".repeat(32), `${"a".repeat(31)}/`, `${"a".repeat(32)}.webp`, null])
      expect(isMediaId(s)).toBe(false);
  });
  it("save/read/remove, et refuse tout id non conforme", async () => {
    const store = createMediaStore(path.join(dir, "sub"));
    const id = newMediaId();
    await store.save(id, { full: Buffer.from("F"), thumb: Buffer.from("T") });
    expect((await store.read(id, "full"))?.toString()).toBe("F");
    expect((await store.read(id, "thumb"))?.toString()).toBe("T");
    expect(await readdir(path.join(dir, "sub"))).toHaveLength(2); // pas de .tmp résiduel
    expect(await store.read("../../etc/passwd", "full")).toBeNull();
    await expect(store.save("../x", { full: Buffer.from("x"), thumb: Buffer.from("x") })).rejects.toThrow();
    await expect(store.remove("../x")).rejects.toThrow();
    await store.remove(id);
    expect(await store.read(id, "full")).toBeNull();
    expect(await readdir(path.join(dir, "sub"))).toHaveLength(0);
  });
});

describe("readBodyCapped", () => {
  const req = (body: BodyInit | null, headers: Record<string, string> = {}) =>
    new Request("http://x/", { method: "POST", body, headers, duplex: "half" } as RequestInit);
  it("accepte sous la limite, refuse au-delà (même sans Content-Length fiable)", async () => {
    expect((await readBodyCapped(req(Buffer.alloc(10)), 100) as Buffer).length).toBe(10);
    expect(await readBodyCapped(req(Buffer.alloc(101)), 100)).toBe("TOO_LARGE");
    expect(await readBodyCapped(req("x", { "content-length": "999999" }), 100)).toBe("TOO_LARGE");
    const stream = new ReadableStream({ start(c) { c.enqueue(new Uint8Array(60)); c.enqueue(new Uint8Array(60)); c.close(); } });
    expect(await readBodyCapped(req(stream), 100)).toBe("TOO_LARGE");
    expect(await readBodyCapped(new Request("http://x/", { method: "POST" }), 100)).toBeNull();
  });
});

describe("service d'upload", () => {
  let env: TestEnv, dir: string, adminId: string;
  const store = () => createMediaStore(dir);
  beforeAll(async () => {
    env = await makeEnv();
    dir = await mkdtemp(path.join(os.tmpdir(), "media-svc-"));
    adminId = (await seedUser(env, { email: "a@test.dev", role: "admin" })).id;
  });
  afterAll(async () => { await rm(dir, { recursive: true, force: true }); });

  it("upload valide : fichiers + ligne + audit, privé tant que non publié", async () => {
    const r = await uploadImage(env.db, store(), await jpeg(2500, 1500), { actorId: adminId, ip: "1.2.3.4" });
    if (!r.ok) throw new Error(r.reason);
    expect(isMediaId(r.media.id)).toBe(true);
    expect(r.media.width).toBe(1920);
    const [row] = await env.db.select().from(schema.mediaFile).where(eq(schema.mediaFile.id, r.media.id));
    expect(row).toMatchObject({ mime: "image/webp", createdBy: adminId });
    expect(await store().read(r.media.id, "full")).not.toBeNull();
    const [a] = await env.db.select().from(schema.auditLog).where(eq(schema.auditLog.action, "media.uploaded"));
    expect(a.targetId).toBe(r.media.id);
    expect(await isMediaPublic(env.db, r.media.id)).toBe(false);
  });
  it("fichier piégé : rien n'est écrit ni en base ni sur disque", async () => {
    const before = (await readdir(dir)).length;
    const rows = (await env.db.select().from(schema.mediaFile)).length;
    const r = await uploadImage(env.db, store(), Buffer.from("<svg onload=alert(1)>"), { actorId: adminId });
    expect(r).toEqual({ ok: false, reason: "UNSUPPORTED_TYPE" });
    expect((await readdir(dir)).length).toBe(before);
    expect((await env.db.select().from(schema.mediaFile)).length).toBe(rows);
  });
  it("échec base → fichiers nettoyés", async () => {
    const before = (await readdir(dir)).length;
    await expect(
      uploadImage(env.db, store(), await jpeg(), { actorId: adminId }),
    ).resolves.toMatchObject({ ok: true }); // contrôle : fonctionne
    const afterOk = (await readdir(dir)).length;
    expect(afterOk).toBe(before + 2);
    const broken = { ...env.db, insert: () => { throw new Error("db down"); } } as unknown as typeof env.db;
    await expect(uploadImage(broken, store(), await jpeg(), { actorId: adminId })).rejects.toThrow("db down");
    expect((await readdir(dir)).length).toBe(afterOk);
  });
  it("suppression : refusée si utilisé, sinon ligne + fichiers supprimés", async () => {
    const up = async () => { const r = await uploadImage(env.db, store(), await jpeg(), { actorId: adminId }); if (!r.ok) throw new Error(); return r.media.id; };
    const used = await up(); const free = await up();
    await env.db.insert(schema.project).values({ id: "p1", slug: "p1", coverImageId: used });
    expect(await deleteMedia(env.db, store(), used, { actorId: adminId })).toBe("in_use");
    expect(await store().read(used, "full")).not.toBeNull();
    expect(await listUnusedMediaIds(env.db)).toContain(free);
    expect(await listUnusedMediaIds(env.db)).not.toContain(used);
    expect(await deleteMedia(env.db, store(), free, { actorId: adminId })).toBe("deleted");
    expect(await store().read(free, "full")).toBeNull();
    expect(await deleteMedia(env.db, store(), free, { actorId: adminId })).toBe("not_found");
    // publié → public
    await env.db.update(schema.project).set({ status: "published" }).where(eq(schema.project.id, "p1"));
    expect(await isMediaPublic(env.db, used)).toBe(true);
  });
});
