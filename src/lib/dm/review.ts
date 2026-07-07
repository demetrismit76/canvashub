import * as XLSX from "xlsx";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import type { DMSchema } from "@/lib/dm/types";
import type { ReviewMap, ReviewReason } from "@/hooks/useReviewFields";

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

export const REASON_OPTIONS: { value: ReviewReason; label: string }[] = (
  Object.keys(REASON_LABEL) as ReviewReason[]
).map((v) => ({ value: v, label: REASON_LABEL[v] }));

type Row = {
  path: string;
  screenGroup: string;
  field: string;
  identifier: string;
  type: string;
  reason: string;
  comment: string;
  suggested: string;
};

export function buildReviewRows(schema: DMSchema, map: ReviewMap): Row[] {
  const rows: Row[] = [];
  for (const id of schema.order) {
    const node = schema.nodes[id];
    if (!node || node.kind === "root") continue;
    const key = node.path && node.path.length ? node.path.join("/") : node.identifier;
    const entry = map[key];
    if (!entry || !entry.needsEdit) continue;
    const path = node.path.join(" > ");
    const screenGroup = node.path.slice(0, -1).join(" > ");
    rows.push({
      path,
      screenGroup,
      field: node.title,
      identifier: node.identifier,
      type: node.kind,
      reason: entry.reason ? REASON_LABEL[entry.reason] : "",
      comment: entry.comment ?? "",
      suggested: entry.suggested ?? "",
    });
  }
  return rows;
}

const HEADERS = [
  "Path",
  "Screen / Group",
  "Field",
  "Identifier",
  "Type",
  "Reason",
  "Comment",
  "Suggested Value",
] as const;

export function reviewToXlsxBlob(schema: DMSchema, map: ReviewMap): Blob {
  const rows = buildReviewRows(schema, map);
  const projectComment = map["__project__"]?.comment ?? "";
  const aoa: (string | number)[][] = [HEADERS as unknown as string[]];
  for (const r of rows) {
    aoa.push([r.path, r.screenGroup, r.field, r.identifier, r.type, r.reason, r.comment, r.suggested]);
  }
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = [{ wch: 32 }, { wch: 28 }, { wch: 24 }, { wch: 24 }, { wch: 12 }, { wch: 22 }, { wch: 48 }, { wch: 32 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Review");
  if (projectComment.trim()) {
    const notesWs = XLSX.utils.aoa_to_sheet([["Project notes"], [projectComment]]);
    notesWs["!cols"] = [{ wch: 100 }];
    XLSX.utils.book_append_sheet(wb, notesWs, "Project Notes");
  }
  const out = XLSX.write(wb, { type: "array", bookType: "xlsx" });
  return new Blob([out], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

function csvEscape(v: string): string {
  if (v == null) return "";
  const s = String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function reviewToCsv(schema: DMSchema, map: ReviewMap): string {
  const rows = buildReviewRows(schema, map);
  const projectComment = map["__project__"]?.comment ?? "";
  const lines: string[] = [HEADERS.map(csvEscape).join(",")];
  for (const r of rows) {
    lines.push([r.path, r.screenGroup, r.field, r.identifier, r.type, r.reason, r.comment, r.suggested].map(csvEscape).join(","));
  }
  const body = lines.join("\n");
  if (!projectComment.trim()) return body;
  return `# Project notes:\n# ${projectComment.replace(/\r?\n/g, "\n# ")}\n${body}`;
}

export function reviewToJson(schema: DMSchema, map: ReviewMap, fileName?: string | null): string {
  const rows = buildReviewRows(schema, map);
  const projectComment = map["__project__"]?.comment ?? "";
  return JSON.stringify(
    {
      file: fileName ?? null,
      generatedAt: new Date().toISOString(),
      projectComment: projectComment || null,
      count: rows.length,
      items: rows.map((r) => ({
        path: r.path,
        screenGroup: r.screenGroup,
        field: r.field,
        identifier: r.identifier,
        type: r.type,
        reason: r.reason,
        comment: r.comment,
        suggested: r.suggested,
      })),
    },
    null,
    2,
  );
}

/**
 * Render the review punch-list as a clean, modern PDF.
 * Table-based layout, compact header, only the columns reviewers actually need.
 */
export function reviewToPdfBlob(
  schema: DMSchema,
  map: ReviewMap,
  fileName?: string | null,
  revision?: number,
): Blob {
  const rows = buildReviewRows(schema, map);
  const projectComment = (map["__project__"]?.comment ?? "").trim();

  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 36;

  // ── Header ──────────────────────────────────────────────────────────────
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(17, 24, 39); // slate-900
  doc.text("Review Punch-List", margin, margin + 4);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(107, 114, 128); // slate-500
  const metaLeft = fileName ? fileName : "—";
  const metaRight = `${rows.length} item${rows.length === 1 ? "" : "s"}${revision && revision > 1 ? `  ·  R${revision}` : ""}  ·  ${new Date().toLocaleString()}`;
  doc.text(metaLeft, margin, margin + 20);
  doc.text(metaRight, pageW - margin, margin + 20, { align: "right" });

  // Divider
  doc.setDrawColor(229, 231, 235); // slate-200
  doc.setLineWidth(0.5);
  doc.line(margin, margin + 28, pageW - margin, margin + 28);

  let startY = margin + 40;

  // Optional project notes block
  if (projectComment) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(55, 65, 81);
    doc.text("Project notes", margin, startY);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(75, 85, 99);
    const wrapped = doc.splitTextToSize(projectComment, pageW - margin * 2);
    doc.text(wrapped, margin, startY + 12);
    startY = startY + 12 + wrapped.length * 11 + 10;
  }

  // ── Table ───────────────────────────────────────────────────────────────
  const head = [["#", "Field", "Identifier", "Reason", "Comment", "Suggested"]];
  const body = rows.map((r, i) => [
    String(i + 1),
    r.field || "—",
    r.identifier || "—",
    r.reason || "—",
    r.comment || "",
    r.suggested || "",
  ]);

  if (body.length === 0) {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(11);
    doc.setTextColor(107, 114, 128);
    doc.text("No fields flagged for review.", margin, startY + 8);
  } else {
    autoTable(doc, {
      head,
      body,
      startY,
      margin: { left: margin, right: margin, bottom: margin + 16 },
      styles: {
        font: "helvetica",
        fontSize: 9,
        cellPadding: 6,
        overflow: "linebreak",
        textColor: [31, 41, 55],
        lineColor: [229, 231, 235],
        lineWidth: 0.5,
        valign: "top",
      },
      headStyles: {
        fillColor: [17, 24, 39],
        textColor: [255, 255, 255],
        fontStyle: "bold",
        fontSize: 9,
        halign: "left",
      },
      alternateRowStyles: { fillColor: [249, 250, 251] },
      columnStyles: {
        0: { cellWidth: 32, halign: "right", textColor: [156, 163, 175], overflow: "visible" },
        1: { cellWidth: 130, fontStyle: "bold" },
        2: { cellWidth: 130, font: "courier", fontSize: 8, textColor: [75, 85, 99] },
        3: { cellWidth: 100 },
        4: { cellWidth: "auto" },
        5: { cellWidth: 140 },
      },
      didDrawPage: () => {
        const page = doc.getCurrentPageInfo().pageNumber;
        const total = doc.getNumberOfPages();
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.setTextColor(156, 163, 175);
        doc.text(`Page ${page} of ${total}`, pageW - margin, pageH - margin / 2, {
          align: "right",
        });
        doc.text("Review Punch-List", margin, pageH - margin / 2);
      },
    });
  }

  return doc.output("blob");
}