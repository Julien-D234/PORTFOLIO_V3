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
    // Charte A (sombre, sobre) : même habillage que les maquettes validées.
    <div className="flex-1 bg-[#0a0a0b] text-[#ededee] [color-scheme:dark]">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-6">
        <header className="flex flex-wrap items-center gap-4 border-b border-[#26262a] pb-3 text-sm">
          <strong>{dict.admin.title}</strong>
          {[
            [`/${lang}/admin`, n.dashboard],
            [`/${lang}/admin/users`, n.users],
            [`/${lang}/admin/projects`, n.projects],
            [`/${lang}/admin/audit`, n.audit],
          ].map(([href, label]) => (
            <Link key={href} href={href} className="text-[#8b8b93] hover:text-white hover:underline">{label}</Link>
          ))}
          <span className="ml-auto"><SignOutButton label={dict.auth.signOut} lang={lang} /></span>
        </header>
        {children}
      </div>
    </div>
  );
}
