import * as XLSX from "xlsx";
import type { DMSchema, DMNode } from "@/lib/dm/types";
import type { ReviewMap, ReviewReason } from "@/hooks/useReviewFields";
import { doneKey } from "@/hooks/useDoneFields";

const REASON_LABEL: Record<ReviewReason, string> = {
  condition: "Condition needed",
  initial: "Initial value needed",
  identifier: "Identifier change",
  options: "Options change",
  required: "Required change",
  control_type: "Control type changed",
  visibility: "Visibility issue",
  other: "Other",
};

export type FullRow = {
  breadcrumb: string;
  screenGroup: string;
  field: string;
  identifier: string;
  type: string;
  depth: number;
  required: string;
  readOnly: string;
  visibility: string;
  filter: string;
  options: string;
  initial: string;
  hint: string;
  description: string;
  multiple: string;
  loop: string;
  done: string;
  reviewed: string;
  reviewReason: string;
  reviewComment: string;
  reviewSuggested: string;
};

function fmtOptions(n: DMNode): string {
  if (n.optionsResource) return `Resource: ${n.optionsResource}`;
  if (n.optionsTable) return `Table: ${n.optionsTable}`;
  if (Array.isArray(n.options) && n.options.length) {
    const labels = n.options.map((o) => {
      if (o && typeof o === "object") {
        const r = o as Record<string, unknown>;
        return String(r.label ?? r.title ?? r.value ?? r.identifier ?? "");
      }
      return String(o ?? "");
    }).filter(Boolean);
    return labels.join(" | ");
  }
  return "";
}

function fmtInitial(v: unknown): string {
  if (v === undefined || v === null || v === "") return "";
  if (typeof v === "object") { try { return JSON.stringify(v); } catch { return String(v); } }
  return String(v);
}

function fmtRequired(n: DMNode): string {
  if (n.requiredReadable) return n.requiredReadable;
  if (n.requiredRule === "always" || n.requiredRule === "true") return "Always required";
  if (n.requiredRule && n.requiredRule !== "never") return n.requiredRule;
  return "";
}

function fmtReadOnly(n: DMNode): string {
  if (n.readOnlyReadable) return n.readOnlyReadable;
  if (n.readOnly) return "Yes";
  if (n.readOnlyRule && n.readOnlyRule !== "never") return n.readOnlyRule;
  return "";
}

export function buildFullRows(
  schema: DMSchema,
  done: Record<string, boolean>,
  review: ReviewMap,
): FullRow[] {
  const rows: FullRow[] = [];
  for (const id of schema.order) {
    const n = schema.nodes[id];
    if (!n || n.kind === "root") continue;
    const key = doneKey(n);
    const r = review[key];
    rows.push({
      breadcrumb: n.path.join(" > "),
      screenGroup: n.path.slice(0, -1).join(" > "),
      field: n.title,
      identifier: n.identifier,
      type: n.kind,
      depth: n.depth,
      required: fmtRequired(n),
      readOnly: fmtReadOnly(n),
      visibility: n.visibleReadable ?? n.visibleExpr ?? "",
      filter: n.optionsFilterReadable ?? n.optionsFilterExpr ?? "",
      options: fmtOptions(n),
      initial: fmtInitial(n.initialAnswer),
      hint: n.hint ?? "",
      description: n.description ?? "",
      multiple: n.multiple ? "Yes" : "",
      loop: n.isLoop ? "Yes" : "",
      done: done[key] ? "Yes" : "",
      reviewed: r?.needsEdit ? "Flagged" : (r ? "Noted" : ""),
      reviewReason: r?.reason ? REASON_LABEL[r.reason] : "",
      reviewComment: r?.comment ?? "",
      reviewSuggested: r?.suggested ?? "",
    });
  }
  return rows;
}

