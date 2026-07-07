import { useCallback, useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ShieldCheck, RefreshCw, Upload, Download, AlertTriangle, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import {
  scanLocalDone, scanLocalReview, scanLocalRevisions,
  fetchCloudDone, fetchCloudReview, fetchCloudFiles, fetchOrgAndRoles,
  pushLocalDone, pullCloudDone, recoverAllLocalDone, clearRecoveryFlag,
  type LocalDoneEntry, type CloudDoneRow, type LocalReviewEntry,
  type CloudReviewRow, type CloudFileRow, type OrgAndRoles,
} from "@/lib/dm/integrity";

type Props = { open: boolean; onOpenChange: (v: boolean) => void };

type DoneJoin = {
  fileName: string;
  local: number;
  cloud: number;
  diff: number; // local - cloud
  status: "ok" | "local-only" | "local-ahead" | "cloud-ahead";
};

function joinDone(local: LocalDoneEntry[], cloud: CloudDoneRow[]): DoneJoin[] {
  const names = new Set<string>();
  for (const l of local) names.add(l.fileName);
  for (const c of cloud) names.add(c.fileName);
  const lMap = new Map(local.map((l) => [l.fileName, l.count]));
  const cMap = new Map(cloud.map((c) => [c.fileName, c.count]));
  const out: DoneJoin[] = [];
  for (const fileName of names) {
    const l = lMap.get(fileName) ?? 0;
    const c = cMap.get(fileName) ?? 0;
    let status: DoneJoin["status"] = "ok";
    if (l > 0 && c === 0) status = "local-only";
    else if (l > c) status = "local-ahead";
    else if (c > l) status = "cloud-ahead";
    out.push({ fileName, local: l, cloud: c, diff: l - c, status });
  }
  return out.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff) || a.fileName.localeCompare(b.fileName));
}

