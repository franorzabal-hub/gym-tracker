-- Migration 027: Comprehensive exercise library expansion
-- Adds ~60 common gym exercises with proper Spanish translations
-- All exercises are global (user_id = NULL) and idempotent (ON CONFLICT DO NOTHING)

-- ============================================================
-- CHEST (8 exercises)
-- ============================================================

INSERT INTO exercises (user_id, name, muscle_group, equipment, exercise_type, rep_type, names)
VALUES (NULL, 'Incline Dumbbell Press', 'chest', 'dumbbell', 'strength', 'reps',
        '{"en": "Incline Dumbbell Press", "es": "Press Inclinado con Mancuernas"}')
ON CONFLICT (COALESCE(user_id, 0), LOWER(name)) DO NOTHING;

INSERT INTO exercises (user_id, name, muscle_group, equipment, exercise_type, rep_type, names)
VALUES (NULL, 'Decline Bench Press', 'chest', 'barbell', 'strength', 'reps',
        '{"en": "Decline Bench Press", "es": "Press Declinado"}')
ON CONFLICT (COALESCE(user_id, 0), LOWER(name)) DO NOTHING;

INSERT INTO exercises (user_id, name, muscle_group, equipment, exercise_type, rep_type, names)
VALUES (NULL, 'Push-up', 'chest', 'bodyweight', 'strength', 'reps',
        '{"en": "Push-up", "es": "Flexiones"}')
ON CONFLICT (COALESCE(user_id, 0), LOWER(name)) DO NOTHING;

INSERT INTO exercises (user_id, name, muscle_group, equipment, exercise_type, rep_type, names)
VALUES (NULL, 'Chest Dip', 'chest', 'bodyweight', 'strength', 'reps',
        '{"en": "Chest Dip", "es": "Fondos para Pecho"}')
ON CONFLICT (COALESCE(user_id, 0), LOWER(name)) DO NOTHING;

INSERT INTO exercises (user_id, name, muscle_group, equipment, exercise_type, rep_type, names)
VALUES (NULL, 'Pec Deck', 'chest', 'machine', 'strength', 'reps',
        '{"en": "Pec Deck", "es": "Máquina Contractora"}')
ON CONFLICT (COALESCE(user_id, 0), LOWER(name)) DO NOTHING;

INSERT INTO exercises (user_id, name, muscle_group, equipment, exercise_type, rep_type, names)
VALUES (NULL, 'Machine Chest Press', 'chest', 'machine', 'strength', 'reps',
        '{"en": "Machine Chest Press", "es": "Press de Pecho en Máquina"}')
ON CONFLICT (COALESCE(user_id, 0), LOWER(name)) DO NOTHING;

INSERT INTO exercises (user_id, name, muscle_group, equipment, exercise_type, rep_type, names)
VALUES (NULL, 'Cable Crossover', 'chest', 'cable', 'strength', 'reps',
        '{"en": "Cable Crossover", "es": "Cruces en Polea"}')
ON CONFLICT (COALESCE(user_id, 0), LOWER(name)) DO NOTHING;

INSERT INTO exercises (user_id, name, muscle_group, equipment, exercise_type, rep_type, names)
VALUES (NULL, 'Decline Dumbbell Press', 'chest', 'dumbbell', 'strength', 'reps',
        '{"en": "Decline Dumbbell Press", "es": "Press Declinado con Mancuernas"}')
ON CONFLICT (COALESCE(user_id, 0), LOWER(name)) DO NOTHING;

-- ============================================================
-- BACK (6 exercises)
-- ============================================================

INSERT INTO exercises (user_id, name, muscle_group, equipment, exercise_type, rep_type, names)
VALUES (NULL, 'Rack Pull', 'back', 'barbell', 'strength', 'reps',
        '{"en": "Rack Pull", "es": "Peso Muerto desde Rack"}')
ON CONFLICT (COALESCE(user_id, 0), LOWER(name)) DO NOTHING;

INSERT INTO exercises (user_id, name, muscle_group, equipment, exercise_type, rep_type, names)
VALUES (NULL, 'Pendlay Row', 'back', 'barbell', 'strength', 'reps',
        '{"en": "Pendlay Row", "es": "Remo Pendlay"}')
