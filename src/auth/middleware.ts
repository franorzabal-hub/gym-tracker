import type { Request } from "express";
import crypto from "node:crypto";
import pool from "../db/connection.js";

export class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthError";
  }
}

interface CachedToken {
  userId: number;
  expiresAt: number;
  lastAccess: number;
}

const tokenCache = new Map<string, CachedToken>();
const TOKEN_CACHE_TTL = 60_000; // 1 minute
const TOKEN_CACHE_MAX = 1000;

function cacheKey(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

/**
 * Authenticates a Bearer token from the request and returns the internal user ID.
 * Uses a simple in-memory cache (1-min TTL, max 1000 entries) to avoid hitting
 * the database on every MCP request. On cache miss, looks up the token in
 * auth_tokens, then upserts the user record.
 *
 * Cache eviction: when full, removes the oldest 25% of entries instead of
 * clearing everything — avoids a thundering herd where all concurrent requests
 * simultaneously miss the cache and hit the DB.
 *
 * The user upsert only updates last_login if it's been stale for >1 hour,
 * reducing unnecessary DB writes for users making frequent requests.
 */
export async function authenticateToken(req: Request): Promise<number> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    throw new AuthError("Missing or invalid Authorization header");
  }

  const token = authHeader.slice(7);

  // Check cache
  const cached = tokenCache.get(cacheKey(token));
  if (cached && cached.expiresAt > Date.now()) {
    // Update last access time for LRU
    cached.lastAccess = Date.now();
    return cached.userId;
  }

  // Cache miss or expired — remove stale entry
  if (cached) {
    tokenCache.delete(cacheKey(token));
  }

  // Look up token in database
  const { rows } = await pool.query(
    "SELECT workos_user_id, email FROM auth_tokens WHERE token = $1 AND expires_at > NOW()",
    [token]
  );
  if (rows.length === 0) {
    throw new AuthError("Invalid or expired token");
  }

  const stored = rows[0];

  // Upsert user (only update last_login if stale > 1 hour)
  const { rows: userRows } = await pool.query(
    `INSERT INTO users (external_id, email, last_login)
     VALUES ($1, $2, NOW())
     ON CONFLICT (external_id)
     DO UPDATE SET
       email = COALESCE($2, users.email),
       last_login = CASE
         WHEN users.last_login < NOW() - INTERVAL '1 hour' THEN NOW()
         ELSE users.last_login
       END
     RETURNING id`,
    [stored.workos_user_id, stored.email]
  );

  const userId = userRows[0].id;

  // Evict least recently used 25% if cache is full (LRU eviction)
  if (tokenCache.size >= TOKEN_CACHE_MAX) {
    const toDelete = Math.floor(TOKEN_CACHE_MAX * 0.25);
    // Sort entries by lastAccess ascending (oldest first)
    const entries = Array.from(tokenCache.entries())
      .sort((a, b) => a[1].lastAccess - b[1].lastAccess);
    for (let i = 0; i < toDelete && i < entries.length; i++) {
      tokenCache.delete(entries[i][0]);
    }
  }

  const now = Date.now();
  tokenCache.set(cacheKey(token), {
    userId,
    expiresAt: now + TOKEN_CACHE_TTL,
    lastAccess: now,
  });

  return userId;
}
