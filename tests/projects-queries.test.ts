import { beforeAll, describe, expect, it } from "vitest";
import * as schema from "@/server/db/schema";
import {
  getPublishedProject, isMediaPublic, isValidSlug, listPublishedProjects, withFallback,
} from "@/server/projects/public";
import { getAdminProject, listAdminProjects, listTags } from "@/server/projects/admin-queries";
import { makeEnv, type TestEnv } from "./helpers/auth-env";

let env: TestEnv;
const db = () => env.db;

async function media(id: string) {
  await db().insert(schema.mediaFile).values({ id, mime: "image/webp", width: 1920, height: 1080, bytes: 1000 });
}
async function mk(
  id: string,
  o: {
    status?: "draft" | "published"; position?: number; cover?: string;
    fr?: Partial<schema.ProjectTranslationInsert>; en?: Partial<schema.ProjectTranslationInsert>;
    tags?: string[]; gallery?: { file: string; altFr?: string; altEn?: string; captionFr?: string; captionEn?: string }[];
  } = {},
) {
  await db().insert(schema.project).values({
    id, slug: id, status: o.status ?? "published", position: o.position ?? 0,
    coverImageId: o.cover ?? null, repoUrl: "https://github.com/x/y",
  });
  if (o.fr) await db().insert(schema.projectTranslation).values({ projectId: id, lang: "fr", ...o.fr });
  if (o.en) await db().insert(schema.projectTranslation).values({ projectId: id, lang: "en", ...o.en });
  for (const name of o.tags ?? []) {
    const tid = `tag-${name.toLowerCase()}`;
    await db().insert(schema.tag).values({ id: tid, name }).onConflictDoNothing();
    await db().insert(schema.projectTag).values({ projectId: id, tagId: tid });
  }
  let i = 0;
  for (const g of o.gallery ?? []) {
    await db().insert(schema.projectImage).values({ id: `${id}-g${i}`, projectId: id, fileId: g.file, position: i++,
      altFr: g.altFr ?? "", altEn: g.altEn ?? "", captionFr: g.captionFr ?? "", captionEn: g.captionEn ?? "" });
  }
}

beforeAll(async () => {
  env = await makeEnv();
  for (const m of ["m-cover-pub", "m-gal-pub", "m-cover-draft", "m-gal-draft", "m-orphan"]) await media(m);
  await mk("beta", { position: 2, cover: "m-cover-pub", tags: ["React", "Node"],
    fr: { title: "Bêta", summary: "Résumé fr", description: "Desc fr" },
    en: { title: "Beta", summary: "", description: "" },
    gallery: [{ file: "m-gal-pub", altFr: "Alt fr", altEn: "", captionFr: "Légende fr", captionEn: "Caption en" }] });
  await mk("alpha", { position: 1, fr: { title: "Alpha", summary: "S" } });
  await mk("secret", { status: "draft", position: 0, cover: "m-cover-draft", tags: ["Secret"],
    fr: { title: "Secret", summary: "S" }, gallery: [{ file: "m-gal-draft" }] });
  await mk("untitled", { position: 3, fr: { title: "  ", summary: "x" } });
});

describe("pures", () => {
  it("isValidSlug", () => {
    expect(isValidSlug("mon-projet-2")).toBe(true);
    for (const s of ["", "A", "-a", "a-", "a--b", "a b", "a/b", "../x", "a".repeat(81), 12, null])
      expect(isValidSlug(s)).toBe(false);
  });
  it("withFallback", () => {
    expect(withFallback("x", "fr")).toBe("x");
    expect(withFallback("  ", "fr")).toBe("fr");
    expect(withFallback(undefined, undefined)).toBe("");
  });
});

