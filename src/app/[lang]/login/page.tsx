import { notFound, redirect } from "next/navigation";
import { isLocale } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import { getSessionUser } from "@/server/guards";
import { safeRedirect } from "@/lib/auth-forms";
import { LoginForm } from "@/components/login-form";

export default async function LoginPage({ params, searchParams }: PageProps<"/[lang]/login">) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  const sp = await searchParams;
  const raw = Array.isArray(sp.next) ? sp.next[0] : sp.next;
  const next = safeRedirect(raw, lang);

  const user = await getSessionUser();
  if (user && !user.banned) {
    redirect(user.mustChangePassword ? `/${lang}/change-password?next=${encodeURIComponent(next)}` : next);
  }

  const dict = await getDictionary(lang);
  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <LoginForm labels={dict.auth.login} lang={lang} next={next} />
    </main>
  );
}
