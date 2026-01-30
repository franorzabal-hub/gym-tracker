import { Router } from "express";
import crypto from "node:crypto";
import { workos, WORKOS_CLIENT_ID, BASE_URL } from "./workos.js";

const router = Router();

// In-memory code store (short-lived auth codes)
const authCodes = new Map<string, { accessToken: string; expiresAt: number }>();

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

    // Exchange WorkOS code for user + access token
    const authResponse = await workos.userManagement.authenticateWithCode({
      code: workosCode as string,
      clientId: WORKOS_CLIENT_ID,
    });

    const accessToken = authResponse.accessToken;

    // Generate a short-lived auth code for the MCP client
    const mcpCode = crypto.randomBytes(32).toString("hex");
    authCodes.set(mcpCode, {
      accessToken,
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

  res.json({
    access_token: stored.accessToken,
    token_type: "Bearer",
    expires_in: 3600,
  });
});

export default router;
