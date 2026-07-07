import { useMemo, useRef } from "react";
import { useFormStore } from "@/store/useFormStore";
import { dependentsOf } from "@/lib/dm/parser";
import { ArrowRight } from "lucide-react";
import { TypeBadge } from "./TypeBadge";
import { useScrollSelectedIntoView } from "@/hooks/useScrollSelectedIntoView";
import { BackToTop } from "./BackToTop";

export function GraphView() {
  const { schema, select, selectedId } = useFormStore();
  const scrollRef = useRef<HTMLDivElement>(null);
  useScrollSelectedIntoView(selectedId, [schema]);
  if (!schema) return null;

  const edges = useMemo(() => {
    const list: { from: string; to: string; via: "visible" | "filter" | "required" }[] = [];
    for (const id of schema.order) {
      const n = schema.nodes[id];
      for (const dep of n.dependsOn) {
        const fromId = schema.byIdentifier[dep];
        if (!fromId) continue;
        const via = n.visibleExpr?.includes(`.${dep}`) ? "visible" : n.optionsFilterExpr?.includes(`.${dep}`) ? "filter" : "required";
        list.push({ from: fromId, to: id, via });
      }
    }
    return list;
  }, [schema]);

  // Group edges by source
  const bySource = useMemo(() => {
    const m = new Map<string, typeof edges>();
    for (const e of edges) {
      if (!m.has(e.from)) m.set(e.from, []);
      m.get(e.from)!.push(e);
    }
    return [...m.entries()].sort((a, b) => b[1].length - a[1].length);
  }, [edges]);

  return (
    <div ref={scrollRef} className="relative flex-1 overflow-auto scrollbar-thin bg-background p-6">
      <div className="mx-auto max-w-5xl">
        <div className="mb-4">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Dependency Graph</div>
          <div className="text-lg font-semibold text-foreground">{edges.length} relationships across {bySource.length} source fields</div>
          <div className="text-[11px] text-muted-foreground">Hub fields drive visibility, options filtering, and required logic across many downstream fields.</div>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {bySource.map(([fromId, list]) => {
            const from = schema.nodes[fromId];
            return (
              <div key={fromId} data-node-id={fromId} className="rounded-lg border border-border bg-surface">
                <button
                  onClick={() => select(fromId)}
                  className="flex w-full items-center justify-between border-b border-border bg-surface-2 px-3 py-2 text-left hover:bg-surface-3"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-foreground">{from.title}</div>
                    <div className="font-mono-tight text-[10px] text-muted-foreground">{from.identifier}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <TypeBadge kind={from.kind} />
                    <span className="rounded bg-primary-soft px-1.5 py-0.5 font-mono-tight text-[10px] font-semibold text-primary">→ {list.length}</span>
                  </div>
                </button>
                <div className="max-h-64 overflow-auto scrollbar-thin">
                  {list.slice(0, 30).map((e, i) => {
                    const to = schema.nodes[e.to];
                    return (
                      <button
                        key={i}
                        onClick={() => select(e.to)}
                        className="flex w-full items-center gap-2 border-b border-border/60 px-3 py-1.5 text-left text-[11px] last:border-b-0 hover:bg-surface-2"
                      >
                        <ArrowRight className="h-3 w-3 text-muted-foreground" />
                        <span className="flex-1 truncate text-foreground">{to.title}</span>
                        <span className={
                          e.via === "visible" ? "text-info" : e.via === "filter" ? "text-accent" : "text-destructive"
                        }>{e.via}</span>
                      </button>
                    );
                  })}
                  {list.length > 30 && <div className="px-3 py-1.5 text-[10px] text-muted-foreground">+{list.length - 30} more</div>}
                </div>
              </div>
            );
          })}
          {bySource.length === 0 && (
            <div className="md:col-span-2 rounded-lg border border-dashed border-border p-12 text-center text-sm text-muted-foreground">
              No dependencies found in this form.
            </div>
          )}
        </div>
      </div>
      <BackToTop scrollRef={scrollRef} />
    </div>
  );
}