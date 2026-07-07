import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import { useFormStore } from "@/store/useFormStore";
import { supabase } from "@/integrations/supabase/client";
import { shareApplyReview, shareSetProjectNote } from "@/lib/dm/shares";
import { useAuth } from "@/hooks/useAuth";

export type ReviewReason =
  | "condition"
  | "initial"
  | "identifier"
  | "options"
  | "required"
  | "control_type"
  | "visibility"
  | "other";

export type ReviewEntry = {
  needsEdit: boolean;
  reason?: ReviewReason;
  comment?: string;
  suggested?: string;
};

export type ReviewMap = Record<string, ReviewEntry>;

const PREFIX = "dm:review:";
const PROJECT_KEY = "__project__";
const REVS_PREFIX = "dm:review:revs:";

/** Compose storage / cloud key for a (fileName, revision) pair.
 *  Revision 1 keeps the bare fileName for backward-compat with existing data. */
export function revisionFileName(fileName: string, revision: number): string {
  return revision <= 1 ? fileName : `${fileName}#r${revision}`;
}

export function listRevisions(fileName: string | null): number[] {
  if (!fileName) return [1];
  try {
    const raw = localStorage.getItem(`${REVS_PREFIX}${fileName}`);
    if (raw) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr) && arr.length) {
        const cleaned = Array.from(new Set(arr.map((n) => Math.max(1, parseInt(String(n), 10) || 1))))
          .sort((a, b) => a - b);
        if (!cleaned.includes(1)) cleaned.unshift(1);
        return cleaned;
      }
    }
  } catch { /* ignore */ }
  return [1];
}

function writeRevisions(fileName: string, revisions: number[]) {
  try { localStorage.setItem(`${REVS_PREFIX}${fileName}`, JSON.stringify(revisions)); } catch { /* ignore */ }
}

export function addRevision(fileName: string): number {
  const cur = listRevisions(fileName);
  const next = (cur[cur.length - 1] ?? 1) + 1;
  writeRevisions(fileName, [...cur, next]);
  return next;
}

export function deleteRevision(fileName: string, revision: number) {
  if (revision <= 1) return; // r1 is permanent
  const cur = listRevisions(fileName).filter((n) => n !== revision);
  writeRevisions(fileName, cur);
  try { localStorage.removeItem(`${PREFIX}${revisionFileName(fileName, revision)}`); } catch { /* ignore */ }
}

/** Read the raw localStorage payload for a revision (used for undo snapshots). */
export function readRevisionRaw(fileName: string, revision: number): string | null {
  try {
    return localStorage.getItem(`${PREFIX}${revisionFileName(fileName, revision)}`);
  } catch { return null; }
}

/** Restore a previously-deleted revision: re-adds it to the revisions list
 *  and rewrites its review-map payload from a snapshot. */
export function restoreRevision(fileName: string, revision: number, rawMap: string | null) {
  if (revision <= 1) return;
  const cur = listRevisions(fileName);
  if (!cur.includes(revision)) {
    const next = [...cur, revision].sort((a, b) => a - b);
    writeRevisions(fileName, next);
  }
  const key = `${PREFIX}${revisionFileName(fileName, revision)}`;
  try {
    if (rawMap) localStorage.setItem(key, rawMap);
  } catch { /* ignore */ }
  // Refresh shared cache so any active subscribers see restored data.
  try {
    const parsed = rawMap ? (JSON.parse(rawMap) as ReviewMap) : {};
    setCached(key, parsed && typeof parsed === "object" ? parsed : {});
  } catch { /* ignore */ }
}

/** Count flagged fields, comments and suggested values for a revision —
 *  used to show users exactly what they'd lose when deleting. */
export function getRevisionStats(fileName: string, revision: number): {
  flagged: number; comments: number; suggested: number; projectNote: boolean;
} {
  const raw = readRevisionRaw(fileName, revision);
  if (!raw) return { flagged: 0, comments: 0, suggested: 0, projectNote: false };
  try {
    const map = JSON.parse(raw) as ReviewMap;
    let flagged = 0, comments = 0, suggested = 0;
    let projectNote = false;
    for (const [k, e] of Object.entries(map)) {
      if (k === PROJECT_KEY) { projectNote = !!e?.comment?.trim(); continue; }
      if (e?.needsEdit) flagged++;
      if (e?.comment?.trim()) comments++;
      if (e?.suggested?.trim()) suggested++;
    }
    return { flagged, comments, suggested, projectNote };
  } catch { return { flagged: 0, comments: 0, suggested: 0, projectNote: false }; }
}

