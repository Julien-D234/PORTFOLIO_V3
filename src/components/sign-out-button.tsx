"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function SignOutButton({ label, lang }: { label: string; lang: string }) {
  const [pending, setPending] = useState(false);
  const router = useRouter();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={async () => {
        setPending(true);
        await fetch("/api/auth/sign-out", { method: "POST", headers: { "content-type": "application/json" }, body: "{}", credentials: "same-origin" }).catch(() => {});
        router.replace(`/${lang}/login`);
        router.refresh();
      }}
      className="text-sm underline disabled:opacity-60"
    >
      {label}
    </button>
  );
}
