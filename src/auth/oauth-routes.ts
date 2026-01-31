import { Router } from "express";
import crypto from "node:crypto";
import { workos, WORKOS_CLIENT_ID, BASE_URL } from "./workos.js";
import pool from "../db/connection.js";

const router = Router();

// Cleanup expired tokens/codes every 15 minutes
setInterval(async () => {
  try {
    await pool.query("DELETE FROM auth_tokens WHERE expires_at < NOW()");
    await pool.query("DELETE FROM auth_codes WHERE expires_at < NOW()");
  } catch {
    // Ignore cleanup errors
  }
}, 15 * 60 * 1000);

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
  const { client_name, redirect_uris, grant_types, response_types, token_endpoint_auth_method } = req.body;

  const clientId = `client_${crypto.randomBytes(16).toString("hex")}`;

  await pool.query(
    "INSERT INTO dynamic_clients (client_id, redirect_uris) VALUES ($1, $2)",
    [clientId, redirect_uris || []]
  );

  res.status(201).json({
    client_id: clientId,
    client_name: client_name || "MCP Client",
    redirect_uris: redirect_uris || [],
    grant_types: grant_types || ["authorization_code"],
    response_types: response_types || ["code"],
    token_endpoint_auth_method: token_endpoint_auth_method || "none",
  });
});

// Authorize → redirect to WorkOS AuthKit
router.get("/authorize", async (req, res) => {
  const { redirect_uri, state, code_challenge, code_challenge_method, client_id } = req.query;

  if (!redirect_uri || !state) {
    res.status(400).json({ error: "redirect_uri and state are required" });
    return;
  }

  const uri = redirect_uri as string;
  const isLocalhost = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//.test(uri);

  // Validate redirect_uri against registered client
  if (client_id && typeof client_id === "string") {
    const { rows } = await pool.query(
      "SELECT redirect_uris FROM dynamic_clients WHERE client_id = $1",
      [client_id]
    );
    if (rows.length > 0 && rows[0].redirect_uris.length > 0) {
      if (!rows[0].redirect_uris.includes(uri)) {
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

  // Store PKCE + redirect info in state
  const internalState = Buffer.from(
    JSON.stringify({
      redirect_uri,
      state,
      code_challenge,
      code_challenge_method,
    })
  ).toString("base64url");

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

    const { redirect_uri, state, code_challenge, code_challenge_method } =
      JSON.parse(Buffer.from(internalState as string, "base64url").toString());

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
  const { grant_type, code, code_verifier } = req.body;

  if (grant_type !== "authorization_code") {
    res.status(400).json({ error: "unsupported_grant_type" });
    return;
  }

  if (!code) {
    res.status(400).json({ error: "invalid_request", error_description: "Missing code" });
    return;
  }

  // Fetch and delete code in one operation (one-time use)
  const { rows } = await pool.query(
    "DELETE FROM auth_codes WHERE code = $1 AND expires_at > NOW() RETURNING workos_user_id, email, code_challenge, code_challenge_method",
    [code]
  );

  if (rows.length === 0) {
    res.status(400).json({ error: "invalid_grant", error_description: "Code expired or invalid" });
    return;
  }

  const stored = rows[0];

  // PKCE verification
  if (stored.code_challenge) {
    if (!code_verifier) {
      res.status(400).json({ error: "invalid_grant", error_description: "code_verifier required" });
      return;
    }
    const expectedChallenge = crypto
      .createHash("sha256")
      .update(code_verifier)
      .digest("base64url");
    if (expectedChallenge !== stored.code_challenge) {
      res.status(400).json({ error: "invalid_grant", error_description: "code_verifier mismatch" });
      return;
    }
  }

  // Generate our own opaque access token
  const opaqueToken = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

  await pool.query(
    "INSERT INTO auth_tokens (token, workos_user_id, email, expires_at) VALUES ($1, $2, $3, $4)",
    [opaqueToken, stored.workos_user_id, stored.email, expiresAt]
  );

  res.json({
    access_token: opaqueToken,
    token_type: "Bearer",
    expires_in: 86400,
  });
});

export default router;