ON CONFLICT (COALESCE(user_id, 0), LOWER(name)) DO NOTHING;

INSERT INTO exercises (user_id, name, muscle_group, equipment, exercise_type, rep_type, names)
VALUES (NULL, 'Inverted Row', 'back', 'bodyweight', 'strength', 'reps',
        '{"en": "Inverted Row", "es": "Remo Invertido"}')
ON CONFLICT (COALESCE(user_id, 0), LOWER(name)) DO NOTHING;

INSERT INTO exercises (user_id, name, muscle_group, equipment, exercise_type, rep_type, names)
VALUES (NULL, 'Straight-Arm Pulldown', 'back', 'cable', 'strength', 'reps',
        '{"en": "Straight-Arm Pulldown", "es": "Jalón con Brazos Rectos"}')
ON CONFLICT (COALESCE(user_id, 0), LOWER(name)) DO NOTHING;

INSERT INTO exercises (user_id, name, muscle_group, equipment, exercise_type, rep_type, names)
VALUES (NULL, 'Single-Arm Lat Pulldown', 'back', 'cable', 'strength', 'reps',
        '{"en": "Single-Arm Lat Pulldown", "es": "Jalón Unilateral"}')
ON CONFLICT (COALESCE(user_id, 0), LOWER(name)) DO NOTHING;

INSERT INTO exercises (user_id, name, muscle_group, equipment, exercise_type, rep_type, names)
VALUES (NULL, 'Cable Pullover', 'back', 'cable', 'strength', 'reps',
        '{"en": "Cable Pullover", "es": "Pullover en Polea"}')
ON CONFLICT (COALESCE(user_id, 0), LOWER(name)) DO NOTHING;

-- ============================================================
-- SHOULDERS (5 exercises)
-- ============================================================

INSERT INTO exercises (user_id, name, muscle_group, equipment, exercise_type, rep_type, names)
VALUES (NULL, 'Arnold Press', 'shoulders', 'dumbbell', 'strength', 'reps',
        '{"en": "Arnold Press", "es": "Press Arnold"}')
ON CONFLICT (COALESCE(user_id, 0), LOWER(name)) DO NOTHING;

INSERT INTO exercises (user_id, name, muscle_group, equipment, exercise_type, rep_type, names)
VALUES (NULL, 'Front Raise', 'shoulders', 'dumbbell', 'strength', 'reps',
        '{"en": "Front Raise", "es": "Elevaciones Frontales"}')
ON CONFLICT (COALESCE(user_id, 0), LOWER(name)) DO NOTHING;

INSERT INTO exercises (user_id, name, muscle_group, equipment, exercise_type, rep_type, names)
VALUES (NULL, 'Cable Lateral Raise', 'shoulders', 'cable', 'strength', 'reps',
        '{"en": "Cable Lateral Raise", "es": "Elevaciones Laterales en Polea"}')
ON CONFLICT (COALESCE(user_id, 0), LOWER(name)) DO NOTHING;

INSERT INTO exercises (user_id, name, muscle_group, equipment, exercise_type, rep_type, names)
VALUES (NULL, 'Machine Shoulder Press', 'shoulders', 'machine', 'strength', 'reps',
        '{"en": "Machine Shoulder Press", "es": "Press de Hombro en Máquina"}')
ON CONFLICT (COALESCE(user_id, 0), LOWER(name)) DO NOTHING;

INSERT INTO exercises (user_id, name, muscle_group, equipment, exercise_type, rep_type, names)
VALUES (NULL, 'Reverse Cable Fly', 'shoulders', 'cable', 'strength', 'reps',
        '{"en": "Reverse Cable Fly", "es": "Aperturas Posteriores en Polea"}')
ON CONFLICT (COALESCE(user_id, 0), LOWER(name)) DO NOTHING;

-- ============================================================
-- QUADRICEPS (6 exercises)
-- ============================================================

INSERT INTO exercises (user_id, name, muscle_group, equipment, exercise_type, rep_type, names)
VALUES (NULL, 'Bulgarian Split Squat', 'quadriceps', 'dumbbell', 'strength', 'reps',
        '{"en": "Bulgarian Split Squat", "es": "Sentadilla Búlgara"}')
ON CONFLICT (COALESCE(user_id, 0), LOWER(name)) DO NOTHING;

