import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Loader2, Plus, Search, Shield, ShieldCheck, Trash2, UserPlus, Users, Crown, Pencil, Check, X, Download, BarChart2, Share2, FileText, Activity, Settings as SettingsIcon, Eye, FileArchive } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";
import { findProfileByEmail } from "@/lib/dm/shares";
import {
  addTeamMember, createTeam, deleteTeam, grantRole, listAllProfiles, listMyTeams,
  listTeamMembers, removeTeamMember, renameTeam, revokeRole, setAccountStatus, setMemberRole,
  type AccountStatus, type AppRole, type ProfileRow, type TeamMember, type TeamMemberRole, type TeamRow,
} from "@/lib/dm/admin";
import { cn } from "@/lib/utils";
import { OverviewTab } from "@/components/admin/OverviewTab";
import { SharesTab } from "@/components/admin/SharesTab";
import { AuditTab } from "@/components/admin/AuditTab";
import { FilesStatusTab } from "@/components/admin/FilesStatusTab";
import { SettingsTab } from "@/components/admin/SettingsTab";
import { ImpersonateTab } from "@/components/admin/ImpersonateTab";
import { BackupTab } from "@/components/admin/BackupTab";
import { InviteBulkDialog } from "@/components/admin/InviteBulkDialog";

export default function Admin() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { isAdmin, isOwner, loading: roleLoading } = useUserRole();

  if (authLoading || roleLoading) {
    return <Center><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></Center>;
  }
  if (!user) {
    return (
      <Center>
        <div className="text-sm text-muted-foreground">Please sign in.</div>
        <Button size="sm" className="mt-3" onClick={() => navigate("/auth")}>Sign in</Button>
      </Center>
    );
  }
  if (!isAdmin) {
    return (
      <Center>
        <div className="text-sm text-muted-foreground">You don't have permission to view this page.</div>
        <Button size="sm" variant="ghost" className="mt-3" onClick={() => navigate("/")}>← Back</Button>
      </Center>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="flex items-center justify-between border-b border-border bg-surface px-4 py-2">
        <div className="flex items-center gap-2">
          <Button size="sm" variant="ghost" className="h-7" onClick={() => navigate("/")}>
            <ArrowLeft className="mr-1 h-3.5 w-3.5" /> Back
          </Button>
          <Shield className="h-4 w-4 text-primary" />
          <h1 className="text-sm font-semibold">Admin</h1>
          {isOwner && (
            <span className="inline-flex items-center gap-1 rounded bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary">
              <Crown className="h-3 w-3" /> Owner
            </span>
          )}
        </div>
      </header>
      <main className="mx-auto max-w-5xl p-4">
        <Tabs defaultValue="overview">
          <TabsList className="flex flex-wrap">
            <TabsTrigger value="overview"><BarChart2 className="mr-1.5 h-3.5 w-3.5" />Overview</TabsTrigger>
            <TabsTrigger value="users"><Users className="mr-1.5 h-3.5 w-3.5" />Users</TabsTrigger>
            <TabsTrigger value="teams"><ShieldCheck className="mr-1.5 h-3.5 w-3.5" />Teams</TabsTrigger>
            <TabsTrigger value="shares"><Share2 className="mr-1.5 h-3.5 w-3.5" />Shares</TabsTrigger>
            <TabsTrigger value="files"><FileText className="mr-1.5 h-3.5 w-3.5" />Files</TabsTrigger>
            <TabsTrigger value="audit"><Activity className="mr-1.5 h-3.5 w-3.5" />Audit</TabsTrigger>
            <TabsTrigger value="settings"><SettingsIcon className="mr-1.5 h-3.5 w-3.5" />Settings</TabsTrigger>
            <TabsTrigger value="backup"><FileArchive className="mr-1.5 h-3.5 w-3.5" />Backup</TabsTrigger>
            <TabsTrigger value="impersonate"><Eye className="mr-1.5 h-3.5 w-3.5" />View-as</TabsTrigger>
          </TabsList>
          <TabsContent value="overview" className="mt-4"><OverviewTab /></TabsContent>
          <TabsContent value="users" className="mt-4"><UsersTab isOwner={isOwner} /></TabsContent>
          <TabsContent value="teams" className="mt-4"><TeamsTab isAdmin={isAdmin} /></TabsContent>
          <TabsContent value="shares" className="mt-4"><SharesTab /></TabsContent>
          <TabsContent value="files" className="mt-4"><FilesStatusTab /></TabsContent>
          <TabsContent value="audit" className="mt-4"><AuditTab /></TabsContent>
          <TabsContent value="settings" className="mt-4"><SettingsTab isOwner={isOwner} /></TabsContent>
          <TabsContent value="backup" className="mt-4"><BackupTab /></TabsContent>
          <TabsContent value="impersonate" className="mt-4"><ImpersonateTab /></TabsContent>
        </Tabs>
      </main>
    </div>
  );
}

