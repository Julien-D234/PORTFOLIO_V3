import Link from "next/link";
import { notFound } from "next/navigation";
import { isLocale } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import { requireAdmin } from "@/server/guards";
import { getDb } from "@/server/db";
import { listAdminProjects } from "@/server/projects/admin-queries";
import { fmt, fmtDay } from "@/lib/format";
import { ui } from "@/components/admin/ui";

export default async function AdminProjects({ params }: PageProps<"/[lang]/admin/projects">) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  await requireAdmin({ locale: lang });
  const t = (await getDictionary(lang)).admin.projects;
  const rows = await listAdminProjects(getDb());

  return (
    <main className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-3xl font-bold">{t.title}</h1>
        <Link href={`/${lang}/admin/projects/new`} className={ui.btn}>+ {t.new}</Link>
      </div>
      <p className={`text-sm ${ui.muted}`}>{fmt(t.total, { n: rows.length })}</p>
      {rows.length === 0 ? <p>{t.empty}</p> : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="text-[13px] font-medium text-[#8b8b93]">
                {[t.cols.position, t.cols.title, t.cols.tags, t.cols.status, t.cols.updated].map((c) => (
                  <th key={c} className="border-b border-[#26262a] px-2 py-2.5 font-medium">{c}</th>
                ))}
                <th className="border-b border-[#26262a]" />
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id}>
                  <td className="border-b border-[#26262a] px-2 py-2.5">{p.position}</td>
                  <td className="border-b border-[#26262a] px-2 py-2.5">
                    {p.title || <span className={ui.muted}>{t.untitled}</span>}
                    <span className="block text-xs text-[#8b8b93]">{p.slug}</span>
                  </td>
                  <td className="border-b border-[#26262a] px-2 py-2.5">
                    <ul className="flex flex-wrap gap-1">
                      {p.tags.map((tg) => <li key={tg} className={ui.tag}>{tg}</li>)}
                    </ul>
                  </td>
                  <td className="border-b border-[#26262a] px-2 py-2.5">
                    <span className={p.status === "published" ? ui.badgePublished : ui.badgeDraft}>{t.status[p.status]}</span>
                  </td>
                  <td className="border-b border-[#26262a] px-2 py-2.5 whitespace-nowrap">{fmtDay(p.updatedAt, lang)}</td>
                  <td className="border-b border-[#26262a] px-2 py-2.5 text-right">
                    <Link href={`/${lang}/admin/projects/${encodeURIComponent(p.id)}`} className={ui.btnSecondary}>{t.edit}</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
