import { notFound } from "next/navigation";
import { isLocale } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import { requireUser } from "@/server/guards";
import { safeRedirect } from "@/lib/auth-forms";
import { ChangePasswordForm } from "@/components/change-password-form";
import { SignOutButton } from "@/components/sign-out-button";

export default async function ChangePasswordPage({ params, searchParams }: PageProps<"/[lang]/change-password">) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  await requireUser({ locale: lang, allowMustChangePassword: true });
  const sp = await searchParams;
  const raw = Array.isArray(sp.next) ? sp.next[0] : sp.next;
  const target = safeRedirect(raw, lang);

  const dict = await getDictionary(lang);
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 p-6">
      <ChangePasswordForm labels={dict.auth.changePassword} target={target} />
      <SignOutButton label={dict.auth.signOut} lang={lang} />
    </main>
  );
}
