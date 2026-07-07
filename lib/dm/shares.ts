import { supabase } from "@/integrations/supabase/client";
import type { DMSchema } from "@/lib/dm/types";
import type { ReviewMap } from "@/hooks/useReviewFields";

/* ------------------------------------------------------------------ */
/* Types                                                              */
/* ------------------------------------------------------------------ */

export type ShareRow = {
  id: string;
  token: string;
  author_user_id: string;
  recipient_user_id: string | null;
  recipient_email: string | null;
  file_name: string;
  form_schema: unknown; // raw DM JSON
  revisions: number[];
  public_link_enabled: boolean;
  permission: "viewer" | "editor";
  expires_at: string | null;
  revoked_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ShareResponse = {
  id: string;
  share_id: string;
  responder_user_id: string | null;
  responder_label: string;
  revision: number;
  entry_key: string;
  resolved: boolean;
  comment: string;
  created_at: string;
  updated_at: string;
};

export type ShareBundle = {
  share: ShareRow;
  author: { display_name: string | null; email: string | null };
  /** keyed by revision number (as string) → author's ReviewMap for that round */
  review_maps: Record<string, ReviewMap>;
  /** author's "checked" map for this file (not revisioned) */
  done_map?: Record<string, boolean>;
  responses: ShareResponse[];
};

export type ProfileLookup = { user_id: string; display_name: string | null; email: string | null };

/* ------------------------------------------------------------------ */
/* Helpers                                                            */
/* ------------------------------------------------------------------ */

const ANON_SESSION_KEY = "dm:share:session";
export function getAnonSessionId(): string {
  try {
    let s = localStorage.getItem(ANON_SESSION_KEY);
    if (!s) {
      s = crypto.randomUUID();
      localStorage.setItem(ANON_SESSION_KEY, s);
    }
    return s;
  } catch {
    return "anon-" + Math.random().toString(36).slice(2);
  }
}

const ANON_LABEL_KEY = "dm:share:label";
export function getAnonLabel(): string {
  try { return localStorage.getItem(ANON_LABEL_KEY) || ""; } catch { return ""; }
}
export function setAnonLabel(v: string) {
  try { localStorage.setItem(ANON_LABEL_KEY, v); } catch { /* ignore */ }
}

/** Canonical public host where shared links should live (the published app). */
const PUBLIC_SHARE_ORIGIN = "https://devicecanvas.lovable.app";

export function buildShareUrl(token: string): string {
  return `${PUBLIC_SHARE_ORIGIN}/s/${token}`;
}

/* ------------------------------------------------------------------ */
/* API                                                                */
/* ------------------------------------------------------------------ */

export async function findProfileByEmail(email: string): Promise<ProfileLookup | null> {
  const { data, error } = await supabase.rpc("find_profile_by_email", { p_email: email });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : null;
  return row ?? null;
}

export async function createShare(input: {
  fileName: string;
  formSchema: unknown;
  revisions: number[];
  recipientUserId?: string | null;
  recipientEmail?: string | null;
  publicLinkEnabled?: boolean;
  permission?: "viewer" | "editor";
  expiresAt?: string | null;
}): Promise<ShareRow> {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) throw new Error("Sign in to share");
  const { data, error } = await supabase
    .from("review_shares")
    .insert({
      author_user_id: u.user.id,
      recipient_user_id: input.recipientUserId ?? null,
      recipient_email: input.recipientEmail ?? null,
      file_name: input.fileName,
      form_schema: input.formSchema as never,
      revisions: input.revisions.length ? input.revisions : [1],
      public_link_enabled: !!input.publicLinkEnabled,
      permission: input.permission ?? "viewer",
      expires_at: input.expiresAt ?? null,
    })
    .select("*")
    .single();
  if (error) throw error;
  return data as ShareRow;
}

export async function updateShare(id: string, patch: Partial<{
  revisions: number[];
  public_link_enabled: boolean;
  permission: "viewer" | "editor";
  expires_at: string | null;
  revoked_at: string | null;
}>): Promise<void> {
  const { error } = await supabase.from("review_shares").update(patch).eq("id", id);
  if (error) throw error;
}

export async function revokeShare(id: string): Promise<void> {
  await updateShare(id, { revoked_at: new Date().toISOString() });
}

export async function deleteShareRow(id: string): Promise<void> {
  const { error } = await supabase.from("review_shares").delete().eq("id", id);
  if (error) throw error;
}

export async function listSharesByMe(): Promise<ShareRow[]> {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return [];
  const { data, error } = await supabase
    .from("review_shares")
    .select("*")
    .eq("author_user_id", u.user.id)
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return (data || []) as ShareRow[];
}

export type IncomingShare = {
  id: string; token: string; file_name: string; revisions: number[];
  author_display_name: string | null; author_email: string | null;
  created_at: string; updated_at: string; expires_at: string | null;
};

export async function listIncomingShares(): Promise<IncomingShare[]> {
  const { data, error } = await supabase.rpc("list_shares_received");
  if (error) throw error;
  return (data || []) as IncomingShare[];
}

export async function getShareByToken(token: string): Promise<ShareBundle | { error: string } | null> {
  const { data, error } = await supabase.rpc("get_review_share_by_token", { p_token: token });
  if (error) throw error;
  if (!data) return null;
  if (typeof data === "object" && data !== null && "error" in (data as object)) {
    return data as { error: string };
  }
  return data as unknown as ShareBundle;
}

export async function upsertShareResponse(input: {
  token: string;
  revision: number;
  entryKey: string;
  resolved: boolean;
  comment: string;
  label: string;
  sessionId?: string | null;
}): Promise<void> {
  const { error } = await supabase.rpc("upsert_review_share_response", {
    p_token: input.token,
    p_session_id: input.sessionId ?? null,
    p_label: input.label,
    p_revision: input.revision,
    p_entry_key: input.entryKey,
    p_resolved: input.resolved,
    p_comment: input.comment,
  });
  if (error) throw error;
}

/* ------------------------------------------------------------------ */
/* Editor RPCs (signed-in recipients writing back to the author)      */
/* ------------------------------------------------------------------ */

export async function shareApplyDone(token: string, identifier: string, value: boolean): Promise<void> {
  const { error } = await supabase.rpc("share_apply_done", {
    p_token: token, p_identifier: identifier, p_value: value,
  });
  if (error) throw error;
}

export async function shareApplyReview(
  token: string, revision: number, entryKey: string, entry: unknown | null,
): Promise<void> {
  const { error } = await supabase.rpc("share_apply_review", {
    p_token: token, p_revision: revision, p_entry_key: entryKey, p_entry: entry as never,
  });
  if (error) throw error;
}

export async function shareSetProjectNote(token: string, revision: number, comment: string): Promise<void> {
  const { error } = await supabase.rpc("share_set_project_note", {
    p_token: token, p_revision: revision, p_comment: comment,
  });
  if (error) throw error;
}

export async function shareAddRevision(token: string): Promise<number> {
  const { data, error } = await supabase.rpc("share_add_revision", { p_token: token });
  if (error) throw error;
  return data as number;
}

/* ------------------------------------------------------------------ */
/* Convenience: bundle the current schema for sharing                 */
/* ------------------------------------------------------------------ */

/** Strip cached UI state we don't need to ship — keep the raw DM JSON only. */
export function packSchemaForShare(rawJson: unknown, _schema: DMSchema | null): unknown {
  return rawJson;
}