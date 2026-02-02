-- 017: Exercise sections — optional grouping layer between day and exercises
-- Sections are collapsible containers (e.g. "Warm-up", "Main work", "Finisher")

-- Program sections
CREATE TABLE IF NOT EXISTS program_sections (
  id SERIAL PRIMARY KEY,
  day_id INTEGER NOT NULL REFERENCES program_days(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  notes TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_program_sections_day ON program_sections(day_id);

-- Session sections
CREATE TABLE IF NOT EXISTS session_sections (
  id SERIAL PRIMARY KEY,
  session_id INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  notes TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_session_sections_session ON session_sections(session_id);

-- Template sections
CREATE TABLE IF NOT EXISTS template_sections (
  id SERIAL PRIMARY KEY,
  template_id INTEGER NOT NULL REFERENCES session_templates(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  notes TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_template_sections_template ON template_sections(template_id);

-- Add section_id FK to exercise tables
ALTER TABLE program_day_exercises
  ADD COLUMN IF NOT EXISTS section_id INTEGER REFERENCES program_sections(id) ON DELETE SET NULL;

ALTER TABLE session_exercises
  ADD COLUMN IF NOT EXISTS section_id INTEGER REFERENCES session_sections(id) ON DELETE SET NULL;

ALTER TABLE session_template_exercises
  ADD COLUMN IF NOT EXISTS section_id INTEGER REFERENCES template_sections(id) ON DELETE SET NULL;
