-- ============================================
-- Multi-tenant: users table
-- ============================================
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    external_id TEXT NOT NULL UNIQUE,
    email TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    last_login TIMESTAMPTZ DEFAULT NOW()
);

-- Insert legacy user for existing data
INSERT INTO users (id, external_id, email)
VALUES (1, 'legacy', NULL)
ON CONFLICT (id) DO NOTHING;

-- Ensure sequence is past legacy user
SELECT setval('users_id_seq', GREATEST(nextval('users_id_seq'), 2));

-- ============================================
-- Add user_id to sessions
-- ============================================
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id);
UPDATE sessions SET user_id = 1 WHERE user_id IS NULL;
ALTER TABLE sessions ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE sessions ALTER COLUMN user_id SET DEFAULT 1;
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

-- ============================================
-- Add user_id to programs
-- ============================================
ALTER TABLE programs ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id);
UPDATE programs SET user_id = 1 WHERE user_id IS NULL;
ALTER TABLE programs ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE programs ALTER COLUMN user_id SET DEFAULT 1;
CREATE INDEX IF NOT EXISTS idx_programs_user ON programs(user_id);

-- Update unique constraint on programs.name to be per-user
ALTER TABLE programs DROP CONSTRAINT IF EXISTS programs_name_key;
CREATE UNIQUE INDEX IF NOT EXISTS idx_programs_user_name ON programs(user_id, LOWER(name));

-- ============================================
-- Add user_id to personal_records
-- ============================================
ALTER TABLE personal_records ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id);
UPDATE personal_records SET user_id = 1 WHERE user_id IS NULL;
ALTER TABLE personal_records ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE personal_records ALTER COLUMN user_id SET DEFAULT 1;
CREATE INDEX IF NOT EXISTS idx_personal_records_user ON personal_records(user_id);

-- Update unique constraint on personal_records to be per-user
DROP INDEX IF EXISTS idx_personal_records_exercise;
CREATE UNIQUE INDEX idx_personal_records_user_exercise ON personal_records(user_id, exercise_id, record_type);

-- ============================================
-- Add user_id to session_templates
-- ============================================
ALTER TABLE session_templates ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id);
UPDATE session_templates SET user_id = 1 WHERE user_id IS NULL;
ALTER TABLE session_templates ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE session_templates ALTER COLUMN user_id SET DEFAULT 1;
CREATE INDEX IF NOT EXISTS idx_session_templates_user ON session_templates(user_id);

-- Update unique constraint on session_templates.name to be per-user
ALTER TABLE session_templates DROP CONSTRAINT IF EXISTS session_templates_name_key;
CREATE UNIQUE INDEX IF NOT EXISTS idx_session_templates_user_name ON session_templates(user_id, LOWER(name));

-- ============================================
-- Add user_id to user_profile
-- ============================================
ALTER TABLE user_profile ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id);
UPDATE user_profile SET user_id = 1 WHERE user_id IS NULL;
ALTER TABLE user_profile ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE user_profile ALTER COLUMN user_id SET DEFAULT 1;
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_profile_user ON user_profile(user_id);
