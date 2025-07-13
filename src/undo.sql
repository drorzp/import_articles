-- PostgreSQL Script to Remove All Legal Document Database Structure
-- This script drops all objects in the correct order to handle dependencies

-- Connect to the database first:
-- psql -U postgres -d legal_documents

-- Drop all views first (no dependencies)
DROP VIEW IF EXISTS v_document_modification_timeline CASCADE;
DROP VIEW IF EXISTS v_article_modification_history CASCADE;
DROP VIEW IF EXISTS v_articles_with_hierarchy CASCADE;

-- Drop all functions
DROP FUNCTION IF EXISTS get_article_modifications(VARCHAR, VARCHAR) CASCADE;
DROP FUNCTION IF EXISTS get_hierarchy_children(UUID) CASCADE;
DROP FUNCTION IF EXISTS update_hierarchy_path() CASCADE;
DROP FUNCTION IF EXISTS update_updated_at_column() CASCADE;

-- Drop all triggers (if any remain)
DROP TRIGGER IF EXISTS update_documents_updated_at ON documents;
DROP TRIGGER IF EXISTS trg_update_hierarchy_path ON hierarchy_elements;

-- Drop tables in reverse order of dependencies
-- (tables with foreign keys first, referenced tables last)

-- Level 4: Tables that reference other tables
DROP TABLE IF EXISTS embedded_law_references CASCADE;
DROP TABLE IF EXISTS extraction_metadata CASCADE;
DROP TABLE IF EXISTS external_links CASCADE;
DROP TABLE IF EXISTS modified_articles CASCADE;

-- Level 3: Tables that reference level 2 tables
DROP TABLE IF EXISTS footnote_references CASCADE;
DROP TABLE IF EXISTS numbered_provisions CASCADE;
DROP TABLE IF EXISTS document_modified_by CASCADE;
DROP TABLE IF EXISTS document_modifies CASCADE;

-- Level 2: Tables that reference level 1 tables
DROP TABLE IF EXISTS footnotes CASCADE;
DROP TABLE IF EXISTS article_contents CASCADE;
DROP TABLE IF EXISTS document_versions CASCADE;

-- Level 1: Tables with self-references or basic references
DROP TABLE IF EXISTS hierarchy_elements CASCADE;

-- Level 0: Base tables with no foreign key dependencies
DROP TABLE IF EXISTS documents CASCADE;

-- Drop the UUID extension if no other database is using it
-- (Be careful with this - only uncomment if you're sure)
-- DROP EXTENSION IF EXISTS "uuid-ossp";

-- Verify all objects are dropped
-- This query should return no rows
SELECT 
    'Table' as object_type, 
    tablename as object_name 
FROM pg_tables 
WHERE schemaname = 'public' 
    AND tablename IN (
        'documents', 'document_versions', 'hierarchy_elements',
        'article_contents', 'numbered_provisions', 'footnotes',
        'footnote_references', 'embedded_law_references',
        'document_modifies', 'document_modified_by', 'modified_articles',
        'external_links', 'extraction_metadata'
    )
UNION ALL
SELECT 
    'View' as object_type,
    viewname as object_name
FROM pg_views
WHERE schemaname = 'public'
    AND viewname IN (
        'v_articles_with_hierarchy',
        'v_article_modification_history', 
        'v_document_modification_timeline'
    )
UNION ALL
SELECT 
    'Function' as object_type,
    proname as object_name
FROM pg_proc
WHERE pronamespace = 'public'::regnamespace
    AND proname IN (
        'get_article_modifications',
        'get_hierarchy_children',
        'update_hierarchy_path',
        'update_updated_at_column'
    );

-- If you want to completely clean the database, you can use this nuclear option:
-- WARNING: This will drop EVERYTHING in the public schema!
-- DROP SCHEMA public CASCADE;
-- CREATE SCHEMA public;
-- GRANT ALL ON SCHEMA public TO postgres;
-- GRANT ALL ON SCHEMA public TO public;