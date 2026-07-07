import { create } from "zustand";
import { parseDeviceMagic } from "@/lib/dm/parser";
import { placeholderPath } from "@/lib/dm/parser";
import { DMSchema } from "@/lib/dm/types";
import { toast } from "sonner";
import { clearAdminPass, getAdminPass, setAdminPass } from "@/lib/dm/adminApi";
import { saveFile as saveHistoryFile, setFileDisplayName, getFileDisplayName } from "@/lib/dm/history";
import { supabase } from "@/integrations/supabase/client";
import type { ShareBundle } from "@/lib/dm/shares";

export type ViewMode = "grid" | "preview" | "structure" | "gocanvas" | "graph" | "flow" | "magic";
export type ThemeMode = "light" | "dark";
export type CopyField = "title" | "identifier" | "path";

type Filters = {
  query: string;
  kinds: Set<string>;
  onlyConditional: boolean;
  onlyRequired: boolean;
  onlyLoops: boolean;
  onlyFlagged: boolean;
};

type State = {
  schema: DMSchema | null;
  fileName: string | null;
  displayName: string | null;
  selectedId: string | null;
  expanded: Record<string, boolean>;
  view: ViewMode;
  theme: ThemeMode;
  filters: Filters;
  autoCopy: boolean;
  copyField: CopyField;
  loadJSON: (json: unknown, fileName: string) => void;
  loadFromHistory: (fileName: string, json: unknown) => void;
  renameDisplay: (newName: string | null) => Promise<void>;
  applyDisplayName: (fileName: string, displayName: string | null) => void;
  reset: () => void;
  select: (id: string | null) => void;
  toggleExpand: (id: string) => void;
  expandAll: () => void;
  collapseAll: () => void;
  setView: (v: ViewMode) => void;
  applyRemoteView: (v: ViewMode) => void;
  setTheme: (t: ThemeMode) => void;
  setFilter: <K extends keyof Filters>(k: K, v: Filters[K]) => void;
  toggleKind: (kind: string) => void;
  clearFilters: () => void;
  setAutoCopy: (v: boolean) => void;
  setCopyField: (v: CopyField) => void;
  reviewMode: boolean;
  setReviewMode: (v: boolean) => void;
  reviewRevision: number;
  setReviewRevision: (n: number) => void;
  reviewOpenPulse: number;
  pulseReviewOpen: () => void;
  adminUnlocked: boolean;
  pushEnabled: boolean;
  unlockAdmin: (passphrase: string) => void;
  unlockAdminAsRole: () => void;
  lockAdmin: () => void;
  setPushEnabled: (v: boolean) => void;
  collapseOnStartup: boolean;
  setCollapseOnStartup: (v: boolean) => void;
  wrapVisibility: boolean;
  setWrapVisibility: (v: boolean) => void;
  wrapIdentifier: boolean;
  setWrapIdentifier: (v: boolean) => void;
  autoSidebar: boolean;
  setAutoSidebar: (v: boolean) => void;
  zebraRows: boolean;
  setZebraRows: (v: boolean) => void;
  allowedViews: ViewMode[];
  defaultView: ViewMode;
  setAllowedViews: (v: ViewMode[]) => void;
  setDefaultView: (v: ViewMode) => void;
  sharedView: SharedView | null;
  enterSharedView: (v: SharedView) => void;
  exitSharedView: () => void;
  refreshSharedBundle: () => Promise<void>;
};

export type SharedView = {
  token: string;
  bundle: ShareBundle;
};

const defaultFilters: Filters = {
  query: "",
  kinds: new Set(),
  onlyConditional: false,
  onlyRequired: false,
  onlyLoops: false,
  onlyFlagged: false,
};