INSERT INTO exercises (user_id, name, muscle_group, equipment, exercise_type, rep_type, names)
VALUES (NULL, 'Hack Squat', 'quadriceps', 'machine', 'strength', 'reps',
        '{"en": "Hack Squat", "es": "Sentadilla Hack"}')
ON CONFLICT (COALESCE(user_id, 0), LOWER(name)) DO NOTHING;

INSERT INTO exercises (user_id, name, muscle_group, equipment, exercise_type, rep_type, names)
VALUES (NULL, 'Goblet Squat', 'quadriceps', 'dumbbell', 'strength', 'reps',
        '{"en": "Goblet Squat", "es": "Sentadilla Goblet"}')
ON CONFLICT (COALESCE(user_id, 0), LOWER(name)) DO NOTHING;

INSERT INTO exercises (user_id, name, muscle_group, equipment, exercise_type, rep_type, names)
VALUES (NULL, 'Step-up', 'quadriceps', 'dumbbell', 'strength', 'reps',
        '{"en": "Step-up", "es": "Subidas al Cajón"}')
ON CONFLICT (COALESCE(user_id, 0), LOWER(name)) DO NOTHING;

INSERT INTO exercises (user_id, name, muscle_group, equipment, exercise_type, rep_type, names)
VALUES (NULL, 'Walking Lunge', 'quadriceps', 'dumbbell', 'strength', 'reps',
        '{"en": "Walking Lunge", "es": "Zancadas Caminando"}')
ON CONFLICT (COALESCE(user_id, 0), LOWER(name)) DO NOTHING;

INSERT INTO exercises (user_id, name, muscle_group, equipment, exercise_type, rep_type, names)
VALUES (NULL, 'Sissy Squat', 'quadriceps', 'bodyweight', 'strength', 'reps',
        '{"en": "Sissy Squat", "es": "Sentadilla Sissy"}')
ON CONFLICT (COALESCE(user_id, 0), LOWER(name)) DO NOTHING;

-- ============================================================
-- GLUTES (4 exercises)
-- ============================================================

INSERT INTO exercises (user_id, name, muscle_group, equipment, exercise_type, rep_type, names)
VALUES (NULL, 'Glute Bridge', 'glutes', 'bodyweight', 'strength', 'reps',
        '{"en": "Glute Bridge", "es": "Puente de Glúteos"}')
ON CONFLICT (COALESCE(user_id, 0), LOWER(name)) DO NOTHING;

INSERT INTO exercises (user_id, name, muscle_group, equipment, exercise_type, rep_type, names)
VALUES (NULL, 'Cable Pull-Through', 'glutes', 'cable', 'strength', 'reps',
        '{"en": "Cable Pull-Through", "es": "Pull-Through en Polea"}')
ON CONFLICT (COALESCE(user_id, 0), LOWER(name)) DO NOTHING;

INSERT INTO exercises (user_id, name, muscle_group, equipment, exercise_type, rep_type, names)
VALUES (NULL, 'Cable Kickback', 'glutes', 'cable', 'strength', 'reps',
        '{"en": "Cable Kickback", "es": "Patada de Glúteo en Polea"}')
ON CONFLICT (COALESCE(user_id, 0), LOWER(name)) DO NOTHING;

INSERT INTO exercises (user_id, name, muscle_group, equipment, exercise_type, rep_type, names)
VALUES (NULL, 'Good Morning', 'glutes', 'barbell', 'strength', 'reps',
        '{"en": "Good Morning", "es": "Buenos Días"}')
ON CONFLICT (COALESCE(user_id, 0), LOWER(name)) DO NOTHING;

-- ============================================================
-- HAMSTRINGS (3 exercises)
-- ============================================================

INSERT INTO exercises (user_id, name, muscle_group, equipment, exercise_type, rep_type, names)
VALUES (NULL, 'Nordic Curl', 'hamstrings', 'bodyweight', 'strength', 'reps',
        '{"en": "Nordic Curl", "es": "Curl Nórdico"}')
ON CONFLICT (COALESCE(user_id, 0), LOWER(name)) DO NOTHING;

