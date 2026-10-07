"use client";

import { useEffect, useState } from "react";

export interface WelcomeLabels {
  title: string; intro: string; password: string; confirm: string; submit: string; submitting: string;
  errors: { invalid: string; validation: string; mismatch: string; rateLimited: string; network: string };
  loginLink: string;
}

export function WelcomeForm({ lang, labels }: { lang: string; labels: WelcomeLabels }) {
  const [token, setToken] = useState<string | null | undefined>(undefined); // undefined = pas encore lu
  const [error, setError] = useState<keyof WelcomeLabels["errors"] | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    // Le jeton est dans le fragment (#token=…) : jamais envoyé au serveur. On le retire de la barre d'adresse.
    const t = new URLSearchParams(window.location.hash.slice(1)).get("token");
    window.history.replaceState(null, "", window.location.pathname);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- lecture unique du fragment, impossible côté serveur
    setToken(t);
  }, []);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const password = String(fd.get("password") ?? "");
    if (password.length < 12 || password.length > 128) return setError("validation");
    if (password !== fd.get("confirm")) return setError("mismatch");
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/welcome", {
        method: "POST", headers: { "content-type": "application/json" }, credentials: "same-origin",
        body: JSON.stringify({ token, password }),
      });
      if (res.ok) {
        const data = (await res.json()) as { signedIn?: boolean };
        window.location.assign(data.signedIn ? `/${lang}` : `/${lang}/login`);
        return;
      }
      const code = ((await res.json().catch(() => ({}))) as { error?: string }).error;
      setError(res.status === 429 ? "rateLimited" : code === "PASSWORD_POLICY" ? "validation" : res.status === 400 ? "invalid" : "network");
    } catch {
      setError("network");
    }
    setPending(false);
  }

  if (token === undefined) return null;
  if (!token || error === "invalid") {
    return (
      <div className="flex max-w-sm flex-col gap-3 text-sm">
        <p role="alert" className="text-red-600">{labels.errors.invalid}</p>
        <a href={`/${lang}/login`} className="underline">{labels.loginLink}</a>
      </div>
    );
  }
  const input = "rounded border border-neutral-400 bg-transparent px-3 py-2";
  return (
    <form onSubmit={onSubmit} className="flex w-full max-w-sm flex-col gap-4" noValidate>
      <h1 className="text-2xl font-semibold">{labels.title}</h1>
      <p className="text-sm">{labels.intro}</p>
      <label className="flex flex-col gap-1 text-sm">{labels.password}
        <input name="password" type="password" autoComplete="new-password" required minLength={12} maxLength={128} className={input} />
      </label>
      <label className="flex flex-col gap-1 text-sm">{labels.confirm}
        <input name="confirm" type="password" autoComplete="new-password" required maxLength={128} className={input} />
      </label>
      {error && <p role="alert" className="text-sm text-red-600">{labels.errors[error]}</p>}
      <button type="submit" disabled={pending} className="rounded bg-neutral-900 px-3 py-2 text-white disabled:opacity-60 dark:bg-neutral-100 dark:text-black">
        {pending ? labels.submitting : labels.submit}
      </button>
    </form>
  );
}
