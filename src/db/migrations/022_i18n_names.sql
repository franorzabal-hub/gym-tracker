-- Migration 022: Add JSONB columns for internationalized names
-- Supports multi-language display while keeping search via aliases unchanged.

-- ============================================================
-- PART 1: Add JSONB columns
-- ============================================================

ALTER TABLE exercises ADD COLUMN IF NOT EXISTS names JSONB;
ALTER TABLE programs ADD COLUMN IF NOT EXISTS names JSONB;
ALTER TABLE program_days ADD COLUMN IF NOT EXISTS labels JSONB;

-- ============================================================
-- PART 2: Populate exercises.names from current name + Spanish aliases
-- ============================================================

-- For global exercises (user_id IS NULL):
-- - English key = current name
-- - Spanish key = first Spanish alias (if exists)
UPDATE exercises e
SET names = jsonb_build_object(
  'en', e.name,
  'es', COALESCE(
    (SELECT a.alias FROM exercise_aliases a WHERE a.exercise_id = e.id LIMIT 1),
    e.name
  )
)
WHERE e.user_id IS NULL AND e.names IS NULL;

-- ============================================================
-- PART 3: Populate programs.names (most are brand names, keep as-is)
-- ============================================================

UPDATE programs p
SET names = jsonb_build_object('en', p.name, 'es', p.name)
WHERE p.user_id IS NULL AND p.names IS NULL;

-- ============================================================
-- PART 4: Populate program_days.labels with translations
-- ============================================================

-- Common patterns that can be translated
UPDATE program_days pd
SET labels = CASE
  -- Workout A/B pattern
  WHEN pd.day_label = 'Workout A' THEN '{"en": "Workout A", "es": "Rutina A"}'::jsonb
  WHEN pd.day_label = 'Workout B' THEN '{"en": "Workout B", "es": "Rutina B"}'::jsonb
  WHEN pd.day_label = 'Workout C' THEN '{"en": "Workout C", "es": "Rutina C"}'::jsonb

  -- Power/Hypertrophy patterns
  WHEN pd.day_label = 'Upper Power' THEN '{"en": "Upper Power", "es": "Tren Superior Fuerza"}'::jsonb
  WHEN pd.day_label = 'Lower Power' THEN '{"en": "Lower Power", "es": "Tren Inferior Fuerza"}'::jsonb
  WHEN pd.day_label = 'Upper Hypertrophy' THEN '{"en": "Upper Hypertrophy", "es": "Tren Superior Hipertrofia"}'::jsonb
  WHEN pd.day_label = 'Lower Hypertrophy' THEN '{"en": "Lower Hypertrophy", "es": "Tren Inferior Hipertrofia"}'::jsonb

  -- Upper/Lower patterns
  WHEN pd.day_label ILIKE 'Upper%' THEN jsonb_build_object('en', pd.day_label, 'es', REPLACE(REPLACE(pd.day_label, 'Upper', 'Tren Superior'), 'upper', 'Tren Superior'))
  WHEN pd.day_label ILIKE 'Lower%' THEN jsonb_build_object('en', pd.day_label, 'es', REPLACE(REPLACE(pd.day_label, 'Lower', 'Tren Inferior'), 'lower', 'Tren Inferior'))

  -- Push/Pull/Legs
  WHEN pd.day_label = 'Push' THEN '{"en": "Push", "es": "Empuje"}'::jsonb
  WHEN pd.day_label = 'Pull' THEN '{"en": "Pull", "es": "Tirón"}'::jsonb
  WHEN pd.day_label = 'Legs' THEN '{"en": "Legs", "es": "Piernas"}'::jsonb
  WHEN pd.day_label = 'Push Day' THEN '{"en": "Push Day", "es": "Día de Empuje"}'::jsonb
  WHEN pd.day_label = 'Pull Day' THEN '{"en": "Pull Day", "es": "Día de Tirón"}'::jsonb
  WHEN pd.day_label = 'Leg Day' THEN '{"en": "Leg Day", "es": "Día de Piernas"}'::jsonb

  -- Full Body
  WHEN pd.day_label ILIKE 'Full Body%' THEN jsonb_build_object('en', pd.day_label, 'es', REPLACE(pd.day_label, 'Full Body', 'Cuerpo Completo'))

  -- Day 1, Day 2, etc.
  WHEN pd.day_label ~ '^Day [0-9]+$' THEN jsonb_build_object('en', pd.day_label, 'es', REPLACE(pd.day_label, 'Day', 'Día'))

  -- Rest Day
  WHEN pd.day_label ILIKE '%Rest%' THEN jsonb_build_object('en', pd.day_label, 'es', REPLACE(pd.day_label, 'Rest', 'Descanso'))

  -- Default: keep original for both (includes exercise-specific names like "Squat + Bench")
  ELSE jsonb_build_object('en', pd.day_label, 'es', pd.day_label)
END
WHERE pd.labels IS NULL;

-- ============================================================
-- PART 5: Create indexes for JSONB queries
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_exercises_names ON exercises USING GIN (names);
CREATE INDEX IF NOT EXISTS idx_programs_names ON programs USING GIN (names);
CREATE INDEX IF NOT EXISTS idx_program_days_labels ON program_days USING GIN (labels);
