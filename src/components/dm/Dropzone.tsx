import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Upload, FileJson, Sparkles, History, Trash2, LogIn } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useFormStore } from "@/store/useFormStore";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { deleteFile, listRecent, loadFile, type RecentFile } from "@/lib/dm/history";
import { validateDeviceMagicJSON } from "@/lib/dm/validate";

export function Dropzone() {
  const [drag, setDrag] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const loadJSON = useFormStore((s) => s.loadJSON);
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const [recent, setRecent] = useState<RecentFile[]>([]);

  useEffect(() => {
    if (!user) { setRecent([]); return; }
    listRecent(20).then(setRecent).catch(() => setRecent([]));
  }, [user]);

  const handleFile = useCallback(async (file: File) => {
    try {
      const text = await file.text();
      const json = JSON.parse(text);
      const check = validateDeviceMagicJSON(json);
      if (!check.ok) {
        toast.error("Invalid Device Magic file", { description: check.reason });
        return;
      }
      loadJSON(json, file.name);
      toast.success(`Loaded ${file.name}`);
    } catch (e: any) {
      toast.error("Invalid Device Magic file", {
        description: `Could not parse JSON: ${e.message}`,
      });
    }
  }, [loadJSON]);

  const handlePick = useCallback(async (name: string) => {
    try {
      const json = await loadFile(name);
      if (!json) return toast.error("File not found");
      const check = validateDeviceMagicJSON(json);
      if (!check.ok) {
        toast.error("Invalid Device Magic file", { description: check.reason });
        return;
      }
      loadJSON(json, name);
      toast.success(`Loaded ${name}`);
    } catch (e) { toast.error((e as Error).message); }
  }, [loadJSON]);

  async function removeOne(name: string) {
    await deleteFile(name);
    setRecent((r) => r.filter((x) => x.file_name !== name));
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background p-8">
      <div className="mb-10 text-center">
        <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 text-xs text-muted-foreground">
          <Sparkles className="h-3 w-3 text-primary" />
          Device Magic → GoCanvas Migration Hub
        </div>
        <h1 className="text-4xl font-semibold tracking-tight text-foreground">Device Canvas HUB</h1>
        <p className="mt-2 max-w-xl text-sm text-muted-foreground">
          Upload a Device Magic JSON form. Inspect every group, condition, and loop in a structured grid—then export a GoCanvas-ready blueprint.
        </p>
      </div>

      <label
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          const f = e.dataTransfer.files?.[0];
          if (f) handleFile(f);
        }}
        className={cn(
          "group relative flex w-full max-w-2xl cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed bg-surface px-10 py-16 transition-all",
          drag ? "border-primary bg-primary-soft" : "border-border hover:border-border-strong hover:bg-surface-2",
        )}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".json,application/json"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
          }}
        />
        <div className={cn("mb-4 rounded-full bg-primary-soft p-4 transition-transform", drag && "scale-110")}>
          <Upload className="h-7 w-7 text-primary" />
        </div>
        <div className="text-base font-medium text-foreground">Drop your Device Magic JSON here</div>
        <div className="mt-1 text-xs text-muted-foreground">or click to browse — supports deeply nested schemas, loops, conditions</div>
        <div className="mt-6 flex gap-2">
          <Button size="sm" variant="default" onClick={(e) => { e.preventDefault(); inputRef.current?.click(); }}>
            <FileJson className="mr-1.5 h-3.5 w-3.5" /> Choose file
          </Button>
        </div>
      </label>

      {user && recent.length > 0 && (
        <div className="mt-8 w-full max-w-2xl">
          <div className="mb-2 flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-xs font-medium text-foreground">
              <History className="h-3.5 w-3.5 text-muted-foreground" /> Recent files
            </div>
            <span className="text-[10px] text-muted-foreground">{recent.length} saved</span>
          </div>
          <div className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface">
            {recent.slice(0, 5).map((r) => (
              <div key={r.file_name} className="flex items-center justify-between gap-2 px-3 py-2 hover:bg-surface-2">
                <button
                  onClick={() => handlePick(r.file_name)}
                  className="flex min-w-0 flex-1 items-start gap-2 text-left"
                >
                  <FileJson className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs text-foreground">{r.display_name?.trim() || r.file_name}</span>
                    {r.display_name && r.display_name.trim() !== r.file_name && (
                      <span className="block truncate font-mono text-[10px] text-muted-foreground">{r.file_name}</span>
                    )}
                  </span>
                  <span className="ml-2 shrink-0 self-center text-[10px] text-muted-foreground">
                    {new Date(r.last_opened_at).toLocaleDateString()}
                  </span>
                </button>
                <button
                  onClick={() => removeOne(r.file_name)}
                  className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  title="Remove"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {!loading && !user && (
        <button
          onClick={() => navigate("/auth")}
          className="mt-6 flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground"
        >
          <LogIn className="h-3 w-3" /> Sign in to keep your file history
        </button>
      )}

      <div className="mt-10 grid max-w-2xl grid-cols-3 gap-3 text-center">
        {[
          { label: "Recursive parser", sub: "Groups + loops" },
          { label: "Logic translator", sub: "CONTAINS → English" },
          { label: "GoCanvas export", sub: "CSV / JSON / Mapping" },
        ].map((b) => (
          <div key={b.label} className="rounded-lg border border-border bg-surface px-3 py-2.5">
            <div className="text-xs font-medium text-foreground">{b.label}</div>
            <div className="text-[10px] text-muted-foreground">{b.sub}</div>
          </div>
        ))}
      </div>
      <div className="mt-8 text-xs text-muted-foreground">
        By Demetri S · © {new Date().getFullYear()}
      </div>
    </div>
  );
}