export const useFormStore = create<State>((set, get) => ({
  schema: null,
  fileName: null,
  displayName: null,
  selectedId: null,
  expanded: {},
  view: ((): ViewMode => {
    const v = localStorage.getItem("dm.view");
    return v === "grid" || v === "preview" || v === "structure" || v === "gocanvas" || v === "graph" || v === "flow" || v === "magic" ? v : "magic";
  })(),
  theme: ((): ThemeMode => {
    try {
      const t = localStorage.getItem("dm.theme");
      if (t === "dark" || t === "light") {
        if (typeof document !== "undefined") document.documentElement.classList.toggle("dark", t === "dark");
        return t;
      }
    } catch {}
    return "light";
  })(),
  filters: defaultFilters,
  autoCopy: false,
  copyField: "title",
  reviewMode: localStorage.getItem("dm.reviewMode") === "1",
  reviewRevision: 1,
  reviewOpenPulse: 0,
  pulseReviewOpen: () => set((s) => ({ reviewOpenPulse: s.reviewOpenPulse + 1 })),
  adminUnlocked: !!getAdminPass(),
  pushEnabled: localStorage.getItem("gc.pushEnabled") === "1",
  collapseOnStartup: localStorage.getItem("dm.collapseOnStartup") !== "0",
  wrapVisibility: localStorage.getItem("dm.wrapVisibility") !== "0",
  wrapIdentifier: localStorage.getItem("dm.wrapIdentifier") === "1",
  autoSidebar: localStorage.getItem("dm.autoSidebar") !== "0",
  zebraRows: localStorage.getItem("dm.zebraRows") !== "0",
  allowedViews: ["grid","preview","structure","gocanvas","graph","flow","magic"],
  defaultView: "magic",
  sharedView: null,
  loadJSON: (json, fileName) => {
    const schema = parseDeviceMagic(json);
    const collapseOnStartup = get().collapseOnStartup;
    const expanded: Record<string, boolean> = { [schema.rootId]: true };
    if (!collapseOnStartup) {
      for (const cid of schema.nodes[schema.rootId].childrenIds) {
        if (schema.nodes[cid].isGroup) expanded[cid] = true;
      }
    }
    set({ schema, fileName, displayName: null, selectedId: null, expanded });
    // Restore last active revision for this file
    try {
      const raw = localStorage.getItem(`dm:review:active:${fileName}`);
      const n = raw ? Math.max(1, parseInt(raw, 10) || 1) : 1;
      set({ reviewRevision: n });
    } catch {
      set({ reviewRevision: 1 });
    }
    // Persist to cloud history when signed in (fire-and-forget)
    saveHistoryFile(fileName, json).catch(() => { /* ignore — anon users */ });
    // Hydrate the saved display_name (if any) — fire-and-forget.
    getFileDisplayName(fileName)
      .then((d) => {
        // Only apply if user hasn't moved on to a different file.
        if (get().fileName === fileName) set({ displayName: d });
      })
      .catch(() => { /* ignore */ });
  },
  loadFromHistory: (fileName, json) => {
    get().loadJSON(json, fileName);
  },
  renameDisplay: async (newName) => {
    const fn = get().fileName;
    if (!fn) return;
    const prev = get().displayName;
    const trimmed = newName?.trim() || null;
    // Optimistic update
    set({ displayName: trimmed });
    try {
      const saved = await setFileDisplayName(fn, trimmed);
      // setFileDisplayName already trims — keep in sync.
      if (get().fileName === fn) set({ displayName: saved });
    } catch (e) {
      // Roll back on error
      if (get().fileName === fn) set({ displayName: prev });
      throw e;
    }
  },
  applyDisplayName: (fileName, displayName) => {
    if (get().fileName === fileName) set({ displayName });
  },
  reset: () => set({ schema: null, fileName: null, displayName: null, selectedId: null, expanded: {} }),
  select: (id) => {
    set({ selectedId: id });
    const { autoCopy, copyField, schema } = get();
    if (!autoCopy || !id || !schema) return;
    const n = schema.nodes[id];
    if (!n) return;
    const value =
      copyField === "identifier" ? n.identifier :
      copyField === "path" ? placeholderPath(n.path) :
      n.title;
    if (!value) return;
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(value).then(
        () => toast.success(`Copied ${copyField}`, { description: value, duration: 1500 }),
        () => toast.error("Copy failed"),
      );
    }
  },
  toggleExpand: (id) => set((s) => ({ expanded: { ...s.expanded, [id]: !s.expanded[id] } })),
  expandAll: () => {
    const s = get().schema;
    if (!s) return;
    const e: Record<string, boolean> = {};
    for (const id of s.order) if (s.nodes[id].isGroup || s.nodes[id].kind === "root") e[id] = true;
    set({ expanded: e });
  },
  collapseAll: () => {
    const s = get().schema;
    if (!s) return;
    set({ expanded: { [s.rootId]: true } });
  },
  setView: (view) => {
    try { localStorage.setItem("dm.view", view); } catch {}
    set({ view });
    // Persist per-user preference (best-effort; ignored when signed out)
    void (async () => {
      try {
        const { data: u } = await supabase.auth.getUser();
        if (!u.user) return;
        await supabase.from("profiles").update({ preferred_view: view }).eq("user_id", u.user.id);
      } catch { /* ignore */ }
    })();
  },
  applyRemoteView: (view) => {
    try { localStorage.setItem("dm.view", view); } catch {}
    set({ view });
  },
  setTheme: (theme) => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    try { localStorage.setItem("dm.theme", theme); } catch {}
    set({ theme });
  },
  setFilter: (k, v) => set((s) => ({ filters: { ...s.filters, [k]: v } })),
  toggleKind: (kind) =>
    set((s) => {
      const next = new Set(s.filters.kinds);
      next.has(kind) ? next.delete(kind) : next.add(kind);
      return { filters: { ...s.filters, kinds: next } };
    }),
  clearFilters: () => set({ filters: { ...defaultFilters, kinds: new Set() } }),
  setAutoCopy: (v) => set({ autoCopy: v }),
  setCopyField: (v) => set({ copyField: v }),
  setReviewMode: (v) => {
    try { localStorage.setItem("dm.reviewMode", v ? "1" : "0"); } catch {}
    set({ reviewMode: v });
  },
  setReviewRevision: (n) => {
    const rev = Math.max(1, Math.floor(n));
    const fn = get().fileName;
    if (fn) {
      try { localStorage.setItem(`dm:review:active:${fn}`, String(rev)); } catch {}
    }
    set({ reviewRevision: rev });
  },
  unlockAdmin: (passphrase) => {
    setAdminPass(passphrase);
    set({ adminUnlocked: true });
  },
  // Used when the signed-in user has the 'admin' role — no passphrase needed.
  // Edge functions accept the user's JWT and verify role server-side.
  unlockAdminAsRole: () => set({ adminUnlocked: true }),
  lockAdmin: () => {
    clearAdminPass();
    set({ adminUnlocked: false });
  },
  setPushEnabled: (v) => {
    localStorage.setItem("gc.pushEnabled", v ? "1" : "0");
    set({ pushEnabled: v });
  },
  setCollapseOnStartup: (v) => {
    localStorage.setItem("dm.collapseOnStartup", v ? "1" : "0");
    set({ collapseOnStartup: v });
  },
  setWrapVisibility: (v) => {
    localStorage.setItem("dm.wrapVisibility", v ? "1" : "0");
    set({ wrapVisibility: v });
  },
  setWrapIdentifier: (v) => {
    localStorage.setItem("dm.wrapIdentifier", v ? "1" : "0");
    set({ wrapIdentifier: v });
  },
  setAutoSidebar: (v) => {
    localStorage.setItem("dm.autoSidebar", v ? "1" : "0");
    set({ autoSidebar: v });
  },
  setZebraRows: (v) => {
    try { localStorage.setItem("dm.zebraRows", v ? "1" : "0"); } catch { /* ignore */ }
    set({ zebraRows: v });
  },
  setAllowedViews: (v) => {
    set({ allowedViews: v });
    // If the current view isn't allowed, fall back to default (if allowed) or first allowed.
    const cur = get().view;
    if (!v.includes(cur)) {
      const def = get().defaultView;
      const next = v.includes(def) ? def : v[0];
      if (next) {
        try { localStorage.setItem("dm.view", next); } catch {}
        set({ view: next });
      }
    }
  },
  setDefaultView: (v) => set({ defaultView: v }),
  enterSharedView: (v) => {
    // Parse the bundled schema and load it like a normal file so all views work.
    const schema = parseDeviceMagic(v.bundle.share.form_schema);
    const expanded: Record<string, boolean> = { [schema.rootId]: true };
    for (const cid of schema.nodes[schema.rootId].childrenIds) {
      if (schema.nodes[cid].isGroup) expanded[cid] = true;
    }
    // Default to the first shared revision
    const firstRev = v.bundle.share.revisions[0] ?? 1;
    set({
      sharedView: v,
      schema,
      fileName: v.bundle.share.file_name,
      displayName: null,
      selectedId: null,
      expanded,
      reviewMode: true,
      reviewRevision: firstRev,
    });
  },
  exitSharedView: () => set({ sharedView: null, schema: null, fileName: null, displayName: null, selectedId: null, expanded: {} }),
  refreshSharedBundle: async () => {
    const cur = get().sharedView;
    if (!cur) return;
    try {
      const { getShareByToken } = await import("@/lib/dm/shares");
      const res = await getShareByToken(cur.token);
      if (res && typeof res === "object" && !("error" in res)) {
        set({ sharedView: { token: cur.token, bundle: res } });
      }
    } catch { /* ignore */ }
  },
}));