import { supabase } from "@/integrations/supabase/client";

export type AppRole = "admin" | "user" | "owner";
export type AccountStatus = "pending" | "active" | "suspended";
export type FileStatus = "open" | "closed" | "reopened" | "archived";

export type ProfileRow = {
  user_id: string;
  display_name: string | null;
  email: string | null;
  status: AccountStatus;
  created_at: string;
  roles: AppRole[];
};

export async function listAllProfiles(): Promise<ProfileRow[]> {
  const { data, error } = await supabase.rpc("list_all_profiles" as never);
  if (error) throw error;
  return (data ?? []) as ProfileRow[];
}

export async function grantRole(user_id: string, role: AppRole): Promise<void> {
  const { error } = await supabase
    .from("user_roles")
    .insert({ user_id, role } as never);
  if (error && !error.message.includes("duplicate")) throw error;
}

export async function revokeRole(user_id: string, role: AppRole): Promise<void> {
  const { error } = await supabase
    .from("user_roles")
    .delete()
    .eq("user_id", user_id)
    .eq("role", role);
  if (error) throw error;
}

export async function setAccountStatus(user_id: string, status: AccountStatus): Promise<void> {
  const { error } = await supabase
    .from("profiles")
    .update({ status } as never)
    .eq("user_id", user_id);
  if (error) throw error;
}

/* ---------------- Teams ---------------- */

export type TeamRow = {
  id: string;
  name: string;
  created_by: string;
  created_at: string;
  updated_at: string;
};

export type TeamMemberRole = "owner" | "member";

export type TeamMember = {
  id: string;
  team_id: string;
  user_id: string;
  role: TeamMemberRole;
  created_at: string;
};

export type TeamRecipient = {
  user_id: string;
  display_name: string | null;
  email: string | null;
  role: TeamMemberRole;
};

export async function listMyTeams(): Promise<TeamRow[]> {
  const { data, error } = await supabase
    .from("teams")
    .select("*")
    .order("name", { ascending: true });
  if (error) throw error;
  return (data ?? []) as TeamRow[];
}

export async function createTeam(name: string): Promise<TeamRow> {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) throw new Error("Sign in required");
  const { data, error } = await supabase
    .from("teams")
    .insert({ name: name.trim(), created_by: u.user.id } as never)
    .select("*")
    .single();
  if (error) throw error;
  return data as TeamRow;
}

export async function renameTeam(id: string, name: string): Promise<void> {
  const { error } = await supabase
    .from("teams")
    .update({ name: name.trim() } as never)
    .eq("id", id);
  if (error) throw error;
}

export async function deleteTeam(id: string): Promise<void> {
  const { error } = await supabase.from("teams").delete().eq("id", id);
  if (error) throw error;
}

export async function listTeamMembers(team_id: string): Promise<TeamMember[]> {
  const { data, error } = await supabase
    .from("team_members")
    .select("*")
    .eq("team_id", team_id);
  if (error) throw error;
  return (data ?? []) as TeamMember[];
}

export async function listTeamRecipients(team_id: string): Promise<TeamRecipient[]> {
  const { data, error } = await supabase.rpc("list_team_recipients" as never, { p_team_id: team_id } as never);
  if (error) throw error;
  return (data ?? []) as TeamRecipient[];
}

export async function addTeamMember(team_id: string, user_id: string, role: TeamMemberRole = "member"): Promise<void> {
  const { error } = await supabase
    .from("team_members")
    .insert({ team_id, user_id, role } as never);
  if (error && !error.message.includes("duplicate")) throw error;
}

export async function setMemberRole(team_id: string, user_id: string, role: TeamMemberRole): Promise<void> {
  const { error } = await supabase
    .from("team_members")
    .update({ role } as never)
    .eq("team_id", team_id)
    .eq("user_id", user_id);
  if (error) throw error;
}

export async function removeTeamMember(team_id: string, user_id: string): Promise<void> {
  const { error } = await supabase
    .from("team_members")
    .delete()
    .eq("team_id", team_id)
    .eq("user_id", user_id);
  if (error) throw error;
}

/* ---------------- Dashboard / Stats ---------------- */

export type DashboardStats = {
  users_total: number; users_active: number; users_pending: number; users_suspended: number;
  shares_active: number; shares_revoked: number; shares_total: number;
  files_reviewed: number; files_total: number; teams_total: number;
  files_open: number; files_closed: number; files_reopened: number; files_archived: number;
  signups_30d: { d: string; c: number }[];
};

export async function adminDashboardStats(): Promise<DashboardStats> {
  const { data, error } = await supabase.rpc("admin_dashboard_stats" as never);
  if (error) throw error;
  return data as DashboardStats;
}

/* ---------------- Shares oversight ---------------- */

export type AdminShareRow = {
  id: string; token: string; file_name: string; revisions: number[];
  author_user_id: string; author_email: string | null; author_name: string | null;
  recipient_user_id: string | null; recipient_email: string | null; recipient_name: string | null;
  public_link_enabled: boolean;
  created_at: string; updated_at: string;
  revoked_at: string | null; expires_at: string | null;
  response_count: number;
};

