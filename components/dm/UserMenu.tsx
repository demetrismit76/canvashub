import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { LogIn, LogOut, History, Trash2, FileJson, ShieldCheck, FolderOpen, Archive } from "lucide-react";
import { archiveFile, clearHistory, deleteFile, getFileRelatedCounts, listRecent, loadFile, type RecentFile } from "@/lib/dm/history";
import { useFormStore } from "@/store/useFormStore";
import { toast } from "sonner";
import { useUserRole } from "@/hooks/useUserRole";
import { Shield } from "lucide-react";
import { PendingActivations } from "@/components/dm/PendingActivations";
import { DataIntegrity } from "@/components/dm/DataIntegrity";
import { FileManager } from "@/components/dm/FileManager";

export function UserMenu() {
  const { user } = useAuth();
  const { isAdmin } = useUserRole();
  const navigate = useNavigate();
  const loadJSON = useFormStore((s) => s.loadJSON);
  const unlockAdminAsRole = useFormStore((s) => s.unlockAdminAsRole);
  const lockAdmin = useFormStore((s) => s.lockAdmin);
  const [recent, setRecent] = useState<RecentFile[]>([]);
  const [open, setOpen] = useState(false);
  const [integrityOpen, setIntegrityOpen] = useState(false);
  const [filesOpen, setFilesOpen] = useState(false);

  // Auto-unlock admin features for users with the 'admin' role.
  useEffect(() => {
    if (isAdmin) unlockAdminAsRole();
    else if (!user) lockAdmin();
  }, [isAdmin, user, unlockAdminAsRole, lockAdmin]);

  useEffect(() => {
    if (!user || !open) return;
    listRecent(20).then(setRecent).catch(() => setRecent([]));
  }, [user, open]);

  if (!user) {
    return (
      <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => navigate("/auth")}>
        <LogIn className="mr-1 h-3.5 w-3.5" /> Sign in
      </Button>
    );
  }

  const initial = (user.email ?? "?").slice(0, 1).toUpperCase();

  async function pick(name: string) {
    try {
      const json = await loadFile(name);
      if (!json) return toast.error("File not found");
      loadJSON(json, name);
      toast.success(`Loaded ${name}`);
      setOpen(false);
    } catch (e) { toast.error((e as Error).message); }
  }

  async function remove(e: React.MouseEvent, name: string) {
    e.stopPropagation(); e.preventDefault();
    let extras: string[] = [];
    try {
      const c = await getFileRelatedCounts(name);
      if (c.doneRows) extras.push(`${c.doneRows} done-check row`);
      if (c.reviewRows) extras.push(`${c.reviewRows} review revision${c.reviewRows === 1 ? "" : "s"}`);
    } catch { /* ignore */ }
    const extraMsg = extras.length ? ` and ${extras.join(" + ")}` : "";
    if (!confirm(`Delete "${name}"${extraMsg}?\n\nThis cannot be undone. Tip: use Manage files → Archive to hide without deleting.`)) return;
    await deleteFile(name, { cascade: true });
    toast.success(`Deleted ${name}`);
    setRecent((r) => r.filter((x) => x.file_name !== name));
  }

  async function archive(e: React.MouseEvent, name: string) {
    e.stopPropagation(); e.preventDefault();
    await archiveFile(name);
    toast.success(`Archived ${name}`, { description: "Restore from Manage files." });
    setRecent((r) => r.filter((x) => x.file_name !== name));
  }

  async function clearAll() {
    if (!confirm("Clear all recent files?")) return;
    await clearHistory();
    setRecent([]);
    toast.success("History cleared");
  }

  async function signOut() {
    await supabase.auth.signOut();
    toast.success("Signed out");
  }

  return (
    <>
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <button className="flex h-7 items-center gap-1.5 rounded-md border border-border bg-surface-2 px-1.5 text-xs hover:bg-surface">
          <Avatar className="h-5 w-5">
            <AvatarFallback className="text-[10px]">{initial}</AvatarFallback>
          </Avatar>
          <History className="h-3 w-3 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuLabel className="truncate text-xs">{user.email}</DropdownMenuLabel>
        {isAdmin && (
          <div className="px-2 pb-1">
            <span className="inline-flex items-center gap-1 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
              <Shield className="h-3 w-3" /> ADMIN
            </span>
          </div>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">
          Recent files
        </DropdownMenuLabel>
        {recent.length === 0 ? (
          <div className="px-2 py-3 text-xs text-muted-foreground">No history yet.</div>
        ) : (
          <div className="max-h-72 overflow-auto">
            {recent.map((r) => (
              <DropdownMenuItem
                key={r.file_name}
                onSelect={(e) => { e.preventDefault(); pick(r.file_name); }}
                className="flex items-center justify-between gap-2"
              >
                <div className="flex min-w-0 items-start gap-2">
                  <FileJson className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <div className="min-w-0">
                    <div className="truncate text-xs">{r.display_name?.trim() || r.file_name}</div>
                    {r.display_name && r.display_name.trim() !== r.file_name && (
                      <div className="truncate font-mono text-[10px] text-muted-foreground">{r.file_name}</div>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-0.5">
                  <button
                    onClick={(e) => archive(e, r.file_name)}
                    className="rounded p-1 text-muted-foreground hover:bg-surface-3 hover:text-foreground"
                    title="Archive (hide but keep)"
                  >
                    <Archive className="h-3 w-3" />
                  </button>
                  <button
                    onClick={(e) => remove(e, r.file_name)}
                    className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    title="Delete (asks first)"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              </DropdownMenuItem>
            ))}
          </div>
        )}
        {recent.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={(e) => { e.preventDefault(); clearAll(); }} className="text-xs text-destructive">
              <Trash2 className="mr-2 h-3.5 w-3.5" /> Clear history
            </DropdownMenuItem>
          </>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={(e) => { e.preventDefault(); setFilesOpen(true); setOpen(false); }}
          className="text-xs"
        >
          <FolderOpen className="mr-2 h-3.5 w-3.5" /> Manage files
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={(e) => { e.preventDefault(); setIntegrityOpen(true); setOpen(false); }}
          className="text-xs"
        >
          <ShieldCheck className="mr-2 h-3.5 w-3.5" /> Data integrity
        </DropdownMenuItem>
        {isAdmin && (
          <>
            <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Admin
            </DropdownMenuLabel>
            <DropdownMenuItem
              onSelect={(e) => { e.preventDefault(); navigate("/admin"); setOpen(false); }}
              className="text-xs"
            >
              <Shield className="mr-2 h-3.5 w-3.5" /> Admin panel
            </DropdownMenuItem>
            <PendingActivations
              trigger={
                <DropdownMenuItem
                  onSelect={(e) => e.preventDefault()}
                  className="text-xs"
                >
                  <Shield className="mr-2 h-3.5 w-3.5" /> Pending activations
                </DropdownMenuItem>
              }
            />
            <DropdownMenuSeparator />
          </>
        )}
        <DropdownMenuItem onSelect={(e) => { e.preventDefault(); signOut(); }} className="text-xs">
          <LogOut className="mr-2 h-3.5 w-3.5" /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
    <DataIntegrity open={integrityOpen} onOpenChange={setIntegrityOpen} />
    <FileManager open={filesOpen} onOpenChange={setFilesOpen} />
    </>
  );
}