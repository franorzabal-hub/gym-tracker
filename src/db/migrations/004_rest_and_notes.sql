-- ============================================
-- Add rest_seconds to session_exercises
-- ============================================
ALTER TABLE session_exercises ADD COLUMN IF NOT EXISTS rest_seconds INTEGER;

-- ============================================
-- Add notes to individual sets
-- ============================================
ALTER TABLE sets ADD COLUMN IF NOT EXISTS notes TEXT;

-- ============================================
-- Session templates
-- ============================================
CREATE TABLE IF NOT EXISTS session_templates (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    source_session_id INTEGER REFERENCES sessions(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS session_template_exercises (
    id SERIAL PRIMARY KEY,
    template_id INTEGER NOT NULL REFERENCES session_templates(id) ON DELETE CASCADE,
    exercise_id INTEGER NOT NULL REFERENCES exercises(id),
    target_sets INTEGER,
    target_reps INTEGER,
    target_weight REAL,
    target_rpe REAL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    superset_group INTEGER,
    rest_seconds INTEGER,
    notes TEXT
);
