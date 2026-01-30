import { Router } from "express";
import crypto from "node:crypto";
import { workos, WORKOS_CLIENT_ID, BASE_URL } from "./workos.js";

const router = Router();

// In-memory stores
const authCodes = new Map<string, { workosUserId: string; email: string | null; expiresAt: number }>();
const accessTokens = new Map<string, { workosUserId: string; email: string | null; expiresAt: number }>();
const dynamicClients = new Map<string, { client_id: string; redirect_uris: string[]; created_at: number }>();

export { accessTokens };

// Cleanup expired codes every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [code, data] of authCodes) {
    if (data.expiresAt < now) authCodes.delete(code);
  }
}, 5 * 60 * 1000);

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
router.post("/register", (req, res) => {
  const { client_name, redirect_uris, grant_types, response_types, token_endpoint_auth_method } = req.body;

  const clientId = `client_${crypto.randomBytes(16).toString("hex")}`;

  dynamicClients.set(clientId, {
    client_id: clientId,
    redirect_uris: redirect_uris || [],
    created_at: Date.now(),
  });

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
router.get("/authorize", (req, res) => {
  const { redirect_uri, state, code_challenge, code_challenge_method } = req.query;

  if (!redirect_uri || !state) {
    res.status(400).json({ error: "redirect_uri and state are required" });
    return;
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
    authCodes.set(mcpCode, {
      workosUserId,
      email,
      expiresAt: Date.now() + 5 * 60 * 1000, // 5 min
    });

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

  const stored = authCodes.get(code);
  if (!stored || stored.expiresAt < Date.now()) {
    authCodes.delete(code);
    res.status(400).json({ error: "invalid_grant", error_description: "Code expired or invalid" });
    return;
  }

  // Delete used code (one-time use)
  authCodes.delete(code);

  // Generate our own opaque access token
  const opaqueToken = crypto.randomBytes(32).toString("hex");
  accessTokens.set(opaqueToken, {
    workosUserId: stored.workosUserId,
    email: stored.email,
    expiresAt: Date.now() + 24 * 60 * 60 * 1000, // 24 hours
  });

  res.json({
    access_token: opaqueToken,
    token_type: "Bearer",
    expires_in: 86400,
  });
});

export default router;
