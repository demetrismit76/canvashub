import { useFormStore } from "@/store/useFormStore";
import { dependentsOf, placeholderPath } from "@/lib/dm/parser";
import { TypeBadge } from "./TypeBadge";
import { Eye, EyeOff, Asterisk, Filter, Repeat2, Hash, ArrowRight, Database, Info, Lock, PanelRightClose, PanelRightOpen, ListChecks, CornerDownRight, Copy, Check, Calculator, GripVertical, Pencil, RotateCcw, ClipboardCheck, X, ChevronUp } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { stripPlainEnglishMarkers, getCalculationExpr, calculationToPlainEnglish } from "@/lib/dm/expression";
import { Maximize2, Layers } from "lucide-react";
import { useReviewFields, readAllProjectNotes, type ReviewReason } from "@/hooks/useReviewFields";
import { doneKey } from "@/hooks/useDoneFields";
import { REASON_OPTIONS } from "@/lib/dm/review";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AnimatePresence, motion } from "framer-motion";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

const MIN_W = 260;
const MAX_W = 420;
const DEFAULT_W = 320;
const SNAPS = [280, 320, 360, 400];

type SectionKey =
  | "placeholder"
  | "hint"
  | "visibility"
  | "required"
  | "readOnly"
  | "optionsFilter"
  | "calculation"
  | "dataSource"
  | "defaults"
  | "repeat"
  | "dependsOn"
  | "usedBy"
  | "rawJson";

const DEFAULT_SECTION_ORDER: SectionKey[] = [
  "placeholder",
  "hint",
  "visibility",
  "required",
  "readOnly",
  "optionsFilter",
  "calculation",
  "dataSource",
  "defaults",
  "repeat",
  "dependsOn",
  "usedBy",
  "rawJson",
];

const ORDER_STORAGE_KEY = "dm:inspector:sectionOrder:v1";
const HIDDEN_STORAGE_KEY = "dm:inspector:hiddenSections:v1";

function loadSectionOrder(): SectionKey[] {
  try {
    const raw = localStorage.getItem(ORDER_STORAGE_KEY);
    if (!raw) return DEFAULT_SECTION_ORDER;
    const parsed = JSON.parse(raw) as SectionKey[];
    if (!Array.isArray(parsed)) return DEFAULT_SECTION_ORDER;
    const valid = parsed.filter((k): k is SectionKey => DEFAULT_SECTION_ORDER.includes(k as SectionKey));
    // Insert any missing keys at their default position so new sections land
    // where they belong instead of always at the end.
    for (let i = 0; i < DEFAULT_SECTION_ORDER.length; i++) {
      const k = DEFAULT_SECTION_ORDER[i];
      if (valid.includes(k)) continue;
      // Find the nearest preceding default key that exists in the saved order
      // and insert right after it; fall back to the same index, then end.
      let insertAt = valid.length;
      for (let j = i - 1; j >= 0; j--) {
        const prev = DEFAULT_SECTION_ORDER[j];
        const idx = valid.indexOf(prev);
        if (idx !== -1) { insertAt = idx + 1; break; }
      }
      valid.splice(insertAt, 0, k);
    }
    return valid;
  } catch {
    return DEFAULT_SECTION_ORDER;
  }
}

function useSectionOrder() {
  const [order, setOrder] = useState<SectionKey[]>(() => loadSectionOrder());
  useEffect(() => {
    try { localStorage.setItem(ORDER_STORAGE_KEY, JSON.stringify(order)); } catch {}
  }, [order]);
  const reset = useCallback(() => setOrder(DEFAULT_SECTION_ORDER), []);
  const move = useCallback((from: number, to: number) => {
    setOrder((cur) => {
      if (from === to || from < 0 || to < 0 || from >= cur.length || to >= cur.length) return cur;
      const next = cur.slice();
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      return next;
    });
  }, []);
  return { order, move, reset };
}