export function DataIntegrity({ open, onOpenChange }: Props) {
  const [busy, setBusy] = useState(false);
  const [localDone, setLocalDone] = useState<LocalDoneEntry[]>([]);
  const [cloudDone, setCloudDone] = useState<CloudDoneRow[]>([]);
  const [localReview, setLocalReview] = useState<LocalReviewEntry[]>([]);
  const [cloudReview, setCloudReview] = useState<CloudReviewRow[]>([]);
  const [cloudFiles, setCloudFiles] = useState<CloudFileRow[]>([]);
  const [orgRoles, setOrgRoles] = useState<OrgAndRoles | null>(null);
  const [localRevs, setLocalRevs] = useState<Record<string, number[]>>({});

  const refresh = useCallback(async () => {
    setBusy(true);
    try {
      setLocalDone(scanLocalDone());
      setLocalReview(scanLocalReview());
      setLocalRevs(scanLocalRevisions());
      const [d, r, f, or] = await Promise.all([
        fetchCloudDone(), fetchCloudReview(), fetchCloudFiles(), fetchOrgAndRoles(),
      ]);
      setCloudDone(d); setCloudReview(r); setCloudFiles(f); setOrgRoles(or);
    } finally { setBusy(false); }
  }, []);

  useEffect(() => { if (open) refresh(); }, [open, refresh]);

  const doneRows = useMemo(() => joinDone(localDone, cloudDone), [localDone, cloudDone]);

  const totalLocal = doneRows.reduce((a, r) => a + r.local, 0);
  const totalCloud = doneRows.reduce((a, r) => a + r.cloud, 0);
  const mismatched = doneRows.filter((r) => r.status !== "ok");

  async function pushOne(name: string) {
    setBusy(true);
    try {
      const r = await pushLocalDone(name);
      toast.success(`Pushed ${name}`, { description: `Cloud now has ${r.total} checks (+${r.added}).` });
      await refresh();
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
  }
  async function pullOne(name: string) {
    setBusy(true);
    try {
      const r = await pullCloudDone(name);
      toast.success(`Pulled ${name}`, { description: `Local now has ${r.total} checks (+${r.added}).` });
      await refresh();
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
  }
  async function pushAllMismatched() {
    setBusy(true);
    let uploaded = 0, recovered = 0;
    for (const r of mismatched) {
      if (r.status === "cloud-ahead") continue;
      try {
        const res = await pushLocalDone(r.fileName);
        uploaded++;
        recovered += res.added;
      } catch { /* ignore */ }
    }
    setBusy(false);
    toast.success("Push complete", { description: `Uploaded across ${uploaded} file${uploaded === 1 ? "" : "s"}, recovered ${recovered} check${recovered === 1 ? "" : "s"}.` });
    await refresh();
  }
  async function rerunAuto() {
    clearRecoveryFlag();
    setBusy(true);
    try {
      const r = await recoverAllLocalDone(true);
      if (r) toast.success("Auto-recovery complete", { description: `Recovered ${r.checksRecovered} check${r.checksRecovered === 1 ? "" : "s"} across ${r.filesUploaded} file${r.filesUploaded === 1 ? "" : "s"}.` });
    } finally { setBusy(false); await refresh(); }
  }

  // Review join — flag local-only revisions (no cloud row at all)
  const cloudReviewKeys = useMemo(() => new Set(cloudReview.map((r) => r.composite)), [cloudReview]);
  const localOnlyReview = useMemo(
    () => localReview.filter((r) => !cloudReviewKeys.has(r.composite) && (r.flagged + r.comments + r.suggested) > 0),
    [localReview, cloudReviewKeys],
  );

  // File history sanity
  const cloudFileNames = useMemo(() => new Set(cloudFiles.map((f) => f.fileName)), [cloudFiles]);
  const orphanFiles = useMemo(() => {
    const refs = new Set<string>();
    for (const r of cloudReview) refs.add(r.fileName);
    for (const r of cloudDone) refs.add(r.fileName);
    return [...refs].filter((n) => !cloudFileNames.has(n));
  }, [cloudReview, cloudDone, cloudFileNames]);

  // Org & roles sanity
  const orgIssues: string[] = [];
  if (orgRoles?.org) {
    const allowed = orgRoles.org.allowed_views ?? [];
    const def = orgRoles.org.default_view;
    if (def && allowed.length && !allowed.includes(def)) {
      orgIssues.push(`Default view "${def}" is not in allowed views.`);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4" /> Data integrity
          </DialogTitle>
        </DialogHeader>

        <div className="flex items-center justify-between gap-2 border-b border-border pb-3">
          <div className="text-xs text-muted-foreground">
            Local <strong className="text-foreground">{totalLocal}</strong> checks ·
            Cloud <strong className="text-foreground">{totalCloud}</strong> checks ·
            <span className={mismatched.length ? "text-amber-600" : "text-emerald-600"}> {mismatched.length} mismatch{mismatched.length === 1 ? "" : "es"}</span>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" onClick={refresh} disabled={busy}>
              <RefreshCw className={`mr-1 h-3.5 w-3.5 ${busy ? "animate-spin" : ""}`} /> Refresh
            </Button>
            <Button size="sm" variant="secondary" onClick={rerunAuto} disabled={busy} title="Re-run the one-shot scan that uploads any local checks missing from cloud">
              <Upload className="mr-1 h-3.5 w-3.5" /> Run auto-recover
            </Button>
            {mismatched.some((r) => r.status !== "cloud-ahead") && (
              <Button size="sm" onClick={pushAllMismatched} disabled={busy}>
                <Upload className="mr-1 h-3.5 w-3.5" /> Push all mismatched
              </Button>
            )}
          </div>
        </div>

        {/* Done checks */}
        <section className="space-y-2 pt-2">
          <h3 className="text-sm font-semibold">Done checks (local vs cloud)</h3>
          {doneRows.length === 0 ? (
            <p className="text-xs text-muted-foreground">No done-check data on this device or in the cloud.</p>
          ) : (
            <div className="overflow-hidden rounded-md border border-border">
              <table className="w-full text-xs">
                <thead className="bg-surface-2 text-left">
                  <tr>
                    <th className="px-2 py-1.5 font-medium">File</th>
                    <th className="px-2 py-1.5 font-medium text-right">Local</th>
                    <th className="px-2 py-1.5 font-medium text-right">Cloud</th>
                    <th className="px-2 py-1.5 font-medium text-right">Diff</th>
                    <th className="px-2 py-1.5 font-medium text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {doneRows.map((r) => (
                    <tr key={r.fileName} className="border-t border-border">
                      <td className="max-w-[18rem] truncate px-2 py-1.5" title={r.fileName}>{r.fileName}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{r.local}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{r.cloud}</td>
                      <td className={`px-2 py-1.5 text-right tabular-nums ${
                        r.status === "ok" ? "text-emerald-600"
                        : r.status === "local-only" ? "text-amber-600 font-semibold"
                        : r.status === "local-ahead" ? "text-amber-600"
                        : "text-sky-600"
                      }`}>
                        {r.status === "ok" ? "OK" : (r.diff > 0 ? `+${r.diff} local` : `${r.diff} (cloud ahead)`)}
                      </td>
                      <td className="px-2 py-1.5 text-right">
                        <div className="flex justify-end gap-1">
                          {r.local > 0 && r.status !== "ok" && r.status !== "cloud-ahead" && (
                            <Button size="sm" variant="ghost" className="h-6 px-2 text-[11px]" onClick={() => pushOne(r.fileName)} disabled={busy}>
                              <Upload className="mr-1 h-3 w-3" /> Push
                            </Button>
                          )}
                          {r.cloud > 0 && r.status === "cloud-ahead" && (
                            <Button size="sm" variant="ghost" className="h-6 px-2 text-[11px]" onClick={() => pullOne(r.fileName)} disabled={busy}>
                              <Download className="mr-1 h-3 w-3" /> Pull
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Review entries */}
        <section className="space-y-2 pt-4">
          <h3 className="text-sm font-semibold">Review entries (cloud)</h3>
          {cloudReview.length === 0 ? (
            <p className="text-xs text-muted-foreground">No cloud-stored review data.</p>
          ) : (
            <div className="overflow-hidden rounded-md border border-border">
              <table className="w-full text-xs">
                <thead className="bg-surface-2 text-left">
                  <tr>
                    <th className="px-2 py-1.5 font-medium">File</th>
                    <th className="px-2 py-1.5 font-medium text-right">Rev</th>
                    <th className="px-2 py-1.5 font-medium text-right">Flagged</th>
                    <th className="px-2 py-1.5 font-medium text-right">Comments</th>
                    <th className="px-2 py-1.5 font-medium text-right">Suggested</th>
                    <th className="px-2 py-1.5 font-medium text-right">Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {cloudReview.sort((a, b) => a.fileName.localeCompare(b.fileName) || a.revision - b.revision).map((r) => (
                    <tr key={r.composite} className="border-t border-border">
                      <td className="max-w-[18rem] truncate px-2 py-1.5" title={r.fileName}>{r.fileName}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{r.revision}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{r.flagged}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{r.comments}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{r.suggested}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground">
                        {r.updatedAt ? new Date(r.updatedAt).toLocaleDateString() : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {localOnlyReview.length > 0 && (
            <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-2 text-xs">
              <div className="mb-1 flex items-center gap-1 font-medium text-amber-700">
                <AlertTriangle className="h-3.5 w-3.5" /> Local-only review revisions ({localOnlyReview.length})
              </div>
              <ul className="ml-5 list-disc text-amber-900/80">
                {localOnlyReview.slice(0, 8).map((r) => (
                  <li key={r.composite}>{r.fileName} · r{r.revision} — {r.flagged} flagged, {r.comments} comments, {r.suggested} suggested</li>
                ))}
                {localOnlyReview.length > 8 && <li>…and {localOnlyReview.length - 8} more</li>}
              </ul>
              <p className="mt-1 text-amber-900/70">Open each file to push its review revisions to cloud.</p>
            </div>
          )}
          {Object.keys(localRevs).length > 0 && (
            <p className="text-[11px] text-muted-foreground">
              Local revision lists tracked for {Object.keys(localRevs).length} file{Object.keys(localRevs).length === 1 ? "" : "s"}.
            </p>
          )}
        </section>

        {/* File history */}
        <section className="space-y-2 pt-4">
          <h3 className="text-sm font-semibold">File history</h3>
          <div className="text-xs text-muted-foreground">
            {cloudFiles.length} file{cloudFiles.length === 1 ? "" : "s"} in your cloud history.
          </div>
          {orphanFiles.length > 0 ? (
            <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-2 text-xs">
              <div className="mb-1 flex items-center gap-1 font-medium text-amber-700">
                <AlertTriangle className="h-3.5 w-3.5" /> Orphan references ({orphanFiles.length})
              </div>
              <ul className="ml-5 list-disc text-amber-900/80">
                {orphanFiles.slice(0, 10).map((n) => <li key={n}>{n}</li>)}
                {orphanFiles.length > 10 && <li>…and {orphanFiles.length - 10} more</li>}
              </ul>
              <p className="mt-1 text-amber-900/70">
                These files have review or done data but no entry in your file history. Re-upload the JSON to restore history.
              </p>
            </div>
          ) : (
            <div className="flex items-center gap-1 text-xs text-emerald-600">
              <CheckCircle2 className="h-3.5 w-3.5" /> No orphan references.
            </div>
          )}
        </section>

        {/* Org & roles */}
        <section className="space-y-2 pt-4 pb-2">
          <h3 className="text-sm font-semibold">Org settings & roles</h3>
          {orgRoles?.org ? (
            <div className="grid grid-cols-2 gap-2 rounded-md border border-border p-2 text-xs">
              <div><span className="text-muted-foreground">Default view:</span> <strong>{orgRoles.org.default_view ?? "—"}</strong></div>
              <div><span className="text-muted-foreground">UI font:</span> <strong>{orgRoles.org.ui_font ?? "system"}</strong></div>
              <div><span className="text-muted-foreground">Light theme:</span> <strong>{orgRoles.org.light_theme ?? "standard"}</strong></div>
              <div><span className="text-muted-foreground">Zebra rows:</span> <strong>{orgRoles.org.zebra_rows === false ? "off" : "on"}</strong></div>
              <div className="col-span-2"><span className="text-muted-foreground">Allowed views:</span> <strong>{(orgRoles.org.allowed_views ?? []).join(", ") || "—"}</strong></div>
              <div className="col-span-2"><span className="text-muted-foreground">Your roles:</span> <strong>{orgRoles.roles.join(", ") || "(none)"}</strong></div>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">Org settings unavailable.</p>
          )}
          {orgIssues.length > 0 && (
            <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-2 text-xs text-amber-800">
              <div className="mb-1 flex items-center gap-1 font-medium">
                <AlertTriangle className="h-3.5 w-3.5" /> Issues
              </div>
              <ul className="ml-5 list-disc">
                {orgIssues.map((m) => <li key={m}>{m}</li>)}
              </ul>
            </div>
          )}
        </section>
      </DialogContent>
    </Dialog>
  );
}