INSERT INTO exercises (user_id, name, muscle_group, equipment, exercise_type, rep_type, names)
VALUES (NULL, 'Glute Ham Raise', 'hamstrings', 'machine', 'strength', 'reps',
        '{"en": "Glute Ham Raise", "es": "GHR (Glute Ham Raise)"}')
ON CONFLICT (COALESCE(user_id, 0), LOWER(name)) DO NOTHING;

INSERT INTO exercises (user_id, name, muscle_group, equipment, exercise_type, rep_type, names)
VALUES (NULL, 'Single-Leg Deadlift', 'hamstrings', 'dumbbell', 'strength', 'reps',
        '{"en": "Single-Leg Deadlift", "es": "Peso Muerto a Una Pierna"}')
ON CONFLICT (COALESCE(user_id, 0), LOWER(name)) DO NOTHING;

-- ============================================================
-- CALVES (2 exercises)
-- ============================================================

INSERT INTO exercises (user_id, name, muscle_group, equipment, exercise_type, rep_type, names)
VALUES (NULL, 'Standing Calf Raise', 'calves', 'machine', 'strength', 'reps',
        '{"en": "Standing Calf Raise", "es": "Elevación de Gemelos de Pie"}')
ON CONFLICT (COALESCE(user_id, 0), LOWER(name)) DO NOTHING;

INSERT INTO exercises (user_id, name, muscle_group, equipment, exercise_type, rep_type, names)
VALUES (NULL, 'Donkey Calf Raise', 'calves', 'machine', 'strength', 'reps',
        '{"en": "Donkey Calf Raise", "es": "Elevación de Gemelos Tipo Burro"}')
ON CONFLICT (COALESCE(user_id, 0), LOWER(name)) DO NOTHING;

-- ============================================================
-- BICEPS (4 exercises)
-- ============================================================

INSERT INTO exercises (user_id, name, muscle_group, equipment, exercise_type, rep_type, names)
VALUES (NULL, 'EZ Bar Curl', 'biceps', 'barbell', 'strength', 'reps',
        '{"en": "EZ Bar Curl", "es": "Curl con Barra Z"}')
ON CONFLICT (COALESCE(user_id, 0), LOWER(name)) DO NOTHING;

INSERT INTO exercises (user_id, name, muscle_group, equipment, exercise_type, rep_type, names)
VALUES (NULL, 'Spider Curl', 'biceps', 'dumbbell', 'strength', 'reps',
        '{"en": "Spider Curl", "es": "Curl Araña"}')
ON CONFLICT (COALESCE(user_id, 0), LOWER(name)) DO NOTHING;

INSERT INTO exercises (user_id, name, muscle_group, equipment, exercise_type, rep_type, names)
VALUES (NULL, 'Cable Hammer Curl', 'biceps', 'cable', 'strength', 'reps',
        '{"en": "Cable Hammer Curl", "es": "Curl Martillo en Polea"}')
ON CONFLICT (COALESCE(user_id, 0), LOWER(name)) DO NOTHING;

INSERT INTO exercises (user_id, name, muscle_group, equipment, exercise_type, rep_type, names)
VALUES (NULL, 'Reverse Curl', 'biceps', 'barbell', 'strength', 'reps',
        '{"en": "Reverse Curl", "es": "Curl Inverso"}')
ON CONFLICT (COALESCE(user_id, 0), LOWER(name)) DO NOTHING;

-- ============================================================
-- TRICEPS (4 exercises)
-- ============================================================

INSERT INTO exercises (user_id, name, muscle_group, equipment, exercise_type, rep_type, names)
VALUES (NULL, 'Tricep Kickback', 'triceps', 'dumbbell', 'strength', 'reps',
        '{"en": "Tricep Kickback", "es": "Patada de Tríceps"}')
ON CONFLICT (COALESCE(user_id, 0), LOWER(name)) DO NOTHING;

INSERT INTO exercises (user_id, name, muscle_group, equipment, exercise_type, rep_type, names)
VALUES (NULL, 'Cable Overhead Extension', 'triceps', 'cable', 'strength', 'reps',
        '{"en": "Cable Overhead Extension", "es": "Extensión de Tríceps en Polea Alta"}')
ON CONFLICT (COALESCE(user_id, 0), LOWER(name)) DO NOTHING;

