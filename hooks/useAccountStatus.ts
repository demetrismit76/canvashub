import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

export type AccountStatus = "pending" | "active" | "blocked";

/**
 * Watches the signed-in user's profile.status and signs them out
 * automatically if their account is pending or blocked.
 */
export function useAccountStatus() {
  const { user, loading: authLoading } = useAuth();
  const [status, setStatus] = useState<AccountStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;
    if (!user) { setStatus(null); setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    supabase
      .from("profiles")
      .select("status")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(async ({ data }) => {
        if (cancelled) return;
        const s = (data?.status as AccountStatus | undefined) ?? null;
        setStatus(s);
        setLoading(false);
        if (s === "pending") {
          toast.error("Your account is pending admin approval.");
          await supabase.auth.signOut();
        } else if (s === "blocked") {
          toast.error("Your account has been blocked. Contact an admin.");
          await supabase.auth.signOut();
        }
      });
    return () => { cancelled = true; };
  }, [user, authLoading]);

  return { status, loading };
}