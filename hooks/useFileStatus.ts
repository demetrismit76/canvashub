import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/hooks/useAuth";
import { getMyFileStatus, setFileStatus, type FileStatus, type FileStatusRow } from "@/lib/dm/admin";

export function useFileStatus(fileName: string | null) {
  const { user } = useAuth();
  const [row, setRow] = useState<FileStatusRow | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!user || !fileName) { setRow(null); return; }
    setLoading(true);
    try {
      const r = await getMyFileStatus(fileName);
      setRow(r);
    } catch { setRow(null); }
    finally { setLoading(false); }
  }, [user, fileName]);

  useEffect(() => { refresh(); }, [refresh]);

  const update = useCallback(async (status: FileStatus, note = "") => {
    if (!fileName) return;
    await setFileStatus(fileName, status, note);
    await refresh();
  }, [fileName, refresh]);

  return { row, status: row?.status ?? "open" as FileStatus, loading, update, refresh };
}