INSERT INTO exercises (user_id, name, muscle_group, equipment, exercise_type, rep_type, names)
VALUES (NULL, 'Diamond Push-up', 'triceps', 'bodyweight', 'strength', 'reps',
        '{"en": "Diamond Push-up", "es": "Flexiones Diamante"}')
ON CONFLICT (COALESCE(user_id, 0), LOWER(name)) DO NOTHING;

INSERT INTO exercises (user_id, name, muscle_group, equipment, exercise_type, rep_type, names)
VALUES (NULL, 'JM Press', 'triceps', 'barbell', 'strength', 'reps',
        '{"en": "JM Press", "es": "Press JM"}')
ON CONFLICT (COALESCE(user_id, 0), LOWER(name)) DO NOTHING;

-- ============================================================
-- CORE (8 exercises)
-- ============================================================

INSERT INTO exercises (user_id, name, muscle_group, equipment, exercise_type, rep_type, names)
VALUES (NULL, 'Crunch', 'core', 'bodyweight', 'strength', 'reps',
        '{"en": "Crunch", "es": "Crunch Abdominal"}')
ON CONFLICT (COALESCE(user_id, 0), LOWER(name)) DO NOTHING;

INSERT INTO exercises (user_id, name, muscle_group, equipment, exercise_type, rep_type, names)
VALUES (NULL, 'Leg Raise', 'core', 'bodyweight', 'strength', 'reps',
        '{"en": "Leg Raise", "es": "Elevación de Piernas"}')
ON CONFLICT (COALESCE(user_id, 0), LOWER(name)) DO NOTHING;

INSERT INTO exercises (user_id, name, muscle_group, equipment, exercise_type, rep_type, names)
VALUES (NULL, 'Russian Twist', 'core', 'bodyweight', 'strength', 'reps',
        '{"en": "Russian Twist", "es": "Giro Ruso"}')
ON CONFLICT (COALESCE(user_id, 0), LOWER(name)) DO NOTHING;

INSERT INTO exercises (user_id, name, muscle_group, equipment, exercise_type, rep_type, names)
VALUES (NULL, 'Ab Wheel Rollout', 'core', 'bodyweight', 'strength', 'reps',
        '{"en": "Ab Wheel Rollout", "es": "Rueda Abdominal"}')
ON CONFLICT (COALESCE(user_id, 0), LOWER(name)) DO NOTHING;

INSERT INTO exercises (user_id, name, muscle_group, equipment, exercise_type, rep_type, names)
VALUES (NULL, 'Mountain Climber', 'core', 'bodyweight', 'cardio', 'reps',
        '{"en": "Mountain Climber", "es": "Escaladores"}')
ON CONFLICT (COALESCE(user_id, 0), LOWER(name)) DO NOTHING;

INSERT INTO exercises (user_id, name, muscle_group, equipment, exercise_type, rep_type, names)
VALUES (NULL, 'Dead Bug', 'core', 'bodyweight', 'strength', 'reps',
        '{"en": "Dead Bug", "es": "Bicho Muerto"}')
ON CONFLICT (COALESCE(user_id, 0), LOWER(name)) DO NOTHING;

INSERT INTO exercises (user_id, name, muscle_group, equipment, exercise_type, rep_type, names)
VALUES (NULL, 'Hanging Leg Raise', 'core', 'bodyweight', 'strength', 'reps',
        '{"en": "Hanging Leg Raise", "es": "Elevación de Piernas Colgado"}')
ON CONFLICT (COALESCE(user_id, 0), LOWER(name)) DO NOTHING;

INSERT INTO exercises (user_id, name, muscle_group, equipment, exercise_type, rep_type, names)
VALUES (NULL, 'Woodchop', 'core', 'cable', 'strength', 'reps',
        '{"en": "Woodchop", "es": "Leñador"}')
ON CONFLICT (COALESCE(user_id, 0), LOWER(name)) DO NOTHING;

-- ============================================================
-- FULL BODY / COMPOUND (6 exercises)
-- ============================================================

INSERT INTO exercises (user_id, name, muscle_group, equipment, exercise_type, rep_type, names)
VALUES (NULL, 'Clean', 'full body', 'barbell', 'strength', 'reps',
        '{"en": "Clean", "es": "Cargada"}')
ON CONFLICT (COALESCE(user_id, 0), LOWER(name)) DO NOTHING;

