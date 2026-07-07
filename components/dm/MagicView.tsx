import { PillToggle } from "@/components/dm/PillToggle";
import { useEffect, useMemo, useRef, useState } from "react";
import { useFormStore } from "@/store/useFormStore";
import { DMNode, DMSchema } from "@/lib/dm/types";
import { TypeBadge } from "./TypeBadge";
import { BackToTop } from "./BackToTop";
import { useDoneFields, doneKey } from "@/hooks/useDoneFields";
import { useReviewFields } from "@/hooks/useReviewFields";
import { useScrollSelectedIntoView } from "@/hooks/useScrollSelectedIntoView";
import {
  Asterisk, Eye, EyeOff, Filter, Lock, Repeat2, Folder, FolderOpen, ChevronRight,
  ChevronsDownUp, ChevronsUpDown, Download, Upload, Flag, Check, SkipForward,
  ChevronLeft, ListChecks,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { toast } from "sonner";

function matchField(
  n: DMNode,
  q: string,
  filters: ReturnType<typeof useFormStore.getState>["filters"],
  extra?: (node: DMNode) => boolean,
): boolean {
  if (q && !n.identifier.toLowerCase().includes(q) && !n.title.toLowerCase().includes(q)) return false;
  if (filters.kinds.size && !filters.kinds.has(n.kind)) return false;
  if (filters.onlyConditional && !n.visibleExpr) return false;
  if (filters.onlyRequired && !n.requiredRule) return false;
  if (filters.onlyLoops && !n.isLoop) return false;
  if (extra && !extra(n)) return false;
  return true;
}

type Segment =
  | { type: "fields"; fields: DMNode[] }
  | { type: "group"; node: DMNode };

/** Group child segments while preserving JSON order. */
function buildSegments(
  schema: DMSchema,
  parent: DMNode,
  q: string,
  filters: any,
  extra?: (n: DMNode) => boolean,
): Segment[] {
  const out: Segment[] = [];
  let run: DMNode[] = [];
  const flush = () => {
    if (run.length) { out.push({ type: "fields", fields: run }); run = []; }
  };
  for (const cid of parent.childrenIds) {
    const c = schema.nodes[cid];
    if (c.isGroup) { flush(); out.push({ type: "group", node: c }); }
    else if (matchField(c, q, filters, extra)) run.push(c);
  }
  flush();
  return out;
}

function countLeaves(
  schema: DMSchema,
  node: DMNode,
  q: string,
  filters: any,
  extra?: (n: DMNode) => boolean,
): number {
  let n = 0;
  for (const cid of node.childrenIds) {
    const c = schema.nodes[cid];
    if (c.isGroup) n += countLeaves(schema, c, q, filters, extra);
    else if (matchField(c, q, filters, extra)) n++;
  }
  return n;
}

function countDoneLeaves(
  schema: DMSchema,
  node: DMNode,
  q: string,
  filters: any,
  isDone: (k: string) => boolean,
): number {
  let n = 0;
  for (const cid of node.childrenIds) {
    const c = schema.nodes[cid];
    if (c.isGroup) n += countDoneLeaves(schema, c, q, filters, isDone);
    else if (matchField(c, q, filters) && isDone(doneKey(c))) n++;
  }
  return n;
}

function formatInitial(v: unknown): string {
  if (v == null || v === "") return "";
  if (Array.isArray(v)) return v.map(String).join(", ");
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

function PropertyIcon({
  Icon, on, tooltip, tone,
}: {
  Icon: typeof Eye;
  on: boolean;
  tooltip: string;
  tone: "destructive" | "warning" | "info" | "accent";
}) {
  const toneClass =
    !on
      ? "text-muted-foreground/30 border-border/40"
      : tone === "destructive"
        ? "text-destructive border-destructive/40 bg-destructive/5"
        : tone === "warning"
          ? "text-warning border-warning/40 bg-warning/5"
          : tone === "info"
            ? "text-info border-info/40 bg-info/5"
            : "text-accent border-accent/40 bg-accent/5";
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className={cn(
              "inline-flex h-5 w-5 items-center justify-center rounded border transition-colors",
              toneClass,
            )}
            aria-label={tooltip}
          >
            <Icon className="h-3 w-3" strokeWidth={1.75} />
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs text-[11px]">{tooltip}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function PropertiesCell({ node }: { node: DMNode }) {
  const required = !!node.requiredRule;
  const requiredTone = node.requiredRule === "when" ? "warning" : "destructive";
  const readOnly = node.readOnly;
  const visible = !!node.visibleExpr;
  const filtered = !!node.optionsFilterExpr;
  const hidden = !!node.hidden;

  return (
    <div className="flex items-center gap-1">
      {hidden && (
        <PropertyIcon
          Icon={EyeOff}
          on={true}
          tone="warning"
          tooltip="Hidden field (hidden: true)"
        />
      )}
      <PropertyIcon
        Icon={Asterisk}
        on={required}
        tone={requiredTone as any}
        tooltip={required ? (node.requiredReadable || "Required") : "Not required"}
      />
      <PropertyIcon
        Icon={Lock}
        on={readOnly}
        tone="accent"
        tooltip={readOnly ? (node.readOnlyReadable || "Read-only") : "Editable"}
      />
      <PropertyIcon
        Icon={Eye}
        on={visible}
        tone="info"
        tooltip={visible ? (node.visibleReadable || "Conditional visibility") : "Always visible"}
      />
      <PropertyIcon
        Icon={Filter}
        on={filtered}
        tone="accent"
        tooltip={filtered ? (node.optionsFilterReadable || "Options filtered") : "No options filter"}
      />
    </div>
  );
}

function DetailsCell({ node }: { node: DMNode }) {
  const initial = formatInitial(node.initialAnswer);
  const optCount = Array.isArray(node.options) ? node.options.length : 0;
  const items: { label: string; value: React.ReactNode }[] = [];
  if (initial) items.push({ label: "Default", value: <span className="font-mono-tight">{initial}</span> });
  if (node.hint) items.push({ label: "Hint", value: node.hint });
  if (node.description) items.push({ label: "Description", value: node.description });
  if (optCount > 0) {
    items.push({
      label: "Options",
      value: (
        <span>
          {optCount}
          {node.optionsTable ? <span className="ml-1 text-muted-foreground">· {node.optionsTable}</span> : null}
          {!node.optionsTable && node.optionsResource ? (
            <span className="ml-1 text-muted-foreground">· {node.optionsResource}</span>
          ) : null}
        </span>
      ),
    });
  } else if (node.optionsResource || node.optionsTable) {
    items.push({
      label: "Options",
      value: <span className="text-muted-foreground">{node.optionsTable || node.optionsResource}</span>,
    });
  }
  if (node.multiple) items.push({ label: "Multi", value: "Multiple values" });

  if (items.length === 0) {
    return <span className="text-muted-foreground/60">—</span>;
  }
  return (
    <div className="flex flex-col gap-0.5 text-[11px]">
      {items.map((it, i) => (
        <div key={i} className="flex gap-1.5">
          <span className="w-[72px] shrink-0 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            {it.label}
          </span>
          <span className="min-w-0 break-words text-foreground/90 [overflow-wrap:anywhere]">{it.value}</span>
        </div>
      ))}
    </div>
  );
}

export function MagicView() {
  const { schema, filters, selectedId, select, fileName, collapseOnStartup, reviewMode } = useFormStore();
  const { done, isDone, toggle: toggleDone, clear: clearDone, replace: replaceDone } = useDoneFields();
  const { map: reviewMap } = useReviewFields();
  const setFilter = useFormStore((s) => s.setFilter);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  useScrollSelectedIntoView(selectedId, [schema]);

  const q = (filters.query || "").toLowerCase();
  // Auto-disable the "only flagged" filter when review mode is turned off,
  // so users don't end up with an empty view they can't explain.
  useEffect(() => {
    if (!reviewMode && filters.onlyFlagged) setFilter("onlyFlagged", false);
  }, [reviewMode, filters.onlyFlagged, setFilter]);
  const flaggedFilter = useMemo(() => {
    if (!filters.onlyFlagged) return undefined;
    return (n: DMNode) => !!reviewMap[doneKey(n)]?.needsEdit;
  }, [filters.onlyFlagged, reviewMap]);

  const allGroupIds = useMemo(
    () => (schema ? schema.order.filter((id) => schema.nodes[id].isGroup && schema.nodes[id].kind !== "root") : []),
    [schema],
  );
  const initialCollapsed = () => {
    if (!collapseOnStartup) return {} as Record<string, boolean>;
    const next: Record<string, boolean> = {};
    for (const id of allGroupIds) next[id] = true;
    return next;
  };
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(initialCollapsed);
  const [uncheckedOpen, setUncheckedOpen] = useState(false);
  useEffect(() => { setCollapsed(initialCollapsed()); /* eslint-disable-next-line */ }, [schema, collapseOnStartup]);
  useEffect(() => {
    const onOpen = () => setUncheckedOpen(true);
    window.addEventListener("dm:open-unchecked", onOpen as EventListener);
    return () => window.removeEventListener("dm:open-unchecked", onOpen as EventListener);
  }, []);
  const setGroupOpen = (id: string, open: boolean) =>
    setCollapsed((c) => ({ ...c, [id]: !open }));

  // Auto-expand ancestors of selected node
  useEffect(() => {
    if (!selectedId || !schema) return;
    const node = schema.nodes[selectedId];
    if (!node) return;
    const toOpen: string[] = [];
    let pid = node.parentId;
    while (pid) {
      const p = schema.nodes[pid];
      if (!p) break;
      if (p.isGroup && p.kind !== "root") toOpen.push(pid);
      pid = p.parentId;
    }
    if (toOpen.length) {
      setCollapsed((c) => {
        const next = { ...c };
        for (const id of toOpen) next[id] = false;
        return next;
      });
    }
  }, [selectedId, schema]);

  const topSegments = useMemo(
    () => (schema ? buildSegments(schema, schema.nodes[schema.rootId], q, filters, flaggedFilter) : []),
    [schema, q, filters, flaggedFilter],
  );
  const hasAnyTopGroup = useMemo(
    () => (schema ? schema.nodes[schema.rootId].childrenIds.some((id) => schema.nodes[id].isGroup) : false),
    [schema],
  );

  if (!schema) return null;

  // All real leaf fields in the schema (excluding root, groups, and loop containers).
  const allLeafFieldIds = schema.order.filter((id) => {
    const n = schema.nodes[id];
    return n && n.kind !== "root" && !n.isGroup;
  });
  const totalFields = allLeafFieldIds.length;
  const uncheckedFieldIds = allLeafFieldIds.filter((id) => !isDone(doneKey(schema.nodes[id])));
  const doneCount = totalFields - uncheckedFieldIds.length;

  const collapseAll = () => {
    const next: Record<string, boolean> = {};
    for (const id of allGroupIds) next[id] = true;
    setCollapsed(next);
  };
  const expandAll = () => setCollapsed({});

  const exportProgress = () => {
    const base = (fileName || "form").replace(/\.json$/i, "");
    const payload = { type: "dm-progress", version: 1, fileName, savedAt: new Date().toISOString(), done };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `${base}.progress.json`; a.click();
    URL.revokeObjectURL(url);
    toast.success("Progress exported");
  };

  // Build the linear list of navigable (visible-by-filters) leaf fields
  const navFieldIds = useMemo(() => {
    if (!schema) return [] as string[];
    return schema.order.filter((id) => {
      const n = schema.nodes[id];
      return n && !n.isGroup && n.kind !== "root" && matchField(n, q, filters, flaggedFilter);
    });
  }, [schema, q, filters, flaggedFilter]);

  const scrollToFieldId = (next: string) => {
    // Expand ancestor groups so the target is rendered, then scroll smoothly.
    const target = schema.nodes[next];
    if (target) {
      const toOpen: string[] = [];
      let pid = target.parentId;
      while (pid) {
        const p = schema.nodes[pid];
        if (!p) break;
        if (p.isGroup && p.kind !== "root") toOpen.push(pid);
        pid = p.parentId;
      }
      if (toOpen.length) {
        setCollapsed((c) => {
          const nc = { ...c };
          for (const id of toOpen) nc[id] = false;
          return nc;
        });
      }
    }
    const start = performance.now();
    const tryScroll = () => {
      const el = document.querySelector<HTMLElement>(`[data-node-id="${next}"]`);
      if (el && el.offsetParent !== null) {
        const container = scrollRef.current;
        if (container) {
          const elRect = el.getBoundingClientRect();
          const cRect = container.getBoundingClientRect();
          const top =
            container.scrollTop +
            (elRect.top - cRect.top) -
            (container.clientHeight - el.clientHeight) / 2;
          container.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
        } else {
          el.scrollIntoView({ behavior: "smooth", block: "center" });
        }
        return;
      }
      if (performance.now() - start < 800) requestAnimationFrame(tryScroll);
    };
    requestAnimationFrame(tryScroll);
  };

  const goToNeighbor = (dir: 1 | -1) => {
    if (!navFieldIds.length) return;
    const curIdx = selectedId ? navFieldIds.indexOf(selectedId) : -1;
    let nextIdx: number;
    if (curIdx === -1) nextIdx = dir === 1 ? 0 : navFieldIds.length - 1;
    else nextIdx = (curIdx + dir + navFieldIds.length) % navFieldIds.length;
    const next = navFieldIds[nextIdx];
    select(next);
    scrollToFieldId(next);
  };

  const jumpToNextUnchecked = () => {
    if (!navFieldIds.length) return;
    const curIdx = selectedId ? navFieldIds.indexOf(selectedId) : -1;
    const findFrom = (start: number) => {
      for (let i = start; i < navFieldIds.length; i++) {
        const id = navFieldIds[i];
        if (!isDone(doneKey(schema.nodes[id]))) return id;
      }
      return null;
    };
    const next = findFrom(curIdx + 1) ?? findFrom(0);
    if (!next) { toast.success("All fields checked"); return; }
    select(next);
    scrollToFieldId(next);
  };
  const importProgress = async (file: File) => {
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      const next = data && typeof data === "object" && data.done && typeof data.done === "object" ? data.done : data;
      if (!next || typeof next !== "object") throw new Error("Invalid file");
      const incomingFile = data && typeof data === "object" ? data.fileName : null;
      const hasExisting = Object.keys(done).length > 0;
      const fileMismatch = incomingFile && fileName && incomingFile !== fileName;
      let mode: "replace" | "merge" = "replace";
      if (fileMismatch) {
        const ok = window.confirm(`This progress file was saved for "${incomingFile}", but the current file is "${fileName}".\n\nLoad it anyway? This will REPLACE your current progress.`);
        if (!ok) return;
      } else if (hasExisting) {
        const choice = window.confirm(`You already have ${Object.keys(done).length} field(s) marked done.\n\nOK = Replace with imported progress.\nCancel = Merge (keep both).`);
        mode = choice ? "replace" : "merge";
      }
      if (mode === "merge") { replaceDone({ ...done, ...(next as Record<string, boolean>) }); toast.success("Progress merged"); }
      else { replaceDone(next as Record<string, boolean>); toast.success("Progress imported"); }
    } catch {
      toast.error("Could not import progress file");
    }
  };

  return (
    <div className="relative flex min-h-0 flex-1 flex-col bg-background">
    <div ref={scrollRef} className="relative flex-1 overflow-auto scrollbar-thin">
      <div className="mx-auto max-w-6xl space-y-3 p-4">
        {hasAnyTopGroup && (
          <div className="flex items-center justify-end gap-2">
            <div className="mr-auto flex items-center gap-2 text-[11px] text-muted-foreground">
              <button
                type="button"
                onClick={() => setUncheckedOpen(true)}
                disabled={totalFields === 0}
                title={uncheckedFieldIds.length === 0
                  ? "All fields checked"
                  : `Show ${uncheckedFieldIds.length} unchecked field(s)`}
                className={cn(
                  "group flex items-center gap-2 rounded-md px-1.5 py-0.5 transition-colors",
                  "hover:bg-surface-2 hover:text-foreground disabled:pointer-events-none disabled:opacity-60",
                )}
              >
                <span className="font-mono-tight tabular-nums">
                  {totalFields ? Math.round((doneCount / totalFields) * 100) : 0}%
                </span>
                <div className="h-1.5 w-32 overflow-hidden rounded-full bg-surface-2 group-hover:bg-background">
                  <div
                    className="h-full bg-primary transition-all"
                    style={{ width: `${totalFields ? (doneCount / totalFields) * 100 : 0}%` }}
                  />
                </div>
                <span className="font-mono-tight tabular-nums text-muted-foreground/80">
                  {doneCount}/{totalFields}
                </span>
              </button>
              {doneCount > 0 && (
                <button
                  onClick={() => {
                    if (window.confirm(`Clear all ${doneCount} done marker(s) for "${fileName}"?`)) { clearDone(); toast.success("Progress cleared"); }
                  }}
                  className="rounded px-1.5 py-0.5 text-[10px] text-muted-foreground hover:bg-surface-2 hover:text-foreground"
                  title="Clear saved progress for this file"
                >Clear</button>
              )}
              {totalFields > 0 && doneCount < totalFields && (
                <button
                  onClick={() => {
                    const remaining = totalFields - doneCount;
                    if (!window.confirm(`Mark all ${remaining} unchecked field(s) as done for "${fileName}"?`)) return;
                    const next: Record<string, boolean> = { ...done };
                    for (const id of allLeafFieldIds) next[doneKey(schema.nodes[id])] = true;
                    replaceDone(next);
                    toast.success(`All ${totalFields} fields checked`);
                  }}
                  className="rounded px-1.5 py-0.5 text-[10px] text-muted-foreground hover:bg-surface-2 hover:text-foreground"
                  title="Override: mark every field as done"
                >Check all</button>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) importProgress(f); e.target.value = ""; }}
            />
            <div className="flex h-7 items-center rounded-md border border-border bg-surface-2 p-0.5">
              <button onClick={exportProgress} title="Export progress to a JSON file" className="flex h-6 items-center gap-1 rounded px-2 text-[11px] font-medium text-muted-foreground hover:bg-surface hover:text-foreground">
                <Download className="h-3.5 w-3.5" /> Save
              </button>
              <button onClick={() => fileInputRef.current?.click()} title="Import progress from a JSON file" className="flex h-6 items-center gap-1 rounded px-2 text-[11px] font-medium text-muted-foreground hover:bg-surface hover:text-foreground">
                <Upload className="h-3.5 w-3.5" /> Load
              </button>
            </div>
            <div className="flex h-7 items-center rounded-md border border-border bg-surface-2 p-0.5">
              <button onClick={collapseAll} title="Collapse all groups" className="flex h-6 items-center gap-1 rounded px-2 text-[11px] font-medium text-muted-foreground hover:bg-surface hover:text-foreground">
                <ChevronsDownUp className="h-3.5 w-3.5" /> Collapse all
              </button>
              <button onClick={expandAll} title="Expand all groups" className="flex h-6 items-center gap-1 rounded px-2 text-[11px] font-medium text-muted-foreground hover:bg-surface hover:text-foreground">
                <ChevronsUpDown className="h-3.5 w-3.5" /> Expand all
              </button>
            </div>
          </div>
        )}

        {topSegments.map((seg, i) =>
          seg.type === "fields" ? (
            <LooseCard key={`loose-${i}`} fields={seg.fields} reviewMode={reviewMode} selectedId={selectedId} onSelect={select} isDone={isDone} toggleDone={toggleDone} />
          ) : (
            <GroupCard
              key={seg.node.id}
              schema={schema}
              node={seg.node}
              q={q}
              filters={filters}
              extraFilter={flaggedFilter}
              depth={1}
              collapsed={collapsed}
              setGroupOpen={setGroupOpen}
              reviewMode={reviewMode}
              selectedId={selectedId}
              onSelect={select}
              isDone={isDone}
              toggleDone={toggleDone}
            />
          ),
        )}

        {topSegments.length === 0 && (
          <div className="rounded-lg border border-dashed border-border p-12 text-center text-sm text-muted-foreground">
            No fields match the current filters.
          </div>
        )}
      </div>
      </div>
      <BackToTop scrollRef={scrollRef} />
      {/* Floating field navigator — prev / skip-to-unchecked / next */}
      {navFieldIds.length > 1 && (
        <TooltipProvider delayDuration={200}>
          <div
            className="absolute bottom-4 right-16 z-20 flex h-10 items-center rounded-full border border-border bg-surface/95 shadow-lg backdrop-blur"
            role="group"
            aria-label="Field navigation"
          >
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => goToNeighbor(-1)}
                  aria-label="Previous field"
                  className="flex h-10 w-9 items-center justify-center rounded-l-full text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="top" className="text-[11px]">Previous field</TooltipContent>
            </Tooltip>
            <div className="h-5 w-px bg-border" aria-hidden />
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={jumpToNextUnchecked}
                  disabled={doneCount >= totalFields}
                  aria-label="Jump to next unchecked field"
                  className={cn(
                    "flex h-10 items-center gap-1 px-2.5 text-[11px] font-medium text-muted-foreground transition-colors",
                    "hover:bg-primary hover:text-primary-foreground",
                    "disabled:pointer-events-none disabled:opacity-50",
                  )}
                >
                  <SkipForward className="h-3.5 w-3.5" />
                  <span className="font-mono-tight tabular-nums">
                    {Math.max(0, totalFields - doneCount)}
                  </span>
                </button>
              </TooltipTrigger>
              <TooltipContent side="top" className="text-[11px]">
                Next unchecked field ({Math.max(0, totalFields - doneCount)} left)
              </TooltipContent>
            </Tooltip>
            <div className="h-5 w-px bg-border" aria-hidden />
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => goToNeighbor(1)}
                  aria-label="Next field"
                  className="flex h-10 w-9 items-center justify-center rounded-r-full text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="top" className="text-[11px]">Next field</TooltipContent>
            </Tooltip>
          </div>
        </TooltipProvider>
      )}
      <UncheckedFieldsDialog
        open={uncheckedOpen}
        onOpenChange={setUncheckedOpen}
        schema={schema}
        uncheckedIds={uncheckedFieldIds}
        totalFields={totalFields}
        doneCount={doneCount}
        onJump={(id) => {
          setUncheckedOpen(false);
          select(id);
          scrollToFieldId(id);
        }}
      />
    </div>
  );
}

