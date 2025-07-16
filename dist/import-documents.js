"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DatabaseOperations = exports.DocumentProcessor = void 0;
const fs = __importStar(require("fs/promises"));
const path = __importStar(require("path"));
const pg_1 = require("pg");
const ajv_1 = __importDefault(require("ajv"));
const ajv_formats_1 = __importDefault(require("ajv-formats"));
const dotenv = __importStar(require("dotenv"));
// Load environment variables
dotenv.config();
const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5433'),
    database: process.env.DB_NAME || 'lawyers',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'strongpassword'
};
const pool = new pg_1.Pool(dbConfig);
const documentSchema = {
    type: 'object',
    required: ['document_metadata', 'document_hierarchy'],
    properties: {
        document_metadata: {
            type: 'object',
            required: ['document_number', 'title', 'publication_date', 'language', 'document_type', 'status'],
            properties: {
                document_number: { type: 'string' },
                title: { type: 'string' },
                publication_date: {
                    anyOf: [
                        { type: 'string', format: 'date' },
                        { type: 'string', enum: [''] }
                    ]
                },
                language: { type: 'string' },
                document_type: { type: 'string' },
                status: { type: 'string' }
            }
        },
        document_hierarchy: { type: 'array' },
        references: {
            type: 'object',
            properties: {
                modifies: { type: 'array' },
                modified_by: { type: 'array' }
            }
        }
    }
};
class Logger {
    static info(message, data = {}) {
        console.log(`[INFO] ${new Date().toISOString()} - ${message}`, data);
    }
    static error(message, error = {}) {
        console.error(`[ERROR] ${new Date().toISOString()} - ${message}`, error);
    }
    static success(message, data = {}) {
        console.log(`[SUCCESS] ${new Date().toISOString()} - ${message}`, data);
    }
    static warning(message, data = {}) {
        console.warn(`[WARNING] ${new Date().toISOString()} - ${message}`, data);
    }
}
class ValidationResults {
    constructor() {
        this.processed = 0;
        this.successful = 0;
        this.failed = [];
        this.warnings = [];
    }
    addSuccess(filename) {
        this.processed++;
        this.successful++;
    }
    addFailure(filename, reason) {
        this.processed++;
        this.failed.push({ filename, reason });
    }
    addWarning(filename, warning) {
        this.warnings.push({ filename, warning });
    }
    getSummary() {
        return {
            total: this.processed,
            successful: this.successful,
            failed: this.failed.length,
            failures: this.failed,
            warnings: this.warnings
        };
    }
}
class DatabaseOperations {
    // Helper function to convert date format from DD-MM-YYYY to YYYY-MM-DD
    static convertDateFormat(dateString) {
        if (!dateString)
            return null;
        // Check if already in ISO format
        if (/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
            return dateString;
        }
        // Handle basic DD-MM-YYYY format at start of string (most common case)
        const basicMatch = dateString.match(/^(\d{2})-(\d{2})-(\d{4})/);
        if (basicMatch) {
            return `${basicMatch[3]}-${basicMatch[2]}-${basicMatch[1]}`;
        }
        // Handle French date format: "indeterminee et au plus tard le DD-MM-YYYY"
        const frenchDateMatch = dateString.match(/au plus tard le (\d{2})-(\d{2})-(\d{4})/);
        if (frenchDateMatch) {
            return `${frenchDateMatch[3]}-${frenchDateMatch[2]}-${frenchDateMatch[1]}`;
        }
        // Handle "En vigueur : DD-MM-YYYY" format
        const enVigueurMatch = dateString.match(/En vigueur : (\d{2})-(\d{2})-(\d{4})/);
        if (enVigueurMatch) {
            return `${enVigueurMatch[3]}-${enVigueurMatch[2]}-${enVigueurMatch[1]}`;
        }
        // Handle "**En vigueur :**DD-MM-YYYY" format (with markdown formatting)
        const enVigueurMarkdownMatch = dateString.match(/\*\*En vigueur :\*\*(\d{2})-(\d{2})-(\d{4})/);
        if (enVigueurMarkdownMatch) {
            return `${enVigueurMarkdownMatch[3]}-${enVigueurMarkdownMatch[2]}-${enVigueurMarkdownMatch[1]}`;
        }
        // Handle "indeterminee" as a special case
        if (dateString.toLowerCase().includes('indeterminee')) {
            // For indeterminate dates, we'll use a conventional placeholder or null
            // Using null is better than an arbitrary date that might be misleading
            return null;
        }
        // Handle Belgian legal conditional dates (Moniteur belge references)
        if (dateString.toLowerCase().includes('moniteur belge') ||
            dateString.toLowerCase().includes('condition que') ||
            dateString.toLowerCase().includes('à la date de la dernière')) {
            // These are conditional effective dates that depend on future publications
            // Return null as the actual date is indeterminate
            return null;
        }
        // Handle other complex legal date expressions
        if (dateString.toLowerCase().includes('entre en vigueur') &&
            !dateString.match(/\d{2}-\d{2}-\d{4}/)) {
            // Complex effective date clauses without specific dates
            return null;
        }
        // Handle "à déterminer" or similar indeterminate expressions
        if (dateString.toLowerCase().includes('déterminer') ||
            dateString.toLowerCase().includes('à fixer') ||
            dateString.toLowerCase().includes('ultérieurement')) {
            return null;
        }
        // Return null if format is unrecognized
        Logger.warning(`Unrecognized date format: ${dateString}`);
        return null;
    }
    // Insert main document - returns the auto-generated SERIAL id
    static async insertDocument(client, metadata) {
        const query = `
      INSERT INTO documents (
        document_number, title, publication_date, source, page_number,
        dossier_number, effective_date, language, document_type, status,
        official_justel_url, official_publication_pdf_url, consolidated_pdf_url
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING id
    `;
        const values = [
            metadata.document_number,
            metadata.title,
            metadata.publication_date || null,
            metadata.source || null,
            metadata.page_number || 0,
            metadata.dossier_number || null,
            metadata.effective_date || null,
            metadata.language,
            metadata.document_type,
            metadata.status,
            metadata.official_justel_url || null,
            metadata.official_publication_pdf_url || null,
            metadata.consolidated_pdf_url || null
        ];
        const result = await client.query(query, values);
        return result.rows[0].id;
    }
    // Insert version information
    static async insertVersionInfo(client, documentId, versionInfo) {
        if (!versionInfo)
            return;
        const query = `
      INSERT INTO document_versions (
        document_id, archived_versions_count, archived_versions_url,
        execution_orders_count, execution_orders_url
      ) VALUES ($1, $2, $3, $4, $5)
    `;
        const values = [
            documentId,
            versionInfo.archived_versions_count || 0,
            versionInfo.archived_versions_url || null,
            versionInfo.execution_orders_count || 0,
            versionInfo.execution_orders_url || null
        ];
        await client.query(query, values);
    }
    // Insert hierarchy elements recursively - returns SERIAL id
    static async insertHierarchyElement(client, documentId, element, document_number, parentId = null, rank = 1) {
        const query = `
      INSERT INTO hierarchy_elements (
        document_id, parent_id, element_type, label, title_type,
        title_content, article_range, rank, level, path
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING id
    `;
        // Calculate level based on parent
        let level = 1;
        let path = rank.toString().padStart(3, '0');
        if (parentId) {
            const parentResult = await client.query('SELECT level, path FROM hierarchy_elements WHERE id = $1', [parentId]);
            if (parentResult.rows.length > 0) {
                level = parentResult.rows[0].level + 1;
                path = parentResult.rows[0].path + '.' + rank.toString().padStart(3, '0');
            }
        }
        const values = [
            documentId,
            parentId,
            element.type,
            element.label,
            element.metadata?.title_type || null,
            element.metadata?.title_content || null,
            element.metadata?.article_range || null,
            rank,
            level,
            path
        ];
        const result = await client.query(query, values);
        const elementId = result.rows[0].id;
        // Insert article content if this is an article
        if (element.type === 'article' && element.article_content) {
            await this.insertArticleContent(client, elementId, element.article_content, document_number);
        }
        // Store footnote IDs for reference linking
        const footnoteIdMap = new Map();
        // Insert footnotes
        if (element.footnotes && element.footnotes.length > 0) {
            for (const footnote of element.footnotes) {
                const footnoteId = await this.insertFootnote(client, elementId, footnote);
                footnoteIdMap.set(footnote.footnote_number, footnoteId);
            }
        }
        // Insert footnote references
        if (element.footnote_references && element.footnote_references.length > 0) {
            for (const ref of element.footnote_references) {
                const footnoteId = footnoteIdMap.get(ref.reference_number);
                if (footnoteId) {
                    await this.insertFootnoteReference(client, elementId, footnoteId, ref);
                }
            }
        }
        // Recursively insert children
        if (element.children && element.children.length > 0) {
            let childRank = 1;
            for (const child of element.children) {
                await this.insertHierarchyElement(client, documentId, child, document_number, elementId, childRank++);
            }
        }
        return elementId;
    }
    // Insert article content
    static async insertArticleContent(client, hierarchyElementId, content, document_number) {
        const query = `
      INSERT INTO article_contents (
        hierarchy_element_id, article_number, anchor_id, main_text, document_number
      ) VALUES ($1, $2, $3, $4, $5)
      RETURNING id
    `;
        const values = [
            hierarchyElementId,
            content.article_number,
            content.anchor_id || null,
            content.content.main_text,
            document_number
        ];
        const result = await client.query(query, values);
        const contentId = result.rows[0].id;
        // Insert numbered provisions if any
        if (content.content.numbered_provisions && content.content.numbered_provisions.length > 0) {
            let orderIndex = 1;
            for (const provision of content.content.numbered_provisions) {
                await this.insertNumberedProvision(client, contentId, provision, orderIndex++);
            }
        }
    }
    // Insert numbered provision
    static async insertNumberedProvision(client, articleContentId, provision, orderIndex) {
        const query = `
      INSERT INTO numbered_provisions (
        article_content_id, provision_number, provision_text, order_index
      ) VALUES ($1, $2, $3, $4)
    `;
        await client.query(query, [
            articleContentId,
            provision.number || orderIndex.toString(),
            provision.text,
            orderIndex
        ]);
    }
    // Insert footnote - returns SERIAL id
    static async insertFootnote(client, hierarchyElementId, footnote) {
        // First check if the footnote already exists
        const checkQuery = `
      SELECT id FROM footnotes
      WHERE hierarchy_element_id = $1 AND footnote_number = $2
    `;
        const checkResult = await client.query(checkQuery, [hierarchyElementId, footnote.footnote_number]);
        // If footnote already exists, return its ID
        if (checkResult.rows.length > 0) {
            Logger.warning(`Footnote ${footnote.footnote_number} already exists for hierarchy element ${hierarchyElementId}`);
            return checkResult.rows[0].id;
        }
        // Otherwise insert the new footnote
        const query = `
      INSERT INTO footnotes (
        hierarchy_element_id, footnote_number, footnote_content,
        law_type, date_reference, article_number, sequence_number,
        full_reference, effective_date, modification_type,
        direct_url, direct_article_url
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING id
    `;
        // Sanitize sequence_number to extract only the numeric part and truncate to 10 chars
        let sanitizedSequenceNumber = footnote.law_reference?.sequence_number || null;
        if (sanitizedSequenceNumber) {
            // Extract the numeric part at the beginning (e.g., "003" from "003> (2)<DCFL...")
            const match = sanitizedSequenceNumber.match(/^(\d+)/);
            if (match) {
                sanitizedSequenceNumber = match[1];
            }
            // Truncate to 10 characters if still too long
            if (sanitizedSequenceNumber.length > 10) {
                Logger.warning(`Truncating sequence_number from ${sanitizedSequenceNumber.length} to 10 chars: "${sanitizedSequenceNumber}" -> "${sanitizedSequenceNumber.substring(0, 10)}"`);
                sanitizedSequenceNumber = sanitizedSequenceNumber.substring(0, 10);
            }
        }
        // Debug: Check field lengths for VARCHAR(10) constraints
        const footnoteNumber = footnote.footnote_number;
        const lawType = footnote.law_reference?.law_type || null;
        const sequenceNumber = sanitizedSequenceNumber;
        if (footnoteNumber && footnoteNumber.length > 10) {
            Logger.error(`footnote_number too long (${footnoteNumber.length}): "${footnoteNumber}"`);
        }
        if (lawType && lawType.length > 10) {
            Logger.error(`law_type too long (${lawType.length}): "${lawType}"`);
        }
        if (sequenceNumber && sequenceNumber.length > 10) {
            Logger.error(`sequence_number too long (${sequenceNumber.length}): "${sequenceNumber}"`);
        }
        const values = [
            hierarchyElementId,
            footnote.footnote_number,
            footnote.footnote_content,
            footnote.law_reference?.law_type || null,
            footnote.law_reference?.date_reference || null,
            footnote.law_reference?.article_number || null,
            sanitizedSequenceNumber,
            footnote.law_reference?.full_reference || null,
            this.convertDateFormat(footnote.effective_date) || null,
            footnote.modification_type || null,
            footnote.direct_url || null,
            footnote.direct_article_url || null
        ];
        const result = await client.query(query, values);
        return result.rows[0].id;
    }
    // Insert footnote reference
    static async insertFootnoteReference(client, hierarchyElementId, footnoteId, reference) {
        const query = `
      INSERT INTO footnote_references (
        hierarchy_element_id, footnote_id, reference_number,
        text_position, referenced_text, bracket_pattern
      ) VALUES ($1, $2, $3, $4, $5, $6)
    `;
        await client.query(query, [
            hierarchyElementId,
            footnoteId,
            reference.reference_number,
            reference.text_position,
            reference.referenced_text,
            reference.bracket_pattern || null
        ]);
    }
    // Insert modifications
    static async insertModifications(client, documentId, references) {
        if (!references)
            return;
        // Insert documents this one modifies
        if (references.modifies && references.modifies.length > 0) {
            for (const mod of references.modifies) {
                await this.insertDocumentModifies(client, documentId, mod);
            }
        }
        // Insert modifications to this document
        if (references.modified_by && references.modified_by.length > 0) {
            for (const mod of references.modified_by) {
                await this.insertDocumentModifiedBy(client, documentId, mod);
            }
        }
    }
    // Insert document modifies record
    static async insertDocumentModifies(client, documentId, modification) {
        const query = `
      INSERT INTO document_modifies (
        document_id, modified_document_number, modified_document_title,
        modification_type, modification_date
      ) VALUES ($1, $2, $3, $4, $5)
    `;
        await client.query(query, [
            documentId,
            modification.document_number || null,
            modification.document_title || null,
            modification.modification_type || null,
            this.convertDateFormat(modification.modification_date) || null
        ]);
    }
    // Insert document modified by record
    static async insertDocumentModifiedBy(client, documentId, modification) {
        const query = `
      INSERT INTO document_modified_by (
        document_id, modification_type, modification_date,
        publication_date, source_url, full_title
      ) VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id
    `;
        const result = await client.query(query, [
            documentId,
            modification.modification_type,
            this.convertDateFormat(modification.modification_date),
            this.convertDateFormat(modification.publication_date),
            modification.source_url || null,
            modification.full_title
        ]);
        const modificationId = result.rows[0].id;
        // Insert modified articles
        if (modification.modified_articles && modification.modified_articles.length > 0) {
            for (const article of modification.modified_articles) {
                await this.insertModifiedArticle(client, modificationId, article);
            }
        }
    }
    // Insert modified article
    static async insertModifiedArticle(client, modificationId, articleNumber) {
        // Check if article number contains special note
        let number = articleNumber;
        let note = null;
        if (articleNumber.includes(' ')) {
            const parts = articleNumber.split(' ');
            number = parts[0];
            note = parts.slice(1).join(' ');
        }
        const query = `
      INSERT INTO modified_articles (
        modification_id, article_number, modification_note
      ) VALUES ($1, $2, $3)
    `;
        await client.query(query, [modificationId, number, note]);
    }
    // Insert external links
    static async insertExternalLinks(client, documentId, externalLinks) {
        if (!externalLinks)
            return;
        let orderIndex = 0;
        // Insert official links
        if (externalLinks.official_links && externalLinks.official_links.length > 0) {
            for (const link of externalLinks.official_links) {
                await this.insertExternalLink(client, documentId, 'official', link, orderIndex++);
            }
        }
        // Insert parliamentary work links
        if (externalLinks.parliamentary_work && externalLinks.parliamentary_work.length > 0) {
            for (const link of externalLinks.parliamentary_work) {
                await this.insertExternalLink(client, documentId, 'parliamentary_work', link, orderIndex++);
            }
        }
    }
    // Insert external link
    static async insertExternalLink(client, documentId, linkType, link, orderIndex) {
        const query = `
      INSERT INTO external_links (
        document_id, link_type, link_url, link_title,
        link_description, order_index
      ) VALUES ($1, $2, $3, $4, $5, $6)
    `;
        await client.query(query, [
            documentId,
            linkType,
            typeof link === 'string' ? link : link.url,
            typeof link === 'object' ? (link.title || null) : null,
            typeof link === 'object' ? (link.description || null) : null,
            orderIndex
        ]);
    }
    // Insert extraction metadata
    static async insertExtractionMetadata(client, documentId, metadata) {
        if (!metadata)
            return;
        const query = `
      INSERT INTO extraction_metadata (
        document_id, extraction_date, source_file,
        sections_included, sections_excluded,
        all_articles_extracted, footnotes_linked,
        hierarchical_structure_complete, metadata_complete,
        is_minimal_document
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    `;
        await client.query(query, [
            documentId,
            metadata.extraction_date,
            metadata.source_file || null,
            metadata.sections_included || [],
            metadata.sections_excluded || [],
            metadata.completeness_flags?.all_articles_extracted || false,
            metadata.completeness_flags?.footnotes_linked || false,
            metadata.completeness_flags?.hierarchical_structure_complete || false,
            metadata.completeness_flags?.metadata_complete || false,
            metadata.completeness_flags?.is_minimal_document || false
        ]);
    }
}
exports.DatabaseOperations = DatabaseOperations;
class DocumentProcessor {
    constructor() {
        this.results = new ValidationResults();
        // Initialize AJV for JSON validation
        const ajv = new ajv_1.default({ allErrors: true });
        (0, ajv_formats_1.default)(ajv);
        this.validator = ajv.compile(documentSchema);
    }
    // Validate document structure
    validateDocument(data, filename) {
        const valid = this.validator(data);
        if (!valid) {
            const errors = this.validator.errors?.map(err => `${err.instancePath}: ${err.message}`).join(', ') || 'Unknown validation error';
            this.results.addFailure(filename, `Schema validation failed: ${errors}`);
            return false;
        }
        // Additional validation checks
        if (!data.document_metadata.document_number) {
            this.results.addFailure(filename, 'Missing document number');
            return false;
        }
        if (!data.document_hierarchy || data.document_hierarchy.length === 0) {
            this.results.addWarning(filename, 'Document has no hierarchy elements');
        }
        return true;
    }
    // Process a single document
    async processDocument(filePath) {
        const filename = path.basename(filePath);
        Logger.info(`Processing file: ${filename}`);
        try {
            // Read and parse file
            const fileContent = await fs.readFile(filePath, 'utf8');
            let data;
            try {
                data = JSON.parse(fileContent);
            }
            catch (parseError) {
                this.results.addFailure(filename, `JSON parse error: ${parseError.message}`);
                return;
            }
            // Validate structure
            if (!this.validateDocument(data, filename)) {
                return;
            }
            // Check if document already exists
            const existsQuery = 'SELECT id FROM documents WHERE document_number = $1';
            const existsResult = await pool.query(existsQuery, [data.document_metadata.document_number]);
            if (existsResult.rows.length > 0) {
                this.results.addWarning(filename, `Document ${data.document_metadata.document_number} already exists in database`);
                return;
            }
            // Begin transaction
            const client = await pool.connect();
            try {
                await client.query('BEGIN');
                // Insert document - now returns number (SERIAL id)
                const documentId = await DatabaseOperations.insertDocument(client, data.document_metadata);
                Logger.info(`Inserted document with ID: ${documentId}`);
                // Insert version info
                await DatabaseOperations.insertVersionInfo(client, documentId, data.document_metadata.version_info);
                // Insert hierarchy elements
                let elementRank = 1;
                for (const element of data.document_hierarchy) {
                    await DatabaseOperations.insertHierarchyElement(client, documentId, element, data.document_metadata.document_number, null, elementRank++);
                }
                // Insert modifications
                await DatabaseOperations.insertModifications(client, documentId, data.references);
                // Insert external links
                await DatabaseOperations.insertExternalLinks(client, documentId, data.external_links);
                // Insert extraction metadata
                await DatabaseOperations.insertExtractionMetadata(client, documentId, data.extraction_metadata);
                await client.query('COMMIT');
                this.results.addSuccess(filename);
                Logger.success(`Successfully imported document: ${data.document_metadata.document_number}`);
            }
            catch (dbError) {
                await client.query('ROLLBACK');
                throw dbError;
            }
            finally {
                client.release();
            }
        }
        catch (error) {
            this.results.addFailure(filename, error.message);
            Logger.error(`Failed to process ${filename}:`, error);
        }
    }
    // Process all files in directory
    async processDirectory(directoryPath) {
        try {
            const files = await fs.readdir(directoryPath);
            const jsonFiles = files.filter(file => file.endsWith('.json') || file.endsWith('.txt'));
            Logger.info(`Found ${jsonFiles.length} files to process`);
            for (const file of jsonFiles) {
                const filePath = path.join(directoryPath, file);
                await this.processDocument(filePath);
            }
            return this.results.getSummary();
        }
        catch (error) {
            Logger.error('Failed to read directory:', error);
            throw error;
        }
    }
}
exports.DocumentProcessor = DocumentProcessor;
async function main() {
    const args = process.argv.slice(2);
    if (args.length === 0) {
        console.log('Usage: ts-node import-documents.ts <directory-path>');
        console.log('Environment variables:');
        console.log('  DB_HOST     - PostgreSQL host (default: localhost)');
        console.log('  DB_PORT     - PostgreSQL port (default: 5433)');
        console.log('  DB_NAME     - Database name (default: lawyers)');
        console.log('  DB_USER     - Database user (default: postgres)');
        console.log('  DB_PASSWORD - Database password');
        process.exit(1);
    }
    const directoryPath = args[0];
    // Verify directory exists
    try {
        const stats = await fs.stat(directoryPath);
        if (!stats.isDirectory()) {
            Logger.error(`${directoryPath} is not a directory`);
            process.exit(1);
        }
    }
    catch (error) {
        Logger.error(`Directory ${directoryPath} does not exist`);
        process.exit(1);
    }
    // Test database connection
    try {
        await pool.query('SELECT NOW()');
        Logger.info('Database connection successful');
    }
    catch (error) {
        Logger.error('Database connection failed:', error);
        process.exit(1);
    }
    // Process documents
    const processor = new DocumentProcessor();
    try {
        const summary = await processor.processDirectory(directoryPath);
        // Print summary
        console.log('\n=== Import Summary ===');
        console.log(`Total files processed: ${summary.total}`);
        console.log(`Successful imports: ${summary.successful}`);
        console.log(`Failed imports: ${summary.failed}`);
        if (summary.failures.length > 0) {
            console.log('\nFailures:');
            summary.failures.forEach(failure => {
                console.log(`  - ${failure.filename}: ${failure.reason}`);
            });
        }
        if (summary.warnings.length > 0) {
            console.log('\nWarnings:');
            summary.warnings.forEach(warning => {
                console.log(`  - ${warning.filename}: ${warning.warning}`);
            });
        }
    }
    catch (error) {
        Logger.error('Import process failed:', error);
        process.exit(1);
    }
    finally {
        await pool.end();
    }
}
// Run if executed directly
if (require.main === module) {
    main().catch(error => {
        Logger.error('Unhandled error:', error);
        process.exit(1);
    });
}
