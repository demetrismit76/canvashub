import { corsHeaders, gcAuthHeaders, json, loadAccount, requireAdmin } from "../_shared/gocanvas.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const unauth = await requireAdmin(req);
  if (unauth) return unauth;
  try {
    const { accountId, payload } = await req.json();
    if (!accountId || !payload) return json({ error: "accountId and payload required" }, 400);
    const acc = await loadAccount(accountId);
    const headers = await gcAuthHeaders(acc);
    const url = `${acc.base_url.replace(/\/$/, "")}/api/v3/forms`;
    const r = await fetch(url, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const text = await r.text();
    let parsed: { data?: { id?: string }; id?: string } | null = null;
    try { parsed = JSON.parse(text); } catch { /* keep text */ }
    if (!r.ok) return json({ ok: false, status: r.status, error: text }, 502);
    const formId = parsed?.data?.id || parsed?.id || null;
    return json({ ok: true, form_id: formId, response: parsed ?? text });
  } catch (e) {
    console.error("gocanvas-push error:", e);
    return json({ ok: false, error: "Internal server error" }, 500);
  }
});