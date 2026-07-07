import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Loader2, Lock, LogIn, Plus } from "lucide-react";
import { useFormStore } from "@/store/useFormStore";
import { getShareByToken, shareAddRevision, type ShareBundle } from "@/lib/dm/shares";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import Index from "./Index";

export default function SharedReview() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const enterSharedView = useFormStore((s) => s.enterSharedView);
  const exitSharedView = useFormStore((s) => s.exitSharedView);
  const sharedView = useFormStore((s) => s.sharedView);
  const refreshSharedBundle = useFormStore((s) => s.refreshSharedBundle);
  const setReviewRevision = useFormStore((s) => s.setReviewRevision);
  const { user, loading: authLoading } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!token) { setError("Missing share token"); setLoading(false); return; }
    (async () => {
      try {
        const res = await getShareByToken(token);
        if (cancelled) return;
        if (!res) { setError("Share not found"); return; }
        if ("error" in res) {
          setError(res.error === "expired" ? "This link has expired."
            : res.error === "revoked" ? "This share has been revoked."
            : "You don't have access to this share.");
          return;
        }
        enterSharedView({ token, bundle: res as ShareBundle });
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; exitSharedView(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
      </div>
    );
  }
  if (error) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background p-8 text-center">
        <Lock className="h-6 w-6 text-muted-foreground" />
        <div className="text-sm text-foreground">{error}</div>
        <Button size="sm" variant="outline" onClick={() => navigate("/")}>Go home</Button>
      </div>
    );
  }
  if (!sharedView) return null;

  const isEditor = sharedView.bundle.share.permission === "editor";
  const showSignInBanner = isEditor && !authLoading && !user;

  const onAddRevision = async () => {
    setAdding(true);
    try {
      const next = await shareAddRevision(sharedView.token);
      await refreshSharedBundle();
      setReviewRevision?.(next);
      toast.success(`Revision R${next} added`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setAdding(false);
    }
  };

  return (
    <>
      {(showSignInBanner || (isEditor && user)) && (
        <div className="sticky top-0 z-40 flex items-center justify-between gap-2 border-b border-border bg-primary/5 px-3 py-1.5 text-xs">
          {showSignInBanner ? (
            <>
              <span className="text-muted-foreground">
                You're viewing this share read-only. Sign in to edit checks, flags &amp; notes.
              </span>
              <Button size="sm" variant="default" className="h-7" onClick={() => navigate("/auth")}>
                <LogIn className="mr-1 h-3.5 w-3.5" /> Sign in to edit
              </Button>
            </>
          ) : (
            <>
              <span className="text-muted-foreground">
                Editor mode — your changes save back to the author's review.
              </span>
              <Button size="sm" variant="outline" className="h-7" disabled={adding} onClick={onAddRevision}>
                <Plus className="mr-1 h-3.5 w-3.5" /> {adding ? "Adding…" : "Add revision"}
              </Button>
            </>
          )}
        </div>
      )}
      <Index />
    </>
  );
}