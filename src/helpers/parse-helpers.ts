/**
 * Parses a JSON string into the target type, or passes through non-string values.
 * MCP clients sometimes serialize objects/arrays as JSON strings instead of
 * passing them as structured data. This normalizes both cases.
 * Returns null if `value` is null/undefined or if JSON parsing fails.
 */
export function parseJsonParam<T>(value: unknown): T | null {
  if (value == null) return null;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as T;
    } catch (err) {
      console.warn("[parseJsonParam] Failed to parse JSON string:", err instanceof Error ? err.message : err);
      return null;
    }
  }
  return value as T;
}

/**
 * Like {@link parseJsonParam} but guarantees an array result.
 * Plain strings that aren't valid JSON are wrapped in a single-element array
 * instead of returning null — useful for params like tags or exercise names
 * where a user might pass "bench press" instead of ["bench press"].
 */
export function parseJsonArrayParam<T>(value: unknown): T[] | null {
  if (value == null) return null;
  if (Array.isArray(value)) return value as T[];
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed as T[] : [parsed as T];
    } catch {
      // Plain string that's not JSON - wrap in array
      return [value as unknown as T];
    }
  }
  return [value as unknown as T];
}

/**
 * Escapes PostgreSQL ILIKE special characters (% and _) in user input
 * to prevent unexpected wildcard matching. Use before wrapping with `%..%`.
 */
export function escapeIlike(input: string): string {
  return input.replace(/%/g, '\\%').replace(/_/g, '\\_');
}
