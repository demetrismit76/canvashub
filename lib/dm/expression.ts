// Convert Device Magic expressions into human-readable English
// and extract identifier dependencies.

const IDENT_RE = /\.([A-Za-z_][A-Za-z0-9_]*)/g;

export function extractIdentifiers(expr?: string): string[] {
  if (!expr) return [];
  const out = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = IDENT_RE.exec(expr))) out.add(m[1]);
  return [...out];
}

function pretty(id: string): string {
  return id.replace(/_/g, " ").trim();
}

function stripQuotes(s: string): string {
  s = s.trim();
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    return s.slice(1, -1);
  }
  return s;
}

/** Best-effort split of arguments respecting parentheses and quotes. */
function splitArgs(inside: string): string[] {
  const out: string[] = [];
  let depth = 0, q: string | null = null, buf = "";
  for (let i = 0; i < inside.length; i++) {
    const c = inside[i];
    if (q) {
      buf += c;
      if (c === q && inside[i - 1] !== "\\") q = null;
      continue;
    }
    if (c === '"' || c === "'") { q = c; buf += c; continue; }
    if (c === "(") { depth++; buf += c; continue; }
    if (c === ")") { depth--; buf += c; continue; }
    if (c === "," && depth === 0) { out.push(buf); buf = ""; continue; }
    buf += c;
  }
  if (buf.trim()) out.push(buf);
  return out.map((s) => s.trim());
}

function readableTerm(term: string): string {
  term = term.trim();
  if (!term) return "";
  // .Identifier reference
  if (term.startsWith(".")) return `“${pretty(term.slice(1))}”`;
  // Quoted literal
  if ((term.startsWith('"') || term.startsWith("'"))) return `"${stripQuotes(term)}"`;
  // Function call
  const fn = term.match(/^([A-Z_]+)\((.*)\)$/s);
  if (fn) return readableCall(fn[1], fn[2]);
  return term;
}

function readableCall(name: string, inside: string): string {
  const args = splitArgs(inside).map(readableTerm);
  switch (name) {
    case "CONTAINS":
      return `${args[0]} contains ${args[1]}`;
    case "NOT":
      return `not (${args[0]})`;
    case "AND":
      return args.join(" AND ");
    case "OR":
      return args.join(" OR ");
    case "ISEMPTY":
      return `${args[0]} is empty`;
    case "ISNOTEMPTY":
      return `${args[0]} is not empty`;
    case "ASSOCIATED_COLUMN":
      return `column ${args[0]}`;
    case "LENGTH":
      return `length of ${args[0]}`;
    default:
      return `${name}(${args.join(", ")})`;
  }
}

