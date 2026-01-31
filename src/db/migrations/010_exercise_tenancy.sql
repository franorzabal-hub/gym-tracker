-- Migration 010: Exercise tenancy (global + user-owned)
-- Existing exercises remain global (user_id = NULL), user-created exercises get user_id

ALTER TABLE exercises ADD COLUMN user_id INTEGER REFERENCES users(id) ON DELETE CASCADE;

-- Drop the old unique constraint on name
ALTER TABLE exercises DROP CONSTRAINT IF EXISTS exercises_name_key;

-- Create a unique index that allows both global (user_id=NULL) and per-user exercises
-- COALESCE(user_id, 0) treats all global exercises as belonging to "user 0"
CREATE UNIQUE INDEX exercises_user_name_unique ON exercises (COALESCE(user_id, 0), LOWER(name));

-- Index for efficient lookups
CREATE INDEX exercises_user_id_idx ON exercises (user_id) WHERE user_id IS NOT NULL;
