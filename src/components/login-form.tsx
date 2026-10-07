"use client";

import { useState } from "react";
import { loginErrorKey, loginSchema, type LoginErrorKey } from "@/lib/auth-forms";

export interface LoginLabels {
  title: string; email: string; password: string; submit: string; submitting: string;
  errors: Record<LoginErrorKey, string>;
}

export function LoginForm({ labels, lang, next }: { labels: LoginLabels; lang: string; next: string }) {
  const [error, setError] = useState<LoginErrorKey | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const parsed = loginSchema.safeParse({ email: fd.get("email"), password: fd.get("password") });
    if (!parsed.success) return setError("validation");
    setPending(true);
    setError(null);
    try {
      // Appel HTTP direct : le rate-limit de Better Auth ne s'applique pas aux appels serveur internes.
      const res = await fetch("/api/auth/sign-in/email", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(parsed.data),
        credentials: "same-origin",
      });
      if (!res.ok) {
        setError(loginErrorKey(res.status));
        setPending(false);
        return;
      }
      const data = (await res.json().catch(() => null)) as { user?: { mustChangePassword?: boolean } } | null;
      const target = data?.user?.mustChangePassword
        ? `/${lang}/change-password?next=${encodeURIComponent(next)}`
        : next;
      window.location.assign(target); // rechargement complet : session et CSP fraîches
    } catch {
      setError("network");
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex w-full max-w-sm flex-col gap-4" noValidate>
      <h1 className="text-2xl font-semibold">{labels.title}</h1>
      <label className="flex flex-col gap-1 text-sm">
        {labels.email}
        <input name="email" type="email" autoComplete="username" required maxLength={254}
          className="rounded border border-neutral-400 bg-transparent px-3 py-2" />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        {labels.password}
        <input name="password" type="password" autoComplete="current-password" required maxLength={128}
          className="rounded border border-neutral-400 bg-transparent px-3 py-2" />
      </label>
      {error && <p role="alert" className="text-sm text-red-600">{labels.errors[error]}</p>}
      <button type="submit" disabled={pending} className="rounded bg-neutral-900 px-3 py-2 text-white disabled:opacity-60 dark:bg-neutral-100 dark:text-black">
        {pending ? labels.submitting : labels.submit}
      </button>
    </form>
  );
}
