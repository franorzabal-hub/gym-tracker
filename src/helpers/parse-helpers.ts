export function parseJsonParam<T>(value: unknown): T | null {
  if (value == null) return null;
  if (typeof value === 'string') {
    try { return JSON.parse(value) as T; } catch { return null; }
  }
  return value as T;
}

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
