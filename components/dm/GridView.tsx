import { PillToggle } from "@/components/dm/PillToggle";
import { useMemo, useState, useEffect, useRef } from "react";
import { useFormStore } from "@/store/useFormStore";
import { TypeBadge } from "./TypeBadge";
import { Eye, Asterisk, Filter, Repeat2, ChevronDown, ChevronRight, Folder, FolderOpen, Layers, ChevronsDownUp, ChevronsUpDown, Download, Upload, Lock, Calculator } from "lucide-react";
import { Check } from "lucide-react";
import { BackToTop } from "./BackToTop";
import { cn } from "@/lib/utils";
import { DMNode, DMSchema } from "@/lib/dm/types";
import { useDoneFields, doneKey } from "@/hooks/useDoneFields";
import { useReviewFields } from "@/hooks/useReviewFields";
import { stripPlainEnglishMarkers } from "@/lib/dm/expression";
import { toast } from "sonner";
import { Collapsible, CollapsibleContent } from "@/components/ui/collapsible";

/** Cycling depth colors so each nesting level has its own accent. */
const DEPTH_COLORS = [
  "var(--type-group)",
  "var(--type-loop)",
  "var(--type-select)",
  "var(--type-email)",
  "var(--type-boolean)",
];
function depthColor(depth: number) {
  return `hsl(${DEPTH_COLORS[(depth - 1) % DEPTH_COLORS.length]})`;
}

function matchField(n: DMNode, q: string, filters: ReturnType<typeof useFormStore.getState>["filters"]): boolean {
  if (q && !n.identifier.toLowerCase().includes(q) && !n.title.toLowerCase().includes(q)) return false;
  if (filters.kinds.size && !filters.kinds.has(n.kind)) return false;
  if (filters.onlyConditional && !n.visibleExpr) return false;
  if (filters.onlyRequired && !n.requiredRule) return false;
  if (filters.onlyLoops && !n.isLoop) return false;
  return true;
}

const VIS_TRUNC = 80;
function VisibilityCell({ text, tooltip, collapseLong }: { text: string; tooltip: string; collapseLong: boolean }) {
  const [open, setOpen] = useState(false);
  const long = collapseLong && text.length > VIS_TRUNC;
  const display = long && !open ? text.slice(0, VIS_TRUNC).trimEnd() + "…" : text;
  return (
    <div title={tooltip} className="flex items-start gap-1 text-[11px] text-info max-w-[340px]">
      <Eye className="mt-0.5 h-3 w-3 shrink-0" />
      {long ? (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
          className="min-w-0 cursor-pointer text-left break-words [overflow-wrap:anywhere] hover:underline"
          title={open ? "Click to collapse" : "Click to expand"}
        >
          {display}
        </button>
      ) : (
        <span className="min-w-0 break-words [overflow-wrap:anywhere]">{display}</span>
      )}
    </div>
  );
}

function IdentifierCell({ identifier, defaultOpen }: { identifier: string; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
      title={open ? "Click to collapse" : identifier}
      className={cn(
        "block w-full min-w-0 cursor-pointer text-left font-mono-tight text-[11px] text-muted-foreground hover:text-foreground",
        open ? "break-words [overflow-wrap:anywhere]" : "truncate",
      )}
    >
      {identifier}
    </button>
  );
}

/** Recursively count visible (post-filter) leaf fields under a group. */
function countLeaves(schema: DMSchema, node: DMNode, q: string, filters: any): number {
  let n = 0;
  for (const cid of node.childrenIds) {
    const c = schema.nodes[cid];
    if (c.isGroup) n += countLeaves(schema, c, q, filters);
    else if (matchField(c, q, filters)) n++;
  }
  return n;
}

/** Recursively count visible (post-filter) leaves marked done. */
function countDoneLeaves(
  schema: DMSchema,
  node: DMNode,
  q: string,
  filters: any,
  done: Record<string, boolean>,
): number {
  let n = 0;
  for (const cid of node.childrenIds) {
    const c = schema.nodes[cid];
    if (c.isGroup) n += countDoneLeaves(schema, c, q, filters, done);
    else if (matchField(c, q, filters) && done[doneKey(c)]) n++;
  }
  return n;
}

