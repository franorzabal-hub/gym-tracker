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
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(now); // Returns YYYY-MM-DD format
}
