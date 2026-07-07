export type DMRawNode = {
  type: string;
  identifier?: string;
  title?: string;
  autoIdentifier?: boolean;
  hint?: string;
  description?: string;
  initialAnswer?: unknown;
  options?: unknown[];
  options_resource?: string;
  options_table?: string;
  options_text_column?: string;
  options_identifier_column?: string;
  options_filter_expr?: string;
  visible_rule?: string;
  visible_expr?: string;
  required_rule?: string;
  required_expr?: string;
  multiple?: boolean;
  multi_line?: boolean;
  minOccurs?: number;
  maxOccurs?: number;
  children?: DMRawNode[];
  [k: string]: unknown;
};

export type FieldKind =
  | "select"
  | "boolean"
  | "email"
  | "text"
  | "group"
  | "loop"
  | "root"
  | "number"
  | "date"
  | "image"
  | "signature"
  | "calculation"
  | "time"
  | "location"
  | "sketch"
  | "barcode"
  | "audio"
  | "video"
  | "file"
  | "label"
  | "phone"
  | "url"
  | "unknown";

export type DMNode = {
  id: string;
  path: string[];
  parentId: string | null;
  depth: number;
  kind: FieldKind;
  rawType: string;
  identifier: string;
  title: string;
  hint?: string;
  description?: string;
  initialAnswer?: unknown;
  multiple?: boolean;
  multiLine?: boolean;
  minOccurs?: number;
  maxOccurs?: number;
  isLoop: boolean;
  isGroup: boolean;
  readOnly?: boolean;
  hidden?: boolean;
  options?: unknown[];
  optionsResource?: string;
  optionsTable?: string;
  optionsFilterExpr?: string;
  optionsFilterReadable?: string;
  visibleExpr?: string;
  visibleReadable?: string;
  requiredRule?: string;
  requiredReadable?: string;
  readOnlyRule?: string;
  readOnlyExpr?: string;
  readOnlyReadable?: string;
  readOnlyPlain?: string;
  visiblePlain?: string;
  requiredPlain?: string;
  optionsFilterPlain?: string;
  dependsOn: string[]; // identifiers referenced in expressions
  childrenIds: string[];
  raw: DMRawNode;
};

export type DMSchema = {
  rootId: string;
  nodes: Record<string, DMNode>;
  order: string[]; // pre-order traversal of node ids
  byIdentifier: Record<string, string>; // identifier -> node id
  stats: {
    total: number;
    byKind: Record<string, number>;
    withVisibility: number;
    withRequired: number;
    withFilter: number;
    loops: number;
    groups: number;
  };
};