type Segment = { type: "fields"; fields: DMNode[] } | { type: "group"; node: DMNode };

/**
 * Build a flat list of segments preserving JSON child order: contiguous loose
 * fields are coalesced into a single "fields" segment; each group becomes its
 * own "group" segment. Returns only non-empty segments so empty/filtered runs
 * disappear naturally.
 */
function buildSegments(schema: DMSchema, parent: DMNode, q: string, filters: any): Segment[] {
  const out: Segment[] = [];
  let run: DMNode[] = [];
  const flush = () => {
    if (run.length) {
      out.push({ type: "fields", fields: run });
      run = [];
    }
  };
  for (const cid of parent.childrenIds) {
    const c = schema.nodes[cid];
    if (c.isGroup) {
      flush();
      out.push({ type: "group", node: c });
    } else if (matchField(c, q, filters)) {
      run.push(c);
    }
  }
  flush();
  return out;
}

export function GridView() {
  const { schema, filters, selectedId, select, fileName, collapseOnStartup } = useFormStore();
  const { done, toggle: toggleDone, clear: clearDone, replace: replaceDone } = useDoneFields();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  if (!schema) return null;
  const root = schema.nodes[schema.rootId];
  const q = filters.query.toLowerCase();

  // Interleaved top-level segments — preserves JSON order so loose fields
  // that appear between groups stay in their original position rather than
  // being hoisted to the top.
  const topSegments = useMemo(
    () => buildSegments(schema, root, q, filters),
    [schema, root, q, filters],
  );
  const hasAnyTopGroup = useMemo(
    () => root.childrenIds.some((id) => schema.nodes[id].isGroup),
    [schema, root],
  );

  const allGroupIds = useMemo(
    () => schema.order.filter((id) => schema.nodes[id].isGroup && schema.nodes[id].kind !== "root"),
    [schema],
  );
  const initialCollapsed = () => {
    if (!collapseOnStartup) return {};
    const next: Record<string, boolean> = {};
    for (const id of allGroupIds) next[id] = true;
    return next;
  };
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(initialCollapsed);
  useEffect(() => { setCollapsed(initialCollapsed()); }, [schema, collapseOnStartup]);
  const setOpen = (id: string, open: boolean) =>
    setCollapsed((c) => ({ ...c, [id]: !open }));

  // When selection changes (e.g. from the sidebar tree), expand ancestor groups
  // and scroll the selected row/group into view in the middle pane.
  useEffect(() => {
    if (!selectedId || !schema) return;
    const node = schema.nodes[selectedId];
    if (!node) return;
    // Walk up the parent chain and ensure each ancestor group is open.
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
    // Defer to next frame so any newly expanded groups render first.
    const raf = requestAnimationFrame(() => {
      const el = document.querySelector<HTMLElement>(`[data-node-id="${selectedId}"]`);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
    });
    return () => cancelAnimationFrame(raf);
  }, [selectedId, schema]);

  const collapseAll = () => {
    const next: Record<string, boolean> = {};
    for (const id of allGroupIds) next[id] = true;
    setCollapsed(next);
  };
  const expandAll = () => setCollapsed({});

  const totalFields = schema.order.filter((id) => {
    const n = schema.nodes[id];
    return n.kind !== "root" && !n.isGroup;
  }).length;
  const doneCount = Object.keys(done).length;

  const exportProgress = () => {
    const base = (fileName || "form").replace(/\.json$/i, "");
    const payload = {
      type: "dm-progress",
      version: 1,
      fileName,
      savedAt: new Date().toISOString(),
      done,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${base}.progress.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Progress exported");
  };

  const importProgress = async (file: File) => {
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      const next = data && typeof data === "object" && data.done && typeof data.done === "object"
        ? data.done
        : data;
      if (!next || typeof next !== "object") throw new Error("Invalid file");
      const incomingFile = data && typeof data === "object" ? data.fileName : null;
      const hasExisting = Object.keys(done).length > 0;
      const fileMismatch = incomingFile && fileName && incomingFile !== fileName;

      let mode: "replace" | "merge" | "cancel" = "replace";
      if (fileMismatch) {
        const ok = window.confirm(
          `This progress file was saved for "${incomingFile}", but the current file is "${fileName}".\n\nLoad it anyway? This will REPLACE your current progress.`,
        );
        if (!ok) return;
        mode = "replace";
      } else if (hasExisting) {
        const choice = window.confirm(
          `You already have ${Object.keys(done).length} field(s) marked done.\n\nOK = Replace with imported progress.\nCancel = Merge (keep both).`,
        );
        mode = choice ? "replace" : "merge";
      }

      if (mode === "merge") {
        replaceDone({ ...done, ...(next as Record<string, boolean>) });
        toast.success("Progress merged");
      } else {
        replaceDone(next as Record<string, boolean>);
        toast.success("Progress imported");
      }
    } catch {
      toast.error("Could not import progress file");
    }
  };

  return (
    <div ref={scrollRef} className="relative min-w-0 flex-1 overflow-auto scrollbar-thin bg-background">
      <div className="min-w-[1120px] space-y-3 p-4">
        {hasAnyTopGroup && (
          <div className="flex items-center justify-end gap-2">
            <div className="mr-auto flex items-center gap-2 text-[11px] text-muted-foreground">
              <span className="font-mono-tight">
                {doneCount} / {totalFields} done
              </span>
              <div className="h-1.5 w-32 overflow-hidden rounded-full bg-surface-2">
                <div
                  className="h-full bg-primary transition-all"
                  style={{ width: `${totalFields ? (doneCount / totalFields) * 100 : 0}%` }}
                />
              </div>
              {doneCount > 0 && (
                <button
                  onClick={() => {
                    if (window.confirm(`Clear all ${doneCount} done marker(s) for "${fileName}"?`)) {
                      clearDone();
                      toast.success("Progress cleared");
                    }
                  }}
                  className="rounded px-1.5 py-0.5 text-[10px] text-muted-foreground hover:bg-surface-2 hover:text-foreground"
                  title="Clear saved progress for this file"
                >
                  Clear
                </button>
              )}
              {totalFields > 0 && doneCount < totalFields && (
                <button
                  onClick={() => {
                    const remaining = totalFields - doneCount;
                    if (!window.confirm(`Mark all ${remaining} unchecked field(s) as done for "${fileName}"?`)) return;
                    const next: Record<string, boolean> = { ...done };
                    for (const id of schema.order) {
                      const n = schema.nodes[id];
                      if (n.kind === "root" || n.isGroup) continue;
                      next[doneKey(n)] = true;
                    }
                    replaceDone(next);
                    toast.success(`All ${totalFields} fields checked`);
                  }}
                  className="rounded px-1.5 py-0.5 text-[10px] text-muted-foreground hover:bg-surface-2 hover:text-foreground"
                  title="Override: mark every field as done"
                >
                  Check all
                </button>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) importProgress(f);
                e.target.value = "";
              }}
            />
            <div className="flex h-7 items-center rounded-md border border-border bg-surface-2 p-0.5">
              <button
                onClick={exportProgress}
                title="Export progress to a JSON file"
                className="flex h-6 items-center gap-1 rounded px-2 text-[11px] font-medium text-muted-foreground hover:bg-surface hover:text-foreground"
              >
                <Download className="h-3.5 w-3.5" /> Save
              </button>
              <button
                onClick={() => fileInputRef.current?.click()}
                title="Import progress from a JSON file"
                className="flex h-6 items-center gap-1 rounded px-2 text-[11px] font-medium text-muted-foreground hover:bg-surface hover:text-foreground"
              >
                <Upload className="h-3.5 w-3.5" /> Load
              </button>
            </div>
            <div className="flex h-7 items-center rounded-md border border-border bg-surface-2 p-0.5">
              <button
                onClick={collapseAll}
                title="Collapse all groups"
                className="flex h-6 items-center gap-1 rounded px-2 text-[11px] font-medium text-muted-foreground hover:bg-surface hover:text-foreground"
              >
                <ChevronsDownUp className="h-3.5 w-3.5" /> Collapse all
              </button>
              <button
                onClick={expandAll}
                title="Expand all groups"
                className="flex h-6 items-center gap-1 rounded px-2 text-[11px] font-medium text-muted-foreground hover:bg-surface hover:text-foreground"
              >
                <ChevronsUpDown className="h-3.5 w-3.5" /> Expand all
              </button>
            </div>
          </div>
        )}
        {topSegments.map((seg, i) =>
          seg.type === "fields" ? (
            <LooseCard key={`loose-${i}`} fields={seg.fields} onSelect={select} selectedId={selectedId} done={done} toggleDone={toggleDone} />
          ) : (
            <GroupCard key={seg.node.id} schema={schema} node={seg.node} q={q} filters={filters} onSelect={select} selectedId={selectedId} collapsed={collapsed} setOpen={setOpen} done={done} toggleDone={toggleDone} />
          ),
        )}
        {topSegments.length === 0 && (
          <div className="rounded-lg border border-dashed border-border p-12 text-center text-sm text-muted-foreground">
            No fields match the current filters.
          </div>
        )}
      </div>
      <BackToTop scrollRef={scrollRef} />
    </div>
  );
}

