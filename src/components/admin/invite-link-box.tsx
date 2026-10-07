"use client";

import { useState } from "react";

export interface InviteLinkLabels { title: string; warning: string; copy: string; copied: string; expires: string }

/** Affiche le lien UNE fois (état React uniquement : ni stockage, ni URL). */
export function InviteLinkBox({ link, expiresAt, labels }: { link: string; expiresAt: string; labels: InviteLinkLabels }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex flex-col gap-2 rounded border border-amber-500 p-4 text-sm" role="status">
      <strong>{labels.title}</strong>
      <p>{labels.warning}</p>
      <input readOnly value={link} onFocus={(e) => e.currentTarget.select()} aria-label={labels.title}
        className="w-full rounded border border-neutral-400 bg-transparent px-3 py-2 font-mono text-xs" />
      <div className="flex items-center gap-4">
        <button type="button" className="rounded border border-neutral-400 px-3 py-1"
          onClick={async () => { try { await navigator.clipboard.writeText(link); setCopied(true); } catch { /* sélection manuelle */ } }}>
          {copied ? labels.copied : labels.copy}
        </button>
        <span className="opacity-70">{labels.expires} {new Date(expiresAt).toLocaleString()}</span>
      </div>
    </div>
  );
}
