import { useEffect, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { listAuditLog, type AuditRow } from "@/lib/dm/admin";
import { AuditTimeline } from "./AuditTimeline";
import { toast } from "sonner";

const TARGET_TYPES = ["all", "user", "team", "share", "file", "invite"];

export function AuditTab() {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [target, setTarget] = useState<string>("all");
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    setLoading(true);
    try { setRows(await listAuditLog({ target_type: target === "all" ? undefined : target, limit: 200 })); }
    catch (e) { toast.error((e as Error).message); }
    finally { setLoading(false); }
  };

  useEffect(() => { refresh(); }, [target]);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Select value={target} onValueChange={setTarget}>
          <SelectTrigger className="h-8 w-40 text-xs"><SelectValue placeholder="All targets" /></SelectTrigger>
          <SelectContent>
            {TARGET_TYPES.map((t) => <SelectItem key={t} value={t}>{t === "all" ? "All targets" : t}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button size="sm" variant="ghost" className="h-8" onClick={refresh}>
          <RefreshCw className="mr-1 h-3.5 w-3.5" />Refresh
        </Button>
        <div className="ml-auto text-xs text-muted-foreground">{rows.length} events</div>
      </div>
      <div className="overflow-hidden rounded-md border border-border bg-surface">
        {loading ? (
          <div className="flex h-24 items-center justify-center text-xs text-muted-foreground"><Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />Loading…</div>
        ) : (
          <AuditTimeline rows={rows} />
        )}
      </div>
    </div>
  );
}