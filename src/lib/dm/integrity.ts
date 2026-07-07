import { supabase } from "@/integrations/supabase/client";

/* -------------------------------------------------------------------------- */
/* Local scanners                                                              */
/* -------------------------------------------------------------------------- */

const DONE_PREFIX = "dm:done:";
const REVIEW_PREFIX = "dm:review:";
const REVS_PREFIX = "dm:review:revs:";
const RECOVERED_FLAG = "dm:done:recovered:v1";
const REVIEW_RECOVERED_FLAG = "dm:review:recovered:v1";

export type LocalDoneEntry = { fileName: string; count: number; map: Record<string, boolean> };

/** Read all `dm:done:<fileName>` localStorage entries. */
export function scanLocalDone(): LocalDoneEntry[] {
  const out: LocalDoneEntry[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith(DONE_PREFIX)) continue;
      const fileName = k.slice(DONE_PREFIX.length);
      if (!fileName || fileName.startsWith("recovered:")) continue;
      const raw = localStorage.getItem(k);
      if (!raw) continue;
      let parsed: Record<string, boolean> = {};
      try {
        const p = JSON.parse(raw);
        if (p && typeof p === "object") {
          for (const [kk, vv] of Object.entries(p as Record<string, unknown>)) {
            if (vv) parsed[kk] = true;
          }
        }
      } catch { continue; }
      out.push({ fileName, count: Object.keys(parsed).length, map: parsed });
    }
  } catch { /* ignore */ }
  return out;
}

export type LocalReviewEntry = {
  /** Composite name as stored (`file` or `file#rN`). */
  composite: string;
  fileName: string;
  revision: number;
  flagged: number;
  comments: number;
  suggested: number;
};

function parseComposite(composite: string): { fileName: string; revision: number } {
  const m = composite.match(/^(.*)#r(\d+)$/);
  if (m) return { fileName: m[1], revision: parseInt(m[2], 10) || 1 };
  return { fileName: composite, revision: 1 };
}

export function scanLocalReview(): LocalReviewEntry[] {
  const out: LocalReviewEntry[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith(REVIEW_PREFIX)) continue;
      if (k.startsWith(REVS_PREFIX)) continue;
      const composite = k.slice(REVIEW_PREFIX.length);
      if (!composite) continue;
      const raw = localStorage.getItem(k);
      if (!raw) continue;
      let flagged = 0, comments = 0, suggested = 0;
      try {
        const p = JSON.parse(raw) as Record<string, { needsEdit?: boolean; comment?: string; suggested?: string }>;
        if (p && typeof p === "object") {
          for (const [kk, e] of Object.entries(p)) {
            if (kk === "__project__") { if (e?.comment?.trim()) comments++; continue; }
            if (e?.needsEdit) flagged++;
            if (e?.comment?.trim()) comments++;
            if (e?.suggested?.trim()) suggested++;
          }
        }
      } catch { continue; }
      const { fileName, revision } = parseComposite(composite);
      out.push({ composite, fileName, revision, flagged, comments, suggested });
    }
  } catch { /* ignore */ }
  return out;
}

export function scanLocalRevisions(): Record<string, number[]> {
  const out: Record<string, number[]> = {};
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith(REVS_PREFIX)) continue;
      const fileName = k.slice(REVS_PREFIX.length);
      const raw = localStorage.getItem(k);
      if (!raw) continue;
      try {
        const arr = JSON.parse(raw);
        if (Array.isArray(arr)) {
          out[fileName] = Array.from(new Set(arr.map((n) => Math.max(1, parseInt(String(n), 10) || 1)))).sort((a, b) => a - b);
        }
      } catch { /* ignore */ }
    }
  } catch { /* ignore */ }
  return out;
}

/* -------------------------------------------------------------------------- */
/* Cloud fetchers (current user only — RLS enforces this server-side)          */
/* -------------------------------------------------------------------------- */

async function currentUserId(): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getUser();
    return data.user?.id ?? null;
  } catch { return null; }
}