INSERT INTO exercises (user_id, name, muscle_group, equipment, exercise_type, rep_type, names)
VALUES (NULL, 'Power Clean', 'full body', 'barbell', 'strength', 'reps',
        '{"en": "Power Clean", "es": "Cargada de Potencia"}')
ON CONFLICT (COALESCE(user_id, 0), LOWER(name)) DO NOTHING;

INSERT INTO exercises (user_id, name, muscle_group, equipment, exercise_type, rep_type, names)
VALUES (NULL, 'Snatch', 'full body', 'barbell', 'strength', 'reps',
        '{"en": "Snatch", "es": "Arrancada"}')
ON CONFLICT (COALESCE(user_id, 0), LOWER(name)) DO NOTHING;

INSERT INTO exercises (user_id, name, muscle_group, equipment, exercise_type, rep_type, names)
VALUES (NULL, 'Thruster', 'full body', 'barbell', 'strength', 'reps',
        '{"en": "Thruster", "es": "Thruster"}')
ON CONFLICT (COALESCE(user_id, 0), LOWER(name)) DO NOTHING;

INSERT INTO exercises (user_id, name, muscle_group, equipment, exercise_type, rep_type, names)
VALUES (NULL, 'Burpee', 'full body', 'bodyweight', 'cardio', 'reps',
        '{"en": "Burpee", "es": "Burpee"}')
ON CONFLICT (COALESCE(user_id, 0), LOWER(name)) DO NOTHING;

INSERT INTO exercises (user_id, name, muscle_group, equipment, exercise_type, rep_type, names)
VALUES (NULL, 'Farmer Walk', 'full body', 'dumbbell', 'strength', 'meters',
        '{"en": "Farmer Walk", "es": "Paseo del Granjero"}')
ON CONFLICT (COALESCE(user_id, 0), LOWER(name)) DO NOTHING;

-- ============================================================
-- CARDIO (4 exercises)
-- ============================================================

INSERT INTO exercises (user_id, name, muscle_group, equipment, exercise_type, rep_type, names)
VALUES (NULL, 'Rowing Machine', 'full body', 'machine', 'cardio', 'meters',
        '{"en": "Rowing Machine", "es": "Remo Ergómetro"}')
ON CONFLICT (COALESCE(user_id, 0), LOWER(name)) DO NOTHING;

INSERT INTO exercises (user_id, name, muscle_group, equipment, exercise_type, rep_type, names)
VALUES (NULL, 'Assault Bike', 'full body', 'machine', 'cardio', 'calories',
        '{"en": "Assault Bike", "es": "Bicicleta de Asalto"}')
ON CONFLICT (COALESCE(user_id, 0), LOWER(name)) DO NOTHING;

INSERT INTO exercises (user_id, name, muscle_group, equipment, exercise_type, rep_type, names)
VALUES (NULL, 'Jump Rope', 'full body', 'bodyweight', 'cardio', 'reps',
        '{"en": "Jump Rope", "es": "Salto de Cuerda"}')
ON CONFLICT (COALESCE(user_id, 0), LOWER(name)) DO NOTHING;

INSERT INTO exercises (user_id, name, muscle_group, equipment, exercise_type, rep_type, names)
VALUES (NULL, 'Box Jump', 'quadriceps', 'bodyweight', 'strength', 'reps',
        '{"en": "Box Jump", "es": "Salto al Cajón"}')
ON CONFLICT (COALESCE(user_id, 0), LOWER(name)) DO NOTHING;

-- ============================================================
-- ADDITIONAL COMMON EXERCISES (filling gaps)
-- ============================================================

-- Traps
INSERT INTO exercises (user_id, name, muscle_group, equipment, exercise_type, rep_type, names)
VALUES (NULL, 'Dumbbell Shrug', 'traps', 'dumbbell', 'strength', 'reps',
        '{"en": "Dumbbell Shrug", "es": "Encogimientos con Mancuernas"}')
ON CONFLICT (COALESCE(user_id, 0), LOWER(name)) DO NOTHING;

-- Forearms
INSERT INTO exercises (user_id, name, muscle_group, equipment, exercise_type, rep_type, names)
VALUES (NULL, 'Wrist Curl', 'forearms', 'dumbbell', 'strength', 'reps',
        '{"en": "Wrist Curl", "es": "Curl de Muñeca"}')
