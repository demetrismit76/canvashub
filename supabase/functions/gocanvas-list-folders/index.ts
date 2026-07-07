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
    const url = `${acc.base_url.replace(/\/$/, "")}/api/v3/folders?limit=200`;
    const r = await fetch(url, { headers });
    const text = await r.text();
    if (!r.ok) return json({ error: `GoCanvas ${r.status}: ${text}` }, 502);
    let parsed: unknown = null;
    try { parsed = JSON.parse(text); } catch { /* return raw */ }
    const items = Array.isArray((parsed as { data?: unknown[] })?.data)
      ? (parsed as { data: { id: string | number; name?: string; attributes?: { name?: string } }[] }).data
      : Array.isArray(parsed) ? parsed as { id: string | number; name?: string }[] : [];
    const folders = items.map((it) => ({
      id: String(it.id),
      name: (it as { name?: string }).name || (it as { attributes?: { name?: string } }).attributes?.name || `Folder ${it.id}`,
    }));
    return json({ folders });
  } catch (e) {
    console.error("gocanvas-list-folders error:", e);
    return json({ error: "Internal server error" }, 500);
  }
});