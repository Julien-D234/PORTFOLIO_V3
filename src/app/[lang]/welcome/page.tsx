import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isLocale } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import { WelcomeForm } from "@/components/welcome-form";

export const metadata: Metadata = { robots: { index: false, follow: false } };

// Page publique : le jeton vit dans le fragment d'URL et n'est lu que côté navigateur.
export default async function WelcomePage({ params }: PageProps<"/[lang]/welcome">) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  const dict = await getDictionary(lang);
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 p-6">
      <WelcomeForm lang={lang} labels={dict.welcome} />
    </main>
  );
}
