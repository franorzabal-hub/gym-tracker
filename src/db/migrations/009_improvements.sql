-- Migration 009: Add rep_type and exercise_type columns to exercises

ALTER TABLE exercises ADD COLUMN IF NOT EXISTS rep_type TEXT DEFAULT 'reps';
ALTER TABLE exercises ADD COLUMN IF NOT EXISTS exercise_type TEXT DEFAULT 'strength';

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'exercises_rep_type_check'
  ) THEN
    ALTER TABLE exercises ADD CONSTRAINT exercises_rep_type_check
      CHECK (rep_type IN ('reps', 'seconds', 'meters', 'calories'));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'exercises_exercise_type_check'
  ) THEN
    ALTER TABLE exercises ADD CONSTRAINT exercises_exercise_type_check
      CHECK (exercise_type IN ('strength', 'mobility', 'cardio', 'warmup'));
  END IF;
END $$;
