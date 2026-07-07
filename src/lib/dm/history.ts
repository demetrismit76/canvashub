import { supabase } from "@/integrations/supabase/client";

export type RecentFile = {
  file_name: string;
  last_opened_at: string;
  archived_at?: string | null;
  display_name?: string | null;
};

export async function saveFile(fileName: string, json: unknown) {
  const { data: u } = await supabase.auth.getUser();
  const userId = u.user?.id;
  if (!userId) return;
  await supabase.from("form_files").upsert(
    {
      user_id: userId,
      file_name: fileName,
      schema_json: json as never,
      last_opened_at: new Date().toISOString(),
    },
    { onConflict: "user_id,file_name" },
  );
}

export async function touchFile(fileName: string) {
  const { data: u } = await supabase.auth.getUser();
  const userId = u.user?.id;
  if (!userId) return;
  await supabase
    .from("form_files")
    .update({ last_opened_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("file_name", fileName);
}

export async function listRecent(limit = 20): Promise<RecentFile[]> {
  const { data, error } = await supabase
    .from("form_files")
    .select("file_name,last_opened_at,archived_at,display_name")
    .is("archived_at", null)
    .order("last_opened_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

export async function loadFile(fileName: string): Promise<unknown | null> {
  const { data, error } = await supabase
    .from("form_files")
    .select("schema_json")
    .eq("file_name", fileName)
    .maybeSingle();
  if (error) throw error;
  return data?.schema_json ?? null;
}

/** List ALL files (active + archived) for the current user. */
export async function listAllFiles(): Promise<RecentFile[]> {
  const { data, error } = await supabase
    .from("form_files")
    .select("file_name,last_opened_at,archived_at,display_name")
    .order("last_opened_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function listArchived(): Promise<RecentFile[]> {
  const { data, error } = await supabase
    .from("form_files")
    .select("file_name,last_opened_at,archived_at,display_name")
    .not("archived_at", "is", null)
    .order("archived_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function archiveFile(fileName: string) {
  const { data: u } = await supabase.auth.getUser();
  const userId = u.user?.id;
  if (!userId) return;
  await supabase
    .from("form_files")
    .update({ archived_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("file_name", fileName);
}

export async function unarchiveFile(fileName: string) {
  const { data: u } = await supabase.auth.getUser();
  const userId = u.user?.id;
  if (!userId) return;
  await supabase
    .from("form_files")
    .update({ archived_at: null })
    .eq("user_id", userId)
    .eq("file_name", fileName);
}

/**
 * Delete a file and (optionally) its done/review rows.
 * Cascade matches review revisions stored as `<file>#r<N>`.
 */
export async function deleteFile(fileName: string, opts?: { cascade?: boolean }) {
  const { data: u } = await supabase.auth.getUser();
  const userId = u.user?.id;
  if (!userId) return;
  if (opts?.cascade) {
    await supabase.from("form_files_done").delete().eq("user_id", userId).eq("file_name", fileName);
    // review keys: bare name + every `name#r*`
    await supabase.from("form_files_review").delete().eq("user_id", userId).eq("file_name", fileName);
    await supabase.from("form_files_review").delete().eq("user_id", userId).like("file_name", `${fileName}#r%`);
  }
  await supabase.from("form_files").delete().eq("user_id", userId).eq("file_name", fileName);
}

/** Count related rows so the UI can show what cascade-delete would remove. */
export async function getFileRelatedCounts(fileName: string): Promise<{ doneRows: number; reviewRows: number }> {
  const { data: u } = await supabase.auth.getUser();
  const userId = u.user?.id;
  if (!userId) return { doneRows: 0, reviewRows: 0 };
  const d = await supabase
    .from("form_files_done")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("file_name", fileName);
  const r1 = await supabase
    .from("form_files_review")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("file_name", fileName);
  const r2 = await supabase
    .from("form_files_review")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .like("file_name", `${fileName}#r%`);
  return { doneRows: d.count ?? 0, reviewRows: (r1.count ?? 0) + (r2.count ?? 0) };
}

export async function clearHistory() {
  const { data: u } = await supabase.auth.getUser();
  const userId = u.user?.id;
  if (!userId) return;
  await supabase.from("form_files").delete().eq("user_id", userId);
}

/**
 * Set or clear the human-friendly display name for a file.
 * Pass `null` to reset back to the form's built-in title.
 * The underlying file_name (and every linked done/review row) is untouched.
 */
export async function setFileDisplayName(fileName: string, displayName: string | null) {
  const { data: u } = await supabase.auth.getUser();
  const userId = u.user?.id;
  if (!userId) throw new Error("Sign in to rename files");
  const trimmed = displayName?.trim() || null;
  const { error } = await supabase
    .from("form_files")
    .update({ display_name: trimmed })
    .eq("user_id", userId)
    .eq("file_name", fileName);
  if (error) throw error;
  return trimmed;
}

/** Fetch just the display_name for a file (returns null if unset or anon). */
export async function getFileDisplayName(fileName: string): Promise<string | null> {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user?.id) return null;
  const { data, error } = await supabase
    .from("form_files")
    .select("display_name")
    .eq("user_id", u.user.id)
    .eq("file_name", fileName)
    .maybeSingle();
  if (error) return null;
  return (data?.display_name as string | null) ?? null;
}

export async function getMostRecent(): Promise<{ file_name: string; schema_json: unknown } | null> {
  const { data, error } = await supabase
    .from("form_files")
    .select("file_name,schema_json")
    .is("archived_at", null)
    .order("last_opened_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data as { file_name: string; schema_json: unknown } | null;
}