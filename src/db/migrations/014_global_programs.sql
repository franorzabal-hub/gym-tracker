-- Migration 014: Global programs (templates as DB rows)
-- Allow programs.user_id = NULL for global/template programs.
-- Seed 3 global programs: Full Body 3x, Upper/Lower 4x, Push Pull Legs 6x.

-- 1. Allow NULL user_id on programs
ALTER TABLE programs ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE programs ALTER COLUMN user_id DROP DEFAULT;

-- 2. Replace unique index to handle NULLs properly
DROP INDEX IF EXISTS idx_programs_user_name;
CREATE UNIQUE INDEX idx_programs_user_name ON programs(user_id, LOWER(name)) WHERE user_id IS NOT NULL;
CREATE UNIQUE INDEX idx_programs_global_name ON programs(LOWER(name)) WHERE user_id IS NULL;

-- 3. Ensure all exercises referenced by templates exist as globals (user_id IS NULL)
-- Deadlift was added in migration 003, all others in 002. Nothing new needed.

-- 4. Seed global programs
-- Helper: use a DO block so we can use variables for IDs

DO $$
DECLARE
  prog_id INTEGER;
  ver_id INTEGER;
  day_id INTEGER;
  ex_id INTEGER;
BEGIN

  -- ============================
  -- Full Body 3x
  -- ============================
  INSERT INTO programs (user_id, name, description, is_active)
  VALUES (NULL, 'Full Body 3x', '3 days/week full body routine. Great for beginners or those with limited time.', FALSE)
  RETURNING id INTO prog_id;

  INSERT INTO program_versions (program_id, version_number, change_description)
  VALUES (prog_id, 1, 'Global template') RETURNING id INTO ver_id;

  -- Full Body A (Monday)
  INSERT INTO program_days (version_id, day_label, weekdays, sort_order)
  VALUES (ver_id, 'Full Body A', '{1}', 0) RETURNING id INTO day_id;

  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'squat' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 3, 8, 120, 0);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'bench press' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 3, 8, 90, 1);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'barbell row' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 3, 8, 90, 2);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'overhead press' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 3, 10, 60, 3);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'barbell curl' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 2, 12, 60, 4);

  -- Full Body B (Wednesday)
  INSERT INTO program_days (version_id, day_label, weekdays, sort_order)
  VALUES (ver_id, 'Full Body B', '{3}', 1) RETURNING id INTO day_id;

  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'deadlift' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 3, 5, 180, 0);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'incline bench press' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 3, 10, 90, 1);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'pull-up' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 3, 8, 90, 2);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'dumbbell lateral raise' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 3, 12, 60, 3);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'leg curl' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 3, 12, 60, 4);

  -- Full Body C (Friday)
  INSERT INTO program_days (version_id, day_label, weekdays, sort_order)
  VALUES (ver_id, 'Full Body C', '{5}', 2) RETURNING id INTO day_id;

  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'leg press' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 3, 10, 90, 0);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'bench press' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 3, 10, 90, 1);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'barbell row' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 3, 10, 90, 2);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'face pull' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 3, 15, 60, 3);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'tricep pushdown' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 2, 12, 60, 4);

  -- ============================
  -- Upper/Lower 4x
  -- ============================
  INSERT INTO programs (user_id, name, description, is_active)
  VALUES (NULL, 'Upper/Lower 4x', '4 days/week upper/lower split. Good balance of volume and recovery for intermediate lifters.', FALSE)
  RETURNING id INTO prog_id;

  INSERT INTO program_versions (program_id, version_number, change_description)
  VALUES (prog_id, 1, 'Global template') RETURNING id INTO ver_id;

  -- Upper A (Monday)
  INSERT INTO program_days (version_id, day_label, weekdays, sort_order)
  VALUES (ver_id, 'Upper A', '{1}', 0) RETURNING id INTO day_id;

  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'bench press' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 4, 6, 120, 0);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'barbell row' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 4, 8, 90, 1);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'overhead press' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 3, 10, 90, 2);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'cable fly' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 3, 12, 60, 3);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'barbell curl' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 3, 10, 60, 4);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'tricep pushdown' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 3, 12, 60, 5);

  -- Lower A (Tuesday)
  INSERT INTO program_days (version_id, day_label, weekdays, sort_order)
  VALUES (ver_id, 'Lower A', '{2}', 1) RETURNING id INTO day_id;

  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'squat' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 4, 6, 180, 0);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'romanian deadlift' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 3, 10, 90, 1);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'leg press' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 3, 12, 90, 2);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'leg curl' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 3, 12, 60, 3);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'calf raise' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 4, 15, 60, 4);

  -- Upper B (Thursday)
  INSERT INTO program_days (version_id, day_label, weekdays, sort_order)
  VALUES (ver_id, 'Upper B', '{4}', 2) RETURNING id INTO day_id;

  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'overhead press' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 4, 6, 120, 0);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'pull-up' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 4, 8, 90, 1);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'incline bench press' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 3, 10, 90, 2);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'face pull' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 3, 15, 60, 3);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'hammer curl' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 3, 12, 60, 4);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'dumbbell lateral raise' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 3, 15, 60, 5);

  -- Lower B (Friday)
  INSERT INTO program_days (version_id, day_label, weekdays, sort_order)
  VALUES (ver_id, 'Lower B', '{5}', 3) RETURNING id INTO day_id;

  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'deadlift' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 3, 5, 180, 0);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'squat' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 3, 10, 120, 1);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'leg press' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 3, 15, 90, 2);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'leg curl' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 3, 12, 60, 3);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'calf raise' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 4, 15, 60, 4);

  -- ============================
  -- Push Pull Legs 6x
  -- ============================
  INSERT INTO programs (user_id, name, description, is_active)
  VALUES (NULL, 'Push Pull Legs 6x', '6 days/week PPL split. High volume for experienced lifters with each muscle group trained twice.', FALSE)
  RETURNING id INTO prog_id;

  INSERT INTO program_versions (program_id, version_number, change_description)
  VALUES (prog_id, 1, 'Global template') RETURNING id INTO ver_id;

  -- Push A (Monday)
  INSERT INTO program_days (version_id, day_label, weekdays, sort_order)
  VALUES (ver_id, 'Push A', '{1}', 0) RETURNING id INTO day_id;

  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'bench press' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 4, 6, 120, 0);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'overhead press' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 3, 10, 90, 1);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'incline bench press' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 3, 10, 90, 2);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'cable fly' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 3, 12, 60, 3);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'dumbbell lateral raise' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 3, 15, 60, 4);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'tricep pushdown' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 3, 12, 60, 5);

  -- Pull A (Tuesday)
  INSERT INTO program_days (version_id, day_label, weekdays, sort_order)
  VALUES (ver_id, 'Pull A', '{2}', 1) RETURNING id INTO day_id;

  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'barbell row' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 4, 6, 120, 0);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'pull-up' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 3, 8, 90, 1);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'face pull' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 3, 15, 60, 2);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'barbell curl' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 3, 10, 60, 3);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'hammer curl' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 3, 12, 60, 4);

  -- Legs A (Wednesday)
  INSERT INTO program_days (version_id, day_label, weekdays, sort_order)
  VALUES (ver_id, 'Legs A', '{3}', 2) RETURNING id INTO day_id;

  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'squat' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 4, 6, 180, 0);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'romanian deadlift' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 3, 10, 90, 1);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'leg press' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 3, 12, 90, 2);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'leg curl' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 3, 12, 60, 3);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'calf raise' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 4, 15, 60, 4);

  -- Push B (Thursday)
  INSERT INTO program_days (version_id, day_label, weekdays, sort_order)
  VALUES (ver_id, 'Push B', '{4}', 3) RETURNING id INTO day_id;

  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'overhead press' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 4, 6, 120, 0);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'bench press' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 3, 10, 90, 1);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'cable fly' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 3, 12, 60, 2);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'incline bench press' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 3, 12, 90, 3);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'dumbbell lateral raise' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 3, 15, 60, 4);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'tricep pushdown' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 3, 15, 60, 5);

  -- Pull B (Friday)
  INSERT INTO program_days (version_id, day_label, weekdays, sort_order)
  VALUES (ver_id, 'Pull B', '{5}', 4) RETURNING id INTO day_id;

  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'deadlift' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 3, 5, 180, 0);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'barbell row' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 3, 10, 90, 1);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'pull-up' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 3, 10, 90, 2);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'face pull' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 3, 15, 60, 3);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'barbell curl' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 3, 12, 60, 4);

  -- Legs B (Saturday)
  INSERT INTO program_days (version_id, day_label, weekdays, sort_order)
  VALUES (ver_id, 'Legs B', '{6}', 5) RETURNING id INTO day_id;

  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'deadlift' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 3, 8, 180, 0);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'squat' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 3, 10, 120, 1);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'leg press' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 3, 15, 90, 2);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'leg curl' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 3, 15, 60, 3);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'calf raise' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 4, 15, 60, 4);

END $$;
