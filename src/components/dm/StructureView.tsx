import { PillToggle } from "@/components/dm/PillToggle";
import { useMemo, useState, useEffect, useRef } from "react";
import { useFormStore } from "@/store/useFormStore";
import { DMNode, DMSchema } from "@/lib/dm/types";
import { cn } from "@/lib/utils";
import { useDoneFields } from "@/hooks/useDoneFields";
import { doneKey } from "@/hooks/useDoneFields";
import { toast } from "sonner";
import { stripPlainEnglishMarkers } from "@/lib/dm/expression";
import { Collapsible, CollapsibleContent } from "@/components/ui/collapsible";
import {
  Repeat2, Smartphone, Layers, Asterisk, Eye, EyeOff, Lock, Check,
  Type, Hash, Calendar, ToggleLeft, Mail, ListChecks, Image as ImageIcon,
  PenLine, CircleDot, ChevronDown, ChevronRight, ChevronsDownUp, ChevronsUpDown, Filter, Layers3,
} from "lucide-react";

const KIND_ICON: Record<string, any> = {
  text: Type,
  number: Hash,
  date: Calendar,
  boolean: ToggleLeft,
  email: Mail,
  select: ListChecks,
  image: ImageIcon,
  signature: PenLine,
};

function isReadOnly(n: DMNode) {
  return n.initialAnswer !== undefined && n.initialAnswer !== null && n.initialAnswer !== "";
}

function countTotalLeaves(schema: DMSchema, node: DMNode): number {
  let n = 0;
  for (const cid of node.childrenIds) {
    const c = schema.nodes[cid];
    if (c.isGroup) n += countTotalLeaves(schema, c);
    else n++;
  }
  return n;
}

function countDoneLeaves(schema: DMSchema, node: DMNode, isDone: (k: string) => boolean): number {
  let n = 0;
  for (const cid of node.childrenIds) {
    const c = schema.nodes[cid];
    if (c.isGroup) n += countDoneLeaves(schema, c, isDone);
    else if (isDone(doneKey(c))) n++;
  }
  return n;
}

function collectLeafKeys(schema: DMSchema, node: DMNode, out: string[]): void {
  for (const cid of node.childrenIds) {
    const c = schema.nodes[cid];
    if (c.isGroup) collectLeafKeys(schema, c, out);
    else out.push(doneKey(c));
  }
}

import { useScrollSelectedIntoView } from "@/hooks/useScrollSelectedIntoView";
import { BackToTop } from "./BackToTop";

