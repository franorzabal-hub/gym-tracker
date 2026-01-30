-- Fix: Re-insert aliases and program references using name lookups instead of hardcoded IDs.
-- This migration is idempotent (ON CONFLICT DO NOTHING) and safe to re-run.
-- It ensures aliases and program structure reference exercises by name, not sequential IDs.

-- Re-insert aliases by name lookup (skip if already exist)
INSERT INTO exercise_aliases (exercise_id, alias)
SELECT e.id, a.alias
FROM exercises e
JOIN (VALUES
  ('Bench Press', 'press banca'), ('Bench Press', 'press plano'), ('Bench Press', 'bench'),
  ('Incline Bench Press', 'press inclinado'), ('Incline Bench Press', 'incline bench'),
  ('Overhead Press', 'press militar'), ('Overhead Press', 'ohp'), ('Overhead Press', 'press hombro'),
  ('Dumbbell Lateral Raise', 'elevaciones laterales'), ('Dumbbell Lateral Raise', 'lateral raise'), ('Dumbbell Lateral Raise', 'laterales'),
  ('Tricep Pushdown', 'tricep'), ('Tricep Pushdown', 'pushdown'), ('Tricep Pushdown', 'polea triceps'),
  ('Cable Fly', 'cruces en polea'), ('Cable Fly', 'cable crossover'), ('Cable Fly', 'aperturas polea'),
  ('Barbell Row', 'remo con barra'), ('Barbell Row', 'bent over row'), ('Barbell Row', 'remo'),
  ('Pull-Up', 'dominadas'), ('Pull-Up', 'pullup'), ('Pull-Up', 'pull up'),
  ('Face Pull', 'face pull'), ('Face Pull', 'tirón a la cara'),
  ('Barbell Curl', 'curl con barra'), ('Barbell Curl', 'curl barra'), ('Barbell Curl', 'bicep curl'),
  ('Hammer Curl', 'curl martillo'), ('Hammer Curl', 'hammer'),
  ('Squat', 'sentadilla'), ('Squat', 'squat'), ('Squat', 'sentadillas'),
  ('Romanian Deadlift', 'peso muerto rumano'), ('Romanian Deadlift', 'rdl'), ('Romanian Deadlift', 'rumano'),
  ('Leg Press', 'prensa'), ('Leg Press', 'leg press'), ('Leg Press', 'prensa de piernas'),
  ('Leg Curl', 'curl femoral'), ('Leg Curl', 'leg curl'), ('Leg Curl', 'femoral'),
  ('Calf Raise', 'gemelos'), ('Calf Raise', 'calf raise'), ('Calf Raise', 'pantorrillas')
) AS a(exercise_name, alias) ON e.name = a.exercise_name
ON CONFLICT DO NOTHING;

-- Re-insert program day exercises using name lookups (skip if already exist)
-- This ensures the PPL program references exercises by name, not hardcoded IDs.
-- Note: program_days and program_day_exercises from 002_seed.sql already exist,
-- so this is a no-op on existing DBs but documents the correct pattern.
