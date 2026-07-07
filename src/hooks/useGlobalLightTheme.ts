import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  applyLightTheme,
  isLightThemeKey,
  readCachedLightTheme,
  writeCachedLightTheme,
  type LightThemeKey,
} from "@/lib/dm/lightTheme";
import { useFormStore } from "@/store/useFormStore";
import type { ViewMode } from "@/store/useFormStore";
import {
  applyUiFont,
  isUiFontKey,
  readCachedUiFont,
  writeCachedUiFont,
  type UiFontKey,
} from "@/lib/dm/fontTheme";

const ALL_VIEWS: ViewMode[] = ["grid","preview","structure","gocanvas","graph","flow","magic"];
function isViewMode(v: unknown): v is ViewMode {
  return typeof v === "string" && (ALL_VIEWS as string[]).includes(v);
}

/**
 * Loads the org-wide light-mode theme preset and applies it whenever the
 * interface is in light mode. Re-applies when the user toggles light/dark.
 * Falls back to the cached preset (or "standard") before the network resolves.
 */
export function useGlobalLightTheme(): void {
  const theme = useFormStore((s) => s.theme);

  // Paint cached preset immediately for light mode; clear vars for dark mode.
  useEffect(() => {
    if (theme === "light") {
      applyLightTheme(readCachedLightTheme());
    } else {
      applyLightTheme("standard"); // clears managed vars so dark CSS rules win
    }
  }, [theme]);

  // Paint cached UI font immediately, regardless of light/dark mode.
  useEffect(() => {
    applyUiFont(readCachedUiFont());
  }, []);

  // Fetch org setting once and re-cache / re-apply.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data, error } = await supabase
          .from("org_settings")
          .select("light_theme, zebra_rows, allowed_views, default_view, ui_font")
          .eq("id", 1)
          .maybeSingle();
        if (!alive || error || !data) return;
        const key: LightThemeKey = isLightThemeKey(data.light_theme) ? data.light_theme : "standard";
        writeCachedLightTheme(key);
        if (useFormStore.getState().theme === "light") applyLightTheme(key);
        // Mirror zebra preference into the local store + cache
        const zebra = data.zebra_rows !== false;
        try { localStorage.setItem("dm.zebraRows", zebra ? "1" : "0"); } catch { /* ignore */ }
        useFormStore.getState().setZebraRows(zebra);
        // Mirror allowed views + default view into the store
        const allowed = (Array.isArray(data.allowed_views) ? data.allowed_views.filter(isViewMode) : ALL_VIEWS) as ViewMode[];
        const def: ViewMode = isViewMode(data.default_view) ? data.default_view : "magic";
        useFormStore.getState().setDefaultView(def);
        useFormStore.getState().setAllowedViews(allowed.length ? allowed : ALL_VIEWS);
        // UI font preset
        const font: UiFontKey = isUiFontKey(data.ui_font) ? data.ui_font : "system";
        writeCachedUiFont(font);
        applyUiFont(font);
      } catch { /* ignore — signed-out users keep the cached/standard preset */ }
    })();
    return () => { alive = false; };
  }, []);
}