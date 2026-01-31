-- Migration 012: Body measurements, pg_trgm, exercise description

-- 1. Body measurements table for temporal tracking
CREATE TABLE IF NOT EXISTS body_measurements (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  measurement_type TEXT NOT NULL,  -- 'weight_kg', 'body_fat_pct', 'chest_cm', 'waist_cm', 'arm_cm', 'thigh_cm', etc.
  value NUMERIC(10,2) NOT NULL,
  measured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  notes TEXT
);

CREATE INDEX idx_body_measurements_user_type ON body_measurements(user_id, measurement_type, measured_at DESC);

-- 2. Enable pg_trgm for fuzzy matching (if available)
-- Using DO block to handle case where extension is not available
DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_trgm;
EXCEPTION
  WHEN others THEN
    RAISE NOTICE 'pg_trgm extension not available, skipping';
END
$$;

-- 3. Add trigram index on exercise names for fuzzy search (if pg_trgm was enabled)
DO $$
BEGIN
  CREATE INDEX IF NOT EXISTS idx_exercises_name_trgm ON exercises USING gin (name gin_trgm_ops);
EXCEPTION
  WHEN others THEN
    RAISE NOTICE 'Could not create trigram index, skipping';
END
$$;

DO $$
BEGIN
  CREATE INDEX IF NOT EXISTS idx_exercise_aliases_trgm ON exercise_aliases USING gin (alias gin_trgm_ops);
EXCEPTION
  WHEN others THEN
    RAISE NOTICE 'Could not create trigram alias index, skipping';
END
$$;

-- 4. Add description column to exercises
ALTER TABLE exercises ADD COLUMN IF NOT EXISTS description TEXT;