export function StructureView() {
  const { schema, select, selectedId, collapseOnStartup } = useFormStore();
  const { done, isDone, toggle: toggleDone, replace: replaceDone } = useDoneFields();
  const checkAllInGroup = (node: DMNode) => {
    const keys: string[] = [];
    collectLeafKeys(schema!, node, keys);
    const remaining = keys.filter((k) => !done[k]).length;
    if (remaining === 0) return;
    const label = node.title || node.identifier;
    if (!window.confirm(`Mark all ${remaining} unchecked field(s) in "${label}" as done?`)) return;
    const next: Record<string, boolean> = { ...done };
    for (const k of keys) next[k] = true;
    replaceDone(next);
    toast.success(`Checked ${remaining} field${remaining === 1 ? "" : "s"} in "${label}"`);
  };
  const scrollRef = useRef<HTMLDivElement>(null);
  if (!schema) return null;

  const root = schema.nodes[schema.rootId];
  const groupIds = useMemo(
    () => schema.order.filter((id) => schema.nodes[id].isGroup && schema.nodes[id].kind !== "root"),
    [schema],
  );
  const initialCollapsed = () => {
    if (!collapseOnStartup) return {};
    const next: Record<string, boolean> = {};
    for (const id of groupIds) next[id] = true;
    return next;
  };
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(initialCollapsed);
  useEffect(() => { setCollapsed(initialCollapsed()); }, [schema, collapseOnStartup]);

  // Expand ancestor groups of the current selection.
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

  useScrollSelectedIntoView(selectedId, [schema, collapsed]);
  const toggle = (id: string) => setCollapsed((c) => ({ ...c, [id]: !c[id] }));
  const collapseAll = () => {
    const next: Record<string, boolean> = {};
    for (const id of groupIds) next[id] = true;
    setCollapsed(next);
  };
  const expandAll = () => setCollapsed({});

  const stats = useMemo(() => {
    let groups = 0, loops = 0, fields = 0, required = 0, conditional = 0, readonly = 0;
    for (const id of schema.order) {
      const n = schema.nodes[id];
      if (n.kind === "root") continue;
      if (n.isLoop) loops++;
      else if (n.isGroup) groups++;
      else fields++;
      if (n.requiredRule === "always" || n.requiredRule === "when") required++;
      if (n.visibleReadable) conditional++;
      if (!n.isGroup && isReadOnly(n)) readonly++;
    }
    return { groups, loops, fields, required, conditional, readonly };
  }, [schema]);

  return (
    <div ref={scrollRef} className="relative flex-1 overflow-auto scrollbar-thin bg-background">
      <div className="mx-auto max-w-5xl p-6">
        <div className="mb-5 flex items-end justify-between">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Form Structure</div>
            <div className="text-lg font-semibold text-foreground">Visual hierarchy of groups & fields</div>
          </div>
          <div className="flex items-center gap-2 text-[11px]">
            <div className="mr-2 flex h-7 items-center rounded-md border border-border bg-surface-2 p-0.5">
              <button
                onClick={collapseAll}
                title="Collapse all groups"
                className="flex h-6 items-center gap-1 rounded px-2 text-[11px] font-medium text-muted-foreground hover:bg-surface hover:text-foreground"
              >
                <ChevronsDownUp className="h-3.5 w-3.5" />
                Collapse
              </button>
              <button
                onClick={expandAll}
                title="Expand all groups"
                className="flex h-6 items-center gap-1 rounded px-2 text-[11px] font-medium text-muted-foreground hover:bg-surface hover:text-foreground"
              >
                <ChevronsUpDown className="h-3.5 w-3.5" />
                Expand
              </button>
            </div>
            <Legend color="bg-type-group" label={`${stats.groups} screens`} />
            <Legend color="bg-type-loop" label={`${stats.loops} repeats`} />
            <Legend color="bg-foreground/40" label={`${stats.fields} fields`} />
            <span className="ml-2 inline-flex items-center gap-1 text-muted-foreground">
              <Asterisk className="h-2.5 w-2.5 text-destructive" /> {stats.required} required
            </span>
            <span className="inline-flex items-center gap-1 text-muted-foreground">
              <Eye className="h-2.5 w-2.5 text-info" /> {stats.conditional} conditional
            </span>
            <span className="inline-flex items-center gap-1 text-muted-foreground">
              <Lock className="h-2.5 w-2.5 text-accent" /> {stats.readonly} read-only
            </span>
          </div>
        </div>

        <div className="space-y-3">
          {root.childrenIds.map((cid) => (
            <Branch key={cid} id={cid} schema={schema} selectedId={selectedId} onSelect={select} depth={0} collapsed={collapsed} onToggle={toggle} isDone={isDone} toggleDone={toggleDone} onCheckAll={checkAllInGroup} />
          ))}
        </div>
      </div>
      <BackToTop scrollRef={scrollRef} />
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-md border border-border bg-surface px-1.5 py-0.5 text-muted-foreground">
      <span className={cn("h-2 w-2 rounded-sm", color)} />
      {label}
    </span>
  );
}

function Branch({ id, schema, selectedId, onSelect, depth, collapsed, onToggle, isDone, toggleDone, onCheckAll }: {
  id: string; schema: DMSchema; selectedId: string | null; onSelect: (id: string | null) => void; depth: number;
  collapsed: Record<string, boolean>; onToggle: (id: string) => void;
  isDone: (id: string) => boolean; toggleDone: (id: string) => void;
  onCheckAll: (node: DMNode) => void;
}) {
  const node = schema.nodes[id];
  if (node.isGroup) return <GroupNode node={node} schema={schema} selectedId={selectedId} onSelect={onSelect} depth={depth} collapsed={collapsed} onToggle={onToggle} isDone={isDone} toggleDone={toggleDone} onCheckAll={onCheckAll} />;
  return <FieldNode node={node} selected={selectedId === id} onSelect={onSelect} isDone={isDone} toggleDone={toggleDone} />;
}

