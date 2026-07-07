/**
 * Workspace-wide UI font presets.
 *
 * Owner picks one in Admin → Settings. The key is stored on
 * `public.org_settings.ui_font` and applied to <html> for every user by
 * setting the `--ui-font-family` CSS variable, which `body` consumes in
 * `src/index.css`.
 */

export type UiFontKey =
  | "system"
  | "inter"
  | "manrope"
  | "dm-sans"
  | "jakarta"
  | "space-grotesk";

export type UiFontPreset = {
  key: UiFontKey;
  label: string;
  description: string;
  /** Full CSS font-family value applied to <html>. */
  family: string;
  /** Optional headline weight tweak shown in the preview swatch. */
  weight: number;
};

const SYSTEM_STACK =
  'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

export const UI_FONTS: Record<UiFontKey, UiFontPreset> = {
  system: {
    key: "system",
    label: "System default",
    description: "Native OS font — fastest, familiar.",
    family: SYSTEM_STACK,
    weight: 600,
  },
  inter: {
    key: "inter",
    label: "Inter",
    description: "Modern neutral sans. Crisp at small UI sizes.",
    family: `"Inter", ${SYSTEM_STACK}`,
    weight: 600,
  },
  manrope: {
    key: "manrope",
    label: "Manrope — Modern Thin",
    description: "Thin lines with subtle bold. Quietly modern.",
    family: `"Manrope", ${SYSTEM_STACK}`,
    weight: 500,
  },
  "dm-sans": {
    key: "dm-sans",
    label: "DM Sans",
    description: "Geometric and friendly. Strong product feel.",
    family: `"DM Sans", ${SYSTEM_STACK}`,
    weight: 600,
  },
  jakarta: {
    key: "jakarta",
    label: "Plus Jakarta Sans",
    description: "Soft, contemporary humanist. Easy long-read.",
    family: `"Plus Jakarta Sans", ${SYSTEM_STACK}`,
    weight: 600,
  },
  "space-grotesk": {
    key: "space-grotesk",
    label: "Space Grotesk",
    description: "Tech-forward with character. Distinctive headings.",
    family: `"Space Grotesk", ${SYSTEM_STACK}`,
    weight: 600,
  },
};

export const UI_FONT_LIST: UiFontPreset[] = [
  UI_FONTS.system,
  UI_FONTS.inter,
  UI_FONTS.manrope,
  UI_FONTS["dm-sans"],
  UI_FONTS.jakarta,
  UI_FONTS["space-grotesk"],
];

export function isUiFontKey(v: unknown): v is UiFontKey {
  return typeof v === "string" && v in UI_FONTS;
}

export function applyUiFont(key: UiFontKey): void {
  if (typeof document === "undefined") return;
  const preset = UI_FONTS[key] ?? UI_FONTS.system;
  document.documentElement.style.setProperty("--ui-font-family", preset.family);
  document.documentElement.setAttribute("data-ui-font", preset.key);
}

export const UI_FONT_CACHE_KEY = "dm.uiFont";

export function readCachedUiFont(): UiFontKey {
  try {
    const v = localStorage.getItem(UI_FONT_CACHE_KEY);
    if (isUiFontKey(v)) return v;
  } catch { /* ignore */ }
  return "system";
}

export function writeCachedUiFont(key: UiFontKey): void {
  try { localStorage.setItem(UI_FONT_CACHE_KEY, key); } catch { /* ignore */ }
}