/** Read project-level notes for every known revision of a file (local cache). */
export function readAllProjectNotes(fileName: string | null): { revision: number; comment: string }[] {
  if (!fileName) return [];
  const out: { revision: number; comment: string }[] = [];
  for (const n of listRevisions(fileName)) {
    const key = `${PREFIX}${revisionFileName(fileName, n)}`;
    const m = readLocal(key);
    const c = m[PROJECT_KEY]?.comment?.trim() ?? "";
    if (c) out.push({ revision: n, comment: c });
  }
  return out;
}

function readLocal(key: string): ReviewMap {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as ReviewMap) : {};
  } catch {
    return {};
  }
}

function writeLocal(key: string, map: ReviewMap) {
  try {
    localStorage.setItem(key, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}

function isEmptyEntry(e: ReviewEntry | undefined): boolean {
  if (!e) return true;
  return !e.needsEdit && !e.reason && !e.comment && !e.suggested;
}

/* ------------------------------------------------------------------ */
/* Shared in-memory cache so every useReviewFields() instance stays in */
/* sync across the app (TopBar count, tree badges, inspector toggle).  */
/* ------------------------------------------------------------------ */
const cache = new Map<string, ReviewMap>();
const listeners = new Map<string, Set<() => void>>();

function getCached(key: string): ReviewMap {
  let m = cache.get(key);
  if (!m) {
    m = readLocal(key);
    cache.set(key, m);
  }
  return m;
}

function setCached(key: string, next: ReviewMap) {
  cache.set(key, next);
  writeLocal(key, next);
  const subs = listeners.get(key);
  if (subs) for (const fn of subs) fn();
}

function subscribe(key: string, fn: () => void) {
  let subs = listeners.get(key);
  if (!subs) { subs = new Set(); listeners.set(key, subs); }
  subs.add(fn);
  return () => { subs!.delete(fn); };
}

/**
 * Per-file review-map state.
 * - Persisted to localStorage immediately.
 * - Persisted to Lovable Cloud (form_files_review) debounced when signed in.
 * - Backed by a shared in-memory cache, so all consumers stay in sync.
 */
export function useReviewFields() {
  const fileName = useFormStore((s) => s.fileName);
  const revision = useFormStore((s) => s.reviewRevision);
  const sharedView = useFormStore((s) => s.sharedView);
  const refreshSharedBundle = useFormStore((s) => s.refreshSharedBundle);
  const { user } = useAuth();
  const isShareEditor = !!sharedView && sharedView.bundle.share.permission === "editor" && !!user;

  // Shared mode: always read from the bundle. Writes go through RPCs when editor + signed in.
  const inSharedMode = !!sharedView;
  const composite = !inSharedMode && fileName ? revisionFileName(fileName, revision) : null;
  const key = composite ? `${PREFIX}${composite}` : null;

  // Subscribe to the shared cache for the current key (or a sentinel when no file).
  const subKey = key ?? "__none__";
  const map = useSyncExternalStore(
    useCallback((cb) => subscribe(subKey, cb), [subKey]),
    useCallback(() => (key ? getCached(key) : EMPTY_MAP), [key, subKey]),
    () => EMPTY_MAP,
  );
  const saveTimer = useRef<number | null>(null);

  // Reload from local + cloud whenever the file or revision changes.
  useEffect(() => {
    if (!key || !composite) {
      return;
    }
    // Ensure cache is primed from localStorage and subscribers re-render.
    setCached(key, readLocal(key));
    (async () => {
      try {
        const { data: u } = await supabase.auth.getUser();
        if (!u.user) return;
        const { data } = await supabase
          .from("form_files_review")
          .select("review_map")
          .eq("user_id", u.user.id)
          .eq("file_name", composite)
          .maybeSingle();
        if (data?.review_map && typeof data.review_map === "object") {
          const remote = data.review_map as ReviewMap;
          setCached(key, remote);
        }
      } catch {
        /* ignore — anon users */
      }
    })();
  }, [key, composite]);

  const persistCloud = useCallback(
    (next: ReviewMap) => {
      if (!composite) return;
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
      saveTimer.current = window.setTimeout(async () => {
        try {
          const { data: u } = await supabase.auth.getUser();
          if (!u.user) return;
          await supabase.from("form_files_review").upsert(
            {
              user_id: u.user.id,
              file_name: composite,
              review_map: next as never,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "user_id,file_name" },
          );
        } catch {
          /* ignore */
        }
      }, 600);
    },
    [composite],
  );

  const setEntry = useCallback(
    (k: string, partial: Partial<ReviewEntry>) => {
      if (!key) return;
      const prev = getCached(key);
      const merged: ReviewEntry = { needsEdit: false, ...(prev[k] ?? {}), ...partial };
      const next = { ...prev };
      if (isEmptyEntry(merged)) delete next[k];
      else next[k] = merged;
      setCached(key, next);
      persistCloud(next);
    },
    [key, persistCloud],
  );

  const toggleNeedsEdit = useCallback(
    (k: string, value?: boolean) => {
      if (!key) return;
      const prev = getCached(key);
      const cur = prev[k];
      const v = value ?? !(cur?.needsEdit);
      const merged: ReviewEntry = { ...(cur ?? {}), needsEdit: v };
      const next = { ...prev };
      if (isEmptyEntry(merged)) delete next[k];
      else next[k] = merged;
      setCached(key, next);
      persistCloud(next);
    },
    [key, persistCloud],
  );

  const clearEntry = useCallback(
    (k: string) => {
      if (!key) return;
      const prev = getCached(key);
      if (!prev[k]) return;
      const next = { ...prev };
      delete next[k];
      setCached(key, next);
      persistCloud(next);
    },
    [key, persistCloud],
  );

  const flaggedCount = Object.values(map).filter((e) => e?.needsEdit).length;

  const projectComment = map[PROJECT_KEY]?.comment ?? "";
  const setProjectComment = useCallback(
    (value: string) => {
      if (!key) return;
      const prev = getCached(key);
      const next = { ...prev };
      if (!value) delete next[PROJECT_KEY];
      else next[PROJECT_KEY] = { needsEdit: false, comment: value };
      setCached(key, next);
      persistCloud(next);
    },
    [key, persistCloud],
  );

  if (inSharedMode && sharedView) {
    const sm = (sharedView.bundle.review_maps?.[String(revision)] ?? EMPTY_MAP) as ReviewMap;
    const sFlagged = Object.entries(sm).filter(([k, e]) => k !== PROJECT_KEY && e?.needsEdit).length;
    const sProject = sm[PROJECT_KEY]?.comment ?? "";
    if (!isShareEditor) {
      const noop = () => { /* read-only in shared viewer mode */ };
      return {
        map: sm,
        setEntry: noop as unknown as typeof setEntry,
        toggleNeedsEdit: noop as unknown as typeof toggleNeedsEdit,
        clearEntry: noop as unknown as typeof clearEntry,
        flaggedCount: sFlagged,
        projectComment: sProject,
        setProjectComment: noop as unknown as typeof setProjectComment,
        revision,
      };
    }
    // Signed-in editor: route writes back to the author's record via RPC.
    const eSetEntry = (k: string, partial: Partial<ReviewEntry>) => {
      const prev = sm[k];
      const merged: ReviewEntry = { needsEdit: false, ...(prev ?? {}), ...partial };
      const next = isEmptyEntry(merged) ? null : merged;
      shareApplyReview(sharedView.token, revision, k, next)
        .then(() => refreshSharedBundle?.())
        .catch(() => { /* ignore */ });
    };
    const eToggle = (k: string, value?: boolean) => {
      const cur = sm[k];
      const v = value ?? !cur?.needsEdit;
      const merged: ReviewEntry = { ...(cur ?? {}), needsEdit: v };
      const next = isEmptyEntry(merged) ? null : merged;
      shareApplyReview(sharedView.token, revision, k, next)
        .then(() => refreshSharedBundle?.())
        .catch(() => { /* ignore */ });
    };
    const eClear = (k: string) => {
      shareApplyReview(sharedView.token, revision, k, null)
        .then(() => refreshSharedBundle?.())
        .catch(() => { /* ignore */ });
    };
    const eSetProject = (value: string) => {
      shareSetProjectNote(sharedView.token, revision, value)
        .then(() => refreshSharedBundle?.())
        .catch(() => { /* ignore */ });
    };
    return {
      map: sm,
      setEntry: eSetEntry as unknown as typeof setEntry,
      toggleNeedsEdit: eToggle as unknown as typeof toggleNeedsEdit,
      clearEntry: eClear as unknown as typeof clearEntry,
      flaggedCount: sFlagged,
      projectComment: sProject,
      setProjectComment: eSetProject as unknown as typeof setProjectComment,
      revision,
    };
  }
  return { map, setEntry, toggleNeedsEdit, clearEntry, flaggedCount, projectComment, setProjectComment, revision };
}

const EMPTY_MAP: ReviewMap = Object.freeze({}) as ReviewMap;