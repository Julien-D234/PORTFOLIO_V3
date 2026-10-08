import { notFound } from "next/navigation";
import { isLocale } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import { requireAdmin } from "@/server/guards";
import { NewProjectForm } from "@/components/admin/new-project-form";

export default async function NewProjectPage({ params }: PageProps<"/[lang]/admin/projects/new">) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  await requireAdmin({ locale: lang });
  const t = (await getDictionary(lang)).admin.projects.create;
  return (
    <main className="flex max-w-xl flex-col gap-4">
      <h1 className="text-2xl font-semibold">{t.title}</h1>
      <NewProjectForm lang={lang} labels={t} />
    </main>
  );
}