export type CloudDoneRow = { fileName: string; count: number; map: Record<string, boolean>; updatedAt: string | null };

export async function fetchCloudDone(): Promise<CloudDoneRow[]> {
  const uid = await currentUserId();
  if (!uid) return [];
  const { data, error } = await supabase
    .from("form_files_done")
    .select("file_name, done_map, updated_at")
    .eq("user_id", uid);
  if (error || !data) return [];
  return data.map((r) => {
    const map: Record<string, boolean> = {};
    const m = r.done_map as Record<string, unknown> | null;
    if (m && typeof m === "object") for (const [k, v] of Object.entries(m)) if (v) map[k] = true;
    return { fileName: r.file_name, count: Object.keys(map).length, map, updatedAt: r.updated_at };
  });
}

export type CloudReviewRow = {
  composite: string;
  fileName: string;
  revision: number;
  flagged: number;
  comments: number;
  suggested: number;
  updatedAt: string | null;
};

export async function fetchCloudReview(): Promise<CloudReviewRow[]> {
  const uid = await currentUserId();
  if (!uid) return [];
  const { data, error } = await supabase
    .from("form_files_review")
    .select("file_name, review_map, updated_at")
    .eq("user_id", uid);
  if (error || !data) return [];
  return data.map((r) => {
    let flagged = 0, comments = 0, suggested = 0;
    const m = r.review_map as Record<string, { needsEdit?: boolean; comment?: string; suggested?: string }> | null;
    if (m && typeof m === "object") {
      for (const [k, e] of Object.entries(m)) {
        if (k === "__project__") { if (e?.comment?.trim()) comments++; continue; }
        if (e?.needsEdit) flagged++;
        if (e?.comment?.trim()) comments++;
        if (e?.suggested?.trim()) suggested++;
      }
    }
    const { fileName, revision } = parseComposite(r.file_name);
    return { composite: r.file_name, fileName, revision, flagged, comments, suggested, updatedAt: r.updated_at };
  });
}

export type CloudFileRow = { fileName: string; updatedAt: string | null; lastOpenedAt: string | null };

export async function fetchCloudFiles(): Promise<CloudFileRow[]> {
  const uid = await currentUserId();
  if (!uid) return [];
  const { data, error } = await supabase
    .from("form_files")
    .select("file_name, updated_at, last_opened_at")
    .eq("user_id", uid);
  if (error || !data) return [];
  return data.map((r) => ({ fileName: r.file_name, updatedAt: r.updated_at, lastOpenedAt: r.last_opened_at }));
}

export type OrgAndRoles = {
  org: {
    allowed_views: string[] | null;
    default_view: string | null;
    ui_font: string | null;
    light_theme: string | null;
    zebra_rows: boolean | null;
  } | null;
  roles: string[];
};

export async function fetchOrgAndRoles(): Promise<OrgAndRoles> {
  const uid = await currentUserId();
  const orgRes = await supabase
    .from("org_settings")
    .select("allowed_views, default_view, ui_font, light_theme, zebra_rows")
    .eq("id", 1)
    .maybeSingle();
  const roles: string[] = [];
  if (uid) {
    const rr = await supabase.from("user_roles").select("role").eq("user_id", uid);
    if (rr.data) for (const r of rr.data) roles.push(String(r.role));
  }
  return { org: (orgRes.data ?? null) as OrgAndRoles["org"], roles };
}

/* -------------------------------------------------------------------------- */
/* Recovery actions                                                            */
/* -------------------------------------------------------------------------- */

export function unionDoneMaps(
  a: Record<string, boolean>,
  b: Record<string, boolean>,
): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const k of Object.keys(a)) if (a[k]) out[k] = true;
  for (const k of Object.keys(b)) if (b[k]) out[k] = true;
  return out;
}

