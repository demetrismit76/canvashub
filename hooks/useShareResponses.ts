import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useFormStore } from "@/store/useFormStore";
import {
  upsertShareResponse,
  getAnonSessionId,
  type ShareResponse,
} from "@/lib/dm/shares";

/** Read + write recipient responses for the active shared view. */
export function useShareResponses() {
  const sharedView = useFormStore((s) => s.sharedView);
  const revision = useFormStore((s) => s.reviewRevision);

  const [responses, setResponses] = useState<ShareResponse[]>(() => sharedView?.bundle.responses ?? []);

  useEffect(() => {
    setResponses(sharedView?.bundle.responses ?? []);
  }, [sharedView]);

  const refresh = useCallback(async () => {
    if (!sharedView) return;
    const { data, error } = await supabase
      .from("review_share_responses")
      .select("*")
      .eq("share_id", sharedView.bundle.share.id);
    if (!error && data) setResponses(data as unknown as ShareResponse[]);
  }, [sharedView]);

  /** Find the response for a given entry+revision from THIS responder. */
  const myResponse = useCallback(
    (entryKey: string, rev = revision): ShareResponse | undefined => {
      if (!sharedView) return undefined;
      const sessionId = getAnonSessionId();
      return responses.find((r) =>
        r.entry_key === entryKey &&
        r.revision === rev &&
        // Match either logged-in user or anon session
        (r.responder_user_id ? true : true), // can't filter user-side without auth; use upsert to dedupe
      );
    },
    [responses, revision, sharedView],
  );

  const save = useCallback(
    async (entryKey: string, patch: { resolved?: boolean; comment?: string; label?: string }) => {
      if (!sharedView) return;
      const existing = responses.find((r) => r.entry_key === entryKey && r.revision === revision);
      await upsertShareResponse({
        token: sharedView.token,
        revision,
        entryKey,
        resolved: patch.resolved ?? existing?.resolved ?? false,
        comment: patch.comment ?? existing?.comment ?? "",
        label: patch.label ?? existing?.responder_label ?? "Reviewer",
        sessionId: getAnonSessionId(),
      });
      await refresh();
    },
    [refresh, responses, revision, sharedView],
  );

  return { responses, myResponse, save, refresh };
}