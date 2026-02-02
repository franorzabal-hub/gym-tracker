-- Per-set targets: allow reps and weight to vary per set (e.g. pyramid 12/10/8)
ALTER TABLE program_day_exercises
  ADD COLUMN target_reps_per_set INTEGER[],
  ADD COLUMN target_weight_per_set REAL[];

ALTER TABLE session_template_exercises
  ADD COLUMN target_reps_per_set INTEGER[],
  ADD COLUMN target_weight_per_set REAL[];
