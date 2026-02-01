-- Migration 015: Seed ~25 new global exercises + ~22 well-known workout programs
-- All exercises and programs have user_id = NULL (global/template).

-- ============================================================
-- PART 1: New global exercises (idempotent via ON CONFLICT)
-- ============================================================

INSERT INTO exercises (user_id, name, muscle_group, equipment, rep_type, exercise_type) VALUES
  (NULL, 'Lat Pulldown', 'back', 'cable', 'reps', 'strength'),
  (NULL, 'Chin-Up', 'back', 'bodyweight', 'reps', 'strength'),
  (NULL, 'Seated Cable Row', 'back', 'cable', 'reps', 'strength'),
  (NULL, 'T-Bar Row', 'back', 'barbell', 'reps', 'strength'),
  (NULL, 'Dumbbell Row', 'back', 'dumbbell', 'reps', 'strength'),
  (NULL, 'Front Squat', 'quadriceps', 'barbell', 'reps', 'strength'),
  (NULL, 'Leg Extension', 'quadriceps', 'machine', 'reps', 'strength'),
  (NULL, 'Barbell Lunge', 'quadriceps', 'barbell', 'reps', 'strength'),
  (NULL, 'Hip Thrust', 'glutes', 'barbell', 'reps', 'strength'),
  (NULL, 'Sumo Deadlift', 'glutes', 'barbell', 'reps', 'strength'),
  (NULL, 'Seated Calf Raise', 'calves', 'machine', 'reps', 'strength'),
  (NULL, 'Dumbbell Bench Press', 'chest', 'dumbbell', 'reps', 'strength'),
  (NULL, 'Dumbbell Fly', 'chest', 'dumbbell', 'reps', 'strength'),
  (NULL, 'Close-Grip Bench Press', 'triceps', 'barbell', 'reps', 'strength'),
  (NULL, 'Skull Crusher', 'triceps', 'barbell', 'reps', 'strength'),
  (NULL, 'Overhead Tricep Extension', 'triceps', 'dumbbell', 'reps', 'strength'),
  (NULL, 'Dip', 'triceps', 'bodyweight', 'reps', 'strength'),
  (NULL, 'Preacher Curl', 'biceps', 'barbell', 'reps', 'strength'),
  (NULL, 'Incline Dumbbell Curl', 'biceps', 'dumbbell', 'reps', 'strength'),
  (NULL, 'Concentration Curl', 'biceps', 'dumbbell', 'reps', 'strength'),
  (NULL, 'Cable Curl', 'biceps', 'cable', 'reps', 'strength'),
  (NULL, 'Dumbbell Overhead Press', 'shoulders', 'dumbbell', 'reps', 'strength'),
  (NULL, 'Rear Delt Fly', 'shoulders', 'dumbbell', 'reps', 'strength'),
  (NULL, 'Barbell Shrug', 'traps', 'barbell', 'reps', 'strength'),
  (NULL, 'Cable Crunch', 'abs', 'cable', 'reps', 'strength')
ON CONFLICT (COALESCE(user_id, 0), LOWER(name)) DO NOTHING;

-- Spanish aliases for new exercises
INSERT INTO exercise_aliases (exercise_id, alias) VALUES
  ((SELECT id FROM exercises WHERE LOWER(name) = 'lat pulldown' AND user_id IS NULL), 'jalón al pecho'),
  ((SELECT id FROM exercises WHERE LOWER(name) = 'lat pulldown' AND user_id IS NULL), 'jalón polea'),
  ((SELECT id FROM exercises WHERE LOWER(name) = 'chin-up' AND user_id IS NULL), 'dominadas supinas'),
  ((SELECT id FROM exercises WHERE LOWER(name) = 'chin-up' AND user_id IS NULL), 'chin up'),
  ((SELECT id FROM exercises WHERE LOWER(name) = 'seated cable row' AND user_id IS NULL), 'remo en polea'),
  ((SELECT id FROM exercises WHERE LOWER(name) = 'seated cable row' AND user_id IS NULL), 'remo sentado'),
  ((SELECT id FROM exercises WHERE LOWER(name) = 't-bar row' AND user_id IS NULL), 'remo t-bar'),
  ((SELECT id FROM exercises WHERE LOWER(name) = 't-bar row' AND user_id IS NULL), 'remo en t'),
  ((SELECT id FROM exercises WHERE LOWER(name) = 'dumbbell row' AND user_id IS NULL), 'remo con mancuerna'),
  ((SELECT id FROM exercises WHERE LOWER(name) = 'dumbbell row' AND user_id IS NULL), 'remo mancuerna'),
  ((SELECT id FROM exercises WHERE LOWER(name) = 'front squat' AND user_id IS NULL), 'sentadilla frontal'),
  ((SELECT id FROM exercises WHERE LOWER(name) = 'front squat' AND user_id IS NULL), 'front squat'),
  ((SELECT id FROM exercises WHERE LOWER(name) = 'leg extension' AND user_id IS NULL), 'extensión de piernas'),
  ((SELECT id FROM exercises WHERE LOWER(name) = 'leg extension' AND user_id IS NULL), 'extensiones'),
  ((SELECT id FROM exercises WHERE LOWER(name) = 'barbell lunge' AND user_id IS NULL), 'zancada con barra'),
  ((SELECT id FROM exercises WHERE LOWER(name) = 'barbell lunge' AND user_id IS NULL), 'estocada'),
  ((SELECT id FROM exercises WHERE LOWER(name) = 'hip thrust' AND user_id IS NULL), 'empuje de cadera'),
  ((SELECT id FROM exercises WHERE LOWER(name) = 'hip thrust' AND user_id IS NULL), 'hip thrust'),
  ((SELECT id FROM exercises WHERE LOWER(name) = 'sumo deadlift' AND user_id IS NULL), 'peso muerto sumo'),
  ((SELECT id FROM exercises WHERE LOWER(name) = 'sumo deadlift' AND user_id IS NULL), 'sumo'),
  ((SELECT id FROM exercises WHERE LOWER(name) = 'seated calf raise' AND user_id IS NULL), 'gemelo sentado'),
  ((SELECT id FROM exercises WHERE LOWER(name) = 'seated calf raise' AND user_id IS NULL), 'pantorrilla sentado'),
  ((SELECT id FROM exercises WHERE LOWER(name) = 'dumbbell bench press' AND user_id IS NULL), 'press mancuernas'),
  ((SELECT id FROM exercises WHERE LOWER(name) = 'dumbbell bench press' AND user_id IS NULL), 'press con mancuernas'),
  ((SELECT id FROM exercises WHERE LOWER(name) = 'dumbbell fly' AND user_id IS NULL), 'aperturas con mancuerna'),
  ((SELECT id FROM exercises WHERE LOWER(name) = 'dumbbell fly' AND user_id IS NULL), 'aperturas'),
  ((SELECT id FROM exercises WHERE LOWER(name) = 'close-grip bench press' AND user_id IS NULL), 'press agarre cerrado'),
  ((SELECT id FROM exercises WHERE LOWER(name) = 'close-grip bench press' AND user_id IS NULL), 'press cerrado'),
  ((SELECT id FROM exercises WHERE LOWER(name) = 'skull crusher' AND user_id IS NULL), 'rompecráneos'),
  ((SELECT id FROM exercises WHERE LOWER(name) = 'skull crusher' AND user_id IS NULL), 'extensión francés'),
  ((SELECT id FROM exercises WHERE LOWER(name) = 'overhead tricep extension' AND user_id IS NULL), 'extensión de tríceps'),
  ((SELECT id FROM exercises WHERE LOWER(name) = 'overhead tricep extension' AND user_id IS NULL), 'extensión overhead'),
  ((SELECT id FROM exercises WHERE LOWER(name) = 'dip' AND user_id IS NULL), 'fondos'),
  ((SELECT id FROM exercises WHERE LOWER(name) = 'dip' AND user_id IS NULL), 'fondos en paralelas'),
  ((SELECT id FROM exercises WHERE LOWER(name) = 'preacher curl' AND user_id IS NULL), 'curl en banco scott'),
  ((SELECT id FROM exercises WHERE LOWER(name) = 'preacher curl' AND user_id IS NULL), 'curl predicador'),
  ((SELECT id FROM exercises WHERE LOWER(name) = 'incline dumbbell curl' AND user_id IS NULL), 'curl inclinado'),
  ((SELECT id FROM exercises WHERE LOWER(name) = 'incline dumbbell curl' AND user_id IS NULL), 'curl mancuerna inclinado'),
  ((SELECT id FROM exercises WHERE LOWER(name) = 'concentration curl' AND user_id IS NULL), 'curl concentrado'),
  ((SELECT id FROM exercises WHERE LOWER(name) = 'concentration curl' AND user_id IS NULL), 'curl concentración'),
  ((SELECT id FROM exercises WHERE LOWER(name) = 'cable curl' AND user_id IS NULL), 'curl en polea'),
  ((SELECT id FROM exercises WHERE LOWER(name) = 'cable curl' AND user_id IS NULL), 'curl cable'),
  ((SELECT id FROM exercises WHERE LOWER(name) = 'dumbbell overhead press' AND user_id IS NULL), 'press hombro mancuerna'),
  ((SELECT id FROM exercises WHERE LOWER(name) = 'dumbbell overhead press' AND user_id IS NULL), 'press arnold'),
  ((SELECT id FROM exercises WHERE LOWER(name) = 'rear delt fly' AND user_id IS NULL), 'pájaro'),
  ((SELECT id FROM exercises WHERE LOWER(name) = 'rear delt fly' AND user_id IS NULL), 'vuelos posteriores'),
  ((SELECT id FROM exercises WHERE LOWER(name) = 'barbell shrug' AND user_id IS NULL), 'encogimientos'),
  ((SELECT id FROM exercises WHERE LOWER(name) = 'barbell shrug' AND user_id IS NULL), 'encogimiento con barra'),
  ((SELECT id FROM exercises WHERE LOWER(name) = 'cable crunch' AND user_id IS NULL), 'crunch en polea'),
  ((SELECT id FROM exercises WHERE LOWER(name) = 'cable crunch' AND user_id IS NULL), 'abdominales en polea')
