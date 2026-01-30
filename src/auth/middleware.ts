import type { Request } from "express";
import pool from "../db/connection.js";
import { accessTokens } from "./oauth-routes.js";

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

  // Look up token in our store
  const stored = accessTokens.get(token);
  if (!stored || stored.expiresAt < Date.now()) {
    if (stored) accessTokens.delete(token);
    throw new AuthError("Invalid or expired token");
  }

  // Upsert user
  const { rows } = await pool.query(
    `INSERT INTO users (external_id, email, last_login)
     VALUES ($1, $2, NOW())
     ON CONFLICT (external_id)
     DO UPDATE SET email = COALESCE($2, users.email), last_login = NOW()
     RETURNING id`,
    [stored.workosUserId, stored.email]
  );

  return rows[0].id;
}
