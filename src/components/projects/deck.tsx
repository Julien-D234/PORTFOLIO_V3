"use client";

import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";

/** Durée du défilement d'un écran à l'autre (ms) : volontairement lent et fluide. */
const SCROLL_MS = 1400;
/** Silence minimal entre deux événements de molette pour qu'un nouveau geste compte (écarte l'inertie du pavé tactile). */
const WHEEL_QUIET_MS = 120;
const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/**
 * Conteneur de défilement immersif : un écran par section.
 * - Souris / pavé tactile : un cran de molette = un écran, animé lentement
 *   (SCROLL_MS) ; le défilement natif (qui sautait instantanément avec un snap
 *   mandatory) est intercepté. Pas d'accroche CSS sur ordinateur.
 * - Écrans tactiles : défilement natif avec scroll snap mandatory.
 * - Clavier et points de position : même animation.
 * Respecte prefers-reduced-motion (déplacement instantané).
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
  const anim = useRef<{ raf: number | null }>({ raf: null });
  const lastWheel = useRef(0);

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

  const currentIndex = useCallback(() => {
    const root = ref.current;
    return root ? Math.round(root.scrollTop / Math.max(1, root.clientHeight)) : 0;
  }, []);

  const goTo = useCallback(
    (i: number) => {
      const root = ref.current;
      if (!root) return;
      const target = Math.max(0, Math.min(count - 1, i));
      const el = root.querySelector<HTMLElement>(`[data-slide="${target}"]`);
      if (!el) return;
      if (anim.current.raf !== null) cancelAnimationFrame(anim.current.raf);
      const to = el.offsetTop;
      if (Math.abs(to - root.scrollTop) < 1) return; // déjà en place (ex. dernier écran)
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (reduce) {
        root.scrollTop = to;
        anim.current.raf = null;
        return;
      }
      const from = root.scrollTop;
      const start = performance.now();
      root.style.scrollSnapType = "none"; // l'accroche CSS (tactile) combattrait l'animation
      const step = (now: number) => {
        const t = Math.min(1, (now - start) / SCROLL_MS);
        root.scrollTop = from + (to - from) * easeInOutCubic(t);
        if (t < 1) {
          anim.current.raf = requestAnimationFrame(step);
        } else {
          anim.current.raf = null;
          root.style.scrollSnapType = "";
        }
      };
      anim.current.raf = requestAnimationFrame(step);
    },
    [count],
  );

  // Molette : écouteur non passif (preventDefault impossible avec onWheel de React).
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey || Math.abs(e.deltaY) < Math.abs(e.deltaX)) return; // zoom / défilement horizontal
      e.preventDefault();
      const now = performance.now();
      const quiet = now - lastWheel.current > WHEEL_QUIET_MS;
      lastWheel.current = now;
      if (anim.current.raf !== null || !quiet || Math.abs(e.deltaY) < 1) return;
      goTo(currentIndex() + (e.deltaY > 0 ? 1 : -1));
    };
    root.addEventListener("wheel", onWheel, { passive: false });
    return () => root.removeEventListener("wheel", onWheel);
  }, [goTo, currentIndex]);

  useEffect(() => () => { if (anim.current.raf !== null) cancelAnimationFrame(anim.current.raf); }, []);

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const t = e.target as HTMLElement;
    if (t.closest("input, textarea, select")) return;
    const here = currentIndex();
    const next = ["ArrowDown", "PageDown"].includes(e.key) || (e.key === " " && !e.shiftKey);
    const prev = ["ArrowUp", "PageUp"].includes(e.key) || (e.key === " " && e.shiftKey);
    if (next) goTo(here + 1);
    else if (prev) goTo(here - 1);
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
        className="h-dvh overflow-y-scroll outline-none [@media(pointer:coarse)]:snap-y [@media(pointer:coarse)]:snap-mandatory"
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