describe("lecture publique", () => {
  it("ne liste jamais un brouillon ni un publié sans titre, trié par position", async () => {
    const l = await listPublishedProjects(db(), "fr");
    expect(l.map((p) => p.slug)).toEqual(["alpha", "beta"]);
    expect(JSON.stringify(l)).not.toContain("Secret");
  });
  it("repli sur le français champ par champ", async () => {
    const [, beta] = await listPublishedProjects(db(), "en");
    expect(beta.title).toBe("Beta"); // traduit
    expect(beta.summary).toBe("Résumé fr"); // vide en en → fr
    expect(beta.tags).toEqual(["Node", "React"]);
    expect(beta.coverImageId).toBe("m-cover-pub");
  });
  it("langue inconnue → français", async () => {
    const l = await listPublishedProjects(db(), "xx'; --");
    expect(l[1].title).toBe("Bêta");
  });
  it("détail : brouillon, inconnu et slug piégé → null", async () => {
    expect(await getPublishedProject(db(), "secret", "fr")).toBeNull();
    expect(await getPublishedProject(db(), "nope", "fr")).toBeNull();
    expect(await getPublishedProject(db(), "untitled", "fr")).toBeNull();
    expect(await getPublishedProject(db(), "' OR 1=1 --", "fr")).toBeNull();
    expect(await getPublishedProject(db(), "../beta", "fr")).toBeNull();
  });
  it("détail : galerie avec repli légendes/alt, pas de champs internes", async () => {
    const fr = await getPublishedProject(db(), "beta", "fr");
    expect(fr?.gallery).toEqual([{ fileId: "m-gal-pub", alt: "Alt fr", caption: "Légende fr" }]);
    const en = await getPublishedProject(db(), "beta", "en");
    expect(en?.gallery).toEqual([{ fileId: "m-gal-pub", alt: "Alt fr", caption: "Caption en" }]);
    expect(en?.description).toBe("Desc fr");
    expect(en?.repoUrl).toBe("https://github.com/x/y");
    expect(Object.keys(en!)).not.toContain("id");
  });
  it("médias : publics seulement s'ils appartiennent à un projet publié", async () => {
    expect(await isMediaPublic(db(), "m-cover-pub")).toBe(true);
    expect(await isMediaPublic(db(), "m-gal-pub")).toBe(true);
    expect(await isMediaPublic(db(), "m-cover-draft")).toBe(false);
    expect(await isMediaPublic(db(), "m-gal-draft")).toBe(false);
    expect(await isMediaPublic(db(), "m-orphan")).toBe(false);
    expect(await isMediaPublic(db(), "inconnu")).toBe(false);
  });
  it("dépublier retire aussitôt projet et médias", async () => {
    const { eq } = await import("drizzle-orm");
    await db().update(schema.project).set({ status: "draft" }).where(eq(schema.project.id, "beta"));
    expect(await getPublishedProject(db(), "beta", "fr")).toBeNull();
    expect(await isMediaPublic(db(), "m-cover-pub")).toBe(false);
    expect(await isMediaPublic(db(), "m-gal-pub")).toBe(false);
    await db().update(schema.project).set({ status: "published" }).where(eq(schema.project.id, "beta"));
    expect(await isMediaPublic(db(), "m-cover-pub")).toBe(true);
  });
});

describe("contraintes de base", () => {
  it("rejette statut, slug et résumé invalides", async () => {
    const bad = (v: Partial<typeof schema.project.$inferInsert>) =>
      db().insert(schema.project).values({ id: "z", slug: "z", ...v });
    await expect(bad({ status: "public" })).rejects.toThrow();
    await expect(bad({ slug: "Bad Slug" })).rejects.toThrow();
    await expect(bad({ slug: "alpha" })).rejects.toThrow(); // unique
    await expect(
      db().insert(schema.projectTranslation).values({ projectId: "alpha", lang: "en", summary: "x".repeat(201) }),
    ).rejects.toThrow();
  });
  it("tag unique sans casse", async () => {
    await expect(db().insert(schema.tag).values({ id: "dup", name: "react" })).rejects.toThrow();
  });
  it("média référencé par la galerie non supprimable ; supprimer un projet cascade", async () => {
    const { eq } = await import("drizzle-orm");
    await expect(db().delete(schema.mediaFile).where(eq(schema.mediaFile.id, "m-gal-pub"))).rejects.toThrow();
    await db().delete(schema.project).where(eq(schema.project.id, "secret"));
    expect(await db().select().from(schema.projectImage).where(eq(schema.projectImage.projectId, "secret"))).toHaveLength(0);
    // supprimer la couverture d'un projet la met à null (pas d'erreur)
    await db().delete(schema.mediaFile).where(eq(schema.mediaFile.id, "m-cover-draft"));
  });
});

describe("lecture admin", () => {
  it("liste brouillons et publiés avec titre fr", async () => {
    const l = await listAdminProjects(db());
    expect(l.map((p) => p.slug)).toEqual(["alpha", "beta", "untitled"]);
    expect(l.find((p) => p.slug === "beta")).toMatchObject({ title: "Bêta", tags: ["Node", "React"], status: "published" });
  });
  it("détail complet, null si inconnu", async () => {
    const d = await getAdminProject(db(), "beta");
    expect(d?.translations.en.title).toBe("Beta");
    expect(d?.gallery).toHaveLength(1);
    expect(d?.tags.map((t) => t.name)).toEqual(["Node", "React"]);
    expect(await getAdminProject(db(), "nope")).toBeNull();
  });
  it("tags avec nombre d'usages", async () => {
    const t = await listTags(db());
    expect(t.find((x) => x.name === "React")?.uses).toBe(1);
  });
});
