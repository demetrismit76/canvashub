import { useEffect, useMemo, useState } from "react";
import { Loader2, Search } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { adminListFileStatuses, type FileStatus, type FileStatusRow } from "@/lib/dm/admin";
import { cn } from "@/lib/utils";

const STATUS_TONES: Record<FileStatus, string> = {
  open: "bg-primary/10 text-primary",
  closed: "bg-muted text-muted-foreground",
  reopened: "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400",
  archived: "bg-surface-2 text-muted-foreground",
};

export function FilesStatusTab() {
  const [rows, setRows] = useState<FileStatusRow[]>([]);
  const [status, setStatus] = useState<FileStatus | "">("");
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    setLoading(true);
    try { setRows(await adminListFileStatuses(status, "")); }
    catch (e) { toast.error((e as Error).message); }
    finally { setLoading(false); }
  };

  useEffect(() => { refresh(); }, [status]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter((r) =>
      r.file_name.toLowerCase().includes(s) || (r.owner_email ?? "").toLowerCase().includes(s));
  }, [rows, q]);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search file or owner…" className="h-8 pl-7 text-sm" />
        </div>
        <Select value={status || "all"} onValueChange={(v) => setStatus(v === "all" ? "" : v as FileStatus)}>
          <SelectTrigger className="h-8 w-32 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="open">Open</SelectItem>
            <SelectItem value="closed">Closed</SelectItem>
            <SelectItem value="reopened">Reopened</SelectItem>
            <SelectItem value="archived">Archived</SelectItem>
          </SelectContent>
        </Select>
        <div className="text-xs text-muted-foreground">{filtered.length} of {rows.length}</div>
      </div>
      {loading ? (
        <div className="flex h-20 items-center justify-center text-xs text-muted-foreground"><Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />Loading…</div>
      ) : (
        <div className="overflow-hidden rounded-md border border-border">
          <table className="w-full text-xs">
            <thead className="bg-surface-2 text-[10px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left">File</th>
                <th className="px-3 py-2 text-left">Owner</th>
                <th className="px-3 py-2 text-left">Status</th>
                <th className="px-3 py-2 text-left">Note</th>
                <th className="px-3 py-2 text-right">Updated</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((r) => (
                <tr key={r.id} className="hover:bg-surface-2/40">
                  <td className="px-3 py-2 font-medium text-foreground">{r.file_name}</td>
                  <td className="px-3 py-2 text-muted-foreground">{r.owner_email}</td>
                  <td className="px-3 py-2">
                    <span className={cn("rounded-full px-1.5 py-px text-[10px] capitalize", STATUS_TONES[r.status])}>{r.status}</span>
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">{r.note || "—"}</td>
                  <td className="px-3 py-2 text-right text-[10px] text-muted-foreground">{new Date(r.updated_at).toLocaleString()}</td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">No file statuses recorded yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
      <div className="text-[11px] text-muted-foreground">
        File statuses are set by file owners from the top bar of the editor (Open / Closed / Reopened / Archived).
      </div>
    </div>
  );
}