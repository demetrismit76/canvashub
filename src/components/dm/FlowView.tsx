import { useMemo, useCallback, useEffect, useState } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  ReactFlowProvider,
  useNodesState,
  useEdgesState,
  MarkerType,
  Handle,
  Position,
  Panel,
  useReactFlow,
  type Node,
  type Edge,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useFormStore } from "@/store/useFormStore";
import { TypeBadge } from "./TypeBadge";
import { cn } from "@/lib/utils";
import { ChevronDown, ChevronRight, Maximize2, Minimize2, Link2, Link2Off, Eye, Lock, Asterisk, Filter, Layers3 } from "lucide-react";
import type { DMSchema } from "@/lib/dm/types";

const NODE_W = 260;
const NODE_H = 52;
const GAP_Y = 22;
const PAD_X = 28;
const PAD_TOP = 68;
const PAD_BOTTOM = 28;
const COL_GAP = 96;
const COLLAPSED_W = 280;
const COLLAPSED_H = 64;

type Layout = { w: number; h: number };

function computeLayouts(schema: DMSchema, collapsed: Set<string>) {
  const layouts: Record<string, Layout> = {};
  const positions: Record<string, { x: number; y: number }> = {};
  const hidden = new Set<string>();

  const measure = (id: string): Layout => {
    const n = schema.nodes[id];
    const isContainer = n.isGroup || n.kind === "root";
    if (!isContainer) {
      const l = { w: NODE_W, h: NODE_H };
      layouts[id] = l;
      return l;
    }
    if (collapsed.has(id) && n.kind !== "root") {
      for (const cid of descendants(schema, id)) hidden.add(cid);
      const l = { w: COLLAPSED_W, h: COLLAPSED_H };
      layouts[id] = l;
      return l;
    }
    const kids = n.childrenIds.map(measure);
    if (kids.length === 0) {
      const l = { w: COLLAPSED_W, h: COLLAPSED_H };
      layouts[id] = l;
      return l;
    }
    const totalH = kids.reduce((s, l) => s + l.h, 0) + Math.max(0, kids.length - 1) * GAP_Y;
    const target = 1100;
    const cols = Math.max(1, Math.min(kids.length, Math.ceil(totalH / target)));
    const colHeights = new Array(cols).fill(0);
    const colChildren: number[][] = Array.from({ length: cols }, () => []);
    kids.forEach((l, i) => {
      let best = 0;
      for (let c = 1; c < cols; c++) if (colHeights[c] < colHeights[best]) best = c;
      colChildren[best].push(i);
      colHeights[best] += l.h + GAP_Y;
    });
    const colWidths = colChildren.map((ids) => Math.max(NODE_W, ...ids.map((i) => kids[i].w)));
    let x = PAD_X;
    colChildren.forEach((ids, c) => {
      let y = PAD_TOP;
      for (const i of ids) {
        positions[n.childrenIds[i]] = { x, y };
        y += kids[i].h + GAP_Y;
      }
      x += colWidths[c] + COL_GAP;
    });
    const w = Math.max(NODE_W + PAD_X * 2, x - COL_GAP + PAD_X);
    const h = Math.max(...colHeights, 0) + PAD_TOP + PAD_BOTTOM - GAP_Y;
    const l = { w, h: Math.max(h, NODE_H + PAD_TOP) };
    layouts[id] = l;
    return l;
  };

  measure(schema.rootId);
  positions[schema.rootId] = { x: 0, y: 0 };
  return { layouts, positions, hidden };
}

function descendants(schema: DMSchema, id: string): string[] {
  const out: string[] = [];
  const walk = (i: string) => {
    for (const c of schema.nodes[i].childrenIds) {
      out.push(c);
      walk(c);
    }
  };
  walk(id);
  return out;
}

type GroupData = {
  label: string;
  identifier: string;
  kind: string;
  isCollapsed: boolean;
  childCount: number;
  totalDescendants: number;
  onToggle: () => void;
};

