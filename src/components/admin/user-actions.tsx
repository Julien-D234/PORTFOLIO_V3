"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export interface UserActionsLabels {
  title: string;
  role: { title: string; makeAdmin: string; makeUser: string; confirmAdmin: string; confirmUser: string };
  ban: { title: string; reason: string; duration: string; durations: Record<"permanent" | "h1" | "d1" | "d7" | "d30", string>; submit: string; confirm: string };
  unban: { button: string; confirm: string };
  unlock: { button: string; confirm: string };
  revoke: { button: string; confirm: string };
  remove: { title: string; hint: string; placeholder: string; submit: string; confirm: string };
  done: string;
  pending: string;
  errors: Record<"lastAdmin" | "passwordPolicy" | "forbidden" | "unauthenticated" | "rateLimited" | "notFound" | "network", string>;
}

export interface UserActionsProps {
  userId: string;
  email: string;
  isAdmin: boolean;
  banned: boolean;
  locked: boolean;
  lang: string;
  labels: UserActionsLabels;
}

const DURATIONS = { permanent: undefined, h1: 3600, d1: 86400, d7: 604800, d30: 2592000 } as const;
type DurationKey = keyof typeof DURATIONS;
type ErrorKey = keyof UserActionsLabels["errors"];

/** Traduit une réponse d'erreur (Better Auth ou route interne) en clé de message. */
function errorKey(status: number, data: { message?: string; error?: string } | null): ErrorKey {
  const m = data?.message ?? data?.error;
  if (m === "LAST_ADMIN") return "lastAdmin";
  if (m === "PASSWORD_POLICY") return "passwordPolicy";
  if (status === 401) return "unauthenticated";
  if (status === 403) return "forbidden";
  if (status === 404) return "notFound";
  if (status === 429) return "rateLimited";
  return "network";
}

export function UserActions({ userId, email, isAdmin, banned, locked, lang, labels }: UserActionsProps) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<ErrorKey | null>(null);
  const [done, setDone] = useState(false);
  const [reason, setReason] = useState("");
  const [duration, setDuration] = useState<DurationKey>("permanent");
  const [typed, setTyped] = useState("");

  async function run(url: string, body: unknown, confirmText: string | null, after?: () => void) {
    if (confirmText && !window.confirm(confirmText)) return;
    setPending(true);
    setError(null);
    setDone(false);
    try {
      const res = await fetch(url, {
        method: "POST", headers: { "content-type": "application/json" }, credentials: "same-origin", body: JSON.stringify(body),
      });
      if (res.ok) {
        setDone(true);
        if (after) after(); else router.refresh();
      } else {
        setError(errorKey(res.status, (await res.json().catch(() => null)) as { message?: string; error?: string } | null));
      }
    } catch {
      setError("network");
    }
    setPending(false);
  }

  const auth = (p: string) => `/api/auth/admin/${p}`;
  const btn = "rounded border border-neutral-400 px-3 py-2 text-sm disabled:opacity-60";
  const danger = "rounded border border-red-600 px-3 py-2 text-sm text-red-600 disabled:opacity-60";
  const l = labels;

  return (
    <section className="flex max-w-xl flex-col gap-5">
      <h2 className="text-lg font-semibold">{l.title}</h2>

      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={pending} className={btn}
          onClick={() => run(auth("set-role"), { userId, role: isAdmin ? "user" : "admin" }, isAdmin ? l.role.confirmUser : l.role.confirmAdmin)}>
          {isAdmin ? l.role.makeUser : l.role.makeAdmin}
        </button>
        {locked && (
          <button type="button" disabled={pending} className={btn}
            onClick={() => run(`/api/admin/users/${encodeURIComponent(userId)}/unlock`, {}, l.unlock.confirm)}>{l.unlock.button}</button>
        )}
        <button type="button" disabled={pending} className={btn}
          onClick={() => run(auth("revoke-user-sessions"), { userId }, l.revoke.confirm)}>{l.revoke.button}</button>
        {banned && (
          <button type="button" disabled={pending} className={btn}
            onClick={() => run(auth("unban-user"), { userId }, l.unban.confirm)}>{l.unban.button}</button>
        )}
      </div>

      {!banned && (
        <form className="flex flex-col gap-2" onSubmit={(e) => {
          e.preventDefault();
          const secs = DURATIONS[duration];
          run(auth("ban-user"), { userId, ...(reason.trim() ? { banReason: reason.trim() } : {}), ...(secs ? { banExpiresIn: secs } : {}) }, l.ban.confirm, () => { setReason(""); router.refresh(); });
        }}>
          <h3 className="font-medium">{l.ban.title}</h3>
          <label className="flex flex-col gap-1 text-sm">{l.ban.reason}
            <input value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} className="rounded border border-neutral-400 px-2 py-1" />
          </label>
          <label className="flex flex-col gap-1 text-sm">{l.ban.duration}
            <select value={duration} onChange={(e) => setDuration(e.target.value as DurationKey)} className="rounded border border-neutral-400 px-2 py-1">
              {(Object.keys(DURATIONS) as DurationKey[]).map((k) => <option key={k} value={k}>{l.ban.durations[k]}</option>)}
            </select>
          </label>
          <button type="submit" disabled={pending} className={`${danger} self-start`}>{l.ban.submit}</button>
        </form>
      )}

      <form className="flex flex-col gap-2 border-t border-neutral-300 pt-4" onSubmit={(e) => {
        e.preventDefault();
        run(auth("remove-user"), { userId }, l.remove.confirm, () => router.replace(`/${lang}/admin/users`));
      }}>
        <h3 className="font-medium text-red-600">{l.remove.title}</h3>
        <p className="text-sm">{l.remove.hint} <code className="break-all">{email}</code></p>
        <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={l.remove.placeholder} autoComplete="off"
          className="rounded border border-neutral-400 px-2 py-1 text-sm" aria-label={l.remove.placeholder} />
        <button type="submit" disabled={pending || typed.trim().toLowerCase() !== email.toLowerCase()} className={`${danger} self-start`}>{l.remove.submit}</button>
      </form>

      <div aria-live="polite" className="text-sm">
        {pending && <p>{l.pending}</p>}
        {error && <p role="alert" className="text-red-600">{l.errors[error]}</p>}
        {done && !pending && !error && <p>{l.done}</p>}
      </div>
    </section>
  );
}
