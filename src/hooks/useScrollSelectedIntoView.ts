import { useEffect, useRef } from "react";

/**
 * Scrolls the element with `data-node-id={selectedId}` into view whenever
 * the selection *changes*. Skips the initial mount so switching between
 * view modes doesn't auto-scroll to the previously selected field.
 * Uses requestAnimationFrame so any state updates (e.g. expanding
 * ancestor groups) flush first.
 */
export function useScrollSelectedIntoView(selectedId: string | null, deps: unknown[] = []) {
  const prev = useRef<string | null>(null);
  const mounted = useRef(false);
  useEffect(() => {
    const isFirst = !mounted.current;
    mounted.current = true;
    const changed = prev.current !== selectedId;
    prev.current = selectedId;
    if (!selectedId) return;
    if (isFirst || !changed) return;
    const raf = requestAnimationFrame(() => {
      const el = document.querySelector<HTMLElement>(`[data-node-id="${selectedId}"]`);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
    });
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, ...deps]);
}