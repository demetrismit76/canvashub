import { DMNode, DMRawNode, DMSchema, FieldKind } from "./types";
import { expressionToReadable, extractIdentifiers, filterSentence, requiredSentence, visibilitySentence, visibilityPlainEnglish, requiredPlainEnglish, filterPlainEnglish, readOnlySentence, readOnlyPlainEnglish } from "./expression";

function classify(raw: DMRawNode): FieldKind {
  const t = (raw.type || "").toLowerCase();
  if (t === "root") return "root";
  if (t === "group") {
    // A group is a sub-screen only when explicitly bounded to exactly one occurrence
    // (minOccurs:1, maxOccurs:1). Anything else (missing bounds, or maxOccurs != 1)
    // is treated as a repeat/loop.
    const isSingle = raw.minOccurs === 1 && raw.maxOccurs === 1;
    const isLoop = !isSingle;
    return isLoop ? "loop" : "group";
  }
  if (t === "calculation" || t === "calculated" || t === "score" || t === "computed") return "calculation";
  // Detect calculation by presence of a formula/expression on a leaf node.
  const hasFormula =
    raw.calculation !== undefined ||
    raw.formula !== undefined ||
    raw.expression !== undefined ||
    (raw as { calculated_expr?: unknown }).calculated_expr !== undefined;
  if (hasFormula && t !== "group") return "calculation";
  // Normalize numeric aliases
  if (t === "decimal" || t === "integer" || t === "int" || t === "float" || t === "currency") return "number";
  if (t === "datetime" || t === "date_time" || t === "timestamp") return "date";
  if (t === "time" || t === "start" || t === "finish" || t === "timer" || t === "duration" || t === "stopwatch" || t === "elapsed") return "time";
  if (t === "location" || t === "gps" || t === "geolocation") return "location";
  if (t === "sketch" || t === "drawing" || t === "annotation") return "sketch";
  if (t === "barcode" || t === "qr" || t === "qrcode") return "barcode";
  if (t === "audio" || t === "sound" || t === "recording") return "audio";
  if (t === "video") return "video";
  if (t === "file" || t === "attachment" || t === "document") return "file";
  if (t === "label" || t === "static" || t === "instruction" || t === "note") return "label";
  if (t === "phone" || t === "tel" || t === "telephone" || t === "phone_number" || t === "phonenumber" || t === "mobile") return "phone";
  if (t === "url" || t === "link" || t === "website") return "url";
  if (["select", "boolean", "email", "text", "number", "date", "image", "signature"].includes(t)) {
    return t as FieldKind;
  }
  return "unknown";
}

let _id = 0;
function nextId() { return `n${(_id++).toString(36)}`; }

