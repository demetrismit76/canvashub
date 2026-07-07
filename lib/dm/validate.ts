/**
 * Lightweight validator for Device Magic JSON form exports.
 *
 * Device Magic forms have a root object with `type: "root"` and a
 * `children` array of nodes. We check the shape leniently so legitimate
 * exports (current & older variants) load, while obviously unrelated JSON
 * (arrays, GoCanvas payloads, random objects) is rejected up-front.
 */
export type ValidationResult = { ok: boolean; reason?: string };

export function validateDeviceMagicJSON(json: unknown): ValidationResult {
  if (json === null || typeof json !== "object" || Array.isArray(json)) {
    return { ok: false, reason: "File is not a Device Magic form (expected a JSON object)." };
  }
  const root = json as Record<string, unknown>;
  const type = typeof root.type === "string" ? root.type.toLowerCase() : "";
  if (type !== "root") {
    return {
      ok: false,
      reason: 'Not a Device Magic form — root "type" must be "root".',
    };
  }
  const children = root.children;
  if (!Array.isArray(children)) {
    return {
      ok: false,
      reason: 'Not a Device Magic form — root is missing a "children" array.',
    };
  }
  // Spot-check the first child looks like a node (has a type or identifier).
  if (children.length > 0) {
    const first = children[0] as Record<string, unknown> | null;
    if (!first || typeof first !== "object") {
      return { ok: false, reason: "Form structure is malformed (invalid child node)." };
    }
    const hasType = typeof first.type === "string";
    const hasId = typeof first.identifier === "string";
    if (!hasType && !hasId) {
      return {
        ok: false,
        reason: "Form structure is malformed (children missing type/identifier).",
      };
    }
  }
  return { ok: true };
}