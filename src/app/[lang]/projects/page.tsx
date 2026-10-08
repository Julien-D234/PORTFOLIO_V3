import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { isLocale, locales } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import { getDb } from "@/server/db";
import { listPublishedProjects } from "@/server/projects/public";
import { Deck } from "@/components/projects/deck";
import { fmt } from "@/lib/format";

// Page publique (visiteur = connecté) : aucune garde, seuls les projets publiés sont lus.
export async function generateMetadata({ params }: PageProps<"/[lang]/projects">): Promise<Metadata> {
  const { lang } = await params;
  if (!isLocale(lang)) return {};
  const d = (await getDictionary(lang)).projects.meta;
  return { title: d.title, description: d.description };
}

const GRADIENTS = [
  "bg-linear-to-br from-[#1d2440] via-[#2b1d40] to-[#102a33]",
  "bg-linear-to-br from-[#24401d] via-[#102a33] to-[#1d2440]",
  "bg-linear-to-br from-[#40251d] via-[#2b1d40] to-[#10202a]",
];

export default async function ProjectsPage({ params }: PageProps<"/[lang]/projects">) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  const dict = await getDictionary(lang);
  const t = dict.projects;
  const projects = await listPublishedProjects(getDb(), lang);
  const other = locales.find((l) => l !== lang) ?? lang;
  const total = projects.length + 1;
  const labels = [t.heroDot, ...projects.map((p, i) => `${fmt(t.positionLabel, { n: i + 2, total })} : ${p.title}`)];

  return (
    <div className="relative min-h-dvh bg-[#0a0a0b] text-[#ededee]">
      <header className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-center justify-between bg-linear-to-b from-black/70 to-transparent px-4 py-3.5 text-sm text-white/85 sm:px-10">
        <Link href={`/${lang}`} className="pointer-events-auto hover:underline">{t.home}</Link>
        <Link
          href={`/${other}/projects`}
          hrefLang={other}
          lang={other}
          aria-label={t.otherLangLabel}
          className="pointer-events-auto hover:underline"
        >
          {t.otherLang}
        </Link>
      </header>

      <Deck count={total} labels={labels} navLabel={t.title}>
        <section
          data-slide={0}
          className="relative grid h-dvh snap-start place-items-center bg-[radial-gradient(circle_at_50%_40%,#1a1f35,#0a0a0b_70%)] px-6 text-center"
        >
          <div>
            <p className="text-xs tracking-[0.3em] text-[#8b8b93] uppercase">{t.eyebrow}</p>
            <h1 className="my-1.5 text-[clamp(44px,12vw,140px)] leading-none font-bold">{t.title}</h1>
            <p className="mt-2 text-[#8b8b93]">{projects.length ? t.subtitle : t.empty}</p>
          </div>
          {projects.length > 0 && (
            <p aria-hidden className="absolute inset-x-0 bottom-5 text-center text-sm text-[#8b8b93]">
              {t.scrollHint}
            </p>
          )}
        </section>

        {projects.map((p, i) => (
          <section
            key={p.slug}
            data-slide={i + 1}
            aria-labelledby={`p-${p.slug}`}
            className={`relative flex h-dvh snap-start items-end overflow-hidden ${GRADIENTS[i % GRADIENTS.length]}`}
          >
            {p.coverImageId && (
              // eslint-disable-next-line @next/next/no-img-element -- image déjà recompressée par le serveur
              <img
                src={`/media/${p.coverImageId}`}
                alt={p.coverAlt}
                loading={i === 0 ? "eager" : "lazy"}
                decoding="async"
                className="absolute inset-0 size-full object-cover"
              />
            )}
            <div aria-hidden className="absolute inset-0 bg-linear-to-t from-black/85 via-black/35 to-black/10" />
            <div className="relative max-w-[min(100%,760px)] p-[clamp(20px,5vw,72px)] pb-[clamp(40px,9vh,110px)]">
              {p.tags.length > 0 && (
                <ul className="mb-2 flex flex-wrap gap-1.5">
                  {p.tags.map((tg) => (
                    <li key={tg} className="rounded-full border border-white/30 px-2.5 py-px text-xs text-white/80">
                      {tg}
                    </li>
                  ))}
                </ul>
              )}
              <h2 id={`p-${p.slug}`} className="my-3 text-[clamp(30px,6vw,64px)] leading-[1.05] font-bold text-white">
                {p.title}
              </h2>
              <p className="mb-5 text-[clamp(15px,2vw,20px)] text-[#d0d0d6] [@media(max-height:480px)]:hidden">
                {p.summary}
              </p>
              <Link
                href={`/${lang}/projects/${p.slug}`}
                className="inline-block rounded-lg bg-[#6d8cff] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#8aa2ff] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
              >
                {t.view}
              </Link>
            </div>
          </section>
        ))}
      </Deck>
    </div>
  );
}
