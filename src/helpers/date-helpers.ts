import pool from "../db/connection.js";
import { getUserId } from "../context/user-context.js";

export async function getUserTimezone(): Promise<string> {
  const userId = getUserId();
  const { rows } = await pool.query(
    "SELECT data->>'timezone' as timezone FROM user_profile WHERE user_id = $1 LIMIT 1",
    [userId]
  );
  return rows[0]?.timezone || 'UTC';
}

export async function getUserCurrentDate(): Promise<string> {
  const timezone = await getUserTimezone();
  const now = new Date();

  const formatWithTimezone = (tz?: string) => {
    const options: Intl.DateTimeFormatOptions = {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      ...(tz ? { timeZone: tz } : {}),
    };
    return new Intl.DateTimeFormat("en-CA", options).format(now); // YYYY-MM-DD
  };

  try {
    return formatWithTimezone(timezone);
  } catch (err) {
    console.warn(
      `[getUserCurrentDate] Invalid timezone "${timezone}", falling back to UTC:`,
      err instanceof Error ? err.message : err,
    );
    try {
      return formatWithTimezone("UTC");
    } catch {
      // As a last resort, fall back to server local time (should never throw)
      return formatWithTimezone();
    }
  }
}
