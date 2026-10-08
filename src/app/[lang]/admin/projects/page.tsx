import Link from "next/link";
import { notFound } from "next/navigation";
import { isLocale } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import { requireAdmin } from "@/server/guards";
import { getDb } from "@/server/db";
import { listAdminProjects } from "@/server/projects/admin-queries";
import { fmt, fmtDate } from "@/lib/format";

export default async function AdminProjects({ params }: PageProps<"/[lang]/admin/projects">) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  await requireAdmin({ locale: lang });
  const t = (await getDictionary(lang)).admin.projects;
  const rows = await listAdminProjects(getDb());

  return (
    <main className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{t.title}</h1>
        <Link href={`/${lang}/admin/projects/new`} className="rounded border border-neutral-400 px-3 py-2 text-sm">{t.new}</Link>
      </div>
      <p className="text-sm">{fmt(t.total, { n: rows.length })}</p>
      {rows.length === 0 ? <p>{t.empty}</p> : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead><tr className="border-b border-neutral-400">
              <th className="py-2">{t.cols.position}</th><th>{t.cols.title}</th><th>{t.cols.tags}</th><th>{t.cols.status}</th><th>{t.cols.updated}</th><th />
            </tr></thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id} className="border-b border-neutral-300">
                  <td className="py-2">{p.position}</td>
                  <td>
                    {p.title || <span className="opacity-60">{t.untitled}</span>}
                    <span className="block text-xs opacity-60">{p.slug}</span>
                  </td>
                  <td>{p.tags.join(", ")}</td>
                  <td>{t.status[p.status]}</td>
                  <td>{fmtDate(p.updatedAt, lang)}</td>
                  <td><Link href={`/${lang}/admin/projects/${encodeURIComponent(p.id)}`} className="underline">{t.edit}</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
