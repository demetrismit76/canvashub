import { lazy, Suspense, useEffect, useRef } from "react";
import { useFormStore } from "@/store/useFormStore";
import { Dropzone } from "@/components/dm/Dropzone";
import { TopBar, TopBarActions } from "@/components/dm/TopBar";
import { PathBreadcrumb } from "@/components/dm/PathBreadcrumb";
import { TreePanel } from "@/components/dm/TreePanel";
import { MetadataPanel } from "@/components/dm/MetadataPanel";
import { useAuth } from "@/hooks/useAuth";
import { getMostRecent } from "@/lib/dm/history";
import { supabase } from "@/integrations/supabase/client";

const GridView      = lazy(() => import("@/components/dm/GridView").then(m => ({ default: m.GridView })));
const PreviewView   = lazy(() => import("@/components/dm/PreviewView").then(m => ({ default: m.PreviewView })));
const StructureView = lazy(() => import("@/components/dm/StructureView").then(m => ({ default: m.StructureView })));
const GoCanvasView  = lazy(() => import("@/components/dm/GoCanvasView").then(m => ({ default: m.GoCanvasView })));
const GraphView     = lazy(() => import("@/components/dm/GraphView").then(m => ({ default: m.GraphView })));
const FlowView      = lazy(() => import("@/components/dm/FlowView").then(m => ({ default: m.FlowView })));
const MagicView     = lazy(() => import("@/components/dm/MagicView").then(m => ({ default: m.MagicView })));

function ViewFallback() {
  return (
    <div className="flex flex-1 items-center justify-center">
      <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
    </div>
  );
}

const Index = () => {
  const { schema, view } = useFormStore();
  const loadJSON = useFormStore((s) => s.loadJSON);
  const applyRemoteView = useFormStore((s) => s.applyRemoteView);
  const { user, loading } = useAuth();
  const triedRef = useRef(false);
  const viewTriedRef = useRef<string | null>(null);

  // When a user signs in, override the local view with their saved preference.
  useEffect(() => {
    if (loading || !user) return;
    if (viewTriedRef.current === user.id) return;
    viewTriedRef.current = user.id;
    supabase
      .from("profiles")
      .select("preferred_view")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        const v = data?.preferred_view;
        const valid = (x: unknown): x is "grid" | "preview" | "structure" | "gocanvas" | "graph" | "flow" | "magic" =>
          x === "grid" || x === "preview" || x === "structure" || x === "gocanvas" || x === "graph" || x === "flow" || x === "magic";
        // Merge strategy:
        //   1. Cloud value wins when present (per-user preference is authoritative
        //      and follows the user across devices/browsers).
        //   2. If the cloud has no saved view yet, seed it from the current local
        //      view so this device's choice becomes the new baseline.
        if (valid(v)) {
          if (v !== useFormStore.getState().view) applyRemoteView(v);
        } else {
          // No saved preference yet → seed with the org default view if it's allowed.
          const st = useFormStore.getState();
          const seed = (st.allowedViews.includes(st.defaultView) ? st.defaultView : st.view) as typeof st.view;
          if (seed !== st.view) applyRemoteView(seed);
          supabase.from("profiles").update({ preferred_view: seed }).eq("user_id", user.id).then(() => {});
        }
      });
  }, [user, loading, applyRemoteView]);

  // Auto-load the user's last-opened file on app start.
  useEffect(() => {
    if (loading || schema || !user || triedRef.current) return;
    triedRef.current = true;
    getMostRecent()
      .then((r) => { if (r) loadJSON(r.schema_json, r.file_name); })
      .catch(() => {});
  }, [user, loading, schema, loadJSON]);

  if (!schema) return <Dropzone />;

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background">
      <TopBar />
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <TreePanel />
        <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <TopBarActions />
          <PathBreadcrumb />
          <Suspense fallback={<ViewFallback />}>
            {view === "grid" && <GridView />}
            {view === "preview" && <PreviewView />}
            {view === "structure" && <StructureView />}
            {view === "gocanvas" && <GoCanvasView />}
            {view === "graph" && <GraphView />}
            {view === "flow" && <FlowView />}
            {view === "magic" && <MagicView />}
          </Suspense>
        </main>
        <MetadataPanel />
      </div>
      <div className="pointer-events-none fixed bottom-1.5 right-2.5 z-50 text-[11px] leading-none text-muted-foreground/70 select-none">
        By Demetri S · © {new Date().getFullYear()}
      </div>
    </div>
  );
};

export default Index;
