-- Seed exercises with aliases
INSERT INTO exercises (name, muscle_group, equipment) VALUES
  ('Bench Press', 'chest', 'barbell'),
  ('Incline Bench Press', 'chest', 'barbell'),
  ('Overhead Press', 'shoulders', 'barbell'),
  ('Dumbbell Lateral Raise', 'shoulders', 'dumbbell'),
  ('Tricep Pushdown', 'triceps', 'cable'),
  ('Cable Fly', 'chest', 'cable'),
  ('Barbell Row', 'back', 'barbell'),
  ('Pull-Up', 'back', 'bodyweight'),
  ('Face Pull', 'rear delts', 'cable'),
  ('Barbell Curl', 'biceps', 'barbell'),
  ('Hammer Curl', 'biceps', 'dumbbell'),
  ('Squat', 'quads', 'barbell'),
  ('Romanian Deadlift', 'hamstrings', 'barbell'),
  ('Leg Press', 'quads', 'machine'),
  ('Leg Curl', 'hamstrings', 'machine'),
  ('Calf Raise', 'calves', 'machine');

INSERT INTO exercise_aliases (exercise_id, alias) VALUES
  (1, 'press banca'), (1, 'press plano'), (1, 'bench'),
  (2, 'press inclinado'), (2, 'incline bench'),
  (3, 'press militar'), (3, 'ohp'), (3, 'press hombro'),
  (4, 'elevaciones laterales'), (4, 'lateral raise'), (4, 'laterales'),
  (5, 'tricep'), (5, 'pushdown'), (5, 'polea triceps'),
  (6, 'cruces en polea'), (6, 'cable crossover'), (6, 'aperturas polea'),
  (7, 'remo con barra'), (7, 'bent over row'), (7, 'remo'),
  (8, 'dominadas'), (8, 'pullup'), (8, 'pull up'),
  (9, 'face pull'), (9, 'tirón a la cara'),
  (10, 'curl con barra'), (10, 'curl barra'), (10, 'bicep curl'),
  (11, 'curl martillo'), (11, 'hammer'),
  (12, 'sentadilla'), (12, 'squat'), (12, 'sentadillas'),
  (13, 'peso muerto rumano'), (13, 'rdl'), (13, 'rumano'),
  (14, 'prensa'), (14, 'leg press'), (14, 'prensa de piernas'),
  (15, 'curl femoral'), (15, 'leg curl'), (15, 'femoral'),
  (16, 'gemelos'), (16, 'calf raise'), (16, 'pantorrillas');

-- Seed a PPL program
INSERT INTO programs (name, description, is_active) VALUES
  ('PPL', 'Push Pull Legs 3 day split', TRUE);

INSERT INTO program_versions (program_id, version_number, change_description) VALUES
  (1, 1, 'Initial version');

-- Push day (Mon)
INSERT INTO program_days (version_id, day_label, weekdays, sort_order) VALUES
  (1, 'Push', '{1}', 0);
INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, sort_order) VALUES
  (1, 1, 4, 8, 0),   -- Bench Press
  (1, 3, 3, 10, 1),   -- OHP
  (1, 2, 3, 10, 2),   -- Incline Bench
  (1, 4, 3, 15, 3),   -- Lateral Raise
  (1, 5, 3, 12, 4),   -- Tricep Pushdown
  (1, 6, 3, 15, 5);   -- Cable Fly

-- Pull day (Wed)
INSERT INTO program_days (version_id, day_label, weekdays, sort_order) VALUES
  (1, 'Pull', '{3}', 1);
INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, sort_order) VALUES
  (2, 7, 4, 8, 0),    -- Barbell Row
  (2, 8, 3, 10, 1),   -- Pull-Up
  (2, 9, 3, 15, 2),   -- Face Pull
  (2, 10, 3, 10, 3),  -- Barbell Curl
  (2, 11, 3, 12, 4);  -- Hammer Curl

-- Legs day (Fri)
INSERT INTO program_days (version_id, day_label, weekdays, sort_order) VALUES
  (1, 'Legs', '{5}', 2);
INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, sort_order) VALUES
  (3, 12, 4, 8, 0),   -- Squat
  (3, 13, 3, 10, 1),  -- RDL
  (3, 14, 3, 12, 2),  -- Leg Press
  (3, 15, 3, 12, 3),  -- Leg Curl
  (3, 16, 4, 15, 4);  -- Calf Raise