const HEADERS = [
  "Path (Breadcrumb)",
  "Screen / Group",
  "Field",
  "Identifier",
  "Type",
  "Depth",
  "Required",
  "Read-only",
  "Visibility",
  "Filter",
  "Options",
  "Initial Value",
  "Hint",
  "Description",
  "Multiple",
  "Loop",
  "Done",
  "Reviewed",
  "Review Reason",
  "Review Comment",
  "Suggested Value",
] as const;

const KEYS: (keyof FullRow)[] = [
  "breadcrumb","screenGroup","field","identifier","type","depth",
  "required","readOnly","visibility","filter","options","initial",
  "hint","description","multiple","loop","done","reviewed",
  "reviewReason","reviewComment","reviewSuggested",
];

function summary(schema: DMSchema, rows: FullRow[]) {
  const total = rows.length;
  const done = rows.filter((r) => r.done).length;
  const flagged = rows.filter((r) => r.reviewed === "Flagged").length;
  return [
    ["Form", (schema.nodes[schema.rootId]?.raw as { title?: string } | undefined)?.title ?? ""],
    ["Generated", new Date().toISOString()],
    ["Total fields", String(total)],
    ["Groups", String(schema.stats.groups)],
    ["Loops", String(schema.stats.loops)],
    ["Conditional (visibility)", String(schema.stats.withVisibility)],
    ["Required", String(schema.stats.withRequired)],
    ["With filter", String(schema.stats.withFilter)],
    ["Done / Checked", `${done} / ${total}`],
    ["Flagged for review", String(flagged)],
  ];
}

export function fullToXlsxBlob(schema: DMSchema, done: Record<string, boolean>, review: ReviewMap): Blob {
  const rows = buildFullRows(schema, done, review);
  const wb = XLSX.utils.book_new();

  // Summary sheet
  const sumAoa: (string | number)[][] = [["Field report"], [], ...summary(schema, rows)];
  const sumWs = XLSX.utils.aoa_to_sheet(sumAoa);
  sumWs["!cols"] = [{ wch: 28 }, { wch: 60 }];
  XLSX.utils.book_append_sheet(wb, sumWs, "Summary");

  // Fields sheet
  const aoa: (string | number)[][] = [HEADERS as unknown as string[]];
  for (const r of rows) aoa.push(KEYS.map((k) => (r[k] as string | number) ?? ""));
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = [
    { wch: 44 },{ wch: 28 },{ wch: 28 },{ wch: 26 },{ wch: 12 },{ wch: 6 },
    { wch: 22 },{ wch: 18 },{ wch: 40 },{ wch: 40 },{ wch: 40 },{ wch: 22 },
    { wch: 30 },{ wch: 40 },{ wch: 10 },{ wch: 8 },{ wch: 8 },{ wch: 12 },
    { wch: 22 },{ wch: 48 },{ wch: 28 },
  ];
  ws["!freeze"] = { xSplit: 0, ySplit: 1 } as never;
  if (rows.length) {
    ws["!autofilter"] = { ref: XLSX.utils.encode_range({ s: { c: 0, r: 0 }, e: { c: HEADERS.length - 1, r: rows.length } }) };
  }
  // Bold header
  for (let c = 0; c < HEADERS.length; c++) {
    const addr = XLSX.utils.encode_cell({ c, r: 0 });
    const cell = ws[addr];
    if (cell) cell.s = { font: { bold: true } };
  }
  XLSX.utils.book_append_sheet(wb, ws, "Fields");

  const out = XLSX.write(wb, { type: "array", bookType: "xlsx" });
  return new Blob([out], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

function csvEscape(v: string | number): string {
  if (v == null) return "";
  const s = String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function fullToCsv(schema: DMSchema, done: Record<string, boolean>, review: ReviewMap): string {
  const rows = buildFullRows(schema, done, review);
  const meta = summary(schema, rows).map(([k, v]) => `# ${k}: ${v}`).join("\n");
  const head = HEADERS.map(csvEscape).join(",");
  const body = rows.map((r) => KEYS.map((k) => csvEscape((r[k] as string | number) ?? "")).join(",")).join("\n");
  return `${meta}\n${head}\n${body}\n`;
}