export async function adminListShares(search = ""): Promise<AdminShareRow[]> {
  const { data, error } = await supabase.rpc("admin_list_shares" as never, { p_search: search } as never);
  if (error) throw error;
  return (data ?? []) as AdminShareRow[];
}

export async function adminRevokeShare(id: string): Promise<void> {
  const { error } = await supabase.rpc("admin_revoke_share" as never, { p_share_id: id } as never);
  if (error) throw error;
}

/* ---------------- Bulk invite ---------------- */

export async function adminBulkInvite(emails: string[], team_id?: string | null): Promise<{ added: number; skipped: number }> {
  const { data, error } = await supabase.rpc("admin_bulk_invite" as never, {
    p_emails: emails, p_team_id: team_id ?? null,
  } as never);
  if (error) throw error;
  return data as { added: number; skipped: number };
}

export type PendingInvite = {
  id: string; email: string;
  team_id: string | null; team_name: string | null;
  invited_by: string | null; invited_by_email: string | null;
  created_at: string;
};

export async function adminListPendingInvites(): Promise<PendingInvite[]> {
  const { data, error } = await supabase.rpc("admin_list_pending_invites" as never);
  if (error) throw error;
  return (data ?? []) as PendingInvite[];
}

export async function adminCancelInvite(id: string): Promise<void> {
  const { error } = await supabase.from("pending_invites").delete().eq("id", id);
  if (error) throw error;
}

/* ---------------- File status ---------------- */

export type FileStatusRow = {
  id: string; user_id: string; owner_email: string | null; owner_name: string | null;
  file_name: string; status: FileStatus; note: string;
  closed_at: string | null; reopened_at: string | null;
  created_at: string; updated_at: string;
};

export async function adminListFileStatuses(status: FileStatus | "" = "", search = ""): Promise<FileStatusRow[]> {
  const { data, error } = await supabase.rpc("admin_list_file_statuses" as never, {
    p_status: status || null, p_search: search || null,
  } as never);
  if (error) throw error;
  return (data ?? []) as FileStatusRow[];
}

export async function setFileStatus(file_name: string, status: FileStatus, note = ""): Promise<string> {
  const { data, error } = await supabase.rpc("set_file_status" as never, {
    p_file_name: file_name, p_status: status, p_note: note,
  } as never);
  if (error) throw error;
  return data as string;
}

export async function getMyFileStatus(file_name: string): Promise<FileStatusRow | null> {
  const { data, error } = await supabase
    .from("file_statuses")
    .select("*")
    .eq("file_name", file_name)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const row = data as Record<string, unknown>;
  return { ...row, owner_email: null, owner_name: null } as FileStatusRow;
}

/* ---------------- Audit log ---------------- */

export type AuditRow = {
  id: string; actor_user_id: string | null;
  action: string; target_type: string; target_id: string | null;
  meta: Record<string, unknown>; created_at: string;
};

export async function listAuditLog(opts: { action?: string; target_type?: string; limit?: number } = {}): Promise<AuditRow[]> {
  let q = supabase.from("audit_log").select("*").order("created_at", { ascending: false }).limit(opts.limit ?? 100);
  if (opts.action) q = q.eq("action", opts.action);
  if (opts.target_type) q = q.eq("target_type", opts.target_type);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as AuditRow[];
}

/* ---------------- Org settings ---------------- */

export type OrgSettings = {
  id: number;
  allow_team_creation_by_non_admins: boolean;
  allow_public_links: boolean;
  default_team_id: string | null;
  light_theme: string;
  zebra_rows: boolean;
  allowed_views: string[];
  default_view: string;
  ui_font: string;
  updated_at: string;
};

export async function getOrgSettings(): Promise<OrgSettings> {
  const { data, error } = await supabase.from("org_settings").select("*").eq("id", 1).single();
  if (error) throw error;
  return data as OrgSettings;
}

export async function updateOrgSettings(patch: Partial<Omit<OrgSettings, "id" | "updated_at">>): Promise<void> {
  const { error } = await supabase.from("org_settings").update(patch as never).eq("id", 1);
  if (error) throw error;
}

/* ---------------- Impersonation snapshot ---------------- */

export type ImpersonationSnapshot = {
  profile: ProfileRow | null;
  roles: AppRole[];
  files: { file_name: string; updated_at: string; last_opened_at: string }[];
  shares_sent: Record<string, unknown>[];
  shares_received: Record<string, unknown>[];
  teams: { team_id: string; role: TeamMemberRole; name: string }[];
  statuses: FileStatusRow[];
};

export async function adminImpersonationSnapshot(user_id: string): Promise<ImpersonationSnapshot> {
  const { data, error } = await supabase.rpc("admin_impersonation_snapshot" as never, { p_user_id: user_id } as never);
  if (error) throw error;
  return data as ImpersonationSnapshot;
}