type FieldsProps = {
  fields: DMNode[];
  reviewMode: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
  isDone: (key: string) => boolean;
  toggleDone: (key: string, value?: boolean) => void;
};

function LooseCard(p: FieldsProps) {
  return (
    <section className="overflow-hidden rounded-lg border border-border bg-surface">
      <header className="flex items-center gap-2 border-b border-border bg-surface-2 px-3 py-2">
        <Folder className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <span className="whitespace-nowrap text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Top level</span>
        <span className="ml-auto whitespace-nowrap text-[10px] text-muted-foreground">{p.fields.length} fields</span>
      </header>
      <FieldsTable {...p} />
    </section>
  );
}

function GroupCard({
  schema, node, q, filters, extraFilter, depth, collapsed, setGroupOpen,
  reviewMode, selectedId, onSelect, isDone, toggleDone,
}: {
  schema: DMSchema; node: DMNode; q: string; filters: any; extraFilter?: (n: DMNode) => boolean; depth: number;
  collapsed: Record<string, boolean>; setGroupOpen: (id: string, open: boolean) => void;
} & Omit<FieldsProps, "fields">) {
  const open = !collapsed[node.id];
  const visibleCount = countLeaves(schema, node, q, filters, extraFilter);
  const doneCount = countDoneLeaves(schema, node, q, filters, isDone);
  const allDone = visibleCount > 0 && doneCount === visibleCount;
  if (visibleCount === 0 && (q || filters.kinds.size || filters.onlyConditional || filters.onlyRequired || filters.onlyLoops || extraFilter)) {
    return null;
  }
  const segments = buildSegments(schema, node, q, filters, extraFilter);
  const isLoop = node.isLoop;
  const isSel = selectedId === node.id;
  const { map: reviewMap, toggleNeedsEdit } = useReviewFields();
  const groupDk = doneKey(node);
  const groupFlagged = !!reviewMap[groupDk]?.needsEdit;

  return (
    <Collapsible open={open} onOpenChange={(o) => setGroupOpen(node.id, o)} asChild>
      <section
        data-node-id={node.id}
        className={cn(
          "overflow-hidden rounded-lg border bg-surface",
          isLoop ? "border-type-loop/40" : isSel ? "border-primary ring-2 ring-primary/30" : "border-border",
        )}
      >
        <header
          onClick={() => onSelect(node.id)}
          className={cn(
            "flex cursor-pointer items-center gap-2 border-b px-3 py-2",
            isLoop ? "border-type-loop/30 bg-type-loop/5" : isSel ? "border-primary bg-primary/10" : "border-border bg-surface-2",
          )}
        >
          <CollapsibleTrigger asChild>
            <button
              onClick={(e) => e.stopPropagation()}
              aria-label={open ? "Collapse group" : "Expand group"}
              className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-surface-3 hover:text-foreground"
            >
              <ChevronRight className={cn("h-3.5 w-3.5 transition-transform duration-200", open && "rotate-90")} />
            </button>
          </CollapsibleTrigger>
          {isLoop ? (
            <Repeat2 className="h-4 w-4 text-type-loop" />
          ) : open ? (
            <FolderOpen className="h-4 w-4 text-muted-foreground" />
          ) : (
            <Folder className="h-4 w-4 text-muted-foreground" />
          )}
          <span className="font-mono-tight text-[10px] text-muted-foreground">L{depth}</span>
          <h3 className="text-[13px] font-semibold text-foreground">{node.title}</h3>
          <span className="font-mono-tight text-[10px] text-muted-foreground">{node.identifier}</span>
          {isLoop && (
            <span className="rounded border border-type-loop/30 bg-type-loop/10 px-1.5 py-0.5 font-mono-tight text-[9px] uppercase tracking-wider text-type-loop">
              loop · {node.minOccurs ?? 0}–{node.maxOccurs ?? "∞"}
            </span>
          )}
          {reviewMode && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                const next = !groupFlagged;
                toggleNeedsEdit(groupDk, next);
                onSelect(node.id);
                if (next) useFormStore.getState().pulseReviewOpen();
              }}
              title={groupFlagged ? `Unflag this ${isLoop ? "loop" : "group"}` : `Flag this ${isLoop ? "loop" : "group"} as needing edit`}
              className={cn(
                "ml-1 inline-flex items-center gap-1 rounded border px-1.5 py-0.5 font-mono-tight text-[9px] font-semibold uppercase tracking-wider transition-colors",
                groupFlagged
                  ? "border-destructive/40 bg-destructive/10 text-destructive"
                  : "border-border bg-surface-2 text-muted-foreground/70 hover:border-destructive/40 hover:text-destructive",
              )}
            >
              <Flag className="h-3 w-3" strokeWidth={groupFlagged ? 2.5 : 1.75} />
              {groupFlagged ? "Flagged" : "Flag"}
            </button>
          )}
          <span
            title={allDone ? "All fields checked" : `${doneCount} of ${visibleCount} checked`}
            className={cn(
              "ml-auto inline-flex items-center gap-1 rounded border px-1.5 py-0.5 font-mono-tight text-[10px] font-semibold",
              allDone
                ? "border-success/40 bg-success/15 text-success"
                : doneCount > 0
                ? "border-warning/40 bg-warning/10 text-warning"
                : "border-border bg-surface-2 text-muted-foreground",
            )}
          >
            <Check className="h-2.5 w-2.5" />
            {doneCount}/{visibleCount}
          </span>
          <span className="rounded bg-surface-3 px-1.5 py-0.5 font-mono-tight text-[10px] font-semibold text-foreground">
            {visibleCount} fields
          </span>
        </header>
        <CollapsibleContent className="overflow-hidden data-[state=open]:animate-collapsible-down data-[state=closed]:animate-collapsible-up">
          <div className="relative">
            {segments.map((seg, i) =>
              seg.type === "fields" ? (
                <FieldsTable
                  key={`f-${i}`}
                  fields={seg.fields}
                  reviewMode={reviewMode}
                  selectedId={selectedId}
                  onSelect={onSelect}
                  isDone={isDone}
                  toggleDone={toggleDone}
                />
              ) : (
                <div key={seg.node.id} className="space-y-2 p-2 pl-4 border-l-2 border-dashed border-border/60">
                  <GroupCard
                    schema={schema}
                    node={seg.node}
                    q={q}
                    filters={filters}
                    extraFilter={extraFilter}
                    depth={depth + 1}
                    collapsed={collapsed}
                    setGroupOpen={setGroupOpen}
                    reviewMode={reviewMode}
                    selectedId={selectedId}
                    onSelect={onSelect}
                    isDone={isDone}
                    toggleDone={toggleDone}
                  />
                </div>
              ),
            )}
          </div>
        </CollapsibleContent>
      </section>
    </Collapsible>
  );
}

