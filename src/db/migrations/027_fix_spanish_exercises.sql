-- Migration 026: Fix Spanish exercises with missing translations and categorization
--
-- Exercises to fix:
-- 1. Disociación de hombros → Shoulder Dislocates (mobility)
-- 2. Movilidad con bastón → Dowel/Stick Mobility (mobility)
-- 3. Movilidad de gluteos → Glute Mobility (mobility)
-- 4. Movilidad tibio tarsiana → Ankle Mobility (mobility)
-- 5. Push hombros → Shoulder Push (warmup)
-- 6. Push pecho → Chest Push (warmup)
-- 7. Remo al mentón → merge into Remo al Menton (Upright Row)

-- ============================================================
-- PART 1: Update mobility exercises with proper translations and metadata
-- ============================================================

-- Shoulder Dislocates - mobility exercise for shoulder flexibility
UPDATE exercises
SET
  names = '{"en": "Shoulder Dislocates", "es": "Disociación de hombros"}'::jsonb,
  muscle_group = 'shoulders',
  equipment = 'bands',
  exercise_type = 'mobility'
WHERE id = 35 AND name = 'Disociación de hombros';

-- Dowel/Stick Mobility - full body mobility with a stick/dowel
UPDATE exercises
SET
  names = '{"en": "Stick Mobility", "es": "Movilidad con bastón"}'::jsonb,
  muscle_group = 'full_body',
  equipment = 'other',
  exercise_type = 'mobility'
WHERE id = 33 AND name = 'Movilidad con bastón';

-- Glute Mobility - glute-focused mobility work
UPDATE exercises
SET
  names = '{"en": "Glute Mobility", "es": "Movilidad de glúteos"}'::jsonb,
  muscle_group = 'glutes',
  equipment = 'bodyweight',
  exercise_type = 'mobility'
WHERE id = 38 AND name = 'Movilidad de gluteos';

-- Ankle Mobility - tibiotarsal (ankle) mobility drills
UPDATE exercises
SET
  names = '{"en": "Ankle Mobility", "es": "Movilidad tibio tarsiana"}'::jsonb,
  muscle_group = 'calves',
  equipment = 'bodyweight',
  exercise_type = 'mobility'
WHERE id = 36 AND name = 'Movilidad tibio tarsiana';

-- ============================================================
-- PART 2: Update warmup exercises with proper translations and metadata
-- ============================================================

-- Shoulder Push - warmup push movement for shoulders
UPDATE exercises
SET
  names = '{"en": "Shoulder Push", "es": "Push hombros"}'::jsonb,
  muscle_group = 'shoulders',
  equipment = 'bodyweight',
  exercise_type = 'warmup'
WHERE id = 37 AND name = 'Push hombros';

-- Chest Push - warmup push movement for chest
UPDATE exercises
SET
  names = '{"en": "Chest Push", "es": "Push pecho"}'::jsonb,
  muscle_group = 'chest',
  equipment = 'bodyweight',
  exercise_type = 'warmup'
WHERE id = 34 AND name = 'Push pecho';

-- ============================================================
-- PART 3: Merge duplicate "Remo al mentón" (id 39) into "Remo al Menton" (id 31)
-- ============================================================

-- First, fix the names on id 31 (currently has en/es swapped)
UPDATE exercises
SET
  names = '{"en": "Upright Row", "es": "Remo al mentón"}'::jsonb
WHERE id = 31 AND name = 'Remo al Menton';

-- Move all program_day_exercises references from id 39 to id 31
UPDATE program_day_exercises
SET exercise_id = 31
WHERE exercise_id = 39;

-- Move all session_exercises references from id 39 to id 31 (if any)
UPDATE session_exercises
SET exercise_id = 31
WHERE exercise_id = 39;

-- Move any personal_records from id 39 to id 31 (if any)
-- Note: There might be conflicts if both have PR records, so we use ON CONFLICT DO NOTHING
-- and just delete the duplicate afterwards
UPDATE personal_records
SET exercise_id = 31
WHERE exercise_id = 39
  AND NOT EXISTS (
    SELECT 1 FROM personal_records pr2
    WHERE pr2.exercise_id = 31 AND pr2.record_type = personal_records.record_type
  );

-- Delete any remaining personal_records for id 39 (duplicates)
DELETE FROM personal_records WHERE exercise_id = 39;

-- Move any pr_history from id 39 to id 31
UPDATE pr_history
SET exercise_id = 31
WHERE exercise_id = 39;

-- Delete the duplicate exercise (id 39)
DELETE FROM exercises WHERE id = 39;

-- Add "Remo al Menton" (with capital M) as an alias for easier search
INSERT INTO exercise_aliases (exercise_id, alias)
VALUES (31, 'Remo al Menton')
ON CONFLICT (alias) DO NOTHING;
