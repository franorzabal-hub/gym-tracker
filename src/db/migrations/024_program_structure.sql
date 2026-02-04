-- Migration 024: Add semantic structure (sections and groups) to global programs
-- Sections: "Trabajo principal" (main work), "Volumen" (supplemental volume), "Accesorios" (accessories)
-- Groups: superset (antagonist pairs), paired (compound + mobility)

-- This migration adds sections to all global programs to provide better visual organization
-- and help users understand the purpose of each exercise in their workout.

-- ============================================================================
-- SECTION CREATION HELPER
-- Creates sections for a given day_id and assigns exercises to them
-- ============================================================================

DO $$
DECLARE
  sec_main_id INTEGER;
  sec_vol_id INTEGER;
  sec_acc_id INTEGER;
  sec_t1_id INTEGER;
  sec_t2_id INTEGER;
  sec_t3_id INTEGER;
  sec_power_id INTEGER;
  sec_hyp_id INTEGER;
  day RECORD;
BEGIN

  -- ========================================================================
  -- 5/3/1 for Beginners (ID 35)
  -- Structure: Main lifts (5/3/1 sets) + Accessories
  -- ========================================================================

  -- Day 116: Squat + Bench
  INSERT INTO program_sections (day_id, label, notes, sort_order)
  VALUES (116, 'Trabajo principal', 'Levantamientos 5/3/1 con progresión semanal', 0)
  RETURNING id INTO sec_main_id;

  INSERT INTO program_sections (day_id, label, notes, sort_order)
  VALUES (116, 'Accesorios', 'Volumen complementario', 1)
  RETURNING id INTO sec_acc_id;

  UPDATE program_day_exercises SET section_id = sec_main_id WHERE id IN (539, 540); -- Squat, Bench
  UPDATE program_day_exercises SET section_id = sec_acc_id WHERE id IN (541, 542); -- Chin-Up, Fly

  -- Day 117: Deadlift + OHP
  INSERT INTO program_sections (day_id, label, notes, sort_order)
  VALUES (117, 'Trabajo principal', 'Levantamientos 5/3/1 con progresión semanal', 0)
  RETURNING id INTO sec_main_id;

  INSERT INTO program_sections (day_id, label, notes, sort_order)
  VALUES (117, 'Accesorios', 'Volumen complementario', 1)
  RETURNING id INTO sec_acc_id;

  UPDATE program_day_exercises SET section_id = sec_main_id WHERE id IN (543, 544); -- Deadlift, OHP
  UPDATE program_day_exercises SET section_id = sec_acc_id WHERE id IN (545, 546); -- Row, Leg Curl

  -- Day 118: Bench + Squat
  INSERT INTO program_sections (day_id, label, notes, sort_order)
  VALUES (118, 'Trabajo principal', 'Levantamientos 5/3/1 con progresión semanal', 0)
  RETURNING id INTO sec_main_id;

  INSERT INTO program_sections (day_id, label, notes, sort_order)
  VALUES (118, 'Accesorios', 'Volumen complementario', 1)
  RETURNING id INTO sec_acc_id;

  UPDATE program_day_exercises SET section_id = sec_main_id WHERE id IN (547, 548); -- Bench, Squat
  UPDATE program_day_exercises SET section_id = sec_acc_id WHERE id IN (549, 550); -- Lat Pulldown, Face Pull

  -- ========================================================================
  -- 5/3/1 Boring But Big (ID 42)
  -- Structure: Main lift (5/3/1) + BBB volume (5x10) + Accessories
  -- ========================================================================

  -- Day 141: OHP Day
  INSERT INTO program_sections (day_id, label, notes, sort_order)
  VALUES (141, 'Trabajo principal', '5/3/1 - Press Militar', 0)
  RETURNING id INTO sec_main_id;

  INSERT INTO program_sections (day_id, label, notes, sort_order)
  VALUES (141, 'Volumen BBB', '5x10 @ 50-60% del TM', 1)
  RETURNING id INTO sec_vol_id;

  INSERT INTO program_sections (day_id, label, notes, sort_order)
  VALUES (141, 'Accesorios', 'Trabajo de asistencia', 2)
  RETURNING id INTO sec_acc_id;

  UPDATE program_day_exercises SET section_id = sec_main_id WHERE id = 645; -- OHP 5/3/1
  UPDATE program_day_exercises SET section_id = sec_vol_id WHERE id = 646; -- OHP BBB
  UPDATE program_day_exercises SET section_id = sec_acc_id WHERE id IN (647, 648); -- Chin-Up, Face Pull

  -- Day 142: Deadlift Day
  INSERT INTO program_sections (day_id, label, notes, sort_order)
  VALUES (142, 'Trabajo principal', '5/3/1 - Peso Muerto', 0)
  RETURNING id INTO sec_main_id;

  INSERT INTO program_sections (day_id, label, notes, sort_order)
  VALUES (142, 'Volumen BBB', '5x10 @ 50-60% del TM', 1)
  RETURNING id INTO sec_vol_id;

  INSERT INTO program_sections (day_id, label, notes, sort_order)
  VALUES (142, 'Accesorios', 'Trabajo de asistencia', 2)
  RETURNING id INTO sec_acc_id;

  UPDATE program_day_exercises SET section_id = sec_main_id WHERE id = 649; -- Deadlift 5/3/1
  UPDATE program_day_exercises SET section_id = sec_vol_id WHERE id = 650; -- Deadlift BBB
  UPDATE program_day_exercises SET section_id = sec_acc_id WHERE id IN (651, 652); -- Leg Curl, Cable Crunch

  -- Day 143: Bench Day
  INSERT INTO program_sections (day_id, label, notes, sort_order)
  VALUES (143, 'Trabajo principal', '5/3/1 - Press Banca', 0)
  RETURNING id INTO sec_main_id;

  INSERT INTO program_sections (day_id, label, notes, sort_order)
  VALUES (143, 'Volumen BBB', '5x10 @ 50-60% del TM', 1)
  RETURNING id INTO sec_vol_id;

  INSERT INTO program_sections (day_id, label, notes, sort_order)
  VALUES (143, 'Accesorios', 'Trabajo de asistencia', 2)
  RETURNING id INTO sec_acc_id;

  UPDATE program_day_exercises SET section_id = sec_main_id WHERE id = 653; -- Bench 5/3/1
  UPDATE program_day_exercises SET section_id = sec_vol_id WHERE id = 654; -- Bench BBB
  UPDATE program_day_exercises SET section_id = sec_acc_id WHERE id IN (655, 656); -- DB Row, DB Fly

  -- Day 144: Squat Day
  INSERT INTO program_sections (day_id, label, notes, sort_order)
  VALUES (144, 'Trabajo principal', '5/3/1 - Sentadilla', 0)
  RETURNING id INTO sec_main_id;

  INSERT INTO program_sections (day_id, label, notes, sort_order)
  VALUES (144, 'Volumen BBB', '5x10 @ 50-60% del TM', 1)
  RETURNING id INTO sec_vol_id;

  INSERT INTO program_sections (day_id, label, notes, sort_order)
  VALUES (144, 'Accesorios', 'Trabajo de asistencia', 2)
  RETURNING id INTO sec_acc_id;

  UPDATE program_day_exercises SET section_id = sec_main_id WHERE id = 657; -- Squat 5/3/1
  UPDATE program_day_exercises SET section_id = sec_vol_id WHERE id = 658; -- Squat BBB
  UPDATE program_day_exercises SET section_id = sec_acc_id WHERE id IN (659, 660); -- Leg Press, Leg Curl

  -- ========================================================================
  -- GZCLP (ID 37)
  -- Structure: T1 (main) + T2 (secondary) + T3 (accessories)
  -- ========================================================================

  -- Day 121: T1 Squat
  INSERT INTO program_sections (day_id, label, notes, sort_order)
  VALUES (121, 'T1 - Principal', 'Levantamiento primario: 5x3+ progresión', 0)
  RETURNING id INTO sec_t1_id;

  INSERT INTO program_sections (day_id, label, notes, sort_order)
  VALUES (121, 'T2 - Secundario', 'Levantamiento secundario: 3x10', 1)
  RETURNING id INTO sec_t2_id;

  INSERT INTO program_sections (day_id, label, notes, sort_order)
  VALUES (121, 'T3 - Accesorios', 'Trabajo de asistencia: 3x15+', 2)
  RETURNING id INTO sec_t3_id;

  UPDATE program_day_exercises SET section_id = sec_t1_id WHERE id = 557; -- Squat
  UPDATE program_day_exercises SET section_id = sec_t2_id WHERE id = 558; -- Bench
  UPDATE program_day_exercises SET section_id = sec_t3_id WHERE id = 559; -- Lat Pulldown

  -- Day 122: T1 OHP
  INSERT INTO program_sections (day_id, label, notes, sort_order)
  VALUES (122, 'T1 - Principal', 'Levantamiento primario: 5x3+ progresión', 0)
  RETURNING id INTO sec_t1_id;

  INSERT INTO program_sections (day_id, label, notes, sort_order)
  VALUES (122, 'T2 - Secundario', 'Levantamiento secundario: 3x10', 1)
  RETURNING id INTO sec_t2_id;

  INSERT INTO program_sections (day_id, label, notes, sort_order)
  VALUES (122, 'T3 - Accesorios', 'Trabajo de asistencia: 3x15+', 2)
  RETURNING id INTO sec_t3_id;

  UPDATE program_day_exercises SET section_id = sec_t1_id WHERE id = 560; -- OHP
  UPDATE program_day_exercises SET section_id = sec_t2_id WHERE id = 561; -- Deadlift
  UPDATE program_day_exercises SET section_id = sec_t3_id WHERE id = 562; -- DB Row

  -- Day 123: T1 Bench
  INSERT INTO program_sections (day_id, label, notes, sort_order)
  VALUES (123, 'T1 - Principal', 'Levantamiento primario: 5x3+ progresión', 0)
  RETURNING id INTO sec_t1_id;

  INSERT INTO program_sections (day_id, label, notes, sort_order)
  VALUES (123, 'T2 - Secundario', 'Levantamiento secundario: 3x10', 1)
  RETURNING id INTO sec_t2_id;

  INSERT INTO program_sections (day_id, label, notes, sort_order)
  VALUES (123, 'T3 - Accesorios', 'Trabajo de asistencia: 3x15+', 2)
  RETURNING id INTO sec_t3_id;

  UPDATE program_day_exercises SET section_id = sec_t1_id WHERE id = 563; -- Bench
  UPDATE program_day_exercises SET section_id = sec_t2_id WHERE id = 564; -- Squat
  UPDATE program_day_exercises SET section_id = sec_t3_id WHERE id = 565; -- Lat Pulldown

  -- Day 124: T1 Deadlift
  INSERT INTO program_sections (day_id, label, notes, sort_order)
  VALUES (124, 'T1 - Principal', 'Levantamiento primario: 5x3+ progresión', 0)
  RETURNING id INTO sec_t1_id;

  INSERT INTO program_sections (day_id, label, notes, sort_order)
  VALUES (124, 'T2 - Secundario', 'Levantamiento secundario: 3x10', 1)
  RETURNING id INTO sec_t2_id;

  INSERT INTO program_sections (day_id, label, notes, sort_order)
  VALUES (124, 'T3 - Accesorios', 'Trabajo de asistencia: 3x15+', 2)
  RETURNING id INTO sec_t3_id;

  UPDATE program_day_exercises SET section_id = sec_t1_id WHERE id = 566; -- Deadlift
  UPDATE program_day_exercises SET section_id = sec_t2_id WHERE id = 567; -- OHP
  UPDATE program_day_exercises SET section_id = sec_t3_id WHERE id = 568; -- DB Row

  -- ========================================================================
  -- GZCL: The Rippler (ID 51)
  -- Structure: T1 (main) + T2 (secondary) + T3 (accessories)
  -- ========================================================================

  -- Day 184: T1 Squat
  INSERT INTO program_sections (day_id, label, notes, sort_order)
  VALUES (184, 'T1 - Principal', 'Levantamiento primario con progresión ondulante', 0)
  RETURNING id INTO sec_t1_id;

  INSERT INTO program_sections (day_id, label, notes, sort_order)
  VALUES (184, 'T2 - Secundario', 'Variante del movimiento principal', 1)
  RETURNING id INTO sec_t2_id;

  INSERT INTO program_sections (day_id, label, notes, sort_order)
  VALUES (184, 'T3 - Accesorios', 'Trabajo de asistencia de alto volumen', 2)
  RETURNING id INTO sec_t3_id;

  UPDATE program_day_exercises SET section_id = sec_t1_id WHERE id = 845; -- Squat
  UPDATE program_day_exercises SET section_id = sec_t2_id WHERE id = 846; -- Front Squat
  UPDATE program_day_exercises SET section_id = sec_t3_id WHERE id IN (847, 848); -- Leg Ext, Leg Curl

  -- Day 185: T1 Bench
  INSERT INTO program_sections (day_id, label, notes, sort_order)
  VALUES (185, 'T1 - Principal', 'Levantamiento primario con progresión ondulante', 0)
  RETURNING id INTO sec_t1_id;

  INSERT INTO program_sections (day_id, label, notes, sort_order)
  VALUES (185, 'T2 - Secundario', 'Variante del movimiento principal', 1)
  RETURNING id INTO sec_t2_id;

  INSERT INTO program_sections (day_id, label, notes, sort_order)
  VALUES (185, 'T3 - Accesorios', 'Trabajo de asistencia de alto volumen', 2)
  RETURNING id INTO sec_t3_id;

  UPDATE program_day_exercises SET section_id = sec_t1_id WHERE id = 849; -- Bench
  UPDATE program_day_exercises SET section_id = sec_t2_id WHERE id = 850; -- CG Bench
  UPDATE program_day_exercises SET section_id = sec_t3_id WHERE id IN (851, 852); -- Lat Pulldown, Fly

  -- Day 186: T1 Deadlift
  INSERT INTO program_sections (day_id, label, notes, sort_order)
  VALUES (186, 'T1 - Principal', 'Levantamiento primario con progresión ondulante', 0)
  RETURNING id INTO sec_t1_id;

  INSERT INTO program_sections (day_id, label, notes, sort_order)
  VALUES (186, 'T2 - Secundario', 'Variante del movimiento principal', 1)
  RETURNING id INTO sec_t2_id;

  INSERT INTO program_sections (day_id, label, notes, sort_order)
  VALUES (186, 'T3 - Accesorios', 'Trabajo de asistencia de alto volumen', 2)
  RETURNING id INTO sec_t3_id;

  UPDATE program_day_exercises SET section_id = sec_t1_id WHERE id = 853; -- Deadlift
  UPDATE program_day_exercises SET section_id = sec_t2_id WHERE id = 854; -- RDL
  UPDATE program_day_exercises SET section_id = sec_t3_id WHERE id IN (855, 856); -- Row, Face Pull

  -- Day 187: T1 OHP
  INSERT INTO program_sections (day_id, label, notes, sort_order)
  VALUES (187, 'T1 - Principal', 'Levantamiento primario con progresión ondulante', 0)
  RETURNING id INTO sec_t1_id;

  INSERT INTO program_sections (day_id, label, notes, sort_order)
  VALUES (187, 'T2 - Secundario', 'Variante del movimiento principal', 1)
  RETURNING id INTO sec_t2_id;

  INSERT INTO program_sections (day_id, label, notes, sort_order)
  VALUES (187, 'T3 - Accesorios', 'Trabajo de asistencia de alto volumen', 2)
  RETURNING id INTO sec_t3_id;

  UPDATE program_day_exercises SET section_id = sec_t1_id WHERE id = 857; -- OHP
  UPDATE program_day_exercises SET section_id = sec_t2_id WHERE id = 858; -- Incline Bench
  UPDATE program_day_exercises SET section_id = sec_t3_id WHERE id IN (859, 860); -- Lateral Raise, Chin-Up

  -- ========================================================================
  -- PHUL (ID 38) - Power Upper/Lower + Hypertrophy Upper/Lower
  -- Structure: Compounds + Accessories (Power), Compounds + Isolation (Hypertrophy)
  -- ========================================================================

  -- Day 125: Upper Power
  INSERT INTO program_sections (day_id, label, notes, sort_order)
  VALUES (125, 'Compuestos de fuerza', 'Movimientos principales pesados', 0)
  RETURNING id INTO sec_main_id;

  INSERT INTO program_sections (day_id, label, notes, sort_order)
  VALUES (125, 'Accesorios', 'Trabajo de asistencia', 1)
  RETURNING id INTO sec_acc_id;

  UPDATE program_day_exercises SET section_id = sec_main_id WHERE id IN (569, 570, 571); -- Bench, Row, OHP
  UPDATE program_day_exercises SET section_id = sec_acc_id WHERE id IN (572, 573); -- Curl, Skull Crusher

  -- Day 126: Lower Power
  INSERT INTO program_sections (day_id, label, notes, sort_order)
  VALUES (126, 'Compuestos de fuerza', 'Movimientos principales pesados', 0)
  RETURNING id INTO sec_main_id;

  INSERT INTO program_sections (day_id, label, notes, sort_order)
  VALUES (126, 'Accesorios', 'Trabajo de asistencia', 1)
  RETURNING id INTO sec_acc_id;

  UPDATE program_day_exercises SET section_id = sec_main_id WHERE id IN (574, 575); -- Squat, Deadlift
  UPDATE program_day_exercises SET section_id = sec_acc_id WHERE id IN (576, 577, 578); -- Leg Press, Leg Curl, Calf

  -- Day 127: Upper Hypertrophy
  INSERT INTO program_sections (day_id, label, notes, sort_order)
  VALUES (127, 'Compuestos de volumen', 'Movimientos principales con más repeticiones', 0)
  RETURNING id INTO sec_main_id;

  INSERT INTO program_sections (day_id, label, notes, sort_order)
  VALUES (127, 'Aislamiento', 'Trabajo de detalle y bombeo', 1)
  RETURNING id INTO sec_acc_id;

  UPDATE program_day_exercises SET section_id = sec_main_id WHERE id IN (579, 580, 581); -- DB Bench, Cable Row, DB OHP
  UPDATE program_day_exercises SET section_id = sec_acc_id WHERE id IN (582, 583, 584); -- Fly, Curl, Tricep Ext

  -- Day 128: Lower Hypertrophy
  INSERT INTO program_sections (day_id, label, notes, sort_order)
  VALUES (128, 'Compuestos de volumen', 'Movimientos principales con más repeticiones', 0)
  RETURNING id INTO sec_main_id;

  INSERT INTO program_sections (day_id, label, notes, sort_order)
  VALUES (128, 'Aislamiento', 'Trabajo de detalle y bombeo', 1)
  RETURNING id INTO sec_acc_id;

  UPDATE program_day_exercises SET section_id = sec_main_id WHERE id IN (585, 586); -- Front Squat, RDL
  UPDATE program_day_exercises SET section_id = sec_acc_id WHERE id IN (587, 588, 589); -- Leg Ext, Leg Curl, Calf

  -- ========================================================================
  -- PHAT (ID 45) - Power + Hypertrophy
  -- ========================================================================

  -- Day 151: Upper Power
  INSERT INTO program_sections (day_id, label, notes, sort_order)
  VALUES (151, 'Compuestos de fuerza', 'Movimientos principales pesados', 0)
  RETURNING id INTO sec_main_id;

  INSERT INTO program_sections (day_id, label, notes, sort_order)
  VALUES (151, 'Accesorios', 'Trabajo de asistencia', 1)
  RETURNING id INTO sec_acc_id;

  UPDATE program_day_exercises SET section_id = sec_main_id WHERE id IN (679, 680, 681, 682); -- Row, Bench, Pulldown, OHP
  UPDATE program_day_exercises SET section_id = sec_acc_id WHERE id IN (683, 684); -- Curl, Skull Crusher

  -- Day 152: Lower Power
  INSERT INTO program_sections (day_id, label, notes, sort_order)
  VALUES (152, 'Compuestos de fuerza', 'Movimientos principales pesados', 0)
  RETURNING id INTO sec_main_id;

  INSERT INTO program_sections (day_id, label, notes, sort_order)
  VALUES (152, 'Accesorios', 'Trabajo de asistencia', 1)
  RETURNING id INTO sec_acc_id;

  UPDATE program_day_exercises SET section_id = sec_main_id WHERE id IN (685, 686); -- Squat, Deadlift
  UPDATE program_day_exercises SET section_id = sec_acc_id WHERE id IN (687, 688, 689); -- Leg Press, Leg Curl, Calf

  -- Day 153: Back & Shoulders Hypertrophy
  INSERT INTO program_sections (day_id, label, notes, sort_order)
  VALUES (153, 'Espalda', 'Trabajo de volumen para espalda', 0)
  RETURNING id INTO sec_main_id;

  INSERT INTO program_sections (day_id, label, notes, sort_order)
  VALUES (153, 'Hombros', 'Trabajo de volumen para hombros', 1)
  RETURNING id INTO sec_acc_id;

  UPDATE program_day_exercises SET section_id = sec_main_id WHERE id IN (690, 691, 692); -- Row, Cable Row, Pulldown
  UPDATE program_day_exercises SET section_id = sec_acc_id WHERE id IN (693, 694); -- DB OHP, Lateral Raise

  -- Day 154: Chest & Arms Hypertrophy
  INSERT INTO program_sections (day_id, label, notes, sort_order)
  VALUES (154, 'Pecho', 'Trabajo de volumen para pecho', 0)
  RETURNING id INTO sec_main_id;

  INSERT INTO program_sections (day_id, label, notes, sort_order)
  VALUES (154, 'Brazos', 'Trabajo de bíceps y tríceps', 1)
  RETURNING id INTO sec_acc_id;

  UPDATE program_day_exercises SET section_id = sec_main_id WHERE id IN (695, 696, 697); -- DB Bench, Incline, Cable Fly
  UPDATE program_day_exercises SET section_id = sec_acc_id WHERE id IN (698, 699); -- Preacher Curl, Tricep Ext

  -- Day 155: Legs Hypertrophy
  INSERT INTO program_sections (day_id, label, notes, sort_order)
  VALUES (155, 'Cuádriceps', 'Trabajo de volumen para cuádriceps', 0)
  RETURNING id INTO sec_main_id;

  INSERT INTO program_sections (day_id, label, notes, sort_order)
  VALUES (155, 'Isquiotibiales y pantorrillas', 'Cadena posterior y pantorrillas', 1)
  RETURNING id INTO sec_acc_id;

  UPDATE program_day_exercises SET section_id = sec_main_id WHERE id IN (700, 701, 702); -- Front Squat, Lunge, Leg Ext
  UPDATE program_day_exercises SET section_id = sec_acc_id WHERE id IN (703, 704); -- Leg Curl, Calf

  -- ========================================================================
  -- Reddit PPL / Metallicadpa (ID 50)
  -- Structure: Main compound + Accessories per muscle group
  -- ========================================================================

  -- Day 178: Pull A
  INSERT INTO program_sections (day_id, label, notes, sort_order)
  VALUES (178, 'Compuestos de espalda', 'Peso muerto y remos pesados', 0)
  RETURNING id INTO sec_main_id;

  INSERT INTO program_sections (day_id, label, notes, sort_order)
  VALUES (178, 'Accesorios', 'Aislamiento para espalda y bíceps', 1)
  RETURNING id INTO sec_acc_id;

  UPDATE program_day_exercises SET section_id = sec_main_id WHERE id IN (810, 811); -- Deadlift, Row
  UPDATE program_day_exercises SET section_id = sec_acc_id WHERE id IN (812, 813, 814, 815); -- Pulldown, Face Pull, Curls

  -- Day 179: Push A
  INSERT INTO program_sections (day_id, label, notes, sort_order)
  VALUES (179, 'Compuestos de empuje', 'Press banca y press militar', 0)
  RETURNING id INTO sec_main_id;

  INSERT INTO program_sections (day_id, label, notes, sort_order)
  VALUES (179, 'Accesorios', 'Aislamiento para pecho, hombros y tríceps', 1)
  RETURNING id INTO sec_acc_id;

  UPDATE program_day_exercises SET section_id = sec_main_id WHERE id IN (816, 817, 818); -- Bench, OHP, Incline
  UPDATE program_day_exercises SET section_id = sec_acc_id WHERE id IN (819, 820, 821, 822); -- Fly, Lateral, Pushdown, Ext

  -- Day 180: Legs A
  INSERT INTO program_sections (day_id, label, notes, sort_order)
  VALUES (180, 'Compuestos de pierna', 'Sentadilla y RDL', 0)
  RETURNING id INTO sec_main_id;

  INSERT INTO program_sections (day_id, label, notes, sort_order)
  VALUES (180, 'Accesorios', 'Máquinas y pantorrillas', 1)
  RETURNING id INTO sec_acc_id;

  UPDATE program_day_exercises SET section_id = sec_main_id WHERE id IN (823, 824); -- Squat, RDL
  UPDATE program_day_exercises SET section_id = sec_acc_id WHERE id IN (825, 826, 827); -- Leg Press, Leg Curl, Calf

  -- Day 181: Pull B
  INSERT INTO program_sections (day_id, label, notes, sort_order)
  VALUES (181, 'Compuestos de espalda', 'Remos y dominadas', 0)
  RETURNING id INTO sec_main_id;

  INSERT INTO program_sections (day_id, label, notes, sort_order)
  VALUES (181, 'Accesorios', 'Aislamiento para espalda y bíceps', 1)
  RETURNING id INTO sec_acc_id;

  UPDATE program_day_exercises SET section_id = sec_main_id WHERE id IN (828, 829, 830); -- Row, Chin-Up, Cable Row
  UPDATE program_day_exercises SET section_id = sec_acc_id WHERE id IN (831, 832, 833); -- Face Pull, Curls

  -- Day 182: Push B
  INSERT INTO program_sections (day_id, label, notes, sort_order)
  VALUES (182, 'Compuestos de empuje', 'Press militar y banca', 0)
  RETURNING id INTO sec_main_id;

  INSERT INTO program_sections (day_id, label, notes, sort_order)
  VALUES (182, 'Accesorios', 'Aislamiento para pecho, hombros y tríceps', 1)
  RETURNING id INTO sec_acc_id;

  UPDATE program_day_exercises SET section_id = sec_main_id WHERE id IN (834, 835, 836); -- OHP, Bench, DB Bench
  UPDATE program_day_exercises SET section_id = sec_acc_id WHERE id IN (837, 838, 839); -- Lateral, Skull Crusher, Dip

  -- Day 183: Legs B
  INSERT INTO program_sections (day_id, label, notes, sort_order)
  VALUES (183, 'Compuestos de pierna', 'Sentadilla y sumo', 0)
  RETURNING id INTO sec_main_id;

  INSERT INTO program_sections (day_id, label, notes, sort_order)
  VALUES (183, 'Accesorios', 'Máquinas y pantorrillas', 1)
  RETURNING id INTO sec_acc_id;

  UPDATE program_day_exercises SET section_id = sec_main_id WHERE id IN (840, 841); -- Squat, Sumo DL
  UPDATE program_day_exercises SET section_id = sec_acc_id WHERE id IN (842, 843, 844); -- Leg Ext, Leg Curl, Calf

  -- ========================================================================
  -- PPL 6x (ID 31) - Generic Push/Pull/Legs
  -- ========================================================================

  -- Day 104: Push A
  INSERT INTO program_sections (day_id, label, notes, sort_order)
  VALUES (104, 'Compuestos', 'Movimientos principales de empuje', 0)
  RETURNING id INTO sec_main_id;

  INSERT INTO program_sections (day_id, label, notes, sort_order)
  VALUES (104, 'Accesorios', 'Aislamiento', 1)
  RETURNING id INTO sec_acc_id;

  UPDATE program_day_exercises SET section_id = sec_main_id WHERE id IN (481, 482, 483); -- Bench, OHP, Incline
  UPDATE program_day_exercises SET section_id = sec_acc_id WHERE id IN (484, 485, 486); -- Fly, Lateral, Pushdown

  -- Day 105: Pull A
  INSERT INTO program_sections (day_id, label, notes, sort_order)
  VALUES (105, 'Compuestos', 'Movimientos principales de tirón', 0)
  RETURNING id INTO sec_main_id;

  INSERT INTO program_sections (day_id, label, notes, sort_order)
  VALUES (105, 'Accesorios', 'Aislamiento', 1)
  RETURNING id INTO sec_acc_id;

  UPDATE program_day_exercises SET section_id = sec_main_id WHERE id IN (487, 488); -- Row, Pull-Up
  UPDATE program_day_exercises SET section_id = sec_acc_id WHERE id IN (489, 490, 491); -- Face Pull, Curls

  -- Day 106: Legs A
  INSERT INTO program_sections (day_id, label, notes, sort_order)
  VALUES (106, 'Compuestos', 'Movimientos principales de pierna', 0)
  RETURNING id INTO sec_main_id;

  INSERT INTO program_sections (day_id, label, notes, sort_order)
  VALUES (106, 'Accesorios', 'Máquinas y pantorrillas', 1)
  RETURNING id INTO sec_acc_id;

  UPDATE program_day_exercises SET section_id = sec_main_id WHERE id IN (492, 493); -- Squat, RDL
  UPDATE program_day_exercises SET section_id = sec_acc_id WHERE id IN (494, 495, 496); -- Leg Press, Leg Curl, Calf

  -- Day 107: Push B
  INSERT INTO program_sections (day_id, label, notes, sort_order)
  VALUES (107, 'Compuestos', 'Movimientos principales de empuje', 0)
  RETURNING id INTO sec_main_id;

  INSERT INTO program_sections (day_id, label, notes, sort_order)
  VALUES (107, 'Accesorios', 'Aislamiento', 1)
  RETURNING id INTO sec_acc_id;

  UPDATE program_day_exercises SET section_id = sec_main_id WHERE id IN (497, 498); -- OHP, Bench
  UPDATE program_day_exercises SET section_id = sec_acc_id WHERE id IN (499, 500, 501, 502); -- Fly, Incline, Lateral, Pushdown

  -- Day 108: Pull B
  INSERT INTO program_sections (day_id, label, notes, sort_order)
  VALUES (108, 'Compuestos', 'Movimientos principales de tirón', 0)
  RETURNING id INTO sec_main_id;

  INSERT INTO program_sections (day_id, label, notes, sort_order)
  VALUES (108, 'Accesorios', 'Aislamiento', 1)
  RETURNING id INTO sec_acc_id;

  UPDATE program_day_exercises SET section_id = sec_main_id WHERE id IN (503, 504, 505); -- Deadlift, Row, Pull-Up
  UPDATE program_day_exercises SET section_id = sec_acc_id WHERE id IN (506, 507); -- Face Pull, Curl

  -- Day 109: Legs B
  INSERT INTO program_sections (day_id, label, notes, sort_order)
  VALUES (109, 'Compuestos', 'Movimientos principales de pierna', 0)
  RETURNING id INTO sec_main_id;

  INSERT INTO program_sections (day_id, label, notes, sort_order)
  VALUES (109, 'Accesorios', 'Máquinas y pantorrillas', 1)
  RETURNING id INTO sec_acc_id;

  UPDATE program_day_exercises SET section_id = sec_main_id WHERE id IN (508, 509); -- Deadlift, Squat
  UPDATE program_day_exercises SET section_id = sec_acc_id WHERE id IN (510, 511, 512); -- Leg Press, Leg Curl, Calf

  -- ========================================================================
  -- Coolcicada PPL (ID 49)
  -- ========================================================================

  -- Coolcicada PPL (ID 49) - Process all days in a loop
  FOR day IN SELECT id FROM program_days WHERE id BETWEEN 172 AND 177 LOOP
    INSERT INTO program_sections (day_id, label, notes, sort_order)
    VALUES (day.id, 'Compuestos', 'Movimientos principales', 0)
    RETURNING id INTO sec_main_id;

    INSERT INTO program_sections (day_id, label, notes, sort_order)
    VALUES (day.id, 'Accesorios', 'Aislamiento', 1)
    RETURNING id INTO sec_acc_id;

    -- First 2-3 exercises are compounds, rest are accessories
    UPDATE program_day_exercises SET section_id = sec_main_id
    WHERE day_id = day.id AND sort_order <= 2;

    UPDATE program_day_exercises SET section_id = sec_acc_id
    WHERE day_id = day.id AND sort_order > 2;
  END LOOP;

  -- ========================================================================
  -- Upper/Lower 4x (ID 30)
  -- ========================================================================

  -- Day 100: Upper A
  INSERT INTO program_sections (day_id, label, notes, sort_order)
  VALUES (100, 'Compuestos', 'Movimientos principales', 0)
  RETURNING id INTO sec_main_id;

  INSERT INTO program_sections (day_id, label, notes, sort_order)
  VALUES (100, 'Accesorios', 'Aislamiento', 1)
  RETURNING id INTO sec_acc_id;

  UPDATE program_day_exercises SET section_id = sec_main_id WHERE id IN (459, 460, 461); -- Bench, Row, OHP
  UPDATE program_day_exercises SET section_id = sec_acc_id WHERE id IN (462, 463, 464); -- Fly, Curl, Pushdown

  -- Day 101: Lower A
  INSERT INTO program_sections (day_id, label, notes, sort_order)
  VALUES (101, 'Compuestos', 'Movimientos principales', 0)
  RETURNING id INTO sec_main_id;

  INSERT INTO program_sections (day_id, label, notes, sort_order)
  VALUES (101, 'Accesorios', 'Máquinas y pantorrillas', 1)
  RETURNING id INTO sec_acc_id;

  UPDATE program_day_exercises SET section_id = sec_main_id WHERE id IN (465, 466); -- Squat, RDL
  UPDATE program_day_exercises SET section_id = sec_acc_id WHERE id IN (467, 468, 469); -- Leg Press, Leg Curl, Calf

  -- Day 102: Upper B
  INSERT INTO program_sections (day_id, label, notes, sort_order)
  VALUES (102, 'Compuestos', 'Movimientos principales', 0)
  RETURNING id INTO sec_main_id;

  INSERT INTO program_sections (day_id, label, notes, sort_order)
  VALUES (102, 'Accesorios', 'Aislamiento', 1)
  RETURNING id INTO sec_acc_id;

  UPDATE program_day_exercises SET section_id = sec_main_id WHERE id IN (470, 471, 472); -- OHP, Pull-Up, Incline
  UPDATE program_day_exercises SET section_id = sec_acc_id WHERE id IN (473, 474, 475); -- Face Pull, Curl, Lateral

  -- Day 103: Lower B
  INSERT INTO program_sections (day_id, label, notes, sort_order)
  VALUES (103, 'Compuestos', 'Movimientos principales', 0)
  RETURNING id INTO sec_main_id;

  INSERT INTO program_sections (day_id, label, notes, sort_order)
  VALUES (103, 'Accesorios', 'Máquinas y pantorrillas', 1)
  RETURNING id INTO sec_acc_id;

  UPDATE program_day_exercises SET section_id = sec_main_id WHERE id IN (476, 477); -- Deadlift, Squat
  UPDATE program_day_exercises SET section_id = sec_acc_id WHERE id IN (478, 479, 480); -- Leg Press, Leg Curl, Calf

  -- ========================================================================
  -- Full Body 3x (ID 29)
  -- Structure: Compound lifts + Accessories
  -- ========================================================================

  FOR day IN SELECT id, day_label FROM program_days WHERE id BETWEEN 97 AND 99 LOOP
    INSERT INTO program_sections (day_id, label, notes, sort_order)
    VALUES (day.id, 'Compuestos', 'Movimientos principales multiarticulares', 0)
    RETURNING id INTO sec_main_id;

    INSERT INTO program_sections (day_id, label, notes, sort_order)
    VALUES (day.id, 'Accesorios', 'Trabajo complementario', 1)
    RETURNING id INTO sec_acc_id;

    -- First 3 exercises are compounds, rest are accessories
    UPDATE program_day_exercises SET section_id = sec_main_id
    WHERE day_id = day.id AND sort_order <= 2;

    UPDATE program_day_exercises SET section_id = sec_acc_id
    WHERE day_id = day.id AND sort_order > 2;
  END LOOP;

  -- ========================================================================
  -- ICF 5x5 (ID 34) - StrongLifts + Accessories
  -- ========================================================================

  -- Day 114: Workout A
  INSERT INTO program_sections (day_id, label, notes, sort_order)
  VALUES (114, 'Compuestos', 'Los big three: Sentadilla, Banca, Remo', 0)
  RETURNING id INTO sec_main_id;

  INSERT INTO program_sections (day_id, label, notes, sort_order)
  VALUES (114, 'Accesorios', 'Trabajo adicional de brazos y core', 1)
  RETURNING id INTO sec_acc_id;

  UPDATE program_day_exercises SET section_id = sec_main_id WHERE id IN (525, 526, 527); -- Squat, Bench, Row
  UPDATE program_day_exercises SET section_id = sec_acc_id WHERE id IN (528, 529, 530, 531); -- Shrug, Skull Crusher, Curl, Cable Crunch

  -- Day 115: Workout B
  INSERT INTO program_sections (day_id, label, notes, sort_order)
  VALUES (115, 'Compuestos', 'Los big three: Sentadilla, Press, Peso Muerto', 0)
  RETURNING id INTO sec_main_id;

  INSERT INTO program_sections (day_id, label, notes, sort_order)
  VALUES (115, 'Accesorios', 'Trabajo adicional de brazos y core', 1)
  RETURNING id INTO sec_acc_id;

  UPDATE program_day_exercises SET section_id = sec_main_id WHERE id IN (532, 533, 534); -- Squat, OHP, Deadlift
  UPDATE program_day_exercises SET section_id = sec_acc_id WHERE id IN (535, 536, 537, 538); -- Shrug, CG Bench, Curl, Cable Crunch

  -- ========================================================================
  -- nSuns 4-Day LP (ID 40)
  -- Structure: T1 + T2 compound + Accessories
  -- ========================================================================

  -- Day 133: Bench + OHP
  INSERT INTO program_sections (day_id, label, notes, sort_order)
  VALUES (133, 'T1 + T2', 'Compuestos principales con progresión', 0)
  RETURNING id INTO sec_main_id;

  INSERT INTO program_sections (day_id, label, notes, sort_order)
  VALUES (133, 'Accesorios', 'Trabajo de asistencia', 1)
  RETURNING id INTO sec_acc_id;

  UPDATE program_day_exercises SET section_id = sec_main_id WHERE id IN (612, 613); -- Bench, OHP
  UPDATE program_day_exercises SET section_id = sec_acc_id WHERE id IN (614, 615); -- Pulldown, Fly

  -- Day 134: Squat + Sumo DL
  INSERT INTO program_sections (day_id, label, notes, sort_order)
  VALUES (134, 'T1 + T2', 'Compuestos principales con progresión', 0)
  RETURNING id INTO sec_main_id;

  INSERT INTO program_sections (day_id, label, notes, sort_order)
  VALUES (134, 'Accesorios', 'Trabajo de asistencia', 1)
  RETURNING id INTO sec_acc_id;

  UPDATE program_day_exercises SET section_id = sec_main_id WHERE id IN (616, 617); -- Squat, Sumo
  UPDATE program_day_exercises SET section_id = sec_acc_id WHERE id IN (618, 619); -- Leg Ext, Leg Curl

  -- Day 135: OHP + Bench
  INSERT INTO program_sections (day_id, label, notes, sort_order)
  VALUES (135, 'T1 + T2', 'Compuestos principales con progresión', 0)
  RETURNING id INTO sec_main_id;

  INSERT INTO program_sections (day_id, label, notes, sort_order)
  VALUES (135, 'Accesorios', 'Trabajo de asistencia', 1)
  RETURNING id INTO sec_acc_id;

  UPDATE program_day_exercises SET section_id = sec_main_id WHERE id IN (620, 621); -- OHP, Bench
  UPDATE program_day_exercises SET section_id = sec_acc_id WHERE id IN (622, 623); -- Row, Face Pull

  -- Day 136: DL + Front Squat
  INSERT INTO program_sections (day_id, label, notes, sort_order)
  VALUES (136, 'T1 + T2', 'Compuestos principales con progresión', 0)
  RETURNING id INTO sec_main_id;

  INSERT INTO program_sections (day_id, label, notes, sort_order)
  VALUES (136, 'Accesorios', 'Trabajo de asistencia', 1)
  RETURNING id INTO sec_acc_id;

  UPDATE program_day_exercises SET section_id = sec_main_id WHERE id IN (624, 625); -- DL, Front Squat
  UPDATE program_day_exercises SET section_id = sec_acc_id WHERE id IN (626, 627); -- Leg Curl, Calf

  -- ========================================================================
  -- Candito Linear Program (ID 41)
  -- Structure: Strength (heavy) vs Control (volume)
  -- ========================================================================

  -- Day 137: Upper Strength
  INSERT INTO program_sections (day_id, label, notes, sort_order)
  VALUES (137, 'Compuestos pesados', 'Trabajo de fuerza con bajo reps', 0)
  RETURNING id INTO sec_main_id;

  INSERT INTO program_sections (day_id, label, notes, sort_order)
  VALUES (137, 'Accesorios', 'Trabajo complementario', 1)
  RETURNING id INTO sec_acc_id;

  UPDATE program_day_exercises SET section_id = sec_main_id WHERE id IN (628, 629); -- Bench, Row
  UPDATE program_day_exercises SET section_id = sec_acc_id WHERE id IN (630, 631); -- OHP, Pull-Up

  -- Day 138: Lower Strength
  INSERT INTO program_sections (day_id, label, notes, sort_order)
  VALUES (138, 'Compuestos pesados', 'Trabajo de fuerza con bajo reps', 0)
  RETURNING id INTO sec_main_id;

  INSERT INTO program_sections (day_id, label, notes, sort_order)
  VALUES (138, 'Accesorios', 'Trabajo complementario', 1)
  RETURNING id INTO sec_acc_id;

  UPDATE program_day_exercises SET section_id = sec_main_id WHERE id IN (632, 633); -- Squat, Deadlift
  UPDATE program_day_exercises SET section_id = sec_acc_id WHERE id IN (634, 635); -- Leg Press, Leg Curl

  -- Day 139: Upper Control
  INSERT INTO program_sections (day_id, label, notes, sort_order)
  VALUES (139, 'Control de volumen', 'Trabajo de técnica con más reps', 0)
  RETURNING id INTO sec_main_id;

  INSERT INTO program_sections (day_id, label, notes, sort_order)
  VALUES (139, 'Accesorios', 'Trabajo complementario', 1)
  RETURNING id INTO sec_acc_id;

  UPDATE program_day_exercises SET section_id = sec_main_id WHERE id IN (636, 637); -- DB Bench, DB Row
  UPDATE program_day_exercises SET section_id = sec_acc_id WHERE id IN (638, 639, 640); -- DB OHP, Face Pull, Curl

  -- Day 140: Lower Control
  INSERT INTO program_sections (day_id, label, notes, sort_order)
  VALUES (140, 'Control de volumen', 'Trabajo de técnica con más reps', 0)
  RETURNING id INTO sec_main_id;

  INSERT INTO program_sections (day_id, label, notes, sort_order)
  VALUES (140, 'Accesorios', 'Trabajo complementario', 1)
  RETURNING id INTO sec_acc_id;

  UPDATE program_day_exercises SET section_id = sec_main_id WHERE id IN (641, 642); -- Front Squat, RDL
  UPDATE program_day_exercises SET section_id = sec_acc_id WHERE id IN (643, 644); -- Lunge, Calf

  -- ========================================================================
  -- Bro Split (ID 47) - Each day is one muscle group
  -- Structure: Compound movements + Isolation work
  -- ========================================================================

  -- Day 161: Chest
  INSERT INTO program_sections (day_id, label, notes, sort_order)
  VALUES (161, 'Compuestos de pecho', 'Movimientos principales', 0)
  RETURNING id INTO sec_main_id;

  INSERT INTO program_sections (day_id, label, notes, sort_order)
  VALUES (161, 'Aislamiento', 'Trabajo de detalle', 1)
  RETURNING id INTO sec_acc_id;

  UPDATE program_day_exercises SET section_id = sec_main_id WHERE id IN (720, 721, 722); -- Bench, Incline, DB Bench
  UPDATE program_day_exercises SET section_id = sec_acc_id WHERE id IN (723, 724); -- Cable Fly, DB Fly

  -- Day 162: Back
  INSERT INTO program_sections (day_id, label, notes, sort_order)
  VALUES (162, 'Compuestos de espalda', 'Movimientos principales', 0)
  RETURNING id INTO sec_main_id;

  INSERT INTO program_sections (day_id, label, notes, sort_order)
  VALUES (162, 'Aislamiento', 'Trabajo de detalle', 1)
  RETURNING id INTO sec_acc_id;

  UPDATE program_day_exercises SET section_id = sec_main_id WHERE id IN (725, 726); -- Deadlift, Row
  UPDATE program_day_exercises SET section_id = sec_acc_id WHERE id IN (727, 728, 729); -- Pulldown, Cable Row, Face Pull

  -- Day 163: Shoulders
  INSERT INTO program_sections (day_id, label, notes, sort_order)
  VALUES (163, 'Compuestos de hombros', 'Press y movimientos principales', 0)
  RETURNING id INTO sec_main_id;

  INSERT INTO program_sections (day_id, label, notes, sort_order)
  VALUES (163, 'Aislamiento', 'Laterales y trapecio', 1)
  RETURNING id INTO sec_acc_id;

  UPDATE program_day_exercises SET section_id = sec_main_id WHERE id IN (730, 731); -- OHP, DB OHP
  UPDATE program_day_exercises SET section_id = sec_acc_id WHERE id IN (732, 733, 734); -- Lateral, Rear Delt, Shrug

  -- Day 164: Legs
  INSERT INTO program_sections (day_id, label, notes, sort_order)
  VALUES (164, 'Compuestos de pierna', 'Sentadilla y bisagra de cadera', 0)
  RETURNING id INTO sec_main_id;

  INSERT INTO program_sections (day_id, label, notes, sort_order)
  VALUES (164, 'Aislamiento', 'Máquinas y pantorrillas', 1)
  RETURNING id INTO sec_acc_id;

  UPDATE program_day_exercises SET section_id = sec_main_id WHERE id IN (735, 736, 737); -- Squat, RDL, Leg Press
  UPDATE program_day_exercises SET section_id = sec_acc_id WHERE id IN (738, 739, 740); -- Leg Ext, Leg Curl, Calf

  -- Day 165: Arms
  INSERT INTO program_sections (day_id, label, notes, sort_order)
  VALUES (165, 'Bíceps', 'Trabajo de bíceps', 0)
  RETURNING id INTO sec_main_id;

  INSERT INTO program_sections (day_id, label, notes, sort_order)
  VALUES (165, 'Tríceps', 'Trabajo de tríceps', 1)
  RETURNING id INTO sec_acc_id;

  UPDATE program_day_exercises SET section_id = sec_main_id WHERE id IN (741, 743, 745); -- Curls
  UPDATE program_day_exercises SET section_id = sec_acc_id WHERE id IN (742, 744, 746); -- Tricep exercises

  -- ========================================================================
  -- Arnold Split (ID 48)
  -- Chest+Back, Shoulders+Arms, Legs
  -- ========================================================================

  -- Day 166: Chest + Back A
  INSERT INTO program_sections (day_id, label, notes, sort_order)
  VALUES (166, 'Pecho', 'Trabajo de pecho', 0)
  RETURNING id INTO sec_main_id;

  INSERT INTO program_sections (day_id, label, notes, sort_order)
  VALUES (166, 'Espalda', 'Trabajo de espalda', 1)
  RETURNING id INTO sec_acc_id;

  UPDATE program_day_exercises SET section_id = sec_main_id WHERE id IN (747, 748, 749); -- Bench, Incline, Fly
  UPDATE program_day_exercises SET section_id = sec_acc_id WHERE id IN (750, 751); -- Pull-Up, Row

  -- Day 167: Shoulders + Arms A
  INSERT INTO program_sections (day_id, label, notes, sort_order)
  VALUES (167, 'Hombros', 'Trabajo de hombros', 0)
  RETURNING id INTO sec_main_id;

  INSERT INTO program_sections (day_id, label, notes, sort_order)
  VALUES (167, 'Brazos', 'Bíceps y tríceps', 1)
  RETURNING id INTO sec_acc_id;

  UPDATE program_day_exercises SET section_id = sec_main_id WHERE id IN (752, 753); -- OHP, Lateral
  UPDATE program_day_exercises SET section_id = sec_acc_id WHERE id IN (754, 755, 756); -- Curl, Skull Crusher, Dip

  -- Day 168: Legs A
  INSERT INTO program_sections (day_id, label, notes, sort_order)
  VALUES (168, 'Cuádriceps', 'Trabajo de cuádriceps', 0)
  RETURNING id INTO sec_main_id;

  INSERT INTO program_sections (day_id, label, notes, sort_order)
  VALUES (168, 'Isquiotibiales y pantorrillas', 'Cadena posterior', 1)
  RETURNING id INTO sec_acc_id;

  UPDATE program_day_exercises SET section_id = sec_main_id WHERE id IN (757, 758, 759); -- Squat, Lunge, Leg Ext
  UPDATE program_day_exercises SET section_id = sec_acc_id WHERE id IN (760, 761); -- Leg Curl, Calf

  -- Day 169: Chest + Back B
  INSERT INTO program_sections (day_id, label, notes, sort_order)
  VALUES (169, 'Pecho', 'Trabajo de pecho', 0)
  RETURNING id INTO sec_main_id;

  INSERT INTO program_sections (day_id, label, notes, sort_order)
  VALUES (169, 'Espalda', 'Trabajo de espalda', 1)
  RETURNING id INTO sec_acc_id;

  UPDATE program_day_exercises SET section_id = sec_main_id WHERE id IN (762, 763); -- DB Bench, Cable Fly
  UPDATE program_day_exercises SET section_id = sec_acc_id WHERE id IN (764, 765, 766); -- Chin-Up, T-Bar, Pulldown

  -- Day 170: Shoulders + Arms B
  INSERT INTO program_sections (day_id, label, notes, sort_order)
  VALUES (170, 'Hombros', 'Trabajo de hombros', 0)
  RETURNING id INTO sec_main_id;

  INSERT INTO program_sections (day_id, label, notes, sort_order)
  VALUES (170, 'Brazos', 'Bíceps y tríceps', 1)
  RETURNING id INTO sec_acc_id;

  UPDATE program_day_exercises SET section_id = sec_main_id WHERE id IN (767, 768); -- DB OHP, Rear Delt
  UPDATE program_day_exercises SET section_id = sec_acc_id WHERE id IN (769, 770, 771); -- Curls, Tricep Ext

  -- Day 171: Legs B
  INSERT INTO program_sections (day_id, label, notes, sort_order)
  VALUES (171, 'Cuádriceps y glúteos', 'Trabajo de cuádriceps y glúteos', 0)
  RETURNING id INTO sec_main_id;

  INSERT INTO program_sections (day_id, label, notes, sort_order)
  VALUES (171, 'Isquiotibiales y pantorrillas', 'Cadena posterior', 1)
  RETURNING id INTO sec_acc_id;

  UPDATE program_day_exercises SET section_id = sec_main_id WHERE id IN (772, 773, 774); -- Front Squat, RDL, Hip Thrust
  UPDATE program_day_exercises SET section_id = sec_acc_id WHERE id IN (775, 776); -- Leg Curl, Calf

  -- ========================================================================
  -- PHUL Powerbuilding (ID 53) - Similar to PHUL
  -- ========================================================================

  -- Day 190: Upper Power
  INSERT INTO program_sections (day_id, label, notes, sort_order)
  VALUES (190, 'Compuestos de fuerza', 'Movimientos principales pesados', 0)
  RETURNING id INTO sec_main_id;

  INSERT INTO program_sections (day_id, label, notes, sort_order)
  VALUES (190, 'Accesorios', 'Trabajo de asistencia', 1)
  RETURNING id INTO sec_acc_id;

  UPDATE program_day_exercises SET section_id = sec_main_id
  WHERE day_id = 190 AND sort_order <= 2;
  UPDATE program_day_exercises SET section_id = sec_acc_id
  WHERE day_id = 190 AND sort_order > 2;

  -- Day 191: Lower Power
  INSERT INTO program_sections (day_id, label, notes, sort_order)
  VALUES (191, 'Compuestos de fuerza', 'Movimientos principales pesados', 0)
  RETURNING id INTO sec_main_id;

  INSERT INTO program_sections (day_id, label, notes, sort_order)
  VALUES (191, 'Accesorios', 'Trabajo de asistencia', 1)
  RETURNING id INTO sec_acc_id;

  UPDATE program_day_exercises SET section_id = sec_main_id
  WHERE day_id = 191 AND sort_order <= 1;
  UPDATE program_day_exercises SET section_id = sec_acc_id
  WHERE day_id = 191 AND sort_order > 1;

  -- Day 192: Upper Hypertrophy
  INSERT INTO program_sections (day_id, label, notes, sort_order)
  VALUES (192, 'Compuestos de volumen', 'Movimientos principales con más reps', 0)
  RETURNING id INTO sec_main_id;

  INSERT INTO program_sections (day_id, label, notes, sort_order)
  VALUES (192, 'Aislamiento', 'Trabajo de detalle', 1)
  RETURNING id INTO sec_acc_id;

  UPDATE program_day_exercises SET section_id = sec_main_id
  WHERE day_id = 192 AND sort_order <= 2;
  UPDATE program_day_exercises SET section_id = sec_acc_id
  WHERE day_id = 192 AND sort_order > 2;

  -- Day 193: Lower Hypertrophy
  INSERT INTO program_sections (day_id, label, notes, sort_order)
  VALUES (193, 'Compuestos de volumen', 'Movimientos principales con más reps', 0)
  RETURNING id INTO sec_main_id;

  INSERT INTO program_sections (day_id, label, notes, sort_order)
  VALUES (193, 'Aislamiento', 'Trabajo de detalle', 1)
  RETURNING id INTO sec_acc_id;

  UPDATE program_day_exercises SET section_id = sec_main_id
  WHERE day_id = 193 AND sort_order <= 1;
  UPDATE program_day_exercises SET section_id = sec_acc_id
  WHERE day_id = 193 AND sort_order > 1;

  -- ========================================================================
  -- Lyle McDonald GBR (ID 39) - Upper/Lower
  -- ========================================================================

  FOR day IN SELECT id FROM program_days WHERE id BETWEEN 129 AND 132 LOOP
    INSERT INTO program_sections (day_id, label, notes, sort_order)
    VALUES (day.id, 'Compuestos', 'Movimientos principales', 0)
    RETURNING id INTO sec_main_id;

    INSERT INTO program_sections (day_id, label, notes, sort_order)
    VALUES (day.id, 'Accesorios', 'Trabajo de asistencia', 1)
    RETURNING id INTO sec_acc_id;

    UPDATE program_day_exercises SET section_id = sec_main_id
    WHERE day_id = day.id AND sort_order <= 2;

    UPDATE program_day_exercises SET section_id = sec_acc_id
    WHERE day_id = day.id AND sort_order > 2;
  END LOOP;

  -- ========================================================================
  -- nSuns 5-Day LP (ID 46) - Similar structure to 4-Day
  -- ========================================================================

  FOR day IN SELECT id FROM program_days WHERE id BETWEEN 156 AND 160 LOOP
    INSERT INTO program_sections (day_id, label, notes, sort_order)
    VALUES (day.id, 'T1 + T2', 'Compuestos principales con progresión', 0)
    RETURNING id INTO sec_main_id;

    INSERT INTO program_sections (day_id, label, notes, sort_order)
    VALUES (day.id, 'Accesorios', 'Trabajo de asistencia', 1)
    RETURNING id INTO sec_acc_id;

    UPDATE program_day_exercises SET section_id = sec_main_id
    WHERE day_id = day.id AND sort_order <= 1;

    UPDATE program_day_exercises SET section_id = sec_acc_id
    WHERE day_id = day.id AND sort_order > 1;
  END LOOP;

  -- ========================================================================
  -- r/Fitness Basic Beginner (ID 36) - Simple A/B split
  -- ========================================================================

  FOR day IN SELECT id FROM program_days WHERE id BETWEEN 119 AND 120 LOOP
    INSERT INTO program_sections (day_id, label, notes, sort_order)
    VALUES (day.id, 'Trabajo principal', 'Compuestos para principiantes', 0)
    RETURNING id INTO sec_main_id;

    UPDATE program_day_exercises SET section_id = sec_main_id
    WHERE day_id = day.id;
  END LOOP;

  -- ========================================================================
  -- Fierce 5 (ID 52) - Simple A/B split
  -- ========================================================================

  FOR day IN SELECT id FROM program_days WHERE id BETWEEN 188 AND 189 LOOP
    INSERT INTO program_sections (day_id, label, notes, sort_order)
    VALUES (day.id, 'Trabajo principal', 'Compuestos para principiantes', 0)
    RETURNING id INTO sec_main_id;

    UPDATE program_day_exercises SET section_id = sec_main_id
    WHERE day_id = day.id;
  END LOOP;

  -- ========================================================================
  -- NOTE: These programs are intentionally left WITHOUT sections because
  -- they are pure compound-only programs for true beginners:
  -- - Starting Strength (ID 32): days 110-111
  -- - StrongLifts 5x5 (ID 33): days 112-113
  -- - Texas Method (ID 43): days 145-147
  -- - Madcow 5x5 (ID 44): days 148-150
  -- These programs have no accessories, so sections would not add value.
  -- ========================================================================

