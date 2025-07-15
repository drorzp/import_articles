-- Function to get document-related data as JSON based on document number
-- Returns JSON with document_modifies, document_versions, external_links, and extraction_metadata

CREATE OR REPLACE FUNCTION get_document_data(p_document_number VARCHAR(20))
RETURNS JSON AS $$
DECLARE
    v_document_id INTEGER;
    v_result JSON;
BEGIN
    -- First, get the document ID from the document number
    SELECT id INTO v_document_id
    FROM documents 
    WHERE document_number = p_document_number;
    
    -- If document not found, return null
    IF v_document_id IS NULL THEN
        RETURN NULL;
    END IF;
    
    -- Build the JSON result with all related data
    SELECT json_build_object(
        'document', (
            SELECT json_build_object(
                'id', d.id,
                'document_number', d.document_number,
                'title', d.title,
                'publication_date', d.publication_date,
                'source', d.source,
                'page_number', d.page_number,
                'dossier_number', d.dossier_number,
                'effective_date', d.effective_date,
                'language', d.language,
                'document_type', d.document_type,
                'status', d.status,
                'official_justel_url', d.official_justel_url,
                'official_publication_pdf_url', d.official_publication_pdf_url,
                'consolidated_pdf_url', d.consolidated_pdf_url,
                'created_at', d.created_at,
                'updated_at', d.updated_at
            )
            FROM documents d
            WHERE d.id = v_document_id
        ),
        'document_modifies', (
            SELECT COALESCE(json_agg(
                json_build_object(
                    'id', dm.id,
                    'document_id', dm.document_id,
                    'modified_document_number', dm.modified_document_number,
                    'modified_document_title', dm.modified_document_title,
                    'modification_type', dm.modification_type,
                    'modification_date', dm.modification_date,
                    'created_at', dm.created_at
                ) ORDER BY dm.created_at DESC
            ), '[]'::json)
            FROM document_modifies dm
            WHERE dm.document_id = v_document_id
        ),
        'document_versions', (
            SELECT COALESCE(json_agg(
                json_build_object(
                    'id', dv.id,
                    'document_id', dv.document_id,
                    'archived_versions_count', COALESCE(dv.archived_versions_count, 0),
                    'archived_versions_url', dv.archived_versions_url,
                    'execution_orders_count', COALESCE(dv.execution_orders_count, 0),
                    'execution_orders_url', dv.execution_orders_url,
                    'created_at', dv.created_at
                ) ORDER BY dv.created_at DESC
            ), '[]'::json)
            FROM document_versions dv
            WHERE dv.document_id = v_document_id
        ),
        'external_links', (
            SELECT COALESCE(json_agg(
                json_build_object(
                    'id', el.id,
                    'document_id', el.document_id,
                    'link_type', el.link_type,
                    'link_url', el.link_url,
                    'link_title', el.link_title,
                    'link_description', el.link_description,
                    'order_index', COALESCE(el.order_index, 0),
                    'created_at', el.created_at
                ) ORDER BY el.order_index ASC, el.created_at DESC
            ), '[]'::json)
            FROM external_links el
            WHERE el.document_id = v_document_id
        ),
        'hierarchy_elements', (
            SELECT COALESCE(json_agg(
                json_build_object(
                    'id', he.id,
                    'document_id', he.document_id,
                    'parent_id', he.parent_id,
                    'element_type', he.element_type,
                    'label', he.label,
                    'title_type', he.title_type,
                    'title_content', he.title_content,
                    'article_range', he.article_range,
                    'rank', he.rank,
                    'level', he.level,
                    'path', he.path,
                    'created_at', he.created_at
                ) ORDER BY he.level ASC, he.rank ASC
            ), '[]'::json)
            FROM hierarchy_elements he
            WHERE he.document_id = v_document_id
        ),
        'extraction_metadata', (
            SELECT json_build_object(
                'id', em.id,
                'document_id', em.document_id,
                'extraction_date', em.extraction_date,
                'source_file', em.source_file,
                'sections_included', em.sections_included,
                'sections_excluded', em.sections_excluded,
                'all_articles_extracted', COALESCE(em.all_articles_extracted, false),
                'footnotes_linked', COALESCE(em.footnotes_linked, false),
                'hierarchical_structure_complete', COALESCE(em.hierarchical_structure_complete, false),
                'metadata_complete', COALESCE(em.metadata_complete, false),
                'is_minimal_document', COALESCE(em.is_minimal_document, false),
                'created_at', em.created_at
            )
            FROM extraction_metadata em
            WHERE em.document_id = v_document_id
            LIMIT 1
        )
    ) INTO v_result;
    
    RETURN v_result;
END;
$$ LANGUAGE plpgsql;

-- Example usage:
-- SELECT get_document_data('DOC123');

-- Alternative function that returns formatted JSON (pretty printed)
CREATE OR REPLACE FUNCTION get_document_data_pretty(p_document_number VARCHAR(20))
RETURNS TEXT AS $$
DECLARE
    v_result JSON;
BEGIN
    SELECT get_document_data(p_document_number) INTO v_result;
    
    IF v_result IS NULL THEN
        RETURN NULL;
    END IF;
    
    -- Return pretty-printed JSON
    RETURN json_pretty(v_result);
END;
$$ LANGUAGE plpgsql;

-- Example usage for pretty printed JSON:
-- SELECT get_document_data_pretty('DOC123');

-- Function to check if a document exists
CREATE OR REPLACE FUNCTION document_exists(p_document_number VARCHAR(20))
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS(
        SELECT 1 FROM documents 
        WHERE document_number = p_document_number
    );
END;
$$ LANGUAGE plpgsql;

-- Example usage:
-- SELECT document_exists('DOC123');
