import type { Request } from "express";
import pool from "../db/connection.js";

export class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthError";
  }
}

export async function authenticateToken(req: Request): Promise<number> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    throw new AuthError("Missing or invalid Authorization header");
  }

  const token = authHeader.slice(7);

  // Look up token in database
  const { rows } = await pool.query(
    "SELECT workos_user_id, email FROM auth_tokens WHERE token = $1 AND expires_at > NOW()",
    [token]
  );
  if (rows.length === 0) {
    throw new AuthError("Invalid or expired token");
  }

  const stored = rows[0];

  // Upsert user
  const { rows: userRows } = await pool.query(
    `INSERT INTO users (external_id, email, last_login)
     VALUES ($1, $2, NOW())
     ON CONFLICT (external_id)
     DO UPDATE SET email = COALESCE($2, users.email), last_login = NOW()
     RETURNING id`,
    [stored.workos_user_id, stored.email]
  );

  return userRows[0].id;
}
