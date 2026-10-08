import { notFound } from "next/navigation";
import { isLocale } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import { requireAdmin } from "@/server/guards";
import { getDb } from "@/server/db";
import { getAdminProject, listTags } from "@/server/projects/admin-queries";
import { ProjectEditor, type EditorDoc } from "@/components/admin/project-editor";

export default async function EditProjectPage({ params }: PageProps<"/[lang]/admin/projects/[id]">) {
  const { lang, id } = await params;
  if (!isLocale(lang)) notFound();
  await requireAdmin({ locale: lang });
  const db = getDb();
  const p = await getAdminProject(db, id);
  if (!p) notFound();
  const t = (await getDictionary(lang)).admin.projects;
  const empty = { title: "", summary: "", description: "", coverAlt: "" };
  const doc: EditorDoc = {
    slug: p.slug,
    position: p.position,
    repoUrl: p.repoUrl ?? "",
    liveUrl: p.liveUrl ?? "",
    startedAt: p.startedAt ?? "",
    coverImageId: p.coverImageId,
    translations: { fr: p.translations.fr ?? empty, en: p.translations.en ?? empty },
    tags: p.tags.map((x) => x.name),
    gallery: p.gallery.map((g) => ({
      fileId: g.fileId, altFr: g.altFr, altEn: g.altEn, captionFr: g.captionFr, captionEn: g.captionEn,
    })),
  };
  const suggestions = (await listTags(db)).map((x) => x.name);
  return (
    <ProjectEditor
      lang={lang}
      projectId={p.id}
      status={p.status}
      initial={doc}
      suggestions={suggestions}
      labels={t.editor}
      statusLabels={t.status}
    />
  );
}