ON CONFLICT (alias) DO NOTHING;


-- ============================================================
-- PART 2: Global programs
-- Helper macro for looking up exercise id
-- ============================================================

DO $$
DECLARE
  prog_id INTEGER;
  ver_id INTEGER;
  day_id INTEGER;
  ex_id INTEGER;
BEGIN

  -- ============================
  -- 1. Starting Strength (3 days)
  -- ============================
  INSERT INTO programs (user_id, name, description, is_active)
  VALUES (NULL, 'Starting Strength', 'Rippetoe''s classic beginner program. A/B alternating, 3 days/week, focused on linear progression with compound lifts.', FALSE)
  RETURNING id INTO prog_id;
  INSERT INTO program_versions (program_id, version_number, change_description)
  VALUES (prog_id, 1, 'Global template') RETURNING id INTO ver_id;

  -- Workout A (Mon/Fri alternating)
  INSERT INTO program_days (version_id, day_label, weekdays, sort_order)
  VALUES (ver_id, 'Workout A', '{1,5}', 0) RETURNING id INTO day_id;
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'squat' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 3, 5, 180, 0);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'bench press' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 3, 5, 180, 1);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'deadlift' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 1, 5, 180, 2);

  -- Workout B (Wed)
  INSERT INTO program_days (version_id, day_label, weekdays, sort_order)
  VALUES (ver_id, 'Workout B', '{3}', 1) RETURNING id INTO day_id;
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'squat' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 3, 5, 180, 0);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'overhead press' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 3, 5, 180, 1);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'chin-up' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 3, 8, 120, 2);

  -- ============================
  -- 2. StrongLifts 5x5 (3 days)
  -- ============================
  INSERT INTO programs (user_id, name, description, is_active)
  VALUES (NULL, 'StrongLifts 5x5', 'Classic beginner 5x5 program. A/B alternating, 3 days/week. Squat every session, linear progression.', FALSE)
  RETURNING id INTO prog_id;
  INSERT INTO program_versions (program_id, version_number, change_description)
  VALUES (prog_id, 1, 'Global template') RETURNING id INTO ver_id;

  -- Workout A
  INSERT INTO program_days (version_id, day_label, weekdays, sort_order)
  VALUES (ver_id, 'Workout A', '{1,5}', 0) RETURNING id INTO day_id;
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'squat' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 5, 5, 180, 0);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'bench press' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 5, 5, 180, 1);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'barbell row' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 5, 5, 180, 2);

  -- Workout B
  INSERT INTO program_days (version_id, day_label, weekdays, sort_order)
  VALUES (ver_id, 'Workout B', '{3}', 1) RETURNING id INTO day_id;
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'squat' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 5, 5, 180, 0);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'overhead press' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 5, 5, 180, 1);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'deadlift' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 1, 5, 180, 2);

  -- ============================
  -- 3. ICF 5x5 (3 days)
  -- ============================
  INSERT INTO programs (user_id, name, description, is_active)
  VALUES (NULL, 'ICF 5x5', 'Ice Cream Fitness 5x5. StrongLifts base + accessory work (curls, extensions, shrugs). A/B alternating, 3 days/week.', FALSE)
  RETURNING id INTO prog_id;
  INSERT INTO program_versions (program_id, version_number, change_description)
  VALUES (prog_id, 1, 'Global template') RETURNING id INTO ver_id;

  -- Workout A
  INSERT INTO program_days (version_id, day_label, weekdays, sort_order)
  VALUES (ver_id, 'Workout A', '{1,5}', 0) RETURNING id INTO day_id;
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'squat' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 5, 5, 180, 0);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'bench press' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 5, 5, 180, 1);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'barbell row' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 5, 5, 120, 2);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'barbell shrug' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 3, 8, 60, 3);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'skull crusher' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 3, 8, 60, 4);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'barbell curl' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 3, 8, 60, 5);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'cable crunch' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 3, 12, 60, 6);

  -- Workout B
  INSERT INTO program_days (version_id, day_label, weekdays, sort_order)
  VALUES (ver_id, 'Workout B', '{3}', 1) RETURNING id INTO day_id;
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'squat' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 5, 5, 180, 0);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'overhead press' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 5, 5, 180, 1);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'deadlift' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 1, 5, 180, 2);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'barbell shrug' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 3, 8, 60, 3);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'close-grip bench press' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 3, 8, 90, 4);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'barbell curl' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 3, 8, 60, 5);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'cable crunch' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 3, 12, 60, 6);

  -- ============================
  -- 4. 5/3/1 for Beginners (3 days)
  -- ============================
  INSERT INTO programs (user_id, name, description, is_active)
  VALUES (NULL, '5/3/1 for Beginners', 'Wendler''s beginner variant. 3 days/week, two main lifts per day + FSL 5x5 supplemental + accessories.', FALSE)
  RETURNING id INTO prog_id;
  INSERT INTO program_versions (program_id, version_number, change_description)
  VALUES (prog_id, 1, 'Global template') RETURNING id INTO ver_id;

  -- Day 1 (Mon): Squat + Bench
  INSERT INTO program_days (version_id, day_label, weekdays, sort_order)
  VALUES (ver_id, 'Squat + Bench', '{1}', 0) RETURNING id INTO day_id;
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'squat' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 8, 5, 120, 0);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'bench press' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 8, 5, 120, 1);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'chin-up' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 3, 10, 60, 2);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'dumbbell fly' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 3, 12, 60, 3);

  -- Day 2 (Wed): Deadlift + OHP
  INSERT INTO program_days (version_id, day_label, weekdays, sort_order)
  VALUES (ver_id, 'Deadlift + OHP', '{3}', 1) RETURNING id INTO day_id;
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'deadlift' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 8, 5, 120, 0);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'overhead press' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 8, 5, 120, 1);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'barbell row' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 3, 10, 60, 2);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'leg curl' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 3, 12, 60, 3);

  -- Day 3 (Fri): Bench + Squat
  INSERT INTO program_days (version_id, day_label, weekdays, sort_order)
  VALUES (ver_id, 'Bench + Squat', '{5}', 2) RETURNING id INTO day_id;
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'bench press' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 8, 5, 120, 0);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'squat' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 8, 5, 120, 1);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'lat pulldown' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 3, 10, 60, 2);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'face pull' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 3, 15, 60, 3);

  -- ============================
  -- 5. r/Fitness Basic Beginner (3 days)
  -- ============================
  INSERT INTO programs (user_id, name, description, is_active)
  VALUES (NULL, 'r/Fitness Basic Beginner', 'Reddit''s recommended beginner routine. A/B alternating, 3 days/week. Simple and effective compound focus.', FALSE)
  RETURNING id INTO prog_id;
  INSERT INTO program_versions (program_id, version_number, change_description)
  VALUES (prog_id, 1, 'Global template') RETURNING id INTO ver_id;

  -- Workout A
  INSERT INTO program_days (version_id, day_label, weekdays, sort_order)
  VALUES (ver_id, 'Workout A', '{1,5}', 0) RETURNING id INTO day_id;
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'barbell row' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 3, 5, 120, 0);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'bench press' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 3, 5, 120, 1);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'squat' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 3, 5, 180, 2);

  -- Workout B
  INSERT INTO program_days (version_id, day_label, weekdays, sort_order)
  VALUES (ver_id, 'Workout B', '{3}', 1) RETURNING id INTO day_id;
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'chin-up' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 3, 5, 120, 0);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'overhead press' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 3, 5, 120, 1);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'deadlift' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 3, 5, 180, 2);

  -- ============================
  -- 6. GZCLP (4 days)
  -- ============================
  INSERT INTO programs (user_id, name, description, is_active)
  VALUES (NULL, 'GZCLP', 'GZCL Linear Progression. 4 days/week T1/T2/T3 structure. Great transition from beginner to intermediate.', FALSE)
  RETURNING id INTO prog_id;
  INSERT INTO program_versions (program_id, version_number, change_description)
  VALUES (prog_id, 1, 'Global template') RETURNING id INTO ver_id;

  -- Day 1: T1 Squat
  INSERT INTO program_days (version_id, day_label, weekdays, sort_order)
  VALUES (ver_id, 'T1 Squat', '{1}', 0) RETURNING id INTO day_id;
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'squat' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order, notes) VALUES (day_id, ex_id, 5, 3, 180, 0, 'T1');
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'bench press' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order, notes) VALUES (day_id, ex_id, 3, 10, 90, 1, 'T2');
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'lat pulldown' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order, notes) VALUES (day_id, ex_id, 3, 15, 60, 2, 'T3');

  -- Day 2: T1 OHP
  INSERT INTO program_days (version_id, day_label, weekdays, sort_order)
  VALUES (ver_id, 'T1 OHP', '{2}', 1) RETURNING id INTO day_id;
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'overhead press' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order, notes) VALUES (day_id, ex_id, 5, 3, 180, 0, 'T1');
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'deadlift' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order, notes) VALUES (day_id, ex_id, 3, 10, 120, 1, 'T2');
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'dumbbell row' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order, notes) VALUES (day_id, ex_id, 3, 15, 60, 2, 'T3');

  -- Day 3: T1 Bench
  INSERT INTO program_days (version_id, day_label, weekdays, sort_order)
  VALUES (ver_id, 'T1 Bench', '{4}', 2) RETURNING id INTO day_id;
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'bench press' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order, notes) VALUES (day_id, ex_id, 5, 3, 180, 0, 'T1');
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'squat' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order, notes) VALUES (day_id, ex_id, 3, 10, 120, 1, 'T2');
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'lat pulldown' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order, notes) VALUES (day_id, ex_id, 3, 15, 60, 2, 'T3');

  -- Day 4: T1 Deadlift
  INSERT INTO program_days (version_id, day_label, weekdays, sort_order)
  VALUES (ver_id, 'T1 Deadlift', '{5}', 3) RETURNING id INTO day_id;
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'deadlift' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order, notes) VALUES (day_id, ex_id, 5, 3, 180, 0, 'T1');
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'overhead press' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order, notes) VALUES (day_id, ex_id, 3, 10, 90, 1, 'T2');
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'dumbbell row' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order, notes) VALUES (day_id, ex_id, 3, 15, 60, 2, 'T3');

  -- ============================
  -- 7. PHUL (4 days)
  -- ============================
  INSERT INTO programs (user_id, name, description, is_active)
  VALUES (NULL, 'PHUL', 'Power Hypertrophy Upper Lower. 4 days/week: 2 power days + 2 hypertrophy days. Great for strength and size.', FALSE)
  RETURNING id INTO prog_id;
  INSERT INTO program_versions (program_id, version_number, change_description)
  VALUES (prog_id, 1, 'Global template') RETURNING id INTO ver_id;

  -- Upper Power
  INSERT INTO program_days (version_id, day_label, weekdays, sort_order)
  VALUES (ver_id, 'Upper Power', '{1}', 0) RETURNING id INTO day_id;
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'bench press' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 4, 5, 180, 0);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'barbell row' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 4, 5, 120, 1);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'overhead press' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 3, 6, 120, 2);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'barbell curl' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 3, 8, 60, 3);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'skull crusher' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 3, 8, 60, 4);

  -- Lower Power
  INSERT INTO program_days (version_id, day_label, weekdays, sort_order)
  VALUES (ver_id, 'Lower Power', '{2}', 1) RETURNING id INTO day_id;
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'squat' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 4, 5, 180, 0);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'deadlift' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 4, 5, 180, 1);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'leg press' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 3, 10, 90, 2);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'leg curl' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 3, 10, 60, 3);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'calf raise' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 4, 12, 60, 4);

  -- Upper Hypertrophy
  INSERT INTO program_days (version_id, day_label, weekdays, sort_order)
  VALUES (ver_id, 'Upper Hypertrophy', '{4}', 2) RETURNING id INTO day_id;
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'dumbbell bench press' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 4, 12, 90, 0);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'seated cable row' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 4, 12, 60, 1);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'dumbbell overhead press' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 3, 12, 60, 2);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'dumbbell fly' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 3, 15, 60, 3);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'incline dumbbell curl' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 3, 12, 60, 4);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'overhead tricep extension' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 3, 12, 60, 5);

  -- Lower Hypertrophy
  INSERT INTO program_days (version_id, day_label, weekdays, sort_order)
  VALUES (ver_id, 'Lower Hypertrophy', '{5}', 3) RETURNING id INTO day_id;
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'front squat' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 4, 10, 120, 0);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'romanian deadlift' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 4, 10, 90, 1);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'leg extension' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 3, 15, 60, 2);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'leg curl' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 3, 15, 60, 3);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'seated calf raise' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 4, 15, 60, 4);

  -- ============================
  -- 8. Lyle McDonald GBR (4 days)
  -- ============================
  INSERT INTO programs (user_id, name, description, is_active)
  VALUES (NULL, 'Lyle McDonald GBR', 'Generic Bulking Routine. 4-day upper/lower with varied rep ranges (6-8, 10-12, 12-15) for balanced hypertrophy.', FALSE)
  RETURNING id INTO prog_id;
  INSERT INTO program_versions (program_id, version_number, change_description)
  VALUES (prog_id, 1, 'Global template') RETURNING id INTO ver_id;

  -- Upper 1
  INSERT INTO program_days (version_id, day_label, weekdays, sort_order)
  VALUES (ver_id, 'Upper 1', '{1}', 0) RETURNING id INTO day_id;
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'bench press' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 3, 8, 120, 0);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'barbell row' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 3, 8, 120, 1);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'overhead press' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 3, 10, 90, 2);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'lat pulldown' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 3, 10, 60, 3);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'barbell curl' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 2, 12, 60, 4);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'tricep pushdown' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 2, 12, 60, 5);

  -- Lower 1
  INSERT INTO program_days (version_id, day_label, weekdays, sort_order)
  VALUES (ver_id, 'Lower 1', '{2}', 1) RETURNING id INTO day_id;
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'squat' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 3, 8, 180, 0);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'romanian deadlift' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 3, 8, 120, 1);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'leg press' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 3, 12, 90, 2);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'leg curl' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 3, 12, 60, 3);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'calf raise' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 3, 12, 60, 4);

  -- Upper 2
  INSERT INTO program_days (version_id, day_label, weekdays, sort_order)
  VALUES (ver_id, 'Upper 2', '{4}', 2) RETURNING id INTO day_id;
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'incline bench press' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 3, 8, 120, 0);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'chin-up' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 3, 8, 90, 1);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'dumbbell overhead press' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 3, 12, 60, 2);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'seated cable row' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 3, 12, 60, 3);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'hammer curl' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 2, 15, 60, 4);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'overhead tricep extension' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 2, 15, 60, 5);

  -- Lower 2
  INSERT INTO program_days (version_id, day_label, weekdays, sort_order)
  VALUES (ver_id, 'Lower 2', '{5}', 3) RETURNING id INTO day_id;
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'deadlift' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 3, 6, 180, 0);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'front squat' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 3, 10, 120, 1);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'barbell lunge' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 3, 12, 90, 2);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'leg curl' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 3, 12, 60, 3);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'seated calf raise' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 3, 15, 60, 4);

  -- ============================
  -- 9. nSuns 4-Day LP (4 days)
  -- ============================
  INSERT INTO programs (user_id, name, description, is_active)
  VALUES (NULL, 'nSuns 4-Day LP', 'High-volume 5/3/1 variant with 4 days. Two main lifts per day with T1+T2 structure. Fast linear progression.', FALSE)
  RETURNING id INTO prog_id;
  INSERT INTO program_versions (program_id, version_number, change_description)
  VALUES (prog_id, 1, 'Global template') RETURNING id INTO ver_id;

  -- Day 1: Bench + OHP
  INSERT INTO program_days (version_id, day_label, weekdays, sort_order)
  VALUES (ver_id, 'Bench + OHP', '{1}', 0) RETURNING id INTO day_id;
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'bench press' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order, notes) VALUES (day_id, ex_id, 9, 5, 120, 0, 'T1 — pyramid sets');
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'overhead press' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order, notes) VALUES (day_id, ex_id, 8, 6, 90, 1, 'T2');
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'lat pulldown' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 4, 10, 60, 2);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'dumbbell fly' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 3, 12, 60, 3);

  -- Day 2: Squat + Sumo DL
  INSERT INTO program_days (version_id, day_label, weekdays, sort_order)
  VALUES (ver_id, 'Squat + Sumo DL', '{2}', 1) RETURNING id INTO day_id;
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'squat' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order, notes) VALUES (day_id, ex_id, 9, 5, 150, 0, 'T1 — pyramid sets');
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'sumo deadlift' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order, notes) VALUES (day_id, ex_id, 8, 5, 120, 1, 'T2');
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'leg extension' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 3, 12, 60, 2);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'leg curl' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 3, 12, 60, 3);

  -- Day 3: OHP + Bench
  INSERT INTO program_days (version_id, day_label, weekdays, sort_order)
  VALUES (ver_id, 'OHP + Bench', '{4}', 2) RETURNING id INTO day_id;
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'overhead press' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order, notes) VALUES (day_id, ex_id, 9, 5, 120, 0, 'T1 — pyramid sets');
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'bench press' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order, notes) VALUES (day_id, ex_id, 8, 6, 90, 1, 'T2');
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'barbell row' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 4, 8, 90, 2);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'face pull' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 3, 15, 60, 3);

  -- Day 4: DL + Front Squat
  INSERT INTO program_days (version_id, day_label, weekdays, sort_order)
  VALUES (ver_id, 'DL + Front Squat', '{5}', 3) RETURNING id INTO day_id;
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'deadlift' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order, notes) VALUES (day_id, ex_id, 9, 5, 150, 0, 'T1 — pyramid sets');
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'front squat' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order, notes) VALUES (day_id, ex_id, 8, 5, 120, 1, 'T2');
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'leg curl' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 3, 12, 60, 2);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'calf raise' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 4, 15, 60, 3);

  -- ============================
  -- 10. Candito Linear Program (4 days)
  -- ============================
  INSERT INTO programs (user_id, name, description, is_active)
  VALUES (NULL, 'Candito Linear Program', 'Jonnie Candito''s 4-day upper/lower with strength + control days. Good for late beginners/early intermediates.', FALSE)
  RETURNING id INTO prog_id;
  INSERT INTO program_versions (program_id, version_number, change_description)
  VALUES (prog_id, 1, 'Global template') RETURNING id INTO ver_id;

  -- Upper Strength
  INSERT INTO program_days (version_id, day_label, weekdays, sort_order)
  VALUES (ver_id, 'Upper Strength', '{1}', 0) RETURNING id INTO day_id;
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'bench press' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 4, 6, 180, 0);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'barbell row' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 4, 6, 120, 1);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'overhead press' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 3, 8, 90, 2);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'pull-up' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 3, 8, 90, 3);

  -- Lower Strength
  INSERT INTO program_days (version_id, day_label, weekdays, sort_order)
  VALUES (ver_id, 'Lower Strength', '{2}', 1) RETURNING id INTO day_id;
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'squat' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 4, 6, 180, 0);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'deadlift' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 3, 6, 180, 1);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'leg press' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 3, 8, 90, 2);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'leg curl' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 3, 8, 60, 3);

  -- Upper Control
  INSERT INTO program_days (version_id, day_label, weekdays, sort_order)
  VALUES (ver_id, 'Upper Control', '{4}', 2) RETURNING id INTO day_id;
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'dumbbell bench press' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 3, 10, 90, 0);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'dumbbell row' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 3, 10, 60, 1);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'dumbbell overhead press' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 3, 12, 60, 2);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'face pull' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 3, 15, 60, 3);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'barbell curl' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 3, 10, 60, 4);

  -- Lower Control
  INSERT INTO program_days (version_id, day_label, weekdays, sort_order)
  VALUES (ver_id, 'Lower Control', '{5}', 3) RETURNING id INTO day_id;
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'front squat' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 3, 10, 120, 0);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'romanian deadlift' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 3, 10, 90, 1);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'barbell lunge' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 3, 10, 60, 2);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'calf raise' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 4, 15, 60, 3);

  -- ============================
  -- 11. 5/3/1 Boring But Big (4 days)
  -- ============================
  INSERT INTO programs (user_id, name, description, is_active)
  VALUES (NULL, '5/3/1 Boring But Big', 'Jim Wendler''s classic intermediate template. 4 days: main lift 5/3/1 sets + 5x10 supplemental at 50-60%. High volume.', FALSE)
  RETURNING id INTO prog_id;
  INSERT INTO program_versions (program_id, version_number, change_description)
  VALUES (prog_id, 1, 'Global template') RETURNING id INTO ver_id;

  -- Day 1: OHP
  INSERT INTO program_days (version_id, day_label, weekdays, sort_order)
  VALUES (ver_id, 'OHP Day', '{1}', 0) RETURNING id INTO day_id;
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'overhead press' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order, notes) VALUES (day_id, ex_id, 3, 5, 180, 0, '5/3/1 sets');
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order, notes) VALUES (day_id, ex_id, 5, 10, 90, 1, 'BBB 5x10 @ 50-60%');
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'chin-up' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 5, 10, 60, 2);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'face pull' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 3, 15, 60, 3);

  -- Day 2: Deadlift
  INSERT INTO program_days (version_id, day_label, weekdays, sort_order)
  VALUES (ver_id, 'Deadlift Day', '{2}', 1) RETURNING id INTO day_id;
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'deadlift' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order, notes) VALUES (day_id, ex_id, 3, 5, 180, 0, '5/3/1 sets');
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order, notes) VALUES (day_id, ex_id, 5, 10, 120, 1, 'BBB 5x10 @ 50-60%');
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'leg curl' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 5, 10, 60, 2);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'cable crunch' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 3, 15, 60, 3);

  -- Day 3: Bench
  INSERT INTO program_days (version_id, day_label, weekdays, sort_order)
  VALUES (ver_id, 'Bench Day', '{4}', 2) RETURNING id INTO day_id;
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'bench press' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order, notes) VALUES (day_id, ex_id, 3, 5, 180, 0, '5/3/1 sets');
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order, notes) VALUES (day_id, ex_id, 5, 10, 90, 1, 'BBB 5x10 @ 50-60%');
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'dumbbell row' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 5, 10, 60, 2);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'dumbbell fly' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 3, 12, 60, 3);

  -- Day 4: Squat
  INSERT INTO program_days (version_id, day_label, weekdays, sort_order)
  VALUES (ver_id, 'Squat Day', '{5}', 3) RETURNING id INTO day_id;
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'squat' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order, notes) VALUES (day_id, ex_id, 3, 5, 180, 0, '5/3/1 sets');
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order, notes) VALUES (day_id, ex_id, 5, 10, 120, 1, 'BBB 5x10 @ 50-60%');
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'leg press' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 3, 12, 90, 2);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'leg curl' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 3, 12, 60, 3);

  -- ============================
  -- 12. Texas Method (3 days)
  -- ============================
  INSERT INTO programs (user_id, name, description, is_active)
  VALUES (NULL, 'Texas Method', 'Classic intermediate 3-day: Volume Monday, Recovery Wednesday, Intensity Friday. Weekly progression on PRs.', FALSE)
  RETURNING id INTO prog_id;
  INSERT INTO program_versions (program_id, version_number, change_description)
  VALUES (prog_id, 1, 'Global template') RETURNING id INTO ver_id;

  -- Volume Day (Mon)
  INSERT INTO program_days (version_id, day_label, weekdays, sort_order)
  VALUES (ver_id, 'Volume', '{1}', 0) RETURNING id INTO day_id;
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'squat' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order, notes) VALUES (day_id, ex_id, 5, 5, 180, 0, '90% of 5RM');
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'bench press' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order, notes) VALUES (day_id, ex_id, 5, 5, 120, 1, '90% of 5RM');
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'deadlift' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 1, 5, 180, 2);

  -- Recovery Day (Wed)
  INSERT INTO program_days (version_id, day_label, weekdays, sort_order)
  VALUES (ver_id, 'Recovery', '{3}', 1) RETURNING id INTO day_id;
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'squat' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order, notes) VALUES (day_id, ex_id, 2, 5, 120, 0, 'Light — 80% of Monday');
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'overhead press' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 3, 5, 90, 1);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'chin-up' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 3, 10, 60, 2);

  -- Intensity Day (Fri)
  INSERT INTO program_days (version_id, day_label, weekdays, sort_order)
  VALUES (ver_id, 'Intensity', '{5}', 2) RETURNING id INTO day_id;
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'squat' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order, notes) VALUES (day_id, ex_id, 1, 5, 300, 0, 'New 5RM PR attempt');
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'bench press' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order, notes) VALUES (day_id, ex_id, 1, 5, 300, 1, 'New 5RM PR attempt');
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'deadlift' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order, notes) VALUES (day_id, ex_id, 1, 5, 300, 2, 'New 5RM PR attempt');

  -- ============================
  -- 13. Madcow 5x5 (3 days)
  -- ============================
  INSERT INTO programs (user_id, name, description, is_active)
  VALUES (NULL, 'Madcow 5x5', 'Intermediate 3-day 5x5 with weekly progression. Ramping sets to a top set of 5. Classic Bill Starr derivative.', FALSE)
  RETURNING id INTO prog_id;
  INSERT INTO program_versions (program_id, version_number, change_description)
  VALUES (prog_id, 1, 'Global template') RETURNING id INTO ver_id;

  -- Monday (Heavy)
  INSERT INTO program_days (version_id, day_label, weekdays, sort_order)
  VALUES (ver_id, 'Heavy', '{1}', 0) RETURNING id INTO day_id;
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'squat' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order, notes) VALUES (day_id, ex_id, 5, 5, 180, 0, 'Ramping to top set');
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'bench press' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order, notes) VALUES (day_id, ex_id, 5, 5, 120, 1, 'Ramping to top set');
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'barbell row' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order, notes) VALUES (day_id, ex_id, 5, 5, 120, 2, 'Ramping to top set');

  -- Wednesday (Light)
  INSERT INTO program_days (version_id, day_label, weekdays, sort_order)
  VALUES (ver_id, 'Light', '{3}', 1) RETURNING id INTO day_id;
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'squat' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order, notes) VALUES (day_id, ex_id, 4, 5, 120, 0, 'Light — 2 sets of Monday top');
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'overhead press' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order, notes) VALUES (day_id, ex_id, 4, 5, 120, 1, 'Ramping');
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'deadlift' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order, notes) VALUES (day_id, ex_id, 4, 5, 120, 2, 'Ramping');

  -- Friday (Medium)
  INSERT INTO program_days (version_id, day_label, weekdays, sort_order)
  VALUES (ver_id, 'Medium', '{5}', 2) RETURNING id INTO day_id;
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'squat' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order, notes) VALUES (day_id, ex_id, 4, 5, 180, 0, 'Ramp to new PR single set');
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'bench press' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order, notes) VALUES (day_id, ex_id, 4, 5, 120, 1, 'Ramp to new PR single set');
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'barbell row' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order, notes) VALUES (day_id, ex_id, 4, 5, 120, 2, 'Ramp to new PR single set');

  -- ============================
  -- 14. PHAT (5 days)
  -- ============================
  INSERT INTO programs (user_id, name, description, is_active)
  VALUES (NULL, 'PHAT', 'Layne Norton''s Power Hypertrophy Adaptive Training. 5 days: 2 power + 3 hypertrophy. Powerbuilding for intermediates.', FALSE)
  RETURNING id INTO prog_id;
  INSERT INTO program_versions (program_id, version_number, change_description)
  VALUES (prog_id, 1, 'Global template') RETURNING id INTO ver_id;

  -- Upper Power
  INSERT INTO program_days (version_id, day_label, weekdays, sort_order)
  VALUES (ver_id, 'Upper Power', '{1}', 0) RETURNING id INTO day_id;
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'barbell row' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 3, 5, 180, 0);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'bench press' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 3, 5, 180, 1);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'lat pulldown' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 2, 8, 90, 2);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'overhead press' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 3, 6, 120, 3);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'barbell curl' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 3, 8, 60, 4);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'skull crusher' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 3, 8, 60, 5);

  -- Lower Power
  INSERT INTO program_days (version_id, day_label, weekdays, sort_order)
  VALUES (ver_id, 'Lower Power', '{2}', 1) RETURNING id INTO day_id;
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'squat' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 3, 5, 180, 0);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'deadlift' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 3, 5, 180, 1);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'leg press' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 3, 8, 120, 2);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'leg curl' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 3, 8, 60, 3);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'calf raise' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 3, 8, 60, 4);

  -- Back & Shoulders Hypertrophy
  INSERT INTO program_days (version_id, day_label, weekdays, sort_order)
  VALUES (ver_id, 'Back & Shoulders Hyp', '{4}', 2) RETURNING id INTO day_id;
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'barbell row' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 3, 12, 60, 0);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'seated cable row' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 3, 12, 60, 1);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'lat pulldown' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 3, 15, 60, 2);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'dumbbell overhead press' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 3, 12, 60, 3);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'dumbbell lateral raise' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 3, 15, 60, 4);

  -- Chest & Arms Hypertrophy
  INSERT INTO program_days (version_id, day_label, weekdays, sort_order)
  VALUES (ver_id, 'Chest & Arms Hyp', '{5}', 3) RETURNING id INTO day_id;
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'dumbbell bench press' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 3, 12, 60, 0);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'incline bench press' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 3, 12, 60, 1);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'cable fly' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 3, 15, 60, 2);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'preacher curl' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 3, 12, 60, 3);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'overhead tricep extension' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 3, 12, 60, 4);

  -- Legs Hypertrophy
  INSERT INTO program_days (version_id, day_label, weekdays, sort_order)
  VALUES (ver_id, 'Legs Hypertrophy', '{6}', 4) RETURNING id INTO day_id;
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'front squat' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 3, 12, 90, 0);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'barbell lunge' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 3, 12, 60, 1);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'leg extension' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 3, 15, 60, 2);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'leg curl' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 3, 15, 60, 3);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'seated calf raise' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 3, 15, 60, 4);

  -- ============================
  -- 15. nSuns 5-Day LP (5 days)
  -- ============================
  INSERT INTO programs (user_id, name, description, is_active)
  VALUES (NULL, 'nSuns 5-Day LP', 'High-volume 5/3/1 variant, 5 days. Two main lifts per day with T1+T2 pyramid sets. Extra upper body volume.', FALSE)
  RETURNING id INTO prog_id;
  INSERT INTO program_versions (program_id, version_number, change_description)
  VALUES (prog_id, 1, 'Global template') RETURNING id INTO ver_id;

  INSERT INTO program_days (version_id, day_label, weekdays, sort_order)
  VALUES (ver_id, 'Bench + OHP', '{1}', 0) RETURNING id INTO day_id;
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'bench press' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order, notes) VALUES (day_id, ex_id, 9, 5, 120, 0, 'T1');
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'overhead press' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order, notes) VALUES (day_id, ex_id, 8, 6, 90, 1, 'T2');
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'lat pulldown' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 4, 10, 60, 2);

  INSERT INTO program_days (version_id, day_label, weekdays, sort_order)
  VALUES (ver_id, 'Squat + Sumo DL', '{2}', 1) RETURNING id INTO day_id;
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'squat' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order, notes) VALUES (day_id, ex_id, 9, 5, 150, 0, 'T1');
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'sumo deadlift' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order, notes) VALUES (day_id, ex_id, 8, 5, 120, 1, 'T2');
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'leg extension' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 3, 12, 60, 2);

  INSERT INTO program_days (version_id, day_label, weekdays, sort_order)
  VALUES (ver_id, 'OHP + Incline', '{3}', 2) RETURNING id INTO day_id;
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'overhead press' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order, notes) VALUES (day_id, ex_id, 9, 5, 120, 0, 'T1');
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'incline bench press' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order, notes) VALUES (day_id, ex_id, 8, 6, 90, 1, 'T2');
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'barbell row' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 4, 8, 90, 2);

  INSERT INTO program_days (version_id, day_label, weekdays, sort_order)
  VALUES (ver_id, 'DL + Front Squat', '{4}', 3) RETURNING id INTO day_id;
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'deadlift' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order, notes) VALUES (day_id, ex_id, 9, 5, 150, 0, 'T1');
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'front squat' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order, notes) VALUES (day_id, ex_id, 8, 5, 120, 1, 'T2');
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'leg curl' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 3, 12, 60, 2);

  INSERT INTO program_days (version_id, day_label, weekdays, sort_order)
  VALUES (ver_id, 'Bench + CG Bench', '{5}', 4) RETURNING id INTO day_id;
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'bench press' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order, notes) VALUES (day_id, ex_id, 9, 5, 120, 0, 'T1');
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'close-grip bench press' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order, notes) VALUES (day_id, ex_id, 8, 6, 90, 1, 'T2');
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'face pull' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 3, 15, 60, 2);

  -- ============================
  -- 16. Bro Split (5 days)
  -- ============================
  INSERT INTO programs (user_id, name, description, is_active)
  VALUES (NULL, 'Bro Split', 'Classic 5-day bodybuilding split. Each muscle group once per week with high volume. Chest, Back, Shoulders, Legs, Arms.', FALSE)
  RETURNING id INTO prog_id;
  INSERT INTO program_versions (program_id, version_number, change_description)
  VALUES (prog_id, 1, 'Global template') RETURNING id INTO ver_id;

  -- Chest
  INSERT INTO program_days (version_id, day_label, weekdays, sort_order)
  VALUES (ver_id, 'Chest', '{1}', 0) RETURNING id INTO day_id;
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'bench press' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 4, 8, 120, 0);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'incline bench press' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 4, 10, 90, 1);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'dumbbell bench press' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 3, 12, 60, 2);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'cable fly' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 3, 15, 60, 3);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'dumbbell fly' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 3, 12, 60, 4);

  -- Back
  INSERT INTO program_days (version_id, day_label, weekdays, sort_order)
  VALUES (ver_id, 'Back', '{2}', 1) RETURNING id INTO day_id;
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'deadlift' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 4, 6, 180, 0);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'barbell row' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 4, 8, 90, 1);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'lat pulldown' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 3, 10, 60, 2);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'seated cable row' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 3, 12, 60, 3);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'face pull' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 3, 15, 60, 4);

  -- Shoulders
  INSERT INTO program_days (version_id, day_label, weekdays, sort_order)
  VALUES (ver_id, 'Shoulders', '{3}', 2) RETURNING id INTO day_id;
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'overhead press' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 4, 8, 120, 0);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'dumbbell overhead press' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 3, 10, 60, 1);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'dumbbell lateral raise' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 4, 15, 60, 2);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'rear delt fly' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 3, 15, 60, 3);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'barbell shrug' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 4, 12, 60, 4);

  -- Legs
  INSERT INTO program_days (version_id, day_label, weekdays, sort_order)
  VALUES (ver_id, 'Legs', '{4}', 3) RETURNING id INTO day_id;
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'squat' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 4, 8, 180, 0);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'romanian deadlift' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 4, 10, 90, 1);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'leg press' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 3, 12, 90, 2);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'leg extension' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 3, 15, 60, 3);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'leg curl' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 3, 15, 60, 4);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'calf raise' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 4, 15, 60, 5);

  -- Arms
  INSERT INTO program_days (version_id, day_label, weekdays, sort_order)
  VALUES (ver_id, 'Arms', '{5}', 4) RETURNING id INTO day_id;
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'barbell curl' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 4, 10, 60, 0);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'close-grip bench press' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 4, 10, 90, 1);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'hammer curl' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 3, 12, 60, 2);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'skull crusher' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 3, 12, 60, 3);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'concentration curl' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 3, 12, 60, 4);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'tricep pushdown' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 3, 15, 60, 5);

