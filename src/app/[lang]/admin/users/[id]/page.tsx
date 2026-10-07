import Link from "next/link";
import { notFound } from "next/navigation";
import { isLocale } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import { requireAdmin } from "@/server/guards";
import { getDb } from "@/server/db";
import { getUser } from "@/server/admin/queries";
import { fmtDate } from "@/lib/format";

// Les actions (rôle, ban, sessions, suppression…) arrivent au bloc C.
export default async function AdminUserDetail({ params }: PageProps<"/[lang]/admin/users/[id]">) {
  const { lang, id } = await params;
  if (!isLocale(lang)) notFound();
  await requireAdmin({ locale: lang });
  const data = await getUser(getDb(), id);
  if (!data) notFound();
  const { user: u, sessions } = data;
  const dict = await getDictionary(lang);
  const d = dict.admin.detail;
  const t = dict.admin.users;

  const rows: [string, string][] = [
    [d.id, u.id],
    [d.email, u.email],
    [d.name, u.name],
    [d.role, u.role === "admin" ? t.roles.admin : t.roles.user],
    [d.status, t.status[u.status] + (u.mustChangePassword ? ` — ${t.mustChange}` : "")],
    [d.locale, u.locale],
    [d.created, fmtDate(u.createdAt, lang)],
    [d.failed, String(u.failedLoginCount)],
  ];
  if (u.lockedUntil) rows.push([d.lockedUntil, fmtDate(u.lockedUntil, lang)]);
  if (u.banned) {
    rows.push([d.banReason, u.banReason ?? "—"]);
    rows.push([d.banExpires, u.banExpires ? fmtDate(u.banExpires, lang) : d.permanent]);
  }

  return (
    <main className="flex flex-col gap-6">
      <Link href={`/${lang}/admin/users`} className="text-sm underline">← {dict.admin.nav.back}</Link>
      <h1 className="text-2xl font-semibold">{d.title}</h1>
      <dl className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-1 text-sm">
        {rows.map(([k, v]) => (<div key={k} className="contents"><dt className="font-medium">{k}</dt><dd className="break-all">{v}</dd></div>))}
      </dl>
      <section>
        <h2 className="mb-2 text-lg font-semibold">{d.sessions}</h2>
        {sessions.length === 0 ? <p className="text-sm">{d.noSessions}</p> : (
          <table className="w-full text-left text-sm">
            <thead><tr className="border-b border-neutral-400">
              <th className="py-2">{d.sessionCols.created}</th><th>{d.sessionCols.expires}</th><th>{d.sessionCols.ip}</th><th>{d.sessionCols.agent}</th>
            </tr></thead>
            <tbody>{sessions.map((s) => (
              <tr key={s.id} className="border-b border-neutral-300">
                <td className="py-2">{fmtDate(s.createdAt, lang)}</td><td>{fmtDate(s.expiresAt, lang)}</td>
                <td>{s.ipAddress ?? "—"}</td><td className="max-w-xs truncate" title={s.userAgent ?? ""}>{s.userAgent || "—"}</td>
              </tr>))}
            </tbody>
          </table>
        )}
      </section>
      <Link href={`/${lang}/admin/audit?target=${encodeURIComponent(u.id)}`} className="text-sm underline">{d.auditLink}</Link>
    </main>
  );
}
