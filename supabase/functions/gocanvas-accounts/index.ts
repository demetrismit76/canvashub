import { admin, corsHeaders, json, requireAdmin, validateBaseUrl } from "../_shared/gocanvas.ts";

// Strip secrets from list responses.
function redact(row: Record<string, unknown>) {
  return {
    id: row.id,
    label: row.label,
    auth_type: row.auth_type,
    base_url: row.base_url,
    is_default: row.is_default,
    has_client_id: !!row.client_id,
    has_client_secret: !!row.client_secret,
    has_username: !!row.username,
    has_password: !!row.password,
    created_at: row.created_at,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const unauth = await requireAdmin(req);
  if (unauth) return unauth;

  const db = admin();
  const url = new URL(req.url);
  const id = url.searchParams.get("id");

  try {
    if (req.method === "GET") {
      const { data, error } = await db.from("gocanvas_accounts").select("*").order("created_at");
      if (error) throw error;
      return json({ accounts: (data || []).map(redact) });
    }
    if (req.method === "POST") {
      const body = await req.json();
      const row: Record<string, unknown> = {
        label: String(body.label || "").trim(),
        auth_type: body.auth_type,
        base_url: validateBaseUrl(body.base_url || "https://api.gocanvas.com"),
        is_default: !!body.is_default,
      };
      if (!row.label) return json({ error: "Label required" }, 400);
      if (body.auth_type === "oauth2") {
        if (!body.client_id || !body.client_secret) return json({ error: "client_id/client_secret required" }, 400);
        row.client_id = body.client_id;
        row.client_secret = body.client_secret;
      } else if (body.auth_type === "basic") {
        if (!body.username || !body.password) return json({ error: "username/password required" }, 400);
        row.username = body.username;
        row.password = body.password;
      } else {
        return json({ error: "auth_type must be 'oauth2' or 'basic'" }, 400);
      }
      if (row.is_default) await db.from("gocanvas_accounts").update({ is_default: false }).neq("id", "00000000-0000-0000-0000-000000000000");
      const { data, error } = await db.from("gocanvas_accounts").insert(row).select("*").single();
      if (error) throw error;
      return json({ account: redact(data) });
    }
    if (req.method === "PATCH") {
      if (!id) return json({ error: "id required" }, 400);
      const body = await req.json();
      const patch: Record<string, unknown> = {};
      for (const k of ["label", "base_url", "is_default", "client_id", "client_secret", "username", "password"]) {
        if (k in body && body[k] !== undefined && body[k] !== "") patch[k] = body[k];
      }
      if (typeof patch.base_url === "string") patch.base_url = validateBaseUrl(patch.base_url);
      if (patch.is_default) await db.from("gocanvas_accounts").update({ is_default: false }).neq("id", id);
      const { data, error } = await db.from("gocanvas_accounts").update(patch).eq("id", id).select("*").single();
      if (error) throw error;
      return json({ account: redact(data) });
    }
    if (req.method === "DELETE") {
      if (!id) return json({ error: "id required" }, 400);
      const { error } = await db.from("gocanvas_accounts").delete().eq("id", id);
      if (error) throw error;
      return json({ ok: true });
    }
    return json({ error: "Method not allowed" }, 405);
  } catch (e) {
    const msg = (e as Error).message || "";
    // Surface validation errors to admin; mask everything else.
    if (/^(base_url|Label|client_id|username|auth_type)/i.test(msg) || msg.startsWith("Invalid") || msg.includes("not allowed") || msg.includes("must use")) {
      return json({ error: msg }, 400);
    }
    console.error("gocanvas-accounts error:", e);
    return json({ error: "Internal server error" }, 500);
  }
});