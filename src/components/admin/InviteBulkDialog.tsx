import { useEffect, useState } from "react";
import { Loader2, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { adminBulkInvite, adminListPendingInvites, adminCancelInvite, listMyTeams, type PendingInvite, type TeamRow } from "@/lib/dm/admin";

export function InviteBulkDialog({ onDone }: { onDone?: () => void }) {
  const [open, setOpen] = useState(false);
  const [emails, setEmails] = useState("");
  const [teamId, setTeamId] = useState<string>("none");
  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [pending, setPending] = useState<PendingInvite[]>([]);
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    try {
      const [t, p] = await Promise.all([listMyTeams(), adminListPendingInvites()]);
      setTeams(t); setPending(p);
    } catch (e) { toast.error((e as Error).message); }
  };

  useEffect(() => { if (open) refresh(); }, [open]);

  const submit = async () => {
    const list = emails.split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean);
    if (list.length === 0) return toast.error("Enter at least one email");
    setBusy(true);
    try {
      const r = await adminBulkInvite(list, teamId === "none" ? null : teamId);
      toast.success(`Processed ${r.added} email${r.added === 1 ? "" : "s"}`);
      setEmails("");
      await refresh();
      onDone?.();
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
  };

  const cancel = async (id: string) => {
    try { await adminCancelInvite(id); await refresh(); toast.success("Invite cancelled"); }
    catch (e) { toast.error((e as Error).message); }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="h-8 text-xs"><UserPlus className="mr-1 h-3.5 w-3.5" />Invite</Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Bulk invite</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Emails (comma, space, or newline separated)</div>
            <Textarea value={emails} onChange={(e) => setEmails(e.target.value)} rows={5} placeholder="alex@example.com, jordan@example.com" className="text-xs" />
          </div>
          <div className="space-y-1.5">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Add to team (optional)</div>
            <Select value={teamId} onValueChange={setTeamId}>
              <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— No team —</SelectItem>
                {teams.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>Close</Button>
            <Button size="sm" onClick={submit} disabled={busy}>
              {busy ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null} Invite
            </Button>
          </div>

          <div>
            <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Pending ({pending.length})</div>
            <div className="max-h-40 overflow-y-auto rounded-md border border-border">
              {pending.length === 0 ? (
                <div className="px-3 py-3 text-center text-[11px] text-muted-foreground">No pending invites.</div>
              ) : pending.map((p) => (
                <div key={p.id} className="flex items-center justify-between border-b border-border px-3 py-1.5 text-xs last:border-b-0">
                  <div className="min-w-0">
                    <div className="truncate font-medium">{p.email}</div>
                    <div className="text-[10px] text-muted-foreground">
                      {p.team_name ? `→ ${p.team_name}` : "no team"} · {new Date(p.created_at).toLocaleDateString()}
                    </div>
                  </div>
                  <Button size="sm" variant="ghost" className="h-6 px-2 text-[10px] text-destructive hover:text-destructive" onClick={() => cancel(p.id)}>Cancel</Button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}