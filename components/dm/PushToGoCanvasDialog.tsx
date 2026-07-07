import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useFormStore } from "@/store/useFormStore";
import { accountsApi, type AccountSummary } from "@/lib/dm/adminApi";
import { buildV3Payload } from "@/lib/dm/gocanvasV3";
import { toast } from "sonner";
import { ChevronRight, Upload, AlertTriangle } from "lucide-react";

export function PushToGoCanvasDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { schema, fileName } = useFormStore();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [accounts, setAccounts] = useState<AccountSummary[]>([]);
  const [accountId, setAccountId] = useState<string>("");
  const [folders, setFolders] = useState<{ id: string; name: string }[]>([]);
  const [folderId, setFolderId] = useState<string>("");
  const [formName, setFormName] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setStep(1);
    setFormName((fileName || "form").replace(/\.json$/i, ""));
    accountsApi.list().then((r) => {
      setAccounts(r.accounts);
      const def = r.accounts.find((a) => a.is_default) || r.accounts[0];
      if (def) setAccountId(def.id);
    }).catch((e) => toast.error(e.message));
  }, [open, fileName]);

  const built = useMemo(() => {
    if (!schema) return null;
    return buildV3Payload(schema, formName || "Untitled", folderId || "");
  }, [schema, formName, folderId]);

  async function loadFolders() {
    if (!accountId) return;
    setBusy(true);
    try {
      const r = await accountsApi.folders(accountId);
      setFolders(r.folders);
      if (r.folders[0]) setFolderId(r.folders[0].id);
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
  }

  async function push() {
    if (!built || !accountId || !folderId) return;
    setBusy(true);
    try {
      const r = await accountsApi.push(accountId, built.payload);
      toast.success("Form pushed", { description: r.form_id ? `ID: ${r.form_id}` : undefined });
      onOpenChange(false);
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-4 w-4" />
            Push to GoCanvas — Step {step} of 3
          </DialogTitle>
        </DialogHeader>

        {step === 1 && (
          <div className="space-y-3">
            <Label className="text-xs">Account</Label>
            <Select value={accountId} onValueChange={setAccountId}>
              <SelectTrigger><SelectValue placeholder="Select account" /></SelectTrigger>
              <SelectContent>
                {accounts.map((a) => (
                  <SelectItem key={a.id} value={a.id}>{a.label} ({a.auth_type})</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {accounts.length === 0 && (
              <p className="text-xs text-muted-foreground">No accounts yet. Add one in Admin settings.</p>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button disabled={!accountId || busy} onClick={async () => { await loadFolders(); setStep(2); }}>
                Next <ChevronRight className="ml-1 h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Form name</Label>
              <Input value={formName} onChange={(e) => setFormName(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Folder</Label>
              <Select value={folderId} onValueChange={setFolderId}>
                <SelectTrigger><SelectValue placeholder="Select folder" /></SelectTrigger>
                <SelectContent>
                  {folders.map((f) => (
                    <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {folders.length === 0 && <p className="text-xs text-muted-foreground mt-1">No folders returned. Check account permissions.</p>}
            </div>
            <div className="flex justify-between gap-2">
              <Button variant="ghost" onClick={() => setStep(1)}>Back</Button>
              <Button disabled={!folderId || !formName} onClick={() => setStep(3)}>
                Next <ChevronRight className="ml-1 h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        )}

        {step === 3 && built && (
          <div className="space-y-3">
            {built.caveats.length > 0 && (
              <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-2">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-700 dark:text-amber-400">
                  <AlertTriangle className="h-3.5 w-3.5" /> {built.caveats.length} approximation(s)
                </div>
                <ScrollArea className="max-h-32 mt-1">
                  <ul className="text-[11px] text-muted-foreground space-y-0.5 pl-4 list-disc">
                    {built.caveats.map((c, i) => <li key={i}>{c}</li>)}
                  </ul>
                </ScrollArea>
              </div>
            )}
            <Label className="text-xs">Payload preview</Label>
            <ScrollArea className="h-80 rounded-md border border-border bg-surface-2 p-2">
              <pre className="text-[10px] font-mono leading-tight">{JSON.stringify(built.payload, null, 2)}</pre>
            </ScrollArea>
            <div className="flex justify-between gap-2">
              <Button variant="ghost" onClick={() => setStep(2)}>Back</Button>
              <Button onClick={push} disabled={busy}>
                {busy ? "Pushing…" : "Confirm & push"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}