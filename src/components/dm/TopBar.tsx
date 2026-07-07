import { Moon, Sun, Upload, Download, FileSpreadsheet, FileJson, FileText, Layers, Copy, LayoutGrid, Eye, Network, Send, Share2, Workflow, Type, Hash, Braces, ClipboardCheck, Plus, X as XIcon, GitBranch, Repeat2, Asterisk, ListTree, CheckCircle2, Sparkles, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useFormStore } from "@/store/useFormStore";
import type { CopyField } from "@/store/useFormStore";
import { mappingToCSV, mappingToJSON } from "@/lib/dm/gocanvas";
import { buildV3Payload } from "@/lib/dm/gocanvasV3";
import { reviewToXlsxBlob, reviewToCsv, reviewToJson, reviewToPdfBlob } from "@/lib/dm/review";
import { fullToXlsxBlob, fullToCsv } from "@/lib/dm/fullExport";
import { useReviewFields, listRevisions, addRevision, deleteRevision, readRevisionRaw, restoreRevision, getRevisionStats } from "@/hooks/useReviewFields";
import { useDoneFields } from "@/hooks/useDoneFields";
import { useEffect, useMemo, useState } from "react";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { AdminSettings } from "./AdminSettings";
import { PushToGoCanvasButton } from "./PushToGoCanvasButton";
import { UserMenu } from "./UserMenu";
import { ShareDialog } from "./ShareDialog";
import { FileStatusChip } from "./FileStatusChip";
import { RenameFileDialog } from "./RenameFileDialog";

