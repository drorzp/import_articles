-- Migration to increase effective_date field size
-- This addresses the "value too long for type character varying(50)" error

BEGIN;

-- Increase the effective_date column size from VARCHAR(50) to VARCHAR(200)
ALTER TABLE documents 
ALTER COLUMN effective_date TYPE VARCHAR(200);

COMMIT;

-- Verify the change
\d documents;
