-- Migration 021: Add num_years to academic_faculties
-- Allows specifying the number of years for a faculty/institute (e.g. 2, 3, 5, 7)

ALTER TABLE academic_faculties
  ADD COLUMN IF NOT EXISTS num_years INTEGER DEFAULT NULL;
