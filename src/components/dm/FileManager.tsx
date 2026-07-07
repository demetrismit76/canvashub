import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { FolderOpen, Archive, ArchiveRestore, Trash2, Upload, RefreshCw, Search, FileJson, Pencil } from "lucide-react";
import { toast } from "sonner";
import {
  listAllFiles, archiveFile, unarchiveFile, deleteFile, getFileRelatedCounts,
  setFileDisplayName,
  type RecentFile,
} from "@/lib/dm/history";
import { useFormStore } from "@/store/useFormStore";
import { loadFile } from "@/lib/dm/history";
import {
  scanLocalDone, fetchCloudDone, pushLocalDone,
} from "@/lib/dm/integrity";
import { RenameFileDialog } from "./RenameFileDialog";

type Props = { open: boolean; onOpenChange: (v: boolean) => void };

type Row = RecentFile & {
  localChecks: number;
  cloudChecks: number;
};

export function FileManager({ open, onOpenChange }: Props) {
  const loadJSON = useFormStore((s) => s.loadJSON);
  const applyDisplayName = useFormStore((s) => s.applyDisplayName);
  const [busy, setBusy] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [q, setQ] = useState("");
  const [tab, setTab] = useState<"active" | "archived">("active");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [renaming, setRenaming] = useState<Row | null>(null);
  // Tracks whether the current selection came from "Select all" — used to
  // confirm before silently breaking out of an all-selected state.
  const allSelectedRef = useRef(false);

  const refresh = useCallback(async () => {
    setBusy(true);
    try {
      const [files, cloudDone] = await Promise.all([listAllFiles(), fetchCloudDone()]);
      const local = scanLocalDone();
      const localByName = new Map(local.map((l) => [l.fileName, l.count]));
      const cloudByName = new Map(cloudDone.map((c) => [c.fileName, c.count]));
      setRows(files.map((f) => ({
        ...f,
        localChecks: localByName.get(f.file_name) ?? 0,
        cloudChecks: cloudByName.get(f.file_name) ?? 0,
      })));
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
  }, []);

  useEffect(() => { if (open) refresh(); }, [open, refresh]);

  // Reset selection whenever we change tabs, search, or the file list changes.
  useEffect(() => { setSelected(new Set()); allSelectedRef.current = false; }, [tab, rows]);

  const active = useMemo(() => rows.filter((r) => !r.archived_at), [rows]);
  const archived = useMemo(() => rows.filter((r) => !!r.archived_at), [rows]);

  const filter = useCallback((list: Row[]) => {
    if (!q.trim()) return list;
    const needle = q.toLowerCase();
    return list.filter((r) =>
      r.file_name.toLowerCase().includes(needle) ||
      (r.display_name ?? "").toLowerCase().includes(needle),
    );
  }, [q]);

  const visible = useMemo(() => filter(tab === "active" ? active : archived), [filter, tab, active, archived]);
  const allChecked = visible.length > 0 && visible.every((r) => selected.has(r.file_name));
  const someChecked = visible.some((r) => selected.has(r.file_name)) && !allChecked;

  function toggleRow(name: string, next: boolean) {
    // If the user is unchecking from an "all selected" state, confirm once.
    if (!next && allSelectedRef.current) {
      if (!confirm(`Deselect "${name}"? All files were selected — confirming so nothing is missed.`)) return;
      allSelectedRef.current = false;
    }
    setSelected((prev) => {
      const n = new Set(prev);
      if (next) n.add(name); else n.delete(name);
      return n;
    });
  }

  function toggleAll(next: boolean) {
    if (next) {
      setSelected(new Set(visible.map((r) => r.file_name)));
      allSelectedRef.current = true;
    } else {
      setSelected(new Set());
      allSelectedRef.current = false;
    }
  }

  const selectedRows = useMemo(() => visible.filter((r) => selected.has(r.file_name)), [visible, selected]);
  const selectedPushable = selectedRows.filter((r) => r.localChecks > r.cloudChecks);
  const localAheadRows = useMemo(() => visible.filter((r) => r.localChecks > r.cloudChecks), [visible]);

  function selectLocalAhead() {
    setSelected(new Set(localAheadRows.map((r) => r.file_name)));
    allSelectedRef.current = false;
  }

  async function openFile(name: string) {
    try {
      const json = await loadFile(name);
      if (!json) return toast.error("File not found");
      loadJSON(json, name);
      onOpenChange(false);
    } catch (e) { toast.error((e as Error).message); }
  }
  async function doArchive(name: string) {
    setBusy(true);
    try { await archiveFile(name); toast.success(`Archived ${name}`); await refresh(); }
    catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
  }
  async function doUnarchive(name: string) {
    setBusy(true);
    try { await unarchiveFile(name); toast.success(`Restored ${name}`); await refresh(); }
    catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
  }
  async function doDelete(name: string) {
    setBusy(true);
    try {
      const counts = await getFileRelatedCounts(name);
      const extras: string[] = [];
      if (counts.doneRows) extras.push(`${counts.doneRows} done-check row`);
      if (counts.reviewRows) extras.push(`${counts.reviewRows} review revision${counts.reviewRows === 1 ? "" : "s"}`);
      const extraMsg = extras.length ? ` and ${extras.join(" + ")}` : "";
      if (!confirm(`Delete "${name}"${extraMsg}?\n\nThis cannot be undone. Use Archive instead to hide without deleting.`)) {
        setBusy(false); return;
      }
      await deleteFile(name, { cascade: true });
      toast.success(`Deleted ${name}`, { description: extras.length ? `Also removed ${extras.join(" + ")}.` : undefined });
      await refresh();
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
  }
  async function doPush(name: string) {
    setBusy(true);
    try {
      const r = await pushLocalDone(name);
      toast.success(`Pushed ${name}`, { description: `Cloud now has ${r.total} checks (+${r.added}).` });
      await refresh();
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
  }

  async function bulkArchive() {
    if (selectedRows.length === 0) return;
    setBusy(true);
    let n = 0;
    for (const r of selectedRows) {
      try { await archiveFile(r.file_name); n++; } catch { /* ignore */ }
    }
    setBusy(false);
    toast.success(`Archived ${n} file${n === 1 ? "" : "s"}`);
    await refresh();
  }
  async function bulkUnarchive() {
    if (selectedRows.length === 0) return;
    setBusy(true);
    let n = 0;
    for (const r of selectedRows) {
      try { await unarchiveFile(r.file_name); n++; } catch { /* ignore */ }
    }
    setBusy(false);
    toast.success(`Restored ${n} file${n === 1 ? "" : "s"}`);
    await refresh();
  }
  async function bulkPush() {
    if (selectedPushable.length === 0) return;
    setBusy(true);
    let n = 0, added = 0;
    for (const r of selectedPushable) {
      try { const res = await pushLocalDone(r.file_name); n++; added += res.added; }
      catch { /* ignore */ }
    }
    setBusy(false);
    toast.success(`Pushed ${n} file${n === 1 ? "" : "s"}`, { description: `Recovered ${added} check${added === 1 ? "" : "s"}.` });
    await refresh();
  }
  async function bulkDelete() {
    if (selectedRows.length === 0) return;
    if (!confirm(`Delete ${selectedRows.length} file${selectedRows.length === 1 ? "" : "s"} with all their done-check and review data?\n\nThis cannot be undone.`)) return;
    setBusy(true);
    let n = 0;
    for (const r of selectedRows) {
      try { await deleteFile(r.file_name, { cascade: true }); n++; } catch { /* ignore */ }
    }
    setBusy(false);
    toast.success(`Deleted ${n} file${n === 1 ? "" : "s"}`);
    await refresh();
  }

  function RowEl({ r, archivedTab }: { r: Row; archivedTab: boolean }) {
    const hasLocalAhead = r.localChecks > r.cloudChecks;
    const cloudAhead = r.cloudChecks > r.localChecks;
    const pushTitle = hasLocalAhead
      ? `Push ${r.localChecks - r.cloudChecks} local check${r.localChecks - r.cloudChecks === 1 ? "" : "s"} to cloud`
      : cloudAhead
        ? "Cloud is ahead — nothing to push"
        : "Already in sync";
    const checked = selected.has(r.file_name);
    const label = r.display_name?.trim() || r.file_name;
    const showFileNameSub = !!r.display_name && r.display_name.trim() !== r.file_name;
    return (
      <tr className="border-t border-border">
        <td className="w-8 px-2 py-1.5">
          <Checkbox
            checked={checked}
            onCheckedChange={(v) => toggleRow(r.file_name, !!v)}
            aria-label={`Select ${label}`}
          />
        </td>
        <td className="max-w-[18rem] px-2 py-1.5">
          <button
            type="button"
            onClick={() => openFile(r.file_name)}
            className="flex min-w-0 items-start gap-1.5 text-left hover:underline"
            title={`Open ${label}`}
          >
            <FileJson className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <span className="min-w-0">
              <span className="block truncate">{label}</span>
              {showFileNameSub && (
                <span className="block truncate font-mono text-[10px] text-muted-foreground">{r.file_name}</span>
              )}
            </span>
          </button>
        </td>
        <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground">
          {new Date(r.last_opened_at).toLocaleDateString()}
        </td>
        <td className="px-2 py-1.5 text-right tabular-nums">{r.localChecks}</td>
        <td className="px-2 py-1.5 text-right tabular-nums">{r.cloudChecks}</td>
        <td className="px-2 py-1.5 text-right">
          <div className="flex justify-end gap-1">
            <Button
              size="sm"
              variant="ghost"
              className="h-6 px-2 text-[11px]"
              onClick={() => setRenaming(r)}
              disabled={busy}
              title="Rename (display name only)"
            >
              <Pencil className="h-3 w-3" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-6 px-2 text-[11px]"
              onClick={() => doPush(r.file_name)}
              disabled={busy || !hasLocalAhead}
              title={pushTitle}
            >
              <Upload className="h-3 w-3" />
            </Button>
            {archivedTab ? (
              <Button size="sm" variant="ghost" className="h-6 px-2 text-[11px]" onClick={() => doUnarchive(r.file_name)} disabled={busy} title="Restore">
                <ArchiveRestore className="h-3 w-3" />
              </Button>
            ) : (
              <Button size="sm" variant="ghost" className="h-6 px-2 text-[11px]" onClick={() => doArchive(r.file_name)} disabled={busy} title="Archive (hide but keep)">
                <Archive className="h-3 w-3" />
              </Button>
            )}
            <Button size="sm" variant="ghost" className="h-6 px-2 text-[11px] text-destructive hover:text-destructive" onClick={() => doDelete(r.file_name)} disabled={busy} title="Delete (with cascade)">
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        </td>
      </tr>
    );
  }

  function Table({ list, archivedTab }: { list: Row[]; archivedTab: boolean }) {
    if (list.length === 0) {
      return <div className="rounded-md border border-dashed border-border p-4 text-center text-xs text-muted-foreground">No files.</div>;
    }
    return (
      <div className="overflow-hidden rounded-md border border-border">
        <table className="w-full text-xs">
          <thead className="bg-surface-2 text-left">
            <tr>
              <th className="w-8 px-2 py-1.5">
                <Checkbox
                  checked={allChecked ? true : someChecked ? "indeterminate" : false}
                  onCheckedChange={(v) => toggleAll(!!v)}
                  aria-label="Select all"
                />
              </th>
              <th className="px-2 py-1.5 font-medium">File</th>
              <th className="px-2 py-1.5 font-medium text-right">{archivedTab ? "Archived" : "Last opened"}</th>
              <th className="px-2 py-1.5 font-medium text-right" title="Local done-checks in this browser">Local</th>
              <th className="px-2 py-1.5 font-medium text-right" title="Done-checks saved to cloud">Cloud</th>
              <th className="px-2 py-1.5 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {list.map((r) => <RowEl key={r.file_name} r={r} archivedTab={archivedTab} />)}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FolderOpen className="h-4 w-4" /> Manage files
          </DialogTitle>
        </DialogHeader>

        <div className="flex items-center gap-2 border-b border-border pb-3">
          <div className="relative flex-1">
            <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search files…" className="h-8 pl-7 text-xs" />
          </div>
          <Button size="sm" variant="ghost" onClick={refresh} disabled={busy}>
            <RefreshCw className={`mr-1 h-3.5 w-3.5 ${busy ? "animate-spin" : ""}`} /> Refresh
          </Button>
        </div>

        {localAheadRows.length > 0 && (
          <div className="flex justify-end pt-1">
            <Button
              size="sm"
              variant="ghost"
              className="h-6 px-2 text-[11px] text-muted-foreground hover:text-foreground"
              onClick={selectLocalAhead}
              disabled={busy}
              title="Select only files whose local checks are ahead of cloud"
            >
              Select local ahead ({localAheadRows.length})
            </Button>
          </div>
        )}

        {selectedRows.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-primary/30 bg-primary/5 px-2 py-1.5 text-xs">
            <div>
              <strong>{selectedRows.length}</strong> selected
              {selectedPushable.length > 0 && (
                <span className="ml-2 text-muted-foreground">({selectedPushable.length} with local ahead)</span>
              )}
              {selectedPushable.length === 0 && (
                <span className="ml-2 text-muted-foreground">— nothing to push, all in sync</span>
              )}
            </div>
            <div className="flex flex-wrap gap-1">
              <Button
                size="sm"
                variant="ghost"
                className="h-6 px-2 text-[11px]"
                onClick={bulkPush}
                disabled={busy || selectedPushable.length === 0}
                title={selectedPushable.length === 0 ? "No selected files have local ahead of cloud" : `Push ${selectedPushable.length} file(s) to cloud`}
              >
                <Upload className="mr-1 h-3 w-3" /> Push
              </Button>
              {tab === "active" ? (
                <Button size="sm" variant="ghost" className="h-6 px-2 text-[11px]" onClick={bulkArchive} disabled={busy}>
                  <Archive className="mr-1 h-3 w-3" /> Archive
                </Button>
              ) : (
                <Button size="sm" variant="ghost" className="h-6 px-2 text-[11px]" onClick={bulkUnarchive} disabled={busy}>
                  <ArchiveRestore className="mr-1 h-3 w-3" /> Restore
                </Button>
              )}
              <Button size="sm" variant="ghost" className="h-6 px-2 text-[11px] text-destructive hover:text-destructive" onClick={bulkDelete} disabled={busy}>
                <Trash2 className="mr-1 h-3 w-3" /> Delete
              </Button>
              <Button size="sm" variant="ghost" className="h-6 px-2 text-[11px]" onClick={() => { setSelected(new Set()); allSelectedRef.current = false; }} disabled={busy}>
                Clear
              </Button>
            </div>
          </div>
        )}

        <Tabs value={tab} onValueChange={(v) => setTab(v as "active" | "archived")} className="pt-2">
          <TabsList>
            <TabsTrigger value="active" className="text-xs">Active ({active.length})</TabsTrigger>
            <TabsTrigger value="archived" className="text-xs">Archived ({archived.length})</TabsTrigger>
          </TabsList>
          <TabsContent value="active" className="pt-3">
            <Table list={filter(active)} archivedTab={false} />
            <p className="mt-2 text-[11px] text-muted-foreground">
              History is unlimited. <strong>Archive</strong> hides files from the recent menu but keeps everything. <strong>Delete</strong> removes the file plus its done-check and review rows (with confirmation).
            </p>
          </TabsContent>
          <TabsContent value="archived" className="pt-3">
            <Table list={filter(archived)} archivedTab />
          </TabsContent>
        </Tabs>

        {renaming && (
          <RenameFileDialog
            open={!!renaming}
            onOpenChange={(v) => { if (!v) setRenaming(null); }}
            fileName={renaming.file_name}
            // We don't have the parsed schema here; fall back to the file name
            // as the "original" so the reset link still works as expected.
            schemaTitle={null}
            currentDisplayName={renaming.display_name ?? null}
            onSave={async (newName) => {
              const saved = await setFileDisplayName(renaming.file_name, newName);
              // Update local list + the global store if this file is currently open.
              setRows((prev) => prev.map((x) =>
                x.file_name === renaming.file_name ? { ...x, display_name: saved } : x,
              ));
              applyDisplayName(renaming.file_name, saved);
              setRenaming(null);
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}