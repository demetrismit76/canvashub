// Thin client for the admin/gocanvas edge functions.
// All calls inject the cached admin passphrase as `x-admin-pass`.

import { supabase } from "@/integrations/supabase/client";

const FN_BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;
const ANON = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

const PASS_KEY = "gc.adminPass";

export function getAdminPass(): string | null {
  return sessionStorage.getItem(PASS_KEY);
}
export function setAdminPass(p: string) { sessionStorage.setItem(PASS_KEY, p); }
export function clearAdminPass() { sessionStorage.removeItem(PASS_KEY); }

async function headers(extra: Record<string, string> = {}): Promise<Record<string, string>> {
  const pass = getAdminPass();
  // Prefer signed-in user JWT (so admins authenticate by role); fall back to anon.
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token || ANON;
  return {
    "Content-Type": "application/json",
    apikey: ANON,
    Authorization: `Bearer ${token}`,
    ...(pass ? { "x-admin-pass": pass } : {}),
    ...extra,
  };
}

async function call(path: string, init: RequestInit = {}) {
  const h = await headers();
  const r = await fetch(`${FN_BASE}${path}`, {
    ...init,
    headers: { ...h, ...(init.headers as Record<string, string> | undefined) },
  });
  const text = await r.text();
  let body: unknown = text;
  try { body = JSON.parse(text); } catch { /* ignore */ }
  if (!r.ok) {
    const msg = (body as { error?: string })?.error || `Request failed (${r.status})`;
    throw new Error(msg);
  }
  return body;
}

export async function adminUnlock(passphrase: string): Promise<boolean> {
  const r = await fetch(`${FN_BASE}/admin-unlock`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: ANON, Authorization: `Bearer ${ANON}` },
    body: JSON.stringify({ passphrase }),
  });
  const data = await r.json().catch(() => ({}));
  return r.ok && !!data?.ok;
}

export type AccountSummary = {
  id: string;
  label: string;
  auth_type: "oauth2" | "basic";
  base_url: string;
  is_default: boolean;
  created_at: string;
};

export const accountsApi = {
  list: () => call("/gocanvas-accounts") as Promise<{ accounts: AccountSummary[] }>,
  create: (body: Record<string, unknown>) =>
    call("/gocanvas-accounts", { method: "POST", body: JSON.stringify(body) }) as Promise<{ account: AccountSummary }>,
  patch: (id: string, body: Record<string, unknown>) =>
    call(`/gocanvas-accounts?id=${id}`, { method: "PATCH", body: JSON.stringify(body) }) as Promise<{ account: AccountSummary }>,
  remove: (id: string) =>
    call(`/gocanvas-accounts?id=${id}`, { method: "DELETE" }) as Promise<{ ok: boolean }>,
  test: (accountId: string) =>
    call("/gocanvas-test", { method: "POST", body: JSON.stringify({ accountId }) }) as Promise<{ ok: boolean; status: number; sample: string }>,
  folders: (accountId: string) =>
    call("/gocanvas-list-folders", { method: "POST", body: JSON.stringify({ accountId }) }) as Promise<{ folders: { id: string; name: string }[] }>,
  push: (accountId: string, payload: unknown) =>
    call("/gocanvas-push", { method: "POST", body: JSON.stringify({ accountId, payload }) }) as Promise<{ ok: boolean; form_id: string | null }>,
};