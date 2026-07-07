import { PillToggle } from "@/components/dm/PillToggle";
import { useMemo, useRef } from "react";
import { useFormStore } from "@/store/useFormStore";
import { buildGoCanvasMapping, GCScreen, GCField } from "@/lib/dm/gocanvas";
import { Repeat2, Layers, ChevronRight, Eye, Asterisk, Table as TableIcon, Smartphone, Lock, Layers3, Filter } from "lucide-react";
import { cn } from "@/lib/utils";
import { useDoneFields, doneKey } from "@/hooks/useDoneFields";
import { useScrollSelectedIntoView } from "@/hooks/useScrollSelectedIntoView";
import { BackToTop } from "./BackToTop";

function FieldChips({ node }: { node: any }) {
  if (!node) return null;
  const readOnly =
    node.readOnlyRule === "always" ||
    (node.initialAnswer !== undefined && node.initialAnswer !== null && node.initialAnswer !== "");
  const conditional = !!node.visibleReadable;
  const hasFilter = !!node.optionsFilterReadable;
  const multi = !!node.multiple;
  return (
    <>
      {conditional && (
        <span
          title={node.visibleReadable}
          className="inline-flex h-4 items-center gap-0.5 rounded border border-info/30 bg-info/10 px-1 text-[9px] font-medium text-info"
        >
          <Eye className="h-2.5 w-2.5" />
          If
        </span>
      )}
      {hasFilter && (
        <span
          title={node.optionsFilterReadable}
          className="inline-flex h-4 items-center gap-0.5 rounded border border-accent/30 bg-accent/10 px-1 text-[9px] font-medium text-accent"
        >
          <Filter className="h-2.5 w-2.5" />
          Filter
        </span>
      )}
      {readOnly && (
        <span
          title="Read-only"
          className="inline-flex h-4 items-center gap-0.5 rounded border border-accent/30 bg-accent/10 px-1 text-[9px] font-medium text-accent"
        >
          <Lock className="h-2.5 w-2.5" />
          RO
        </span>
      )}
      {multi && (
        <span
          title="Multiple values"
          className="inline-flex h-4 items-center gap-0.5 rounded border border-border bg-surface-2 px-1 text-[9px] font-medium text-muted-foreground"
        >
          <Layers3 className="h-2.5 w-2.5" />
          Multi
        </span>
      )}
    </>
  );
}

export function GoCanvasView() {
  const { schema, select, selectedId } = useFormStore();
  const { isDone, toggle: toggleDone } = useDoneFields();
  const scrollRef = useRef<HTMLDivElement>(null);
  useScrollSelectedIntoView(selectedId, [schema]);
  if (!schema) return null;
  const mapping = useMemo(() => buildGoCanvasMapping(schema, "Imported Form"), [schema]);

  return (
    <div ref={scrollRef} className="relative flex-1 overflow-auto scrollbar-thin bg-background p-6">
      <div className="mx-auto max-w-5xl">
        <div className="mb-4 flex items-end justify-between">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Suggested GoCanvas Layout</div>
            <div className="text-lg font-semibold text-foreground">{mapping.totalScreens} screens · {mapping.totalFields} fields</div>
          </div>
          <div className="text-[11px] text-muted-foreground">Use the Export menu to download a GoCanvas-ready JSON mapping.</div>
        </div>
        <div className="space-y-3">
          {mapping.screens.map((s, i) => (
            <Screen key={i} screen={s} index={i + 1} onSelect={select} selectedId={selectedId} schema={schema} isDone={isDone} toggleDone={toggleDone} />
          ))}
        </div>
      </div>
      <BackToTop scrollRef={scrollRef} />
    </div>
  );
}

