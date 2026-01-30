-- User Profile
CREATE TABLE user_profile (
    id SERIAL PRIMARY KEY,
    data JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO user_profile (data) VALUES ('{}');

-- Exercises
CREATE TABLE exercises (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    muscle_group TEXT,
    equipment TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE exercise_aliases (
    id SERIAL PRIMARY KEY,
    exercise_id INTEGER NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
    alias TEXT NOT NULL UNIQUE
);

-- Programs
CREATE TABLE programs (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE program_versions (
    id SERIAL PRIMARY KEY,
    program_id INTEGER NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
    version_number INTEGER NOT NULL DEFAULT 1,
    change_description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(program_id, version_number)
);

CREATE TABLE program_days (
    id SERIAL PRIMARY KEY,
    version_id INTEGER NOT NULL REFERENCES program_versions(id) ON DELETE CASCADE,
    day_label TEXT NOT NULL,
    weekdays INTEGER[],
    sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE program_day_exercises (
    id SERIAL PRIMARY KEY,
    day_id INTEGER NOT NULL REFERENCES program_days(id) ON DELETE CASCADE,
    exercise_id INTEGER NOT NULL REFERENCES exercises(id),
    target_sets INTEGER NOT NULL DEFAULT 3,
    target_reps INTEGER NOT NULL DEFAULT 10,
    target_weight REAL,
    target_rpe REAL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    superset_group INTEGER,
    notes TEXT
);

-- Sessions
CREATE TABLE sessions (
    id SERIAL PRIMARY KEY,
    started_at TIMESTAMPTZ DEFAULT NOW(),
    ended_at TIMESTAMPTZ,
    program_version_id INTEGER REFERENCES program_versions(id),
    program_day_id INTEGER REFERENCES program_days(id),
    notes TEXT
);

CREATE TABLE session_exercises (
    id SERIAL PRIMARY KEY,
    session_id INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    exercise_id INTEGER NOT NULL REFERENCES exercises(id),
    sort_order INTEGER NOT NULL DEFAULT 0,
    superset_group INTEGER,
    notes TEXT
);

CREATE TABLE sets (
    id SERIAL PRIMARY KEY,
    session_exercise_id INTEGER NOT NULL REFERENCES session_exercises(id) ON DELETE CASCADE,
    set_number INTEGER NOT NULL,
    set_type TEXT DEFAULT 'working',
    reps INTEGER NOT NULL,
    weight REAL,
    rpe REAL,
    completed BOOLEAN DEFAULT TRUE,
    logged_at TIMESTAMPTZ DEFAULT NOW()
);

-- Personal Records
CREATE TABLE personal_records (
    id SERIAL PRIMARY KEY,
    exercise_id INTEGER NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
    record_type TEXT NOT NULL,
    value REAL NOT NULL,
    achieved_at TIMESTAMPTZ NOT NULL,
    set_id INTEGER REFERENCES sets(id) ON DELETE SET NULL
);

-- Indexes
CREATE INDEX idx_aliases_alias ON exercise_aliases(alias);
CREATE INDEX idx_aliases_exercise ON exercise_aliases(exercise_id);
CREATE INDEX idx_program_versions_program ON program_versions(program_id);
CREATE INDEX idx_program_days_version ON program_days(version_id);
CREATE INDEX idx_program_day_exercises_day ON program_day_exercises(day_id);
CREATE INDEX idx_sessions_started ON sessions(started_at);
CREATE INDEX idx_sessions_program_day ON sessions(program_day_id);
CREATE INDEX idx_session_exercises_session ON session_exercises(session_id);
CREATE INDEX idx_session_exercises_exercise ON session_exercises(exercise_id);
CREATE INDEX idx_sets_session_exercise ON sets(session_exercise_id);
CREATE INDEX idx_sets_logged ON sets(logged_at);
CREATE UNIQUE INDEX idx_personal_records_exercise ON personal_records(exercise_id, record_type);
