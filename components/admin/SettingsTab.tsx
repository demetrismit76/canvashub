import { useEffect, useState } from "react";
import { Loader2, Crown, Palette, Check, LayoutGrid, Eye, Layers, Send, Network, Workflow, Sparkles, Type } from "lucide-react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getOrgSettings, updateOrgSettings, listMyTeams, type OrgSettings, type TeamRow } from "@/lib/dm/admin";
import {
  LIGHT_THEME_LIST,
  applyLightTheme,
  isLightThemeKey,
  writeCachedLightTheme,
  type LightThemeKey,
} from "@/lib/dm/lightTheme";
import {
  UI_FONT_LIST,
  UI_FONTS,
  applyUiFont,
  isUiFontKey,
  writeCachedUiFont,
  type UiFontKey,
} from "@/lib/dm/fontTheme";
import { useFormStore } from "@/store/useFormStore";
import { cn } from "@/lib/utils";

type ViewKey = "grid" | "magic" | "preview" | "structure" | "gocanvas" | "graph" | "flow";
const VIEW_DEFS: { id: ViewKey; label: string; Icon: typeof LayoutGrid }[] = [
  { id: "magic",     label: "Magic",     Icon: Sparkles },
  { id: "grid",      label: "Grid",      Icon: LayoutGrid },
  { id: "preview",   label: "Preview",   Icon: Eye },
  { id: "structure", label: "Structure", Icon: Layers },
  { id: "gocanvas",  label: "GoCanvas",  Icon: Send },
  { id: "graph",     label: "Graph",     Icon: Network },
  { id: "flow",      label: "Flow Map",  Icon: Workflow },
];
const ALL_VIEW_IDS: ViewKey[] = VIEW_DEFS.map((v) => v.id);

