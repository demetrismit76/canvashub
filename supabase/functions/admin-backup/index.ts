import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import JSZip from "npm:jszip@3.10.1";
import assets from "./_assets.json" with { type: "json" };

// Tables to export, in dependency-friendly order. Storage / auth / vault are intentionally skipped.
const PUBLIC_TABLES = [
  "profiles",
  "user_roles",
  "teams",
  "team_members",
  "pending_invites",
  "form_files",
  "form_files_done",
  "form_files_review",
  "file_statuses",
  "review_shares",
  "review_share_responses",
  "gocanvas_accounts",
  "org_settings",
  "audit_log",
] as const;

function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return "";
  let s: string;
  if (typeof v === "object") s = JSON.stringify(v);
  else s = String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function rowsToCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "";
  const headers = Array.from(
    rows.reduce((set, r) => {
      for (const k of Object.keys(r)) set.add(k);
      return set;
    }, new Set<string>()),
  );
  const lines = [headers.join(",")];
  for (const r of rows) lines.push(headers.map((h) => csvEscape(r[h])).join(","));
  return lines.join("\n");
}

function sqlLiteral(v: unknown): string {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
  if (v instanceof Date) return `'${v.toISOString()}'`;
  let s: string;
  if (typeof v === "object") s = JSON.stringify(v);
  else s = String(v);
  return `'${s.replace(/'/g, "''")}'`;
}

function rowsToInsertSql(table: string, rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return `-- no rows for public.${table}\n`;
  const cols = Array.from(
    rows.reduce((s, r) => {
      for (const k of Object.keys(r)) s.add(k);
      return s;
    }, new Set<string>()),
  );
  const colList = cols.map((c) => `"${c}"`).join(", ");
  const lines: string[] = [];
  for (const r of rows) {
    const vals = cols.map((c) => sqlLiteral(r[c])).join(", ");
    lines.push(`INSERT INTO public."${table}" (${colList}) VALUES (${vals});`);
  }
  return lines.join("\n") + "\n";
}

function buildSchemaSql(): string {
  // Concatenates every migration in chronological order — this IS the canonical
  // schema definition for the project (enums, tables, GRANTs, RLS, policies,
  // functions, triggers).
  const migrations = (assets.migrations as { path: string; contents: string }[])
    .slice()
    .sort((a, b) => a.path.localeCompare(b.path));

  const parts: string[] = [
    "-- ============================================================",
    "-- Schema dump (concatenated migrations) for DeviceCanvas",
    `-- Generated: ${new Date().toISOString()}`,
    "-- Replay on a fresh Postgres database (e.g. via psql -f schema.sql)",
    "-- ============================================================",
    "",
  ];
  for (const m of migrations) {
    parts.push(`-- ---------------- ${m.path} ----------------`);
    parts.push(m.contents.trim());
    parts.push("");
  }
  return parts.join("\n");
}

function buildRestoreMd(rowCounts: Record<string, number>, scope: string): string {
  const counts = Object.entries(rowCounts)
    .map(([t, c]) => `- \`${t}\` — ${c} rows`)
    .join("\n");
  const secrets = [
    "LOVABLE_API_KEY",
    "ADMIN_PASSPHRASE",
    "SUPABASE_URL",
    "SUPABASE_ANON_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
  ];
  return `# DeviceCanvas — Backup & Restore Guide

_Generated: ${new Date().toISOString()}_
_Scope: ${scope}_

This bundle contains everything needed to rebuild the app on another platform.
No secrets, JWTs, or service-role keys are included.

## What's in this ZIP

| Path | What it is |
|------|------------|
| \`schema.sql\` | Full database structure — enums, tables, indexes, RLS policies, GRANTs, functions, triggers (concatenated migration history). |
| \`full-dump.sql\` | \`schema.sql\` followed by \`INSERT\` statements for every row in every public table. Single-file restore. |
| \`data/*.csv\` | One CSV per table for easy spreadsheet / non-Postgres imports. |
| \`data-json/*.json\` | Same data as JSON — friendly for Mongo, Firebase, custom platforms. |
| \`functions/\` | Edge function source code (\`supabase/functions/*\`). |
| \`migrations/\` | Individual migration files in chronological order. |
| \`manifest.json\` | Row counts + generation metadata. |

## Row counts

${counts}

---

## Option A — Rebuild on Postgres / Supabase (recommended)

1. Create a new Postgres database (Supabase, RDS, local — any modern Postgres).
2. Run the schema:
   \`\`\`bash
   psql "$DATABASE_URL" -f schema.sql
   \`\`\`
3. Load the data — easiest is the combined dump:
   \`\`\`bash
   psql "$DATABASE_URL" -f full-dump.sql
   \`\`\`
   Or load individual CSVs:
   \`\`\`bash
   psql "$DATABASE_URL" -c "\\copy public.profiles FROM 'data/profiles.csv' CSV HEADER"
   # ...repeat per table in dependency order
   \`\`\`
4. Re-create auth users (see "Auth users" below).
5. Deploy the edge functions from \`functions/\` (Supabase CLI: \`supabase functions deploy <name>\`).
6. Configure the secrets listed below in the new project.

## Option B — Rebuild on a non-Postgres backend (Firebase, Mongo, MySQL, custom)

1. Use \`data-json/*.json\` as the source of truth for rows.
2. Re-create equivalent collections / tables on the target.
3. Re-implement the access rules. The RLS policies in \`schema.sql\` are the
   authoritative spec for who can read / write what — port them to the target
   platform's security model (Firestore rules, application-layer guards, etc.).
4. Re-implement edge-function behaviour from the source in \`functions/\` in
   whichever serverless runtime you choose.

## Option C — Re-deploy edge functions only

Copy \`functions/\` into a Supabase project's \`supabase/functions\` directory
and run \`supabase functions deploy <name>\` for each one.

## Auth users

The \`auth.users\` table is managed by Supabase Auth and is not exported here
(Lovable Cloud does not expose it). On the new platform either:

- Re-invite users (they will sign up with the same email and a new password), or
- Use the target platform's auth admin API to bulk-import users from your own
  IdP / CSV.

The \`profiles\` table preserves \`user_id\` references, so once auth users exist
with matching IDs, all relations resolve automatically.

## Secrets to reconfigure

These names are referenced by the code. Add them in the new project with your
own values:

${secrets.map((s) => `- \`${s}\``).join("\n")}