function useHiddenSections() {
  const [hidden, setHidden] = useState<Set<SectionKey>>(() => {
    try {
      const raw = localStorage.getItem(HIDDEN_STORAGE_KEY);
      if (!raw) return new Set();
      const parsed = JSON.parse(raw) as SectionKey[];
      if (!Array.isArray(parsed)) return new Set();
      return new Set(parsed.filter((k): k is SectionKey => DEFAULT_SECTION_ORDER.includes(k as SectionKey)));
    } catch { return new Set(); }
  });
  useEffect(() => {
    try { localStorage.setItem(HIDDEN_STORAGE_KEY, JSON.stringify(Array.from(hidden))); } catch {}
  }, [hidden]);
  const toggle = useCallback((key: SectionKey) => {
    setHidden((cur) => {
      const next = new Set(cur);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }, []);
  const reset = useCallback(() => setHidden(new Set()), []);
  return { hidden, toggle, reset };
}

function panelMaxWidth() {
  return Math.max(MIN_W, Math.min(MAX_W, Math.floor(window.innerWidth * 0.24)));
}

function useResizableWidth() {
  const [width, setWidth] = useState<number>(() => {
    const v = Number(localStorage.getItem("dm:inspector:w"));
    return v >= MIN_W && v <= MAX_W ? Math.min(v, panelMaxWidth()) : Math.min(DEFAULT_W, panelMaxWidth());
  });
  const dragging = useRef(false);
  useEffect(() => { localStorage.setItem("dm:inspector:w", String(width)); }, [width]);
  useEffect(() => {
    const onResize = () => setWidth((w) => Math.min(w, panelMaxWidth()));
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragging.current = true;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    const onMove = (ev: MouseEvent) => {
      if (!dragging.current) return;
      const next = Math.min(panelMaxWidth(), Math.max(MIN_W, window.innerWidth - ev.clientX));
      // soft snap within 8px
      const snap = SNAPS.find((s) => Math.abs(s - next) < 8);
      setWidth(snap ?? next);
    };
    const onUp = () => {
      dragging.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, []);

  const onDoubleClick = useCallback(() => setWidth(Math.min(DEFAULT_W, panelMaxWidth())), []);
  return { width, setWidth, onMouseDown, onDoubleClick };
}

function ResizeHandle({ onMouseDown, onDoubleClick }: { onMouseDown: (e: React.MouseEvent) => void; onDoubleClick: () => void }) {
  return (
    <div
      onMouseDown={onMouseDown}
      onDoubleClick={onDoubleClick}
      title="Drag to resize · double-click to reset"
      className="group absolute left-0 top-0 z-20 h-full w-1.5 -translate-x-1/2 cursor-col-resize"
    >
      <div className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-transparent transition-colors group-hover:bg-primary/40" />
      <div className="absolute left-1/2 top-1/2 h-10 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-border opacity-0 transition-opacity group-hover:opacity-100" />
    </div>
  );
}

export function MetadataPanel() {
  const { schema, selectedId, select, reviewMode } = useFormStore();
  const { map: reviewMap, setEntry, toggleNeedsEdit, clearEntry } = useReviewFields();
  const { width, setWidth, onMouseDown, onDoubleClick } = useResizableWidth();
  const [collapsed, setCollapsed] = useState<boolean>(
    () => localStorage.getItem("dm:inspector:collapsed:v2") === "1",
  );
  const [editMode, setEditMode] = useState(false);
  const { order, move, reset: resetOrder } = useSectionOrder();
  const { hidden, toggle: toggleHidden, reset: resetHidden } = useHiddenSections();
  const dragIndex = useRef<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  useEffect(() => {
    localStorage.setItem("dm:inspector:collapsed:v2", collapsed ? "1" : "0");
  }, [collapsed]);
  if (!schema) return null;
  const node = selectedId ? schema.nodes[selectedId] : null;

  const autoFit = useCallback(() => {
    if (!node) { setWidth(DEFAULT_W); return; }
    // Approx px per character: ~7px proportional, ~6.6px monospace at our sizes.
    const longestMono = (s: string) => s.split("\n").reduce((m, l) => Math.max(m, l.length), 0);
    const candidates: number[] = [];
    // Title (15px semibold) — wider chars
    candidates.push(node.title.length * 8 + 48);
    // Identifier (mono 11px)
    candidates.push(node.identifier.length * 6.8 + 56);
    // Path (mono 11px)
    candidates.push(node.path.join(" / ").length * 6.8 + 48);
    // Readable logic strings
    if (node.visibleReadable) candidates.push(node.visibleReadable.length * 6.5 + 48);
    if (node.requiredReadable) candidates.push(node.requiredReadable.length * 6.5 + 48);
    if (node.optionsFilterReadable) candidates.push(node.optionsFilterReadable.length * 6.5 + 48);
    // Raw JSON longest line (mono 10px)
    try {
      const json = JSON.stringify(node.raw, null, 2);
      candidates.push(longestMono(json) * 6.1 + 56);
    } catch {}
    const recommended = Math.max(...candidates, MIN_W);
    setWidth(Math.round(Math.min(panelMaxWidth(), Math.max(MIN_W, recommended))));
  }, [node, setWidth]);

  if (collapsed) {
    return (
      <aside
        className="relative hidden shrink-0 flex-col border-l border-border bg-surface transition-[width] duration-300 ease-out lg:flex"
        style={{ width: 36 }}
      >
        <button
          onClick={() => setCollapsed(false)}
          title="Show inspector"
          className="flex h-9 w-full items-center justify-center text-muted-foreground hover:bg-surface-2 hover:text-foreground"
        >
          <PanelRightOpen className="h-4 w-4" />
        </button>
      </aside>
    );
  }

  if (!node) {
    return (
      <aside
        className="relative hidden shrink-0 flex-col border-l border-border bg-surface transition-[width] duration-300 ease-out animate-fade-in lg:flex"
        style={{ width }}
      >
        <ResizeHandle onMouseDown={onMouseDown} onDoubleClick={onDoubleClick} />
        <div className="flex items-center justify-end border-b border-border p-1.5">
          <button
            onClick={() => setCollapsed(true)}
            title="Hide inspector"
            className="rounded p-1 text-muted-foreground hover:bg-surface-2 hover:text-foreground"
          >
            <PanelRightClose className="h-4 w-4" />
          </button>
        </div>
        <div className="flex flex-1 flex-col gap-4 overflow-auto p-4">
          <div className="flex flex-col items-center justify-center rounded-md border border-dashed border-border/70 bg-surface-2/40 p-5 text-center">
            <Info className="mb-2 h-5 w-5 text-muted-foreground" />
            <div className="text-sm font-medium text-foreground">Select a field</div>
            <div className="mt-1 text-xs text-muted-foreground">Click any row or tree item to inspect identifier, logic, dependencies, and source data.</div>
          </div>
          <ProjectNotesCard />
        </div>
      </aside>
    );
  }

  const dependents = dependentsOf(schema, node.identifier);

  // Status flags
  const isRequired = node.requiredRule === "always" || (!!node.requiredRule && node.requiredRule !== "never");
  const isConditionallyRequired = !!node.requiredRule && node.requiredRule !== "always" && node.requiredRule !== "never";
  const isHidden = !!node.visibleExpr || node.requiredRule === "never_visible_or_required" || !!node.visibleReadable;
  const isReadOnly = !!node.readOnly;

  return (
    <aside
      className="relative hidden max-w-[24vw] shrink-0 flex-col overflow-hidden border-l border-border/60 bg-gradient-to-b from-surface to-surface-2/40 transition-[width] duration-300 ease-out animate-fade-in lg:flex"
      style={{ width }}
    >
      <ResizeHandle onMouseDown={onMouseDown} onDoubleClick={onDoubleClick} />
      <div className="sticky top-0 z-10 border-b border-border/50 bg-surface/80 px-4 pb-3.5 pt-3 backdrop-blur-xl supports-[backdrop-filter]:bg-surface/60">
        <TooltipProvider delayDuration={200}>
        <div className="mb-2.5 flex items-center justify-end gap-1">
          <IconTip label={editMode ? "Done reordering" : "Reorder sections"}>
            <button
              onClick={() => setEditMode((v) => !v)}
              aria-label={editMode ? "Done reordering" : "Reorder sections"}
              className={cn(
                "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border transition-colors",
                editMode
                  ? "border-primary/50 bg-primary/10 text-primary"
                  : "border-border/70 bg-surface-2/70 text-muted-foreground hover:border-primary/40 hover:bg-surface-2 hover:text-foreground",
              )}
            >
              {editMode ? <Check className="h-3.5 w-3.5" /> : <Pencil className="h-3.5 w-3.5" />}
            </button>
          </IconTip>
          {editMode && (
            <IconTip label="Reset to default order">
              <button
                onClick={() => { resetOrder(); toast.success("Section order reset"); }}
                aria-label="Reset to default order"
                className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border/70 bg-surface-2/70 text-muted-foreground transition-colors hover:border-primary/40 hover:bg-surface-2 hover:text-foreground"
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </button>
            </IconTip>
          )}
          {editMode && hidden.size > 0 && (
            <IconTip label={`Restore hidden sections (${hidden.size})`}>
              <button
                onClick={() => { resetHidden(); toast.success("Hidden sections restored"); }}
                aria-label="Restore hidden sections"
                className="relative inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border/70 bg-surface-2/70 text-muted-foreground transition-colors hover:border-primary/40 hover:bg-surface-2 hover:text-foreground"
              >
                <Eye className="h-3.5 w-3.5" />
                <span className="absolute -right-1 -top-1 inline-flex h-3.5 min-w-3.5 items-center justify-center rounded-full border border-surface bg-primary px-1 text-[8px] font-semibold leading-none text-primary-foreground">
                  {hidden.size}
                </span>
              </button>
            </IconTip>
          )}
          <IconTip label="Auto-fit width to content">
            <button
              onClick={autoFit}
              aria-label="Auto-fit width to content"
              className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border/70 bg-surface-2/70 text-muted-foreground transition-colors hover:border-primary/40 hover:bg-surface-2 hover:text-foreground"
            >
              <Maximize2 className="h-3.5 w-3.5" />
            </button>
          </IconTip>
          <IconTip label="Hide inspector">
            <button
              onClick={() => setCollapsed(true)}
              aria-label="Hide inspector"
              className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border/70 bg-surface-2/70 text-muted-foreground transition-colors hover:border-primary/40 hover:bg-surface-2 hover:text-foreground"
            >
              <PanelRightClose className="h-3.5 w-3.5" />
            </button>
          </IconTip>
        </div>
        </TooltipProvider>
        <div className="flex flex-wrap items-center gap-1.5">
          <TypeBadge kind={node.kind} />
          {node.isLoop && (
            <StatusBadge active iconOnly label="Loop" icon={<Repeat2 className="h-3.5 w-3.5" />} tone="loop" />
          )}
          {node.multiple && (
            <StatusBadge active iconOnly label="Multi-select" icon={<Layers className="h-3.5 w-3.5" />} tone="accent" />
          )}
          <StatusBadge
            active={isRequired}
            iconOnly
            label={isConditionallyRequired ? "Conditionally required" : "Required"}
            inactiveLabel="Optional"
            icon={<Asterisk className="h-3.5 w-3.5" />}
            tone="destructive"
          />
          <StatusBadge
            active={isHidden}
            iconOnly
            label="Conditional visibility"
            inactiveLabel="Always shown"
            icon={<EyeOff className="h-3.5 w-3.5" />}
            inactiveIcon={<Eye className="h-3.5 w-3.5" />}
            tone="info"
          />
          {isReadOnly && (
            <StatusBadge active iconOnly label="Read-only" icon={<Lock className="h-3.5 w-3.5" />} tone="accent" />
          )}
          {node.hidden && (
            <StatusBadge active iconOnly label="Hidden field (hidden: true)" icon={<EyeOff className="h-3.5 w-3.5" />} tone="info" />
          )}
        </div>
        <div className="mt-3 break-words text-[17px] font-semibold tracking-[-0.01em] text-foreground">{node.title}</div>
        <div className="mt-1 flex items-start gap-1 font-mono-tight text-[11px] text-muted-foreground">
          <Hash className="h-3 w-3 shrink-0 translate-y-0.5 opacity-70" />
          <span className="min-w-0 break-all">{node.identifier}</span>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto overscroll-contain scrollbar-thin px-3 py-3 space-y-3">
        {editMode && (
          <div className="rounded-xl border border-primary/30 bg-primary/[0.06] px-3 py-2 text-[11px] leading-snug text-foreground/80">
            Drag the <GripVertical className="inline h-3 w-3 align-text-bottom" /> handles to reorder. Click <EyeOff className="inline h-3 w-3 align-text-bottom" /> on a section to hide it for all forms — your changes are saved automatically.
          </div>
        )}
        <div className="overflow-hidden rounded-xl border border-border/60 bg-surface/60">
        {(() => {
          const sectionMap: Partial<Record<SectionKey, React.ReactNode>> = {
            placeholder: (
              <Section
                title="Place Holder"
                actions={
                  <CopyButton
                    getText={() => placeholderPath(node.path)}
                    label="Copy"
                    title="Copy placeholder path"
                  />
                }
              >
                <div className="break-all font-mono-tight text-[11px] text-foreground/80">{placeholderPath(node.path)}</div>
              </Section>
            ),
            hint: node.hint ? (
              <Section
                title="Hint"
                icon={<Info className="h-3 w-3 text-muted-foreground" />}
                actions={<CopyButton getText={() => node.hint || ""} label="Copy" title="Copy hint" />}
              >
                <div className="whitespace-pre-wrap text-[12.5px] leading-snug text-foreground/90">{node.hint}</div>
              </Section>
            ) : null,
            visibility: node.visibleReadable ? (
              <Section
                title="Visibility logic"
                icon={<Eye className="h-3 w-3 text-info" />}
                actions={
                  <CopyButton
                    getText={() =>
                      [
                        node.visibleReadable,
                        node.visiblePlain ? stripPlainEnglishMarkers(node.visiblePlain) : "",
                        node.visibleExpr || "",
                      ].filter(Boolean).join("\n")
                    }
                    label="Copy"
                    title="Copy visibility logic"
                  />
                }
              >
                <div className="text-[12px] text-foreground" title={stripPlainEnglishMarkers(node.visiblePlain)}>{node.visibleReadable}</div>
                {node.visiblePlain && <PlainEnglish text={node.visiblePlain} />}
                <RawExpr expr={node.visibleExpr} />
              </Section>
            ) : null,
            required: node.requiredReadable ? (
              <Section
                title="Required logic"
                icon={<Asterisk className="h-3 w-3 text-destructive" />}
                actions={
                  <CopyButton
                    getText={() =>
                      [node.requiredReadable, node.requiredPlain ? stripPlainEnglishMarkers(node.requiredPlain) : ""]
                        .filter(Boolean)
                        .join("\n")
                    }
                    label="Copy"
                    title="Copy required logic"
                  />
                }
              >
                <div className="text-[12px] text-foreground" title={stripPlainEnglishMarkers(node.requiredPlain)}>{node.requiredReadable}</div>
                {node.requiredPlain && node.requiredPlain !== node.requiredReadable && <PlainEnglish text={node.requiredPlain} />}
              </Section>
            ) : null,
            readOnly: node.readOnlyReadable ? (
              <Section
                title="Read-only logic"
                icon={<Lock className="h-3 w-3 text-accent" />}
                actions={
                  <CopyButton
                    getText={() =>
                      [
                        node.readOnlyReadable,
                        node.readOnlyPlain ? stripPlainEnglishMarkers(node.readOnlyPlain) : "",
                        node.readOnlyExpr || "",
                      ].filter(Boolean).join("\n")
                    }
                    label="Copy"
                    title="Copy read-only logic"
                  />
                }
              >
                <div className="text-[12px] text-foreground" title={stripPlainEnglishMarkers(node.readOnlyPlain)}>{node.readOnlyReadable}</div>
                {node.readOnlyPlain && node.readOnlyPlain !== node.readOnlyReadable && <PlainEnglish text={node.readOnlyPlain} />}
                <RawExpr expr={node.readOnlyExpr} />
              </Section>
            ) : null,
            optionsFilter: node.optionsFilterReadable ? (
              <Section
                title="Options filter"
                icon={<Filter className="h-3 w-3 text-accent" />}
                actions={
                  <CopyButton
                    getText={() =>
                      [
                        node.optionsFilterReadable,
                        node.optionsFilterPlain ? stripPlainEnglishMarkers(node.optionsFilterPlain) : "",
                        node.optionsFilterExpr || "",
                      ].filter(Boolean).join("\n")
                    }
                    label="Copy"
                    title="Copy options filter"
                  />
                }
              >
                <div className="text-[12px] text-foreground" title={stripPlainEnglishMarkers(node.optionsFilterPlain)}>{node.optionsFilterReadable}</div>
                {node.optionsFilterPlain && <PlainEnglish text={node.optionsFilterPlain} />}
                <RawExpr expr={node.optionsFilterExpr} />
              </Section>
            ) : null,
            calculation: <CalculationSection node={node} />,
            dataSource: (node.optionsResource || node.optionsTable) ? (
              <Section title="Data source" icon={<Database className="h-3 w-3 text-muted-foreground" />}>
                <KV k="resource" v={node.optionsResource} />
                <KV k="table" v={node.optionsTable} />
              </Section>
            ) : null,
            defaults: <DefaultsSection node={node} />,
            repeat: node.isLoop ? (
              <Section title="Repeat" icon={<Repeat2 className="h-3 w-3 text-type-loop" />}>
                <KV k="min occurrences" v={String(node.minOccurs ?? 0)} />
                <KV k="max occurrences" v={node.maxOccurs ? String(node.maxOccurs) : "∞"} />
              </Section>
            ) : null,
            dependsOn: node.dependsOn.length > 0 ? (
              <Section title={`Depends on (${node.dependsOn.length})`}>
                <div className="flex flex-wrap gap-1">
                  {node.dependsOn.map((d) => {
                    const targetId = schema.byIdentifier[d];
                    return (
                      <button
                        key={d}
                        onClick={() => targetId && select(targetId)}
                        className="inline-flex items-center gap-1 rounded border border-border bg-surface-2 px-1.5 py-0.5 font-mono-tight text-[10px] text-foreground hover:border-primary hover:text-primary"
                      >
                        {d} {targetId && <ArrowRight className="h-2.5 w-2.5" />}
                      </button>
                    );
                  })}
                </div>
              </Section>
            ) : null,
            usedBy: dependents.length > 0 ? (
              <Section title={`Used by (${dependents.length})`}>
                <div className="space-y-1">
                  {dependents.slice(0, 20).map((d) => (
                    <button
                      key={d.id}
                      onClick={() => select(d.id)}
                      className="flex w-full items-center justify-between rounded px-1.5 py-1 text-left text-[11px] hover:bg-surface-2"
                    >
                      <span className="truncate text-foreground">{d.title}</span>
                      <TypeBadge kind={d.kind} />
                    </button>
                  ))}
                  {dependents.length > 20 && <div className="text-[10px] text-muted-foreground">+{dependents.length - 20} more</div>}
                </div>
              </Section>
            ) : null,
            rawJson: (
              <Section title="Raw JSON">
                <pre className="max-h-64 max-w-full overflow-auto overscroll-contain scrollbar-thin rounded bg-surface-2 p-2 font-mono-tight text-[10px] leading-relaxed text-foreground/80">
{JSON.stringify(node.raw, null, 2)}
                </pre>
              </Section>
            ),
          };
          const present = order
            .map((key, idx) => ({ key, idx, content: sectionMap[key] }))
            .filter((s) => s.content != null);
          const visible = editMode ? present : present.filter((s) => !hidden.has(s.key));
          return visible.map(({ key, idx, content }, vIdx) => (
            <DraggableSection
              key={key}
              editMode={editMode}
              compact={width < 300}
              hidden={hidden.has(key)}
              onToggleHidden={() => toggleHidden(key)}
              isDragOver={dragOverIndex === idx}
              onDragStart={() => { dragIndex.current = idx; }}
              onDragEnter={() => { if (editMode && dragIndex.current != null && dragIndex.current !== idx) setDragOverIndex(idx); }}
              onDragOver={(e) => { if (editMode) e.preventDefault(); }}
              onDragEnd={() => { dragIndex.current = null; setDragOverIndex(null); }}
              onDrop={(e) => {
                if (!editMode) return;
                e.preventDefault();
                const from = dragIndex.current;
                if (from != null && from !== idx) move(from, idx);
                dragIndex.current = null;
                setDragOverIndex(null);
              }}
              onMoveUp={vIdx > 0 ? () => move(idx, order.indexOf(visible[vIdx - 1].key)) : undefined}
              onMoveDown={vIdx < visible.length - 1 ? () => move(idx, order.indexOf(visible[vIdx + 1].key)) : undefined}
            >
              {content}
            </DraggableSection>
          ));
        })()}
        </div>
        <ProjectNotesCard />
      </div>
      {reviewMode && (
        <ReviewDrawer
          nodeKey={doneKey(node)}
          entry={reviewMap[doneKey(node)]}
          onChange={(p) => setEntry(doneKey(node), p)}
          onToggle={(v) => toggleNeedsEdit(doneKey(node), v)}
          onClear={() => clearEntry(doneKey(node))}
        />
      )}
    </aside>
  );
}

function Section({ title, icon, children, actions }: { title: string; icon?: React.ReactNode; children: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <section className="border-b border-border/40 last:border-b-0">
      <header className="flex items-center justify-between gap-2 px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-[0.09em] text-muted-foreground">
        <div className="flex items-center gap-1.5">{icon}<span>{title}</span></div>
        {actions}
      </header>
      <div className="px-3 pb-2 pt-0.5">{children}</div>
    </section>
  );
}

function DraggableSection({
  editMode,
  isDragOver,
  children,
  onDragStart,
  onDragEnter,
  onDragOver,
  onDragEnd,
  onDrop,
  onMoveUp,
  onMoveDown,
  hidden,
  onToggleHidden,
  compact,
}: {
  editMode: boolean;
  isDragOver: boolean;
  children: React.ReactNode;
  onDragStart: () => void;
  onDragEnter: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragEnd: () => void;
  onDrop: (e: React.DragEvent) => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  hidden?: boolean;
  onToggleHidden?: () => void;
  compact?: boolean;
}) {
  if (!editMode) return <>{children}</>;
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      onDrop={onDrop}
      className={cn(
        "group relative transition-colors",
        isDragOver ? "bg-primary/[0.06]" : "",
        hidden ? "opacity-50" : "",
      )}
    >
      <div
        className={cn(
          "absolute left-0 top-1.5 z-10 flex flex-col items-center gap-1",
          compact ? "w-6" : "w-8",
        )}
      >
        <div
          title="Drag to reorder"
          className={cn(
            "flex items-center justify-center rounded border border-border/60 bg-surface/90 text-muted-foreground shadow-sm backdrop-blur cursor-grab active:cursor-grabbing",
            compact ? "h-4 w-4" : "h-5 w-5",
          )}
        >
          <GripVertical className="h-3 w-3" />
        </div>
        {onToggleHidden && (
          <button
            type="button"
            onClick={onToggleHidden}
            title={hidden ? "Show this section" : "Hide this section"}
            aria-label={hidden ? "Show this section" : "Hide this section"}
            className={cn(
              "inline-flex items-center justify-center rounded border border-border/60 bg-surface/90 text-muted-foreground hover:border-primary/40 hover:text-foreground",
              compact ? "h-4 w-4" : "h-5 w-5",
            )}
          >
            {hidden ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
          </button>
        )}
      </div>
      <div className={compact ? "pl-7" : "pl-9"}>{children}</div>
    </div>
  );
}

function KV({ k, v }: { k: string; v?: string }) {
  if (!v) return null;
  return (
    <div className="grid grid-cols-[100px_1fr] items-baseline gap-3 py-0.5 text-[11px]">
      <span className="text-muted-foreground">{k}</span>
      <span className="truncate font-mono-tight text-foreground">{v}</span>
    </div>
  );
}

function RawExpr({ expr }: { expr?: string }) {
  if (!expr) return null;
  return (
    <pre className="mt-2 overflow-auto rounded-lg border border-border/50 bg-background/60 p-2 font-mono-tight text-[10.5px] leading-relaxed text-muted-foreground">{expr}</pre>
  );
}

function PlainEnglish({ text }: { text: string }) {
  // Identifiers are wrapped in \u0001 markers — split on them so odd indices are bolded.
  const parts = text.split("\u0001");
  return (
    <div className="mt-2 rounded-xl border border-info/25 bg-info/[0.06] px-2.5 py-2 text-[11.5px] leading-snug text-foreground/90 break-words [overflow-wrap:anywhere]">
      <div className="mb-1 text-[9.5px] font-semibold uppercase tracking-[0.1em] text-info/80">In plain English</div>
      {parts.map((p, i) =>
        i % 2 === 1
          ? <strong key={i} className="font-semibold text-foreground [overflow-wrap:anywhere] break-all">{p}</strong>
          : <span key={i}>{p}</span>,
      )}
    </div>
  );
}

type OptionItem = { text: string; identifier?: string };

function CopyButton({ getText, label, title }: { getText: () => string; label: string; title?: string }) {
  const [copied, setCopied] = useState(false);
  const onClick = async () => {
    const text = getText();
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      const lines = text ? text.split("\n").length : 0;
      toast.success(lines > 1 ? `Copied ${lines} lines` : "Copied");
      setTimeout(() => setCopied(false), 1400);
    } catch {
      toast.error("Could not copy");
    }
  };
  return (
    <button
      onClick={onClick}
      title={title || label}
      className="inline-flex items-center gap-1 rounded-md border border-border/70 bg-surface/80 px-2 py-0.5 text-[10px] font-medium tracking-wide text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary"
    >
      {copied ? <Check className="h-3 w-3 text-primary" /> : <Copy className="h-3 w-3" />}
      {copied ? "Copied" : label}
    </button>
  );
}

function normalizeOptions(raw: unknown): OptionItem[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((o) => {
    if (o == null) return { text: "" };
    if (typeof o === "string" || typeof o === "number" || typeof o === "boolean") return { text: String(o) };
    if (typeof o === "object") {
      const obj = o as Record<string, unknown>;
      const text = (obj.text ?? obj.label ?? obj.title ?? obj.name ?? obj.value ?? obj.identifier ?? "") as string | number;
      const identifier = (obj.identifier ?? obj.value ?? obj.id) as string | number | undefined;
      return { text: String(text), identifier: identifier != null ? String(identifier) : undefined };
    }
    return { text: String(o) };
  });
}

function formatInitial(v: unknown): string[] {
  if (v == null || v === "") return [];
  if (Array.isArray(v)) return v.map((x) => String(x));
  if (typeof v === "object") return [JSON.stringify(v)];
  return [String(v)];
}

function DefaultsSection({ node }: { node: ReturnType<typeof Object> extends never ? never : any }) {
  const initials = formatInitial(node.initialAnswer);
  const options = normalizeOptions(node.options);
  if (initials.length === 0 && options.length === 0) return null;
  const initialSet = new Set(initials);
  return (
    <Section title="Defaults & options" icon={<ListChecks className="h-3 w-3 text-type-select" />}>
      {initials.length > 0 && (
        <div className="mb-2">
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Initial value{initials.length > 1 ? "s" : ""}
          </div>
          <div className="flex flex-col gap-1">
            {initials.map((v, i) => (
              <div
                key={i}
                className="inline-flex items-center gap-1.5 rounded border border-accent/30 bg-accent/10 px-1.5 py-1 font-mono-tight text-[11px] text-foreground"
              >
                <CornerDownRight className="h-3 w-3 text-accent" />
                <span className="truncate">{v}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {options.length > 0 && (
        <div>
          <div className="mb-1 flex items-center justify-between gap-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            <span>Options</span>
            <div className="flex items-center gap-1">
              <CopyButton
                getText={() => options.map((o) => o.text).join("\n")}
                label="Copy list"
                title="Copy all option labels (one per line) for GoCanvas"
              />
              <span className="font-mono-tight normal-case tracking-normal text-muted-foreground/70">{options.length}</span>
            </div>
          </div>
          <div className="flex max-h-64 flex-col gap-0.5 overflow-auto scrollbar-thin rounded border border-border bg-background/40 p-1">
            {options.map((o, i) => {
              const isDefault = initialSet.has(o.text) || (o.identifier ? initialSet.has(o.identifier) : false);
              return (
                <div
                  key={i}
                  className={cn(
                    "flex items-baseline justify-between gap-2 rounded px-1.5 py-1 text-[11px]",
                    isDefault ? "bg-accent/10" : "hover:bg-surface-2",
                  )}
                >
                  <span className="flex items-center gap-1.5 truncate text-foreground">
                    <span className="w-4 text-right font-mono-tight text-[10px] text-muted-foreground/70">{i + 1}</span>
                    <span className="truncate">{o.text || <em className="text-muted-foreground">(empty)</em>}</span>
                    {isDefault && (
                      <span className="rounded bg-accent/20 px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-accent">
                        default
                      </span>
                    )}
                  </span>
                  {o.identifier && o.identifier !== o.text && (
                    <span className="truncate font-mono-tight text-[10px] text-muted-foreground">{o.identifier}</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </Section>
  );
}

function StatusBadge({
  active,
  label,
  inactiveLabel,
  icon,
  inactiveIcon,
  tone,
  iconOnly,
}: {
  active: boolean;
  label: string;
  inactiveLabel?: string;
  icon: React.ReactNode;
  inactiveIcon?: React.ReactNode;
  tone: "destructive" | "info" | "accent" | "loop";
  iconOnly?: boolean;
}) {
  const activeClass =
    tone === "destructive"
      ? "border-destructive/30 bg-destructive/10 text-destructive"
      : tone === "info"
        ? "border-info/30 bg-info/10 text-info"
        : tone === "loop"
          ? "border-type-loop/30 bg-type-loop/10 text-type-loop"
          : "border-accent/30 bg-accent/10 text-accent";
  const displayLabel = active ? label : (inactiveLabel ?? label);
  const displayIcon = active ? icon : (inactiveIcon ?? icon);
  if (iconOnly) {
    return (
      <IconTip label={displayLabel}>
        <span
          aria-label={displayLabel}
          className={cn(
            "inline-flex h-6 w-6 items-center justify-center rounded-md border transition-colors",
            active ? activeClass : "border-border/60 bg-surface-2/60 text-muted-foreground/70",
          )}
        >
          {displayIcon}
        </span>
      </IconTip>
    );
  }
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] font-medium tracking-wide transition-colors",
        active ? activeClass : "border-border/60 bg-surface-2/60 text-muted-foreground",
      )}
    >
      {displayIcon}
      {displayLabel}
    </span>
  );
}

function IconTip({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>{children}</TooltipTrigger>
        <TooltipContent side="bottom" sideOffset={6} collisionPadding={8} className="text-[11px]">
          {label}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function CalculationSection({ node }: { node: any }) {
  const expr = getCalculationExpr(node.raw);
  if (!expr) return null;
  return (
    <Section title="Calculation" icon={<Calculator className="h-3 w-3 text-type-select" />}>
      <pre className="max-w-full overflow-auto rounded bg-background p-1.5 font-mono-tight text-[10px] text-muted-foreground whitespace-pre-wrap break-all">{expr}</pre>
    </Section>
  );
}

function ProjectNotesCard() {
  return <ProjectNotesCardImpl />;
}

function ReviewDrawer({
  nodeKey,
  entry,
  onChange,
  onToggle,
  onClear,
}: {
  nodeKey: string;
  entry: { needsEdit: boolean; reason?: ReviewReason; comment?: string; suggested?: string } | undefined;
  onChange: (p: { needsEdit?: boolean; reason?: ReviewReason; comment?: string; suggested?: string }) => void;
  onToggle: (v: boolean) => void;
  onClear: () => void;
}) {
  const hasContent = !!(entry?.needsEdit || entry?.reason || entry?.comment || entry?.suggested);
  const [open, setOpen] = useState<boolean>(hasContent);
  const reviewOpenPulse = useFormStore((s) => s.reviewOpenPulse);
  // Re-evaluate auto-expand whenever the inspected field changes.
  useEffect(() => { setOpen(hasContent); /* eslint-disable-next-line */ }, [nodeKey]);
  // Auto-open whenever a Flag click elsewhere requests it.
  useEffect(() => {
    if (reviewOpenPulse > 0) setOpen(true);
  }, [reviewOpenPulse]);
  const needs = !!entry?.needsEdit;
  return (
    <div
      className={cn(
        "shrink-0 border-t bg-surface/95 backdrop-blur-md",
        needs ? "border-destructive/40" : "border-destructive/25",
      )}
    >
      {/* Compact bar — always visible */}
      <div
        onClick={() => setOpen((v) => !v)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setOpen((v) => !v); } }}
        className={cn(
          "group flex w-full min-w-0 cursor-pointer items-center gap-x-1.5 px-2.5 py-1.5 text-left transition-colors",
          needs ? "bg-destructive/[0.07] hover:bg-destructive/[0.10]" : "bg-destructive/[0.03] hover:bg-destructive/[0.06]",
        )}
      >
        <ClipboardCheck className="h-3.5 w-3.5 shrink-0 text-destructive" />
        <span className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.08em] text-destructive">Review</span>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onToggle(!needs); }}
          aria-pressed={needs}
          title={needs ? "Marked as needs edit — click to clear" : "Mark as needs edit"}
          aria-label="Needs edit"
          className={cn(
            "ml-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border transition-colors",
            needs
              ? "border-destructive bg-destructive text-destructive-foreground hover:bg-destructive/90"
              : "border-destructive/40 bg-surface text-destructive hover:bg-destructive/10",
          )}
        >
          <Check className="h-3 w-3" />
        </button>
        <span className="ml-auto flex shrink-0 items-center gap-1 pr-0.5">
          {hasContent && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onClear(); }}
              title="Clear review entry"
              aria-label="Clear review entry"
              className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-destructive/40 bg-surface text-destructive hover:bg-destructive/10"
            >
              <X className="h-3 w-3" />
            </button>
          )}
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
            title={open ? "Hide review form" : "Show review form"}
            aria-label={open ? "Hide review form" : "Show review form"}
            className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-border bg-surface-2 text-foreground/80 shadow-sm transition-colors hover:bg-surface-3 hover:text-foreground"
          >
            <motion.span
              animate={{ rotate: open ? 180 : 0 }}
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
              className="flex items-center justify-center"
            >
              <ChevronUp className="h-3 w-3" />
            </motion.span>
          </button>
        </span>
      </div>

      {/* Expanded form */}
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="review-body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
            style={{ overflow: "hidden" }}
          >
            <div className="max-h-[55vh] space-y-3 overflow-auto overscroll-contain scrollbar-thin border-t border-destructive/20 px-3 py-3">
              <div>
                <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Reason</div>
                <Select
                  value={entry?.reason ?? ""}
                  onValueChange={(v) => onChange({ reason: v as ReviewReason })}
                >
                  <SelectTrigger className="h-8 text-[12px]">
                    <SelectValue placeholder="Select reason…" />
                  </SelectTrigger>
                  <SelectContent>
                    {REASON_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value} className="text-[12px]">
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Comment</div>
                <Textarea
                  value={entry?.comment ?? ""}
                  placeholder="What needs to change?"
                  onChange={(e) => onChange({ comment: e.target.value })}
                  className="min-h-[64px] text-[12px]"
                />
              </div>

              <div>
                <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Suggested value</div>
                <Input
                  value={entry?.suggested ?? ""}
                  placeholder="e.g. condition: status = 'Active'"
                  onChange={(e) => onChange({ suggested: e.target.value })}
                  className="h-8 text-[12px] font-mono-tight"
                />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ProjectNotesCardImpl() {
  const { projectComment, setProjectComment, revision } = useReviewFields();
  const fileName = useFormStore((s) => s.fileName);
  const selectedId = useFormStore((s) => s.selectedId);
  // Collapsed by default when inspecting a field; open when nothing is selected.
  const [open, setOpen] = useState<boolean>(() => !selectedId);
  const [showAll, setShowAll] = useState(false);
  const allNotes = useMemo(
    () => (showAll ? readAllProjectNotes(fileName) : []),
    [showAll, fileName, projectComment, revision],
  );
  const otherNotes = allNotes.filter((n) => n.revision !== revision);
  return (
    <div className="overflow-hidden rounded-2xl border border-border/60 bg-surface/70 shadow-sm backdrop-blur-sm">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 border-b border-border/40 bg-surface-2/40 px-3 py-2 text-left text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted-foreground hover:bg-surface-2/70"
      >
        <div className="flex items-center gap-1.5">
          <ClipboardCheck className="h-3.5 w-3.5" />
          <span>Project notes</span>
          {projectComment.trim() && (
            <span className="ml-1 inline-block h-1.5 w-1.5 rounded-full bg-primary" aria-hidden />
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <span className="rounded bg-primary/10 px-1.5 py-px text-[10px] font-semibold text-primary normal-case tracking-normal">R{revision}</span>
          <span className="text-muted-foreground">{open ? "−" : "+"}</span>
        </div>
      </button>
      {open && (
        <div className="px-3 py-2.5">
          <div className="mb-2 text-[11px] text-muted-foreground">
            File-level comments for revision <span className="font-semibold text-foreground">R{revision}</span>
            {fileName ? " — included with the review export." : " (load a file first)."}
          </div>
          <Textarea
            value={projectComment}
            onChange={(e) => setProjectComment(e.target.value)}
            placeholder="e.g. Whole form needs re-titling; client wants section 2 split…"
            rows={5}
            disabled={!fileName}
            className="text-[12px]"
          />
          {fileName && (
            <div className="mt-2">
              <button
                type="button"
                onClick={() => setShowAll((v) => !v)}
                className="text-[11px] font-medium text-primary hover:underline"
              >
                {showAll ? "Hide other revisions" : "View notes from other revisions"}
              </button>
              {showAll && (
                <div className="mt-2 space-y-2">
                  {otherNotes.length === 0 ? (
                    <div className="rounded border border-dashed border-border/60 bg-surface-2/30 px-2 py-2 text-[11px] text-muted-foreground">
                      No project notes on other revisions yet.
                    </div>
                  ) : (
                    otherNotes.map((n) => (
                      <div key={n.revision} className="rounded border border-border/60 bg-surface-2/40 p-2">
                        <div className="mb-1 flex items-center justify-between">
                          <span className="rounded bg-primary/10 px-1.5 py-px text-[10px] font-semibold text-primary">R{n.revision}</span>
                          <span className="text-[10px] text-muted-foreground">read-only</span>
                        </div>
                        <div className="whitespace-pre-wrap break-words text-[12px] leading-snug text-foreground/90">
                          {n.comment}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
