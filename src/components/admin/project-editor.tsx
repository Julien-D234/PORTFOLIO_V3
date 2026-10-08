"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { LIMITS } from "@/lib/project-schema";
import { fmt } from "@/lib/format";
import type { Dictionary } from "@/i18n/dictionaries";
import { ui } from "./ui";

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
  const [showDelete, setShowDelete] = useState(false);
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
  const accept = "image/jpeg,image/png,image/webp";
  const dropFiles = (e: React.DragEvent, handler: (f: FileList | null) => void) => {
    if (e.dataTransfer.files.length === 0) return; // réordonnancement interne : laissé à la galerie
    e.preventDefault();
    handler(e.dataTransfer.files);
  };

  return (
    <main className="flex flex-col gap-5 pb-24">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href={`/${lang}/admin/projects`} className="text-sm text-[#8b8b93] hover:text-white hover:underline">{l.back}</Link>
          <h1 className="mt-1.5 text-3xl font-bold">{fmt(l.editTitle, { title: doc.translations.fr.title || doc.slug })}</h1>
        </div>
        <div className="flex items-center gap-3">
          <span className={status === "published" ? ui.badgePublished : ui.badgeDraft}>{statusLabels[status]}</span>
          {status === "published" && (
            <Link href={`/${lang}/projects/${doc.slug}`} className="text-sm text-[#6d8cff] hover:underline" target="_blank">{l.viewPublic}</Link>
          )}
        </div>
      </div>
      <div aria-live="polite" className="min-h-5 text-sm">
        {error && <p role="alert" className="text-[#ef5b5b]">{l.errors[error]}</p>}
        {!error && busy === "upload" && <p>{l.upload.uploading}</p>}
        {!error && busy !== "upload" && dirty && <p className="text-[#e5a93c]">{l.unsaved}</p>}
        {!error && !dirty && info && <p className="text-[#3ecf8e]">{info}</p>}
        {status !== "published" && !error && !dirty && !info && <p className={ui.muted}>{l.publishHint}</p>}
      </div>

      <section className={ui.box} aria-labelledby="sec-content">
        <h2 id="sec-content" className={ui.boxTitle}>{l.sections.content}</h2>
        <div role="tablist" className="flex gap-1.5">
          {(["fr", "en"] as const).map((c) => (
            <button key={c} type="button" role="tab" aria-selected={tab === c} onClick={() => setTab(c)}
              className={`rounded-md border px-2.5 py-0.5 text-[13px] ${tab === c ? "border-[#6d8cff] text-white" : "border-[#26262a] text-[#8b8b93]"}`}>{langName(c)}</button>
          ))}
        </div>
        {tab === "en" && <p className="text-xs text-[#8b8b93]">{l.fields.enFallback}</p>}
        <label className={ui.label}>{l.fields.title}
          <input value={tr.title} maxLength={LIMITS.title} lang={tab} onChange={(e) => setTr(tab, "title", e.target.value)} className={ui.field} />
        </label>
        <label className={ui.label}>{l.fields.summary}
          <textarea rows={3} value={tr.summary} maxLength={LIMITS.summary} lang={tab} onChange={(e) => setTr(tab, "summary", e.target.value.replace(/\n/g, " "))} className={ui.field} />
          <span className="text-xs">{l.fields.summaryHint} · {fmt(l.fields.summaryCount, { n: tr.summary.length, max: LIMITS.summary })}</span>
        </label>
        <label className={ui.label}>{l.fields.description}
          <textarea rows={10} value={tr.description} maxLength={LIMITS.description} lang={tab} onChange={(e) => setTr(tab, "description", e.target.value)} className={ui.field} />
          <span className="text-xs">{l.fields.descriptionHint}</span>
        </label>
      </section>

      <section className={ui.box} aria-labelledby="sec-general">
        <h2 id="sec-general" className={ui.boxTitle}>{l.sections.general}</h2>
        <div className="grid gap-3.5 sm:grid-cols-2">
          <label className={ui.label}>{l.fields.slug}
            <input value={doc.slug} maxLength={LIMITS.slug} onChange={(e) => set("slug", e.target.value.toLowerCase())} className={ui.field} />
          </label>
          <label className={ui.label}>{l.fields.startedAt}
            <input type="date" value={doc.startedAt} onChange={(e) => set("startedAt", e.target.value)} className={ui.field} />
          </label>
          <label className={ui.label}>{l.fields.repoUrl}
            <input type="url" inputMode="url" placeholder="https://" value={doc.repoUrl} maxLength={LIMITS.url} onChange={(e) => set("repoUrl", e.target.value)} className={ui.field} />
            <span className="text-xs">{l.fields.urlHint}</span>
          </label>
          <label className={ui.label}>{l.fields.liveUrl}
            <input type="url" inputMode="url" placeholder="https://" value={doc.liveUrl} maxLength={LIMITS.url} onChange={(e) => set("liveUrl", e.target.value)} className={ui.field} />
            <span className="text-xs">{l.fields.urlHint}</span>
          </label>
        </div>
        <div className={ui.label}>
          <label htmlFor="tag-input">{l.fields.tagsLabel}</label>
          <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-[#26262a] bg-[#141416] p-2">
            {doc.tags.map((t) => (
              <span key={t} className={ui.tagActive}>
                {t}
                <button type="button" aria-label={fmt(l.tags.remove, { name: t })} className="ml-0.5 text-[#8b8b93] hover:text-white"
                  onClick={() => set("tags", doc.tags.filter((x) => x !== t))}>×</button>
              </span>
            ))}
            <input id="tag-input" list="tag-suggestions" value={tagDraft} maxLength={LIMITS.tag} placeholder={l.tags.placeholder}
              onChange={(e) => setTagDraft(e.target.value)} onBlur={addTag}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); addTag(); } }}
              className="min-w-36 flex-1 border-0 bg-transparent px-1.5 py-0.5 text-sm text-[#ededee] outline-none placeholder:text-[#8b8b93]" />
            <datalist id="tag-suggestions">{suggestions.map((x) => <option key={x} value={x} />)}</datalist>
          </div>
        </div>
        <label className={ui.label}>{l.fields.position}
          <input type="number" min={0} max={LIMITS.maxPosition} step={1} value={doc.position}
            onChange={(e) => set("position", e.target.value === "" ? 0 : Math.trunc(Number(e.target.value)))} className={`${ui.field} max-w-[120px]`} />
          <span className="text-xs">{l.fields.positionHint}</span>
        </label>
      </section>

      <section className={ui.box} aria-labelledby="sec-cover">
        <h2 id="sec-cover" className={ui.boxTitle}>{l.sections.cover}</h2>
        <p className="text-xs text-[#8b8b93]">{l.cover.hint}</p>
        <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
          {doc.coverImageId ? (
            <div className="flex flex-col gap-1.5 rounded-lg border border-[#26262a] bg-[#0f0f11] p-1.5 sm:col-span-2">
              {/* eslint-disable-next-line @next/next/no-img-element -- aperçu admin */}
              <img src={imgSrc(doc.coverImageId)} alt={l.cover.alt} className="aspect-[21/9] w-full rounded-md object-cover" />
              <div className="flex items-center justify-between text-xs text-[#8b8b93]">
                <label className="cursor-pointer hover:text-white">
                  {l.cover.replace}
                  <input type="file" accept={accept} className="sr-only" disabled={disabled}
                    onChange={(e) => { void onCover(e.target.files); e.target.value = ""; }} />
                </label>
                <button type="button" disabled={disabled} className="hover:text-white" onClick={() => set("coverImageId", null)}>{l.cover.remove}</button>
              </div>
              {(["fr", "en"] as const).map((c) => (
                <input key={c} value={doc.translations[c].coverAlt} maxLength={LIMITS.alt} lang={c}
                  placeholder={fmt(l.cover.altField, { lang: c.toUpperCase() })} aria-label={fmt(l.cover.altField, { lang: c.toUpperCase() })}
                  onChange={(e) => setTr(c, "coverAlt", e.target.value)} className={`${ui.field} !py-1 text-xs`} />
              ))}
            </div>
          ) : (
            <label className={`${ui.drop} aspect-[21/9] sm:col-span-2`}
              onDragOver={(e) => e.preventDefault()} onDrop={(e) => dropFiles(e, onCover)}>
              <span>{l.cover.none}<br />{l.cover.drop}</span>
              <input type="file" accept={accept} className="sr-only" disabled={disabled}
                onChange={(e) => { void onCover(e.target.files); e.target.value = ""; }} />
            </label>
          )}
        </div>
      </section>

      <section className={ui.box} aria-labelledby="sec-gallery">
        <h2 id="sec-gallery" className={ui.boxTitle}>{l.sections.gallery}</h2>
        <p className="text-xs text-[#8b8b93]">{l.gallery.hint}</p>
        <ul className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
          {doc.gallery.map((g, i) => (
            <li key={g.fileId} draggable
              onDragStart={() => setDragFrom(i)} onDragEnd={() => setDragFrom(null)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); if (dragFrom !== null) move(dragFrom, i); setDragFrom(null); }}
              className={`flex cursor-grab flex-col gap-1.5 rounded-lg border border-[#26262a] bg-[#0f0f11] p-1.5 ${dragFrom === i ? "opacity-50" : ""}`}>
              {/* eslint-disable-next-line @next/next/no-img-element -- aperçu admin */}
              <img src={imgSrc(g.fileId)} alt={g.altFr || fmt(l.gallery.imageN, { n: i + 1 })} draggable={false} className="aspect-[4/3] w-full rounded-md object-cover" />
              {(["fr", "en"] as const).map((c) => {
                const cap = c === "fr" ? "captionFr" : "captionEn";
                return (
                  <input key={c} value={g[cap]} maxLength={LIMITS.caption} lang={c} placeholder={fmt(l.gallery.caption, { lang: c.toUpperCase() })}
                    aria-label={`${fmt(l.gallery.imageN, { n: i + 1 })} — ${fmt(l.gallery.caption, { lang: c.toUpperCase() })}`}
                    onChange={(e) => setGal(i, { [cap]: e.target.value })} className={`${ui.field} !py-1 text-xs`} />
                );
              })}
              <details className="text-xs text-[#8b8b93]">
                <summary className="cursor-pointer">{l.gallery.altSummary}</summary>
                <div className="mt-1.5 grid gap-1.5">
                  {(["fr", "en"] as const).map((c) => {
                    const alt = c === "fr" ? "altFr" : "altEn";
                    return (
                      <input key={c} value={g[alt]} maxLength={LIMITS.alt} lang={c} placeholder={fmt(l.gallery.alt, { lang: c.toUpperCase() })}
                        aria-label={`${fmt(l.gallery.imageN, { n: i + 1 })} — ${fmt(l.gallery.alt, { lang: c.toUpperCase() })}`}
                        onChange={(e) => setGal(i, { [alt]: e.target.value })} className={`${ui.field} !py-1 text-xs`} />
                    );
                  })}
                </div>
              </details>
              <div className="flex items-center justify-between text-xs text-[#8b8b93]">
                <span className="flex items-center gap-1">
                  <span aria-hidden>{l.gallery.move}</span>
                  <button type="button" disabled={i === 0} aria-label={l.gallery.moveLeft} onClick={() => move(i, i - 1)} className="rounded border border-[#26262a] px-1.5 py-0.5 hover:text-white disabled:opacity-40">←</button>
                  <button type="button" disabled={i === doc.gallery.length - 1} aria-label={l.gallery.moveRight} onClick={() => move(i, i + 1)} className="rounded border border-[#26262a] px-1.5 py-0.5 hover:text-white disabled:opacity-40">→</button>
                </span>
                <button type="button" onClick={() => set("gallery", doc.gallery.filter((_, j) => j !== i))} className="hover:text-[#ef5b5b]">{l.gallery.remove}</button>
              </div>
            </li>
          ))}
          {doc.gallery.length < LIMITS.gallery && (
            <li className="contents">
              <label className={`${ui.drop} aspect-[4/3]`} onDragOver={(e) => e.preventDefault()} onDrop={(e) => dropFiles(e, onGallery)}>
                <span>{l.gallery.drop}</span>
                <input type="file" multiple accept={accept} className="sr-only" disabled={disabled}
                  onChange={(e) => { void onGallery(e.target.files); e.target.value = ""; }} />
              </label>
            </li>
          )}
        </ul>
        {doc.gallery.length === 0 && <p className="text-xs text-[#8b8b93]">{l.gallery.empty}</p>}
      </section>

      {showDelete && (
        <section className="grid gap-2.5 rounded-[10px] border border-[#ef5b5b] p-4" aria-labelledby="sec-danger">
          <h2 id="sec-danger" className="text-lg font-semibold text-[#ef5b5b]">{l.sections.danger}</h2>
          <p className="text-sm">{l.danger.hint} <code className="break-all">{initial.slug}</code></p>
          <div className="flex flex-wrap gap-2">
            <input value={typedSlug} onChange={(e) => setTypedSlug(e.target.value)} placeholder={l.danger.placeholder} aria-label={l.danger.placeholder}
              autoComplete="off" className={`${ui.field} max-w-xs`} />
            <button type="button" disabled={disabled || typedSlug !== initial.slug} onClick={remove} className={ui.btnDanger}>{l.danger.submit}</button>
            <button type="button" onClick={() => { setShowDelete(false); setTypedSlug(""); }} className={ui.btnSecondary}>{l.danger.cancel}</button>
          </div>
        </section>
      )}

      <div className="fixed inset-x-0 bottom-0 z-10 border-t border-[#26262a] bg-[#0a0a0b]/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-3 px-6 py-3">
          <button type="button" disabled={disabled} onClick={() => setShowDelete((v) => !v)} className={ui.btnDanger}>{l.danger.submit}</button>
          <div className="flex items-center gap-2">
            <button type="button" disabled={disabled} onClick={togglePublish} className={ui.btnSecondary}>
              {busy === "publish" ? l.publishing : status === "published" ? l.unpublish : l.publish}
            </button>
            <button type="button" disabled={disabled || !dirty} onClick={save} className={ui.btn}>{busy === "save" ? l.saving : l.save}</button>
          </div>
        </div>
      </div>
    </main>
  );
}