function LooseCard({ fields, onSelect, selectedId, done, toggleDone }: { fields: DMNode[]; onSelect: (id: string) => void; selectedId: string | null; done: Record<string, boolean>; toggleDone: (identifier: string, value?: boolean) => void }) {
  return (
    <section className="overflow-hidden rounded-lg border border-border bg-surface">
      <header className="flex items-center gap-2 border-b border-border bg-surface-2 px-3 py-2">
        <Layers className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <span className="whitespace-nowrap text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Top level</span>
        <span className="ml-auto whitespace-nowrap text-[10px] text-muted-foreground">{fields.length} fields</span>
      </header>
      <FieldTable fields={fields} onSelect={onSelect} selectedId={selectedId} done={done} toggleDone={toggleDone} />
    </section>
  );
}

function GroupCard({
  schema, node, q, filters, onSelect, selectedId, depth = 1, collapsed, setOpen, done, toggleDone,
}: {
  schema: DMSchema; node: DMNode; q: string; filters: any;
  onSelect: (id: string) => void; selectedId: string | null; depth?: number;
  collapsed: Record<string, boolean>; setOpen: (id: string, open: boolean) => void;
  done: Record<string, boolean>; toggleDone: (identifier: string, value?: boolean) => void;
}) {
  const open = !collapsed[node.id];
  const visibleCount = countLeaves(schema, node, q, filters);
  const doneCount = countDoneLeaves(schema, node, q, filters, done);
  const allDone = visibleCount > 0 && doneCount === visibleCount;
  if (visibleCount === 0 && (q || filters.kinds.size || filters.onlyConditional || filters.onlyRequired || filters.onlyLoops)) {
    return null;
  }

  // Preserve JSON order — interleave runs of loose fields with sub-groups.
  const segments = buildSegments(schema, node, q, filters);
  const childGroupCount = node.childrenIds.reduce(
    (n, id) => n + (schema.nodes[id].isGroup ? 1 : 0),
    0,
  );

  const accent = depthColor(depth);
  const isLoop = node.isLoop;
  const isSel = selectedId === node.id;

  return (
    <section
      className={cn(
        "relative overflow-hidden rounded-lg border bg-surface",
        isLoop ? "border-type-loop/40" : isSel ? "border-primary" : "border-border",
        isSel && !isLoop && "ring-2 ring-primary/40",
      )}
      data-node-id={node.id}
    >
      {/* Vertical depth ribbon */}
      <div
        className="absolute left-0 top-0 h-full w-1"
        style={{ background: isLoop ? "hsl(var(--type-loop))" : isSel ? "hsl(var(--primary))" : accent }}
      />
      <header
        onClick={() => onSelect(node.id)}
        className={cn(
          "flex cursor-pointer items-center gap-2 border-b px-3 py-2 pl-4",
          isLoop
            ? "border-type-loop/30 bg-type-loop/5"
            : isSel
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border bg-surface-2",
        )}
      >
        <button
          onClick={(e) => { e.stopPropagation(); setOpen(node.id, !open); }}
          className={cn(
            "flex h-5 w-5 items-center justify-center rounded",
            isSel && !isLoop
              ? "text-primary-foreground/90 hover:bg-primary-foreground/10"
              : "text-muted-foreground hover:bg-surface-3 hover:text-foreground",
          )}
        >
          {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        </button>
        {isLoop ? (
          <Repeat2 className="h-4 w-4 text-type-loop" />
        ) : open ? (
          <FolderOpen className="h-4 w-4" style={{ color: isSel ? "hsl(var(--primary-foreground))" : accent }} />
        ) : (
          <Folder className="h-4 w-4" style={{ color: isSel ? "hsl(var(--primary-foreground))" : accent }} />
        )}
        <span className={cn("font-mono-tight text-[10px]", isSel && !isLoop ? "text-primary-foreground/80" : "text-muted-foreground")}>L{depth}</span>
        <h3 className={cn("text-[13px] font-semibold", isSel && !isLoop ? "text-primary-foreground" : "text-foreground")}>{node.title}</h3>
        {isLoop && (
          <span className="rounded border border-type-loop/30 bg-type-loop/10 px-1.5 py-0.5 font-mono-tight text-[9px] uppercase tracking-wider text-type-loop">
            loop · {node.minOccurs ?? 0}–{node.maxOccurs ?? "∞"}
          </span>
        )}
        {node.visibleReadable && (
          <span
            title={stripPlainEnglishMarkers(node.visiblePlain) || node.visibleReadable}
            className={cn("hidden md:inline-flex items-center gap-1 truncate text-[10px]", isSel && !isLoop ? "text-primary-foreground/90" : "text-info")}
          >
            <Eye className="h-2.5 w-2.5" />{node.visibleReadable}
          </span>
        )}
        <span className={cn("ml-auto flex items-center gap-2 text-[10px]", isSel && !isLoop ? "text-primary-foreground/90" : "text-muted-foreground")}>
          {childGroupCount > 0 && <span>{childGroupCount} sub-group{childGroupCount === 1 ? "" : "s"}</span>}
          <span
            title={allDone ? "All fields checked" : `${doneCount} of ${visibleCount} checked`}
            className={cn(
              "inline-flex items-center gap-1 rounded border px-1.5 py-0.5 font-mono-tight font-semibold",
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
          <span className={cn("rounded px-1.5 py-0.5 font-mono-tight font-semibold", isSel && !isLoop ? "bg-primary-foreground/20 text-primary-foreground" : "bg-surface-3 text-foreground")}>{visibleCount} fields</span>
        </span>
      </header>

      <Collapsible open={open}>
        <CollapsibleContent className="overflow-hidden data-[state=open]:animate-collapsible-down data-[state=closed]:animate-collapsible-up">
          <div className="relative">
            {segments.map((seg, i) =>
            seg.type === "fields" ? (
              <FieldTable
                key={`f-${i}`}
                fields={seg.fields}
                onSelect={onSelect}
                selectedId={selectedId}
                done={done}
                toggleDone={toggleDone}
              />
            ) : (
              <div
                key={seg.node.id}
                className="space-y-2 p-2 pl-4"
                style={{ borderLeft: `2px dashed ${accent}55` }}
              >
                <GroupCard
                  schema={schema}
                  node={seg.node}
                  q={q}
                  filters={filters}
                  onSelect={onSelect}
                  selectedId={selectedId}
                  depth={depth + 1}
                  collapsed={collapsed}
                  setOpen={setOpen}
                  done={done}
                  toggleDone={toggleDone}
                />
              </div>
            ),
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </section>
  );
}

function FieldTable({ fields, onSelect, selectedId, done, toggleDone }: { fields: DMNode[]; onSelect: (id: string) => void; selectedId: string | null; done: Record<string, boolean>; toggleDone: (identifier: string, value?: boolean) => void }) {
  const reviewMode = useFormStore((s) => s.reviewMode);
  const wrapVisibility = useFormStore((s) => s.wrapVisibility);
  const zebraRows = useFormStore((s) => s.zebraRows);
  const wrapIdentifier = useFormStore((s) => s.wrapIdentifier);
  const { map: reviewMap, toggleNeedsEdit } = useReviewFields();
  const headerCell = "border-b border-border px-2 py-1 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground";
  // Responsive column visibility — keep essential columns on small screens, reveal rest as width grows
  const colIdentifier = "hidden xl:table-cell";
  const colOptions = "hidden 2xl:table-cell";
  const colDepends = "hidden lg:table-cell";
  return (
    <table className="w-full min-w-[720px] table-auto border-separate border-spacing-0 text-[12px]">
      <colgroup>
        <col className="w-8" />
        <col className="w-10" />
        {reviewMode && <col className="w-10" />}
        <col />
        <col className={cn("w-[18%]", colIdentifier)} />
        <col className="w-[88px]" />
        <col className="max-w-[360px]" />
        <col className="w-[120px]" />
        <col className="w-[110px]" />
        <col className={cn("w-[140px]", colOptions)} />
        <col className={cn("w-[120px]", colDepends)} />
      </colgroup>
      <thead className="bg-surface-2/60">
        <tr className="text-left">
          <th className={cn(headerCell, "w-8")}></th>
          <th className={cn(headerCell, "w-10")}>Done</th>
          {reviewMode && <th className={cn(headerCell, "w-10")}>Flag</th>}
          <th className={headerCell}>Field</th>
          <th className={cn(headerCell, colIdentifier)}>Identifier</th>
          <th className={headerCell}>Type</th>
          <th className={headerCell}>Visibility</th>
          <th className={headerCell}>Read only</th>
          <th className={headerCell}>Required</th>
          <th className={cn(headerCell, colOptions)}>Options filter</th>
          <th className={cn(headerCell, colDepends)}>Depends on</th>
        </tr>
      </thead>
      <tbody>
        {fields.map((n, idx) => {
          const sel = selectedId === n.id;
          const dk = doneKey(n);
          const isDone = !!done[dk];
          const flagged = !!reviewMap[dk]?.needsEdit;
          return (
            <tr
              key={n.id}
              data-node-id={n.id}
              data-identifier={n.identifier}
              onClick={() => onSelect(n.id)}
              className={cn(
                "cursor-pointer",
                sel ? "bg-primary-soft" : zebraRows && idx % 2 === 1 ? "bg-surface-2" : "bg-surface",
                "hover:bg-surface-3",
                isDone && !sel && "bg-success/5",
                flagged && !sel && "bg-destructive/[0.06]",
              )}
              style={flagged ? { boxShadow: "inset 3px 0 0 0 hsl(var(--destructive))" } : undefined}
            >
              <td className="border-b border-border/60 px-2 py-1.5 font-mono-tight text-[10px] text-muted-foreground">{idx + 1}</td>
              <td className="border-b border-border/60 px-2 py-1.5">
                <PillToggle
                  checked={isDone}
                  onCheckedChange={(v) => toggleDone(dk, v)}
                  title="Mark as done"
                  size="sm"
                />
              </td>
              {reviewMode && (
                <td className="border-b border-border/60 px-2 py-1.5">
                  <PillToggle
                    checked={flagged}
                    onCheckedChange={(v) => { toggleNeedsEdit(dk, v); onSelect(n.id); }}
                    tone="destructive"
                    title="Flag as needing edit"
                    size="sm"
                  />
                </td>
              )}
              <td className="border-b border-border/60 px-2 py-1.5">
                <div className="flex min-w-0 items-center gap-1.5">
                  <span className={cn("font-medium text-foreground", sel && "text-primary", isDone && "line-through opacity-60")}>{n.title}</span>
                  {n.multiple && <span className="rounded bg-accent/10 px-1 text-[9px] font-mono-tight uppercase text-accent">multi</span>}
                </div>
              </td>
              <td
                className={cn(
                  "border-b border-border/60 px-2 py-1.5 align-top",
                  colIdentifier,
                )}
              >
                <IdentifierCell identifier={n.identifier} defaultOpen={wrapIdentifier} />
              </td>
              <td className="border-b border-border/60 px-2 py-1.5"><TypeBadge kind={n.kind} /></td>
              <td className="border-b border-border/60 px-2 py-1.5 align-top">
                {n.visibleReadable ? (
                  <VisibilityCell text={n.visibleReadable} tooltip={stripPlainEnglishMarkers(n.visiblePlain) || n.visibleReadable} collapseLong={wrapVisibility} />
                ) : <span className="text-muted-foreground">—</span>}
              </td>
              <td className="border-b border-border/60 px-2 py-1.5">
                {n.readOnlyReadable ? (
                  <div title={stripPlainEnglishMarkers(n.readOnlyPlain) || n.readOnlyReadable} className="flex items-start gap-1 text-[11px] text-accent">
                    <Lock className="mt-0.5 h-3 w-3 shrink-0" />
                    <span className="truncate">{n.readOnlyReadable.replace(/read-only\s*/i, "").trim() || "always"}</span>
                  </div>
                ) : n.readOnly && n.kind !== "calculation" ? (
                  <div className="flex items-center gap-1 text-[11px] text-accent" title="Read-only">
                    <Lock className="h-3 w-3" /> always
                  </div>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </td>
              <td className="border-b border-border/60 px-2 py-1.5">
                {n.requiredReadable ? (
                  <div title={stripPlainEnglishMarkers(n.requiredPlain) || n.requiredReadable} className="flex items-center gap-1 text-[11px] text-destructive">
                    <Asterisk className="h-3 w-3" /> {n.requiredReadable.replace("Required ", "")}
                  </div>
                ) : <span className="text-muted-foreground">—</span>}
              </td>
              <td className={cn("border-b border-border/60 px-2 py-1.5", colOptions)}>
                {n.optionsFilterReadable ? (
                  <div title={stripPlainEnglishMarkers(n.optionsFilterPlain) || n.optionsFilterReadable} className="flex items-start gap-1 text-[11px] text-accent">
                    <Filter className="mt-0.5 h-3 w-3 shrink-0" />
                    <span className="truncate">{n.optionsFilterReadable}</span>
                  </div>
                ) : <span className="text-muted-foreground">—</span>}
              </td>
              <td className={cn("border-b border-border/60 px-2 py-1.5", colDepends)}>
                {n.dependsOn.length ? (
                  <div className="flex flex-wrap gap-1">
                    {n.dependsOn.slice(0, 3).map((d) => (
                      <DependChip key={d} identifier={d} />
                    ))}
                    {n.dependsOn.length > 3 && <span className="text-[10px] text-muted-foreground">+{n.dependsOn.length - 3}</span>}
                  </div>
                ) : <span className="text-muted-foreground">—</span>}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/**
 * Chip in the "Depends on" column. Hovering highlights the row of the
 * referenced field (matched by identifier) with a soft ring + glow, and
 * smoothly scrolls it into view. Clicking selects that field.
 */
function DependChip({ identifier }: { identifier: string }) {
  const select = useFormStore((s) => s.select);
  const schema = useFormStore((s) => s.schema);
  const HIGHLIGHT = ["dm-depend-highlight"];
  const findRow = () =>
    document.querySelector<HTMLElement>(`[data-identifier="${CSS.escape(identifier)}"]`);
  const onEnter = () => {
    const row = findRow();
    if (!row) return;
    row.classList.add(...HIGHLIGHT);
    const rect = row.getBoundingClientRect();
    if (rect.top < 80 || rect.bottom > window.innerHeight - 40) {
      row.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  };
  const onLeave = () => {
    const row = findRow();
    if (row) row.classList.remove(...HIGHLIGHT);
  };
  const onClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    const targetId = schema?.byIdentifier[identifier];
    if (targetId) select(targetId);
  };
  return (
    <span
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      onClick={onClick}
      title={`Highlight ${identifier}`}
      className="cursor-pointer rounded bg-surface-3 px-1 py-0.5 font-mono-tight text-[10px] text-foreground/80 transition-colors hover:bg-primary-soft hover:text-primary"
    >
      {identifier}
    </span>
  );
}