END $$;

-- Programs 17-22 in a separate block to keep each DO block manageable
DO $$
DECLARE
  prog_id INTEGER;
  ver_id INTEGER;
  day_id INTEGER;
  ex_id INTEGER;
BEGIN

  -- ============================
  -- 17. Arnold Split (6 days)
  -- ============================
  INSERT INTO programs (user_id, name, description, is_active)
  VALUES (NULL, 'Arnold Split', 'Arnold Schwarzenegger''s 6-day split: Chest+Back, Shoulders+Arms, Legs — repeated twice. High volume bodybuilding.', FALSE)
  RETURNING id INTO prog_id;
  INSERT INTO program_versions (program_id, version_number, change_description)
  VALUES (prog_id, 1, 'Global template') RETURNING id INTO ver_id;

  -- Chest + Back A
  INSERT INTO program_days (version_id, day_label, weekdays, sort_order)
  VALUES (ver_id, 'Chest + Back A', '{1}', 0) RETURNING id INTO day_id;
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'bench press' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 4, 8, 90, 0);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'incline bench press' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 3, 10, 90, 1);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'dumbbell fly' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 3, 12, 60, 2);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'pull-up' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 4, 8, 90, 3);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'barbell row' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 4, 10, 60, 4);

  -- Shoulders + Arms A
  INSERT INTO program_days (version_id, day_label, weekdays, sort_order)
  VALUES (ver_id, 'Shoulders + Arms A', '{2}', 1) RETURNING id INTO day_id;
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'overhead press' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 4, 8, 90, 0);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'dumbbell lateral raise' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 4, 12, 60, 1);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'barbell curl' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 4, 10, 60, 2);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'skull crusher' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 4, 10, 60, 3);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'dip' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 3, 10, 60, 4);

  -- Legs A
  INSERT INTO program_days (version_id, day_label, weekdays, sort_order)
  VALUES (ver_id, 'Legs A', '{3}', 2) RETURNING id INTO day_id;
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'squat' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 4, 8, 180, 0);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'barbell lunge' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 3, 10, 90, 1);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'leg extension' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 3, 12, 60, 2);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'leg curl' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 3, 12, 60, 3);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'calf raise' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 4, 15, 60, 4);

  -- Chest + Back B
  INSERT INTO program_days (version_id, day_label, weekdays, sort_order)
  VALUES (ver_id, 'Chest + Back B', '{4}', 3) RETURNING id INTO day_id;
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'dumbbell bench press' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 4, 10, 90, 0);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'cable fly' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 3, 12, 60, 1);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'chin-up' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 4, 8, 90, 2);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 't-bar row' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 4, 10, 60, 3);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'lat pulldown' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 3, 12, 60, 4);

  -- Shoulders + Arms B
  INSERT INTO program_days (version_id, day_label, weekdays, sort_order)
  VALUES (ver_id, 'Shoulders + Arms B', '{5}', 4) RETURNING id INTO day_id;
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'dumbbell overhead press' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 4, 10, 90, 0);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'rear delt fly' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 3, 15, 60, 1);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'incline dumbbell curl' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 3, 12, 60, 2);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'overhead tricep extension' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 3, 12, 60, 3);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'hammer curl' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 3, 12, 60, 4);

  -- Legs B
  INSERT INTO program_days (version_id, day_label, weekdays, sort_order)
  VALUES (ver_id, 'Legs B', '{6}', 5) RETURNING id INTO day_id;
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'front squat' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 4, 10, 120, 0);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'romanian deadlift' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 4, 10, 90, 1);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'hip thrust' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 3, 12, 60, 2);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'leg curl' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 3, 15, 60, 3);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'seated calf raise' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 4, 15, 60, 4);

  -- ============================
  -- 18. Coolcicada PPL (6 days)
  -- ============================
  INSERT INTO programs (user_id, name, description, is_active)
  VALUES (NULL, 'Coolcicada PPL', 'Popular Reddit PPL variant. 6 days/week with higher volume accessories. Compound-first with isolation finishers.', FALSE)
  RETURNING id INTO prog_id;
  INSERT INTO program_versions (program_id, version_number, change_description)
  VALUES (prog_id, 1, 'Global template') RETURNING id INTO ver_id;

  -- Push A
  INSERT INTO program_days (version_id, day_label, weekdays, sort_order)
  VALUES (ver_id, 'Push A', '{1}', 0) RETURNING id INTO day_id;
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'bench press' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 4, 5, 180, 0);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'overhead press' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 3, 8, 90, 1);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'incline bench press' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 3, 10, 90, 2);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'dumbbell lateral raise' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 3, 15, 60, 3);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'tricep pushdown' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 3, 12, 60, 4);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'overhead tricep extension' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 3, 12, 60, 5);

  -- Pull A
  INSERT INTO program_days (version_id, day_label, weekdays, sort_order)
  VALUES (ver_id, 'Pull A', '{2}', 1) RETURNING id INTO day_id;
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'barbell row' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 4, 5, 120, 0);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'pull-up' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 3, 8, 90, 1);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'seated cable row' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 3, 10, 60, 2);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'face pull' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 3, 15, 60, 3);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'barbell curl' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 3, 10, 60, 4);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'hammer curl' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 3, 12, 60, 5);

  -- Legs A
  INSERT INTO program_days (version_id, day_label, weekdays, sort_order)
  VALUES (ver_id, 'Legs A', '{3}', 2) RETURNING id INTO day_id;
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'squat' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 4, 5, 180, 0);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'romanian deadlift' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 3, 10, 90, 1);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'leg press' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 3, 12, 90, 2);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'leg curl' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 3, 12, 60, 3);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'calf raise' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 4, 15, 60, 4);

  -- Push B
  INSERT INTO program_days (version_id, day_label, weekdays, sort_order)
  VALUES (ver_id, 'Push B', '{4}', 3) RETURNING id INTO day_id;
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'overhead press' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 4, 5, 120, 0);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'dumbbell bench press' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 3, 10, 90, 1);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'cable fly' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 3, 12, 60, 2);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'dumbbell lateral raise' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 4, 15, 60, 3);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'dip' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 3, 10, 60, 4);

  -- Pull B
  INSERT INTO program_days (version_id, day_label, weekdays, sort_order)
  VALUES (ver_id, 'Pull B', '{5}', 4) RETURNING id INTO day_id;
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'deadlift' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 3, 5, 180, 0);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'lat pulldown' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 3, 10, 60, 1);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'dumbbell row' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 3, 10, 60, 2);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'face pull' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 3, 15, 60, 3);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'preacher curl' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 3, 12, 60, 4);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'cable curl' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 3, 12, 60, 5);

  -- Legs B
  INSERT INTO program_days (version_id, day_label, weekdays, sort_order)
  VALUES (ver_id, 'Legs B', '{6}', 5) RETURNING id INTO day_id;
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'front squat' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 4, 8, 120, 0);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'sumo deadlift' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 3, 8, 120, 1);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'leg extension' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 3, 15, 60, 2);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'leg curl' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 3, 15, 60, 3);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'seated calf raise' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 4, 15, 60, 4);

  -- ============================
  -- 19. Reddit PPL (Metallicadpa) (6 days)
  -- ============================
  INSERT INTO programs (user_id, name, description, is_active)
  VALUES (NULL, 'Reddit PPL (Metallicadpa)', 'The famous r/Fitness PPL. 6 days/week, compound-first with progressive overload. The most recommended Reddit program.', FALSE)
  RETURNING id INTO prog_id;
  INSERT INTO program_versions (program_id, version_number, change_description)
  VALUES (prog_id, 1, 'Global template') RETURNING id INTO ver_id;

  -- Pull A
  INSERT INTO program_days (version_id, day_label, weekdays, sort_order)
  VALUES (ver_id, 'Pull A', '{1}', 0) RETURNING id INTO day_id;
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'deadlift' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 1, 5, 180, 0);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'barbell row' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 4, 5, 120, 1);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'lat pulldown' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 3, 12, 60, 2);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'face pull' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 5, 20, 60, 3);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'hammer curl' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 4, 12, 60, 4);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'barbell curl' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 4, 12, 60, 5);

  -- Push A
  INSERT INTO program_days (version_id, day_label, weekdays, sort_order)
  VALUES (ver_id, 'Push A', '{2}', 1) RETURNING id INTO day_id;
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'bench press' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 4, 5, 180, 0);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'overhead press' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 3, 12, 90, 1);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'incline bench press' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 3, 12, 60, 2);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'cable fly' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 3, 20, 60, 3);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'dumbbell lateral raise' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 3, 20, 60, 4);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'tricep pushdown' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 3, 12, 60, 5);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'overhead tricep extension' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 3, 12, 60, 6);

  -- Legs A
  INSERT INTO program_days (version_id, day_label, weekdays, sort_order)
  VALUES (ver_id, 'Legs A', '{3}', 2) RETURNING id INTO day_id;
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'squat' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 3, 5, 180, 0);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'romanian deadlift' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 3, 12, 90, 1);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'leg press' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 3, 12, 90, 2);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'leg curl' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 3, 12, 60, 3);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'calf raise' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 5, 20, 60, 4);

  -- Pull B
  INSERT INTO program_days (version_id, day_label, weekdays, sort_order)
  VALUES (ver_id, 'Pull B', '{4}', 3) RETURNING id INTO day_id;
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'barbell row' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 4, 5, 120, 0);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'chin-up' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 3, 12, 90, 1);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'seated cable row' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 3, 12, 60, 2);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'face pull' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 5, 20, 60, 3);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'incline dumbbell curl' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 4, 12, 60, 4);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'concentration curl' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 4, 12, 60, 5);

  -- Push B
  INSERT INTO program_days (version_id, day_label, weekdays, sort_order)
  VALUES (ver_id, 'Push B', '{5}', 4) RETURNING id INTO day_id;
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'overhead press' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 4, 5, 120, 0);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'bench press' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 3, 12, 90, 1);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'dumbbell bench press' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 3, 12, 60, 2);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'dumbbell lateral raise' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 3, 20, 60, 3);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'skull crusher' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 3, 12, 60, 4);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'dip' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 3, 12, 60, 5);

  -- Legs B
  INSERT INTO program_days (version_id, day_label, weekdays, sort_order)
  VALUES (ver_id, 'Legs B', '{6}', 5) RETURNING id INTO day_id;
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'squat' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 3, 12, 120, 0);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'sumo deadlift' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 3, 12, 120, 1);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'leg extension' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 3, 15, 60, 2);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'leg curl' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 3, 15, 60, 3);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'seated calf raise' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 5, 20, 60, 4);

  -- ============================
  -- 20. GZCL: The Rippler (4 days)
  -- ============================
  INSERT INTO programs (user_id, name, description, is_active)
  VALUES (NULL, 'GZCL: The Rippler', '12-week intermediate strength peaking program. 4 days with T1/T2/T3 tiers. Focused on building to heavy singles.', FALSE)
  RETURNING id INTO prog_id;
  INSERT INTO program_versions (program_id, version_number, change_description)
  VALUES (prog_id, 1, 'Global template') RETURNING id INTO ver_id;

  INSERT INTO program_days (version_id, day_label, weekdays, sort_order)
  VALUES (ver_id, 'T1 Squat', '{1}', 0) RETURNING id INTO day_id;
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'squat' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order, notes) VALUES (day_id, ex_id, 5, 3, 180, 0, 'T1');
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'front squat' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order, notes) VALUES (day_id, ex_id, 3, 8, 90, 1, 'T2');
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'leg extension' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order, notes) VALUES (day_id, ex_id, 3, 15, 60, 2, 'T3');
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'leg curl' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order, notes) VALUES (day_id, ex_id, 3, 15, 60, 3, 'T3');

  INSERT INTO program_days (version_id, day_label, weekdays, sort_order)
  VALUES (ver_id, 'T1 Bench', '{2}', 1) RETURNING id INTO day_id;
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'bench press' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order, notes) VALUES (day_id, ex_id, 5, 3, 180, 0, 'T1');
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'close-grip bench press' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order, notes) VALUES (day_id, ex_id, 3, 8, 90, 1, 'T2');
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'lat pulldown' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order, notes) VALUES (day_id, ex_id, 3, 15, 60, 2, 'T3');
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'dumbbell fly' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order, notes) VALUES (day_id, ex_id, 3, 15, 60, 3, 'T3');

  INSERT INTO program_days (version_id, day_label, weekdays, sort_order)
  VALUES (ver_id, 'T1 Deadlift', '{4}', 2) RETURNING id INTO day_id;
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'deadlift' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order, notes) VALUES (day_id, ex_id, 5, 3, 180, 0, 'T1');
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'romanian deadlift' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order, notes) VALUES (day_id, ex_id, 3, 8, 90, 1, 'T2');
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'barbell row' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order, notes) VALUES (day_id, ex_id, 3, 15, 60, 2, 'T3');
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'face pull' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order, notes) VALUES (day_id, ex_id, 3, 15, 60, 3, 'T3');

  INSERT INTO program_days (version_id, day_label, weekdays, sort_order)
  VALUES (ver_id, 'T1 OHP', '{5}', 3) RETURNING id INTO day_id;
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'overhead press' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order, notes) VALUES (day_id, ex_id, 5, 3, 180, 0, 'T1');
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'incline bench press' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order, notes) VALUES (day_id, ex_id, 3, 8, 90, 1, 'T2');
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'dumbbell lateral raise' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order, notes) VALUES (day_id, ex_id, 3, 15, 60, 2, 'T3');
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'chin-up' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order, notes) VALUES (day_id, ex_id, 3, 10, 60, 3, 'T3');

  -- ============================
  -- 21. Fierce 5 (3 days)
  -- ============================
  INSERT INTO programs (user_id, name, description, is_active)
  VALUES (NULL, 'Fierce 5', 'Beginner 3-day A/B program. More balanced upper body than Starting Strength/StrongLifts. Includes rows every session.', FALSE)
  RETURNING id INTO prog_id;
  INSERT INTO program_versions (program_id, version_number, change_description)
  VALUES (prog_id, 1, 'Global template') RETURNING id INTO ver_id;

  INSERT INTO program_days (version_id, day_label, weekdays, sort_order)
  VALUES (ver_id, 'Workout A', '{1,5}', 0) RETURNING id INTO day_id;
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'squat' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 3, 5, 180, 0);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'bench press' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 3, 5, 120, 1);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'barbell row' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 3, 8, 90, 2);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'face pull' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 3, 10, 60, 3);

  INSERT INTO program_days (version_id, day_label, weekdays, sort_order)
  VALUES (ver_id, 'Workout B', '{3}', 1) RETURNING id INTO day_id;
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'deadlift' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 3, 5, 180, 0);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'overhead press' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 3, 5, 120, 1);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'lat pulldown' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 3, 8, 60, 2);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'barbell curl' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 2, 10, 60, 3);

  -- ============================
  -- 22. PHUL Powerbuilding (4 days)
  -- ============================
  INSERT INTO programs (user_id, name, description, is_active)
  VALUES (NULL, 'PHUL Powerbuilding', 'Modified PHUL with dedicated deadlift work and more arm volume. 4 days: power upper/lower + hypertrophy upper/lower.', FALSE)
  RETURNING id INTO prog_id;
  INSERT INTO program_versions (program_id, version_number, change_description)
  VALUES (prog_id, 1, 'Global template') RETURNING id INTO ver_id;

  -- Upper Power
  INSERT INTO program_days (version_id, day_label, weekdays, sort_order)
  VALUES (ver_id, 'Upper Power', '{1}', 0) RETURNING id INTO day_id;
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'bench press' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 4, 5, 180, 0);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'barbell row' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 4, 5, 120, 1);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'overhead press' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 3, 8, 90, 2);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'pull-up' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 3, 8, 90, 3);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'barbell curl' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 3, 8, 60, 4);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'close-grip bench press' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 3, 8, 90, 5);

  -- Lower Power
  INSERT INTO program_days (version_id, day_label, weekdays, sort_order)
  VALUES (ver_id, 'Lower Power', '{2}', 1) RETURNING id INTO day_id;
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'squat' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 4, 5, 180, 0);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'deadlift' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 4, 5, 180, 1);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'leg press' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 3, 10, 90, 2);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'leg curl' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 3, 10, 60, 3);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'calf raise' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 4, 12, 60, 4);

  -- Upper Hypertrophy
  INSERT INTO program_days (version_id, day_label, weekdays, sort_order)
  VALUES (ver_id, 'Upper Hypertrophy', '{4}', 2) RETURNING id INTO day_id;
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'dumbbell bench press' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 4, 12, 60, 0);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'lat pulldown' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 4, 12, 60, 1);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'cable fly' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 3, 15, 60, 2);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'seated cable row' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 3, 12, 60, 3);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'incline dumbbell curl' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 3, 12, 60, 4);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'overhead tricep extension' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 3, 12, 60, 5);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'dumbbell lateral raise' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 3, 15, 60, 6);

  -- Lower Hypertrophy
  INSERT INTO program_days (version_id, day_label, weekdays, sort_order)
  VALUES (ver_id, 'Lower Hypertrophy', '{5}', 3) RETURNING id INTO day_id;
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'front squat' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 4, 10, 120, 0);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'romanian deadlift' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 4, 10, 90, 1);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'hip thrust' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 3, 12, 60, 2);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'leg extension' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 3, 15, 60, 3);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'leg curl' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 3, 15, 60, 4);
  SELECT id INTO ex_id FROM exercises WHERE LOWER(name) = 'seated calf raise' AND user_id IS NULL LIMIT 1;
  INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, rest_seconds, sort_order) VALUES (day_id, ex_id, 4, 15, 60, 5);

END $$;
