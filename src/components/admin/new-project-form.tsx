"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { LIMITS, SLUG_RE } from "@/lib/project-schema";
import { ui } from "./ui";

export interface NewProjectLabels {
  slug: string; hint: string; submit: string; submitting: string;
  errors: Record<"validation" | "slugTaken" | "rateLimited" | "forbidden" | "unauthenticated" | "network", string>;
}

export function NewProjectForm({ lang, labels }: { lang: string; labels: NewProjectLabels }) {
  const router = useRouter();
  const [slug, setSlug] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<keyof NewProjectLabels["errors"] | null>(null);
  const valid = SLUG_RE.test(slug) && slug.length <= LIMITS.slug;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) { setError("validation"); return; }
    setPending(true); setError(null);
    try {
      const res = await fetch("/api/admin/projects", {
        method: "POST", headers: { "content-type": "application/json" }, credentials: "same-origin",
        body: JSON.stringify({ slug }),
      });
      const data = (await res.json().catch(() => null)) as { id?: string; error?: string } | null;
      if (res.ok && data?.id) { router.push(`/${lang}/admin/projects/${encodeURIComponent(data.id)}`); return; }
      setError(
        data?.error === "SLUG_TAKEN" ? "slugTaken" : data?.error === "VALIDATION" ? "validation"
        : res.status === 401 ? "unauthenticated" : res.status === 403 ? "forbidden" : res.status === 429 ? "rateLimited" : "network",
      );
    } catch { setError("network"); }
    setPending(false);
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <label className={ui.label}>{labels.slug}
        <input value={slug} maxLength={LIMITS.slug} autoComplete="off" onChange={(e) => setSlug(e.target.value.toLowerCase())}
          className={ui.field} />
        <span className="text-xs">{labels.hint}</span>
      </label>
      <button type="submit" disabled={pending || !valid} className={`${ui.btn} self-start`}>
        {pending ? labels.submitting : labels.submit}
      </button>
      <div aria-live="polite">{error && <p role="alert" className="text-sm text-[#ef5b5b]">{labels.errors[error]}</p>}</div>
    </form>
  );
}
