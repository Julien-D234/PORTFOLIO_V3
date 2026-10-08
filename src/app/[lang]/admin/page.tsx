import Link from "next/link";
import { notFound } from "next/navigation";
import { isLocale } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import { requireAdmin } from "@/server/guards";
import { getDb } from "@/server/db";
import { listUsers } from "@/server/admin/queries";
import { countProjects } from "@/server/projects/admin-queries";
import { fmt } from "@/lib/format";

export default async function AdminHome({ params }: PageProps<"/[lang]/admin">) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  await requireAdmin({ locale: lang });
  const dict = await getDictionary(lang);
  const { total } = await listUsers(getDb(), { pageSize: 1 });
  const projectsTotal = await countProjects(getDb());
  const d = dict.admin.dashboard;
  return (
    <main className="grid gap-4 sm:grid-cols-2">
      <Link href={`/${lang}/admin/users`} className="rounded border border-neutral-400 p-4">
        <h2 className="font-semibold">{d.users}</h2>
        <p className="text-sm">{fmt(d.usersCount, { n: total })}</p>
      </Link>
      <Link href={`/${lang}/admin/projects`} className="rounded border border-neutral-400 p-4">
        <h2 className="font-semibold">{d.projects}</h2>
        <p className="text-sm">{fmt(d.projectsCount, { n: projectsTotal })}</p>
      </Link>
      <Link href={`/${lang}/admin/audit`} className="rounded border border-neutral-400 p-4">
        <h2 className="font-semibold">{dict.admin.nav.audit}</h2>
        <p className="text-sm">{d.auditLink}</p>
      </Link>
    </main>
  );
}
