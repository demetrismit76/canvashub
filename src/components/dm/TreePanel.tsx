import {
  ChevronDown, ChevronRight, Repeat2, FolderOpen, FolderClosed, Eye, Asterisk, Filter, Search, X,
  ChevronsDownUp, ChevronsUpDown, PanelLeftClose, PanelLeftOpen,
  ListChecks, ToggleLeft, AtSign, Type, FolderTree,
  Hash, Calendar, Clock, Calculator, MapPin, Image as ImageIcon, PenLine, Brush,
  ScanBarcode, Mic, Video, Paperclip, Tag, Phone, Link as LinkIcon,
  Maximize2, Flag,
} from "lucide-react";
import { useFormStore } from "@/store/useFormStore";
import { DMNode } from "@/lib/dm/types";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { TypeBadge } from "./TypeBadge";
import { useMemo, useState, useEffect } from "react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { AnimatePresence, motion } from "framer-motion";
import { LayoutGrid } from "lucide-react";
import { useReviewFields } from "@/hooks/useReviewFields";
import { doneKey } from "@/hooks/useDoneFields";

const KINDS: { id: string; label: string; Icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "select",      label: "Select",       Icon: ListChecks  },
  { id: "boolean",     label: "Yes / No",     Icon: ToggleLeft  },
  { id: "email",       label: "Email",        Icon: AtSign      },
  { id: "text",        label: "Text",         Icon: Type        },
  { id: "number",      label: "Number",       Icon: Hash        },
  { id: "date",        label: "Date",         Icon: Calendar    },
  { id: "time",        label: "Time",         Icon: Clock       },
  { id: "calculation", label: "Calculation",  Icon: Calculator  },
  { id: "location",    label: "Location",     Icon: MapPin      },
  { id: "image",       label: "Image",        Icon: ImageIcon   },
  { id: "signature",   label: "Signature",    Icon: PenLine     },
  { id: "sketch",      label: "Sketch",       Icon: Brush       },
  { id: "barcode",     label: "Barcode",      Icon: ScanBarcode },
  { id: "audio",       label: "Audio",        Icon: Mic         },
  { id: "video",       label: "Video",        Icon: Video       },
  { id: "file",        label: "File",         Icon: Paperclip   },
  { id: "label",       label: "Label",        Icon: Tag         },
  { id: "phone",       label: "Phone",        Icon: Phone       },
  { id: "url",         label: "URL",          Icon: LinkIcon    },
  { id: "group",       label: "Group",        Icon: FolderTree  },
  { id: "loop",        label: "Loop",         Icon: Repeat2     },
];

