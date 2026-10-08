import { afterAll, beforeAll, describe, expect, it } from "vitest";
import sharp from "sharp";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";
import * as schema from "@/server/db/schema";
import { createMediaStore } from "@/server/media/store";
import { uploadImage } from "@/server/media/service";
import { createProject, deleteProject, saveProject, setPublished } from "@/server/projects/mutations";
import { getPublishedProject, isMediaPublic } from "@/server/projects/public";
import { getAdminProject, listTags } from "@/server/projects/admin-queries";
import { saveProjectSchema, type SaveProjectInput } from "@/lib/project-schema";
import { makeEnv, seedUser, type TestEnv } from "./helpers/auth-env";

let env: TestEnv, dir: string, actor: string;
const store = () => createMediaStore(dir);
const ctx = () => ({ actorId: actor, ip: "1.1.1.1" });
const tr = (title = "", summary = "") => ({ title, summary, description: "", coverAlt: "" });
const base = (o: Partial<SaveProjectInput> = {}): SaveProjectInput => ({
  slug: "mon-projet", position: 1, repoUrl: null, liveUrl: null, startedAt: null, coverImageId: null,
  translations: { fr: tr("Titre", "Résumé"), en: tr() }, tags: [], gallery: [], ...o,
});
async function img(): Promise<string> {
  const buf = await sharp({ create: { width: 400, height: 300, channels: 3, background: "#369" } }).jpeg().toBuffer();
  const r = await uploadImage(env.db, store(), buf, ctx());
  if (!r.ok) throw new Error(r.reason);
  return r.media.id;
}
const audit = async (action: string) =>
  (await env.db.select().from(schema.auditLog).where(eq(schema.auditLog.action, action))).length;

beforeAll(async () => {
  env = await makeEnv();
  dir = await mkdtemp(path.join(os.tmpdir(), "proj-"));
  actor = (await seedUser(env, { email: "a@test.dev", role: "admin" })).id;
});
afterAll(async () => { await rm(dir, { recursive: true, force: true }); });

describe("schéma Zod", () => {
  const ok = (v: unknown) => saveProjectSchema.safeParse(v).success;
  const raw = (o: Record<string, unknown> = {}) => ({ ...base(), ...o });
  it("accepte un document valide et normalise", () => {
    const r = saveProjectSchema.parse(raw({ repoUrl: "", startedAt: "", tags: ["  React "], translations: {
      fr: { ...tr("T", "S"), description: "a\r\nb  " }, en: tr() } }));
    expect(r.repoUrl).toBeNull();
    expect(r.startedAt).toBeNull();
    expect(r.tags).toEqual(["React"]);
    expect(r.translations.fr.description).toBe("a\nb");
  });
  it("refuse URLs non https, identifiants intégrés, dates et slugs invalides", () => {
    for (const u of ["http://x.fr", "javascript:alert(1)", "data:text/html,x", "https://u:p@x.fr", "https://localhost", "//x.fr", "x.fr"])
      expect(ok(raw({ repoUrl: u })), u).toBe(false);
    expect(ok(raw({ liveUrl: "https://exemple.fr/a?b=1" }))).toBe(true);
    for (const d of ["2026-13-01", "2026-02-30", "26-01-01", "hier"]) expect(ok(raw({ startedAt: d })), d).toBe(false);
    for (const s of ["", "A", "a b", "../x", "a--b", "-a", "a".repeat(81)]) expect(ok(raw({ slug: s })), s).toBe(false);
  });
  it("refuse bornes dépassées, NUL, retours à la ligne dans les champs courts, ids média invalides", () => {
    expect(ok(raw({ translations: { fr: tr("T", "x".repeat(201)), en: tr() } }))).toBe(false);
    expect(ok(raw({ translations: { fr: tr("T\nU", "S"), en: tr() } }))).toBe(false);
    expect(ok(raw({ translations: { fr: { ...tr("T", "S"), description: "a\u0000b" }, en: tr() } }))).toBe(false);
    expect(ok(raw({ tags: ["a", ""] }))).toBe(false);
    expect(ok(raw({ tags: Array.from({ length: 16 }, (_, i) => `t${i}`) }))).toBe(false);
    expect(ok(raw({ position: -1 }))).toBe(false);
    expect(ok(raw({ position: 1.5 }))).toBe(false);
    expect(ok(raw({ coverImageId: "../etc/passwd" }))).toBe(false);
    expect(ok(raw({ gallery: [{ fileId: "zz", altFr: "", altEn: "", captionFr: "", captionEn: "" }] }))).toBe(false);
  });
  it("ignore les champs inconnus (status ne passe pas par ici)", () => {
    const r = saveProjectSchema.parse(raw({ status: "published", id: "x" }));
    expect(r).not.toHaveProperty("status");
    expect(r).not.toHaveProperty("id");
  });
});

