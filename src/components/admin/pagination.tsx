import Link from "next/link";
import { fmt } from "@/lib/format";

interface Labels { prev: string; next: string; page: string }

/** Pagination par liens (GET) : aucune action, aucun état client. */
export function Pagination({ base, params, page, pageCount, labels }: {
  base: string; params: Record<string, string | undefined>; page: number; pageCount: number; labels: Labels;
}) {
  const href = (p: number) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v) q.set(k, v);
    q.set("page", String(p));
    return `${base}?${q.toString()}`;
  };
  return (
    <nav className="mt-4 flex items-center gap-4 text-sm" aria-label="pagination">
      {page > 1 ? <Link href={href(page - 1)} className="underline">{labels.prev}</Link> : <span className="opacity-40">{labels.prev}</span>}
      <span>{fmt(labels.page, { page, count: pageCount })}</span>
      {page < pageCount ? <Link href={href(page + 1)} className="underline">{labels.next}</Link> : <span className="opacity-40">{labels.next}</span>}
    </nav>
  );
}
