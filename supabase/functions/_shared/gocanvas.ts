// Shared helpers used by GoCanvas edge functions.
// Imported via relative path; Deno will inline at deploy.

import { createClient } from "npm:@supabase/supabase-js@2";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-admin-pass",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
};

export function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Allows either:
//  - x-admin-pass header matching ADMIN_PASSPHRASE, OR
//  - Authorization: Bearer <user JWT> where the user has the 'admin' role.
export async function requireAdmin(req: Request): Promise<Response | null> {
  const pass = req.headers.get("x-admin-pass");
  const expected = Deno.env.get("ADMIN_PASSPHRASE");
  if (expected && pass && pass === expected) return null;

  const authz = req.headers.get("Authorization") || req.headers.get("authorization");
  if (authz?.startsWith("Bearer ")) {
    const token = authz.slice(7);
    try {
      const db = admin();
      const { data: userData, error: userErr } = await db.auth.getUser(token);
      if (!userErr && userData?.user) {
        const { data: roleRow } = await db
          .from("user_roles")
          .select("role")
          .eq("user_id", userData.user.id)
          .eq("role", "admin")
          .maybeSingle();
        if (roleRow) return null;
      }
    } catch { /* fall through */ }
  }
  return json({ error: "Unauthorized" }, 401);
}

export function admin() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

export type GcAccount = {
  id: string;
  label: string;
  auth_type: "oauth2" | "basic";
  client_id: string | null;
  client_secret: string | null;
  username: string | null;
  password: string | null;
  base_url: string;
};

// Allowlist of permitted GoCanvas API hosts. Prevents SSRF via attacker-controlled base_url.
const ALLOWED_HOSTS = new Set<string>([
  "api.gocanvas.com",
  "www.gocanvas.com",
  "gocanvas.com",
]);

export function validateBaseUrl(raw: string): string {
  let u: URL;
  try { u = new URL(raw); } catch { throw new Error("Invalid base_url"); }
  if (u.protocol !== "https:") throw new Error("base_url must use https://");
  if (!ALLOWED_HOSTS.has(u.hostname.toLowerCase())) {
    throw new Error(`base_url host not allowed. Allowed: ${[...ALLOWED_HOSTS].join(", ")}`);
  }
  return u.origin;
}

// Returns headers to use against the GoCanvas API for the given account.
export async function gcAuthHeaders(acc: GcAccount): Promise<Record<string, string>> {
  if (acc.auth_type === "basic") {
    if (!acc.username || !acc.password) throw new Error("Basic account missing username/password");
    const token = btoa(`${acc.username}:${acc.password}`);
    return { Authorization: `Basic ${token}` };
  }
  if (!acc.client_id || !acc.client_secret) throw new Error("OAuth account missing credentials");
  // Client credentials grant against GoCanvas v3 token endpoint.
  const tokenUrl = `${acc.base_url.replace(/\/$/, "")}/oauth/token`;
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: acc.client_id,
    client_secret: acc.client_secret,
  });
  const r = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`Token request failed (${r.status}): ${text}`);
  let parsed: { access_token?: string };
  try { parsed = JSON.parse(text); } catch { throw new Error(`Bad token JSON: ${text}`); }
  if (!parsed.access_token) throw new Error(`No access_token in response: ${text}`);
  return { Authorization: `Bearer ${parsed.access_token}` };
}

export async function loadAccount(id: string): Promise<GcAccount> {
  const { data, error } = await admin().from("gocanvas_accounts").select("*").eq("id", id).single();
  if (error || !data) throw new Error(error?.message || "Account not found");
  return data as GcAccount;
}