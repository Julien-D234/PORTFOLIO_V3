import Link from "next/link";
import { notFound } from "next/navigation";
import { isLocale } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import { requireAdmin } from "@/server/guards";
import { NewUserForm } from "@/components/admin/new-user-form";

export default async function NewUserPage({ params }: PageProps<"/[lang]/admin/users/new">) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  await requireAdmin({ locale: lang });
  const dict = await getDictionary(lang);
  const n = dict.admin.new;
  return (
    <main className="flex flex-col gap-4">
      <Link href={`/${lang}/admin/users`} className="text-sm underline">← {dict.admin.nav.back}</Link>
      <h1 className="text-2xl font-semibold">{n.title}</h1>
      <NewUserForm lang={lang} labels={{
        ...n, roleUser: dict.admin.users.roles.user, roleAdmin: dict.admin.users.roles.admin, link: dict.admin.invite,
      }} />
    </main>
  );
}
