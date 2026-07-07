import { PillToggle } from "@/components/dm/PillToggle";
import { useState, useRef } from "react";
import { useFormStore } from "@/store/useFormStore";
import { DMNode } from "@/lib/dm/types";
import { Eye, Asterisk, Repeat2, ChevronDown, Smartphone, Table as TableIcon, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { useDoneFields, doneKey } from "@/hooks/useDoneFields";
import { useScrollSelectedIntoView } from "@/hooks/useScrollSelectedIntoView";
import { stripPlainEnglishMarkers } from "@/lib/dm/expression";
import { BackToTop } from "./BackToTop";

export function PreviewView() {
  const { schema, select, selectedId } = useFormStore();
  const { isDone, toggle } = useDoneFields();
  const scrollRef = useRef<HTMLDivElement>(null);
  useScrollSelectedIntoView(selectedId, [schema]);
  if (!schema) return null;
  const root = schema.nodes[schema.rootId];

  return (
    <div ref={scrollRef} className="relative flex-1 overflow-auto scrollbar-thin bg-background p-6">
      <div className="mx-auto max-w-3xl space-y-4">
        <div className="text-center">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Form preview</div>
          <div className="text-lg font-semibold text-foreground">Simulated rendering with logic annotations</div>
        </div>
        {root.childrenIds.map((id) => (
          <PreviewNode key={id} node={schema.nodes[id]} schema={schema} onSelect={select} isDone={isDone} toggleDone={toggle} />
        ))}
      </div>
      <BackToTop scrollRef={scrollRef} />
    </div>
  );
}

function PreviewNode({ node, schema, onSelect, isDone, toggleDone }: { node: DMNode; schema: any; onSelect: (id: string) => void; isDone: (id: string) => boolean; toggleDone: (id: string) => void }) {
  if (node.isGroup) {
    if (node.isLoop) {
      return <LoopGroup node={node} schema={schema} onSelect={onSelect} isDone={isDone} toggleDone={toggleDone} />;
    }
    return (
      <div data-node-id={node.id} className="rounded-lg border border-border bg-surface">
        <div className="flex items-center justify-between border-b border-border bg-surface-2 px-4 py-2.5">
          <div className="flex items-center gap-2">
            <Smartphone className="h-4 w-4 text-muted-foreground" />
            <div>
              <div className="flex items-center gap-2">
                <span className="rounded border border-border bg-surface px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">Screen</span>
                <div className="text-sm font-semibold text-foreground">{node.title}</div>
              </div>
            </div>
          </div>
          {node.visibleReadable && (
            <span title={stripPlainEnglishMarkers(node.visiblePlain) || node.visibleReadable} className="hidden md:inline-flex items-center gap-1 text-[10px] text-info"><Eye className="h-3 w-3" /> conditional</span>
          )}
        </div>
        <div className="space-y-3 p-4">
          {node.childrenIds.map((id) => (
            <PreviewNode key={id} node={schema.nodes[id]} schema={schema} onSelect={onSelect} isDone={isDone} toggleDone={toggleDone} />
          ))}
        </div>
      </div>
    );
  }

  const done = isDone(doneKey(node));
  return (
    <div
      data-node-id={node.id}
      onClick={() => onSelect(node.id)}
      className={cn(
        "cursor-pointer rounded-md border border-border bg-surface px-3 py-2 hover:border-primary/50 transition-colors",
        done && "bg-success/5 border-success/30",
      )}
    >
      <div className="flex items-center gap-1.5">
        <PillToggle
          checked={done}
          onCheckedChange={() => toggleDone(doneKey(node))}
          title={done ? "Mark as not done" : "Mark as done"}
          size="sm"
        />
        <label className={cn("text-[12px] font-medium text-foreground", done && "line-through opacity-60")}>{node.title}</label>
        {node.requiredRule && <Asterisk className="h-2.5 w-2.5 text-destructive" />}
      </div>
      {node.hint && <div className="mb-1.5 text-[10px] text-muted-foreground">{node.hint}</div>}
      {renderControl(node)}
      <div className="mt-1.5 flex flex-wrap gap-1.5 text-[10px]">
        {node.visibleReadable && <span title={stripPlainEnglishMarkers(node.visiblePlain) || node.visibleReadable} className="inline-flex items-center gap-1 text-info"><Eye className="h-2.5 w-2.5" />{node.visibleReadable}</span>}
        {node.optionsFilterReadable && <span title={stripPlainEnglishMarkers(node.optionsFilterPlain) || node.optionsFilterReadable} className="text-accent">{node.optionsFilterReadable}</span>}
      </div>
    </div>
  );
}

function placeholderFor(kind: string, identifier: string): string {
  const id = identifier.toLowerCase();
  switch (kind) {
    case "email": return "name@example.com";
    case "number":
      if (id.includes("phone")) return "555-0142";
      if (id.includes("zip") || id.includes("postal")) return "60601";
      if (id.includes("year")) return "2026";
      return "Enter a number…";
    case "date": return "YYYY-MM-DD";
    case "text":
    default:
      if (id.includes("name")) return "e.g. Jane Doe";
      if (id.includes("address")) return "e.g. 123 Main St";
      if (id.includes("city")) return "e.g. Chicago";
      if (id.includes("phone")) return "(555) 014-2233";
      if (id.includes("note") || id.includes("comment") || id.includes("desc")) return "Type a note…";
      return "Enter text…";
  }
}

function optionLabel(o: unknown): string {
  if (o == null) return "";
  if (typeof o === "string" || typeof o === "number") return String(o);
  if (typeof o === "object") {
    const r = o as Record<string, unknown>;
    return String(r.title ?? r.label ?? r.text ?? r.name ?? r.identifier ?? r.value ?? JSON.stringify(o));
  }
  return String(o);
}

function renderControl(n: DMNode) {
  switch (n.kind) {
    case "boolean":
      return <BooleanControl />;
    case "select": {
      const opts = Array.isArray(n.options) && n.options.length > 0
        ? n.options.map(optionLabel).filter(Boolean)
        : (n.optionsResource || n.optionsTable)
          ? [`— from ${n.optionsResource || n.optionsTable} —`, "Option A", "Option B", "Option C"]
          : ["Option A", "Option B", "Option C"];
      return (
        <select
          defaultValue=""
          onClick={(e) => e.stopPropagation()}
          className="h-7 w-full rounded border border-border bg-surface px-2 text-[11px] text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/40"
        >
          <option value="" disabled>{n.multiple ? "Select one or more…" : "Select…"}</option>
          {opts.slice(0, 50).map((o, i) => (
            <option key={i} value={o}>{o}</option>
          ))}
        </select>
      );
    }
    case "email":
      return <Input type="email" placeholder={placeholderFor("email", n.identifier)} onClick={(e) => e.stopPropagation()} className="h-7 text-xs" />;
    case "number":
      return <Input type="number" placeholder={placeholderFor("number", n.identifier)} onClick={(e) => e.stopPropagation()} className="h-7 text-xs" />;
    case "date":
      return <Input type="date" placeholder={placeholderFor("date", n.identifier)} onClick={(e) => e.stopPropagation()} className="h-7 text-xs" />;
    case "image":
      return <div className="flex h-12 items-center justify-center rounded border border-dashed border-border bg-surface-2 text-[10px] text-muted-foreground">📷 sample-photo.jpg</div>;
    case "signature":
      return <div className="flex h-12 items-center justify-center rounded border border-dashed border-border bg-surface-2 font-serif text-[14px] italic text-muted-foreground">Jane Doe</div>;
    case "text":
      if (n.multiLine) {
        return <textarea placeholder={placeholderFor("text", n.identifier)} onClick={(e) => e.stopPropagation()} className="h-14 w-full resize-none rounded border border-border bg-surface px-2 py-1 text-[11px] text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/40" />;
      }
      return <Input placeholder={placeholderFor("text", n.identifier)} onClick={(e) => e.stopPropagation()} className="h-7 text-xs" />;
    default:
      return <Input placeholder={placeholderFor(n.kind, n.identifier)} onClick={(e) => e.stopPropagation()} className="h-7 text-xs" />;
  }
}

function Pill({ children, active }: { children: React.ReactNode; active?: boolean }) {
  return (
    <span
      className={cn(
        "rounded border px-2 py-0.5 text-[11px]",
        active
          ? "border-primary/40 bg-primary/10 text-primary"
          : "border-border bg-surface-2 text-foreground",
      )}
    >
      {children}
    </span>
  );
}

function BooleanControl() {
  const [val, setVal] = useState<"yes" | "no" | null>(null);
  return (
    <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
      {(["yes", "no"] as const).map((v) => {
        const active = val === v;
        return (
          <button
            key={v}
            type="button"
            onClick={() => setVal(active ? null : v)}
            className={cn(
              "rounded border px-2.5 py-0.5 text-[11px] font-medium capitalize transition-colors",
              active
                ? "border-primary/40 bg-primary/10 text-primary"
                : "border-border bg-surface-2 text-foreground hover:border-primary/40 hover:text-primary",
            )}
          >
            {v}
          </button>
        );
      })}
    </div>
  );
}

const SIMPLE_KINDS = new Set(["text", "number", "select", "date", "boolean", "email"]);

function LoopGroup({ node, schema, onSelect, isDone, toggleDone }: { node: DMNode; schema: any; onSelect: (id: string) => void; isDone: (id: string) => boolean; toggleDone: (id: string) => void }) {
  const children: DMNode[] = node.childrenIds.map((id) => schema.nodes[id]);
  const allSimple = children.length > 0 && children.every((c) => !c.isGroup && SIMPLE_KINDS.has(c.kind) && !c.multiLine);
  const repeatLabel = `Repeats ${node.minOccurs ?? 0}–${node.maxOccurs ?? "∞"} times`;
  const zebraRows = useFormStore((s) => s.zebraRows);

  if (allSimple) {
    const sampleRows = 2;
    return (
      <div data-node-id={node.id} className="rounded-lg border border-type-loop/40 bg-surface">
        <div className="flex items-center justify-between border-b border-type-loop/30 bg-type-loop/5 px-4 py-2.5">
          <div className="flex items-center gap-2">
            <TableIcon className="h-4 w-4 text-type-loop" />
            <div className="flex items-center gap-2">
              <span className="rounded border border-type-loop/40 bg-type-loop/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-type-loop">Table</span>
              <div className="text-sm font-semibold text-foreground">{node.title}</div>
              <span className="text-[10px] text-type-loop">{repeatLabel}</span>
            </div>
          </div>
          {node.visibleReadable && (
            <span title={stripPlainEnglishMarkers(node.visiblePlain) || node.visibleReadable} className="hidden md:inline-flex items-center gap-1 text-[10px] text-info"><Eye className="h-3 w-3" /> conditional</span>
          )}
        </div>
        <div className="overflow-x-auto p-3">
          <table className="w-full border-collapse text-[11px]">
            <thead>
              <tr className="border-b border-border">
                <th className="px-2 py-1.5 text-left font-medium text-muted-foreground w-8">#</th>
                <th className="px-2 py-1.5 text-left font-medium text-muted-foreground w-10">Done</th>
                {children.map((c) => (
                  <th
                    key={c.id}
                    data-node-id={c.id}
                    onClick={() => onSelect(c.id)}
                    className="cursor-pointer px-2 py-1.5 text-left font-medium text-foreground hover:text-primary"
                  >
                    <div className="flex items-center gap-1">
                      {c.title}
                      {c.requiredRule && <Asterisk className="h-2 w-2 text-destructive" />}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: sampleRows }).map((_, i) => (
                <tr key={i} className={cn("border-b border-border/50", zebraRows && i % 2 === 1 && "bg-surface-2")}>
                  <td className="px-2 py-1 text-muted-foreground">{i + 1}</td>
                  <td className="px-2 py-1">
                    <PillToggle checked={false} disabled size="sm" title="Done is tracked per field, not per row" />
                  </td>
                  {children.map((c) => (
                    <td key={c.id} className="px-2 py-1">{renderControl(c)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <button
            type="button"
            onClick={(e) => e.stopPropagation()}
            className="mt-2 inline-flex items-center gap-1 rounded border border-dashed border-type-loop/40 bg-type-loop/5 px-2 py-1 text-[11px] text-type-loop hover:bg-type-loop/10"
          >
            <Plus className="h-3 w-3" /> Add row
          </button>
        </div>
      </div>
    );
  }

  // Loop screen: stacked entries with Add another control
  return (
    <div data-node-id={node.id} className="rounded-lg border border-type-loop/40 bg-surface">
      <div className="flex items-center justify-between border-b border-type-loop/30 bg-type-loop/5 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <Repeat2 className="h-4 w-4 text-type-loop" />
          <div className="flex items-center gap-2">
            <span className="rounded border border-type-loop/40 bg-type-loop/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-type-loop">Loop screen</span>
            <div className="text-sm font-semibold text-foreground">{node.title}</div>
            <span className="text-[10px] text-type-loop">{repeatLabel}</span>
          </div>
        </div>
        {node.visibleReadable && (
          <span title={stripPlainEnglishMarkers(node.visiblePlain) || node.visibleReadable} className="hidden md:inline-flex items-center gap-1 text-[10px] text-info"><Eye className="h-3 w-3" /> conditional</span>
        )}
      </div>
      <div className="space-y-3 p-4">
        <div className="rounded-md border border-type-loop/20 bg-surface-2/40 p-3">
          <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-type-loop">Entry 1</div>
          <div className="space-y-3">
            {node.childrenIds.map((id) => (
              <PreviewNode key={id} node={schema.nodes[id]} schema={schema} onSelect={onSelect} isDone={isDone} toggleDone={toggleDone} />
            ))}
          </div>
        </div>
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          className="inline-flex items-center gap-1 rounded border border-dashed border-type-loop/40 bg-type-loop/5 px-2.5 py-1 text-[11px] text-type-loop hover:bg-type-loop/10"
        >
          <Plus className="h-3 w-3" /> Add another
        </button>
      </div>
    </div>
  );
}