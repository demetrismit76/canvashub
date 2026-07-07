import { useEffect, useState } from "react";
import { CloudUpload, CheckCircle2, X, ChevronDown, ChevronUp, FileJson } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { recoverAllLocalDone, recoverAllLocalReview, type RecoveryResult, type ReviewRecoveryResult } from "@/lib/dm/integrity";

type Phase = "idle" | "syncing" | "done";

/**
 * Discrete floating panel in the bottom-left. On first sign-in per browser
 * it runs the one-shot local→cloud recovery and shows progress + a
 * detailed list of what was uploaded. Auto-dismisses if nothing changed;
 * sticks around for review when changes were made.
 */
export function SyncStatus() {
  const { user, loading } = useAuth();
  const [phase, setPhase] = useState<Phase>("idle");
  const [doneRes, setDoneRes] = useState<RecoveryResult | null>(null);
  const [reviewRes, setReviewRes] = useState<ReviewRecoveryResult | null>(null);
  const [open, setOpen] = useState(true);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    if (loading || !user || phase !== "idle") return;
    setPhase("syncing");
    setOpen(true);
    (async () => {
      try {
        const [d, r] = await Promise.all([recoverAllLocalDone(), recoverAllLocalReview()]);
        setDoneRes(d);
        setReviewRes(r);
      } catch { /* silent */ }
      finally { setPhase("done"); }
    })();
  }, [user, loading, phase]);

  // Auto-dismiss when there was nothing to recover (avoid noisy popups).
  useEffect(() => {
    if (phase !== "done") return;
    const nothing =
      (!doneRes || doneRes.checksRecovered === 0) &&
      (!reviewRes || reviewRes.entriesRecovered === 0);
    if (nothing) {
      const t = window.setTimeout(() => setOpen(false), 1200);
      return () => window.clearTimeout(t);
    }
  }, [phase, doneRes, reviewRes]);

  if (!user || phase === "idle" || !open) return null;

  const totalChecks = doneRes?.checksRecovered ?? 0;
  const totalEntries = reviewRes?.entriesRecovered ?? 0;
  const nothing = phase === "done" && totalChecks === 0 && totalEntries === 0;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-3 left-3 z-50 w-[20rem] max-w-[calc(100vw-1.5rem)] rounded-lg border border-border bg-popover shadow-lg"
    >
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        {phase === "syncing" ? (
          <CloudUpload className="h-3.5 w-3.5 animate-pulse text-primary" />
        ) : (
          <CheckCircle2 className={`h-3.5 w-3.5 ${nothing ? "text-muted-foreground" : "text-emerald-600"}`} />
        )}
        <div className="flex-1 text-xs font-medium">
          {phase === "syncing" ? "Syncing local changes…" : nothing ? "Nothing to sync — you're up to date." : "Local changes synced"}
        </div>
        {phase === "done" && !nothing && (
          <button
            type="button"
            onClick={() => setCollapsed((v) => !v)}
            className="rounded p-0.5 text-muted-foreground hover:bg-surface-2 hover:text-foreground"
            title={collapsed ? "Expand" : "Collapse"}
          >
            {collapsed ? <ChevronDown className="h-3 w-3" /> : <ChevronUp className="h-3 w-3" />}
          </button>
        )}
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded p-0.5 text-muted-foreground hover:bg-surface-2 hover:text-foreground"
          title="Dismiss"
        >
          <X className="h-3 w-3" />
        </button>
      </div>

      {!collapsed && (
        <div className="max-h-[50vh] overflow-y-auto px-3 py-2 text-[11px]">
          {phase === "syncing" && (
            <div className="text-muted-foreground">Checking local done checks and review revisions against the cloud…</div>
          )}

          {phase === "done" && nothing && (
            <div className="text-muted-foreground">No unsaved local data was found in this browser.</div>
          )}

          {phase === "done" && !nothing && (
            <div className="space-y-3">
              {doneRes && doneRes.files.length > 0 && (
                <section>
                  <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Done checks · {doneRes.checksRecovered} pushed across {doneRes.filesUploaded} file{doneRes.filesUploaded === 1 ? "" : "s"}
                  </div>
                  <ul className="space-y-0.5">
                    {doneRes.files.map((f) => (
                      <li key={f.fileName} className="flex items-center justify-between gap-2 truncate">
                        <span className="flex min-w-0 items-center gap-1.5 truncate">
                          <FileJson className="h-3 w-3 shrink-0 text-muted-foreground" />
                          <span className="truncate" title={f.fileName}>{f.fileName}</span>
                        </span>
                        <span className="tabular-nums text-emerald-600">+{f.added}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {reviewRes && reviewRes.revisions.length > 0 && (
                <section>
                  <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Review revisions · {reviewRes.entriesRecovered} entries across {reviewRes.revisionsUploaded} revision{reviewRes.revisionsUploaded === 1 ? "" : "s"}
                  </div>
                  <ul className="space-y-0.5">
                    {reviewRes.revisions.map((r) => (
                      <li key={r.composite} className="flex items-center justify-between gap-2 truncate">
                        <span className="flex min-w-0 items-center gap-1.5 truncate">
                          <FileJson className="h-3 w-3 shrink-0 text-muted-foreground" />
                          <span className="truncate" title={r.fileName}>{r.fileName}</span>
                          <span className="rounded bg-surface-2 px-1 text-[9px] tabular-nums text-muted-foreground">r{r.revision}</span>
                        </span>
                        <span className="tabular-nums text-emerald-600">+{r.added}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}