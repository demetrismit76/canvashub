import { useRef, useState } from "react";
import {
  Download,
  Loader2,
  ShieldAlert,
  FileArchive,
  Database,
  FileCode,
  Upload,
  AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";

type Scope = "all" | "schema" | "data";

export function BackupTab() {
  const [busy, setBusy] = useState<Scope | null>(null);
  const [last, setLast] = useState<{ scope: Scope; size: number; at: string } | null>(null);
  const [restoreFile, setRestoreFile] = useState<File | null>(null);
  const [confirm, setConfirm] = useState("");
  const [restoring, setRestoring] = useState<null | "backup" | "uploading" | "applying">(null);
  const [restoreResult, setRestoreResult] = useState<Record<string, number> | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const download = async (scope: Scope): Promise<Blob | null> => {
    setBusy(scope);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) throw new Error("Not signed in");

      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const url = `https://${projectId}.supabase.co/functions/v1/admin-backup?scope=${scope}`;
      const res = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
      });
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(txt || `Backup failed (${res.status})`);
      }
      const blob = await res.blob();
      const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `devicecanvas-backup-${scope}-${ts}.zip`;
      a.click();
      URL.revokeObjectURL(a.href);
      setLast({ scope, size: blob.size, at: new Date().toISOString() });
      toast.success("Backup downloaded");
      return blob;
    } catch (e) {
      toast.error((e as Error).message);
      return null;
    } finally {
      setBusy(null);
    }
  };

  const runRestore = async () => {
    if (!restoreFile) {
      toast.error("Select a backup ZIP first");
      return;
    }
    if (confirm !== "DELETE") {
      toast.error('Type DELETE to confirm');
      return;
    }
    setRestoreResult(null);

    // 1. Mandatory pre-restore backup
    setRestoring("backup");
    const preBlob = await download("all");
    if (!preBlob) {
      setRestoring(null);
      toast.error("Pre-restore backup failed — restore aborted");
      return;
    }

    // 2. Upload ZIP to admin-restore
    try {
      setRestoring("uploading");
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) throw new Error("Not signed in");
      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const url = `https://${projectId}.supabase.co/functions/v1/admin-restore`;

      setRestoring("applying");
      const res = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          "Content-Type": "application/zip",
        },
        body: restoreFile,
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body?.error || `Restore failed (${res.status})`);
      }
      setRestoreResult(body.restored ?? {});
      toast.success("Restore complete");
      setConfirm("");
      setRestoreFile(null);
      if (fileRef.current) fileRef.current.value = "";
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setRestoring(null);
    }
  };

  const fmtSize = (n: number) =>
    n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(2)} MB` : `${(n / 1024).toFixed(1)} KB`;

  return (
    <div className="space-y-4">
      <div className="rounded-md border border-border bg-surface p-4">
        <div className="flex items-start gap-3">
          <FileArchive className="mt-0.5 h-5 w-5 text-primary" />
          <div className="flex-1">
            <h2 className="text-sm font-semibold">Backup &amp; Export</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Download a portable bundle of the database — schema, data, edge functions,
              migrations, and a step-by-step restore guide. Use it to rebuild this app on
              another Postgres/Supabase project or to port it to a different platform.
            </p>
          </div>
        </div>

        <div className="mt-4 grid gap-2 sm:grid-cols-3">
          <Button
            onClick={() => download("all")}
            disabled={busy !== null}
            className="h-auto flex-col items-start gap-1 py-3 text-left"
          >
            {busy === "all" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            <span className="text-sm font-semibold">Full backup (.zip)</span>
            <span className="text-[10px] font-normal opacity-80">
              schema.sql + full-dump.sql + CSVs + JSON + functions + migrations + RESTORE.md
            </span>
          </Button>

          <Button
            variant="outline"
            onClick={() => download("schema")}
            disabled={busy !== null}
            className="h-auto flex-col items-start gap-1 py-3 text-left"
          >
            {busy === "schema" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <FileCode className="h-4 w-4" />
            )}
            <span className="text-sm font-semibold">Schema only</span>
            <span className="text-[10px] font-normal text-muted-foreground">
              DDL, RLS, policies, functions, triggers, edge-function source
            </span>
          </Button>

          <Button
            variant="outline"
            onClick={() => download("data")}
            disabled={busy !== null}
            className="h-auto flex-col items-start gap-1 py-3 text-left"
          >
            {busy === "data" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Database className="h-4 w-4" />
            )}
            <span className="text-sm font-semibold">Data only</span>
            <span className="text-[10px] font-normal text-muted-foreground">
              CSV + JSON per public table
            </span>
          </Button>
        </div>

        {last && (
          <div className="mt-3 rounded border border-border bg-surface-2 px-3 py-2 text-[11px] text-muted-foreground">
            Last download: <span className="text-foreground">{last.scope}</span> · {fmtSize(last.size)} ·{" "}
            {new Date(last.at).toLocaleString()}
          </div>
        )}
      </div>

      <div className="rounded-md border border-destructive/40 bg-destructive/5 p-4">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 text-destructive" />
          <div className="flex-1">
            <h2 className="text-sm font-semibold text-destructive">Restore from backup</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Overwrites all public tables (profiles, teams, files, shares, statuses…) with the
              rows in the selected backup ZIP. <strong className="text-foreground">
                A full backup of the current database is automatically downloaded first
              </strong> — restore only proceeds if that backup succeeds.
            </p>
            <ul className="mt-2 list-inside list-disc space-y-0.5 text-[11px] text-muted-foreground">
              <li>Only super admins can run this.</li>
              <li>Each table is TRUNCATEd then re-inserted from <code>data-json/</code>.</li>
              <li>
                <code>auth.users</code> and <code>audit_log</code> are never touched. User IDs in
                the backup must already exist in this project's auth, otherwise FK inserts fail
                and the restore aborts.
              </li>
            </ul>

            <div className="mt-4 space-y-3">
              <div>
                <Label htmlFor="restore-file" className="text-xs">
                  Backup ZIP (must contain <code>data-json/</code>)
                </Label>
                <Input
                  id="restore-file"
                  ref={fileRef}
                  type="file"
                  accept=".zip,application/zip"
                  onChange={(e) => setRestoreFile(e.target.files?.[0] ?? null)}
                  disabled={restoring !== null}
                  className="mt-1 h-9 text-xs"
                />
                {restoreFile && (
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {restoreFile.name} · {fmtSize(restoreFile.size)}
                  </p>
                )}
              </div>

              <div>
                <Label htmlFor="restore-confirm" className="text-xs">
                  Type <code className="font-bold text-destructive">DELETE</code> to confirm
                  overwrite
                </Label>
                <Input
                  id="restore-confirm"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  placeholder="DELETE"
                  disabled={restoring !== null}
                  className="mt-1 h-9 text-xs font-mono"
                />
              </div>

              <Button
                variant="destructive"
                onClick={runRestore}
                disabled={
                  restoring !== null ||
                  busy !== null ||
                  !restoreFile ||
                  confirm !== "DELETE"
                }
                className="w-full sm:w-auto"
              >
                {restoring ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {restoring === "backup"
                      ? "Backing up current data…"
                      : restoring === "uploading"
                        ? "Uploading…"
                        : "Applying restore…"}
                  </>
                ) : (
                  <>
                    <Upload className="mr-2 h-4 w-4" />
                    Backup current &amp; restore
                  </>
                )}
              </Button>

              {restoreResult && (
                <div className="rounded border border-border bg-surface px-3 py-2 text-[11px]">
                  <p className="font-semibold text-foreground">Restored rows</p>
                  <ul className="mt-1 grid grid-cols-2 gap-x-3 gap-y-0.5 text-muted-foreground sm:grid-cols-3">
                    {Object.entries(restoreResult).map(([t, n]) => (
                      <li key={t}>
                        <code>{t}</code>: <span className="text-foreground">{n}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-md border border-border bg-surface p-4">
        <div className="flex items-start gap-3">
          <ShieldAlert className="mt-0.5 h-5 w-5 text-amber-500" />
          <div className="flex-1 space-y-2 text-xs text-muted-foreground">
            <p className="font-semibold text-foreground">What's NOT included</p>
            <ul className="list-inside list-disc space-y-1">
              <li>
                Auth users (Lovable Cloud does not expose <code>auth.users</code>). Users must
                be re-invited or imported via the target platform's auth admin API. Their{" "}
                <code>user_id</code>s in <code>profiles</code> remain valid as references.
              </li>
              <li>
                Secrets and API keys. The <code>RESTORE.md</code> inside the ZIP lists every
                secret name the app expects, so you can re-add them in the new project.
              </li>
              <li>Storage bucket files (no buckets exist in this project).</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}