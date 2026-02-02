-- Migration 016: Exercise groups as proper entities
-- Replaces superset_group integer + group_type string with dedicated group tables.
-- Each context (program, session, template) gets its own group table for referential integrity.

-- 1. Create group tables

CREATE TABLE IF NOT EXISTS program_exercise_groups (
  id SERIAL PRIMARY KEY,
  day_id INTEGER NOT NULL REFERENCES program_days(id) ON DELETE CASCADE,
  group_type TEXT NOT NULL CHECK (group_type IN ('superset', 'paired', 'circuit')),
  label TEXT,
  notes TEXT,
  rest_seconds INTEGER,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS session_exercise_groups (
  id SERIAL PRIMARY KEY,
  session_id INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  group_type TEXT NOT NULL CHECK (group_type IN ('superset', 'paired', 'circuit')),
  label TEXT,
  notes TEXT,
  rest_seconds INTEGER,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS template_exercise_groups (
  id SERIAL PRIMARY KEY,
  template_id INTEGER NOT NULL REFERENCES session_templates(id) ON DELETE CASCADE,
  group_type TEXT NOT NULL CHECK (group_type IN ('superset', 'paired', 'circuit')),
  label TEXT,
  notes TEXT,
  rest_seconds INTEGER,
  sort_order INTEGER NOT NULL DEFAULT 0
);

-- 2. Add group_id FK to exercise tables

ALTER TABLE program_day_exercises
  ADD COLUMN IF NOT EXISTS group_id INTEGER REFERENCES program_exercise_groups(id) ON DELETE SET NULL;

ALTER TABLE session_exercises
  ADD COLUMN IF NOT EXISTS group_id INTEGER REFERENCES session_exercise_groups(id) ON DELETE SET NULL;

ALTER TABLE session_template_exercises
  ADD COLUMN IF NOT EXISTS group_id INTEGER REFERENCES template_exercise_groups(id) ON DELETE SET NULL;

-- 3. Backfill program_exercise_groups from existing superset_group + group_type

DO $$
DECLARE
  rec RECORD;
  new_group_id INTEGER;
  rest_val INTEGER;
BEGIN
  FOR rec IN
    SELECT DISTINCT pde.day_id, pde.superset_group,
      COALESCE(pde.group_type, 'superset') AS group_type,
      MIN(pde.sort_order) AS min_sort
    FROM program_day_exercises pde
    WHERE pde.superset_group IS NOT NULL
    GROUP BY pde.day_id, pde.superset_group, COALESCE(pde.group_type, 'superset')
    ORDER BY pde.day_id, MIN(pde.sort_order)
  LOOP
    -- Use rest_seconds from the last exercise in the group (by sort_order)
    SELECT pde.rest_seconds INTO rest_val
    FROM program_day_exercises pde
    WHERE pde.day_id = rec.day_id AND pde.superset_group = rec.superset_group
    ORDER BY pde.sort_order DESC LIMIT 1;

    INSERT INTO program_exercise_groups (day_id, group_type, rest_seconds, sort_order)
    VALUES (rec.day_id, rec.group_type, rest_val, rec.min_sort)
    RETURNING id INTO new_group_id;

    UPDATE program_day_exercises
    SET group_id = new_group_id, rest_seconds = NULL
    WHERE day_id = rec.day_id AND superset_group = rec.superset_group;
  END LOOP;
END $$;

-- 4. Backfill session_exercise_groups

DO $$
DECLARE
  rec RECORD;
  new_group_id INTEGER;
  rest_val INTEGER;
BEGIN
  FOR rec IN
    SELECT DISTINCT se.session_id, se.superset_group,
      MIN(se.sort_order) AS min_sort
    FROM session_exercises se
    WHERE se.superset_group IS NOT NULL
    GROUP BY se.session_id, se.superset_group
    ORDER BY se.session_id, MIN(se.sort_order)
  LOOP
    SELECT se.rest_seconds INTO rest_val
    FROM session_exercises se
    WHERE se.session_id = rec.session_id AND se.superset_group = rec.superset_group
    ORDER BY se.sort_order DESC LIMIT 1;

    INSERT INTO session_exercise_groups (session_id, group_type, rest_seconds, sort_order)
    VALUES (rec.session_id, 'superset', rest_val, rec.min_sort)
    RETURNING id INTO new_group_id;

    UPDATE session_exercises
    SET group_id = new_group_id, rest_seconds = NULL
    WHERE session_id = rec.session_id AND superset_group = rec.superset_group;
  END LOOP;
END $$;

-- 5. Backfill template_exercise_groups

DO $$
DECLARE
  rec RECORD;
  new_group_id INTEGER;
  rest_val INTEGER;
BEGIN
  FOR rec IN
    SELECT DISTINCT ste.template_id, ste.superset_group,
      MIN(ste.sort_order) AS min_sort
    FROM session_template_exercises ste
    WHERE ste.superset_group IS NOT NULL
    GROUP BY ste.template_id, ste.superset_group
    ORDER BY ste.template_id, MIN(ste.sort_order)
  LOOP
    SELECT ste.rest_seconds INTO rest_val
    FROM session_template_exercises ste
    WHERE ste.template_id = rec.template_id AND ste.superset_group = rec.superset_group
    ORDER BY ste.sort_order DESC LIMIT 1;

    INSERT INTO template_exercise_groups (template_id, group_type, rest_seconds, sort_order)
    VALUES (rec.template_id, 'superset', rest_val, rec.min_sort)
    RETURNING id INTO new_group_id;

    UPDATE session_template_exercises
    SET group_id = new_group_id, rest_seconds = NULL
    WHERE template_id = rec.template_id AND superset_group = rec.superset_group;
  END LOOP;
END $$;

-- 6. Drop old columns

ALTER TABLE program_day_exercises DROP COLUMN IF EXISTS superset_group;
ALTER TABLE program_day_exercises DROP COLUMN IF EXISTS group_type;
ALTER TABLE session_exercises DROP COLUMN IF EXISTS superset_group;
ALTER TABLE session_template_exercises DROP COLUMN IF EXISTS superset_group;

-- 7. Create indexes

CREATE INDEX IF NOT EXISTS idx_peg_day_id ON program_exercise_groups(day_id);
CREATE INDEX IF NOT EXISTS idx_seg_session_id ON session_exercise_groups(session_id);
CREATE INDEX IF NOT EXISTS idx_teg_template_id ON template_exercise_groups(template_id);
CREATE INDEX IF NOT EXISTS idx_pde_group_id ON program_day_exercises(group_id);
CREATE INDEX IF NOT EXISTS idx_se_group_id ON session_exercises(group_id);
CREATE INDEX IF NOT EXISTS idx_ste_group_id ON session_template_exercises(group_id);
