"use client";

import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";

/**
 * Conteneur de défilement immersif : un écran par section (scroll snap
 * « mandatory » adouci : pas de snap-stop forcé), points de position,
 * navigation clavier (le défilement natif par flèches est trop court avec un
 * snap mandatory). Respecte prefers-reduced-motion.
 */
export function Deck({
  children,
  count,
  labels,
  navLabel,
}: {
  children: ReactNode;
  count: number; // nombre de sections, hero compris
  labels: string[]; // un libellé accessible par point
  navLabel: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);

  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const sections = Array.from(root.querySelectorAll<HTMLElement>("[data-slide]"));
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) setActive(Number((e.target as HTMLElement).dataset.slide));
        }
      },
      { root, threshold: 0.6 },
    );
    sections.forEach((s) => io.observe(s));
    return () => io.disconnect();
  }, [count]);

  const goTo = useCallback(
    (i: number) => {
      const root = ref.current;
      if (!root) return;
      const target = Math.max(0, Math.min(count - 1, i));
      const el = root.querySelector<HTMLElement>(`[data-slide="${target}"]`);
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      el?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
    },
    [count],
  );

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const t = e.target as HTMLElement;
    if (t.closest("input, textarea, select")) return;
    const next = ["ArrowDown", "PageDown"].includes(e.key) || (e.key === " " && !e.shiftKey);
    const prev = ["ArrowUp", "PageUp"].includes(e.key) || (e.key === " " && e.shiftKey);
    if (next) goTo(active + 1);
    else if (prev) goTo(active - 1);
    else if (e.key === "Home") goTo(0);
    else if (e.key === "End") goTo(count - 1);
    else return;
    e.preventDefault();
  }

  return (
    <>
      <div
        ref={ref}
        tabIndex={0}
        onKeyDown={onKeyDown}
        className="h-dvh snap-y snap-mandatory overflow-y-scroll scroll-smooth outline-none motion-reduce:scroll-auto"
      >
        {children}
      </div>
      <nav aria-label={navLabel} className="fixed top-1/2 right-1 z-20 -translate-y-1/2 sm:right-3">
        <ul className="grid gap-1">
          {labels.map((label, i) => (
            <li key={i}>
              <button
                type="button"
                aria-label={label}
                aria-current={i === active ? "true" : undefined}
                onClick={() => goTo(i)}
                className="grid size-6 place-items-center rounded-full focus-visible:outline-2 focus-visible:outline-[#6d8cff]"
              >
                <span
                  className={`block size-2 rounded-full border border-white/60 transition-colors ${
                    i === active ? "bg-white" : "bg-transparent"
                  }`}
                />
              </button>
            </li>
          ))}
        </ul>
      </nav>
    </>
  );
}