function GroupNode({ data, selected }: NodeProps) {
  const d = data as unknown as GroupData;
  const isLoop = d.kind === "loop";
  return (
    <div
      className={cn(
        "group h-full w-full rounded-xl border-2 transition-all",
        isLoop ? "border-type-loop/50 bg-type-loop/[0.04]" : "border-type-group/40 bg-type-group/[0.04]",
        selected && "ring-2 ring-primary ring-offset-1 ring-offset-background",
        d.isCollapsed && "shadow-md hover:shadow-lg",
      )}
    >
      <button
        onClick={(e) => {
          e.stopPropagation();
          d.onToggle();
        }}
        className={cn(
          "flex w-full items-center gap-2 border-b border-border/60 bg-surface/90 backdrop-blur px-3 py-2.5 text-left rounded-t-[10px] hover:bg-surface-2/90",
          d.isCollapsed && "rounded-b-[10px] border-b-0",
        )}
      >
        {d.isCollapsed ? (
          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        )}
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-semibold text-foreground leading-tight">{d.label}</div>
          <div className="font-mono-tight text-[10px] text-muted-foreground truncate leading-tight mt-0.5">
            {d.identifier}
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="rounded bg-muted/60 px-1.5 py-0.5 font-mono-tight text-[10px] font-semibold text-muted-foreground">
            {d.childCount}
            {d.totalDescendants !== d.childCount && (
              <span className="text-muted-foreground/60"> / {d.totalDescendants}</span>
            )}
          </span>
          <TypeBadge kind={d.kind} />
        </div>
      </button>
      <Handle type="target" position={Position.Left} className="!h-2 !w-2 !bg-primary/70 !border-0" />
      <Handle type="source" position={Position.Right} className="!h-2 !w-2 !bg-primary/70 !border-0" />
    </div>
  );
}

function FieldNode({ data, selected }: NodeProps) {
  const d = data as {
    label: string;
    identifier: string;
    kind: string;
    required?: "always" | "when" | null;
    conditional?: boolean;
    readOnly?: boolean;
    hasFilter?: boolean;
    multi?: boolean;
  };
  return (
    <div
      className={cn(
        "flex h-full w-full items-center gap-2 rounded-md border bg-surface px-2.5 py-2 shadow-sm transition-all hover:bg-surface-2 hover:shadow-md",
        selected ? "border-primary ring-1 ring-primary" : "border-border",
      )}
    >
      <TypeBadge kind={d.kind} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1 leading-tight">
          <span className="truncate text-[11.5px] font-medium text-foreground">{d.label}</span>
          {d.required && (
            <Asterisk
              className={cn(
                "h-2.5 w-2.5 shrink-0",
                d.required === "when" ? "text-warning" : "text-destructive",
              )}
            />
          )}
        </div>
        <div className="font-mono-tight text-[9.5px] text-muted-foreground truncate leading-tight mt-0.5">
          {d.identifier}
        </div>
      </div>
      {(d.conditional || d.readOnly || d.hasFilter || d.multi) && (
        <div className="flex shrink-0 items-center gap-0.5">
          {d.conditional && (
            <span title="Conditional visibility" className="flex h-4 w-4 items-center justify-center rounded bg-info/10 text-info">
              <Eye className="h-2.5 w-2.5" />
            </span>
          )}
          {d.hasFilter && (
            <span title="Options filter" className="flex h-4 w-4 items-center justify-center rounded bg-accent/10 text-accent">
              <Filter className="h-2.5 w-2.5" />
            </span>
          )}
          {d.readOnly && (
            <span title="Read-only" className="flex h-4 w-4 items-center justify-center rounded bg-accent/10 text-accent">
              <Lock className="h-2.5 w-2.5" />
            </span>
          )}
          {d.multi && (
            <span title="Multiple values" className="flex h-4 w-4 items-center justify-center rounded bg-muted/60 text-muted-foreground">
              <Layers3 className="h-2.5 w-2.5" />
            </span>
          )}
        </div>
      )}
      <Handle type="target" position={Position.Left} className="!h-1.5 !w-1.5 !bg-muted-foreground !border-0" />
      <Handle type="source" position={Position.Right} className="!h-1.5 !w-1.5 !bg-muted-foreground !border-0" />
    </div>
  );
}

const nodeTypes = { group: GroupNode, field: FieldNode };

