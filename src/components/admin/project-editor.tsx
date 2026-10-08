"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { LIMITS } from "@/lib/project-schema";
import { fmt } from "@/lib/format";
import type { Dictionary } from "@/i18n/dictionaries";

export type EditorLabels = Dictionary["admin"]["projects"]["editor"];
export interface EditorTranslation { title: string; summary: string; description: string; coverAlt: string }
export interface EditorGalleryItem { fileId: string; altFr: string; altEn: string; captionFr: string; captionEn: string }
export interface EditorDoc {
  slug: string;
  position: number;
  repoUrl: string;
  liveUrl: string;
  startedAt: string;
  coverImageId: string | null;
  translations: { fr: EditorTranslation; en: EditorTranslation };
  tags: string[];
  gallery: EditorGalleryItem[];
}
type Status = "draft" | "published";
type ErrKey = keyof EditorLabels["errors"];

const API_ERRORS: Record<string, ErrKey> = {
  VALIDATION: "validation", SLUG_TAKEN: "slugTaken", MEDIA_MISSING: "mediaMissing", NOT_PUBLISHABLE: "notPublishable",
  SLUG_MISMATCH: "slugMismatch", NOT_FOUND: "notFound", RATE_LIMITED: "rateLimited", TOO_LARGE: "tooLarge",
  UNSUPPORTED_TYPE: "unsupportedType", INVALID_IMAGE: "invalidImage", BAD_DIMENSIONS: "badDimensions", EMPTY: "invalidImage",
};
async function apiError(res: Response): Promise<ErrKey> {
  const data = (await res.json().catch(() => null)) as { error?: string } | null;
  if (data?.error && API_ERRORS[data.error]) return API_ERRORS[data.error];
  return res.status === 401 ? "unauthenticated" : res.status === 403 ? "forbidden" : res.status === 429 ? "rateLimited" : "network";
}
const post = (url: string, body?: unknown) =>
  fetch(url, { method: "POST", headers: { "content-type": "application/json" }, credentials: "same-origin", body: JSON.stringify(body ?? {}) });

const input = "w-full rounded border border-neutral-400 bg-transparent px-2 py-2 text-sm";
const btn = "rounded border border-neutral-400 px-3 py-2 text-sm disabled:opacity-60";
const danger = "rounded border border-red-600 px-3 py-2 text-sm text-red-600 disabled:opacity-60";
const box = "flex flex-col gap-3 rounded border border-neutral-400 p-4";