describe("cycle de vie", () => {
  let id: string;
  it("création : brouillon, slug unique, audit", async () => {
    const r = await createProject(env.db, "mon-projet", ctx());
    if (!r.ok) throw new Error();
    id = r.id;
    const d = await getAdminProject(env.db, id);
    expect(d).toMatchObject({ status: "draft", slug: "mon-projet", position: 1 });
    expect(await createProject(env.db, "mon-projet", ctx())).toEqual({ ok: false, error: "SLUG_TAKEN" });
    const r2 = await createProject(env.db, "autre", ctx());
    expect(r2.ok && (await getAdminProject(env.db, r2.id))?.position).toBe(2);
    expect(await audit("project.created")).toBe(2);
  });
  it("publication refusée sans titre+résumé fr, brouillon jamais public", async () => {
    expect(await setPublished(env.db, id, true, ctx())).toEqual({ ok: false, error: "NOT_PUBLISHABLE" });
    expect(await setPublished(env.db, "inconnu", true, ctx())).toEqual({ ok: false, error: "NOT_FOUND" });
    expect(await getPublishedProject(env.db, "mon-projet", "fr")).toBeNull();
  });
  it("enregistrement : contenu, tags (casse), galerie, couverture", async () => {
    const cover = await img(); const g1 = await img(); const g2 = await img();
    const r = await saveProject(env.db, store(), id, base({
      repoUrl: "https://github.com/x/y", startedAt: "2026-03-01", coverImageId: cover,
      translations: { fr: { ...tr("Titre", "Résumé"), description: "Desc <b>x</b>" }, en: tr("Title", "") },
      tags: ["React", "react", "Node"],
      gallery: [
        { fileId: g1, altFr: "a1", altEn: "", captionFr: "c1", captionEn: "" },
        { fileId: g2, altFr: "a2", altEn: "", captionFr: "", captionEn: "" },
      ],
    }), ctx());
    expect(r).toEqual({ ok: true });
    const d = await getAdminProject(env.db, id);
    expect(d?.tags.map((t) => t.name)).toEqual(["Node", "React"]);
    expect(d?.gallery.map((g) => g.fileId)).toEqual([g1, g2]);
    expect(d?.translations.en.title).toBe("Title");
    expect(d?.coverImageId).toBe(cover);
    // idempotent + réordonnancement de la galerie
    await saveProject(env.db, store(), id, base({ coverImageId: cover, tags: ["react"],
      gallery: [{ fileId: g2, altFr: "", altEn: "", captionFr: "", captionEn: "" }, { fileId: g1, altFr: "", altEn: "", captionFr: "", captionEn: "" }] }), ctx());
    const d2 = await getAdminProject(env.db, id);
    expect(d2?.gallery.map((g) => g.fileId)).toEqual([g2, g1]);
    expect((await listTags(env.db)).map((t) => t.name)).toEqual(["React"]); // "Node" orphelin supprimé
  });
  it("média inexistant → MEDIA_MISSING, rien n'est modifié", async () => {
    const r = await saveProject(env.db, store(), id, base({ position: 77, coverImageId: "a".repeat(32) }), ctx());
    expect(r).toEqual({ ok: false, error: "MEDIA_MISSING" });
    expect((await getAdminProject(env.db, id))?.position).toBe(1);
  });
  it("slug déjà pris → SLUG_TAKEN (transaction annulée)", async () => {
    const r = await saveProject(env.db, store(), id, base({ slug: "autre", position: 88 }), ctx());
    expect(r).toEqual({ ok: false, error: "SLUG_TAKEN" });
    const d = await getAdminProject(env.db, id);
    expect(d?.slug).toBe("mon-projet");
    expect(d?.position).toBe(1);
  });
  it("retirer un média du projet le supprime (ligne + fichier)", async () => {
    const before = await getAdminProject(env.db, id);
    const gone = before!.gallery[0].fileId;
    const keep = before!.gallery[1].fileId;
    await saveProject(env.db, store(), id, base({ coverImageId: before!.coverImageId,
      gallery: [{ fileId: keep, altFr: "", altEn: "", captionFr: "", captionEn: "" }] }), ctx());
    expect(await store().read(gone, "full")).toBeNull();
    expect(await env.db.select().from(schema.mediaFile).where(eq(schema.mediaFile.id, gone))).toHaveLength(0);
    expect(await store().read(keep, "full")).not.toBeNull();
  });
  it("publier → public avec médias ; dépublier → disparaît", async () => {
    const d = await getAdminProject(env.db, id);
    expect(await setPublished(env.db, id, true, ctx())).toEqual({ ok: true });
    const pub = await getPublishedProject(env.db, "mon-projet", "fr");
    expect(pub?.title).toBe("Titre");
    expect(await isMediaPublic(env.db, d!.coverImageId!)).toBe(true);
    const first = (await getAdminProject(env.db, id))!.publishedAt;
    expect(first).not.toBeNull();
    expect(await setPublished(env.db, id, false, ctx())).toEqual({ ok: true });
    expect(await getPublishedProject(env.db, "mon-projet", "fr")).toBeNull();
    expect(await isMediaPublic(env.db, d!.coverImageId!)).toBe(false);
    await setPublished(env.db, id, true, ctx());
    expect((await getAdminProject(env.db, id))!.publishedAt).toEqual(first); // date de 1re publication conservée
  });
  it("un projet publié ne peut pas être enregistré sans titre/résumé fr", async () => {
    const r = await saveProject(env.db, store(), id, base({ translations: { fr: tr("", ""), en: tr() } }), ctx());
    expect(r).toEqual({ ok: false, error: "NOT_PUBLISHABLE" });
    expect((await getPublishedProject(env.db, "mon-projet", "fr"))?.title).toBe("Titre");
  });
  it("suppression : slug exact exigé, médias orphelins nettoyés, audit", async () => {
    const d = await getAdminProject(env.db, id);
    const files = [d!.coverImageId!, ...d!.gallery.map((g) => g.fileId)];
    expect(await deleteProject(env.db, store(), id, "mauvais", ctx())).toEqual({ ok: false, error: "SLUG_MISMATCH" });
    expect(await deleteProject(env.db, store(), "inconnu", "x", ctx())).toEqual({ ok: false, error: "NOT_FOUND" });
    expect(await getAdminProject(env.db, id)).not.toBeNull();
    expect(await deleteProject(env.db, store(), id, "mon-projet", ctx())).toEqual({ ok: true });
    expect(await getAdminProject(env.db, id)).toBeNull();
    for (const f of files) expect(await store().read(f, "full")).toBeNull();
    expect(await listTags(env.db)).toEqual([]);
    for (const a of ["project.updated", "project.published", "project.unpublished", "project.deleted"])
      expect(await audit(a), a).toBeGreaterThan(0);
  });
  it("l'audit ne contient jamais le contenu du projet", async () => {
    const rows = await env.db.select().from(schema.auditLog);
    const all = JSON.stringify(rows);
    expect(all).not.toContain("Desc <b>x</b>");
    expect(all).not.toContain("Résumé");
  });
});

describe("média partagé entre deux projets", () => {
  it("n'est pas supprimé tant qu'un autre projet l'utilise", async () => {
    const shared = await img();
    const a = await createProject(env.db, "pa", ctx()); const b = await createProject(env.db, "pb", ctx());
    if (!a.ok || !b.ok) throw new Error();
    const g = [{ fileId: shared, altFr: "", altEn: "", captionFr: "", captionEn: "" }];
    await saveProject(env.db, store(), a.id, base({ slug: "pa", gallery: g }), ctx());
    await saveProject(env.db, store(), b.id, base({ slug: "pb", gallery: g }), ctx());
    expect(await deleteProject(env.db, store(), a.id, "pa", ctx())).toEqual({ ok: true });
    expect(await store().read(shared, "full")).not.toBeNull();
  });
});
