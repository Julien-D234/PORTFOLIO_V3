import { notFound } from "next/navigation";
import { isLocale } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import { requireAdmin } from "@/server/guards";
import { getDb } from "@/server/db";
import { listAudit, listAuditActions } from "@/server/admin/queries";
import { first, fmtDate } from "@/lib/format";
import { Pagination } from "@/components/admin/pagination";

export default async function AdminAudit({ params, searchParams }: PageProps<"/[lang]/admin/audit">) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  await requireAdmin({ locale: lang });
  const sp = await searchParams;
  const action = first(sp.action)?.slice(0, 100);
  const target = first(sp.target)?.slice(0, 100);
  const db = getDb();
  const [res, actions] = await Promise.all([
    listAudit(db, { action, target, page: first(sp.page) }),
    listAuditActions(db),
  ]);
  const dict = await getDictionary(lang);
  const t = dict.admin.audit;

  return (
    <main className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">{t.title}</h1>
      <form method="get" className="flex flex-wrap gap-2 text-sm">
        <select name="action" defaultValue={action ?? ""} aria-label={t.filterAction} className="rounded border border-neutral-400 bg-transparent px-3 py-2">
          <option value="">{t.allActions}</option>
          {actions.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        {target && <input type="hidden" name="target" value={target} />}
        <button type="submit" className="rounded border border-neutral-400 px-3 py-2">{t.filter}</button>
      </form>
      {res.items.length === 0 ? <p>{t.empty}</p> : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead><tr className="border-b border-neutral-400">
              <th className="py-2">{t.cols.date}</th><th>{t.cols.actor}</th><th>{t.cols.action}</th><th>{t.cols.target}</th><th>{t.cols.ip}</th><th>{t.cols.details}</th>
            </tr></thead>
            <tbody>
              {res.items.map((r) => (
                <tr key={r.id} className="border-b border-neutral-300 align-top">
                  <td className="py-2 whitespace-nowrap">{fmtDate(r.createdAt, lang)}</td>
                  <td>{r.actorId ? (r.actorEmail ?? t.deleted) : t.system}</td>
                  <td>{r.action}</td>
                  <td>{r.targetId ? (r.targetEmail ?? t.deleted) : "—"}</td>
                  <td>{r.ip ?? "—"}</td>
                  <td className="break-all">{r.metadata ? JSON.stringify(r.metadata) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pagination base={`/${lang}/admin/audit`} params={{ action, target }} page={res.page} pageCount={res.pageCount} labels={dict.admin.pagination} />
    </main>
  );
}
