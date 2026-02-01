import { Router } from "express";
import crypto, { createHmac } from "node:crypto";
import { workos, WORKOS_CLIENT_ID, BASE_URL } from "./workos.js";
import pool from "../db/connection.js";

const router = Router();

// --- State signing ---
const STATE_SECRET = process.env.STATE_SECRET || (() => {
  const secret = crypto.randomBytes(32).toString("hex");
  console.warn("WARNING: STATE_SECRET not set, using ephemeral random secret. State tokens will not survive restarts.");
  return secret;
})();

function signState(payload: object): string {
  const data = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = createHmac("sha256", STATE_SECRET).update(data).digest("base64url");
  return `${data}.${sig}`;
}

function verifyState(state: string): Record<string, any> | null {
  const dotIdx = state.lastIndexOf(".");
  if (dotIdx === -1) return null;
  const data = state.substring(0, dotIdx);
  const sig = state.substring(dotIdx + 1);
  const expected = createHmac("sha256", STATE_SECRET).update(data).digest("base64url");
  const sigBuf = Buffer.from(sig, "base64url");
  const expectedBuf = Buffer.from(expected, "base64url");
  if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) return null;
  try {
    const payload = JSON.parse(Buffer.from(data, "base64url").toString());
    // Check TTL: 10 minutes
    if (payload.created_at && Date.now() - payload.created_at > 10 * 60 * 1000) return null;
    return payload;
  } catch { return null; }
}

// --- Rate limiting (in-memory) ---
const rateLimitMap = new Map<string, { count: number; windowStart: number }>();

function checkRateLimit(ip: string, limit: number): boolean {
  const now = Date.now();
  const windowMs = 60 * 1000; // 1 minute window
  const entry = rateLimitMap.get(ip);

  if (!entry || now - entry.windowStart > windowMs) {
    rateLimitMap.set(ip, { count: 1, windowStart: now });
    return true;
  }

  entry.count++;
  if (entry.count > limit) {
    return false;
  }
  return true;
}

// Cleanup stale rate limit entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  const windowMs = 60 * 1000;
  for (const [key, entry] of rateLimitMap) {
    if (now - entry.windowStart > windowMs) {
      rateLimitMap.delete(key);
    }
  }
}, 5 * 60 * 1000).unref();

// Cleanup expired tokens/codes every 15 minutes
setInterval(async () => {
  try {
    await pool.query("DELETE FROM auth_tokens WHERE expires_at < NOW()");
    await pool.query("DELETE FROM auth_codes WHERE expires_at < NOW()");
  } catch (err) {
    console.error("Token/code cleanup failed:", err instanceof Error ? err.message : err);
  }
}, 15 * 60 * 1000).unref();

// Resource metadata
router.get("/.well-known/oauth-protected-resource", (_req, res) => {
  res.json({
    resource: BASE_URL,
    authorization_servers: [BASE_URL],
    bearer_methods_supported: ["header"],
  });
});

// Authorization server metadata
router.get("/.well-known/oauth-authorization-server", (_req, res) => {
  res.json({
    issuer: BASE_URL,
    authorization_endpoint: `${BASE_URL}/authorize`,
    token_endpoint: `${BASE_URL}/token`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
    registration_endpoint: `${BASE_URL}/register`,
  });
});