export function ProjectEditor({
  lang, projectId, status: initialStatus, initial, suggestions, labels: l, statusLabels,
}: {
  lang: string; projectId: string; status: Status; initial: EditorDoc; suggestions: string[];
  labels: EditorLabels; statusLabels: Record<Status, string>;
}) {
  const router = useRouter();
  const [doc, setDoc] = useState<EditorDoc>(initial);
  const [saved, setSaved] = useState<string>(() => JSON.stringify(initial));
  const [status, setStatus] = useState<Status>(initialStatus);
  const [tab, setTab] = useState<"fr" | "en">("fr");
  const [busy, setBusy] = useState<null | "save" | "publish" | "upload" | "delete">(null);
  const [error, setError] = useState<ErrKey | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [tagDraft, setTagDraft] = useState("");
  const [typedSlug, setTypedSlug] = useState("");
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const dirty = useMemo(() => JSON.stringify(doc) !== saved, [doc, saved]);
  const dirtyRef = useRef(false);
  useEffect(() => { dirtyRef.current = dirty; }, [dirty]);

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => { if (dirtyRef.current) e.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);

  const set = <K extends keyof EditorDoc>(k: K, v: EditorDoc[K]) => { setDoc((d) => ({ ...d, [k]: v })); setInfo(null); };
  const setTr = (lng: "fr" | "en", k: keyof EditorTranslation, v: string) => {
    setDoc((d) => ({ ...d, translations: { ...d.translations, [lng]: { ...d.translations[lng], [k]: v } } }));
    setInfo(null);
  };
  const setGal = (i: number, patch: Partial<EditorGalleryItem>) =>
    set("gallery", doc.gallery.map((g, j) => (j === i ? { ...g, ...patch } : g)));
  const move = (from: number, to: number) => {
    if (to < 0 || to >= doc.gallery.length || from === to) return;
    const next = [...doc.gallery];
    next.splice(to, 0, next.splice(from, 1)[0]);
    set("gallery", next);
  };

  function payload() {
    return { ...doc, position: Number(doc.position) };
  }

  async function save(): Promise<boolean> {
    setBusy("save"); setError(null); setInfo(null);
    try {
      const res = await post(`/api/admin/projects/${encodeURIComponent(projectId)}`, payload());
      if (!res.ok) { setError(await apiError(res)); return false; }
      setSaved(JSON.stringify(doc)); setInfo(l.saved);
      router.refresh();
      return true;
    } catch { setError("network"); return false; }
    finally { setBusy(null); }
  }

  async function togglePublish() {
    const publishing = status !== "published";
    if (dirty && !(await save())) return;
    setBusy("publish"); setError(null); setInfo(null);
    try {
      const res = await post(`/api/admin/projects/${encodeURIComponent(projectId)}/${publishing ? "publish" : "unpublish"}`);
      if (!res.ok) { setError(await apiError(res)); return; }
      setStatus(publishing ? "published" : "draft");
      setInfo(publishing ? l.published : l.unpublished);
      router.refresh();
    } catch { setError("network"); }
    finally { setBusy(null); }
  }

  async function upload(file: File): Promise<string | null> {
    try {
      const res = await fetch("/api/admin/media", {
        method: "POST", credentials: "same-origin", headers: { "content-type": file.type || "application/octet-stream" }, body: file,
      });
      if (!res.ok) { setError(await apiError(res)); return null; }
      return ((await res.json()) as { id: string }).id;
    } catch { setError("network"); return null; }
  }
  async function onCover(files: FileList | null) {
    const f = files?.[0]; if (!f) return;
    setBusy("upload"); setError(null);
    const id = await upload(f);
    setBusy(null);
    if (id) set("coverImageId", id);
  }
  async function onGallery(files: FileList | null) {
    if (!files?.length) return;
    setBusy("upload"); setError(null);
    const added: EditorGalleryItem[] = [];
    for (const f of Array.from(files).slice(0, LIMITS.gallery - doc.gallery.length)) {
      const id = await upload(f);
      if (!id) break;
      added.push({ fileId: id, altFr: "", altEn: "", captionFr: "", captionEn: "" });
    }
    setBusy(null);
    if (added.length) setDoc((d) => ({ ...d, gallery: [...d.gallery, ...added] }));
  }

  function addTag() {
    const name = tagDraft.trim().slice(0, LIMITS.tag);
    if (!name || doc.tags.length >= LIMITS.tags) return;
    if (!doc.tags.some((t) => t.toLowerCase() === name.toLowerCase())) set("tags", [...doc.tags, name]);
    setTagDraft("");
  }

  async function remove() {
    if (!window.confirm(l.danger.confirm)) return;
    setBusy("delete"); setError(null);
    try {
      const res = await post(`/api/admin/projects/${encodeURIComponent(projectId)}/delete`, { slug: typedSlug });
      if (!res.ok) { setError(await apiError(res)); setBusy(null); return; }
      setSaved(JSON.stringify(doc)); // plus d'avertissement de quitter
      dirtyRef.current = false;
      router.replace(`/${lang}/admin/projects`);
    } catch { setError("network"); setBusy(null); }
  }

  const tr = doc.translations[tab];
  const imgSrc = (id: string, thumb = true) => `/media/${id}${thumb ? "?v=thumb" : ""}`;
  const disabled = busy !== null;
  const langName = (c: "fr" | "en") => (c === "fr" ? l.fields.langFr : l.fields.langEn);

  return (
    <main className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-3">
        <Link href={`/${lang}/admin/projects`} className="text-sm underline">{l.back}</Link>
        <h1 className="text-2xl font-semibold">{doc.translations.fr.title || doc.slug}</h1>
        <span className="rounded border border-neutral-400 px-2 py-0.5 text-xs">{statusLabels[status]}</span>
        {status === "published" && (
          <Link href={`/${lang}/projects/${doc.slug}`} className="text-sm underline" target="_blank">{l.viewPublic}</Link>
        )}
        <span className="ml-auto flex flex-wrap items-center gap-2">
          <button type="button" disabled={disabled || !dirty} onClick={save} className={btn}>{busy === "save" ? l.saving : l.save}</button>
          <button type="button" disabled={disabled} onClick={togglePublish} className={btn}>
            {busy === "publish" ? l.publishing : status === "published" ? l.unpublish : l.publish}
          </button>
        </span>
      </div>
      <div aria-live="polite" className="min-h-5 text-sm">
        {error && <p role="alert" className="text-red-600">{l.errors[error]}</p>}
        {!error && busy === "upload" && <p>{l.upload.uploading}</p>}
        {!error && busy !== "upload" && dirty && <p>{l.unsaved}</p>}
        {!error && !dirty && info && <p>{info}</p>}
        {status !== "published" && <p className="opacity-70">{l.publishHint}</p>}
      </div>

      <section className={box} aria-labelledby="sec-general">
        <h2 id="sec-general" className="text-lg font-semibold">{l.sections.general}</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm">{l.fields.slug}
            <input value={doc.slug} maxLength={LIMITS.slug} onChange={(e) => set("slug", e.target.value.toLowerCase())} className={input} />
          </label>
          <label className="flex flex-col gap-1 text-sm">{l.fields.position}
            <input type="number" min={0} max={LIMITS.maxPosition} step={1} value={doc.position}
              onChange={(e) => set("position", e.target.value === "" ? 0 : Math.trunc(Number(e.target.value)))} className={input} />
            <span className="text-xs opacity-70">{l.fields.positionHint}</span>
          </label>
          <label className="flex flex-col gap-1 text-sm">{l.fields.startedAt}
            <input type="date" value={doc.startedAt} onChange={(e) => set("startedAt", e.target.value)} className={input} />
          </label>
          <span />
          <label className="flex flex-col gap-1 text-sm">{l.fields.repoUrl}
            <input type="url" inputMode="url" placeholder="https://" value={doc.repoUrl} maxLength={LIMITS.url} onChange={(e) => set("repoUrl", e.target.value)} className={input} />
            <span className="text-xs opacity-70">{l.fields.urlHint}</span>
          </label>
          <label className="flex flex-col gap-1 text-sm">{l.fields.liveUrl}
            <input type="url" inputMode="url" placeholder="https://" value={doc.liveUrl} maxLength={LIMITS.url} onChange={(e) => set("liveUrl", e.target.value)} className={input} />
            <span className="text-xs opacity-70">{l.fields.urlHint}</span>
          </label>
        </div>
      </section>

      <section className={box} aria-labelledby="sec-content">
        <h2 id="sec-content" className="text-lg font-semibold">{l.sections.content}</h2>
        <div role="tablist" className="flex gap-2">
          {(["fr", "en"] as const).map((c) => (
            <button key={c} type="button" role="tab" aria-selected={tab === c} onClick={() => setTab(c)}
              className={`rounded border px-3 py-1 text-sm ${tab === c ? "border-current font-semibold" : "border-neutral-400"}`}>{langName(c)}</button>
          ))}
        </div>
        {tab === "en" && <p className="text-xs opacity-70">{l.fields.enFallback}</p>}
        <label className="flex flex-col gap-1 text-sm">{l.fields.title}
          <input value={tr.title} maxLength={LIMITS.title} lang={tab} onChange={(e) => setTr(tab, "title", e.target.value)} className={input} />
        </label>
        <label className="flex flex-col gap-1 text-sm">{l.fields.summary}
          <textarea rows={3} value={tr.summary} maxLength={LIMITS.summary} lang={tab} onChange={(e) => setTr(tab, "summary", e.target.value.replace(/\n/g, " "))} className={input} />
          <span className="text-xs opacity-70">{fmt(l.fields.summaryCount, { n: tr.summary.length, max: LIMITS.summary })}</span>
        </label>
        <label className="flex flex-col gap-1 text-sm">{l.fields.description}
          <textarea rows={10} value={tr.description} maxLength={LIMITS.description} lang={tab} onChange={(e) => setTr(tab, "description", e.target.value)} className={input} />
          <span className="text-xs opacity-70">{l.fields.descriptionHint}</span>
        </label>
        <label className="flex flex-col gap-1 text-sm">{l.fields.coverAlt}
          <input value={tr.coverAlt} maxLength={LIMITS.alt} lang={tab} onChange={(e) => setTr(tab, "coverAlt", e.target.value)} className={input} />
        </label>
      </section>

      <section className={box} aria-labelledby="sec-tags">
        <h2 id="sec-tags" className="text-lg font-semibold">{l.sections.tags}</h2>
        {doc.tags.length === 0 ? <p className="text-sm opacity-70">{l.tags.none}</p> : (
          <ul className="flex flex-wrap gap-2">
            {doc.tags.map((t) => (
              <li key={t} className="flex items-center gap-1 rounded-full border border-neutral-400 px-2.5 py-0.5 text-sm">
                {t}
                <button type="button" aria-label={fmt(l.tags.remove, { name: t })} onClick={() => set("tags", doc.tags.filter((x) => x !== t))}>×</button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex gap-2">
          <input list="tag-suggestions" value={tagDraft} maxLength={LIMITS.tag} placeholder={l.tags.placeholder} aria-label={l.tags.placeholder}
            onChange={(e) => setTagDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTag(); } }} className={input} />
          <datalist id="tag-suggestions">{suggestions.map((s) => <option key={s} value={s} />)}</datalist>
          <button type="button" onClick={addTag} className={btn}>{l.tags.add}</button>
        </div>
      </section>

      <section className={box} aria-labelledby="sec-cover">
        <h2 id="sec-cover" className="text-lg font-semibold">{l.sections.cover}</h2>
        <p className="text-xs opacity-70">{l.cover.hint}</p>
        {doc.coverImageId ? (
          // eslint-disable-next-line @next/next/no-img-element -- aperçu admin
          <img src={imgSrc(doc.coverImageId)} alt={l.cover.alt} className="aspect-[21/9] w-full max-w-xl rounded object-cover" />
        ) : <p className="text-sm opacity-70">{l.cover.none}</p>}
        <div className="flex flex-wrap gap-2">
          <label className={`${btn} cursor-pointer`}>
            {doc.coverImageId ? l.cover.replace : l.cover.choose}
            <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" disabled={disabled}
              onChange={(e) => { void onCover(e.target.files); e.target.value = ""; }} />
          </label>
          {doc.coverImageId && <button type="button" disabled={disabled} className={btn} onClick={() => set("coverImageId", null)}>{l.cover.remove}</button>}
        </div>
      </section>

      <section className={box} aria-labelledby="sec-gallery">
        <h2 id="sec-gallery" className="text-lg font-semibold">{l.sections.gallery}</h2>
        <p className="text-xs opacity-70">{l.gallery.hint}</p>
        {doc.gallery.length === 0 ? <p className="text-sm opacity-70">{l.gallery.empty}</p> : (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {doc.gallery.map((g, i) => (
              <li key={g.fileId} draggable
                onDragStart={() => setDragFrom(i)} onDragEnd={() => setDragFrom(null)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => { e.preventDefault(); if (dragFrom !== null) move(dragFrom, i); setDragFrom(null); }}
                className={`flex cursor-grab flex-col gap-2 rounded border border-neutral-400 p-2 ${dragFrom === i ? "opacity-50" : ""}`}>
                {/* eslint-disable-next-line @next/next/no-img-element -- aperçu admin */}
                <img src={imgSrc(g.fileId)} alt={g.altFr || fmt(l.gallery.imageN, { n: i + 1 })} draggable={false} className="aspect-[4/3] w-full rounded object-cover" />
                {(["fr", "en"] as const).map((c) => {
                  const alt = c === "fr" ? "altFr" : "altEn";
                  const cap = c === "fr" ? "captionFr" : "captionEn";
                  return (
                    <div key={c} className="flex flex-col gap-1">
                      <input value={g[alt]} maxLength={LIMITS.alt} lang={c} placeholder={fmt(l.gallery.alt, { lang: c.toUpperCase() })}
                        aria-label={`${fmt(l.gallery.imageN, { n: i + 1 })} — ${fmt(l.gallery.alt, { lang: c.toUpperCase() })}`}
                        onChange={(e) => setGal(i, { [alt]: e.target.value })} className={`${input} !py-1 text-xs`} />
                      <input value={g[cap]} maxLength={LIMITS.caption} lang={c} placeholder={fmt(l.gallery.caption, { lang: c.toUpperCase() })}
                        aria-label={`${fmt(l.gallery.imageN, { n: i + 1 })} — ${fmt(l.gallery.caption, { lang: c.toUpperCase() })}`}
                        onChange={(e) => setGal(i, { [cap]: e.target.value })} className={`${input} !py-1 text-xs`} />
                    </div>
                  );
                })}
                <div className="flex justify-between text-xs">
                  <span className="flex gap-1">
                    <button type="button" disabled={i === 0} aria-label={l.gallery.moveLeft} onClick={() => move(i, i - 1)} className="rounded border border-neutral-400 px-2 py-1 disabled:opacity-40">←</button>
                    <button type="button" disabled={i === doc.gallery.length - 1} aria-label={l.gallery.moveRight} onClick={() => move(i, i + 1)} className="rounded border border-neutral-400 px-2 py-1 disabled:opacity-40">→</button>
                  </span>
                  <button type="button" onClick={() => set("gallery", doc.gallery.filter((_, j) => j !== i))} className="underline">{l.gallery.remove}</button>
                </div>
              </li>
            ))}
          </ul>
        )}
        {doc.gallery.length < LIMITS.gallery && (
          <label className={`${btn} cursor-pointer self-start`}>
            {l.gallery.add}
            <input type="file" multiple accept="image/jpeg,image/png,image/webp" className="sr-only" disabled={disabled}
              onChange={(e) => { void onGallery(e.target.files); e.target.value = ""; }} />
          </label>
        )}
      </section>

      <section className={`${box} border-red-600`} aria-labelledby="sec-danger">
        <h2 id="sec-danger" className="text-lg font-semibold text-red-600">{l.sections.danger}</h2>
        <p className="text-sm">{l.danger.hint} <code className="break-all">{initial.slug}</code></p>
        <div className="flex flex-wrap gap-2">
          <input value={typedSlug} onChange={(e) => setTypedSlug(e.target.value)} placeholder={l.danger.placeholder} aria-label={l.danger.placeholder}
            autoComplete="off" className={`${input} max-w-xs`} />
          <button type="button" disabled={disabled || typedSlug !== initial.slug} onClick={remove} className={danger}>{l.danger.submit}</button>
        </div>
      </section>
    </main>
  );
}
