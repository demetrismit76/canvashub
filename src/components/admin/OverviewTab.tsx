import { useEffect, useState } from "react";
import { Loader2, Users, Share2, FileText, ShieldCheck, Activity } from "lucide-react";
import { adminDashboardStats, listAuditLog, type DashboardStats, type AuditRow } from "@/lib/dm/admin";
import { AuditTimeline } from "./AuditTimeline";
import { toast } from "sonner";

export function OverviewTab() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [recent, setRecent] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([adminDashboardStats(), listAuditLog({ limit: 20 })])
      .then(([s, a]) => { setStats(s); setRecent(a); })
      .catch((e) => toast.error((e as Error).message))
      .finally(() => setLoading(false));
  }, []);

  if (loading || !stats) {
    return <div className="flex h-32 items-center justify-center text-xs text-muted-foreground"><Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />Loading…</div>;
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <Stat label="Users" value={stats.users_total} sub={`${stats.users_active} active · ${stats.users_pending} pending`} Icon={Users} />
        <Stat label="Active shares" value={stats.shares_active} sub={`${stats.shares_revoked} revoked`} Icon={Share2} />
        <Stat label="Files reviewed" value={stats.files_reviewed} sub={`${stats.files_total} total`} Icon={FileText} />
        <Stat label="Teams" value={stats.teams_total} sub={`${stats.users_suspended} suspended users`} Icon={ShieldCheck} />
      </div>

      <div className="grid grid-cols-4 gap-2">
        <FileStat label="Open" value={stats.files_open} tone="primary" />
        <FileStat label="Closed" value={stats.files_closed} tone="muted" />
        <FileStat label="Reopened" value={stats.files_reopened} tone="warn" />
        <FileStat label="Archived" value={stats.files_archived} tone="muted" />
      </div>

      <Sparkline data={stats.signups_30d} />

      <div className="rounded-md border border-border bg-surface">
        <div className="flex items-center gap-2 border-b border-border px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          <Activity className="h-3.5 w-3.5" /> Recent activity
        </div>
        <AuditTimeline rows={recent} />
      </div>
    </div>
  );
}

function Stat({ label, value, sub, Icon }: { label: string; value: number; sub: string; Icon: React.ComponentType<{ className?: string }> }) {
  return (
    <div className="rounded-md border border-border bg-surface p-3">
      <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        <span>{label}</span>
        <Icon className="h-3.5 w-3.5" />
      </div>
      <div className="mt-1 text-2xl font-bold tabular-nums text-foreground">{value}</div>
      <div className="text-[10px] text-muted-foreground">{sub}</div>
    </div>
  );
}

function FileStat({ label, value, tone }: { label: string; value: number; tone: "primary" | "muted" | "warn" }) {
  const cls =
    tone === "primary" ? "border-primary/30 bg-primary/5 text-primary"
    : tone === "warn" ? "border-yellow-500/30 bg-yellow-500/10 text-yellow-700 dark:text-yellow-400"
    : "border-border bg-surface-2 text-muted-foreground";
  return (
    <div className={`rounded-md border p-2 text-center ${cls}`}>
      <div className="text-lg font-bold tabular-nums">{value}</div>
      <div className="text-[10px] uppercase tracking-wider">{label}</div>
    </div>
  );
}

function Sparkline({ data }: { data: { d: string; c: number }[] }) {
  const days: { d: Date; c: number }[] = [];
  for (let i = 29; i >= 0; i--) {
    const dt = new Date(); dt.setDate(dt.getDate() - i); dt.setHours(0, 0, 0, 0);
    const k = dt.toISOString().slice(0, 10);
    const found = data.find((x) => x.d.slice(0, 10) === k);
    days.push({ d: dt, c: found?.c ?? 0 });
  }
  const max = Math.max(1, ...days.map((d) => d.c));
  const total = days.reduce((s, d) => s + d.c, 0);
  return (
    <div className="rounded-md border border-border bg-surface p-3">
      <div className="mb-2 flex items-center justify-between text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        <span>Signups · last 30 days</span>
        <span>{total} total</span>
      </div>
      <div className="flex h-12 items-end gap-0.5">
        {days.map((d, i) => (
          <div key={i} title={`${d.d.toLocaleDateString()} · ${d.c}`}
            className="flex-1 rounded-t bg-primary/30 transition-colors hover:bg-primary"
            style={{ height: `${(d.c / max) * 100}%`, minHeight: d.c > 0 ? 2 : 1 }} />
        ))}
      </div>
    </div>
  );
}