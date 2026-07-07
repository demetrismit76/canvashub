/**
 * Global light-mode theme presets.
 *
 * The Owner picks one in Admin → Settings. The selected key is stored on
 * `public.org_settings.light_theme` and read by every user on app boot.
 *
 * Each preset is a flat record of CSS variables that we set on
 * `document.documentElement` only when the app is in LIGHT mode. Dark mode
 * is unaffected. When the user switches a preset off ("standard") we clear
 * the inline vars so the values in `index.css :root` take over again.
 *
 * All values are HSL triplets WITHOUT the surrounding `hsl(...)` wrapper
 * (matching the convention in index.css / tailwind.config.ts).
 */

export type LightThemeKey =
  | "standard"
  | "navy"
  | "terracotta"
  | "emerald";

export type LightThemePreset = {
  key: LightThemeKey;
  label: string;
  /** Short blurb for the picker. */
  description: string;
  /** Four-swatch preview: [bg, surface, primary, accent]. */
  swatch: [string, string, string, string];
  /** HSL variables to inject on <html> when in light mode. */
  vars: Record<string, string>;
};

/** Keys we manage — anything else stays untouched. */
const MANAGED_VARS = [
  "--background", "--foreground",
  "--surface", "--surface-2", "--surface-3",
  "--card", "--card-foreground",
  "--popover", "--popover-foreground",
  "--primary", "--primary-foreground", "--primary-soft",
  "--secondary", "--secondary-foreground",
  "--accent", "--accent-foreground",
  "--muted", "--muted-foreground",
  "--border", "--border-strong", "--input", "--ring",
  "--sidebar-bg", "--sidebar-bg-2", "--sidebar-fg",
  "--sidebar-fg-muted", "--sidebar-border",
  "--grid-line",
  "--folder-color",
] as const;