function Screen({ screen, index, depth = 0, onSelect, selectedId, schema, isDone, toggleDone }: { screen: GCScreen; index: number; depth?: number; onSelect: (id: string | null) => void; selectedId: string | null; schema: any; isDone: (id: string) => boolean; toggleDone: (id: string) => void }) {
  const SIMPLE = new Set(["Text", "Numeric", "Selection", "Date", "Yes/No", "Email"]);
  const asTable =
    screen.isLoop &&
    screen.fields.length > 0 &&
    screen.subScreens.length === 0 &&
    screen.fields.every((f) => SIMPLE.has(f.gcType));

  const kind = asTable ? "table" : screen.isLoop ? "loop" : "screen";
  const Icon = kind === "table" ? TableIcon : kind === "loop" ? Repeat2 : depth === 0 ? Smartphone : Layers;
  const badgeLabel = kind === "table" ? "Table" : kind === "loop" ? "Loop screen" : "Screen";
  const tone =
    kind === "screen"
      ? { wrap: "border-border", head: "border-border bg-surface-2", icon: "text-muted-foreground", badge: "border-border bg-surface text-muted-foreground" }
      : { wrap: "border-type-loop/40", head: "border-type-loop/30 bg-type-loop/5", icon: "text-type-loop", badge: "border-type-loop/40 bg-type-loop/10 text-type-loop" };

  return (
    <div className={cn("rounded-lg border bg-surface", tone.wrap)}>
      <div className={cn("flex items-center gap-2 border-b px-3 py-2", tone.head)}>
        <Icon className={cn("h-4 w-4", tone.icon)} />
        <span className="font-mono-tight text-[10px] text-muted-foreground">SCREEN {index}</span>
        <span className={cn("rounded border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider", tone.badge)}>{badgeLabel}</span>
        <span className="text-sm font-semibold text-foreground">{screen.name}</span>
        <span className="ml-auto text-[10px] text-muted-foreground">{screen.fields.length} fields {screen.subScreens.length ? ` · ${screen.subScreens.length} sub-screens` : ""}</span>
      </div>
      {screen.notes.length > 0 && (
        <div className="border-b border-border bg-surface-2/50 px-3 py-1.5 text-[11px] text-muted-foreground">
          {screen.notes.join(" · ")}
        </div>
      )}
      {asTable ? (
        <LoopTable fields={screen.fields} onSelect={onSelect} selectedId={selectedId} schema={schema} />
      ) : screen.fields.length > 0 && (
        <div className="divide-y divide-border">
          {screen.fields.map((f) => {
            const fid = schema.byIdentifier[f.identifier];
            const fnode = fid ? schema.nodes[fid] : null;
            const dk = fnode ? doneKey(fnode) : f.identifier;
            const active = fid && fid === selectedId;
            const done = isDone(dk);
            return (
            <button
              key={f.identifier}
              type="button"
              data-node-id={fid || undefined}
              onClick={() => fid && onSelect(fid)}
              className={cn(
                "flex w-full items-start gap-3 px-3 py-2 text-left text-[12px] hover:bg-surface-2",
                active && "bg-primary/5",
                done && "bg-success/5",
              )}
            >
              <PillToggle
                checked={done}
                onCheckedChange={() => toggleDone(dk)}
                title={done ? "Mark as not done" : "Mark as done"}
                size="sm"
                className="mt-0.5"
              />
              <ChevronRight className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className={cn("font-medium text-foreground", done && "line-through opacity-60")}>{f.label}</span>
                  {f.required && (
                    <span
                      title={fnode?.requiredRule === "when" ? "Required when condition" : "Required"}
                      className="inline-flex"
                    >
                      <Asterisk
                        className={cn(
                          "h-2.5 w-2.5",
                          fnode?.requiredRule === "when" ? "text-warning" : "text-destructive",
                        )}
                      />
                    </span>
                  )}
                  <FieldChips node={fnode} />
                </div>
                <div className="font-mono-tight text-[10px] text-muted-foreground">{f.identifier}</div>
              </div>
              <span className="shrink-0 rounded bg-surface-2 px-1.5 py-0.5 font-mono-tight text-[10px] uppercase tracking-wider text-foreground">{f.gcType}</span>
            </button>
            );
          })}
        </div>
      )}
      {screen.subScreens.length > 0 && (
        <div className="space-y-2 p-2">
          {screen.subScreens.map((s, i) => (
            <Screen key={i} screen={s} index={i + 1} depth={depth + 1} onSelect={onSelect} selectedId={selectedId} schema={schema} isDone={isDone} toggleDone={toggleDone} />
          ))}
        </div>
      )}
    </div>
  );
}

function LoopTable({ fields, onSelect, selectedId, schema }: { fields: GCField[]; onSelect: (id: string | null) => void; selectedId: string | null; schema: any }) {
  return (
    <div className="overflow-x-auto p-3">
      <table className="w-full border-collapse text-[11px]">
        <thead>
          <tr className="border-b border-border">
            <th className="w-8 px-2 py-1.5 text-left font-medium text-muted-foreground">#</th>
            {fields.map((f) => {
              const fid = schema.byIdentifier[f.identifier];
              const active = fid && fid === selectedId;
              return (
              <th
                key={f.identifier}
                data-node-id={fid || undefined}
                onClick={() => fid && onSelect(fid)}
                className={cn(
                  "cursor-pointer px-2 py-1.5 text-left font-medium text-foreground hover:text-primary",
                  active && "text-primary",
                )}
              >
                <div className="flex items-center gap-1">
                  <span>{f.label}</span>
                  {f.required && <Asterisk className="h-2 w-2 text-destructive" />}
                  <span className="ml-1 rounded bg-surface-2 px-1 py-0.5 font-mono-tight text-[9px] uppercase tracking-wider text-muted-foreground">{f.gcType}</span>
                </div>
                <div className="font-mono-tight text-[9px] font-normal text-muted-foreground">{f.identifier}</div>
              </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {[1, 2].map((i) => (
            <tr key={i} className="border-b border-border/50">
              <td className="px-2 py-1 text-muted-foreground">{i}</td>
              {fields.map((f) => (
                <td key={f.identifier} className="px-2 py-1 text-muted-foreground">…</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}