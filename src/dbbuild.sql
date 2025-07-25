    -- Simple PostgreSQL Schema for Belgian Legal Documents
    -- Only CREATE TABLE and CREATE INDEX statements
    -- No foreign keys, no triggers, no functions

    -- 1. Documents table
    CREATE TABLE documents (
        id SERIAL PRIMARY KEY,
        document_number VARCHAR(20) UNIQUE NOT NULL,
        title TEXT,
        publication_date DATE,
        source VARCHAR(255),
        page_number INTEGER,
        dossier_number VARCHAR(255),
        effective_date VARCHAR(200),
        language VARCHAR(10),
        document_type VARCHAR(57),
        status VARCHAR(20),
        official_justel_url TEXT,
        official_publication_pdf_url TEXT,
        consolidated_pdf_url VARCHAR(255),
        end_validity_date VARCHAR(200),
        preamble VARCHAR(255),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
    );

    -- 2. Document versions table
    CREATE TABLE document_versions (
        id SERIAL PRIMARY KEY,
        document_id VARCHAR(20) NOT NULL,
        archived_versions_count INTEGER DEFAULT 0,
        archived_versions_url VARCHAR(300),
        execution_orders_count INTEGER DEFAULT 0,
        execution_orders_url VARCHAR(300),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
    );

    -- 3. Hierarchy elements table
    CREATE TABLE hierarchy_elements (
        id SERIAL PRIMARY KEY,
        document_id VARCHAR(20) NOT NULL,
        parent_id INTEGER,
        element_type VARCHAR(51),
        label TEXT,
        title_type TEXT,
        title_content TEXT,
        article_range VARCHAR(100),
        rank INTEGER,
        level INTEGER,
        path VARCHAR(60),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
        UNIQUE(document_id, parent_id, rank)
    );

    -- 4. Article contents table
    CREATE TABLE article_contents (
        id SERIAL PRIMARY KEY,
        hierarchy_element_id INTEGER UNIQUE NOT NULL,
        article_number VARCHAR(50) NOT NULL,
        document_number VARCHAR(20) NOT NULL,
        anchor_id VARCHAR(53),
        main_text TEXT NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
    );

    -- 5. Numbered provisions table
    CREATE TABLE numbered_provisions (
        id SERIAL PRIMARY KEY,
        article_content_id INTEGER NOT NULL,
        provision_number VARCHAR(54),
        provision_text TEXT,
        order_index INTEGER,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
    );

    -- 6. Footnotes table
    CREATE TABLE footnotes (
        id SERIAL PRIMARY KEY,
        hierarchy_element_id INTEGER NOT NULL,
        footnote_number VARCHAR(10),
        footnote_content TEXT,
        law_type VARCHAR(10),
        date_reference VARCHAR(20),
        article_number VARCHAR(255),
        sequence_number VARCHAR(10),
        full_reference VARCHAR(100),
        effective_date VARCHAR(100),
        modification_type VARCHAR(20),
        direct_url  VARCHAR(255),
        direct_article_url VARCHAR(255),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
        UNIQUE(hierarchy_element_id, footnote_number)
    );

    -- 7. Footnote references table
    CREATE TABLE footnote_references (
        id SERIAL PRIMARY KEY,
        hierarchy_element_id INTEGER NOT NULL,
        footnote_id INTEGER NOT NULL,
        reference_number TEXT,
        text_position INTEGER,
        referenced_text TEXT,
        bracket_pattern TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
    );

    -- 8. Embedded law references table
    CREATE TABLE embedded_law_references (
        id SERIAL PRIMARY KEY,
        footnote_reference_id INTEGER,
        law_reference TEXT,
        reference_type VARCHAR(55),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
    );

    -- 9. Document modifies table
    CREATE TABLE document_modifies (
        id SERIAL PRIMARY KEY,
        document_id VARCHAR(20) NOT NULL,
        modified_document_number VARCHAR(20),
        modified_document_title TEXT,
        modification_type VARCHAR(255),
        modification_date DATE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
    );

    -- 10. Document modified by table
    CREATE TABLE document_modified_by (
        id SERIAL PRIMARY KEY,
        document_id VARCHAR(20) NOT NULL,
        modification_type VARCHAR(255),
        modification_date DATE,
        publication_date DATE,
        source_url VARCHAR(255),
        full_title TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
    );

    -- 11. Modified articles table
    CREATE TABLE modified_articles (
        id SERIAL PRIMARY KEY,
        modification_id INTEGER NOT NULL,
        article_number VARCHAR(50),
        modification_note VARCHAR(400),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
    );

    -- 12. External links table
    CREATE TABLE external_links (
        id SERIAL PRIMARY KEY,
        document_id VARCHAR(20) NOT NULL,
        link_type VARCHAR(52),
        link_url VARCHAR(255),
        link_title VARCHAR(255),
        link_description VARCHAR(255),
        order_index INTEGER,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
    );

    -- 13. Extraction metadata table
    CREATE TABLE extraction_metadata (
        id SERIAL PRIMARY KEY,
        document_id VARCHAR(20) UNIQUE NOT NULL,
        extraction_date TIMESTAMP WITH TIME ZONE NOT NULL,
        source_file VARCHAR(255),
        sections_included TEXT[],
        sections_excluded TEXT[],
        all_articles_extracted BOOLEAN DEFAULT false,
        footnotes_linked BOOLEAN DEFAULT false,
        hierarchical_structure_complete BOOLEAN DEFAULT false,
        metadata_complete BOOLEAN DEFAULT false,
        is_minimal_document BOOLEAN DEFAULT false,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
    );

    -- Create indexes for documents table
    CREATE INDEX idx_documents_document_number ON documents(document_number);
    CREATE INDEX idx_documents_publication_date ON documents(publication_date);
    CREATE INDEX idx_documents_status ON documents(status);

    -- Create indexes for hierarchy_elements table
    CREATE INDEX idx_hierarchy_document_id ON hierarchy_elements(document_id);
    CREATE INDEX idx_hierarchy_parent_id ON hierarchy_elements(parent_id);
    CREATE INDEX idx_hierarchy_element_type ON hierarchy_elements(element_type);
    CREATE INDEX idx_hierarchy_path ON hierarchy_elements(path);
    CREATE INDEX idx_hierarchy_rank ON hierarchy_elements(document_id, parent_id, rank);

    -- Create indexes for article_contents table
    CREATE INDEX idx_article_contents_hierarchy ON article_contents(hierarchy_element_id);
    CREATE INDEX idx_article_contents_number ON article_contents(article_number);
    CREATE INDEX idx_article_contents_document_number ON article_contents(document_number);

    -- Create indexes for numbered_provisions table
    CREATE INDEX idx_provisions_article ON numbered_provisions(article_content_id);
    CREATE INDEX idx_provisions_order ON numbered_provisions(article_content_id, order_index);

    -- Create indexes for footnotes table
    CREATE INDEX idx_footnotes_hierarchy ON footnotes(hierarchy_element_id);
    CREATE INDEX idx_footnotes_effective_date ON footnotes(effective_date);

    -- Create indexes for footnote_references table
    CREATE INDEX idx_footnote_refs_hierarchy ON footnote_references(hierarchy_element_id);
    CREATE INDEX idx_footnote_refs_footnote ON footnote_references(footnote_id);
    CREATE INDEX idx_footnote_refs_position ON footnote_references(text_position);

    -- Create indexes for document_modifies table
    CREATE INDEX idx_modifies_document ON document_modifies(document_id);
    CREATE INDEX idx_modifies_date ON document_modifies(modification_date);

    -- Create indexes for document_modified_by table
    CREATE INDEX idx_modified_by_document ON document_modified_by(document_id);
    CREATE INDEX idx_modified_by_date ON document_modified_by(modification_date);
    CREATE INDEX idx_modified_by_type ON document_modified_by(modification_type);

    -- Create indexes for modified_articles table
    CREATE INDEX idx_modified_articles_mod ON modified_articles(modification_id);
    CREATE INDEX idx_modified_articles_number ON modified_articles(article_number);

    -- Create indexes for external_links table
    CREATE INDEX idx_external_links_document ON external_links(document_id);
    CREATE INDEX idx_external_links_type ON external_links(link_type);

    -- Create indexes for extraction_metadata table
    CREATE INDEX idx_extraction_document ON extraction_metadata(document_id);