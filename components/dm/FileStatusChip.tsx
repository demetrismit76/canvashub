import { useState } from "react";
import { Circle, CheckCircle2, RotateCcw, Archive, ChevronDown } from "lucide-react";
import { useFileStatus } from "@/hooks/useFileStatus";
import { useAuth } from "@/hooks/useAuth";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { FileStatus } from "@/lib/dm/admin";

const META: Record<FileStatus, { label: string; Icon: React.ComponentType<{ className?: string }>; cls: string }> = {
  open: { label: "Open", Icon: Circle, cls: "border-primary/40 bg-primary/10 text-primary" },
  closed: { label: "Closed", Icon: CheckCircle2, cls: "border-border bg-surface-2 text-muted-foreground" },
  reopened: { label: "Reopened", Icon: RotateCcw, cls: "border-yellow-500/40 bg-yellow-500/10 text-yellow-700 dark:text-yellow-400" },
  archived: { label: "Archived", Icon: Archive, cls: "border-border bg-surface-2 text-muted-foreground line-through" },
};

export function FileStatusChip({ fileName }: { fileName: string }) {
  const { user } = useAuth();
  const { status, update } = useFileStatus(fileName);
  const [busy, setBusy] = useState(false);

  if (!user) return null;
  const m = META[status];

  const change = async (next: FileStatus) => {
    if (next === status) return;
    setBusy(true);
    try {
      await update(next);
      toast.success(`Marked ${META[next].label}`);
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button disabled={busy} className={cn(
          "flex h-7 items-center gap-1 rounded-md border px-2 text-[11px] font-semibold transition-colors disabled:opacity-50",
          m.cls,
        )} title="File status">
          <m.Icon className="h-3 w-3" />{m.label}<ChevronDown className="h-3 w-3 opacity-60" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">Change status</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {(Object.keys(META) as FileStatus[]).map((s) => {
          const x = META[s];
          return (
            <DropdownMenuItem key={s} onClick={() => change(s)}>
              <x.Icon className="mr-2 h-3.5 w-3.5" />{x.label}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}