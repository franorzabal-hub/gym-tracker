-- Add missing indexes for section_id foreign keys
-- These prevent sequential scans on JOINs with sections

CREATE INDEX IF NOT EXISTS idx_pde_section_id ON program_day_exercises(section_id);
CREATE INDEX IF NOT EXISTS idx_se_section_id ON session_exercises(section_id);
