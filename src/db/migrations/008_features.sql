-- Feature 4: PR History
CREATE TABLE pr_history (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    exercise_id INTEGER NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
    record_type TEXT NOT NULL,
    value REAL NOT NULL,
    achieved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    set_id INTEGER REFERENCES sets(id) ON DELETE SET NULL
);
CREATE INDEX idx_pr_history_user_exercise ON pr_history(user_id, exercise_id, record_type);
CREATE INDEX idx_pr_history_achieved ON pr_history(achieved_at);

-- Feature 8: Soft delete
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- Feature 10: Tags
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}';
CREATE INDEX idx_sessions_tags ON sessions USING GIN(tags);
