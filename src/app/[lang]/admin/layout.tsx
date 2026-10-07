import Link from "next/link";
import { notFound } from "next/navigation";
import { isLocale } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import { requireAdmin } from "@/server/guards";
import { SignOutButton } from "@/components/sign-out-button";

// Première barrière ; chaque page rappelle aussi requireAdmin (un layout n'est pas
// ré-exécuté à chaque navigation côté client).
export default async function AdminLayout({ children, params }: LayoutProps<"/[lang]/admin">) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  await requireAdmin({ locale: lang });
  const dict = await getDictionary(lang);
  const n = dict.admin.nav;
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 p-6">
      <header className="flex flex-wrap items-center gap-4 border-b border-neutral-400 pb-3 text-sm">
        <strong>{dict.admin.title}</strong>
        <Link href={`/${lang}/admin`} className="underline">{n.dashboard}</Link>
        <Link href={`/${lang}/admin/users`} className="underline">{n.users}</Link>
        <Link href={`/${lang}/admin/audit`} className="underline">{n.audit}</Link>
        <span className="ml-auto"><SignOutButton label={dict.auth.signOut} lang={lang} /></span>
      </header>
      {children}
    </div>
  );
}