// Dynamic Client Registration (RFC 7591)
router.post("/register", async (req, res) => {
  const ip = req.ip || req.socket.remoteAddress || "unknown";
  if (!checkRateLimit(`register:${ip}`, 5)) {
    res.status(429).json({ error: "too_many_requests", error_description: "Rate limit exceeded. Try again later." });
    return;
  }

  try {
    // Registration secret check
    const registrationSecret = process.env.REGISTRATION_SECRET;
    if (registrationSecret) {
      const authHeader = req.headers.authorization;
      const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
      if (!token || !crypto.timingSafeEqual(Buffer.from(token), Buffer.from(registrationSecret))) {
        res.status(401).json({ error: "unauthorized", error_description: "Registration requires authorization" });
        return;
      }
    }

    const { client_name, redirect_uris, grant_types, response_types, token_endpoint_auth_method } = req.body;

    if (!redirect_uris || !Array.isArray(redirect_uris) || redirect_uris.length === 0) {
      res.status(400).json({ error: "invalid_client_metadata", error_description: "redirect_uris must be a non-empty array" });
      return;
    }

    const clientId = `client_${crypto.randomBytes(16).toString("hex")}`;

    await pool.query(
      "INSERT INTO dynamic_clients (client_id, redirect_uris) VALUES ($1, $2)",
      [clientId, redirect_uris]
    );

    res.status(201).json({
      client_id: clientId,
      client_name: client_name || "MCP Client",
      redirect_uris: redirect_uris || [],
      grant_types: grant_types || ["authorization_code"],
      response_types: response_types || ["code"],
      token_endpoint_auth_method: token_endpoint_auth_method || "none",
    });
  } catch (err) {
    console.error("Registration error:", err);
    res.status(500).json({ error: "server_error", error_description: "Registration failed" });
  }
});

// Authorize → redirect to WorkOS AuthKit
router.get("/authorize", async (req, res) => {
  const ip = req.ip || req.socket.remoteAddress || "unknown";
  if (!checkRateLimit(`authorize:${ip}`, 20)) {
    res.status(429).json({ error: "too_many_requests", error_description: "Rate limit exceeded. Try again later." });
    return;
  }

  const { redirect_uri, state, code_challenge, code_challenge_method, client_id } = req.query;

  if (!redirect_uri || !state) {
    res.status(400).json({ error: "redirect_uri and state are required" });
    return;
  }

  // PKCE S256 is mandatory
  if (!code_challenge) {
    res.status(400).json({ error: "invalid_request", error_description: "code_challenge is required. PKCE (S256) is mandatory." });
    return;
  }
  if (code_challenge_method !== "S256") {
    res.status(400).json({ error: "invalid_request", error_description: "code_challenge_method must be S256" });
    return;
  }

  const uri = redirect_uri as string;
  const isLocalhost = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/.test(uri);

  // Validate redirect_uri against registered client
  if (client_id && typeof client_id === "string") {
    const { rows } = await pool.query(
      "SELECT redirect_uris FROM dynamic_clients WHERE client_id = $1",
      [client_id]
    );
    if (rows.length > 0) {
      if (rows[0].redirect_uris.length === 0 || !rows[0].redirect_uris.includes(uri)) {
        res.status(400).json({ error: "invalid_request", error_description: "redirect_uri not registered for this client" });
        return;
      }
    }
  }

  if (process.env.NODE_ENV === "production") {
    const isRegistered = client_id && typeof client_id === "string";
    let clientExists = false;
    if (isRegistered) {
      const { rows } = await pool.query(
        "SELECT 1 FROM dynamic_clients WHERE client_id = $1",
        [client_id]
      );
      clientExists = rows.length > 0;
    }
    if (!isLocalhost && !clientExists) {
      res.status(400).json({ error: "invalid_request", error_description: "Unregistered redirect_uri" });
      return;
    }
  } else {
    // Non-production: only allow localhost
    if (!isLocalhost) {
      res.status(400).json({ error: "invalid_request", error_description: "Only localhost redirect_uris are allowed in non-production" });
      return;
    }
  }

  // Store PKCE + redirect info in signed state
  const internalState = signState({
    redirect_uri,
    state,
    code_challenge,
    code_challenge_method,
    created_at: Date.now(),
  });

  const authUrl = workos.userManagement.getAuthorizationUrl({
    provider: "authkit",
    clientId: WORKOS_CLIENT_ID,
    redirectUri: `${BASE_URL}/callback`,
    state: internalState,
  });

  res.redirect(authUrl);
});

