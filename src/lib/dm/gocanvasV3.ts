import type { DMNode, DMSchema } from "./types";

/**
 * Pure mapper: DeviceMagic schema -> GoCanvas v3 form payload.
 *
 * Shape is derived from a real exported GoCanvas v3 form:
 *   { form: { name, builderVersion: 3, ..., sections: [ { sheets: [ { entries: [...] } ] } ] } }
 *
 * Each DM top-level group becomes a Section containing one Sheet of entries.
 * Top-level non-group fields are placed in an initial "Main" section.
 * Anything we can't map cleanly is collected in `caveats` and surfaced in
 * the confirm step.
 */

export type V3EntryValue = { type: "entry_value"; position: number; text: string };

export type V3Entry = {
  id: string;
  guid: string;
  sheet_id: string;
  position: number;
  label: string;
  description: string;
  type?: string;
  entry_type_id: number;
  original_type_id: number;
  entry_values: V3EntryValue[];
  required: boolean;
  read_only: boolean;
  visible: boolean;
  style: number;
  operations: unknown[];
  conditions: unknown[];
};

export type V3Sheet = {
  id: string;
  section_id: string;
  description: string;
  sheet_type_id: number;
  position: number;
  inserts_page_break_at_the_end: boolean;
  show_sheet_name: boolean;
  allow_duplicate: boolean | null;
  style: number;
  integration_form: boolean;
  display_entry: unknown;
  conditions: unknown[];
  multi_section: unknown;
  entries: V3Entry[];
};

export type V3Section = {
  id: string;
  position: number;
  description: string;
  section_type_id: number; // 10 for first section, 11 thereafter
  hides_detailed_description: boolean;
  sheets: V3Sheet[];
};

export type V3Form = {
  name: string;
  defaultAppName: string;
  description: string;
  is_locked_by_canvas: boolean;
  version: number;
  status: "new";
  builderVersion: 3;
  workflow_enabled: boolean;
  dispatch_enabled: boolean;
  web_form: boolean;
  email_options: number;
  view_pdf_mobile: boolean;
  mobile_builder_enabled: boolean;
  sheet_style_enabled: boolean;
  folder_id?: string;
  sections: V3Section[];
};

export type V3Payload = { form: V3Form };

export type BuildResult = {
  payload: V3Payload;
  caveats: string[];
};

// DM (kind, rawType) -> { entry_type_id, original_type_id, type? }
// Values verified against a real exported GoCanvas v3 form.
type GcType = { entry_type_id: number; original_type_id: number; type?: string };

function mapType(n: DMNode, caveats: string[]): GcType {
  const raw = (n.rawType || "").toLowerCase();
  switch (n.kind) {
    case "text":
    case "email":
    case "url":
    case "phone":
    case "calculation":
    case "label":
      return { entry_type_id: 10, original_type_id: 0, type: "Text" };
    case "number":
      if (raw === "integer" || raw === "int") return { entry_type_id: 11, original_type_id: 1 };
      return { entry_type_id: 12, original_type_id: 2 }; // decimal / currency / float
    case "date":
      return { entry_type_id: 13, original_type_id: 3 };
    case "time":
      return { entry_type_id: 14, original_type_id: 4 };
    case "select":
      return { entry_type_id: 15, original_type_id: 5 };
    case "boolean":
      return { entry_type_id: 17, original_type_id: 7 };
    case "image":
      return { entry_type_id: 20, original_type_id: 10 };
    case "signature":
      return { entry_type_id: 21, original_type_id: 11 };
    default:
      caveats.push(`Field "${n.title || n.identifier}": unsupported DM type "${n.kind}" — mapped to Text.`);
      return { entry_type_id: 10, original_type_id: 0, type: "Text" };
  }
}

