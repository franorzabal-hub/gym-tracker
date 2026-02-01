-- Migration 013: Add group_type to program_day_exercises
-- Allows distinguishing between superset, paired (active rest), and circuit groupings.
-- NULL means the exercise has no group, or legacy superset_group rows default to 'superset' behavior.

ALTER TABLE program_day_exercises
  ADD COLUMN IF NOT EXISTS group_type TEXT
  CHECK (group_type IN ('superset', 'paired', 'circuit'));

-- Backfill: existing rows with superset_group set to 'superset'
UPDATE program_day_exercises
  SET group_type = 'superset'
  WHERE superset_group IS NOT NULL AND group_type IS NULL;
