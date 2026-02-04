-- Migration 023: Complete Spanish translations for day_labels
-- Translates remaining labels that were set to same value in both languages by migration 022.

-- ============================================================
-- PART 1: Simple muscle group labels
-- ============================================================

UPDATE program_days SET labels = '{"en": "Arms", "es": "Brazos"}'::jsonb
WHERE day_label = 'Arms' AND labels->>'en' = labels->>'es';

UPDATE program_days SET labels = '{"en": "Back", "es": "Espalda"}'::jsonb
WHERE day_label = 'Back' AND labels->>'en' = labels->>'es';

UPDATE program_days SET labels = '{"en": "Chest", "es": "Pecho"}'::jsonb
WHERE day_label = 'Chest' AND labels->>'en' = labels->>'es';

UPDATE program_days SET labels = '{"en": "Shoulders", "es": "Hombros"}'::jsonb
WHERE day_label = 'Shoulders' AND labels->>'en' = labels->>'es';

-- ============================================================
-- PART 2: Training intensity/type labels
-- ============================================================

UPDATE program_days SET labels = '{"en": "Heavy", "es": "Pesado"}'::jsonb
WHERE day_label = 'Heavy' AND labels->>'en' = labels->>'es';

UPDATE program_days SET labels = '{"en": "Light", "es": "Liviano"}'::jsonb
WHERE day_label = 'Light' AND labels->>'en' = labels->>'es';

UPDATE program_days SET labels = '{"en": "Medium", "es": "Medio"}'::jsonb
WHERE day_label = 'Medium' AND labels->>'en' = labels->>'es';

UPDATE program_days SET labels = '{"en": "Volume", "es": "Volumen"}'::jsonb
WHERE day_label = 'Volume' AND labels->>'en' = labels->>'es';

UPDATE program_days SET labels = '{"en": "Intensity", "es": "Intensidad"}'::jsonb
WHERE day_label = 'Intensity' AND labels->>'en' = labels->>'es';

UPDATE program_days SET labels = '{"en": "Recovery", "es": "Recuperación"}'::jsonb
WHERE day_label = 'Recovery' AND labels->>'en' = labels->>'es';

-- ============================================================
-- PART 3: Hypertrophy compound labels
-- ============================================================

UPDATE program_days SET labels = '{"en": "Legs Hypertrophy", "es": "Piernas Hipertrofia"}'::jsonb
WHERE day_label = 'Legs Hypertrophy' AND labels->>'en' = labels->>'es';

UPDATE program_days SET labels = '{"en": "Chest & Arms Hyp", "es": "Pecho y Brazos Hipertrofia"}'::jsonb
WHERE day_label = 'Chest & Arms Hyp' AND labels->>'en' = labels->>'es';

UPDATE program_days SET labels = '{"en": "Back & Shoulders Hyp", "es": "Espalda y Hombros Hipertrofia"}'::jsonb
WHERE day_label = 'Back & Shoulders Hyp' AND labels->>'en' = labels->>'es';

-- ============================================================
-- PART 4: Legs variants (A/B)
-- ============================================================

UPDATE program_days SET labels = '{"en": "Legs A", "es": "Piernas A"}'::jsonb
WHERE day_label = 'Legs A' AND labels->>'en' = labels->>'es';

UPDATE program_days SET labels = '{"en": "Legs B", "es": "Piernas B"}'::jsonb
WHERE day_label = 'Legs B' AND labels->>'en' = labels->>'es';

-- ============================================================
-- PART 5: Push/Pull variants (A/B)
-- ============================================================

UPDATE program_days SET labels = '{"en": "Push A", "es": "Empuje A"}'::jsonb
WHERE day_label = 'Push A' AND labels->>'en' = labels->>'es';

UPDATE program_days SET labels = '{"en": "Push B", "es": "Empuje B"}'::jsonb
WHERE day_label = 'Push B' AND labels->>'en' = labels->>'es';

UPDATE program_days SET labels = '{"en": "Pull A", "es": "Tirón A"}'::jsonb
WHERE day_label = 'Pull A' AND labels->>'en' = labels->>'es';

UPDATE program_days SET labels = '{"en": "Pull B", "es": "Tirón B"}'::jsonb
WHERE day_label = 'Pull B' AND labels->>'en' = labels->>'es';

-- ============================================================
-- PART 6: Compound muscle group labels (Shoulders + Arms)
-- ============================================================

UPDATE program_days SET labels = '{"en": "Shoulders + Arms A", "es": "Hombros y Brazos A"}'::jsonb
WHERE day_label = 'Shoulders + Arms A' AND labels->>'en' = labels->>'es';

