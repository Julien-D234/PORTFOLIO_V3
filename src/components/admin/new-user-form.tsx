"use client";

import { useState } from "react";
import { InviteLinkBox, type InviteLinkLabels } from "./invite-link-box";

export interface NewUserLabels {
  title: string; email: string; name: string; role: string; roleUser: string; roleAdmin: string;
  submit: string; submitting: string; another: string; link: InviteLinkLabels;
  errors: { validation: string; emailTaken: string; forbidden: string; rateLimited: string; network: string };
}

export function NewUserForm({ lang, labels }: { lang: string; labels: NewUserLabels }) {
  const [error, setError] = useState<keyof NewUserLabels["errors"] | null>(null);
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<{ link: string; expiresAt: string } | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ email: fd.get("email"), name: fd.get("name"), role: fd.get("role"), lang }),
      });
      if (res.status === 201) {
        setResult((await res.json()) as { link: string; expiresAt: string });
      } else {
        setError(res.status === 409 ? "emailTaken" : res.status === 400 ? "validation" : res.status === 429 ? "rateLimited"
          : res.status === 401 || res.status === 403 ? "forbidden" : "network");
      }
    } catch {
      setError("network");
    }
    setPending(false);
  }

  if (result) {
    return (
      <div className="flex max-w-xl flex-col gap-4">
        <InviteLinkBox link={result.link} expiresAt={result.expiresAt} labels={labels.link} />
        <button type="button" onClick={() => setResult(null)} className="self-start text-sm underline">{labels.another}</button>
      </div>
    );
  }
  const input = "rounded border border-neutral-400 bg-transparent px-3 py-2";
  return (
    <form onSubmit={onSubmit} className="flex w-full max-w-sm flex-col gap-4" noValidate>
      <label className="flex flex-col gap-1 text-sm">{labels.email}
        <input name="email" type="email" required maxLength={254} autoComplete="off" className={input} />
      </label>
      <label className="flex flex-col gap-1 text-sm">{labels.name}
        <input name="name" required maxLength={100} autoComplete="off" className={input} />
      </label>
      <label className="flex flex-col gap-1 text-sm">{labels.role}
        <select name="role" defaultValue="user" className={input}>
          <option value="user">{labels.roleUser}</option>
          <option value="admin">{labels.roleAdmin}</option>
        </select>
      </label>
      {error && <p role="alert" className="text-sm text-red-600">{labels.errors[error]}</p>}
      <button type="submit" disabled={pending} className="rounded bg-neutral-900 px-3 py-2 text-white disabled:opacity-60 dark:bg-neutral-100 dark:text-black">
        {pending ? labels.submitting : labels.submit}
      </button>
    </form>
  );
}
