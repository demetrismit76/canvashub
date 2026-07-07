import { useEffect, useMemo, useState } from "react";
import { Eye, Loader2, Search, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { listAllProfiles, adminImpersonationSnapshot, type ProfileRow, type ImpersonationSnapshot } from "@/lib/dm/admin";
import { cn } from "@/lib/utils";

export function ImpersonateTab() {
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [snap, setSnap] = useState<ImpersonationSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingSnap, setLoadingSnap] = useState(false);

  useEffect(() => {
    listAllProfiles().then(setProfiles).catch((e) => toast.error((e as Error).message)).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!selected) { setSnap(null); return; }
    setLoadingSnap(true);
    adminImpersonationSnapshot(selected)
      .then(setSnap)
      .catch((e) => toast.error((e as Error).message))
      .finally(() => setLoadingSnap(false));
  }, [selected]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return profiles;
    return profiles.filter((p) => (p.email ?? "").toLowerCase().includes(s) || (p.display_name ?? "").toLowerCase().includes(s));
  }, [profiles, q]);

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-[280px,1fr]">
      <div className="space-y-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search users…" className="h-8 pl-7 text-xs" />
        </div>
        {loading ? (
          <div className="flex h-20 items-center justify-center text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" /></div>
        ) : (
          <div className="max-h-[60vh] overflow-y-auto rounded-md border border-border">
            {filtered.map((p) => (
              <button key={p.user_id}
                onClick={() => setSelected(p.user_id)}
                className={cn(
                  "block w-full border-b border-border px-3 py-2 text-left text-xs last:border-b-0 transition-colors",
                  selected === p.user_id ? "bg-primary/10 text-primary" : "hover:bg-surface-2"
                )}>
                <div className="truncate font-medium">{p.display_name || p.email}</div>
                <div className="truncate text-[10px] text-muted-foreground">{p.email}</div>
              </button>
            ))}
          </div>
        )}
      </div>
      <div>
        {!selected ? (
          <Placeholder text="Pick a user to view a read-only snapshot of their content." />
        ) : loadingSnap || !snap ? (
          <div className="flex h-32 items-center justify-center rounded-md border border-border text-xs text-muted-foreground"><Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />Loading snapshot…</div>
        ) : (
          <Snapshot snap={snap} />
        )}
      </div>
    </div>
  );
}

function Placeholder({ text }: { text: string }) {
  return <div className="flex h-32 items-center justify-center rounded-md border border-dashed border-border text-xs text-muted-foreground">{text}</div>;
}

function Snapshot({ snap }: { snap: ImpersonationSnapshot }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 rounded-md border border-yellow-500/40 bg-yellow-500/10 px-3 py-1.5 text-[11px] text-yellow-700 dark:text-yellow-400">
        <ShieldAlert className="h-3.5 w-3.5" /> Read-only view-as. Actions are disabled. Viewing this snapshot is recorded.
      </div>
      <div className="rounded-md border border-border bg-surface p-3">
        <div className="text-xs font-semibold text-foreground">{snap.profile?.display_name || snap.profile?.email}</div>
        <div className="text-[11px] text-muted-foreground">{snap.profile?.email} · {snap.profile?.status} · roles: {snap.roles.join(", ") || "—"}</div>
      </div>
      <Section title={`Files (${snap.files.length})`}>
        {snap.files.length === 0 ? <Empty /> : (
          <ul className="divide-y divide-border text-xs">
            {snap.files.map((f) => (
              <li key={f.file_name} className="flex items-center justify-between px-3 py-1.5">
                <span className="truncate">{f.file_name}</span>
                <span className="text-[10px] text-muted-foreground">{new Date(f.last_opened_at).toLocaleDateString()}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>
      <Section title={`Shares sent (${snap.shares_sent.length})`}>
        {snap.shares_sent.length === 0 ? <Empty /> : (
          <ul className="divide-y divide-border text-xs">
            {snap.shares_sent.map((s, i) => (
              <li key={i} className="flex items-center justify-between px-3 py-1.5">
                <span className="truncate">{String(s.file_name)} → {String(s.recipient_email ?? "public")}</span>
                <span className="text-[10px] text-muted-foreground">{new Date(String(s.created_at)).toLocaleDateString()}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>
      <Section title={`Teams (${snap.teams.length})`}>
        {snap.teams.length === 0 ? <Empty /> : (
          <ul className="divide-y divide-border text-xs">
            {snap.teams.map((t) => (
              <li key={t.team_id} className="flex items-center justify-between px-3 py-1.5">
                <span>{t.name}</span>
                <span className="text-[10px] text-muted-foreground">{t.role}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-md border border-border bg-surface">
      <div className="border-b border-border bg-surface-2 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{title}</div>
      {children}
    </div>
  );
}

function Empty() { return <div className="px-3 py-3 text-center text-[11px] text-muted-foreground">Nothing here.</div>; }

// Suppress unused import lint
export const _eye = Eye;