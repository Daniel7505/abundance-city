export interface SourcedValue<T = number> {
  value: T;
  source_url: string;
  vintage: string;
}

export function readNumber(field: SourcedValue<number>): number {
  return field.value;
}

/** Collect numeric sourced leaves for validation tests. */
export function collectSourcedNumericFields(
  obj: unknown,
  path = "",
  out: Array<{ path: string; source_url: string }> = [],
): Array<{ path: string; source_url: string }> {
  if (obj === null || typeof obj !== "object") return out;
  if (Array.isArray(obj)) {
    obj.forEach((item, i) => collectSourcedNumericFields(item, `${path}[${i}]`, out));
    return out;
  }
  const rec = obj as Record<string, unknown>;
  if (
    typeof rec.value === "number" &&
    typeof rec.source_url === "string" &&
    typeof rec.vintage === "string"
  ) {
    out.push({ path: path || "root", source_url: rec.source_url });
    return out;
  }
  for (const [key, val] of Object.entries(rec)) {
    collectSourcedNumericFields(val, path ? `${path}.${key}` : key, out);
  }
  return out;
}
