import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { isLocale } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import { getDb } from "@/server/db";
import { getPublishedProject } from "@/server/projects/public";
import { fmt, fmtMonth, safeHttpsUrl } from "@/lib/format";

// Page publique : un brouillon ou un slug inconnu/piégé → 404 identique.
export async function generateMetadata({ params }: PageProps<"/[lang]/projects/[slug]">): Promise<Metadata> {
  const { lang, slug } = await params;
  if (!isLocale(lang)) return {};
  const p = await getPublishedProject(getDb(), slug, lang);
  return p ? { title: p.title, description: p.summary || undefined } : {};
}

export default async function ProjectPage({ params }: PageProps<"/[lang]/projects/[slug]">) {
  const { lang, slug } = await params;
  if (!isLocale(lang)) notFound();
  const p = await getPublishedProject(getDb(), slug, lang);
  if (!p) notFound();
  const t = (await getDictionary(lang)).projects;
  const d = t.detail;
  const started = fmtMonth(p.startedAt, lang);
  const repo = safeHttpsUrl(p.repoUrl);
  const live = safeHttpsUrl(p.liveUrl);
  const link = "text-[#6d8cff] underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#6d8cff]";

  return (
    <div className="min-h-dvh flex-1 bg-[#0a0a0b] text-[#ededee]">
      <main className="mx-auto w-full max-w-5xl px-5 py-6 sm:px-8">
        <nav className="mb-8 text-sm text-[#8b8b93]">
          <Link href={`/${lang}/projects`} className="hover:text-white hover:underline">{d.back}</Link>
        </nav>

        <h1 className="text-3xl font-bold sm:text-5xl">{p.title}</h1>
        {p.summary && <p className="mt-3 max-w-[70ch] text-lg text-[#b9b9c1]">{p.summary}</p>}

        <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-[#8b8b93]">
          {started && <span>{fmt(d.started, { date: started })}</span>}
          {repo && (
            <a href={repo} target="_blank" rel="noopener noreferrer" className={link}>
              {d.repo} <span className="sr-only">{d.externalHint}</span>
            </a>
          )}
          {live && (
            <a href={live} target="_blank" rel="noopener noreferrer" className={link}>
              {d.live} <span className="sr-only">{d.externalHint}</span>
            </a>
          )}
        </div>

        {p.tags.length > 0 && (
          <ul className="mt-4 flex flex-wrap gap-1.5">
            {p.tags.map((tg) => (
              <li key={tg} className="rounded-full border border-[#26262a] px-2.5 py-px text-xs text-[#8b8b93]">{tg}</li>
            ))}
          </ul>
        )}

        {/* Texte brut : rendu par React (échappé), retours à la ligne conservés. */}
        <div className="mt-8 max-w-[70ch] leading-relaxed whitespace-pre-line">
          {p.description || <span className="text-[#8b8b93]">{d.noDescription}</span>}
        </div>

        {p.gallery.length > 0 && (
          <section aria-labelledby="gallery" className="mt-12">
            <h2 id="gallery" className="mb-3 text-lg font-semibold">{d.gallery}</h2>
            <ul className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
              {p.gallery.map((g) => (
                <li key={g.fileId}>
                  <figure>
                    <a
                      href={`/media/${g.fileId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`${d.openImage}${g.alt ? ` : ${g.alt}` : ""}`}
                      className="block overflow-hidden rounded-[10px] border border-[#26262a] focus-visible:outline-2 focus-visible:outline-[#6d8cff]"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element -- miniature générée par le serveur */}
                      <img
                        src={`/media/${g.fileId}?v=thumb`}
                        alt={g.alt}
                        loading="lazy"
                        decoding="async"
                        className="aspect-[4/3] w-full object-cover"
                      />
                    </a>
                    {g.caption && <figcaption className="mt-1 text-xs text-[#8b8b93]">{g.caption}</figcaption>}
                  </figure>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
    </div>
  );
}