UPDATE program_days SET labels = '{"en": "Shoulders + Arms B", "es": "Hombros y Brazos B"}'::jsonb
WHERE day_label = 'Shoulders + Arms B' AND labels->>'en' = labels->>'es';

-- ============================================================
-- PART 7: Chest + Back variants
-- ============================================================

UPDATE program_days SET labels = '{"en": "Chest + Back A", "es": "Pecho y Espalda A"}'::jsonb
WHERE day_label = 'Chest + Back A' AND labels->>'en' = labels->>'es';

UPDATE program_days SET labels = '{"en": "Chest + Back B", "es": "Pecho y Espalda B"}'::jsonb
WHERE day_label = 'Chest + Back B' AND labels->>'en' = labels->>'es';

-- ============================================================
-- PART 8: Lift Day labels (keep exercise names in English)
-- ============================================================

UPDATE program_days SET labels = '{"en": "Bench Day", "es": "Día de Bench"}'::jsonb
WHERE day_label = 'Bench Day' AND labels->>'en' = labels->>'es';

UPDATE program_days SET labels = '{"en": "Squat Day", "es": "Día de Squat"}'::jsonb
WHERE day_label = 'Squat Day' AND labels->>'en' = labels->>'es';

UPDATE program_days SET labels = '{"en": "Deadlift Day", "es": "Día de Deadlift"}'::jsonb
WHERE day_label = 'Deadlift Day' AND labels->>'en' = labels->>'es';

UPDATE program_days SET labels = '{"en": "OHP Day", "es": "Día de OHP"}'::jsonb
WHERE day_label = 'OHP Day' AND labels->>'en' = labels->>'es';

UPDATE program_days SET labels = '{"en": "Template Day", "es": "Día Plantilla"}'::jsonb
WHERE day_label = 'Template Day' AND labels->>'en' = labels->>'es';

-- ============================================================
-- PART 9: Compound lift labels (keep exercise names in English, translate connectors)
-- ============================================================

UPDATE program_days SET labels = '{"en": "Bench + Squat", "es": "Bench y Squat"}'::jsonb
WHERE day_label = 'Bench + Squat' AND labels->>'en' = labels->>'es';

UPDATE program_days SET labels = '{"en": "Bench + OHP", "es": "Bench y OHP"}'::jsonb
WHERE day_label = 'Bench + OHP' AND labels->>'en' = labels->>'es';

UPDATE program_days SET labels = '{"en": "Bench + CG Bench", "es": "Bench y CG Bench"}'::jsonb
WHERE day_label = 'Bench + CG Bench' AND labels->>'en' = labels->>'es';

UPDATE program_days SET labels = '{"en": "Squat + Bench", "es": "Squat y Bench"}'::jsonb
WHERE day_label = 'Squat + Bench' AND labels->>'en' = labels->>'es';

UPDATE program_days SET labels = '{"en": "Squat + Sumo DL", "es": "Squat y Sumo DL"}'::jsonb
WHERE day_label = 'Squat + Sumo DL' AND labels->>'en' = labels->>'es';

UPDATE program_days SET labels = '{"en": "Deadlift + OHP", "es": "Deadlift y OHP"}'::jsonb
WHERE day_label = 'Deadlift + OHP' AND labels->>'en' = labels->>'es';

UPDATE program_days SET labels = '{"en": "DL + Front Squat", "es": "DL y Front Squat"}'::jsonb
WHERE day_label = 'DL + Front Squat' AND labels->>'en' = labels->>'es';

UPDATE program_days SET labels = '{"en": "OHP + Bench", "es": "OHP y Bench"}'::jsonb
WHERE day_label = 'OHP + Bench' AND labels->>'en' = labels->>'es';

UPDATE program_days SET labels = '{"en": "OHP + Incline", "es": "OHP y Incline"}'::jsonb
WHERE day_label = 'OHP + Incline' AND labels->>'en' = labels->>'es';

-- ============================================================
-- PART 10: GZCLP T1 labels (program-specific, keep format)
-- ============================================================

UPDATE program_days SET labels = '{"en": "T1 Bench", "es": "T1 Bench"}'::jsonb
WHERE day_label = 'T1 Bench' AND labels->>'en' = labels->>'es';

UPDATE program_days SET labels = '{"en": "T1 Squat", "es": "T1 Squat"}'::jsonb
WHERE day_label = 'T1 Squat' AND labels->>'en' = labels->>'es';

UPDATE program_days SET labels = '{"en": "T1 Deadlift", "es": "T1 Deadlift"}'::jsonb
WHERE day_label = 'T1 Deadlift' AND labels->>'en' = labels->>'es';

UPDATE program_days SET labels = '{"en": "T1 OHP", "es": "T1 OHP"}'::jsonb
WHERE day_label = 'T1 OHP' AND labels->>'en' = labels->>'es';