function GroupNode({ node, schema, selectedId, onSelect, depth, collapsed, onToggle, isDone, toggleDone, onCheckAll }: {
  node: DMNode; schema: DMSchema; selectedId: string | null; onSelect: (id: string | null) => void; depth: number;
  collapsed: Record<string, boolean>; onToggle: (id: string) => void;
  isDone: (id: string) => boolean; toggleDone: (id: string) => void;
  onCheckAll: (node: DMNode) => void;
}) {
  const isLoop = node.isLoop;
  const Icon = isLoop ? Repeat2 : depth === 0 ? Smartphone : Layers;
  const tone = isLoop
    ? { wrap: "border-type-loop/40", head: "bg-type-loop/10 border-type-loop/30", icon: "text-type-loop", badge: "bg-type-loop/15 text-type-loop border-type-loop/30", accentBar: "bg-type-loop", guide: "bg-type-loop/25", label: "Repeat" }
    : { wrap: "border-type-group/40", head: "bg-type-group/10 border-type-group/30", icon: "text-type-group", badge: "bg-type-group/15 text-type-group border-type-group/30", accentBar: "bg-type-group", guide: "bg-type-group/20", label: depth === 0 ? "Screen" : "Sub-screen" };

  const fieldsCount = node.childrenIds.filter((c) => !schema.nodes[c].isGroup).length;
  const groupsCount = node.childrenIds.length - fieldsCount;
  const totalLeaves = countTotalLeaves(schema, node);
  const doneLeaves = countDoneLeaves(schema, node, isDone);
  const allDone = totalLeaves > 0 && doneLeaves === totalLeaves;
  const selected = selectedId === node.id;
  const isCollapsed = !!collapsed[node.id];

  return (
    <div data-node-id={node.id} className={cn("relative overflow-hidden rounded-xl border bg-surface shadow-sm transition-shadow hover:shadow-md", tone.wrap, selected && "ring-2 ring-primary/40")}>
      <div className={cn("absolute inset-y-0 left-0 w-1", tone.accentBar)} />
      <div
        className={cn("flex w-full items-center gap-2 border-b px-4 py-2.5 pl-5 text-left", !isCollapsed && "border-b", isCollapsed && "border-b-0", tone.head)}
      >
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onToggle(node.id); }}
          title={isCollapsed ? "Expand" : "Collapse"}
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-surface hover:text-foreground"
        >
          {isCollapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </button>
        <Icon className={cn("h-4 w-4 shrink-0", tone.icon)} />
        <span className={cn("rounded border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider", tone.badge)}>
          {tone.label}
        </span>
        <button
          type="button"
          onClick={() => onSelect(node.id)}
          className="truncate text-left text-sm font-semibold text-foreground hover:text-primary"
        >
          {node.title || node.identifier}
        </button>
        {node.visibleReadable && (
          <span title={stripPlainEnglishMarkers(node.visiblePlain) || node.visibleReadable} className="inline-flex items-center gap-1 rounded border border-info/30 bg-info/10 px-1.5 py-0.5 text-[10px] text-info">
            <Eye className="h-2.5 w-2.5" />
            <span className="max-w-[260px] truncate">{node.visibleReadable}</span>
          </span>
        )}
        <span className="ml-auto flex items-center gap-2 text-[10px] text-muted-foreground">
          {isLoop && <span>min {node.minOccurs ?? 0} · max {node.maxOccurs ?? "∞"}</span>}
          {totalLeaves > 0 && (
            <span
              title={allDone ? "All fields checked" : `${doneLeaves} of ${totalLeaves} checked`}
              className={cn(
                "inline-flex items-center gap-1 rounded border px-1.5 py-0.5 font-mono-tight font-semibold",
                allDone
                  ? "border-success/40 bg-success/15 text-success"
                  : doneLeaves > 0
                  ? "border-warning/40 bg-warning/10 text-warning"
                  : "border-border bg-surface-2 text-muted-foreground",
              )}
            >
              <Check className="h-2.5 w-2.5" />
              {doneLeaves}/{totalLeaves}
            </span>
          )}
          {totalLeaves > 0 && !allDone && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onCheckAll(node); }}
              title={`Override: mark all ${totalLeaves - doneLeaves} unchecked field(s) in this group as done`}
              className="rounded border border-border bg-surface-2 px-1.5 py-0.5 text-[10px] text-muted-foreground hover:bg-surface hover:text-foreground"
            >
              Check all
            </button>
          )}
          <span>{fieldsCount} fields{groupsCount ? ` · ${groupsCount} groups` : ""}</span>
        </span>
      </div>

      <Collapsible open={!isCollapsed}>
        <CollapsibleContent className="overflow-hidden data-[state=open]:animate-collapsible-down data-[state=closed]:animate-collapsible-up">
          <div className="relative space-y-1.5 p-3 pl-5">
            <span aria-hidden className={cn("pointer-events-none absolute left-3 top-2 bottom-2 w-px rounded-full", tone.guide)} />
            {node.childrenIds.map((cid, i) => {
          const c = schema.nodes[cid];
          if (c.isGroup) {
            return (
              <div key={cid} className="ml-2">
                <Branch id={cid} schema={schema} selectedId={selectedId} onSelect={onSelect} depth={depth + 1} collapsed={collapsed} onToggle={onToggle} isDone={isDone} toggleDone={toggleDone} onCheckAll={onCheckAll} />
              </div>
            );
          }
          return (
            <div key={cid} className="relative ml-2 pl-4">
              <span className={cn("absolute left-0 top-1/2 h-px w-3 -translate-y-px", tone.guide)} />
              <FieldNode node={c} selected={selectedId === cid} onSelect={onSelect} isDone={isDone} toggleDone={toggleDone} />
            </div>
          );
            })}
            {node.childrenIds.length === 0 && (
              <div className="px-2 py-2 text-[11px] italic text-muted-foreground">Empty group</div>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}

function FieldNode({ node, selected, onSelect, isDone, toggleDone }: { node: DMNode; selected: boolean; onSelect: (id: string | null) => void; isDone: (id: string) => boolean; toggleDone: (id: string) => void }) {
  const Icon = KIND_ICON[node.kind] || CircleDot;
  const required = node.requiredRule === "always" || node.requiredRule === "when";
  const requiredWhen = node.requiredRule === "when";
  const conditional = !!node.visibleReadable;
  const readOnly = isReadOnly(node);
  const done = isDone(doneKey(node));

  return (
    <button
      type="button"
      data-node-id={node.id}
      onClick={() => onSelect(node.id)}
      className={cn(
        "group flex w-full items-center gap-2.5 rounded-lg border border-border/70 bg-surface-2/60 px-3 py-2 text-left transition-all hover:border-border-strong hover:bg-surface-2",
        selected && "border-primary/50 bg-primary/5 ring-1 ring-primary/30",
        done && "bg-success/5 border-success/30",
      )}
    >
      <PillToggle
        checked={done}
        onCheckedChange={() => toggleDone(doneKey(node))}
        title={done ? "Mark as not done" : "Mark as done"}
        size="sm"
      />
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-surface-2 text-muted-foreground group-hover:text-foreground">
        <Icon className="h-3.5 w-3.5" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className={cn("truncate text-[12.5px] font-medium text-foreground", done && "line-through opacity-60")}>{node.title || node.identifier}</span>
          {required && (
            <span title={requiredWhen ? "Required when condition" : "Required"} className="inline-flex">
              <Asterisk className={cn("h-2.5 w-2.5", requiredWhen ? "text-warning" : "text-destructive")} />
            </span>
          )}
        </div>
        <div className="truncate font-mono-tight text-[10px] text-muted-foreground">{node.identifier}</div>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        {conditional && (
          <span title={stripPlainEnglishMarkers(node.visiblePlain) || node.visibleReadable} className="inline-flex items-center gap-1 rounded border border-info/30 bg-info/10 px-1.5 py-0.5 text-[10px] text-info">
            <Eye className="h-2.5 w-2.5" />
            <span className="hidden max-w-[160px] truncate md:inline">{node.visibleReadable}</span>
          </span>
        )}
        {node.optionsFilterReadable && (
          <span title={node.optionsFilterPlain || node.optionsFilterReadable} className="inline-flex items-center gap-1 rounded border border-accent/30 bg-accent/10 px-1.5 py-0.5 text-[10px] text-accent">
            <Filter className="h-2.5 w-2.5" />
            <span className="hidden max-w-[140px] truncate md:inline">Filtered</span>
          </span>
        )}
        {readOnly && (
          <span title="Has initialAnswer (read-only)" className="inline-flex items-center gap-1 rounded border border-accent/30 bg-accent/10 px-1.5 py-0.5 text-[10px] text-accent">
            <Lock className="h-2.5 w-2.5" />
            Read-only
          </span>
        )}
        {node.multiple && (
          <span title="Multiple values" className="inline-flex items-center gap-1 rounded border border-border bg-surface-2 px-1.5 py-0.5 text-[10px] text-muted-foreground">
            <Layers3 className="h-2.5 w-2.5" />
            Multi
          </span>
        )}
        <span className="rounded border border-border bg-surface-2 px-1.5 py-0.5 font-mono-tight text-[10px] uppercase tracking-wider text-muted-foreground">
          {node.kind}
        </span>
      </div>
    </button>
  );
}