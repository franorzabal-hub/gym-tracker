import type { Request, Response, NextFunction } from "express";
import { jwtVerify, createRemoteJWKSet } from "jose";
import pool from "../db/connection.js";
import { WORKOS_CLIENT_ID } from "./workos.js";

export class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthError";
  }
}

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

function getJWKS() {
  if (!jwks) {
    jwks = createRemoteJWKSet(
      new URL("https://api.workos.com/sso/jwks/")
    );
  }
  return jwks;
}

export async function authenticateToken(req: Request): Promise<number> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    throw new AuthError("Missing or invalid Authorization header");
  }

  const token = authHeader.slice(7);

  const { payload } = await jwtVerify(token, getJWKS(), {
    audience: WORKOS_CLIENT_ID,
  });

  const externalId = payload.sub;
  if (!externalId) {
    throw new AuthError("Token missing sub claim");
  }

  const email = (payload as any).email || null;

  // Upsert user
  const { rows } = await pool.query(
    `INSERT INTO users (external_id, email, last_login)
     VALUES ($1, $2, NOW())
     ON CONFLICT (external_id)
     DO UPDATE SET email = COALESCE($2, users.email), last_login = NOW()
     RETURNING id`,
    [externalId, email]
  );

  return rows[0].id;
}