export function TreePanel() {
  const { schema, expanded, toggleExpand, select, selectedId, filters, setFilter, toggleKind, clearFilters, expandAll, collapseAll, collapseOnStartup, setCollapseOnStartup, autoSidebar, setAutoSidebar } = useFormStore();
  const reviewMode = useFormStore((s) => s.reviewMode);
  const { map: reviewMap, flaggedCount } = useReviewFields();
  // Auto-clear when review mode is off so the tree doesn't silently hide everything.
  useEffect(() => {
    if (!reviewMode && filters.onlyFlagged) setFilter("onlyFlagged", false);
  }, [reviewMode, filters.onlyFlagged, setFilter]);
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem("dm:sidebarCollapsed") === "1";
  });
  // Persist hidden/visible state across reloads.
  useEffect(() => {
    try { window.localStorage.setItem("dm:sidebarCollapsed", collapsed ? "1" : "0"); } catch { /* ignore */ }
  }, [collapsed]);
  const [typesOpen, setTypesOpen] = useState(false);
  // Auto-collapse the tree on narrow viewports when the user opts in.
  // The user's persisted choice still wins when auto-sidebar is off.
  useEffect(() => {
    if (!autoSidebar) return;
    const mql = window.matchMedia("(max-width: 1100px)");
    const apply = () => setCollapsed(mql.matches);
    apply();
    mql.addEventListener("change", apply);
    return () => mql.removeEventListener("change", apply);
  }, [autoSidebar]);
  // Keep the sidebar in sync with the selection driven by other views:
  // expand every ancestor group of the selected node, then scroll it into view.
  useEffect(() => {
    if (!selectedId || !schema) return;
    const node = schema.nodes[selectedId];
    if (!node) return;
    let p = node.parentId;
    const toOpen: string[] = [];
    while (p) {
      if (!expanded[p]) toOpen.push(p);
      p = schema.nodes[p].parentId;
    }
    if (toOpen.length) toOpen.forEach((id) => toggleExpand(id));
    const raf = requestAnimationFrame(() => {
      const el = document.querySelector<HTMLElement>(`[data-tree-node-id="${selectedId}"]`);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
    });
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, schema]);
  if (!schema) return null;
  const root = schema.nodes[schema.rootId];

  // Ancestor chain of the selected node — used to highlight the path from
  // root down to the selection (rails + labels get emphasised).
  const ancestorIds = useMemo(() => {
    const s = new Set<string>();
    if (!selectedId || !schema) return s;
    let p = schema.nodes[selectedId]?.parentId;
    while (p) { s.add(p); p = schema.nodes[p].parentId; }
    return s;
  }, [selectedId, schema]);

  const railColor = (level: number) => `hsl(var(--tree-rail-${(level % 4) + 1}))`;

  const matched = useMemo(() => {
    if (!filters.query && filters.kinds.size === 0 && !filters.onlyConditional && !filters.onlyRequired && !filters.onlyLoops && !filters.onlyFlagged) return null;
    const q = filters.query.toLowerCase();
    const set = new Set<string>();
    for (const id of schema.order) {
      const n = schema.nodes[id];
      if (n.kind === "root") continue;
      const matches =
        (!q || n.identifier.toLowerCase().includes(q) || n.title.toLowerCase().includes(q)) &&
        (filters.kinds.size === 0 || filters.kinds.has(n.kind)) &&
        (!filters.onlyConditional || !!n.visibleExpr) &&
        (!filters.onlyRequired || !!n.requiredRule) &&
        (!filters.onlyLoops || n.isLoop) &&
        (!filters.onlyFlagged || !!reviewMap[doneKey(n)]?.needsEdit);
      if (matches) {
        set.add(id);
        let p = n.parentId;
        while (p) { set.add(p); p = schema.nodes[p].parentId; }
      }
    }
    return set;
  }, [schema, filters, reviewMap]);

  const renderNode = (node: DMNode) => {
    if (matched && !matched.has(node.id) && node.kind !== "root") return null;
    const isOpen = expanded[node.id];
    const isSel = selectedId === node.id;
    const isAncestor = ancestorIds.has(node.id);
    const hasChildren = node.childrenIds.length > 0;
    const indent = node.depth * 14;

    return (
      <div key={node.id}>
        {node.kind !== "root" && (
          <motion.div
            layout="position"
            initial={{ opacity: 0, x: -4 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ type: "spring", stiffness: 420, damping: 32, mass: 0.6 }}
            onClick={() => select(node.id)}
            data-tree-node-id={node.id}
            className={cn(
              "group relative mx-1 flex items-center gap-1 cursor-pointer rounded-md pr-2 py-1 text-[12px]",
              "transition-colors duration-150 hover:bg-dmsidebar-2/80",
              isSel && "bg-primary/10 ring-1 ring-primary/25",
            )}
            style={{ paddingLeft: indent + 6 }}
          >
            {/* Left accent bar — hover/active indicator */}
            <span
              aria-hidden
              className={cn(
                "pointer-events-none absolute left-0 top-1 bottom-1 w-[2px] rounded-r-full transition-colors",
                isSel
                  ? "bg-primary"
                  : "bg-transparent group-hover:bg-primary/40",
              )}
            />
            {/* Colored depth rails — one per ancestor level, cycled by depth. */}
            {Array.from({ length: node.depth - 1 }).map((_, i) => {
              const highlight = isSel || isAncestor;
              return (
                <span
                  key={i}
                  aria-hidden
                  className="pointer-events-none absolute top-0 bottom-0 w-[2px] rounded-full transition-opacity duration-200"
                  style={{
                    left: 6 + i * 14 + 6,
                    background: railColor(i),
                    opacity: highlight ? 0.85 : 0.28,
                  }}
                />
              );
            })}
            {/* Elbow connector from last rail into the row */}
            {node.depth > 1 && (
              <span
                aria-hidden
                className="pointer-events-none absolute h-[2px] rounded-full transition-opacity duration-200"
                style={{
                  left: 6 + (node.depth - 2) * 14 + 6,
                  top: "50%",
                  width: 10,
                  background: railColor(node.depth - 2),
                  opacity: isSel || isAncestor ? 0.7 : 0.25,
                }}
              />
            )}
            {hasChildren ? (
              <button
                onClick={(e) => { e.stopPropagation(); toggleExpand(node.id); }}
                className="relative z-[1] flex h-4 w-4 items-center justify-center rounded text-dmsidebar-muted hover:bg-dmsidebar-2 hover:text-dmsidebar-foreground"
              >
                <motion.span
                  animate={{ rotate: isOpen ? 90 : 0 }}
                  transition={{ type: "spring", stiffness: 500, damping: 30 }}
                  className="flex items-center justify-center"
                >
                  <ChevronRight className="h-3 w-3" />
                </motion.span>
              </button>
            ) : (
              <span className="w-4" />
            )}
            {node.isLoop ? (
              <Repeat2 className="relative z-[1] h-3.5 w-3.5 shrink-0 text-type-loop" />
             ) : node.isGroup ? (
               <motion.span
                 key={isOpen ? "open" : "closed"}
                 initial={{ scale: 0.7, opacity: 0 }}
                 animate={{ scale: 1, opacity: 1 }}
                 transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                 className="relative z-[1] flex shrink-0 items-center justify-center"
               >
                  {isOpen
                    ? <FolderOpen className="h-3.5 w-3.5" style={{ color: railColor(node.depth - 1) }} strokeWidth={1.9} />
                    : <FolderClosed className="h-3.5 w-3.5" style={{ color: railColor(node.depth - 1), opacity: 0.85 }} strokeWidth={1.9} />}
               </motion.span>
             ) : (
              <span className="relative z-[1] w-3.5" />
            )}
            <span className={cn(
              "relative z-[1] truncate",
              isSel ? "text-primary font-semibold"
                : isAncestor ? "text-foreground font-medium"
                : "text-dmsidebar-foreground",
              node.isGroup && !isSel && "font-semibold",
            )}>
              {node.title}
            </span>
            {node.isGroup && (
              <span className="relative z-[1] rounded bg-dmsidebar-2 px-1 py-px font-mono-tight text-[9px] text-dmsidebar-muted">
                {node.childrenIds.length}
              </span>
            )}
            <span className="relative z-[1] ml-auto flex items-center gap-1 opacity-80">
              <span className="hidden font-mono-tight text-[9px] text-dmsidebar-muted/70 group-hover:inline">
                L{node.depth}
              </span>
              {node.visibleExpr && <Eye className="h-3 w-3 text-info" />}
              {node.requiredRule && <Asterisk className="h-3 w-3 text-destructive" />}
              {node.optionsFilterExpr && <Filter className="h-3 w-3 text-accent" />}
              {!node.isGroup && <TypeBadge kind={node.kind} />}
            </span>
          </motion.div>
        )}
        {node.kind === "root"
          ? hasChildren && node.childrenIds.map((cid) => renderNode(schema.nodes[cid]))
          : (
            <AnimatePresence initial={false}>
              {isOpen && hasChildren && (
                <motion.div
                  key="children"
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ type: "spring", stiffness: 380, damping: 34, mass: 0.7, opacity: { duration: 0.18 } }}
                  style={{ overflow: "hidden" }}
                >
                  {node.childrenIds.map((cid) => renderNode(schema.nodes[cid]))}
                </motion.div>
              )}
            </AnimatePresence>
          )}
      </div>
    );
  };

  const filterCount = filters.kinds.size + (filters.onlyConditional ? 1 : 0) + (filters.onlyRequired ? 1 : 0) + (filters.onlyLoops ? 1 : 0);

  // Show every Device Magic kind in the flyout — even if the current form has none.
  const visibleKinds = KINDS;

  return (
    <aside
      className={cn(
        "relative flex shrink-0 flex-col border-r border-dmsidebar-border bg-sidebar-gradient text-dmsidebar-foreground",
        "transition-[width] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
        collapsed ? "w-9" : "w-80",
      )}
    >
      {/* Floating toggle handle — shown only when collapsed; expanded sidebar
          has an inline collapse button in the header (ClickUp-style). */}
      {collapsed && (
        <button
          onClick={() => setCollapsed(false)}
          title="Expand sidebar"
          className={cn(
            "absolute right-1.5 top-3 z-20 flex h-6 w-6 items-center justify-center rounded-full",
            "bg-dmsidebar-2 text-dmsidebar-muted shadow-sm ring-1 ring-dmsidebar-border",
            "hover:text-dmsidebar-foreground hover:bg-dmsidebar-2/80 transition-colors",
          )}
        >
          <PanelLeftOpen className="h-3.5 w-3.5" />
        </button>
      )}

      {collapsed ? (
        <div className="flex flex-1 flex-col items-center pt-12 gap-3 animate-in fade-in duration-300">
          <div
            className="font-semibold tracking-tight text-[10px] uppercase text-dmsidebar-muted"
            style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}
          >
            Form Structure · {schema.stats.total}
          </div>
        </div>
      ) : (
      <div className={cn("flex flex-1 flex-col min-h-0 transition-opacity duration-200", collapsed && "opacity-0 pointer-events-none")}>
      {/* Header — ClickUp-style: workspace icon, name, count chip, inline collapse */}
      <div className="flex items-center gap-2 px-3 pt-3 pb-2">
        <div className="min-w-0 leading-tight">
          <div className="truncate text-[12px] font-semibold tracking-tight">Form Structure</div>
          <div className="font-mono-tight text-[10px] text-dmsidebar-muted">{schema.stats.total} fields</div>
        </div>
        <div className="ml-auto flex items-center gap-0.5">
          <IconToggle
            on={filters.onlyConditional}
            onClick={() => setFilter("onlyConditional", !filters.onlyConditional)}
            icon={<Eye className="h-3.5 w-3.5" />}
            title="Only conditional"
          />
          <IconToggle
            on={filters.onlyRequired}
            onClick={() => setFilter("onlyRequired", !filters.onlyRequired)}
            icon={<Asterisk className="h-3.5 w-3.5" />}
            title="Only required"
          />
          <IconToggle
            on={filters.onlyLoops}
            onClick={() => setFilter("onlyLoops", !filters.onlyLoops)}
            icon={<Repeat2 className="h-3.5 w-3.5" />}
            title="Only loops"
          />
          {reviewMode && (
            <IconToggle
              on={filters.onlyFlagged}
              onClick={() => setFilter("onlyFlagged", !filters.onlyFlagged)}
              icon={
                <span className="relative inline-flex">
                  <Flag className="h-3.5 w-3.5" />
                  {flaggedCount > 0 && (
                    <span className="absolute -right-1 -top-1 min-w-[10px] rounded-full bg-destructive px-0.5 text-[8px] font-bold leading-[10px] text-destructive-foreground">
                      {flaggedCount > 99 ? "99+" : flaggedCount}
                    </span>
                  )}
                </span>
              }
              title={
                filters.onlyFlagged
                  ? "Show all fields"
                  : flaggedCount > 0
                    ? `Only flagged for review (${flaggedCount})`
                    : "No flagged fields yet"
              }
            />
          )}
          <span className="mx-1 h-4 w-px bg-dmsidebar-border" />
        <button
          onClick={() => setAutoSidebar(!autoSidebar)}
          title={autoSidebar ? "Auto-collapse on narrow screens: ON" : "Auto-collapse on narrow screens: OFF"}
          className={cn(
            "flex h-6 w-6 items-center justify-center rounded-md transition-colors",
            autoSidebar
              ? "bg-primary/15 text-primary"
              : "text-dmsidebar-muted hover:bg-dmsidebar-2 hover:text-dmsidebar-foreground",
          )}
        >
          <Maximize2 className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={() => setCollapsed(true)}
          title="Collapse sidebar"
            className="flex h-6 w-6 items-center justify-center rounded-md text-dmsidebar-muted hover:bg-dmsidebar-2 hover:text-dmsidebar-foreground transition-colors"
        >
          <PanelLeftClose className="h-3.5 w-3.5" />
        </button>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col gap-2 px-3 pb-3">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-dmsidebar-muted" />
          <Input
            value={filters.query}
            onChange={(e) => setFilter("query", e.target.value)}
            placeholder="Search fields, identifiers…"
            className="h-8 rounded-md border-transparent bg-dmsidebar-2 pl-8 pr-7 text-[12px] text-dmsidebar-foreground placeholder:text-dmsidebar-muted focus-visible:border-primary/50 focus-visible:ring-1 focus-visible:ring-primary/40 focus-visible:ring-offset-0"
          />
          {filters.query && (
            <button
              onClick={() => setFilter("query", "")}
              className="absolute right-2 top-1/2 flex h-4 w-4 -translate-y-1/2 items-center justify-center rounded-sm text-dmsidebar-muted hover:bg-dmsidebar-border hover:text-dmsidebar-foreground"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>

        {/* Type icon grid */}
        <TooltipProvider delayDuration={150}>
          <motion.div
            layout
            transition={{ layout: { duration: 0.4, ease: [0.22, 1, 0.36, 1] } }}
            className="overflow-hidden rounded-md bg-dmsidebar-2 p-1"
          >
            <button
              onClick={() => setTypesOpen((o) => !o)}
              aria-expanded={typesOpen}
              className={cn(
                "flex h-6 w-full items-center gap-1.5 rounded px-1.5 text-[11px] font-medium transition-colors",
                "text-dmsidebar-muted hover:bg-dmsidebar-border hover:text-dmsidebar-foreground",
                filters.kinds.size > 0 && "text-primary",
              )}
            >
              <LayoutGrid className="h-3.5 w-3.5" />
              <span>Filter by type</span>
              {filters.kinds.size > 0 && (
                <span className="rounded-full bg-primary px-1.5 py-px text-[9px] font-bold text-primary-foreground">
                  {filters.kinds.size}
                </span>
              )}
              <motion.span
                animate={{ rotate: typesOpen ? 180 : 0 }}
                transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                className="ml-auto"
              >
                <ChevronDown className="h-3.5 w-3.5" />
              </motion.span>
            </button>
            <AnimatePresence initial={false}>
              {typesOpen && (
                <motion.div
                  key="grid"
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
                  className="overflow-hidden"
                >
                  <div className="mt-1 grid grid-cols-7 gap-0.5">
                    {visibleKinds.map((k, i) => {
                      const on = filters.kinds.has(k.id);
                      const Icon = k.Icon;
                      return (
                        <Tooltip key={k.id}>
                          <TooltipTrigger asChild>
                            <motion.button
                              initial={{ opacity: 0, scale: 0.3, filter: "blur(4px)" }}
                              animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
                              exit={{ opacity: 0, scale: 0.3, filter: "blur(4px)" }}
                              transition={{
                                duration: 0.3,
                                delay: 0.015 * i,
                                ease: [0.22, 1, 0.36, 1],
                              }}
                              onClick={() => toggleKind(k.id)}
                              aria-label={k.label}
                              aria-pressed={on}
                              className={cn(
                                "flex h-6 w-full items-center justify-center rounded transition-colors",
                                on
                                  ? "bg-primary text-primary-foreground shadow-sm"
                                  : "text-dmsidebar-muted hover:bg-dmsidebar-border hover:text-dmsidebar-foreground",
                              )}
                            >
                              <Icon className="h-3.5 w-3.5" />
                            </motion.button>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="text-[11px]">{k.label}</TooltipContent>
                        </Tooltip>
                      );
                    })}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </TooltipProvider>

        {filterCount > 0 && (
          <button
            onClick={clearFilters}
            className="self-end rounded px-1.5 py-0.5 text-[10px] text-dmsidebar-muted hover:text-dmsidebar-foreground"
          >
            Clear filters
          </button>
        )}
      </div>

      <div className="flex-1 overflow-auto scrollbar-thin py-1">
        {renderNode(root)}
      </div>

      {/* Pinned footer — compact icon bar (ClickUp-style) */}
      <div className="flex shrink-0 items-center gap-1 border-t border-dmsidebar-border bg-sidebar-gradient px-2 py-1.5">
        <TooltipProvider delayDuration={150}>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={expandAll}
                aria-label="Expand all groups"
                className="flex h-7 w-7 items-center justify-center rounded-md text-dmsidebar-muted hover:bg-dmsidebar-2 hover:text-dmsidebar-foreground transition-colors"
              >
                <ChevronsUpDown className="h-3.5 w-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="top" className="text-[11px]">Expand all</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={collapseAll}
                aria-label="Collapse all groups"
                className="flex h-7 w-7 items-center justify-center rounded-md text-dmsidebar-muted hover:bg-dmsidebar-2 hover:text-dmsidebar-foreground transition-colors"
              >
                <ChevronsDownUp className="h-3.5 w-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="top" className="text-[11px]">Collapse all</TooltipContent>
          </Tooltip>

          <div className="mx-1 h-4 w-px bg-dmsidebar-border" />

          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => setCollapseOnStartup(!collapseOnStartup)}
                aria-pressed={collapseOnStartup}
                aria-label="Collapse all on startup"
                className={cn(
                  "flex h-7 items-center gap-1.5 rounded-md px-2 text-[11px] font-medium transition-colors",
                  collapseOnStartup
                    ? "bg-primary/15 text-primary"
                    : "text-dmsidebar-muted hover:bg-dmsidebar-2 hover:text-dmsidebar-foreground",
                )}
              >
                <span
                  className={cn(
                    "inline-flex h-3 w-5 items-center rounded-full p-0.5 transition-colors",
                    collapseOnStartup ? "bg-primary" : "bg-dmsidebar-border",
                  )}
                >
                  <span
                    className={cn(
                      "h-2 w-2 rounded-full bg-background transition-transform",
                      collapseOnStartup ? "translate-x-2" : "translate-x-0",
                    )}
                  />
                </span>
                Collapse on startup
              </button>
            </TooltipTrigger>
            <TooltipContent side="top" className="text-[11px]">
              Start with all groups collapsed
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
      </div>
      )}
    </aside>
  );
}

function IconToggle({ on, onClick, icon, title }: { on: boolean; onClick: () => void; icon: React.ReactNode; title: string }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={cn(
        "flex h-7 w-7 items-center justify-center rounded-md transition-colors",
        on
          ? "bg-primary text-primary-foreground shadow-sm"
          : "text-dmsidebar-muted hover:bg-dmsidebar-2 hover:text-dmsidebar-foreground",
      )}
    >
      {icon}
    </button>
  );
}