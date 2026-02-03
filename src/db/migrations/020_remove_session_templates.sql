-- 020: Remove session_templates (replaced by global programs with user_id = NULL)
-- Session templates functionality is now covered by cloning global program templates.

-- Drop tables in dependency order (CASCADE handles FKs)
DROP TABLE IF EXISTS session_template_exercises CASCADE;
DROP TABLE IF EXISTS template_exercise_groups CASCADE;
DROP TABLE IF EXISTS template_sections CASCADE;
DROP TABLE IF EXISTS session_templates CASCADE;

-- Clean up any orphan indexes
DROP INDEX IF EXISTS idx_session_templates_user;
DROP INDEX IF EXISTS idx_session_templates_user_name;
DROP INDEX IF EXISTS idx_teg_template_id;
DROP INDEX IF EXISTS idx_ste_group_id;
DROP INDEX IF EXISTS idx_template_sections_template;
