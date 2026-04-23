-- Migration: Add clientType to companies
-- Purpose: Classify companies as particular/autonomo/empresa for import and business rules
-- Reversible: ALTER TABLE companies DROP COLUMN IF EXISTS client_type;

ALTER TABLE companies ADD COLUMN IF NOT EXISTS client_type VARCHAR(20);

COMMENT ON COLUMN companies.client_type IS 'particular | autonomo | empresa — nullable, set during import or manual classification';
