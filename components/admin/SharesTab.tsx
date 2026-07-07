import { useEffect, useMemo, useState } from "react";
import { ExternalLink, Loader2, Search, X } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { adminListShares, adminRevokeShare, type AdminShareRow } from "@/lib/dm/admin";
import { buildShareUrl } from "@/lib/dm/shares";
import { cn } from "@/lib/utils";

export function SharesTab() {
  const [rows, setRows] = useState<AdminShareRow[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    setLoading(true);
    try { setRows(await adminListShares("")); }
    catch (e) { toast.error((e as Error).message); }
    finally { setLoading(false); }
  };

  useEffect(() => { refresh(); }, []);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter((r) =>
      r.file_name.toLowerCase().includes(s)
      || (r.author_email ?? "").toLowerCase().includes(s)
      || (r.recipient_email ?? "").toLowerCase().includes(s)
    );
  }, [rows, q]);

  const handleRevoke = async (id: string) => {
    if (!confirm("Revoke this share? Recipient will lose access.")) return;
    try {
      await adminRevokeShare(id);
      toast.success("Revoked");
      await refresh();
    } catch (e) { toast.error((e as Error).message); }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search file, author, recipient…" className="h-8 pl-7 text-sm" />
        </div>
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
                <th className="px-3 py-2 text-left">Author</th>
                <th className="px-3 py-2 text-left">Recipient</th>
                <th className="px-3 py-2 text-left">Revs</th>
                <th className="px-3 py-2 text-left">Status</th>
                <th className="px-3 py-2 text-right"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((r) => {
                const expired = r.expires_at && new Date(r.expires_at) < new Date();
                const state = r.revoked_at ? "revoked" : expired ? "expired" : "active";
                return (
                  <tr key={r.id} className="hover:bg-surface-2/40">
                    <td className="px-3 py-2 font-medium text-foreground">{r.file_name}</td>
                    <td className="px-3 py-2 text-muted-foreground">{r.author_email}</td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {r.public_link_enabled ? <span className="italic">Public link</span> : r.recipient_email ?? "—"}
                      {r.response_count > 0 && <span className="ml-1 rounded-full bg-primary/10 px-1.5 text-[10px] text-primary">{r.response_count} replies</span>}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">R{r.revisions.join(", R")}</td>
                    <td className="px-3 py-2">
                      <span className={cn(
                        "rounded-full px-1.5 py-px text-[10px] capitalize",
                        state === "active" ? "bg-primary/10 text-primary"
                        : state === "expired" ? "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400"
                        : "bg-destructive/10 text-destructive"
                      )}>{state}</span>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <a href={`/s/${r.token}`} target="_blank" rel="noreferrer"
                         className="mr-1 inline-flex h-6 items-center rounded px-1.5 text-[10px] text-muted-foreground hover:bg-surface-2 hover:text-foreground">
                        <ExternalLink className="h-3 w-3" />
                      </a>
                      {!r.revoked_at && (
                        <Button size="sm" variant="ghost" className="h-6 px-2 text-[10px] text-destructive hover:text-destructive" onClick={() => handleRevoke(r.id)}>
                          <X className="mr-0.5 h-3 w-3" />Revoke
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">No shares</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}