Plus any third-party API keys you originally set (GoCanvas, etc.).

## Storage buckets

None exist in this project, so nothing to migrate.

---

_Generated by the Admin → Backup & Export tool._
`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const token = authHeader.replace("Bearer ", "");
    const { data: claims, error: claimsErr } = await userClient.auth.getClaims(token);
    if (claimsErr || !claims?.claims?.sub) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: isAdmin, error: roleErr } = await userClient.rpc("is_super_admin", {
      _user_id: claims.claims.sub,
    });
    if (roleErr || !isAdmin) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const url = new URL(req.url);
    const scope = (url.searchParams.get("scope") ?? "all").toLowerCase();
    const includeSchema = scope === "all" || scope === "schema";
    const includeData = scope === "all" || scope === "data";

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );

    const zip = new JSZip();
    const rowCounts: Record<string, number> = {};
    const schemaSql = buildSchemaSql();

    if (includeSchema) {
      zip.file("schema.sql", schemaSql);
      for (const m of assets.migrations as { path: string; contents: string }[]) {
        const name = m.path.split("/").pop()!;
        zip.file(`migrations/${name}`, m.contents);
      }
      for (const f of assets.functions as { path: string; contents: string }[]) {
        const rel = f.path.replace(/^supabase\/functions\//, "");
        zip.file(`functions/${rel}`, f.contents);
      }
    }

    const fullDumpParts: string[] = [];
    if (includeData) {
      if (includeSchema) fullDumpParts.push(schemaSql, "\n-- ============ DATA ============\n");
      for (const table of PUBLIC_TABLES) {
        const { data, error } = await admin.from(table).select("*");
        if (error) {
          zip.file(`data/${table}.error.txt`, error.message);
          rowCounts[table] = -1;
          continue;
        }
        const rows = (data ?? []) as Record<string, unknown>[];
        rowCounts[table] = rows.length;
        zip.file(`data/${table}.csv`, rowsToCsv(rows));
        zip.file(`data-json/${table}.json`, JSON.stringify(rows, null, 2));
        fullDumpParts.push(`-- ---- ${table} (${rows.length} rows) ----`);
        fullDumpParts.push(rowsToInsertSql(table, rows));
      }
      if (includeSchema) zip.file("full-dump.sql", fullDumpParts.join("\n"));
    }

    zip.file(
      "manifest.json",
      JSON.stringify(
        {
          generated_at: new Date().toISOString(),
          generated_by: claims.claims.email ?? claims.claims.sub,
          scope,
          row_counts: rowCounts,
          tables: PUBLIC_TABLES,
          functions: (assets.functions as { path: string }[]).map((f) => f.path),
          migrations: (assets.migrations as { path: string }[]).map((m) => m.path),
        },
        null,
        2,
      ),
    );

    zip.file("RESTORE.md", buildRestoreMd(rowCounts, scope));

    const blob = await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });

    // Audit (best-effort, ignore failures)
    try {
      await admin.rpc("log_audit", {
        p_action: "backup.downloaded",
        p_target_type: "system",
        p_target_id: "backup",
        p_meta: { scope, size_bytes: blob.byteLength, row_counts: rowCounts },
      });
    } catch (_) {
      // best-effort
    }

    const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    return new Response(blob, {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="devicecanvas-backup-${scope}-${ts}.zip"`,
      },
    });
  } catch (e) {
    console.error("admin-backup error", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});