END $$;

-- ============================================================================
-- CREATE EXERCISE GROUPS (SUPERSETS)
-- For programs with clear antagonist pairings or circuit work
-- ============================================================================

-- Arnold Split has natural antagonist pairings (Chest+Back days)
-- Day 166: Chest + Back A - could group bench+pullup as superset
-- Day 169: Chest + Back B - could group db bench+chinup as superset

-- For now, we'll leave groups empty. Supersets can be added in a future migration
-- based on user feedback about which programs benefit most from them.

-- ============================================================================
-- VERIFICATION QUERY (commented out, run manually to check results)
-- ============================================================================

-- SELECT p.name as program, pd.day_label as day, ps.label as section,
--        ps.sort_order as sec_order, e.name as exercise, pde.sort_order as ex_order
-- FROM programs p
-- JOIN program_versions pv ON pv.program_id = p.id
-- JOIN program_days pd ON pd.version_id = pv.id
-- JOIN program_day_exercises pde ON pde.day_id = pd.id
-- JOIN exercises e ON e.id = pde.exercise_id
-- LEFT JOIN program_sections ps ON ps.id = pde.section_id
-- WHERE p.user_id IS NULL
-- ORDER BY p.id, pd.sort_order, COALESCE(ps.sort_order, 999), pde.sort_order;
