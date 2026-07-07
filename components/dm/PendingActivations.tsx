import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { UserCheck, UserX, Loader2, ShieldAlert } from "lucide-react";

type ProfileRow = {
  user_id: string;
  email: string | null;
  display_name: string | null;
  status: "pending" | "active" | "blocked";
  created_at: string;
};

export function PendingActivations({ trigger }: { trigger: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<ProfileRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from("profiles")
      .select("user_id,email,display_name,status,created_at")
      .in("status", ["pending", "blocked"])
      .order("created_at", { ascending: false });
    setLoading(false);
    if (error) return toast.error(error.message);
    setRows((data ?? []) as ProfileRow[]);
  }

  useEffect(() => { if (open) load(); }, [open]);

  async function setStatus(user_id: string, status: ProfileRow["status"]) {
    setBusy(user_id);
    const { error } = await supabase
      .from("profiles")
      .update({ status })
      .eq("user_id", user_id);
    setBusy(null);
    if (error) return toast.error(error.message);
    toast.success(`User ${status === "active" ? "approved" : "blocked"}`);
    setRows((r) => r.filter((x) => x.user_id !== user_id));
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-sm">
            <ShieldAlert className="h-4 w-4" /> Pending activations
          </DialogTitle>
        </DialogHeader>
        {loading ? (
          <div className="flex items-center justify-center p-6 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
          </div>
        ) : rows.length === 0 ? (
          <div className="p-6 text-center text-sm text-muted-foreground">
            No pending or blocked users.
          </div>
        ) : (
          <div className="max-h-[60vh] divide-y divide-border overflow-auto">
            {rows.map((r) => (
              <div key={r.user_id} className="flex items-center justify-between gap-3 py-2">
                <div className="min-w-0">
                  <div className="truncate text-sm">{r.email ?? "(no email)"}</div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    {r.status} · {new Date(r.created_at).toLocaleDateString()}
                  </div>
                </div>
                <div className="flex shrink-0 gap-1">
                  {r.status !== "active" && (
                    <Button
                      size="sm" variant="outline" className="h-7 text-xs"
                      disabled={busy === r.user_id}
                      onClick={() => setStatus(r.user_id, "active")}
                    >
                      <UserCheck className="mr-1 h-3.5 w-3.5" /> Approve
                    </Button>
                  )}
                  {r.status !== "blocked" && (
                    <Button
                      size="sm" variant="ghost" className="h-7 text-xs text-destructive hover:text-destructive"
                      disabled={busy === r.user_id}
                      onClick={() => setStatus(r.user_id, "blocked")}
                    >
                      <UserX className="mr-1 h-3.5 w-3.5" /> Block
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}