function Center({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-screen flex-col items-center justify-center p-4">{children}</div>;
}

/* ----------------------------------------------------------- */
/* Users tab                                                   */
/* ----------------------------------------------------------- */

function UsersTab({ isOwner }: { isOwner: boolean }) {
  const [rows, setRows] = useState<ProfileRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | AccountStatus>("all");

  const refresh = async () => {
    setLoading(true);
    try {
      const r = await listAllProfiles();
      setRows(r);
    } catch (e) { toast.error((e as Error).message); }
    finally { setLoading(false); }
  };

  useEffect(() => { refresh(); }, []);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (!s) return true;
      return (r.email ?? "").toLowerCase().includes(s) || (r.display_name ?? "").toLowerCase().includes(s);
    });
  }, [rows, q, statusFilter]);

  const exportCsv = () => {
    const header = ["email", "display_name", "status", "roles", "created_at"];
    const lines = [header.join(",")];
    for (const r of filtered) {
      lines.push([
        csv(r.email ?? ""),
        csv(r.display_name ?? ""),
        r.status,
        csv(r.roles.join("|")),
        r.created_at,
      ].join(","));
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `users-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const pendingCount = rows.filter((r) => r.status === "pending").length;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name or email…" className="h-8 pl-7 text-sm" />
        </div>
        <div className="flex items-center gap-1 rounded-md border border-border bg-surface-2 p-0.5">
          {(["all", "pending", "active", "suspended"] as const).map((s) => (
            <button key={s} onClick={() => setStatusFilter(s)}
              className={cn(
                "rounded px-2 py-1 text-[10px] font-semibold uppercase tracking-wider transition-colors",
                statusFilter === s ? "bg-surface text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              )}>
              {s}{s === "pending" && pendingCount > 0 ? ` (${pendingCount})` : ""}
            </button>
          ))}
        </div>
        <InviteBulkDialog onDone={refresh} />
        <Button size="sm" variant="outline" className="h-8 text-xs" onClick={exportCsv}>
          <Download className="mr-1 h-3.5 w-3.5" />CSV
        </Button>
        <div className="text-xs text-muted-foreground">{filtered.length} of {rows.length}</div>
      </div>

      {loading ? (
        <div className="flex h-24 items-center justify-center text-xs text-muted-foreground">
          <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> Loading users…
        </div>
      ) : (
        <div className="overflow-hidden rounded-md border border-border">
          <table className="w-full text-xs">
            <thead className="bg-surface-2 text-[10px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left">User</th>
                <th className="px-3 py-2 text-left">Status</th>
                <th className="px-3 py-2 text-left">Roles</th>
                <th className="px-3 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((r) => (
                <UserRow key={r.user_id} row={r} onChanged={refresh} isOwner={isOwner} />
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={4} className="px-3 py-6 text-center text-muted-foreground">No matches</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function csv(s: string): string {
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function UserRow({ row, onChanged, isOwner }: { row: ProfileRow; onChanged: () => Promise<void>; isOwner: boolean }) {
  const [busy, setBusy] = useState(false);
  const rolesSet = new Set(row.roles);

  const toggleRole = async (role: AppRole) => {
    setBusy(true);
    try {
      if (rolesSet.has(role)) await revokeRole(row.user_id, role);
      else await grantRole(row.user_id, role);
      await onChanged();
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
  };

  const changeStatus = async (s: AccountStatus) => {
    setBusy(true);
    try {
      await setAccountStatus(row.user_id, s);
      await onChanged();
      toast.success(`Status updated`);
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
  };

  return (
    <tr className="hover:bg-surface-2/40">
      <td className="px-3 py-2">
        <div className="font-medium text-foreground">{row.display_name || "—"}</div>
        <div className="text-[11px] text-muted-foreground">{row.email}</div>
      </td>
      <td className="px-3 py-2">
        <Select value={row.status} onValueChange={(v) => changeStatus(v as AccountStatus)} disabled={busy}>
          <SelectTrigger className="h-7 w-28 text-[11px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="suspended">Suspended</SelectItem>
          </SelectContent>
        </Select>
      </td>
      <td className="px-3 py-2">
        <div className="flex flex-wrap gap-1">
          {(["user","admin","owner"] as AppRole[]).map((r) => {
            const on = rolesSet.has(r);
            const lockedForNonOwner = r === "owner" && !isOwner;
            return (
              <button
                key={r}
                disabled={busy || lockedForNonOwner}
                onClick={() => toggleRole(r)}
                title={lockedForNonOwner ? "Only an Owner can manage the Owner role" : ""}
                className={cn(
                  "rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider transition-colors disabled:opacity-50",
                  on
                    ? r === "owner"
                      ? "border-primary/40 bg-primary/15 text-primary"
                      : r === "admin"
                        ? "border-destructive/30 bg-destructive/10 text-destructive"
                        : "border-border bg-surface-2 text-foreground"
                    : "border-dashed border-border text-muted-foreground hover:text-foreground",
                )}
              >
                {r === "owner" && <Crown className="mr-0.5 inline h-2.5 w-2.5" />}
                {r}
              </button>
            );
          })}
        </div>
      </td>
      <td className="px-3 py-2 text-right text-[10px] text-muted-foreground">
        {new Date(row.created_at).toLocaleDateString()}
      </td>
    </tr>
  );
}

/* ----------------------------------------------------------- */
/* Teams tab                                                   */
/* ----------------------------------------------------------- */

function TeamsTab({ isAdmin: _isAdmin }: { isAdmin: boolean }) {
  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [selected, setSelected] = useState<string | null>(null);

  const refresh = async () => {
    setLoading(true);
    try {
      const r = await listMyTeams();
      setTeams(r);
      if (selected && !r.find((t) => t.id === selected)) setSelected(null);
    } catch (e) { toast.error((e as Error).message); }
    finally { setLoading(false); }
  };

  useEffect(() => { refresh(); }, []);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    try {
      const t = await createTeam(newName);
      setNewName("");
      await refresh();
      setSelected(t.id);
      toast.success(`Team "${t.name}" created`);
    } catch (e) { toast.error((e as Error).message); }
  };

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-[280px,1fr]">
      <div className="space-y-2">
        <div className="flex items-center gap-1.5">
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleCreate()}
            placeholder="New team name…"
            className="h-8 text-sm"
          />
          <Button size="sm" className="h-8" onClick={handleCreate}><Plus className="h-3.5 w-3.5" /></Button>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 p-3 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" />Loading…</div>
        ) : teams.length === 0 ? (
          <div className="rounded-md border border-dashed border-border p-4 text-center text-xs text-muted-foreground">No teams yet.</div>
        ) : (
          <div className="overflow-hidden rounded-md border border-border">
            {teams.map((t) => (
              <button
                key={t.id}
                onClick={() => setSelected(t.id)}
                className={cn(
                  "flex w-full items-center justify-between border-b border-border px-3 py-2 text-left text-xs last:border-b-0 transition-colors",
                  selected === t.id ? "bg-primary/10 text-primary" : "hover:bg-surface-2",
                )}
              >
                <span className="truncate font-medium">{t.name}</span>
                <Users className="h-3 w-3 opacity-60" />
              </button>
            ))}
          </div>
        )}
      </div>

      <div>
        {selected ? (
          <TeamDetail teamId={selected} team={teams.find((t) => t.id === selected)!} onChanged={refresh} />
        ) : (
          <div className="flex h-full min-h-[200px] items-center justify-center rounded-md border border-dashed border-border text-xs text-muted-foreground">
            Select a team to manage members.
          </div>
        )}
      </div>
    </div>
  );
}

function TeamDetail({ teamId, team, onChanged }: { teamId: string; team: TeamRow; onChanged: () => Promise<void> }) {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [profilesByUser, setProfilesByUser] = useState<Record<string, { display_name: string | null; email: string | null }>>({});
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(team.name);
  const [inviteEmail, setInviteEmail] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => { setName(team.name); setEditing(false); }, [team.id, team.name]);

  const refresh = async () => {
    setLoading(true);
    try {
      const m = await listTeamMembers(teamId);
      setMembers(m);
      // Fetch display info for members from profiles (RLS: admin/owner & team members can SELECT profiles? No — only admin)
      // Use list_all_profiles if accessible; otherwise fall back to user IDs.
      try {
        const all = await listAllProfiles();
        const map: typeof profilesByUser = {};
        for (const p of all) map[p.user_id] = { display_name: p.display_name, email: p.email };
        setProfilesByUser(map);
      } catch {
        setProfilesByUser({});
      }
    } catch (e) { toast.error((e as Error).message); }
    finally { setLoading(false); }
  };

  useEffect(() => { refresh(); }, [teamId]);

  const saveName = async () => {
    setBusy(true);
    try {
      await renameTeam(teamId, name);
      await onChanged();
      setEditing(false);
      toast.success("Renamed");
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
  };

  const handleDelete = async () => {
    if (!confirm(`Delete team "${team.name}"? This cannot be undone.`)) return;
    setBusy(true);
    try {
      await deleteTeam(teamId);
      await onChanged();
      toast.success("Team deleted");
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
  };

  const handleInvite = async () => {
    if (!inviteEmail.trim()) return;
    setBusy(true);
    try {
      const profile = await findProfileByEmail(inviteEmail.trim());
      if (!profile) {
        toast.error("No active user with that email");
        return;
      }
      await addTeamMember(teamId, profile.user_id);
      setInviteEmail("");
      await refresh();
      toast.success(`Added ${profile.display_name || profile.email}`);
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
  };

  const handleRoleChange = async (user_id: string, role: TeamMemberRole) => {
    try {
      await setMemberRole(teamId, user_id, role);
      await refresh();
    } catch (e) { toast.error((e as Error).message); }
  };

  const handleRemove = async (user_id: string) => {
    if (!confirm("Remove this member?")) return;
    try {
      await removeTeamMember(teamId, user_id);
      await refresh();
    } catch (e) { toast.error((e as Error).message); }
  };

  return (
    <div className="space-y-3 rounded-md border border-border bg-surface p-3">
      <div className="flex items-center justify-between gap-2">
        {editing ? (
          <div className="flex items-center gap-1.5">
            <Input value={name} onChange={(e) => setName(e.target.value)} className="h-7 text-sm" />
            <Button size="sm" className="h-7 px-2" onClick={saveName} disabled={busy}><Check className="h-3 w-3" /></Button>
            <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => { setEditing(false); setName(team.name); }}><X className="h-3 w-3" /></Button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <h3 className="text-base font-semibold">{team.name}</h3>
            <Button size="sm" variant="ghost" className="h-6 px-1.5" onClick={() => setEditing(true)}><Pencil className="h-3 w-3" /></Button>
          </div>
        )}
        <Button size="sm" variant="ghost" className="h-7 text-destructive hover:text-destructive" onClick={handleDelete} disabled={busy}>
          <Trash2 className="mr-1 h-3.5 w-3.5" /> Delete team
        </Button>
      </div>

      <div className="flex items-center gap-1.5 rounded-md border border-border bg-surface-2/40 p-2">
        <UserPlus className="h-3.5 w-3.5 text-muted-foreground" />
        <Input
          value={inviteEmail}
          onChange={(e) => setInviteEmail(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleInvite()}
          placeholder="Add member by email…"
          className="h-7 text-xs"
        />
        <Button size="sm" className="h-7" onClick={handleInvite} disabled={busy}>Add</Button>
      </div>

      {loading ? (
        <div className="flex h-16 items-center justify-center text-xs text-muted-foreground"><Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />Loading…</div>
      ) : (
        <div className="overflow-hidden rounded-md border border-border">
          <table className="w-full text-xs">
            <thead className="bg-surface-2 text-[10px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-3 py-1.5 text-left">Member</th>
                <th className="px-3 py-1.5 text-left">Role</th>
                <th className="px-3 py-1.5"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {members.map((m) => {
                const p = profilesByUser[m.user_id];
                return (
                  <tr key={m.id} className="hover:bg-surface-2/40">
                    <td className="px-3 py-2">
                      <div className="font-medium">{p?.display_name || p?.email || m.user_id.slice(0, 8)}</div>
                      {p?.email && <div className="text-[10px] text-muted-foreground">{p.email}</div>}
                    </td>
                    <td className="px-3 py-2">
                      <Select value={m.role} onValueChange={(v) => handleRoleChange(m.user_id, v as TeamMemberRole)}>
                        <SelectTrigger className="h-7 w-28 text-[11px]"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="member">Member</SelectItem>
                          <SelectItem value="owner">Owner</SelectItem>
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Button size="sm" variant="ghost" className="h-6 px-1.5 text-destructive hover:text-destructive" onClick={() => handleRemove(m.user_id)}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </td>
                  </tr>
                );
              })}
              {members.length === 0 && (
                <tr><td colSpan={3} className="px-3 py-4 text-center text-muted-foreground">No members yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}