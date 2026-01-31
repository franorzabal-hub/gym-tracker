-- Migration 011: Auth tables (replace in-memory token stores)

CREATE TABLE IF NOT EXISTS auth_tokens (
  token TEXT PRIMARY KEY,
  workos_user_id TEXT NOT NULL,
  email TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX auth_tokens_expires_at_idx ON auth_tokens (expires_at);

CREATE TABLE IF NOT EXISTS auth_codes (
  code TEXT PRIMARY KEY,
  workos_user_id TEXT NOT NULL,
  email TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  code_challenge TEXT,
  code_challenge_method TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX auth_codes_expires_at_idx ON auth_codes (expires_at);

CREATE TABLE IF NOT EXISTS dynamic_clients (
  client_id TEXT PRIMARY KEY,
  redirect_uris TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