async function upsertCloudDone(fileName: string, map: Record<string, boolean>): Promise<void> {
  const uid = await currentUserId();
  if (!uid) throw new Error("Not signed in");
  const { error } = await supabase.from("form_files_done").upsert(
    {
      user_id: uid,
      file_name: fileName,
      done_map: map as never,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,file_name" },
  );
  if (error) throw new Error(error.message);
}

function writeLocalDone(fileName: string, map: Record<string, boolean>): void {
  try { localStorage.setItem(`${DONE_PREFIX}${fileName}`, JSON.stringify(map)); } catch { /* ignore */ }
}

/** Upload local checks for a file to cloud (union with whatever's already there). */
export async function pushLocalDone(fileName: string): Promise<{ added: number; total: number }> {
  const local = scanLocalDone().find((e) => e.fileName === fileName)?.map ?? {};
  const cloudRow = (await fetchCloudDone()).find((r) => r.fileName === fileName);
  const merged = unionDoneMaps(cloudRow?.map ?? {}, local);
  await upsertCloudDone(fileName, merged);
  return {
    added: Object.keys(merged).length - (cloudRow?.count ?? 0),
    total: Object.keys(merged).length,
  };
}

/** Pull cloud checks for a file into local (union with whatever's already there). */
export async function pullCloudDone(fileName: string): Promise<{ added: number; total: number }> {
  const cloudRow = (await fetchCloudDone()).find((r) => r.fileName === fileName);
  const local = scanLocalDone().find((e) => e.fileName === fileName)?.map ?? {};
  const merged = unionDoneMaps(local, cloudRow?.map ?? {});
  writeLocalDone(fileName, merged);
  return {
    added: Object.keys(merged).length - Object.keys(local).length,
    total: Object.keys(merged).length,
  };
}

export type RecoveredFile = { fileName: string; added: number; total: number };
export type RecoveryResult = {
  filesScanned: number;
  filesUploaded: number;
  checksRecovered: number;
  files: RecoveredFile[];
};

/**
 * One-shot: union every local `dm:done:*` map into cloud. Safe to call repeatedly
 * but gated by a localStorage flag so it only runs once per browser by default.
 */
export async function recoverAllLocalDone(force = false): Promise<RecoveryResult | null> {
  try {
    if (!force && localStorage.getItem(RECOVERED_FLAG)) return null;
  } catch { /* ignore */ }
  const uid = await currentUserId();
  if (!uid) return null;

  const locals = scanLocalDone().filter((e) => e.count > 0);
  if (locals.length === 0) {
    try { localStorage.setItem(RECOVERED_FLAG, String(Date.now())); } catch { /* ignore */ }
    return { filesScanned: 0, filesUploaded: 0, checksRecovered: 0, files: [] };
  }

  const cloud = await fetchCloudDone();
  const cloudByName = new Map(cloud.map((r) => [r.fileName, r]));

  let uploaded = 0;
  let recovered = 0;
  const files: RecoveredFile[] = [];
  for (const l of locals) {
    const c = cloudByName.get(l.fileName);
    const merged = unionDoneMaps(c?.map ?? {}, l.map);
    const cloudCount = c?.count ?? 0;
    const mergedCount = Object.keys(merged).length;
    if (mergedCount === cloudCount) continue;
    try {
      await upsertCloudDone(l.fileName, merged);
      uploaded++;
      const added = mergedCount - cloudCount;
      recovered += added;
      files.push({ fileName: l.fileName, added, total: mergedCount });
    } catch { /* skip on error, retry next session */ }
  }

  try { localStorage.setItem(RECOVERED_FLAG, String(Date.now())); } catch { /* ignore */ }
  return { filesScanned: locals.length, filesUploaded: uploaded, checksRecovered: recovered, files };
}

export function clearRecoveryFlag(): void {
  try { localStorage.removeItem(RECOVERED_FLAG); } catch { /* ignore */ }
  try { localStorage.removeItem(REVIEW_RECOVERED_FLAG); } catch { /* ignore */ }
}

/* -------------------------------------------------------------------------- */
/* Review recovery                                                             */
/* -------------------------------------------------------------------------- */

type RawReviewMap = Record<string, { needsEdit?: boolean; reason?: string; comment?: string; suggested?: string }>;

function readLocalReviewRaw(composite: string): RawReviewMap {
  try {
    const raw = localStorage.getItem(`${REVIEW_PREFIX}${composite}`);
    if (!raw) return {};
    const p = JSON.parse(raw);
    return p && typeof p === "object" ? (p as RawReviewMap) : {};
  } catch { return {}; }
}

function unionReviewMaps(a: RawReviewMap, b: RawReviewMap): RawReviewMap {
  // Merge entry-by-entry; non-empty fields from `b` override `a`.
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  const out: RawReviewMap = {};
  for (const k of keys) {
    const x = a[k] ?? {};
    const y = b[k] ?? {};
    const merged = {
      needsEdit: y.needsEdit ?? x.needsEdit,
      reason: y.reason ?? x.reason,
      comment: (y.comment ?? "").trim() ? y.comment : x.comment,
      suggested: (y.suggested ?? "").trim() ? y.suggested : x.suggested,
    };
    const empty = !merged.needsEdit && !merged.reason && !(merged.comment ?? "").trim() && !(merged.suggested ?? "").trim();
    if (!empty) out[k] = merged;
  }
  return out;
}

async function fetchCloudReviewMap(composite: string): Promise<RawReviewMap | null> {
  const uid = await currentUserId();
  if (!uid) return null;
  const { data } = await supabase
    .from("form_files_review")
    .select("review_map")
    .eq("user_id", uid)
    .eq("file_name", composite)
    .maybeSingle();
  if (!data?.review_map || typeof data.review_map !== "object") return null;
  return data.review_map as RawReviewMap;
}

async function upsertCloudReview(composite: string, map: RawReviewMap): Promise<void> {
  const uid = await currentUserId();
  if (!uid) throw new Error("Not signed in");
  const { error } = await supabase.from("form_files_review").upsert(
    {
      user_id: uid,
      file_name: composite,
      review_map: map as never,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,file_name" },
  );
  if (error) throw new Error(error.message);
}

export type RecoveredRevision = { fileName: string; revision: number; composite: string; added: number; total: number };
export type ReviewRecoveryResult = {
  revisionsScanned: number;
  revisionsUploaded: number;
  entriesRecovered: number;
  revisions: RecoveredRevision[];
};

/**
 * One-shot: union every local `dm:review:*` map into cloud. Mirrors the
 * done-check recovery. Gated by `REVIEW_RECOVERED_FLAG`.
 */
export async function recoverAllLocalReview(force = false): Promise<ReviewRecoveryResult | null> {
  try {
    if (!force && localStorage.getItem(REVIEW_RECOVERED_FLAG)) return null;
  } catch { /* ignore */ }
  const uid = await currentUserId();
  if (!uid) return null;

  const locals = scanLocalReview();
  let uploaded = 0;
  let recovered = 0;
  const revisions: RecoveredRevision[] = [];
  for (const l of locals) {
    const rawLocal = readLocalReviewRaw(l.composite);
    if (Object.keys(rawLocal).length === 0) continue;
    try {
      const rawCloud = (await fetchCloudReviewMap(l.composite)) ?? {};
      const merged = unionReviewMaps(rawCloud, rawLocal);
      const cloudKeyCount = Object.keys(rawCloud).length;
      const mergedKeyCount = Object.keys(merged).length;
      if (mergedKeyCount === cloudKeyCount && cloudKeyCount > 0) continue;
      await upsertCloudReview(l.composite, merged);
      uploaded++;
      const added = Math.max(0, mergedKeyCount - cloudKeyCount);
      recovered += added;
      revisions.push({
        fileName: l.fileName,
        revision: l.revision,
        composite: l.composite,
        added,
        total: mergedKeyCount,
      });
    } catch { /* skip individual failures */ }
  }
  try { localStorage.setItem(REVIEW_RECOVERED_FLAG, String(Date.now())); } catch { /* ignore */ }
  return { revisionsScanned: locals.length, revisionsUploaded: uploaded, entriesRecovered: recovered, revisions };
}