/** Convert a full expression to a readable sentence. */
export function expressionToReadable(expr?: string): string | undefined {
  if (!expr) return undefined;
  const trimmed = expr.trim();
  // Strip outer parens
  const fn = trimmed.match(/^([A-Z_]+)\((.*)\)$/s);
  if (fn) return capitalize(readableCall(fn[1], fn[2]));
  // Comparison: a OP b
  const cmp = trimmed.match(/^(.+?)\s*(=|!=|<=|>=|<|>)\s*(.+)$/);
  if (cmp) {
    const op = { "=": "equals", "!=": "does not equal", "<": "is less than", "<=": "is at most", ">": "is greater than", ">=": "is at least" }[cmp[2]];
    return capitalize(`${readableTerm(cmp[1])} ${op} ${readableTerm(cmp[3])}`);
  }
  return trimmed;
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Lowercase the first character only if it isn't part of an ALL-CAPS token
 *  (e.g. function names like NOTBLANK, AND, OR). */
function lowerFirst(s: string): string {
  const firstWord = s.match(/^[A-Za-z_]+/)?.[0] ?? "";
  if (firstWord.length > 1 && firstWord === firstWord.toUpperCase()) return s;
  return s.charAt(0).toLowerCase() + s.slice(1);
}

export function visibilitySentence(rule?: string, expr?: string): string | undefined {
  if (!expr && !rule) return undefined;
  const r = expressionToReadable(expr);
  if (!r) return rule ? `Visibility rule: ${rule}` : undefined;
  const prefix = rule === "unless" ? "Hidden when" : "Visible when";
  return `${prefix} ${lowerFirst(r)}`;
}

export function requiredSentence(rule?: string, expr?: string): string | undefined {
  if (!rule && !expr) return undefined;
  if (rule === "always") return "Always required";
  if (rule === "never") return "Never required";
  if (expr) {
    const r = expressionToReadable(expr);
    return `Required when ${r ? lowerFirst(r) : ""}`;
  }
  return `Required: ${rule}`;
}

export function readOnlySentence(rule?: string, expr?: string): string | undefined {
  if (!rule && !expr) return undefined;
  if (rule === "always") return "Always read-only";
  if (rule === "never") return "Never read-only";
  if (expr) {
    const r = expressionToReadable(expr);
    return `Read-only when ${r ? lowerFirst(r) : ""}`;
  }
  return `Read-only: ${rule}`;
}

export function filterSentence(expr?: string): string | undefined {
  if (!expr) return undefined;
  const r = expressionToReadable(expr);
  return r ? `Options filtered: ${lowerFirst(r)}` : undefined;
}

/* ------------------------------------------------------------------ */
/* Plain-English translator                                            */
/* ------------------------------------------------------------------ */

type Expr =
  | { t: "call"; name: string; args: Expr[] }
  | { t: "ref"; id: string }
  | { t: "lit"; value: string }
  | { t: "cmp"; op: string; l: Expr; r: Expr }
  | { t: "raw"; text: string };

/** Find first top-level comparison operator, respecting parens/quotes. */
function findTopCmp(s: string): { op: string; i: number; len: number } | null {
  let depth = 0, q: string | null = null;
  const ops = ["!=", "<=", ">=", "=", "<", ">"];
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) { if (c === q && s[i - 1] !== "\\") q = null; continue; }
    if (c === '"' || c === "'") { q = c; continue; }
    if (c === "(") { depth++; continue; }
    if (c === ")") { depth--; continue; }
    if (depth !== 0) continue;
    for (const op of ops) {
      if (s.startsWith(op, i)) return { op, i, len: op.length };
    }
  }
  return null;
}

function parseExpr(input: string): Expr {
  let s = input.trim();
  // Strip a single layer of outer parens if they wrap the whole expression
  while (s.startsWith("(") && s.endsWith(")")) {
    let depth = 0, wraps = true;
    for (let i = 0; i < s.length; i++) {
      if (s[i] === "(") depth++;
      else if (s[i] === ")") { depth--; if (depth === 0 && i < s.length - 1) { wraps = false; break; } }
    }
    if (wraps) s = s.slice(1, -1).trim(); else break;
  }
  const cmp = findTopCmp(s);
  if (cmp) {
    return { t: "cmp", op: cmp.op, l: parseExpr(s.slice(0, cmp.i)), r: parseExpr(s.slice(cmp.i + cmp.len)) };
  }
  const fn = s.match(/^([A-Z_]+)\((.*)\)$/s);
  if (fn) return { t: "call", name: fn[1], args: splitArgs(fn[2]).map(parseExpr) };
  if (s.startsWith(".")) return { t: "ref", id: s.slice(1) };
  if (s.startsWith('"') || s.startsWith("'")) return { t: "lit", value: stripQuotes(s) };
  return { t: "raw", text: s };
}

