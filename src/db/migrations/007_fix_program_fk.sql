-- Fix: allow hard-deleting programs that have associated sessions
-- Set program_version_id and program_day_id to NULL instead of blocking delete
ALTER TABLE sessions
  DROP CONSTRAINT IF EXISTS sessions_program_version_id_fkey,
  ADD CONSTRAINT sessions_program_version_id_fkey
    FOREIGN KEY (program_version_id) REFERENCES program_versions(id) ON DELETE SET NULL;

ALTER TABLE sessions
  DROP CONSTRAINT IF EXISTS sessions_program_day_id_fkey,
  ADD CONSTRAINT sessions_program_day_id_fkey
    FOREIGN KEY (program_day_id) REFERENCES program_days(id) ON DELETE SET NULL;
