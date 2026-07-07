import { useMemo } from "react";
import { ChevronRight, MapPin } from "lucide-react";
import { useFormStore } from "@/store/useFormStore";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { cn } from "@/lib/utils";
import type { DMNode } from "@/lib/dm/types";

type Seg = { id: string; label: string };

export function PathBreadcrumb() {
  const { schema, selectedId, select } = useFormStore();

  const handleSelect = (id: string) => {
    if (!schema) return select(id);
    const node = schema.nodes[id];
    if (!node) return select(id);
    // Select the section/field itself so the container is highlighted, then
    // center on whichever element actually exists in the DOM — prefer the
    // container, fall back to its first descendant leaf if the container
    // isn't rendered (e.g. groups that aren't materialised in some views).
    select(id);
    const firstLeaf = findFirstLeaf(schema, id);
    requestAnimationFrame(() => {
      const el =
        document.querySelector<HTMLElement>(`[data-node-id="${id}"]`) ??
        (firstLeaf ? document.querySelector<HTMLElement>(`[data-node-id="${firstLeaf}"]`) : null);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  };

  const segments = useMemo<Seg[]>(() => {
    if (!schema) return [];
    const root = schema.nodes[schema.rootId];
    const rootSeg: Seg = { id: root.id, label: labelOf(root) || "Root" };
    if (!selectedId || selectedId === schema.rootId) return [rootSeg];
    const chain: DMNode[] = [];
    let cur: DMNode | undefined = schema.nodes[selectedId];
    while (cur && cur.id !== schema.rootId) {
      chain.push(cur);
      cur = cur.parentId ? schema.nodes[cur.parentId] : undefined;
    }
    chain.reverse();
    return [rootSeg, ...chain.map((n) => ({ id: n.id, label: labelOf(n) }))];
  }, [schema, selectedId]);

  if (!schema || segments.length === 0) return null;

  const fullPath = segments.map((s) => s.label).join(" / ");

  return (
    <div className="flex shrink-0 items-center border-b border-border bg-surface/50 px-3 py-1">
      <HoverCard openDelay={150} closeDelay={80}>
        <HoverCardTrigger asChild>
          <div
            title={fullPath}
            className="flex min-w-0 flex-1 items-start gap-1 text-[11px] text-muted-foreground"
          >
            <MapPin className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground/70" />
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-1 gap-y-0.5">
              {segments.map((seg, i) => (
                <span key={seg.id} className="flex items-center gap-1">
                  {i > 0 && <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground/50" />}
                  <button
                    type="button"
                    onClick={() => handleSelect(seg.id)}
                    className={cn(
                      "max-w-[260px] truncate rounded px-1 transition-colors hover:bg-surface-2 hover:text-foreground",
                      i === segments.length - 1 && "font-medium text-foreground",
                    )}
                  >
                    {seg.label}
                  </button>
                </span>
              ))}
            </div>
          </div>
        </HoverCardTrigger>
        <HoverCardContent side="bottom" align="start" className="w-auto max-w-[480px] p-2.5">
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Location
          </div>
          <div className="flex flex-col gap-0.5 text-[12px]">
            {segments.map((s, i) => (
              <div key={s.id} className="flex items-start gap-1.5">
                <span className="mt-0.5 text-muted-foreground/60" style={{ paddingLeft: i * 10 }}>
                  {i === 0 ? "•" : "↳"}
                </span>
                <button
                  type="button"
                  onClick={() => handleSelect(s.id)}
                  className={cn(
                    "truncate text-left hover:text-primary",
                    i === segments.length - 1 ? "font-medium text-foreground" : "text-muted-foreground",
                  )}
                >
                  {s.label}
                </button>
              </div>
            ))}
          </div>
        </HoverCardContent>
      </HoverCard>
    </div>
  );
}

function labelOf(n: DMNode): string {
  return (n.title && n.title.trim()) || n.identifier || "Untitled";
}

function findFirstLeaf(schema: { nodes: Record<string, DMNode> }, id: string): string | null {
  const node = schema.nodes[id];
  if (!node) return null;
  if (!node.childrenIds || node.childrenIds.length === 0) return id;
  for (const childId of node.childrenIds) {
    const child = schema.nodes[childId];
    if (!child) continue;
    if (child.isGroup || child.isLoop) {
      const deeper = findFirstLeaf(schema, childId);
      if (deeper) return deeper;
    } else {
      return childId;
    }
  }
  return node.childrenIds[0] ?? null;
}