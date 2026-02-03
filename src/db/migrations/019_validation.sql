-- Add validation fields to sessions and programs
-- When requires_validation is enabled in user profile, new records are created with is_validated = false
-- Default TRUE ensures existing data continues to work normally

-- Sessions: add is_validated column
ALTER TABLE sessions ADD COLUMN is_validated BOOLEAN NOT NULL DEFAULT TRUE;

-- Index for efficient filtering of unvalidated sessions
CREATE INDEX idx_sessions_validated ON sessions(user_id, is_validated) WHERE NOT is_validated;

-- Programs: add is_validated column
ALTER TABLE programs ADD COLUMN is_validated BOOLEAN NOT NULL DEFAULT TRUE;

-- Index for efficient filtering of unvalidated programs
CREATE INDEX idx_programs_validated ON programs(user_id, is_validated) WHERE NOT is_validated;
