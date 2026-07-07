import { useEffect, useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Pencil, RotateCcw } from "lucide-react";
import { toast } from "sonner";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** The immutable file name (e.g. "Xradar Summary Report (3).json"). Shown for context. */
  fileName: string;
  /** The schema's built-in title — used as the fallback / "reset to" target. */
  schemaTitle: string | null;
  /** Current display name (overrides schemaTitle), or null when no override is set. */
  currentDisplayName: string | null;
  /** Persist the new name. Pass null to reset to the schema title. */
  onSave: (newName: string | null) => Promise<void>;
};

/**
 * Two-step rename flow inside a single dialog:
 *   1. Edit the new name in an input.
 *   2. Click "Rename" → confirmation panel appears with from → to and the
 *      immutable filename for context. Confirm to commit.
 */
export function RenameFileDialog({
  open, onOpenChange, fileName, schemaTitle, currentDisplayName, onSave,
}: Props) {
  const original = currentDisplayName ?? fileName;
  const [value, setValue] = useState(original);
  const [stage, setStage] = useState<"edit" | "confirm">("edit");
  const [resetMode, setResetMode] = useState(false);
  const [busy, setBusy] = useState(false);

  // Reset internal state whenever the dialog (re-)opens.
  useEffect(() => {
    if (open) {
      setValue(original);
      setStage("edit");
      setResetMode(false);
      setBusy(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const trimmed = value.trim();
  const willBe = resetMode ? fileName : trimmed;
  const noChange = !resetMode && trimmed === original;

  function proceed() {
    if (resetMode) { setStage("confirm"); return; }
    if (!trimmed) { toast.error("Name can't be empty"); return; }
    if (noChange) { onOpenChange(false); return; }
    setStage("confirm");
  }

  async function confirm() {
    setBusy(true);
    try {
      await onSave(resetMode ? null : trimmed);
      toast.success(resetMode ? "Reset to original name" : "Renamed");
      onOpenChange(false);
    } catch (e) {
      toast.error((e as Error).message || "Rename failed");
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!busy) onOpenChange(v); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Pencil className="h-4 w-4" />
            {stage === "edit" ? "Rename file" : "Confirm rename"}
          </DialogTitle>
          <DialogDescription>
            {stage === "edit"
              ? "Give this file a friendlier label. The form name and the underlying .json file stay exactly the same — only the label shown in the app changes."
              : "Review the change before saving."}
          </DialogDescription>
        </DialogHeader>

        {stage === "edit" ? (
          <div className="space-y-3 py-1">
            <div className="space-y-1.5">
              <Label htmlFor="rename-input" className="text-xs">Friendly file label</Label>
              <Input
                id="rename-input"
                value={value}
                onChange={(e) => { setValue(e.target.value); if (resetMode) setResetMode(false); }}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); proceed(); } }}
                autoFocus
                disabled={resetMode}
                placeholder={fileName}
              />
            </div>
            <div className="rounded-md border border-border bg-surface-2 px-2 py-1.5 text-[11px] text-muted-foreground">
              Original file: <span className="font-mono text-foreground">{fileName}</span>
              {schemaTitle && (
                <div className="mt-1">Form name (unchanged): <span className="text-foreground">{schemaTitle}</span></div>
              )}
            </div>
            {currentDisplayName && (
              <button
                type="button"
                onClick={() => { setResetMode(true); setValue(fileName); }}
                className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
              >
                <RotateCcw className="h-3 w-3" />
                Reset to original filename
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-2 py-1 text-sm">
            <div className="grid grid-cols-[64px_1fr] gap-x-3 gap-y-1.5">
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground pt-0.5">From</div>
              <div className="truncate font-medium text-foreground">{original}</div>
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground pt-0.5">To</div>
              <div className="truncate font-semibold text-primary">{willBe}</div>
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground pt-0.5">File</div>
              <div className="truncate font-mono text-[11px] text-muted-foreground">{fileName}</div>
            </div>
            <p className="rounded-md border border-border bg-surface-2 px-2 py-1.5 text-[11px] text-muted-foreground">
              Done-checks, review revisions, shares and GoCanvas pushes will keep using the file name above — only the friendly label changes.
            </p>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-2">
          {stage === "edit" ? (
            <>
              <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
              <Button onClick={proceed} disabled={busy || (!resetMode && !trimmed)}>
                {resetMode ? "Reset" : "Rename"}
              </Button>
            </>
          ) : (
            <>
              <Button variant="ghost" onClick={() => setStage("edit")} disabled={busy}>Back</Button>
              <Button onClick={confirm} disabled={busy}>
                {busy ? "Saving…" : "Confirm"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}