export const LIGHT_THEMES: Record<LightThemeKey, LightThemePreset> = {
  standard: {
    key: "standard",
    label: "Standard — DM Green",
    description: "Default Device Magic look. Cool gray workspace, signature green accent.",
    swatch: ["#f3f4f6", "#ffffff", "#22c55e", "#22c55e"],
    vars: {
      "--folder-color": "38 75% 52%",
    },
  },

  navy: {
    key: "navy",
    label: "Navy Trust",
    description: "Crisp paper background with deep navy primary. Finance / enterprise feel.",
    swatch: ["#dce4f0", "#ffffff", "#1e3a5f", "#3b6fa0"],
    vars: {
      "--background": "220 30% 97%",
      "--foreground": "220 40% 12%",
      "--surface": "0 0% 100%",
      "--surface-2": "220 25% 95%",
      "--surface-3": "220 20% 90%",
      "--card": "0 0% 100%",
      "--card-foreground": "220 40% 12%",
      "--popover": "0 0% 100%",
      "--popover-foreground": "220 40% 12%",
      "--primary": "218 55% 28%",
      "--primary-foreground": "0 0% 100%",
      "--primary-soft": "218 50% 92%",
      "--secondary": "220 22% 93%",
      "--secondary-foreground": "220 40% 16%",
      "--accent": "218 55% 28%",
      "--accent-foreground": "0 0% 100%",
      "--muted": "220 22% 93%",
      "--muted-foreground": "220 12% 40%",
      "--border": "220 18% 88%",
      "--border-strong": "220 16% 76%",
      "--input": "220 18% 88%",
      "--ring": "218 55% 28%",
      "--sidebar-bg": "218 40% 93%",
      "--sidebar-bg-2": "218 35% 87%",
      "--sidebar-fg": "220 40% 16%",
      "--sidebar-fg-muted": "220 15% 42%",
      "--sidebar-border": "218 25% 78%",
      "--grid-line": "220 22% 92%",
      "--folder-color": "218 60% 42%",
    },
  },

  terracotta: {
    key: "terracotta",
    label: "Warm Clay",
    description: "Soft cream workspace with terracotta primary. Warm, welcoming, editorial.",
    swatch: ["#f0d9c2", "#fefaf4", "#c4654a", "#a0522d"],
    vars: {
      "--background": "30 35% 96%",
      "--foreground": "20 25% 14%",
      "--surface": "30 50% 99%",
      "--surface-2": "30 28% 93%",
      "--surface-3": "30 22% 87%",
      "--card": "30 50% 99%",
      "--card-foreground": "20 25% 14%",
      "--popover": "30 50% 99%",
      "--popover-foreground": "20 25% 14%",
      "--primary": "14 65% 48%",
      "--primary-foreground": "0 0% 100%",
      "--primary-soft": "14 60% 93%",
      "--secondary": "30 25% 92%",
      "--secondary-foreground": "20 25% 16%",
      "--accent": "14 65% 48%",
      "--accent-foreground": "0 0% 100%",
      "--muted": "30 25% 92%",
      "--muted-foreground": "25 12% 40%",
      "--border": "28 20% 85%",
      "--border-strong": "28 18% 72%",
      "--input": "28 20% 85%",
      "--ring": "14 65% 48%",
      "--sidebar-bg": "26 55% 88%",
      "--sidebar-bg-2": "26 45% 82%",
      "--sidebar-fg": "20 25% 16%",
      "--sidebar-fg-muted": "25 12% 42%",
      "--sidebar-border": "26 30% 74%",
      "--grid-line": "30 25% 91%",
      "--folder-color": "20 70% 40%",
    },
  },

  emerald: {
    key: "emerald",
    label: "Emerald Prestige",
    description: "Cool ivory background with rich emerald primary and warm gold accent.",
    swatch: ["#cfe3d6", "#ffffff", "#0d7a5f", "#c9a84c"],
    vars: {
      "--background": "150 18% 96%",
      "--foreground": "160 30% 12%",
      "--surface": "0 0% 100%",
      "--surface-2": "150 14% 94%",
      "--surface-3": "150 12% 88%",
      "--card": "0 0% 100%",
      "--card-foreground": "160 30% 12%",
      "--popover": "0 0% 100%",
      "--popover-foreground": "160 30% 12%",
      "--primary": "158 75% 28%",
      "--primary-foreground": "0 0% 100%",
      "--primary-soft": "158 55% 92%",
      "--secondary": "150 14% 92%",
      "--secondary-foreground": "160 30% 14%",
      "--accent": "42 75% 50%",
      "--accent-foreground": "158 75% 12%",
      "--muted": "150 14% 92%",
      "--muted-foreground": "155 12% 40%",
      "--border": "150 14% 85%",
      "--border-strong": "150 12% 72%",
      "--input": "150 14% 85%",
      "--ring": "158 75% 28%",
      "--sidebar-bg": "152 30% 88%",
      "--sidebar-bg-2": "152 24% 82%",
      "--sidebar-fg": "160 30% 14%",
      "--sidebar-fg-muted": "155 12% 42%",
      "--sidebar-border": "152 22% 74%",
      "--grid-line": "150 14% 91%",
      "--folder-color": "155 35% 42%",
    },
  },
};

export const LIGHT_THEME_LIST: LightThemePreset[] = [
  LIGHT_THEMES.standard,
  LIGHT_THEMES.navy,
  LIGHT_THEMES.terracotta,
  LIGHT_THEMES.emerald,
];

export function isLightThemeKey(v: unknown): v is LightThemeKey {
  return typeof v === "string" && v in LIGHT_THEMES;
}

/**
 * Apply a preset to <html>. Always clears managed vars first so switching
 * between presets never leaves stale values behind.
 */
export function applyLightTheme(key: LightThemeKey): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  // Clear all managed vars
  for (const name of MANAGED_VARS) root.style.removeProperty(name);
  // Re-apply the chosen preset (standard = no overrides)
  const preset = LIGHT_THEMES[key] ?? LIGHT_THEMES.standard;
  for (const [k, v] of Object.entries(preset.vars)) root.style.setProperty(k, v);
  root.setAttribute("data-light-theme", key);
}

/** Convenience: cached "current" key in localStorage so the next page-load
 * paints the right palette before the network round-trip resolves. */
export const LIGHT_THEME_CACHE_KEY = "dm.lightTheme";

export function readCachedLightTheme(): LightThemeKey {
  try {
    const v = localStorage.getItem(LIGHT_THEME_CACHE_KEY);
    if (isLightThemeKey(v)) return v;
  } catch { /* ignore */ }
  return "standard";
}

export function writeCachedLightTheme(key: LightThemeKey): void {
  try { localStorage.setItem(LIGHT_THEME_CACHE_KEY, key); } catch { /* ignore */ }
}