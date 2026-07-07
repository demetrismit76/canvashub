import { DMNode, DMSchema } from "./types";

export type GCField = {
  identifier: string;
  label: string;
  gcType: string;
  required: boolean;
  visibilityNote?: string;
  optionsNote?: string;
  notes: string[];
};

export type GCScreen = {
  name: string;
  isLoop: boolean;
  fields: GCField[];
  subScreens: GCScreen[];
  notes: string[];
};

export type GCMapping = {
  formName: string;
  screens: GCScreen[];
  totalScreens: number;
  totalFields: number;
};

const TYPE_MAP: Record<string, string> = {
  select: "Selection",
  boolean: "Yes/No",
  email: "Email",
  text: "Text",
  number: "Numeric",
  date: "Date",
  image: "Image",
  signature: "Signature",
};

function buildScreen(schema: DMSchema, node: DMNode): GCScreen {
  const screen: GCScreen = {
    name: node.title || node.identifier,
    isLoop: node.isLoop,
    fields: [],
    subScreens: [],
    notes: [],
  };
  if (node.isLoop) {
    screen.notes.push(`Repeatable: min ${node.minOccurs ?? 0}, max ${node.maxOccurs ?? "∞"}`);
  }
  for (const cid of node.childrenIds) {
    const c = schema.nodes[cid];
    if (c.isGroup) {
      screen.subScreens.push(buildScreen(schema, c));
    } else {
      screen.fields.push({
        identifier: c.identifier,
        label: c.title,
        gcType: TYPE_MAP[c.kind] || c.kind,
        required: c.requiredRule === "always" || c.requiredRule === "when",
        visibilityNote: c.visibleReadable,
        optionsNote: c.optionsFilterReadable,
        notes: [c.hint, c.description].filter(Boolean) as string[],
      });
    }
  }
  return screen;
}

export function buildGoCanvasMapping(schema: DMSchema, formName = "Imported Form"): GCMapping {
  const root = schema.nodes[schema.rootId];
  const screens: GCScreen[] = [];
  // Top-level: collect a virtual "Main" screen for direct fields, then real groups
  const mainFields: GCField[] = [];
  for (const cid of root.childrenIds) {
    const c = schema.nodes[cid];
    if (c.isGroup) screens.push(buildScreen(schema, c));
    else mainFields.push({
      identifier: c.identifier,
      label: c.title,
      gcType: TYPE_MAP[c.kind] || c.kind,
      required: c.requiredRule === "always" || c.requiredRule === "when",
      visibilityNote: c.visibleReadable,
      optionsNote: c.optionsFilterReadable,
      notes: [c.hint, c.description].filter(Boolean) as string[],
    });
  }
  if (mainFields.length) {
    screens.unshift({ name: "Main", isLoop: false, fields: mainFields, subScreens: [], notes: [] });
  }
  let totalFields = 0;
  let totalScreens = 0;
  function count(s: GCScreen) {
    totalScreens++;
    totalFields += s.fields.length;
    s.subScreens.forEach(count);
  }
  screens.forEach(count);
  return { formName, screens, totalScreens, totalFields };
}

export function mappingToCSV(schema: DMSchema): string {
  const headers = ["screen_path", "identifier", "title", "type", "required", "multiple", "is_loop", "visibility", "required_logic", "options_filter", "hint"];
  const rows = [headers.join(",")];
  for (const id of schema.order) {
    const n = schema.nodes[id];
    if (n.kind === "root") continue;
    const screenPath = n.path.slice(0, -1).join(" / ") || "Main";
    const cells = [
      screenPath,
      n.identifier,
      n.title,
      n.kind,
      n.requiredRule || "",
      n.multiple ? "yes" : "",
      n.isLoop ? "yes" : "",
      n.visibleReadable || "",
      n.requiredReadable || "",
      n.optionsFilterReadable || "",
      n.hint || "",
    ].map((v) => `"${String(v).replace(/"/g, '""')}"`);
    rows.push(cells.join(","));
  }
  return rows.join("\n");
}

export function mappingToJSON(schema: DMSchema): string {
  const cleaned = schema.order
    .map((id) => schema.nodes[id])
    .filter((n) => n.kind !== "root")
    .map((n) => ({
      identifier: n.identifier,
      title: n.title,
      type: n.kind,
      path: n.path,
      required: n.requiredRule,
      visibility: n.visibleReadable,
      requiredLogic: n.requiredReadable,
      optionsFilter: n.optionsFilterReadable,
      multiple: n.multiple,
      isLoop: n.isLoop,
      minOccurs: n.minOccurs,
      maxOccurs: n.maxOccurs,
      hint: n.hint,
      dependsOn: n.dependsOn,
    }));
  return JSON.stringify(cleaned, null, 2);
}

export function mappingToGoCanvas(mapping: GCMapping): string {
  return JSON.stringify(mapping, null, 2);
}