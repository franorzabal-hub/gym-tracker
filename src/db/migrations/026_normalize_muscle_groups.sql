-- Migration 026: Normalize muscle groups and remove duplicate exercises
-- Idempotent: safe to re-run

-- ============================================================
-- PART 1: Merge 'quads' into 'quadriceps'
-- Exercises affected: Squat, Leg Press (from 002_seed.sql)
-- ============================================================

UPDATE exercises
SET muscle_group = 'quadriceps'
WHERE muscle_group = 'quads';

-- ============================================================
-- PART 2: Merge 'abs' into 'core'
-- Exercise affected: Cable Crunch (from 015_seed_global_programs.sql)
-- ============================================================

UPDATE exercises
SET muscle_group = 'core'
WHERE muscle_group = 'abs';

-- ============================================================
-- PART 3: Remove duplicate 'Dips' (keep 'Dip')
-- 'Dip' is the canonical name from 015_seed_global_programs.sql
-- 'Dips' may have been auto-created during sessions
-- ============================================================

DO $$
DECLARE
  dip_id INTEGER;
  dips_id INTEGER;
  dip_refs INTEGER;
  dips_refs INTEGER;
  keep_id INTEGER;
  delete_id INTEGER;
BEGIN
  -- Find both exercises (global only, user_id IS NULL)
  SELECT id INTO dip_id FROM exercises WHERE LOWER(name) = 'dip' AND user_id IS NULL;
  SELECT id INTO dips_id FROM exercises WHERE LOWER(name) = 'dips' AND user_id IS NULL;

  -- Only proceed if both exist
  IF dip_id IS NOT NULL AND dips_id IS NOT NULL THEN
    -- Count references for 'Dip'
    SELECT COUNT(*) INTO dip_refs FROM (
      SELECT 1 FROM program_day_exercises WHERE exercise_id = dip_id
      UNION ALL
      SELECT 1 FROM session_exercises WHERE exercise_id = dip_id
      UNION ALL
      SELECT 1 FROM personal_records WHERE exercise_id = dip_id
    ) refs;

    -- Count references for 'Dips'
    SELECT COUNT(*) INTO dips_refs FROM (
      SELECT 1 FROM program_day_exercises WHERE exercise_id = dips_id
      UNION ALL
      SELECT 1 FROM session_exercises WHERE exercise_id = dips_id
      UNION ALL
      SELECT 1 FROM personal_records WHERE exercise_id = dips_id
    ) refs;

    RAISE NOTICE 'Dip (id=%) has % refs, Dips (id=%) has % refs', dip_id, dip_refs, dips_id, dips_refs;

    -- Keep the one with more references, default to 'Dip' if equal
    IF dips_refs > dip_refs THEN
      keep_id := dips_id;
      delete_id := dip_id;
      RAISE NOTICE 'Keeping Dips (more refs), deleting Dip';
    ELSE
      keep_id := dip_id;
      delete_id := dips_id;
      RAISE NOTICE 'Keeping Dip, deleting Dips';
    END IF;

    -- Update all references to point to the kept exercise
    UPDATE program_day_exercises SET exercise_id = keep_id WHERE exercise_id = delete_id;
    UPDATE session_exercises SET exercise_id = keep_id WHERE exercise_id = delete_id;
    UPDATE personal_records SET exercise_id = keep_id WHERE exercise_id = delete_id;

    -- Merge aliases (move aliases from deleted to kept, ignore conflicts)
    UPDATE exercise_aliases SET exercise_id = keep_id WHERE exercise_id = delete_id
      AND alias NOT IN (SELECT alias FROM exercise_aliases WHERE exercise_id = keep_id);

    -- Delete orphaned aliases that would conflict
    DELETE FROM exercise_aliases WHERE exercise_id = delete_id;

    -- Delete the duplicate exercise
    DELETE FROM exercises WHERE id = delete_id;

    RAISE NOTICE 'Merged exercise % into % and deleted duplicate', delete_id, keep_id;
  ELSE
    RAISE NOTICE 'No duplicate Dip/Dips found (Dip id=%, Dips id=%)', dip_id, dips_id;
  END IF;
END $$;

-- ============================================================
-- PART 4: Categorize 'unknown' exercises (mobility/warmup)
-- These are user-created exercises that need proper categorization
-- ============================================================

-- Disociación de hombros → shoulders (mobility exercise)
UPDATE exercises
SET muscle_group = 'shoulders', exercise_type = 'mobility'
WHERE LOWER(name) = 'disociación de hombros' AND muscle_group = 'unknown';

-- Movilidad con bastón → full body mobility
UPDATE exercises
SET muscle_group = 'full body', exercise_type = 'mobility'
WHERE LOWER(name) = 'movilidad con bastón' AND muscle_group = 'unknown';