function FieldsTable({ fields, reviewMode, selectedId, onSelect, isDone, toggleDone }: FieldsProps) {
  const { map: reviewMap, toggleNeedsEdit } = useReviewFields();
  const zebraRows = useFormStore((s) => s.zebraRows);
  return (
    <table className="w-full border-separate border-spacing-0 text-[12px]">
      <colgroup>
        <col className="w-8" />
        {reviewMode && <col className="w-9" />}
        <col />
        <col className="w-[140px]" />
        <col className="w-[40%]" />
      </colgroup>
      <tbody>
        {fields.map((node) => {
          const sel = selectedId === node.id;
          const dk = doneKey(node);
          const done = isDone(dk);
          const flagged = !!reviewMap[dk]?.needsEdit;
          return (
            <tr
              key={node.id}
              data-node-id={node.id}
              onClick={() => onSelect(node.id)}
              className={cn(
                "cursor-pointer transition-colors hover:bg-surface-2/60",
                // Subtle zebra striping for easy row separation — only when no state color applies
                zebraRows && !sel && !done && !flagged && "even:bg-surface-2",
                sel && "bg-primary/5",
                done && !sel && "bg-success/5",
                flagged && !sel && "bg-destructive/[0.06]",
              )}
              style={flagged ? { boxShadow: "inset 3px 0 0 0 hsl(var(--destructive))" } : undefined}
            >
              <td className={cn("border-b border-border/60 px-2 py-2 align-top", sel && "border-l-2 border-l-primary")}>
                <div className="flex flex-col items-center gap-0.5">
                  <PillToggle
                    checked={done}
                    onCheckedChange={(v) => toggleDone(dk, v)}
                    title={done ? "Mark not checked" : "Mark checked"}
                    size="sm"
                  />
                  <span
                    className={cn(
                      "flex items-center gap-0.5 text-[8px] font-semibold uppercase tracking-wide leading-none transition-colors",
                      done ? "text-success" : "text-muted-foreground/50",
                    )}
                    aria-hidden="true"
                  >
                    <Check className="h-2.5 w-2.5" strokeWidth={3} />
                    {done ? "Checked" : "Check"}
                  </span>
                </div>
              </td>
              {reviewMode && (
                <td className="border-b border-border/60 px-2 py-2 align-top">
                  <div className="flex flex-col items-center gap-0.5">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        const next = !flagged;
                        toggleNeedsEdit(dk, next);
                        onSelect(node.id);
                        if (next) useFormStore.getState().pulseReviewOpen();
                      }}
                      title={flagged ? "Unflag" : "Flag as needing edit"}
                      className={cn(
                        "flex h-5 w-5 items-center justify-center rounded transition-colors",
                        flagged ? "bg-destructive/15 text-destructive" : "text-muted-foreground hover:bg-surface-3 hover:text-destructive",
                      )}
                    >
                      <Flag className="h-3.5 w-3.5" strokeWidth={flagged ? 2.5 : 1.75} />
                    </button>
                    <span
                      className={cn(
                        "flex items-center gap-0.5 text-[8px] font-semibold uppercase tracking-wide leading-none transition-colors",
                        flagged ? "text-destructive" : "text-muted-foreground/50",
                      )}
                      aria-hidden="true"
                    >
                      {flagged ? "Flagged" : "Flag"}
                    </span>
                  </div>
                </td>
              )}
              <td className="border-b border-border/60 px-3 py-2 align-top">
                <div className="flex items-start gap-2">
                  <TypeBadge kind={node.kind} className="mt-0.5" />
                  <div className="min-w-0">
                    <div className={cn("font-semibold text-foreground", done && "line-through opacity-60")}>{node.title}</div>
                    <div className="font-mono-tight text-[10px] text-muted-foreground break-all">{node.identifier}</div>
                  </div>
                </div>
              </td>
              <td className="border-b border-border/60 px-3 py-2 align-top">
                <PropertiesCell node={node} />
              </td>
              <td className="border-b border-border/60 px-3 py-2 align-top">
                <DetailsCell node={node} />
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function getGroupPath(schema: DMSchema, node: DMNode): DMNode[] {
  const path: DMNode[] = [];
  let pid = node.parentId;
  while (pid) {
    const p = schema.nodes[pid];
    if (!p) break;
    if (p.isGroup && p.kind !== "root") path.unshift(p);
    pid = p.parentId;
  }
  return path;
}

function UncheckedFieldsDialog({
  open, onOpenChange, schema, uncheckedIds, totalFields, doneCount, onJump,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  schema: DMSchema;
  uncheckedIds: string[];
  totalFields: number;
  doneCount: number;
  onJump: (id: string) => void;
}) {
  // Group unchecked fields by their immediate folder/group path (joined titles).
  const groups = useMemo(() => {
    const map = new Map<string, { key: string; path: DMNode[]; fields: DMNode[] }>();
    for (const id of uncheckedIds) {
      const n = schema.nodes[id];
      if (!n) continue;
      const path = getGroupPath(schema, n);
      const key = path.map((p) => p.id).join("/") || "__root__";
      let entry = map.get(key);
      if (!entry) { entry = { key, path, fields: [] }; map.set(key, entry); }
      entry.fields.push(n);
    }
    return Array.from(map.values());
  }, [uncheckedIds, schema]);

  const pct = totalFields ? Math.round((doneCount / totalFields) * 100) : 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl p-0 overflow-hidden">
        <DialogHeader className="border-b border-border bg-surface-2 px-5 py-3">
          <DialogTitle className="flex items-center gap-2 text-sm">
            <ListChecks className="h-4 w-4 text-primary" />
            Unchecked fields
            <span className="ml-2 font-mono-tight text-[11px] font-normal text-muted-foreground">
              {uncheckedIds.length} left · {doneCount}/{totalFields} done · {pct}%
            </span>
          </DialogTitle>
          <DialogDescription className="text-[11px]">
            Click any field to jump to it.
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[60vh] overflow-auto scrollbar-thin">
          {uncheckedIds.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-12 text-sm text-muted-foreground">
              <Check className="h-6 w-6 text-primary" />
              All fields are checked.
            </div>
          ) : (
            <div className="divide-y divide-border">
              {groups.map((g) => (
                <div key={g.key}>
                  <div className="sticky top-0 z-10 flex items-center gap-1.5 bg-surface-2/95 px-4 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground backdrop-blur">
                    <Folder className="h-3 w-3" />
                    {g.path.length === 0 ? (
                      <span>Top level</span>
                    ) : (
                      g.path.map((p, i) => (
                        <span key={p.id} className="flex items-center gap-1">
                          {i > 0 && <ChevronRight className="h-3 w-3 opacity-50" />}
                          <span>{p.title || p.identifier}</span>
                        </span>
                      ))
                    )}
                    <span className="ml-auto font-mono-tight tabular-nums text-muted-foreground/70">
                      {g.fields.length}
                    </span>
                  </div>
                  <table className="w-full text-[12px]">
                    <tbody>
                      {g.fields.map((n) => (
                        <tr
                          key={n.id}
                          onClick={() => onJump(n.id)}
                          className="cursor-pointer transition-colors hover:bg-surface-2/60"
                        >
                          <td className="w-0 whitespace-nowrap px-4 py-2 align-top">
                            <TypeBadge kind={n.kind} />
                          </td>
                          <td className="px-2 py-2 align-top">
                            <div className="font-semibold text-foreground">{n.title}</div>
                            <div className="font-mono-tight text-[10px] text-muted-foreground break-all">
                              {n.identifier}
                            </div>
                          </td>
                          <td className="px-2 py-2 align-top">
                            <PropertiesCell node={n} />
                          </td>
                          <td className="w-0 whitespace-nowrap px-4 py-2 text-right align-middle text-muted-foreground">
                            <ChevronRight className="inline h-4 w-4" />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}