function download(filename: string, content: string | Blob, type?: string) {
  const blob = typeof content === "string" ? new Blob([content], { type }) : content;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

export function TopBar() {
  return (
    <TopBarShell row="top" />
  );
}

export function TopBarActions() {
  return (
    <TopBarShell row="actions" />
  );
}

function TopBarShell({ row }: { row: "top" | "actions" }) {
  const { schema, fileName, theme, setTheme, view, setView, reset, autoCopy, setAutoCopy, copyField, setCopyField, reviewMode, setReviewMode, reviewRevision, setReviewRevision } = useFormStore();
  const displayName = useFormStore((s) => s.displayName);
  const renameDisplay = useFormStore((s) => s.renameDisplay);
  const [renameOpen, setRenameOpen] = useState(false);
  const allowedViews = useFormStore((s) => s.allowedViews);
  const { map: reviewMap, flaggedCount, revision } = useReviewFields();
  const { done } = useDoneFields();

  const schemaTitle = useMemo(() => {
    if (!schema) return null;
    const root = schema.nodes[schema.rootId];
    const t = (root?.raw as { title?: string } | undefined)?.title?.trim();
    return t || null;
  }, [schema]);
  // Form title always reflects the underlying Device Magic schema — never renamed.
  const formTitle = schemaTitle;
  // The user-facing filename label can be overridden by displayName.
  const fileLabel = displayName ?? fileName;

  useEffect(() => {
    const base = "Device Canvas HUB";
    const tabTitle = displayName ?? formTitle;
    document.title = tabTitle ? `${tabTitle} · ${base}` : base;
    return () => { document.title = base; };
  }, [formTitle, displayName]);

  if (!schema) return null;

  const doneCount = Object.keys(done).length;
  // Count only real leaf fields (exclude root, groups, loop containers) so the
  // percentage matches the "Unchecked fields" modal.
  const totalLeafFields =
    schema.stats.total - (schema.stats.groups || 0) - (schema.stats.loops || 0);
  const donePctRaw = totalLeafFields > 0 ? (doneCount / totalLeafFields) * 100 : 0;
  const donePct = Number.isInteger(donePctRaw)
    ? `${donePctRaw}`
    : donePctRaw.toFixed(2);

  const onExport = (kind: "csv" | "json" | "gocanvas") => {
    const base = (fileName || "form").replace(/\.json$/i, "");
    if (kind === "csv") {
      download(`${base}.csv`, mappingToCSV(schema), "text/csv");
    } else if (kind === "json") {
      download(`${base}.cleaned.json`, mappingToJSON(schema), "application/json");
    } else {
      const { payload, caveats } = buildV3Payload(schema, base, "");
      download(`${base}.gocanvas.json`, JSON.stringify(payload, null, 2), "application/json");
      if (caveats.length) {
        toast.success(`Exported GoCanvas v3 JSON`, { description: `${caveats.length} approximation(s) — see push dialog for details.` });
        return;
      }
    }
    toast.success(`Exported ${kind.toUpperCase()}`);
  };

  const onExportReview = (kind: "xlsx" | "csv" | "json" | "pdf") => {
    if (!schema) return;
    if (flaggedCount === 0) {
      toast.error("No fields flagged for review");
      return;
    }
    const base = (fileName || "form").replace(/\.json$/i, "") + ".review";
    const suffix = revision > 1 ? `.r${revision}` : "";
    if (kind === "xlsx") {
      download(`${base}${suffix}.xlsx`, reviewToXlsxBlob(schema, reviewMap));
    } else if (kind === "csv") {
      download(`${base}${suffix}.csv`, reviewToCsv(schema, reviewMap), "text/csv");
    } else if (kind === "json") {
      download(`${base}${suffix}.json`, reviewToJson(schema, reviewMap, fileName), "application/json");
    } else {
      download(`${base}${suffix}.pdf`, reviewToPdfBlob(schema, reviewMap, fileName, revision));
    }
    toast.success(`Exported review R${revision} (${flaggedCount} item${flaggedCount === 1 ? "" : "s"})`);
  };

  const onExportFull = (kind: "xlsx" | "csv") => {
    if (!schema) return;
    const base = (fileName || "form").replace(/\.json$/i, "") + ".report";
    if (kind === "xlsx") {
      download(`${base}.xlsx`, fullToXlsxBlob(schema, done, reviewMap));
    } else {
      download(`${base}.csv`, fullToCsv(schema, done, reviewMap), "text/csv");
    }
    toast.success(`Exported full report (${kind.toUpperCase()})`);
  };

  if (row === "actions") {
    return (
      <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-border bg-surface px-3 py-1.5">
        <div className="flex flex-wrap items-center gap-1.5">
          <DonePctChip
            pct={donePct}
            pctNum={donePctRaw}
            done={doneCount}
            total={totalLeafFields}
            onOpen={() => {
              if (view !== "magic") setView("magic");
              // Defer so MagicView mounts and its listener is attached.
              setTimeout(() => {
                window.dispatchEvent(new CustomEvent("dm:open-unchecked"));
              }, view !== "magic" ? 60 : 0);
            }}
          />
          <Stat label="fields" value={schema.stats.total} icon={<ListTree className="h-3 w-3" />} />
          <Stat label="loops" value={schema.stats.loops} accent icon={<Repeat2 className="h-3 w-3" />} />
          <Stat label="conditional" value={schema.stats.withVisibility} icon={<Eye className="h-3 w-3" />} tone="info" />
          <Stat label="required" value={schema.stats.withRequired} icon={<Asterisk className="h-3 w-3" />} tone="destructive" />
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          {reviewMode && fileName && (
            <RevisionPills
              fileName={fileName}
              active={reviewRevision}
              onChange={setReviewRevision}
            />
          )}
          <TooltipProvider delayDuration={200}>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => setReviewMode(!reviewMode)}
                  className={cn(
                    "flex h-7 shrink-0 items-center gap-1 whitespace-nowrap rounded-md border px-2 text-[11px] font-medium transition-colors",
                    reviewMode
                      ? "border-destructive/40 bg-destructive/10 text-destructive"
                      : "border-border bg-surface-2 text-muted-foreground hover:text-foreground",
                  )}
                >
                  <ClipboardCheck className="h-3 w-3" />
                  Review
                  {reviewMode && flaggedCount > 0 && (
                    <span className="ml-1 rounded-full bg-destructive px-1.5 py-px text-[9px] font-semibold text-destructive-foreground">
                      {flaggedCount}
                    </span>
                  )}
                  <span
                    className={cn(
                      "ml-1 inline-flex h-3 w-5 items-center rounded-full p-0.5 transition-colors",
                      reviewMode ? "bg-destructive" : "bg-border",
                    )}
                  >
                    <span
                      className={cn(
                        "h-2 w-2 rounded-full bg-background transition-transform",
                        reviewMode ? "translate-x-2" : "translate-x-0",
                      )}
                    />
                  </span>
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">
                Review mode — flag fields that need edits, with comments & suggested values.
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          {fileName && <FileStatusChip fileName={fileName} />}
        </div>
      </div>
    );
  }

  return (
    <header className="flex shrink-0 flex-col gap-1.5 border-b border-border bg-surface px-3 py-1.5">
      {/* Row 1: Brand + stats + view/review/file/theme/admin/user */}
      <div className="flex min-h-8 flex-wrap items-center gap-x-3 gap-y-1.5">
        <div className="flex shrink-0 items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Layers className="h-4 w-4" />
          </div>
          <div className="min-w-0 leading-tight">
            <div
              className="text-[13px] font-semibold text-foreground truncate max-w-[200px] sm:max-w-[320px]"
              title={formTitle ?? "Device Canvas HUB"}
            >
              {formTitle ?? "Device Canvas HUB"}
            </div>
            {fileName ? (
              <button
                type="button"
                onClick={() => setRenameOpen(true)}
                className="group flex max-w-[200px] items-center gap-1 truncate text-left text-[10px] font-mono-tight text-muted-foreground hover:text-foreground sm:max-w-[320px]"
                title={`Rename "${fileLabel ?? fileName}"`}
              >
                <span className="truncate">{fileLabel}</span>
                <Pencil className="h-2.5 w-2.5 shrink-0 opacity-0 transition-opacity group-hover:opacity-100" />
              </button>
            ) : null}
          </div>
        </div>

        <div className="ml-auto flex flex-wrap items-center justify-end gap-1.5">
          <ViewSwitcher view={view} setView={setView} allowed={allowedViews} />
      {fileName && (
        <RenameFileDialog
          open={renameOpen}
          onOpenChange={setRenameOpen}
          fileName={fileName}
          schemaTitle={schemaTitle}
          currentDisplayName={displayName}
          onSave={renameDisplay}
        />
      )}

          <TooltipProvider delayDuration={200}>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => setAutoCopy(!autoCopy)}
                  className={cn(
                    "flex h-7 shrink-0 items-center gap-1 whitespace-nowrap rounded-md border px-2 text-[11px] font-medium transition-colors",
                    autoCopy
                      ? "border-primary/40 bg-primary/10 text-primary"
                      : "border-border bg-surface-2 text-muted-foreground hover:text-foreground",
                  )}
                >
                  <Copy className="h-3 w-3" />
                  Auto-copy
                  <span className={cn("ml-1 inline-flex h-3 w-5 items-center rounded-full p-0.5 transition-colors", autoCopy ? "bg-primary" : "bg-border")}>
                    <span className={cn("h-2 w-2 rounded-full bg-background transition-transform", autoCopy ? "translate-x-2" : "translate-x-0")} />
                  </span>
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">When on, selecting a field copies the chosen value to your clipboard.</TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <div className={cn("flex h-7 items-center rounded-md border p-0.5 transition-opacity", autoCopy ? "border-border bg-surface-2 opacity-100" : "border-border bg-surface-2 opacity-50")}>
            {(["title", "identifier", "path"] as CopyField[]).map((c) => {
              const meta = c === "title" ? { label: "Field", Icon: Type } : c === "identifier" ? { label: "Identifier", Icon: Hash } : { label: "Place Holder", Icon: Braces };
              const { Icon, label } = meta;
              return (
                <TooltipProvider key={c} delayDuration={150}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        onClick={() => setCopyField(c)}
                        disabled={!autoCopy}
                        aria-label={label}
                        className={cn("flex h-6 w-7 items-center justify-center rounded transition-colors", copyField === c ? "bg-surface text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}
                      >
                        <Icon className="h-3.5 w-3.5" strokeWidth={2} />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="text-xs">{label}</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              );
            })}
          </div>
          <div className="mx-1 h-5 w-px bg-border" />
          <ShareDialog />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline" className="h-7 text-xs">
                <Download className="mr-1 h-3.5 w-3.5" /> Export
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onExport("csv")}><FileSpreadsheet className="mr-2 h-4 w-4" /> CSV (flat)</DropdownMenuItem>
              <DropdownMenuItem onClick={() => onExport("json")}><FileJson className="mr-2 h-4 w-4" /> Cleaned JSON</DropdownMenuItem>
              <DropdownMenuItem onClick={() => onExport("gocanvas")}><Layers className="mr-2 h-4 w-4" /> GoCanvas mapping</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Full field report</DropdownMenuLabel>
              <DropdownMenuItem onClick={() => onExportFull("xlsx")}><FileSpreadsheet className="mr-2 h-4 w-4" /> Excel (.xlsx)</DropdownMenuItem>
              <DropdownMenuItem onClick={() => onExportFull("csv")}><FileSpreadsheet className="mr-2 h-4 w-4" /> CSV</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Review punch-list {flaggedCount > 0 && `(${flaggedCount})`}</DropdownMenuLabel>
              <DropdownMenuItem onClick={() => onExportReview("xlsx")}><FileSpreadsheet className="mr-2 h-4 w-4" /> Excel (.xlsx)</DropdownMenuItem>
              <DropdownMenuItem onClick={() => onExportReview("csv")}><FileSpreadsheet className="mr-2 h-4 w-4" /> CSV</DropdownMenuItem>
              <DropdownMenuItem onClick={() => onExportReview("pdf")}><FileText className="mr-2 h-4 w-4" /> PDF Punch-list</DropdownMenuItem>
              <DropdownMenuItem onClick={() => onExportReview("json")}><FileJson className="mr-2 h-4 w-4" /> JSON</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <PushToGoCanvasButton />
          <TooltipProvider delayDuration={200}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={reset} aria-label="New file">
                  <Upload className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">New file</TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>
            {theme === "dark" ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
          </Button>
          <AdminSettings />
          <div className="mx-1 h-5 w-px bg-border" />
          <UserMenu />
        </div>
      </div>
    </header>
  );
}

const VIEW_OPTIONS = [
  { id: "grid", label: "Grid", desc: "Searchable table of every field", Icon: LayoutGrid },
  { id: "magic", label: "Magic", desc: "Clean 3-column table — fields, properties, details", Icon: Sparkles },
  { id: "preview", label: "Preview", desc: "Render the form as users will see it", Icon: Eye },
  { id: "structure", label: "Structure", desc: "Visual hierarchy of groups & fields", Icon: Layers },
  { id: "gocanvas", label: "GoCanvas", desc: "Export & push mapping to GoCanvas", Icon: Send },
  { id: "graph", label: "Graph", desc: "Dependency graph between fields", Icon: Network },
  { id: "flow", label: "Flow Map", desc: "Interactive diagram — drag groups, links stay connected", Icon: Workflow },
] as const;

function ViewSwitcher({ view, setView, allowed }: { view: string; setView: (v: any) => void; allowed: string[] }) {
  const [open, setOpen] = useState(false);
  const visible = VIEW_OPTIONS.filter((v) => allowed.includes(v.id));
  const options = visible.length > 0 ? visible : VIEW_OPTIONS;
  const current = options.find((v) => v.id === view) ?? options[0];
  const CurrentIcon = current.Icon;
  return (
    <TooltipProvider delayDuration={200}>
      <div
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocusCapture={() => setOpen(true)}
        onBlurCapture={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) setOpen(false);
        }}
        className="relative h-7 shrink-0"
      >
        {/* Trigger pill — fixed position; subtle hover affordance */}
        <button
          type="button"
          aria-label={`${current.label} view — hover to switch`}
          aria-expanded={open}
          className={cn(
            "relative z-20 flex h-7 items-center gap-1.5 rounded-md border bg-surface-2 px-2 text-[11px] font-medium text-foreground transition-all duration-200 ease-out",
            open
              ? "border-primary/40 bg-surface shadow-sm"
              : "border-border hover:border-primary/30 hover:bg-surface hover:shadow-sm",
          )}
        >
          <CurrentIcon className="h-3.5 w-3.5" />
          <span className="whitespace-nowrap">{current.label}</span>
          <span className="text-muted-foreground">view</span>
          <span
            aria-hidden
            className={cn(
              "ml-0.5 h-1 w-1 rounded-full transition-colors duration-200",
              open ? "bg-primary" : "bg-muted-foreground/40",
            )}
          />
        </button>
        {/* Expanded panel — expands LEFTWARD from the trigger, same row, no layout shift */}
        <div
          className={cn(
            "absolute right-full top-0 z-10 flex h-7 origin-right items-center whitespace-nowrap rounded-md border border-border bg-surface-2 p-0.5 pr-1.5 shadow-md transition-all duration-300 ease-out",
            open
              ? "translate-x-0 scale-x-100 opacity-100"
              : "pointer-events-none translate-x-2 scale-x-95 opacity-0",
          )}
          aria-hidden={!open}
        >
          {options.map(({ id, label, desc, Icon }) => {
            const active = view === id;
            return (
              <Tooltip key={id}>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => {
                      setView(id);
                      setOpen(false);
                    }}
                    aria-label={label}
                    aria-pressed={active}
                    tabIndex={open ? 0 : -1}
                    className={cn(
                      "flex h-6 w-7 shrink-0 items-center justify-center rounded transition-colors",
                      active ? "bg-surface text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <Icon className="h-3.5 w-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs">
                  <div className="font-medium">{label}</div>
                  <div className="text-muted-foreground">{desc}</div>
                </TooltipContent>
              </Tooltip>
            );
          })}
        </div>
      </div>
    </TooltipProvider>
  );
}

