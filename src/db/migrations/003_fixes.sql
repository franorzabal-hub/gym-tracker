-- ============================================
-- Add Deadlift as separate exercise from RDL
-- ============================================
INSERT INTO exercises (name, muscle_group, equipment)
VALUES ('Deadlift', 'back', 'barbell')
ON CONFLICT (name) DO NOTHING;

-- Fix aliases: remove any existing conflicting aliases first
DELETE FROM exercise_aliases WHERE alias IN ('peso muerto', 'deadlift', 'peso muerto convencional', 'peso muerto rumano');

-- Re-insert with correct mappings
INSERT INTO exercise_aliases (exercise_id, alias) VALUES
  ((SELECT id FROM exercises WHERE name = 'Deadlift'), 'peso muerto'),
  ((SELECT id FROM exercises WHERE name = 'Deadlift'), 'deadlift'),
  ((SELECT id FROM exercises WHERE name = 'Deadlift'), 'peso muerto convencional'),
  ((SELECT id FROM exercises WHERE name = 'Romanian Deadlift'), 'peso muerto rumano')
ON CONFLICT (alias) DO UPDATE SET exercise_id = EXCLUDED.exercise_id;

-- ============================================
-- Normalize muscle groups
-- ============================================
UPDATE exercises SET muscle_group = 'shoulders' WHERE muscle_group = 'rear delts';

-- ============================================
-- Add rest_seconds to program_day_exercises
-- ============================================
ALTER TABLE program_day_exercises ADD COLUMN IF NOT EXISTS rest_seconds INTEGER;