ON CONFLICT (COALESCE(user_id, 0), LOWER(name)) DO NOTHING;

INSERT INTO exercises (user_id, name, muscle_group, equipment, exercise_type, rep_type, names)
VALUES (NULL, 'Reverse Wrist Curl', 'forearms', 'dumbbell', 'strength', 'reps',
        '{"en": "Reverse Wrist Curl", "es": "Curl de Muñeca Inverso"}')
ON CONFLICT (COALESCE(user_id, 0), LOWER(name)) DO NOTHING;

-- Core additions
INSERT INTO exercises (user_id, name, muscle_group, equipment, exercise_type, rep_type, names)
VALUES (NULL, 'Plank', 'core', 'bodyweight', 'strength', 'seconds',
        '{"en": "Plank", "es": "Plancha"}')
ON CONFLICT (COALESCE(user_id, 0), LOWER(name)) DO NOTHING;

INSERT INTO exercises (user_id, name, muscle_group, equipment, exercise_type, rep_type, names)
VALUES (NULL, 'Side Plank', 'core', 'bodyweight', 'strength', 'seconds',
        '{"en": "Side Plank", "es": "Plancha Lateral"}')
ON CONFLICT (COALESCE(user_id, 0), LOWER(name)) DO NOTHING;

-- Mobility / Warmup
INSERT INTO exercises (user_id, name, muscle_group, equipment, exercise_type, rep_type, names)
VALUES (NULL, 'Hip Circle', 'glutes', 'bodyweight', 'warmup', 'reps',
        '{"en": "Hip Circle", "es": "Círculos de Cadera"}')
ON CONFLICT (COALESCE(user_id, 0), LOWER(name)) DO NOTHING;

INSERT INTO exercises (user_id, name, muscle_group, equipment, exercise_type, rep_type, names)
VALUES (NULL, 'Arm Circle', 'shoulders', 'bodyweight', 'warmup', 'reps',
        '{"en": "Arm Circle", "es": "Círculos de Brazos"}')
ON CONFLICT (COALESCE(user_id, 0), LOWER(name)) DO NOTHING;

INSERT INTO exercises (user_id, name, muscle_group, equipment, exercise_type, rep_type, names)
VALUES (NULL, 'Cat-Cow Stretch', 'back', 'bodyweight', 'mobility', 'reps',
        '{"en": "Cat-Cow Stretch", "es": "Estiramiento Gato-Vaca"}')
ON CONFLICT (COALESCE(user_id, 0), LOWER(name)) DO NOTHING;

INSERT INTO exercises (user_id, name, muscle_group, equipment, exercise_type, rep_type, names)
VALUES (NULL, 'World''s Greatest Stretch', 'full body', 'bodyweight', 'mobility', 'reps',
        '{"en": "World''s Greatest Stretch", "es": "El Mejor Estiramiento del Mundo"}')
ON CONFLICT (COALESCE(user_id, 0), LOWER(name)) DO NOTHING;

-- Kettlebell exercises
INSERT INTO exercises (user_id, name, muscle_group, equipment, exercise_type, rep_type, names)
VALUES (NULL, 'Kettlebell Swing', 'glutes', 'kettlebell', 'strength', 'reps',
        '{"en": "Kettlebell Swing", "es": "Swing con Kettlebell"}')
ON CONFLICT (COALESCE(user_id, 0), LOWER(name)) DO NOTHING;

INSERT INTO exercises (user_id, name, muscle_group, equipment, exercise_type, rep_type, names)
VALUES (NULL, 'Turkish Get-Up', 'full body', 'kettlebell', 'strength', 'reps',
        '{"en": "Turkish Get-Up", "es": "Levantamiento Turco"}')
ON CONFLICT (COALESCE(user_id, 0), LOWER(name)) DO NOTHING;

INSERT INTO exercises (user_id, name, muscle_group, equipment, exercise_type, rep_type, names)
VALUES (NULL, 'Kettlebell Clean', 'full body', 'kettlebell', 'strength', 'reps',
        '{"en": "Kettlebell Clean", "es": "Cargada con Kettlebell"}')
ON CONFLICT (COALESCE(user_id, 0), LOWER(name)) DO NOTHING;

