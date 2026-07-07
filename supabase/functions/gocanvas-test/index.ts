import { corsHeaders, gcAuthHeaders, json, loadAccount, requireAdmin } from "../_shared/gocanvas.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const unauth = await requireAdmin(req);
  if (unauth) return unauth;
  try {
    const { accountId } = await req.json();
    if (!accountId) return json({ error: "accountId required" }, 400);
    const acc = await loadAccount(accountId);
    const headers = await gcAuthHeaders(acc);
    // Use a lightweight folders/me endpoint; fall back to a plain /api/v3/folders call.
    const url = `${acc.base_url.replace(/\/$/, "")}/api/v3/folders?limit=1`;
    const r = await fetch(url, { headers });
    const text = await r.text();
    return json({ ok: r.ok, status: r.status, sample: text.slice(0, 400) });
  } catch (e) {
    console.error("gocanvas-test error:", e);
    return json({ ok: false, error: "Internal server error" }, 500);
  }
});