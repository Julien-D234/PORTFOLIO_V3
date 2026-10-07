import Link from "next/link";
import { notFound } from "next/navigation";
import { isLocale } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import { requireAdmin } from "@/server/guards";
import { getDb } from "@/server/db";
import { listUsers } from "@/server/admin/queries";
import { first, fmt, fmtDate } from "@/lib/format";
import { Pagination } from "@/components/admin/pagination";

export default async function AdminUsers({ params, searchParams }: PageProps<"/[lang]/admin/users">) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  await requireAdmin({ locale: lang });
  const sp = await searchParams;
  const q = first(sp.q)?.slice(0, 100);
  const res = await listUsers(getDb(), { q, page: first(sp.page) });
  const dict = await getDictionary(lang);
  const t = dict.admin.users;

  return (
    <main className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{t.title}</h1>
        <Link href={`/${lang}/admin/users/new`} className="rounded border border-neutral-400 px-3 py-2 text-sm">{dict.admin.users_new}</Link>
      </div>
      <form method="get" className="flex gap-2 text-sm">
        <input name="q" defaultValue={q ?? ""} maxLength={100} placeholder={t.search} aria-label={t.search}
          className="flex-1 rounded border border-neutral-400 bg-transparent px-3 py-2" />
        <button type="submit" className="rounded border border-neutral-400 px-3 py-2">{t.searchSubmit}</button>
      </form>
      <p className="text-sm">{fmt(t.total, { n: res.total })}</p>
      {res.items.length === 0 ? <p>{t.empty}</p> : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead><tr className="border-b border-neutral-400">
              <th className="py-2">{t.cols.email}</th><th>{t.cols.name}</th><th>{t.cols.role}</th><th>{t.cols.status}</th><th>{t.cols.created}</th><th />
            </tr></thead>
            <tbody>
              {res.items.map((u) => (
                <tr key={u.id} className="border-b border-neutral-300">
                  <td className="py-2">{u.email}</td>
                  <td>{u.name}</td>
                  <td>{u.role === "admin" ? t.roles.admin : t.roles.user}</td>
                  <td>
                    {t.status[u.status]}
                    {u.mustChangePassword && <span className="block text-xs opacity-70">{t.mustChange}</span>}
                  </td>
                  <td>{fmtDate(u.createdAt, lang)}</td>
                  <td><Link href={`/${lang}/admin/users/${encodeURIComponent(u.id)}`} className="underline">{t.details}</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pagination base={`/${lang}/admin/users`} params={{ q }} page={res.page} pageCount={res.pageCount} labels={dict.admin.pagination} />
    </main>
  );
}
