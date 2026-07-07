import { useCallback, useEffect, useRef, useState } from "react";
import { useFormStore } from "@/store/useFormStore";
import type { DMNode } from "@/lib/dm/types";
import { supabase } from "@/integrations/supabase/client";
import { shareApplyDone } from "@/lib/dm/shares";
import { useAuth } from "@/hooks/useAuth";

const PREFIX = "dm:done:";

/**
 * Stable per-node key for "done" state. Uses the node's path so identically-named
 * fields in different groups/screens are tracked independently.
 */
export function doneKey(node: Pick<DMNode, "path" | "identifier">): string {
  return node.path && node.path.length ? node.path.join("/") : node.identifier;
}

function read(key: string): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

/* Shared in-memory cache so every useDoneFields() consumer stays in sync. */
const cache = new Map<string, Record<string, boolean>>();
const listeners = new Map<string, Set<(v: Record<string, boolean>) => void>>();

function getCached(key: string): Record<string, boolean> {
  let m = cache.get(key);
  if (!m) { m = read(key); cache.set(key, m); }
  return m;
}

function setCached(key: string, next: Record<string, boolean>) {
  cache.set(key, next);
  try { localStorage.setItem(key, JSON.stringify(next)); } catch { /* ignore */ }
  const subs = listeners.get(key);
  if (subs) for (const fn of subs) fn(next);
}

function subscribe(key: string, fn: (v: Record<string, boolean>) => void) {
  let subs = listeners.get(key);
  if (!subs) { subs = new Set(); listeners.set(key, subs); }
  subs.add(fn);
  return () => { subs!.delete(fn); };
}

/* Cloud sync (form_files_done). Mirrors useReviewFields. */
const saveTimers = new Map<string, number>();
function persistCloud(fileName: string, key: string, next: Record<string, boolean>) {
  const existing = saveTimers.get(key);
  if (existing) window.clearTimeout(existing);
  const t = window.setTimeout(async () => {
    try {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;
      await supabase.from("form_files_done").upsert(
        {
          user_id: u.user.id,
          file_name: fileName,
          done_map: next as never,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,file_name" },
      );
    } catch { /* ignore */ }
  }, 600);
  saveTimers.set(key, t);
}

/**
 * Per-file "done" state, keyed by field identifier.
 * Persisted to localStorage immediately and synced to Lovable Cloud
 * (form_files_done) so checks survive across devices / browsers.
 */
export function useDoneFields() {
  const fileName = useFormStore((s) => s.fileName);
  const sharedView = useFormStore((s) => s.sharedView);
  const refreshSharedBundle = useFormStore((s) => s.refreshSharedBundle);
  const { user } = useAuth();
  const isShareEditor = !!sharedView && sharedView.bundle.share.permission === "editor" && !!user;
  const key = fileName ? `${PREFIX}${fileName}` : null;
  const [done, setDone] = useState<Record<string, boolean>>(() => (key ? getCached(key) : {}));
  const hydratedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!key) { setDone({}); return; }
    setDone(getCached(key));
    const unsub = subscribe(key, (v) => setDone(v));
    if (fileName && hydratedRef.current !== key) {
      hydratedRef.current = key;
      (async () => {
        try {
          const { data: u } = await supabase.auth.getUser();
          if (!u.user) return;
          const { data } = await supabase
            .from("form_files_done")
            .select("done_map")
            .eq("user_id", u.user.id)
            .eq("file_name", fileName)
            .maybeSingle();
          const remote = (data?.done_map ?? null) as Record<string, boolean> | null;
          if (remote && typeof remote === "object") {
            // Merge so anything checked locally before hydration isn't lost.
            const local = getCached(key);
            const merged: Record<string, boolean> = { ...local };
            for (const [k, v] of Object.entries(remote)) if (v) merged[k] = true;
            const changed =
              Object.keys(merged).length !== Object.keys(local).length ||
              Object.keys(merged).some((k) => !local[k]);
            if (changed) setCached(key, merged);
          } else {
            // No cloud row yet → seed from local so existing checks become baseline.
            const local = getCached(key);
            if (Object.keys(local).length) persistCloud(fileName, key, local);
          }
        } catch { /* ignore */ }
      })();
    }
    return unsub;
  }, [key, fileName]);

  const toggle = useCallback(
    (identifier: string, value?: boolean) => {
      if (!key || !fileName) return;
      const prev = getCached(key);
      const v = value ?? !prev[identifier];
      const next = { ...prev };
      if (v) next[identifier] = true;
      else delete next[identifier];
      setCached(key, next);
      persistCloud(fileName, key, next);
    },
    [key, fileName],
  );

  const clear = useCallback(() => {
    if (!key || !fileName) return;
    setCached(key, {});
    persistCloud(fileName, key, {});
  }, [key, fileName]);

  const replace = useCallback(
    (next: Record<string, boolean>) => {
      const clean: Record<string, boolean> = {};
      for (const [k, v] of Object.entries(next || {})) if (v) clean[k] = true;
      if (!key || !fileName) return;
      setCached(key, clean);
      persistCloud(fileName, key, clean);
    },
    [key, fileName],
  );

  // In a shared view, surface the author's checked map read-only so recipients
  // see the same checks the author had when they shared.
  if (sharedView && !isShareEditor) {
    const sDone = (sharedView.bundle.done_map ?? {}) as Record<string, boolean>;
    const noop = () => { /* read-only */ };
    return {
      done: sDone,
      toggle: noop as unknown as typeof toggle,
      clear: noop as unknown as typeof clear,
      replace: noop as unknown as typeof replace,
      isDone: (id: string) => !!sDone[id],
    };
  }

  // Signed-in editor on a share: route writes through RPC back to the author's record.
  if (isShareEditor && sharedView) {
    const sDone = (sharedView.bundle.done_map ?? {}) as Record<string, boolean>;
    const editToggle = (identifier: string, value?: boolean) => {
      const v = value ?? !sDone[identifier];
      shareApplyDone(sharedView.token, identifier, v)
        .then(() => refreshSharedBundle?.())
        .catch(() => { /* ignore */ });
    };
    const editClear = () => { /* not exposed in share editor */ };
    const editReplace = () => { /* not exposed in share editor */ };
    return {
      done: sDone,
      toggle: editToggle as unknown as typeof toggle,
      clear: editClear as unknown as typeof clear,
      replace: editReplace as unknown as typeof replace,
      isDone: (id: string) => !!sDone[id],
    };
  }
  return { done, toggle, clear, replace, isDone: (id: string) => !!done[id] };
}
