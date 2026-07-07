import { useEffect, useState } from "react";
import { Check, Copy, Eye, Link2, Loader2, Mail, Pencil, Share2, Trash2, Users, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useFormStore } from "@/store/useFormStore";
import { useAuth } from "@/hooks/useAuth";
import { listRevisions, useReviewFields } from "@/hooks/useReviewFields";
import { loadFile } from "@/lib/dm/history";
import {
  buildShareUrl,
  createShare,
  deleteShareRow,
  findProfileByEmail,
  listSharesByMe,
  revokeShare,
  updateShare,
  type ShareRow,
} from "@/lib/dm/shares";
import { listMyTeams, listTeamRecipients, type TeamRecipient, type TeamRow } from "@/lib/dm/admin";
import { getOrgSettings } from "@/lib/dm/admin";
import { cn } from "@/lib/utils";

export function ShareDialog() {
  const { schema, fileName } = useFormStore();
  const { user } = useAuth();
  const { revision: activeRevision } = useReviewFields();
  const [open, setOpen] = useState(false);

  if (!schema || !fileName) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs"
          disabled={!user}
          title={user ? "Share this review" : "Sign in to share"}
        >
          <Share2 className="mr-1 h-3.5 w-3.5" /> Share
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Share2 className="h-4 w-4" /> Share review
          </DialogTitle>
        </DialogHeader>
        {user && (
          <ShareBody
            fileName={fileName}
            activeRevision={activeRevision}
            onClose={() => setOpen(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function ShareBody({
  fileName,
  activeRevision,
  onClose: _onClose,
}: { fileName: string; activeRevision: number; onClose: () => void }) {
  const availableRevs = listRevisions(fileName);
  const [picked, setPicked] = useState<number[]>(() => [activeRevision]);
  const [tab, setTab] = useState<"teammate" | "team" | "link">("teammate");
  const [existing, setExisting] = useState<ShareRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [allowPublic, setAllowPublic] = useState(true);

  useEffect(() => {
    getOrgSettings().then((s) => setAllowPublic(s.allow_public_links)).catch(() => { /* default true */ });
  }, []);

  useEffect(() => {
    listSharesByMe().then((r) => setExisting(r.filter((s) => s.file_name === fileName)))
      .catch(() => { /* ignore */ })
      .finally(() => setLoading(false));
  }, [fileName]);

  const refresh = async () => {
    const r = await listSharesByMe();
    setExisting(r.filter((s) => s.file_name === fileName));
  };

  const togglePicked = (n: number) => {
    setPicked((p) => p.includes(n) ? p.filter((x) => x !== n) : [...p, n].sort((a, b) => a - b));
  };

  return (
    <div className="space-y-4">
      <div className="rounded-md border border-border bg-surface-2/40 p-3">
        <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Revisions to share</div>
        <div className="flex flex-wrap gap-1.5">
          {availableRevs.map((n) => (
            <button
              key={n}
              onClick={() => togglePicked(n)}
              className={cn(
                "flex h-6 items-center gap-1 rounded-full border px-2 text-[11px] font-medium transition-colors",
                picked.includes(n)
                  ? "border-primary/50 bg-primary/10 text-primary"
                  : "border-border bg-surface text-muted-foreground hover:text-foreground",
              )}
            >
              R{n}
              {picked.includes(n) && <Check className="h-3 w-3" />}
            </button>
          ))}
        </div>
        <div className="mt-1.5 text-[11px] text-muted-foreground">
          Recipient sees only the revisions you pick.
        </div>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
        <TabsList className={cn("grid", allowPublic ? "grid-cols-3" : "grid-cols-2")}>
          <TabsTrigger value="teammate"><Mail className="mr-1.5 h-3.5 w-3.5" />Teammate</TabsTrigger>
          <TabsTrigger value="team"><Users className="mr-1.5 h-3.5 w-3.5" />Team</TabsTrigger>
          {allowPublic && <TabsTrigger value="link"><Link2 className="mr-1.5 h-3.5 w-3.5" />Public link</TabsTrigger>}
        </TabsList>
        <TabsContent value="teammate" className="mt-3">
          <TeammateTab fileName={fileName} revisions={picked} onCreated={refresh} />
        </TabsContent>
        <TabsContent value="team" className="mt-3">
          <TeamTab fileName={fileName} revisions={picked} onCreated={refresh} />
        </TabsContent>
        {allowPublic && (
          <TabsContent value="link" className="mt-3">
            <PublicLinkTab fileName={fileName} revisions={picked} onCreated={refresh} />
          </TabsContent>
        )}
      </Tabs>

      <div>
        <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Active shares for this file
        </div>
        {loading ? (
          <div className="flex items-center gap-2 rounded-md border border-dashed border-border p-3 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…
          </div>
        ) : existing.length === 0 ? (
          <div className="rounded-md border border-dashed border-border p-3 text-center text-xs text-muted-foreground">
            No shares yet.
          </div>
        ) : (
          <div className="divide-y divide-border overflow-hidden rounded-md border border-border">
            {existing.map((s) => (
              <ShareRowItem key={s.id} share={s} onChanged={refresh} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function TeammateTab({
  fileName, revisions, onCreated,
}: { fileName: string; revisions: number[]; onCreated: () => Promise<void> }) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [permission, setPermission] = useState<"viewer" | "editor">("viewer");

  const send = async () => {
    if (!email.trim()) return toast.error("Enter an email");
    if (revisions.length === 0) return toast.error("Pick at least one revision");
    setBusy(true);
    try {
      const profile = await findProfileByEmail(email.trim());
      if (!profile) {
        toast.error("No active user with that email", {
          description: "They need an account here first.",
        });
        return;
      }
      const formSchema = await loadFile(fileName);
      if (!formSchema) throw new Error("Could not load form schema");
      await createShare({
        fileName,
        formSchema,
        revisions,
        recipientUserId: profile.user_id,
        recipientEmail: profile.email,
        permission,
      });
      toast.success(`Shared with ${profile.display_name || profile.email}`);
      setEmail("");
      await onCreated();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2">
      <div className="text-xs text-muted-foreground">
        Share with a signed-in teammate. They'll see it in <strong>Shared with me</strong>.
      </div>
      <PermissionPicker value={permission} onChange={setPermission} />
      <div className="flex items-center gap-2">
        <Input
          type="email"
          placeholder="teammate@gocanvas.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="h-8 text-sm"
        />
        <Button size="sm" onClick={send} disabled={busy}>
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Share"}
        </Button>
      </div>
    </div>
  );
}

function TeamTab({
  fileName, revisions, onCreated,
}: { fileName: string; revisions: number[]; onCreated: () => Promise<void> }) {
  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [teamId, setTeamId] = useState<string>("");
  const [recipients, setRecipients] = useState<TeamRecipient[]>([]);
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [permission, setPermission] = useState<"viewer" | "editor">("viewer");

  useEffect(() => {
    listMyTeams()
      .then((t) => { setTeams(t); if (t[0]) setTeamId(t[0].id); })
      .catch((e) => toast.error((e as Error).message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!teamId) { setRecipients([]); return; }
    listTeamRecipients(teamId)
      .then((r) => { setRecipients(r); setExcluded(new Set()); })
      .catch((e) => toast.error((e as Error).message));
  }, [teamId]);

  const toggleExcluded = (uid: string) => {
    setExcluded((s) => {
      const next = new Set(s);
      if (next.has(uid)) next.delete(uid); else next.add(uid);
      return next;
    });
  };

  const send = async () => {
    const targets = recipients.filter((r) => !excluded.has(r.user_id));
    if (targets.length === 0) return toast.error("No members selected");
    if (revisions.length === 0) return toast.error("Pick at least one revision");
    setBusy(true);
    try {
      const formSchema = await loadFile(fileName);
      if (!formSchema) throw new Error("Could not load form schema");
      let okCount = 0;
      for (const r of targets) {
        try {
          await createShare({
            fileName, formSchema, revisions,
            recipientUserId: r.user_id, recipientEmail: r.email,
            permission,
          });
          okCount++;
        } catch (e) {
          toast.error(`Failed for ${r.email}: ${(e as Error).message}`);
        }
      }
      if (okCount > 0) toast.success(`Shared with ${okCount} member${okCount === 1 ? "" : "s"}`);
      await onCreated();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" />Loading teams…</div>;
  }
  if (teams.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-border p-3 text-xs text-muted-foreground">
        You're not part of any team yet. Ask an admin to add you, or create one in the Admin panel.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <PermissionPicker value={permission} onChange={setPermission} />
      <div className="flex items-center gap-2">
        <Select value={teamId} onValueChange={setTeamId}>
          <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Pick a team…" /></SelectTrigger>
          <SelectContent>
            {teams.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button size="sm" onClick={send} disabled={busy || recipients.length === 0}>
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Share"}
        </Button>
      </div>
      {recipients.length === 0 ? (
        <div className="rounded-md border border-dashed border-border p-3 text-center text-[11px] text-muted-foreground">No active members in this team.</div>
      ) : (
        <div className="max-h-40 overflow-y-auto rounded-md border border-border">
          {recipients.map((r) => {
            const off = excluded.has(r.user_id);
            return (
              <button
                key={r.user_id}
                onClick={() => toggleExcluded(r.user_id)}
                className={cn(
                  "flex w-full items-center justify-between gap-2 border-b border-border px-2 py-1.5 text-left text-[11px] last:border-b-0 transition-colors hover:bg-surface-2/50",
                  off && "opacity-50",
                )}
              >
                <div className="min-w-0">
                  <div className="truncate font-medium text-foreground">{r.display_name || r.email}</div>
                  <div className="truncate text-[10px] text-muted-foreground">{r.email}</div>
                </div>
                <div className={cn("flex h-4 w-4 items-center justify-center rounded border", off ? "border-border" : "border-primary bg-primary text-primary-foreground")}>
                  {!off && <Check className="h-3 w-3" />}
                </div>
              </button>
            );
          })}
        </div>
      )}
      <div className="text-[11px] text-muted-foreground">
        Creates one share per selected member — they each see it in <strong>Shared with me</strong>.
      </div>
    </div>
  );
}

function PublicLinkTab({
  fileName, revisions, onCreated,
}: { fileName: string; revisions: number[]; onCreated: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<ShareRow | null>(null);
  const [permission, setPermission] = useState<"viewer" | "editor">("viewer");

  const generate = async () => {
    if (revisions.length === 0) return toast.error("Pick at least one revision");
    setBusy(true);
    try {
      const formSchema = await loadFile(fileName);
      if (!formSchema) throw new Error("Could not load form schema");
      const row = await createShare({
        fileName,
        formSchema,
        revisions,
        publicLinkEnabled: true,
        permission,
      });
      setCreated(row);
      toast.success("Public link generated");
      await onCreated();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2">
      <div className="text-xs text-muted-foreground">
        Anyone with the link can view the chosen revisions and add their own comments. No sign-in required.
      </div>
      <PermissionPicker value={permission} onChange={setPermission} />
      {!created ? (
        <Button size="sm" onClick={generate} disabled={busy}>
          {busy ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Link2 className="mr-1 h-3.5 w-3.5" />}
          Generate link
        </Button>
      ) : (
        <CopyLink url={buildShareUrl(created.token)} />
      )}
    </div>
  );
}

function CopyLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div className="flex items-center gap-2">
      <Input readOnly value={url} className="h-8 text-xs font-mono" onFocus={(e) => e.currentTarget.select()} />
      <Button size="sm" variant="outline" onClick={copy}>
        {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      </Button>
    </div>
  );
}

function PermissionPicker({
  value, onChange,
}: { value: "viewer" | "editor"; onChange: (v: "viewer" | "editor") => void }) {
  return (
    <div className="rounded-md border border-border bg-surface-2/40 p-1.5">
      <div className="mb-1 px-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        Permission
      </div>
      <div className="grid grid-cols-2 gap-1">
        <button
          type="button"
          onClick={() => onChange("viewer")}
          className={cn(
            "flex items-start gap-1.5 rounded border px-2 py-1.5 text-left text-[11px] transition-colors",
            value === "viewer"
              ? "border-primary/50 bg-primary/10 text-foreground"
              : "border-border bg-surface text-muted-foreground hover:text-foreground",
          )}
        >
          <Eye className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <div>
            <div className="font-semibold">Viewer</div>
            <div className="text-[10px] text-muted-foreground">See your checks, flags &amp; notes only.</div>
          </div>
        </button>
        <button
          type="button"
          onClick={() => onChange("editor")}
          className={cn(
            "flex items-start gap-1.5 rounded border px-2 py-1.5 text-left text-[11px] transition-colors",
            value === "editor"
              ? "border-primary/50 bg-primary/10 text-foreground"
              : "border-border bg-surface text-muted-foreground hover:text-foreground",
          )}
        >
          <Pencil className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <div>
            <div className="font-semibold">Editor</div>
            <div className="text-[10px] text-muted-foreground">Can add their own checks &amp; review.</div>
          </div>
        </button>
      </div>
    </div>
  );
}



function ShareRowItem({ share, onChanged }: { share: ShareRow; onChanged: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const expired = share.expires_at && new Date(share.expires_at) < new Date();
  const status = share.revoked_at ? "Revoked" : expired ? "Expired" : "Active";
  const url = share.public_link_enabled ? buildShareUrl(share.token) : null;

  const togglePublic = async () => {
    setBusy(true);
    try {
      await updateShare(share.id, { public_link_enabled: !share.public_link_enabled });
      await onChanged();
    } finally { setBusy(false); }
  };

  const togglePermission = async () => {
    const next = share.permission === "editor" ? "viewer" : "editor";
    setBusy(true);
    try {
      await updateShare(share.id, { permission: next });
      toast.success(next === "editor" ? "Now an editor share" : "Now a viewer share");
      await onChanged();
    } catch (e) {
      toast.error((e as Error).message);
    } finally { setBusy(false); }
  };

  const handleRevoke = async () => {
    setBusy(true);
    try {
      await revokeShare(share.id);
      toast.success("Share revoked");
      await onChanged();
    } finally { setBusy(false); }
  };

  const handleDelete = async () => {
    setBusy(true);
    try {
      await deleteShareRow(share.id);
      toast.success("Share deleted");
      await onChanged();
    } finally { setBusy(false); }
  };

  return (
    <div className="flex flex-wrap items-center gap-2 p-2 text-xs">
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-1.5 text-foreground">
          {share.recipient_email ? (
            <><Mail className="h-3 w-3 text-muted-foreground" /> {share.recipient_email}</>
          ) : (
            <><Link2 className="h-3 w-3 text-muted-foreground" /> Public link</>
          )}
          <span className="rounded-full bg-surface-2 px-1.5 py-px text-[10px] text-muted-foreground">
            R{share.revisions.join(", R")}
          </span>
          <button
            type="button"
            disabled={busy || !!share.revoked_at}
            onClick={togglePermission}
            title={share.permission === "editor" ? "Switch to viewer" : "Switch to editor"}
            className={cn(
              "flex items-center gap-0.5 rounded-full px-1.5 py-px text-[10px] transition-colors",
              share.permission === "editor" ? "bg-primary/10 text-primary hover:bg-primary/20" : "bg-surface-2 text-muted-foreground hover:bg-surface-2/80 hover:text-foreground",
              (busy || share.revoked_at) && "cursor-not-allowed opacity-60",
            )}
          >
            {share.permission === "editor" ? <Pencil className="h-2.5 w-2.5" /> : <Eye className="h-2.5 w-2.5" />}
            {share.permission === "editor" ? "Editor" : "Viewer"}
          </button>
          <span className={cn(
            "rounded-full px-1.5 py-px text-[10px]",
            status === "Active" ? "bg-primary/10 text-primary" : "bg-destructive/10 text-destructive",
          )}>{status}</span>
        </div>
        {url && (
          <div className="mt-1 flex items-center gap-1.5">
            <Input readOnly value={url} className="h-6 text-[10px] font-mono" onFocus={(e) => e.currentTarget.select()} />
            <Button size="sm" variant="ghost" className="h-6 px-1.5" onClick={() => navigator.clipboard.writeText(url)}>
              <Copy className="h-3 w-3" />
            </Button>
          </div>
        )}
      </div>
      <div className="flex items-center gap-1">
        {!share.public_link_enabled && (
          <Button size="sm" variant="ghost" className="h-6 px-2 text-[10px]" disabled={busy} onClick={togglePublic}>
            Enable link
          </Button>
        )}
        {!share.revoked_at && (
          <Button size="sm" variant="ghost" className="h-6 px-2 text-[10px]" disabled={busy} onClick={handleRevoke}>
            <X className="mr-0.5 h-3 w-3" /> Revoke
          </Button>
        )}
        <Button size="sm" variant="ghost" className="h-6 px-1.5 text-destructive hover:text-destructive" disabled={busy} onClick={handleDelete}>
          <Trash2 className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
}