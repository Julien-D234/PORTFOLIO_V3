"use client";

import { useState } from "react";
import { InviteLinkBox, type InviteLinkLabels } from "./invite-link-box";

export interface RegenLabels {
  button: string; confirm: string; pending: string; link: InviteLinkLabels;
  errors: { forbidden: string; rateLimited: string; network: string };
}

export function RegenerateInviteButton({ userId, lang, labels }: { userId: string; lang: string; labels: RegenLabels }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<keyof RegenLabels["errors"] | null>(null);
  const [result, setResult] = useState<{ link: string; expiresAt: string } | null>(null);

  async function run() {
    if (!window.confirm(labels.confirm)) return;
    setPending(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch(`/api/admin/users/${encodeURIComponent(userId)}/invitation`, {
        method: "POST", headers: { "content-type": "application/json" }, credentials: "same-origin", body: JSON.stringify({ lang }),
      });
      if (res.ok) setResult((await res.json()) as { link: string; expiresAt: string });
      else setError(res.status === 429 ? "rateLimited" : res.status === 401 || res.status === 403 ? "forbidden" : "network");
    } catch {
      setError("network");
    }
    setPending(false);
  }

  return (
    <div className="flex max-w-xl flex-col gap-3">
      <button type="button" disabled={pending} onClick={run} className="self-start rounded border border-neutral-400 px-3 py-2 text-sm disabled:opacity-60">
        {pending ? labels.pending : labels.button}
      </button>
      {error && <p role="alert" className="text-sm text-red-600">{labels.errors[error]}</p>}
      {result && <InviteLinkBox link={result.link} expiresAt={result.expiresAt} labels={labels.link} />}
    </div>
  );
}