// Callback from WorkOS
router.get("/callback", async (req, res) => {
  try {
    const { code: workosCode, state: internalState } = req.query;

    if (!workosCode || !internalState) {
      res.status(400).json({ error: "Missing code or state" });
      return;
    }

    const statePayload = verifyState(internalState as string);
    if (!statePayload) {
      res.status(400).json({ error: "invalid_state", error_description: "State verification failed or expired" });
      return;
    }
    const { redirect_uri, state, code_challenge, code_challenge_method } = statePayload;

    // Exchange WorkOS code for user info
    const authResponse = await workos.userManagement.authenticateWithCode({
      code: workosCode as string,
      clientId: WORKOS_CLIENT_ID,
    });

    const workosUserId = authResponse.user.id;
    const email = authResponse.user.email || null;

    // Generate a short-lived auth code for the MCP client
    const mcpCode = crypto.randomBytes(32).toString("hex");
    await pool.query(
      "INSERT INTO auth_codes (code, workos_user_id, email, expires_at, code_challenge, code_challenge_method) VALUES ($1, $2, $3, $4, $5, $6)",
      [mcpCode, workosUserId, email, new Date(Date.now() + 5 * 60 * 1000), code_challenge || null, code_challenge_method || null]
    );

    // Redirect back to MCP client
    const redirectUrl = new URL(redirect_uri);
    redirectUrl.searchParams.set("code", mcpCode);
    redirectUrl.searchParams.set("state", state);

    res.redirect(redirectUrl.toString());
  } catch (err: any) {
    console.error("OAuth callback error:", err);
    res.status(500).json({ error: "Authentication failed" });
  }
});

// Token exchange
router.post("/token", async (req, res) => {
  const ip = req.ip || req.socket.remoteAddress || "unknown";
  if (!checkRateLimit(`token:${ip}`, 20)) {
    res.status(429).json({ error: "too_many_requests", error_description: "Rate limit exceeded. Try again later." });
    return;
  }

  const { grant_type, code, code_verifier } = req.body;

  if (grant_type !== "authorization_code") {
    res.status(400).json({ error: "unsupported_grant_type" });
    return;
  }

  if (!code) {
    res.status(400).json({ error: "invalid_request", error_description: "Missing code" });
    return;
  }

  if (!code_verifier) {
    res.status(400).json({ error: "invalid_request", error_description: "code_verifier is required. PKCE (S256) is mandatory." });
    return;
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Fetch and delete code in one operation (one-time use)
    const { rows } = await client.query(
      "DELETE FROM auth_codes WHERE code = $1 AND expires_at > NOW() RETURNING workos_user_id, email, code_challenge, code_challenge_method",
      [code]
    );

    if (rows.length === 0) {
      await client.query("ROLLBACK");
      res.status(400).json({ error: "invalid_grant", error_description: "Code expired or invalid" });
      return;
    }

    const stored = rows[0];

    // PKCE verification — code_challenge must exist (enforced at /authorize)
    if (!stored.code_challenge) {
      await client.query("ROLLBACK");
      res.status(400).json({ error: "invalid_grant", error_description: "Auth code was issued without PKCE challenge. Re-authorize with code_challenge." });
      return;
    }

    const expectedChallenge = crypto
      .createHash("sha256")
      .update(code_verifier)
      .digest("base64url");
    if (expectedChallenge !== stored.code_challenge) {
      await client.query("ROLLBACK");
      res.status(400).json({ error: "invalid_grant", error_description: "code_verifier mismatch" });
      return;
    }

    // Generate our own opaque access token
    const opaqueToken = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    await client.query(
      "INSERT INTO auth_tokens (token, workos_user_id, email, expires_at) VALUES ($1, $2, $3, $4)",
      [opaqueToken, stored.workos_user_id, stored.email, expiresAt]
    );

    await client.query("COMMIT");

    res.json({
      access_token: opaqueToken,
      token_type: "Bearer",
      expires_in: 86400,
    });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("Token exchange error:", err);
    res.status(500).json({ error: "server_error", error_description: "Token exchange failed" });
  } finally {
    client.release();
  }
});

export default router;