function joinList(items: string[], conj: "and" | "or"): string {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} ${conj} ${items[1]}`;
  return `${items.slice(0, -1).join(", ")} ${conj} ${items[items.length - 1]}`;
}

const PREDICATES: Record<string, { tail: (plural: boolean) => string }> = {
  NOTBLANK:   { tail: (p) => (p ? "are not blank" : "is not blank") },
  ISBLANK:    { tail: (p) => (p ? "are blank" : "is blank") },
  ISEMPTY:    { tail: (p) => (p ? "are empty" : "is empty") },
  ISNOTEMPTY: { tail: (p) => (p ? "are not empty" : "is not empty") },
  EXISTS:     { tail: (p) => (p ? "exist" : "exists") },
};

function renderRef(n: Expr): string { return n.t === "ref" ? `\u0001${n.id}\u0001` : ""; }

/** If every arg is a single-ref call to the same predicate, collapse them. */
function tryCollapsePredicate(args: Expr[], conj: "and" | "or"): string | null {
  if (args.length < 2) return null;
  if (!args.every((a) => a.t === "call" && (a as { name: string }).name in PREDICATES && (a as { args: Expr[] }).args.length === 1 && (a as { args: Expr[] }).args[0].t === "ref")) {
    return null;
  }
  const first = args[0] as Extract<Expr, { t: "call" }>;
  if (!args.every((a) => (a as Extract<Expr, { t: "call" }>).name === first.name)) return null;
  const refs = args.map((a) => renderRef((a as Extract<Expr, { t: "call" }>).args[0]));
  return `${joinList(refs, conj)} ${PREDICATES[first.name].tail(refs.length > 1)}`;
}

function renderEnglish(n: Expr): string {
  switch (n.t) {
    case "ref": return `\u0001${n.id}\u0001`;
    case "lit": return `"${n.value}"`;
    case "raw": return n.text;
    case "cmp": {
      const op: Record<string, string> = {
        "=": "equals", "!=": "does not equal",
        "<": "is less than", "<=": "is at most",
        ">": "is greater than", ">=": "is at least",
      };
      return `${renderEnglish(n.l)} ${op[n.op] ?? n.op} ${renderEnglish(n.r)}`;
    }
    case "call": {
      if (n.name === "AND" || n.name === "OR") {
        const conj = n.name === "AND" ? "and" : "or";
        const collapsed = tryCollapsePredicate(n.args, conj);
        if (collapsed) return collapsed;
        return joinList(n.args.map(renderEnglish), conj);
      }
      if (n.name === "NOT") return `not (${renderEnglish(n.args[0])})`;
      if (n.name in PREDICATES && n.args.length === 1) {
        return `${renderEnglish(n.args[0])} ${PREDICATES[n.name].tail(false)}`;
      }
      if (n.name === "CONTAINS" && n.args.length === 2) {
        return `${renderEnglish(n.args[0])} contains ${renderEnglish(n.args[1])}`;
      }
      if (n.name === "LENGTH" && n.args.length === 1) {
        return `length of ${renderEnglish(n.args[0])}`;
      }
      return `${n.name.toLowerCase()}(${n.args.map(renderEnglish).join(", ")})`;
    }
  }
}

export function expressionToPlainEnglish(expr?: string): string | undefined {
  if (!expr) return undefined;
  try {
    const ast = parseExpr(expr);
    const out = renderEnglish(ast).trim();
    return out || undefined;
  } catch {
    return undefined;
  }
}

/** Strip the bold markers used to highlight identifiers (for plain-text tooltips). */
export function stripPlainEnglishMarkers(s?: string): string | undefined {
  return s ? s.replace(/\u0001/g, "") : s;
}

export function visibilityPlainEnglish(rule?: string, expr?: string): string | undefined {
  const r = expressionToPlainEnglish(expr);
  if (!r) return undefined;
  const prefix = rule === "unless" ? "Hidden when" : "Only visible when";
  return `${prefix} ${r}`;
}

export function requiredPlainEnglish(rule?: string, expr?: string): string | undefined {
  if (rule === "always") return "Always required";
  if (rule === "never") return "Never required";
  const r = expressionToPlainEnglish(expr);
  return r ? `Required when ${r}` : undefined;
}

export function readOnlyPlainEnglish(rule?: string, expr?: string): string | undefined {
  if (rule === "always") return "Always read-only";
  if (rule === "never") return "Never read-only";
  const r = expressionToPlainEnglish(expr);
  return r ? `Read-only when ${r}` : undefined;
}

export function filterPlainEnglish(expr?: string): string | undefined {
  const r = expressionToPlainEnglish(expr);
  return r ? `Options shown only when ${r}` : undefined;
}

/* ------------------------------------------------------------------ */
/* Calculation translator                                              */
/* ------------------------------------------------------------------ */

/** Find the right-most top-level operator from `ops` (so we split left-assoc). */
function findTopOp(s: string, ops: string[]): { op: string; i: number } | null {
  let depth = 0, q: string | null = null;
  let found: { op: string; i: number } | null = null;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) { if (c === q && s[i - 1] !== "\\") q = null; continue; }
    if (c === '"' || c === "'") { q = c; continue; }
    if (c === "(") { depth++; continue; }
    if (c === ")") { depth--; continue; }
    if (depth !== 0) continue;
    // Skip operators in the very first position (treat as unary sign).
    if (i === 0) continue;
    for (const op of ops) {
      if (s[i] === op) {
        // Avoid splitting "*" inside identifier-ish contexts (unlikely) — none expected.
        found = { op, i };
        break;
      }
    }
  }
  return found;
}

function prettyRef(id: string): string { return `\u0001${id}\u0001`; }

function describeRef(raw: string): string {
  // raw like ".Identifier" or "table.column" or "table_resource.Column"
  const t = raw.trim();
  if (t.startsWith(".")) return prettyRef(t.slice(1));
  const dot = t.indexOf(".");
  if (dot > 0) {
    const table = t.slice(0, dot);
    const col = t.slice(dot + 1);
    return `${prettyRef(col)} (from ${table.replace(/_/g, " ")})`;
  }
  return t;
}

const AGG_LABEL: Record<string, string> = {
  SUM: "Sum of",
  AVG: "Average of",
  AVERAGE: "Average of",
  MEAN: "Average of",
  COUNT: "Number of",
  MIN: "Minimum of",
  MAX: "Maximum of",
  PRODUCT: "Product of",
  MULT: "Product of",
  ROUND: "Rounded",
  ABS: "Absolute value of",
  FIRST: "First of",
  LAST: "Last of",
  CONCAT: "Joined text of",
  IF: "If",
};

function describeCalc(input: string): string {
  let s = input.trim();
  // Strip wrapping parens
  while (s.startsWith("(") && s.endsWith(")")) {
    let depth = 0, wraps = true;
    for (let i = 0; i < s.length; i++) {
      if (s[i] === "(") depth++;
      else if (s[i] === ")") { depth--; if (depth === 0 && i < s.length - 1) { wraps = false; break; } }
    }
    if (wraps) s = s.slice(1, -1).trim(); else break;
  }
  // Additive
  const add = findTopOp(s, ["+", "-"]);
  if (add) {
    const word = add.op === "+" ? "plus" : "minus";
    return `${describeCalc(s.slice(0, add.i))} ${word} ${describeCalc(s.slice(add.i + 1))}`;
  }
  // Multiplicative
  const mul = findTopOp(s, ["*", "/"]);
  if (mul) {
    const word = mul.op === "*" ? "times" : "divided by";
    return `${describeCalc(s.slice(0, mul.i))} ${word} ${describeCalc(s.slice(mul.i + 1))}`;
  }
  // Function call
  const fn = s.match(/^([A-Z_]+)\((.*)\)$/s);
  if (fn) {
    const name = fn[1];
    const args = splitArgs(fn[2]).map((a) => describeCalc(a));
    const label = AGG_LABEL[name];
    if (label && args.length === 1) return `${label} ${args[0]}`;
    if (label) return `${label} ${joinList(args, "and")}`;
    return `${name.toLowerCase()}(${args.join(", ")})`;
  }
  // Reference (.foo or table.column)
  if (s.startsWith(".") || /^[A-Za-z_][A-Za-z0-9_]*\.[A-Za-z_]/.test(s)) {
    return describeRef(s);
  }
  // Literal string
  if (s.startsWith('"') || s.startsWith("'")) return `"${stripQuotes(s)}"`;
  // Number / raw
  return s;
}

export function calculationToPlainEnglish(expr?: string): string | undefined {
  if (!expr) return undefined;
  try {
    const out = describeCalc(expr).trim();
    return out ? capitalize(out) : undefined;
  } catch {
    return undefined;
  }
}

/** Return any raw calculation expression we can find on a DM node's raw payload. */
export function getCalculationExpr(raw: unknown): string | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const r = raw as Record<string, unknown>;
  const candidates = ["calculate_expr", "calculated_expr", "calculation", "formula", "expression"];
  for (const k of candidates) {
    const v = r[k];
    if (typeof v === "string" && v.trim()) return v;
  }
  return undefined;
}