export function SettingsTab({ isOwner }: { isOwner: boolean }) {
  const [settings, setSettings] = useState<OrgSettings | null>(null);
  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const theme = useFormStore((s) => s.theme);

  useEffect(() => {
    Promise.all([getOrgSettings(), listMyTeams()])
      .then(([s, t]) => { setSettings(s); setTeams(t); })
      .catch((e) => toast.error((e as Error).message))
      .finally(() => setLoading(false));
  }, []);

  if (loading || !settings) {
    return <div className="flex h-20 items-center justify-center text-xs text-muted-foreground"><Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />Loading…</div>;
  }

  if (!isOwner) {
    return (
      <div className="rounded-md border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
        <Crown className="mx-auto mb-2 h-4 w-4 text-primary" />
        Only Owners can change org-wide settings.
        <div className="mt-3 grid grid-cols-2 gap-2 text-left">
          <ReadOnly label="Allow non-admins to create teams" value={settings.allow_team_creation_by_non_admins ? "Yes" : "No"} />
          <ReadOnly label="Allow public share links" value={settings.allow_public_links ? "Yes" : "No"} />
          <ReadOnly label="Default team" value={teams.find((t) => t.id === settings.default_team_id)?.name ?? "—"} />
          <ReadOnly label="Light-mode theme" value={LIGHT_THEME_LIST.find((p) => p.key === settings.light_theme)?.label ?? "Standard"} />
        </div>
      </div>
    );
  }

  const save = async (patch: Partial<OrgSettings>) => {
    setBusy(true);
    try {
      await updateOrgSettings(patch);
      setSettings({ ...settings, ...patch });
      toast.success("Saved");
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
  };

  const currentTheme: LightThemeKey = isLightThemeKey(settings.light_theme) ? settings.light_theme : "standard";
  const currentFont: UiFontKey = isUiFontKey(settings.ui_font) ? settings.ui_font : "system";

  const pickFont = async (key: UiFontKey) => {
    if (key === currentFont) return;
    applyUiFont(key);
    writeCachedUiFont(key);
    try {
      await save({ ui_font: key });
    } catch {
      applyUiFont(currentFont);
      writeCachedUiFont(currentFont);
    }
  };

  const allowed: ViewKey[] = (Array.isArray(settings.allowed_views) && settings.allowed_views.length
    ? settings.allowed_views
    : ALL_VIEW_IDS
  ).filter((v): v is ViewKey => (ALL_VIEW_IDS as string[]).includes(v));
  const defaultView: ViewKey = (ALL_VIEW_IDS as string[]).includes(settings.default_view)
    ? (settings.default_view as ViewKey)
    : "magic";

  const toggleView = async (id: ViewKey) => {
    let next = allowed.includes(id) ? allowed.filter((v) => v !== id) : [...allowed, id];
    if (next.length === 0) {
      toast.error("At least one view must remain enabled");
      return;
    }
    // Keep canonical order
    next = ALL_VIEW_IDS.filter((v) => next.includes(v));
    const patch: Partial<OrgSettings> = { allowed_views: next };
    // If the default view is being disabled, fall back to magic (or first allowed).
    if (!next.includes(defaultView)) {
      patch.default_view = next.includes("magic") ? "magic" : next[0];
    }
    await save(patch);
    useFormStore.getState().setAllowedViews(next);
    if (patch.default_view) useFormStore.getState().setDefaultView(patch.default_view as ViewKey);
  };

  const pickDefault = async (id: ViewKey) => {
    if (id === defaultView) return;
    await save({ default_view: id });
    useFormStore.getState().setDefaultView(id);
  };

  const pickTheme = async (key: LightThemeKey) => {
    if (key === currentTheme) return;
    // Optimistic local apply so the Owner sees the change instantly.
    if (theme === "light") applyLightTheme(key);
    writeCachedLightTheme(key);
    try {
      await save({ light_theme: key });
    } catch {
      // Revert on failure
      if (theme === "light") applyLightTheme(currentTheme);
      writeCachedLightTheme(currentTheme);
    }
  };

  return (
    <div className="space-y-3">
      <Toggle
        label="Allow non-admins to create teams"
        desc="When off, only Admins or Owners can create new teams. Existing teams stay."
        checked={settings.allow_team_creation_by_non_admins}
        onChange={(v) => save({ allow_team_creation_by_non_admins: v })}
        disabled={busy}
      />
      <Toggle
        label="Allow public share links"
        desc="When off, the Public link tab is hidden in the Share dialog. Existing public links are unaffected."
        checked={settings.allow_public_links}
        onChange={(v) => save({ allow_public_links: v })}
        disabled={busy}
      />
      <Toggle
        label="Alternating row shading"
        desc="Subtle zebra striping on field tables (Magic, Grid, Preview-loop) so adjacent rows are easier to scan. Off shows flat rows."
        checked={settings.zebra_rows !== false}
        onChange={(v) => { save({ zebra_rows: v }); useFormStore.getState().setZebraRows(v); }}
        disabled={busy}
      />
      <div className="rounded-md border border-border bg-surface p-3">
        <div className="text-xs font-semibold text-foreground">Default team</div>
        <div className="mb-2 text-[11px] text-muted-foreground">New users approved via bulk invite without a team will be added to this team.</div>
        <Select value={settings.default_team_id ?? "none"} onValueChange={(v) => save({ default_team_id: v === "none" ? null : v })}>
          <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">— None —</SelectItem>
            {teams.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-md border border-border bg-surface p-3">
        <div className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-foreground">
          <LayoutGrid className="h-3.5 w-3.5 text-primary" /> Allowed views
        </div>
        <div className="mb-3 text-[11px] text-muted-foreground">
          Choose which views appear in the view switcher for everyone. At least one must stay on.
        </div>
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
          {VIEW_DEFS.map(({ id, label, Icon }) => {
            const on = allowed.includes(id);
            return (
              <button
                key={id}
                type="button"
                disabled={busy}
                onClick={() => toggleView(id)}
                className={cn(
                  "flex items-center justify-between gap-2 rounded-md border px-2.5 py-1.5 text-left transition-all disabled:opacity-60",
                  on
                    ? "border-primary/40 bg-primary/5 text-foreground"
                    : "border-border bg-surface-2 text-muted-foreground hover:text-foreground",
                )}
              >
                <span className="flex items-center gap-1.5 text-xs font-medium">
                  <Icon className="h-3.5 w-3.5" />
                  {label}
                </span>
                <Switch checked={on} className="shrink-0 pointer-events-none" />
              </button>
            );
          })}
        </div>
        <div className="mt-3 border-t border-border pt-2">
          <div className="mb-1 text-xs font-semibold text-foreground">Default view</div>
          <div className="mb-2 text-[11px] text-muted-foreground">
            New users land on this view. Only enabled views can be picked.
          </div>
          <Select value={defaultView} onValueChange={(v) => pickDefault(v as ViewKey)}>
            <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              {VIEW_DEFS.filter((v) => allowed.includes(v.id)).map(({ id, label }) => (
                <SelectItem key={id} value={id}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="rounded-md border border-border bg-surface p-3">
        <div className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-foreground">
          <Palette className="h-3.5 w-3.5 text-primary" /> Light-mode theme
        </div>
        <div className="mb-3 text-[11px] text-muted-foreground">
          Applies to everyone in the workspace when their interface is in light mode. Dark mode is unaffected.
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {LIGHT_THEME_LIST.map((preset) => {
            const selected = preset.key === currentTheme;
            return (
              <button
                key={preset.key}
                type="button"
                disabled={busy}
                onClick={() => pickTheme(preset.key)}
                className={cn(
                  "group relative flex flex-col gap-2 rounded-md border p-2.5 text-left transition-all disabled:opacity-60",
                  selected
                    ? "border-primary ring-2 ring-primary/30 bg-primary/5"
                    : "border-border hover:border-border-strong hover:bg-surface-2",
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="text-xs font-semibold text-foreground">{preset.label}</div>
                  {selected && (
                    <span className="flex h-4 w-4 items-center justify-center rounded-full bg-primary text-primary-foreground">
                      <Check className="h-2.5 w-2.5" />
                    </span>
                  )}
                </div>
                <div className="flex h-6 overflow-hidden rounded border border-border/60">
                  {preset.swatch.map((c, i) => (
                    <div key={i} className="flex-1" style={{ backgroundColor: c }} />
                  ))}
                </div>
                <div className="text-[10.5px] leading-tight text-muted-foreground">{preset.description}</div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="rounded-md border border-border bg-surface p-3">
        <div className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-foreground">
          <Type className="h-3.5 w-3.5 text-primary" /> Interface font
        </div>
        <div className="mb-3 text-[11px] text-muted-foreground">
          Applies to everyone in the workspace. Change updates instantly.
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {UI_FONT_LIST.map((preset) => {
            const selected = preset.key === currentFont;
            return (
              <button
                key={preset.key}
                type="button"
                disabled={busy}
                onClick={() => pickFont(preset.key)}
                className={cn(
                  "group relative flex flex-col gap-2 rounded-md border p-2.5 text-left transition-all disabled:opacity-60",
                  selected
                    ? "border-primary ring-2 ring-primary/30 bg-primary/5"
                    : "border-border hover:border-border-strong hover:bg-surface-2",
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="text-xs font-semibold text-foreground">{preset.label}</div>
                  {selected && (
                    <span className="flex h-4 w-4 items-center justify-center rounded-full bg-primary text-primary-foreground">
                      <Check className="h-2.5 w-2.5" />
                    </span>
                  )}
                </div>
                <div
                  className="flex items-baseline gap-2 rounded border border-border/60 bg-surface-2 px-2 py-1.5"
                  style={{ fontFamily: preset.family }}
                >
                  <span className="text-base text-foreground" style={{ fontWeight: preset.weight }}>Aa</span>
                  <span className="text-[11px] text-muted-foreground">The quick brown fox</span>
                </div>
                <div className="text-[10.5px] leading-tight text-muted-foreground">{preset.description}</div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Toggle({ label, desc, checked, onChange, disabled }: { label: string; desc: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-surface p-3">
      <div className="min-w-0">
        <div className="text-xs font-semibold text-foreground">{label}</div>
        <div className="text-[11px] text-muted-foreground">{desc}</div>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} disabled={disabled} className="shrink-0" />
    </div>
  );
}

function ReadOnly({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-surface px-2 py-1.5">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="text-xs font-medium text-foreground">{value}</div>
    </div>
  );
}