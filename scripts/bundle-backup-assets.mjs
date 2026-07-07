#!/usr/bin/env node
// Bundles supabase/functions/** and supabase/migrations/** into a JSON
// asset consumed by the admin-backup edge function at runtime.
// Runs automatically via `prebuild` so the bundle stays fresh on every
// Lovable build.
import { readdirSync, readFileSync, writeFileSync, statSync, mkdirSync } from "node:fs";
import { join, relative, dirname } from "node:path";

const ROOT = process.cwd();
const OUT = join(ROOT, "supabase/functions/admin-backup/_assets.json");
const SELF = "supabase/functions/admin-backup";

function walk(dir) {
  const out = [];
  let entries;
  try { entries = readdirSync(dir); } catch { return out; }
  for (const name of entries) {
    const full = join(dir, name);
    const rel = relative(ROOT, full).replaceAll("\\", "/");
    if (rel.startsWith(SELF)) continue; // don't embed ourselves
    const st = statSync(full);
    if (st.isDirectory()) out.push(...walk(full));
    else if (st.size < 512 * 1024) out.push({ path: rel, contents: readFileSync(full, "utf8") });
  }
  return out;
}

const functions = walk(join(ROOT, "supabase/functions"));
const migrations = walk(join(ROOT, "supabase/migrations"));

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(
  OUT,
  JSON.stringify(
    { generated_at: new Date().toISOString(), functions, migrations },
    null,
    2,
  ) + "\n",
);
console.log(`[bundle-backup-assets] wrote ${functions.length} fn files, ${migrations.length} migrations -> ${relative(ROOT, OUT)}`);