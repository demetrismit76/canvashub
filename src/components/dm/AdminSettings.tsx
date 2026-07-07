import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Settings, Lock, LockOpen, Trash2, Plug, Plus, Star, StarOff } from "lucide-react";
import { useFormStore } from "@/store/useFormStore";
import { accountsApi, adminUnlock, type AccountSummary } from "@/lib/dm/adminApi";
import { toast } from "sonner";
import { useUserRole } from "@/hooks/useUserRole";

export function AdminSettings() {
  const { adminUnlocked, unlockAdmin, lockAdmin, pushEnabled, setPushEnabled, wrapVisibility, setWrapVisibility, wrapIdentifier, setWrapIdentifier, collapseOnStartup, setCollapseOnStartup } = useFormStore();
  const { isAdmin: isRoleAdmin } = useUserRole();
  const [open, setOpen] = useState(false);
  const [pass, setPass] = useState("");
  const [busy, setBusy] = useState(false);
  const [accounts, setAccounts] = useState<AccountSummary[]>([]);
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    if (!open || !adminUnlocked) return;
    accountsApi.list().then((r) => setAccounts(r.accounts)).catch((e) => toast.error(e.message));
  }, [open, adminUnlocked]);

  async function handleUnlock() {
    if (!pass) return;
    setBusy(true);
    const ok = await adminUnlock(pass);
    setBusy(false);
    if (ok) { unlockAdmin(pass); setPass(""); toast.success("Unlocked"); }
    else toast.error("Incorrect passphrase");
  }

  async function refresh() {
    const r = await accountsApi.list();
    setAccounts(r.accounts);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" title="Admin settings">
          <Settings className="h-3.5 w-3.5" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {adminUnlocked ? <LockOpen className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
            Admin settings
          </DialogTitle>
        </DialogHeader>

        {!adminUnlocked && !isRoleAdmin ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Enter the admin passphrase to manage GoCanvas accounts.</p>
            <div className="flex gap-2">
              <Input
                type="password"
                placeholder="Passphrase"
                value={pass}
                onChange={(e) => setPass(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleUnlock()}
              />
              <Button onClick={handleUnlock} disabled={busy || !pass}>Unlock</Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Tip: signed-in users with the admin role unlock automatically — no passphrase needed.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between rounded-md border border-border p-3">
              <div>
                <div className="text-sm font-medium">Show "Push to GoCanvas" button</div>
                <div className="text-xs text-muted-foreground">Visible only while admin is unlocked on this browser.</div>
              </div>
              <Switch checked={pushEnabled} onCheckedChange={setPushEnabled} />
            </div>

            <div className="flex items-center justify-between rounded-md border border-border p-3">
              <div>
                <div className="text-sm font-medium">Collapse groups on startup</div>
                <div className="text-xs text-muted-foreground">Open every view (sidebar, Grid, Structure, Flow, Magic) with all groups collapsed. Clicking a field in any view expands its ancestors and scrolls the sidebar to match.</div>
              </div>
              <Switch checked={collapseOnStartup} onCheckedChange={setCollapseOnStartup} />
            </div>

            <div className="flex items-center justify-between rounded-md border border-border p-3">
              <div>
                <div className="text-sm font-medium">Collapse long visibility text</div>
                <div className="text-xs text-muted-foreground">When on, long visibility expressions show a short preview with “…” — click to expand or collapse. When off, the full text is always shown (wrapped).</div>
              </div>
              <Switch checked={wrapVisibility} onCheckedChange={setWrapVisibility} />
            </div>

            <div className="flex items-center justify-between rounded-md border border-border p-3">
              <div>
                <div className="text-sm font-medium">Expand identifiers by default</div>
                <div className="text-xs text-muted-foreground">Identifiers always show on a single line — click to expand or collapse. When this is on, they start expanded (wrapped) by default.</div>
              </div>
              <Switch checked={wrapIdentifier} onCheckedChange={setWrapIdentifier} />
            </div>

            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">GoCanvas accounts</h3>
              <Button size="sm" onClick={() => setShowForm((v) => !v)}>
                <Plus className="mr-1 h-3.5 w-3.5" /> Add account
              </Button>
            </div>

            {showForm && (
              <AccountForm
                onSaved={async () => { setShowForm(false); await refresh(); }}
              />
            )}

            <div className="rounded-md border border-border">
              {accounts.length === 0 ? (
                <div className="p-4 text-sm text-muted-foreground">No accounts yet.</div>
              ) : accounts.map((a) => (
                <AccountRow key={a.id} account={a} onChange={refresh} />
              ))}
            </div>

            <div className="flex justify-end">
              {!isRoleAdmin && (
                <Button variant="ghost" size="sm" onClick={() => { lockAdmin(); setOpen(false); }}>
                  <Lock className="mr-1 h-3.5 w-3.5" /> Lock
                </Button>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function AccountForm({ onSaved }: { onSaved: () => void }) {
  const [label, setLabel] = useState("");
  const [authType, setAuthType] = useState<"oauth2" | "basic">("oauth2");
  const [baseUrl, setBaseUrl] = useState("https://api.gocanvas.com");
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      await accountsApi.create({
        label, auth_type: authType, base_url: baseUrl,
        client_id: clientId, client_secret: clientSecret,
        username, password,
      });
      toast.success("Account added");
      onSaved();
    } catch (e) {
      toast.error((e as Error).message);
    } finally { setBusy(false); }
  }

  return (
    <div className="space-y-3 rounded-md border border-border bg-surface-2 p-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs">Label</Label>
          <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Client A — Prod" />
        </div>
        <div>
          <Label className="text-xs">Auth method</Label>
          <Select value={authType} onValueChange={(v) => setAuthType(v as "oauth2" | "basic")}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="oauth2">OAuth2 (client credentials)</SelectItem>
              <SelectItem value="basic">Username + password</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div>
        <Label className="text-xs">Base URL</Label>
        <Input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} />
      </div>
      {authType === "oauth2" ? (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">Client ID</Label>
            <Input value={clientId} onChange={(e) => setClientId(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Client Secret</Label>
            <Input type="password" value={clientSecret} onChange={(e) => setClientSecret(e.target.value)} />
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">Username</Label>
            <Input value={username} onChange={(e) => setUsername(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Password</Label>
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
        </div>
      )}
      <div className="flex justify-end">
        <Button size="sm" onClick={save} disabled={busy || !label}>Save</Button>
      </div>
    </div>
  );
}

function AccountRow({ account, onChange }: { account: AccountSummary; onChange: () => void }) {
  const [busy, setBusy] = useState(false);
  async function test() {
    setBusy(true);
    try {
      const r = await accountsApi.test(account.id);
      if (r.ok) toast.success(`Connection OK (${r.status})`);
      else toast.error(`Failed (${r.status})`, { description: r.sample?.slice(0, 200) });
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
  }
  async function remove() {
    if (!confirm(`Delete account "${account.label}"?`)) return;
    await accountsApi.remove(account.id);
    onChange();
  }
  async function makeDefault() {
    await accountsApi.patch(account.id, { is_default: !account.is_default });
    onChange();
  }
  return (
    <div className="flex items-center justify-between border-b border-border p-3 last:border-b-0">
      <div>
        <div className="text-sm font-medium flex items-center gap-2">
          {account.label}
          {account.is_default && <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">DEFAULT</span>}
        </div>
        <div className="text-xs text-muted-foreground">{account.auth_type} · {account.base_url}</div>
      </div>
      <div className="flex items-center gap-1">
        <Button size="sm" variant="ghost" onClick={makeDefault} title={account.is_default ? "Unset default" : "Set default"}>
          {account.is_default ? <StarOff className="h-3.5 w-3.5" /> : <Star className="h-3.5 w-3.5" />}
        </Button>
        <Button size="sm" variant="ghost" onClick={test} disabled={busy}><Plug className="h-3.5 w-3.5" /></Button>
        <Button size="sm" variant="ghost" onClick={remove}><Trash2 className="h-3.5 w-3.5" /></Button>
      </div>
    </div>
  );
}