function uuid(): string {
  // crypto.randomUUID is available in modern browsers and Deno
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  // Fallback
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function descriptionFor(t: GcType, n: DMNode): string {
  switch (t.entry_type_id) {
    case 10: return "Text Box";
    case 11: return "Integer";
    case 12: return "Decimal";
    case 13: return "Date";
    case 14: return "Time";
    case 15: return n.multiple ? "Multi Select" : "Single Select";
    case 17: return "Checkbox";
    case 20: return "Image Capture";
    case 21: return "Signature";
    default: return "Text Box";
  }
}

function entryValuesFor(n: DMNode): V3EntryValue[] {
  if (!n.options || !Array.isArray(n.options)) return [];
  return n.options.map((o, i) => {
    let text: string;
    if (typeof o === "string") text = o;
    else if (o && typeof o === "object") {
      const obj = o as Record<string, unknown>;
      text = String(obj.label ?? obj.value ?? obj.name ?? JSON.stringify(o));
    } else text = String(o);
    return { type: "entry_value", position: i, text };
  });
}

function buildEntry(n: DMNode, sheetId: string, position: number, caveats: string[]): V3Entry {
  const t = mapType(n, caveats);
  if (n.optionsResource || n.optionsTable) {
    caveats.push(`Field "${n.title}": references reference-data "${n.optionsResource || n.optionsTable}" — not auto-created.`);
  }
  if (n.visibleExpr) {
    caveats.push(`Field "${n.title}": visibility rule "${n.visibleReadable || n.visibleExpr}" was not translated to conditions[] — apply manually.`);
  }
  if (n.requiredRule === "when" && n.requiredReadable) {
    caveats.push(`Field "${n.title}": conditional-required rule "${n.requiredReadable}" was not translated — apply manually.`);
  }
  const entry: V3Entry = {
    id: uuid(),
    guid: uuid(),
    sheet_id: sheetId,
    position,
    label: n.title || n.identifier,
    description: descriptionFor(t, n),
    entry_type_id: t.entry_type_id,
    original_type_id: t.original_type_id,
    entry_values: entryValuesFor(n),
    required: n.requiredRule === "always" || n.requiredRule === "when",
    read_only: n.kind === "calculation",
    visible: true,
    style: 0,
    operations: [],
    conditions: [],
  };
  if (t.type) entry.type = t.type;
  return entry;
}

function buildSection(
  schema: DMSchema,
  group: DMNode,
  position: number,
  caveats: string[],
): V3Section {
  const sectionId = uuid();
  const sheetId = uuid();
  const name = group.title || group.identifier;
  const entries: V3Entry[] = [];
  let pos = 0;
  for (const cid of group.childrenIds) {
    const c = schema.nodes[cid];
    if (c.isGroup) {
      caveats.push(`Nested group "${c.title}" inside "${name}" was flattened — GoCanvas v3 doesn't nest sections.`);
      // Flatten: include its leaf fields inline
      const flat = flattenFields(schema, c);
      for (const f of flat) entries.push(buildEntry(f, sheetId, pos++, caveats));
    } else {
      entries.push(buildEntry(c, sheetId, pos++, caveats));
    }
  }
  const sheet: V3Sheet = {
    id: sheetId,
    section_id: sectionId,
    description: name,
    sheet_type_id: 11,
    position: 0,
    inserts_page_break_at_the_end: false,
    show_sheet_name: true,
    allow_duplicate: group.isLoop ? true : null,
    style: 0,
    integration_form: false,
    display_entry: null,
    conditions: [],
    multi_section: null,
    entries,
  };
  if (group.isLoop) {
    caveats.push(`Loop "${name}" was emitted as a duplicable sheet — review repeat min/max in GoCanvas.`);
  }
  return {
    id: sectionId,
    position,
    description: name,
    section_type_id: position === 0 ? 10 : 11,
    hides_detailed_description: position !== 0,
    sheets: [sheet],
  };
}

function flattenFields(schema: DMSchema, group: DMNode): DMNode[] {
  const out: DMNode[] = [];
  for (const cid of group.childrenIds) {
    const c = schema.nodes[cid];
    if (c.isGroup) out.push(...flattenFields(schema, c));
    else out.push(c);
  }
  return out;
}

export function buildV3Payload(schema: DMSchema, formName: string, folderId: string): BuildResult {
  const caveats: string[] = [];
  const root = schema.nodes[schema.rootId];
  const sections: V3Section[] = [];

  // Collect top-level non-group fields into a leading "Main" section.
  const topFields: DMNode[] = [];
  const topGroups: DMNode[] = [];
  for (const cid of root.childrenIds) {
    const c = schema.nodes[cid];
    if (c.isGroup) topGroups.push(c);
    else topFields.push(c);
  }

  let pos = 0;
  if (topFields.length) {
    const sectionId = uuid();
    const sheetId = uuid();
    const entries: V3Entry[] = topFields.map((f, i) => buildEntry(f, sheetId, i, caveats));
    sections.push({
      id: sectionId,
      position: pos,
      description: "Main",
      section_type_id: 10,
      hides_detailed_description: false,
      sheets: [{
        id: sheetId,
        section_id: sectionId,
        description: "Main",
        sheet_type_id: 11,
        position: 0,
        inserts_page_break_at_the_end: false,
        show_sheet_name: true,
        allow_duplicate: null,
        style: 0,
        integration_form: false,
        display_entry: null,
        conditions: [],
        multi_section: null,
        entries,
      }],
    });
    pos++;
  }
  for (const g of topGroups) {
    sections.push(buildSection(schema, g, pos++, caveats));
  }

  const form: V3Form = {
    name: formName,
    defaultAppName: formName,
    description: "",
    is_locked_by_canvas: false,
    version: 1,
    status: "new",
    builderVersion: 3,
    workflow_enabled: false,
    dispatch_enabled: false,
    web_form: false,
    email_options: 2,
    view_pdf_mobile: true,
    mobile_builder_enabled: false,
    sheet_style_enabled: true,
    sections,
  };
  if (folderId) form.folder_id = folderId;

  return { payload: { form }, caveats };
}