-- Band exercises
INSERT INTO exercises (user_id, name, muscle_group, equipment, exercise_type, rep_type, names)
VALUES (NULL, 'Band Pull-Apart', 'shoulders', 'bands', 'strength', 'reps',
        '{"en": "Band Pull-Apart", "es": "Separación con Banda"}')
ON CONFLICT (COALESCE(user_id, 0), LOWER(name)) DO NOTHING;

INSERT INTO exercises (user_id, name, muscle_group, equipment, exercise_type, rep_type, names)
VALUES (NULL, 'Banded Face Pull', 'shoulders', 'bands', 'strength', 'reps',
        '{"en": "Banded Face Pull", "es": "Face Pull con Banda"}')
ON CONFLICT (COALESCE(user_id, 0), LOWER(name)) DO NOTHING;

-- ============================================================
-- Spanish aliases for key exercises (for search)
-- ============================================================

INSERT INTO exercise_aliases (exercise_id, alias)
SELECT id, alias FROM (
  SELECT e.id, unnest(ARRAY[alias1, alias2]) AS alias
  FROM (
    SELECT id, name FROM exercises WHERE user_id IS NULL
  ) e
  CROSS JOIN LATERAL (
    SELECT
      CASE
        WHEN e.name = 'Push-up' THEN 'lagartijas'
        WHEN e.name = 'Cable Crossover' THEN 'cruce de poleas'
        WHEN e.name = 'Arnold Press' THEN 'press con giro'
        WHEN e.name = 'Bulgarian Split Squat' THEN 'zancada búlgara'
        WHEN e.name = 'Hack Squat' THEN 'prensa hack'
        WHEN e.name = 'Goblet Squat' THEN 'sentadilla copa'
        WHEN e.name = 'Step-up' THEN 'subida al banco'
        WHEN e.name = 'Walking Lunge' THEN 'estocadas caminando'
        WHEN e.name = 'Hip Thrust' THEN 'empuje de cadera'
        WHEN e.name = 'Glute Bridge' THEN 'elevación de cadera'
        WHEN e.name = 'Good Morning' THEN 'good morning'
        WHEN e.name = 'Nordic Curl' THEN 'femoral nórdico'
        WHEN e.name = 'EZ Bar Curl' THEN 'curl barra z'
        WHEN e.name = 'Crunch' THEN 'abdominales'
        WHEN e.name = 'Leg Raise' THEN 'elevaciones de piernas'
        WHEN e.name = 'Russian Twist' THEN 'twist ruso'
        WHEN e.name = 'Hanging Leg Raise' THEN 'elevaciones colgado'
        WHEN e.name = 'Power Clean' THEN 'cargada potencia'
        WHEN e.name = 'Snatch' THEN 'arranque'
        WHEN e.name = 'Farmer Walk' THEN 'caminata del granjero'
        WHEN e.name = 'Jump Rope' THEN 'cuerda'
        WHEN e.name = 'Box Jump' THEN 'saltos al cajón'
        WHEN e.name = 'Plank' THEN 'plancha isométrica'
        WHEN e.name = 'Kettlebell Swing' THEN 'balanceo con pesa rusa'
        ELSE NULL
      END AS alias1,
      CASE
        WHEN e.name = 'Push-up' THEN 'pushup'
        WHEN e.name = 'Glute Bridge' THEN 'puente glúteo'
        WHEN e.name = 'Nordic Curl' THEN 'curl nordico'
        WHEN e.name = 'Crunch' THEN 'encogimientos'
        WHEN e.name = 'Mountain Climber' THEN 'escalador'
        WHEN e.name = 'Dead Bug' THEN 'dead bug'
        WHEN e.name = 'Burpee' THEN 'burpees'
        WHEN e.name = 'Jump Rope' THEN 'saltar cuerda'
        WHEN e.name = 'Kettlebell Swing' THEN 'swing kettlebell'
        WHEN e.name = 'Turkish Get-Up' THEN 'getup turco'
        ELSE NULL
      END AS alias2
  ) aliases
  WHERE alias1 IS NOT NULL OR alias2 IS NOT NULL
) subq
WHERE alias IS NOT NULL
ON CONFLICT (alias) DO NOTHING;