export function parseDeviceMagic(json: unknown): DMSchema {
  _id = 0;
  const nodes: Record<string, DMNode> = {};
  const order: string[] = [];
  const byIdentifier: Record<string, string> = {};

  const rootRaw = json as DMRawNode;

  function visit(raw: DMRawNode, parentId: string | null, path: string[], depth: number): string {
    const id = nextId();
    const kind = classify(raw);
    const isLoop = kind === "loop";
    const isGroup = kind === "group" || isLoop;
    // Read-only detection — Device Magic / GoCanvas use a few different keys.
    const r = raw as Record<string, unknown>;
    // Read-only rule/expression — mirrors required_rule/required_expr.
    const readOnlyRule = (r.read_only_rule ?? r.readOnly_rule ?? r.readonly_rule) as string | undefined;
    const readOnlyExpr = (r.read_only_expr ?? r.readOnly_expr ?? r.readonly_expr) as string | undefined;
    const readOnlyFlag =
      r.read_only === true ||
      r.readOnly === true ||
      r.readonly === true ||
      r.is_read_only === true ||
      r.editable === false ||
      r.disabled === true;
    const readOnly =
      readOnlyFlag ||
      readOnlyRule === "always" ||
      (!!readOnlyRule && readOnlyRule !== "never") ||
      !!readOnlyExpr ||
      kind === "calculation";
    const identifier = raw.identifier || (kind === "root" ? "__root__" : `unnamed_${id}`);
    const title = raw.title || identifier;
    const node: DMNode = {
      id,
      parentId,
      depth,
      path: [...path, identifier],
      kind,
      rawType: raw.type,
      identifier,
      title,
      hint: raw.hint,
      description: raw.description,
      initialAnswer: raw.initialAnswer,
      multiple: raw.multiple,
      multiLine: raw.multi_line,
      minOccurs: raw.minOccurs,
      maxOccurs: raw.maxOccurs,
      isLoop,
      isGroup,
      readOnly,
      readOnlyRule: readOnlyRule,
      readOnlyExpr: readOnlyExpr,
      readOnlyReadable: readOnlySentence(readOnlyRule, readOnlyExpr),
      readOnlyPlain: readOnlyPlainEnglish(readOnlyRule, readOnlyExpr),
      hidden: r.hidden === true || r.is_hidden === true,
      options: raw.options,
      optionsResource: raw.options_resource,
      optionsTable: raw.options_table,
      optionsFilterExpr: raw.options_filter_expr,
      optionsFilterReadable: filterSentence(raw.options_filter_expr),
      visibleExpr: raw.visible_expr,
      visibleReadable: visibilitySentence(raw.visible_rule, raw.visible_expr),
      requiredRule: raw.required_rule,
      requiredReadable: requiredSentence(raw.required_rule, raw.required_expr),
      visiblePlain: visibilityPlainEnglish(raw.visible_rule, raw.visible_expr),
      requiredPlain: requiredPlainEnglish(raw.required_rule, raw.required_expr),
      optionsFilterPlain: filterPlainEnglish(raw.options_filter_expr),
      dependsOn: Array.from(new Set([
        ...extractIdentifiers(raw.visible_expr),
        ...extractIdentifiers(raw.options_filter_expr),
        ...extractIdentifiers(raw.required_expr),
        ...extractIdentifiers(readOnlyExpr),
      ])),
      childrenIds: [],
      raw,
    };
    nodes[id] = node;
    order.push(id);
    if (raw.identifier) byIdentifier[raw.identifier] = id;
    const childPath = isGroup || kind === "root" ? node.path : path;
    for (const c of raw.children || []) {
      const cid = visit(c, id, childPath, depth + 1);
      node.childrenIds.push(cid);
    }
    return id;
  }

  const rootId = visit(rootRaw, null, [], 0);

  const stats = {
    total: order.length - 1,
    byKind: {} as Record<string, number>,
    withVisibility: 0,
    withRequired: 0,
    withFilter: 0,
    loops: 0,
    groups: 0,
  };
  for (const id of order) {
    const n = nodes[id];
    if (n.kind === "root") continue;
    stats.byKind[n.kind] = (stats.byKind[n.kind] || 0) + 1;
    if (n.visibleExpr) stats.withVisibility++;
    if (n.requiredRule) stats.withRequired++;
    if (n.optionsFilterExpr) stats.withFilter++;
    if (n.isLoop) stats.loops++;
    else if (n.isGroup) stats.groups++;
  }

  return { rootId, nodes, order, byIdentifier, stats };
}

/** All fields whose visibility/required/filter expressions reference `identifier`. */
export function dependentsOf(schema: DMSchema, identifier: string): DMNode[] {
  return schema.order
    .map((id) => schema.nodes[id])
    .filter((n) => n.dependsOn.includes(identifier));
}

export { expressionToReadable };

/**
 * Sanitize an identifier segment for placeholder paths:
 * - non-alphanumerics → `_`
 * - prefix `_` if it starts with a digit
 */
function sanitizeSegment(seg: string): string {
  let s = seg.replace(/[^A-Za-z0-9]/g, "_");
  if (/^[0-9]/.test(s)) s = "_" + s;
  return s;
}

/**
 * Build a placeholder path like `fields.Location.Test_question`.
 * The synthetic root identifier (`__root__`) is replaced with `fields`,
 * and each subsequent segment is sanitized.
 */
export function placeholderPath(path: string[]): string {
  const segs = path.map((p, i) => (i === 0 ? "fields" : sanitizeSegment(p)));
  return segs.join(".");
}