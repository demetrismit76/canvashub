import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import JSZip from "npm:jszip@3.10.1";

// Insertion order: parents first, children last (mirrors FK graph).
const RESTORE_ORDER = [
  "profiles",
  "teams",
  "gocanvas_accounts",
  "org_settings",
  "user_roles",
  "team_members",
  "pending_invites",
  "form_files",
  "form_files_done",
  "form_files_review",
  "file_statuses",
  "review_shares",
  "review_share_responses",
] as const;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const jwt = authHeader.replace(/^Bearer\s+/i, "");
    if (!jwt) return json({ error: "missing auth" }, 401);

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Caller identity via anon client + caller JWT
    const userClient = createClient(SUPABASE_URL, ANON, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) return json({ error: "unauthorized" }, 401);

    // Admin client (service role) for the protected RPCs and to bypass RLS
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    const { data: isAdmin, error: roleErr } = await admin.rpc("is_super_admin", {
      _user_id: userData.user.id,
    });
    if (roleErr || !isAdmin) return json({ error: "forbidden" }, 403);

    // We need to forward the caller's JWT to the restore RPCs so the
    // `auth.uid()` check inside admin_restore_* still passes — those RPCs
    // verify is_super_admin(auth.uid()) and we want the audit log to attribute
    // the action to the actual admin who triggered it.
    const callerClient = createClient(SUPABASE_URL, SERVICE_ROLE, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
    });

    if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

    const buf = new Uint8Array(await req.arrayBuffer());
    if (buf.byteLength === 0) return json({ error: "empty body" }, 400);
    if (buf.byteLength > 64 * 1024 * 1024) {
      return json({ error: "backup zip too large (max 64MB)" }, 413);
    }

    const zip = await JSZip.loadAsync(buf);

    // Collect data-json/*.json
    const fileMap = new Map<string, string>();
    for (const [name, entry] of Object.entries(zip.files)) {
      if (entry.dir) continue;
      const m = name.match(/^data-json\/([a-z0-9_]+)\.json$/);
      if (m) fileMap.set(m[1], await entry.async("string"));
    }
    if (fileMap.size === 0) {
      return json(
        { error: "no data-json/*.json found in zip. Use a full backup (.zip)." },
        400,
      );
    }

    // Parse all JSON first; abort the whole restore on any parse error.
    const parsed = new Map<string, unknown[]>();
    for (const [table, text] of fileMap) {
      if (!(RESTORE_ORDER as readonly string[]).includes(table)) continue;
      try {
        const arr = JSON.parse(text);
        if (!Array.isArray(arr)) throw new Error("not an array");
        parsed.set(table, arr);
      } catch (e) {
        return json({ error: `bad JSON for ${table}: ${(e as Error).message}` }, 400);
      }
    }

    // 1. Truncate (children first - CASCADE handles the rest)
    const truncList = [...RESTORE_ORDER].reverse().filter((t) => parsed.has(t));
    const { error: tErr } = await callerClient.rpc("admin_restore_truncate", {
      p_tables: truncList,
    });
    if (tErr) return json({ error: `truncate failed: ${tErr.message}` }, 500);

    // 2. Insert in parent-first order
    const report: Record<string, number> = {};
    for (const table of RESTORE_ORDER) {
      const rows = parsed.get(table);
      if (!rows || rows.length === 0) {
        report[table] = 0;
        continue;
      }
      const { data: inserted, error: iErr } = await callerClient.rpc(
        "admin_restore_insert",
        { p_table: table, p_rows: rows },
      );
      if (iErr) {
        return json(
          { error: `insert failed for ${table}: ${iErr.message}`, partial: report },
          500,
        );
      }
      report[table] = (inserted as number) ?? rows.length;
    }

    return json({ ok: true, restored: report });
  } catch (e) {
    console.error("admin-restore error", e);
    return json({ error: (e as Error).message ?? "internal error" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}