-- Movilidad de gluteos → glutes (mobility)
UPDATE exercises
SET muscle_group = 'glutes', exercise_type = 'mobility'
WHERE LOWER(name) = 'movilidad de gluteos' AND muscle_group = 'unknown';

-- Movilidad tibio tarsiana → calves (ankle mobility)
UPDATE exercises
SET muscle_group = 'calves', exercise_type = 'mobility'
WHERE LOWER(name) = 'movilidad tibio tarsiana' AND muscle_group = 'unknown';

-- Push hombros → shoulders (this is a push variation)
UPDATE exercises
SET muscle_group = 'shoulders'
WHERE LOWER(name) = 'push hombros' AND muscle_group = 'unknown';

-- Push pecho → chest (this is a push variation)
UPDATE exercises
SET muscle_group = 'chest'
WHERE LOWER(name) = 'push pecho' AND muscle_group = 'unknown';

-- ============================================================
-- PART 5: Handle 'Remo al mentón' duplicate of 'Remo al Menton'
-- These are case-variant duplicates (upright row)
-- ============================================================

DO $$
DECLARE
  remo1_id INTEGER;
  remo2_id INTEGER;
  remo1_refs INTEGER;
  remo2_refs INTEGER;
  keep_id INTEGER;
  delete_id INTEGER;
BEGIN
  -- Find both variants (case-insensitive match, but exact case in name)
  SELECT id INTO remo1_id FROM exercises WHERE name = 'Remo al Menton' AND user_id IS NULL;
  SELECT id INTO remo2_id FROM exercises WHERE name = 'Remo al mentón' AND user_id IS NULL;

  -- Also check for user-owned duplicates with same name pattern
  IF remo1_id IS NULL THEN
    SELECT id INTO remo1_id FROM exercises WHERE name = 'Remo al Menton' LIMIT 1;
  END IF;
  IF remo2_id IS NULL THEN
    SELECT id INTO remo2_id FROM exercises WHERE name = 'Remo al mentón' LIMIT 1;
  END IF;

  -- Only proceed if both exist
  IF remo1_id IS NOT NULL AND remo2_id IS NOT NULL AND remo1_id != remo2_id THEN
    -- Count references for first variant
    SELECT COUNT(*) INTO remo1_refs FROM (
      SELECT 1 FROM program_day_exercises WHERE exercise_id = remo1_id
      UNION ALL
      SELECT 1 FROM session_exercises WHERE exercise_id = remo1_id
      UNION ALL
      SELECT 1 FROM personal_records WHERE exercise_id = remo1_id
    ) refs;

    -- Count references for second variant
    SELECT COUNT(*) INTO remo2_refs FROM (
      SELECT 1 FROM program_day_exercises WHERE exercise_id = remo2_id
      UNION ALL
      SELECT 1 FROM session_exercises WHERE exercise_id = remo2_id
      UNION ALL
      SELECT 1 FROM personal_records WHERE exercise_id = remo2_id
    ) refs;

    RAISE NOTICE 'Remo al Menton (id=%) has % refs, Remo al mentón (id=%) has % refs', remo1_id, remo1_refs, remo2_id, remo2_refs;

    -- Keep the one with more references, default to proper casing (mentón) if equal
    IF remo1_refs > remo2_refs THEN
      keep_id := remo1_id;
      delete_id := remo2_id;
    ELSE
      keep_id := remo2_id;
      delete_id := remo1_id;
    END IF;

    -- Update all references to point to the kept exercise
    UPDATE program_day_exercises SET exercise_id = keep_id WHERE exercise_id = delete_id;
    UPDATE session_exercises SET exercise_id = keep_id WHERE exercise_id = delete_id;
    UPDATE personal_records SET exercise_id = keep_id WHERE exercise_id = delete_id;

    -- Merge aliases
    UPDATE exercise_aliases SET exercise_id = keep_id WHERE exercise_id = delete_id
      AND alias NOT IN (SELECT alias FROM exercise_aliases WHERE exercise_id = keep_id);
    DELETE FROM exercise_aliases WHERE exercise_id = delete_id;

    -- Delete the duplicate exercise
    DELETE FROM exercises WHERE id = delete_id;

    -- Update the kept exercise to have proper muscle_group (shoulders = upright row)
    UPDATE exercises SET muscle_group = 'shoulders' WHERE id = keep_id;

    RAISE NOTICE 'Merged Remo al mentón variants, kept id=%, deleted id=%', keep_id, delete_id;
  ELSIF remo1_id IS NOT NULL OR remo2_id IS NOT NULL THEN
    -- Only one exists, just update its muscle_group
    UPDATE exercises SET muscle_group = 'shoulders'
    WHERE id = COALESCE(remo1_id, remo2_id) AND (muscle_group IS NULL OR muscle_group = 'unknown');
    RAISE NOTICE 'Updated muscle_group for Remo al mentón (id=%)', COALESCE(remo1_id, remo2_id);
  END IF;
END $$;
