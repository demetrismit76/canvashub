import { type AuditRow } from "@/lib/dm/admin";

const ACTION_LABELS: Record<string, string> = {
  "role.granted": "Granted role",
  "role.revoked": "Revoked role",
  "profile.status_changed": "Status changed",
  "team.created": "Team created",
  "team.renamed": "Team renamed",
  "team.deleted": "Team deleted",
  "team.member_added": "Added to team",
  "team.member_removed": "Removed from team",
  "team.member_role_changed": "Team role changed",
  "share.created": "Share created",
  "share.revoked": "Share revoked",
  "file_status.changed": "File status changed",
  "invite.bulk": "Bulk invite",
};

export function AuditTimeline({ rows }: { rows: AuditRow[] }) {
  if (rows.length === 0) {
    return <div className="p-4 text-center text-xs text-muted-foreground">No activity yet.</div>;
  }
  return (
    <div className="divide-y divide-border">
      {rows.map((r) => (
        <div key={r.id} className="flex items-start justify-between gap-2 px-3 py-2 text-xs">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="font-medium text-foreground">{ACTION_LABELS[r.action] ?? r.action}</span>
              <span className="rounded bg-surface-2 px-1 py-px text-[9px] uppercase tracking-wider text-muted-foreground">{r.target_type}</span>
            </div>
            <div className="mt-0.5 truncate text-[10px] text-muted-foreground">
              {r.target_id && <span className="mr-2 font-mono">{r.target_id.slice(0, 8)}</span>}
              {formatMeta(r.meta)}
            </div>
          </div>
          <div className="shrink-0 text-[10px] text-muted-foreground">
            {new Date(r.created_at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
          </div>
        </div>
      ))}
    </div>
  );
}

function formatMeta(meta: Record<string, unknown>): string {
  if (!meta || Object.keys(meta).length === 0) return "";
  return Object.entries(meta)
    .filter(([, v]) => v !== null && v !== undefined && v !== "")
    .map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : String(v)}`)
    .join(" · ");
}