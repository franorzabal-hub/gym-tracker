-- Fix missing Spanish translations for exercises used in global programs
-- Only "Dip" was found with identical en/es values

UPDATE exercises
SET names = jsonb_set(names, '{es}', '"Fondos"')
WHERE id = 123 AND name = 'Dip';