function FlowInner() {
  const { schema, select, selectedId, collapseOnStartup } = useFormStore();
  const { fitView } = useReactFlow();
  const [showDeps, setShowDeps] = useState(true);
  const [collapsed, setCollapsed] = useState<Set<string>>(() => {
    if (!schema) return new Set();
    const s = new Set<string>();
    for (const id of schema.order) {
      const n = schema.nodes[id];
      if (collapseOnStartup) {
        if ((n.isGroup || n.kind === "root") && n.kind !== "root") s.add(id);
      } else if ((n.isGroup || n.kind === "root") && n.depth >= 2) {
        s.add(id);
      }
    }
    return s;
  });

  const toggleCollapsed = useCallback((id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const { nodes: builtNodes, edges: builtEdges } = useMemo(() => {
    if (!schema) return { nodes: [] as Node[], edges: [] as Edge[] };
    const { layouts, positions, hidden } = computeLayouts(schema, collapsed);
    const visible = (id: string) => !hidden.has(id) && !!layouts[id];
    const nodes: Node[] = [];
    for (const id of schema.order) {
      if (!visible(id)) continue;
      const n = schema.nodes[id];
      const isContainer = n.isGroup || n.kind === "root";
      const l = layouts[id];
      const p = positions[id] ?? { x: 0, y: 0 };
      const isCollapsed = collapsed.has(id) && n.kind !== "root";
      nodes.push({
        id,
        type: isContainer ? "group" : "field",
        position: p,
        parentId: n.parentId && visible(n.parentId) ? n.parentId : undefined,
        extent: n.parentId && visible(n.parentId) ? "parent" : undefined,
        draggable: true,
        selectable: true,
        data: isContainer
          ? {
              label: n.title || n.identifier,
              identifier: n.identifier,
              kind: n.kind,
              isCollapsed,
              childCount: n.childrenIds.length,
              totalDescendants: descendants(schema, id).length,
              onToggle: () => toggleCollapsed(id),
            }
          : {
              label: n.title || n.identifier,
              identifier: n.identifier,
              kind: n.kind,
              required:
                n.requiredRule === "always" || n.requiredRule === "when" ? n.requiredRule : null,
              conditional: !!n.visibleReadable,
              readOnly:
                n.readOnlyRule === "always" ||
                (n.initialAnswer !== undefined && n.initialAnswer !== null && n.initialAnswer !== ""),
              hasFilter: !!n.optionsFilterReadable,
              multi: !!n.multiple,
            },
        style: { width: l.w, height: l.h },
        zIndex: isContainer ? 0 : 1,
      });
    }
    const edges: Edge[] = [];
    if (showDeps) {
      // bubble hidden endpoints up to nearest visible ancestor
      const visibleAncestor = (id: string): string | null => {
        let cur: string | null = id;
        while (cur && !visible(cur)) cur = schema.nodes[cur].parentId;
        return cur;
      };
      // Find nearest common ancestor of two nodes
      const ancestors = (id: string): string[] => {
        const out: string[] = [];
        let cur: string | null = id;
        while (cur) {
          out.push(cur);
          cur = schema.nodes[cur].parentId;
        }
        return out;
      };
      // Bubble an endpoint up to the child of the common ancestor with the other endpoint.
      // This routes cross-group edges between top-level group boundaries instead of slicing
      // through nested children, dramatically reducing edge crossings.
      const bubbleToBoundary = (id: string, other: string): string | null => {
        const v = visibleAncestor(id);
        const vo = visibleAncestor(other);
        if (!v || !vo) return v;
        if (v === vo) return v;
        const aSet = new Set(ancestors(v));
        let cur: string | null = vo;
        let prev: string | null = vo;
        while (cur && !aSet.has(cur)) {
          prev = cur;
          cur = schema.nodes[cur].parentId;
        }
        // common = cur; we want the child of `common` on the `v` side
        if (!cur) return v;
        const common = cur;
        let walk: string | null = v;
        let lastBeforeCommon: string | null = v;
        while (walk && walk !== common) {
          lastBeforeCommon = walk;
          walk = schema.nodes[walk].parentId;
        }
        return lastBeforeCommon;
      };
      const seen = new Set<string>();
      for (const id of schema.order) {
        const n = schema.nodes[id];
        for (const dep of n.dependsOn) {
          const fromRaw = schema.byIdentifier[dep];
          if (!fromRaw) continue;
          const from = bubbleToBoundary(fromRaw, id);
          const to = bubbleToBoundary(id, fromRaw);
          if (!from || !to || from === to) continue;
          const via = n.visibleExpr?.includes(`.${dep}`)
            ? "visible"
            : n.optionsFilterExpr?.includes(`.${dep}`)
            ? "filter"
            : "required";
          const key = `${from}->${to}:${via}`;
          if (seen.has(key)) continue;
          seen.add(key);
          const color =
            via === "visible"
              ? "hsl(var(--info))"
              : via === "filter"
              ? "hsl(var(--accent))"
              : "hsl(var(--destructive))";
          edges.push({
            id: key,
            source: from,
            target: to,
            type: "smoothstep",
            style: { stroke: color, strokeWidth: 1.25, opacity: 0.42 },
            markerEnd: { type: MarkerType.ArrowClosed, color, width: 12, height: 12 },
            data: { pathOptions: { borderRadius: 18, offset: 24 } },
          });
        }
      }
    }
    return { nodes, edges };
  }, [schema, collapsed, showDeps, toggleCollapsed]);

  const [nodes, setNodes, onNodesChange] = useNodesState(builtNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(builtEdges);

  useEffect(() => {
    setNodes(builtNodes);
  }, [builtNodes, setNodes]);
  useEffect(() => {
    setEdges(builtEdges);
  }, [builtEdges, setEdges]);

  useEffect(() => {
    setNodes((nds) => nds.map((n) => ({ ...n, selected: n.id === selectedId })));
  }, [selectedId, setNodes]);

  const onNodeClick = useCallback((_: unknown, node: Node) => select(node.id), [select]);

  const expandAll = useCallback(() => setCollapsed(new Set()), []);
  const collapseAll = useCallback(() => {
    if (!schema) return;
    const s = new Set<string>();
    for (const id of schema.order) {
      const n = schema.nodes[id];
      if ((n.isGroup || n.kind === "root") && n.depth >= 1) s.add(id);
    }
    setCollapsed(s);
    setTimeout(() => fitView({ padding: 0.2, duration: 400 }), 50);
  }, [schema, fitView]);

  if (!schema) return null;

  return (
    <div className="flex-1 min-h-0 bg-background">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClick}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.15 }}
        minZoom={0.05}
        maxZoom={2.5}
        proOptions={{ hideAttribution: true }}
        defaultEdgeOptions={{ type: "smoothstep" }}
      >
        <Background gap={22} size={1} />
        <Controls showInteractive={false} />
        <MiniMap
          pannable
          zoomable
          nodeStrokeWidth={2}
          maskColor="hsl(var(--background) / 0.7)"
          nodeColor={(n) => (n.type === "group" ? "hsl(var(--type-group))" : "hsl(var(--muted-foreground))")}
        />
        <Panel position="top-left" className="!m-3">
          <div className="flex items-center gap-1 rounded-lg border border-border bg-surface/95 backdrop-blur p-1 shadow-sm">
            <button
              onClick={expandAll}
              className="flex h-7 items-center gap-1.5 rounded px-2 text-[11px] font-medium text-foreground hover:bg-surface-2"
              title="Expand all groups"
            >
              <Maximize2 className="h-3 w-3" />
              Expand all
            </button>
            <button
              onClick={collapseAll}
              className="flex h-7 items-center gap-1.5 rounded px-2 text-[11px] font-medium text-foreground hover:bg-surface-2"
              title="Collapse all groups"
            >
              <Minimize2 className="h-3 w-3" />
              Collapse all
            </button>
            <div className="mx-1 h-4 w-px bg-border" />
            <button
              onClick={() => setShowDeps((v) => !v)}
              className={cn(
                "flex h-7 items-center gap-1.5 rounded px-2 text-[11px] font-medium transition-colors",
                showDeps ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-surface-2 hover:text-foreground",
              )}
              title="Toggle dependency links"
            >
              {showDeps ? <Link2 className="h-3 w-3" /> : <Link2Off className="h-3 w-3" />}
              Dependencies
            </button>
            <div className="mx-1 h-4 w-px bg-border" />
            <button
              onClick={() => fitView({ padding: 0.15, duration: 400 })}
              className="flex h-7 items-center rounded px-2 text-[11px] font-medium text-foreground hover:bg-surface-2"
              title="Fit view"
            >
              Fit
            </button>
          </div>
        </Panel>
        {showDeps && edges.length > 0 && (
          <Panel position="top-right" className="!m-3">
            <div className="flex items-center gap-3 rounded-lg border border-border bg-surface/95 backdrop-blur px-3 py-1.5 text-[10px] shadow-sm">
              <Legend color="hsl(var(--info))" label="visibility" />
              <Legend color="hsl(var(--accent))" label="options filter" />
              <Legend color="hsl(var(--destructive))" label="required" />
            </div>
          </Panel>
        )}
      </ReactFlow>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="inline-block h-0.5 w-5 rounded" style={{ background: color }} />
      <span className="text-muted-foreground">{label}</span>
    </div>
  );
}

export function FlowView() {
  return (
    <ReactFlowProvider>
      <FlowInner />
    </ReactFlowProvider>
  );
}