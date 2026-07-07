import { corsHeaders, json } from "../_shared/gocanvas.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { passphrase } = await req.json();
    const expected = Deno.env.get("ADMIN_PASSPHRASE");
    if (!expected) return json({ ok: false, error: "Server missing ADMIN_PASSPHRASE" }, 500);
    if (typeof passphrase !== "string" || passphrase !== expected) {
      return json({ ok: false }, 401);
    }
    return json({ ok: true });
  } catch (e) {
    return json({ ok: false, error: (e as Error).message }, 400);
  }
});