function DonePctChip({ pct, pctNum, done, total, onOpen }: { pct: string; pctNum: number; done: number; total: number; onOpen: () => void }) {
  const fill = Math.max(0, Math.min(100, pctNum));
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={onOpen}
            disabled={total === 0}
            aria-label="Show unchecked fields"
            className="relative flex items-center gap-1.5 overflow-hidden rounded-md border border-success/30 bg-success/5 px-2 py-1 transition-colors hover:bg-success/10 hover:border-success/50 disabled:pointer-events-none disabled:opacity-60"
          >
            <div
              aria-hidden
              className="absolute inset-y-0 left-0 bg-success/20 transition-[width]"
              style={{ width: `${fill}%` }}
            />
            <CheckCircle2 className="relative h-3 w-3 text-success" />
            <span className="relative text-[11px] font-semibold font-mono-tight text-success">{pct}%</span>
            <span className="relative text-[10px] text-success/80">done</span>
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs">
          {done} of {total} fields marked done — click to view unchecked
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function Stat({
  label,
  value,
  accent,
  icon,
  tone,
}: {
  label: string;
  value: number;
  accent?: boolean;
  icon?: React.ReactNode;
  tone?: "info" | "destructive";
}) {
  const iconColor = accent
    ? "text-type-loop"
    : tone === "info"
      ? "text-info"
      : tone === "destructive"
        ? "text-destructive"
        : "text-muted-foreground";
  return (
    <div className="flex items-center gap-1.5 rounded-md bg-surface-2 px-2 py-1">
      {icon && <span className={iconColor}>{icon}</span>}
      <span className={`text-[11px] font-semibold font-mono-tight ${accent ? "text-type-loop" : "text-foreground"}`}>{value}</span>
      <span className="text-[10px] text-muted-foreground">{label}</span>
    </div>
  );
}

function RevisionPills({
  fileName,
  active,
  onChange,
}: {
  fileName: string;
  active: number;
  onChange: (n: number) => void;
}) {
  const [revs, setRevs] = useState<number[]>(() => listRevisions(fileName));

  // Re-sync whenever the file or active revision changes (e.g. after add/delete).
  useEffect(() => {
    setRevs(listRevisions(fileName));
  }, [fileName, active]);

  const [confirmRev, setConfirmRev] = useState<number | null>(null);
  const confirmStats = confirmRev != null ? getRevisionStats(fileName, confirmRev) : null;

  const handleAdd = () => {
    const n = addRevision(fileName);
    setRevs(listRevisions(fileName));
    onChange(n);
    toast.success(`Created revision R${n}`, {
      description: "Edits saved separately from earlier rounds.",
      action: {
        label: "Undo",
        onClick: () => {
          deleteRevision(fileName, n);
          setRevs(listRevisions(fileName));
          if (active === n) onChange(1);
          else onChange(active);
          toast.message(`Removed revision R${n}`);
        },
      },
    });
  };

  const handleDelete = (n: number) => {
    if (n <= 1) return;
    setConfirmRev(n);
  };

  const performDelete = (n: number) => {
    // Snapshot for undo before removing.
    const snapshot = readRevisionRaw(fileName, n);
    const wasActive = active === n;
    deleteRevision(fileName, n);
    setRevs(listRevisions(fileName));
    if (wasActive) onChange(1);
    toast.success(`Deleted revision R${n}`, {
      description: "All flags, comments and suggested values for this round were removed.",
      action: {
        label: "Undo",
        onClick: () => {
          restoreRevision(fileName, n, snapshot);
          setRevs(listRevisions(fileName));
          onChange(n);
          toast.message(`Restored revision R${n}`);
        },
      },
      duration: 8000,
    });
  };

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex h-7 shrink-0 items-center gap-0.5 rounded-md border border-border bg-surface-2 px-1 animate-fade-in">
        <GitBranch className="mr-0.5 h-3 w-3 text-muted-foreground" />
        {revs.map((n) => {
          const isActive = n === active;
          return (
            <Tooltip key={n}>
              <TooltipTrigger asChild>
                <button
                  onClick={() => onChange(n)}
                  onAuxClick={(e) => { e.preventDefault(); handleDelete(n); }}
                  className={cn(
                    "group relative flex h-5 items-center gap-0.5 rounded px-1.5 text-[10px] font-semibold transition-colors",
                    isActive
                      ? "bg-primary/15 text-primary"
                      : "text-muted-foreground hover:bg-surface hover:text-foreground",
                  )}
                >
                  R{n}
                  {n > 1 && (
                    <span
                      role="button"
                      tabIndex={-1}
                      onClick={(e) => { e.stopPropagation(); handleDelete(n); }}
                      className="ml-0.5 hidden h-3 w-3 items-center justify-center rounded-sm text-muted-foreground hover:bg-destructive/15 hover:text-destructive group-hover:inline-flex"
                      aria-label={`Delete R${n}`}
                    >
                      <XIcon className="h-2.5 w-2.5" />
                    </span>
                  )}
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">
                {n === 1 ? "Initial review round" : `Revision round ${n}`}
                {n > 1 && <div className="mt-0.5 text-[10px] text-muted-foreground">Hover and click × to delete</div>}
              </TooltipContent>
            </Tooltip>
          );
        })}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={handleAdd}
              className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-surface hover:text-foreground"
              aria-label="Add revision"
            >
              <Plus className="h-3 w-3" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">
            New revision round — separate edits saved alongside earlier rounds.
          </TooltipContent>
        </Tooltip>
      </div>
      <AlertDialog open={confirmRev != null} onOpenChange={(o) => { if (!o) setConfirmRev(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete revision R{confirmRev}?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>
                  You're about to permanently delete <span className="font-semibold text-foreground">revision R{confirmRev}</span> for{" "}
                  <span className="font-mono text-foreground">{fileName}</span>.
                </p>
                {confirmStats && (confirmStats.flagged || confirmStats.comments || confirmStats.suggested || confirmStats.projectNote) ? (
                  <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-xs">
                    <div className="mb-1.5 font-semibold text-destructive">The following will be lost:</div>
                    <ul className="ml-4 list-disc space-y-0.5 text-foreground">
                      {confirmStats.flagged > 0 && <li>{confirmStats.flagged} field{confirmStats.flagged === 1 ? "" : "s"} flagged for edit</li>}
                      {confirmStats.comments > 0 && <li>{confirmStats.comments} comment{confirmStats.comments === 1 ? "" : "s"}</li>}
                      {confirmStats.suggested > 0 && <li>{confirmStats.suggested} suggested value{confirmStats.suggested === 1 ? "" : "s"}</li>}
                      {confirmStats.projectNote && <li>Project-level note</li>}
                    </ul>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">This revision has no saved data.</p>
                )}
                <p className="text-xs text-muted-foreground">
                  You can undo this from the toast that appears right after deletion.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => { if (confirmRev != null) { performDelete(confirmRev); setConfirmRev(null); } }}
            >
              Delete R{confirmRev}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </TooltipProvider>
  );
}