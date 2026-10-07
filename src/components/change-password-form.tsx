"use client";

import { useState } from "react";
import { changePasswordSchema } from "@/lib/auth-forms";

export interface ChangePasswordLabels {
  title: string; current: string; next: string; confirm: string; submit: string; submitting: string;
  errors: { validation: string; mismatch: string; same: string; invalid: string; rateLimited: string; network: string };
}

export function ChangePasswordForm({ labels, target }: { labels: ChangePasswordLabels; target: string }) {
  const [error, setError] = useState<keyof ChangePasswordLabels["errors"] | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const parsed = changePasswordSchema.safeParse({
      currentPassword: fd.get("currentPassword"),
      newPassword: fd.get("newPassword"),
      confirmPassword: fd.get("confirmPassword"),
    });
    if (!parsed.success) {
      const msg = parsed.error.issues.map((i) => i.message);
      return setError(msg.includes("MISMATCH") ? "mismatch" : msg.includes("SAME_PASSWORD") ? "same" : "validation");
    }
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          currentPassword: parsed.data.currentPassword,
          newPassword: parsed.data.newPassword,
          revokeOtherSessions: true,
        }),
        credentials: "same-origin",
      });
      if (!res.ok) {
        setError(res.status === 429 ? "rateLimited" : res.status >= 500 ? "network" : "invalid");
        setPending(false);
        return;
      }
      window.location.assign(target);
    } catch {
      setError("network");
      setPending(false);
    }
  }

  const input = "rounded border border-neutral-400 bg-transparent px-3 py-2";
  return (
    <form onSubmit={onSubmit} className="flex w-full max-w-sm flex-col gap-4" noValidate>
      <h1 className="text-2xl font-semibold">{labels.title}</h1>
      <label className="flex flex-col gap-1 text-sm">{labels.current}
        <input name="currentPassword" type="password" autoComplete="current-password" required maxLength={128} className={input} />
      </label>
      <label className="flex flex-col gap-1 text-sm">{labels.next}
        <input name="newPassword" type="password" autoComplete="new-password" required minLength={12} maxLength={128} className={input} />
      </label>
      <label className="flex flex-col gap-1 text-sm">{labels.confirm}
        <input name="confirmPassword" type="password" autoComplete="new-password" required maxLength={128} className={input} />
      </label>
      {error && <p role="alert" className="text-sm text-red-600">{labels.errors[error]}</p>}
      <button type="submit" disabled={pending} className="rounded bg-neutral-900 px-3 py-2 text-white disabled:opacity-60 dark:bg-neutral-100 dark:text-black">
        {pending ? labels.submitting : labels.submit}
      </button>
    </form>
  );
}
