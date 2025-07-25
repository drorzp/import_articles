import * as fs from 'fs/promises';
import * as path from 'path';
import { Pool, PoolClient, PoolConfig } from 'pg';
import Ajv, { ValidateFunction } from 'ajv';
import addFormats from 'ajv-formats';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

interface DocumentMetadata {
  document_number: string;
  title: string;
  publication_date: string;
  source?: string;
  page_number?: number;
  dossier_number?: string;
  effective_date?: string;
  language: string;
  document_type: string
  status: string
  official_justel_url?: string;
  official_publication_pdf_url?: string;
  consolidated_pdf_url?: string;
  version_info?: VersionInfo;
}

interface VersionInfo {
  archived_versions_count?: number;
  archived_versions_url?: string;
  execution_orders_count?: number;
  execution_orders_url?: string;
}

interface HierarchyElement {
  type:string
  label: string;
  metadata?: {
    title_type?: string;
    title_content?: string;
    article_range?: string;
    rank?: number;
  };
  children?: HierarchyElement[];
  article_content?: ArticleContent;
  footnotes?: Footnote[];
  footnote_references?: FootnoteReference[];
}

interface ArticleContent {
  article_number: string;
  anchor_id?: string;
  content: {
    main_text: string;
    numbered_provisions?: NumberedProvision[];
  };
}

interface NumberedProvision {
  number?: string;
  text: string;
}

interface Footnote {
  footnote_number: string;
  footnote_content: string;
  law_reference?: LawReference;
  effective_date?: string;
  modification_type?: string
  direct_url?: string;
  direct_article_url?: string;
}

interface LawReference {
  law_type?:string;
  date_reference?: string;
  article_number?: string;
  sequence_number?: string;
  full_reference?: string;
}

interface FootnoteReference {
  reference_number: string;
  text_position: number;
  referenced_text: string;
  bracket_pattern?: string;
  embedded_law_references?: any[];
}

interface DocumentModification {
  modification_type: string;
  modification_date: string;
  publication_date: string;
  modified_articles?: string[];
  source_url?: string;
  full_title: string;
}

interface References {
  modifies?: any[];
  modified_by?: DocumentModification[];
}

interface ExternalLinks {
  official_links?: string[];
  parliamentary_work?: string[];
}

interface ExtractionMetadata {
  extraction_date: string;
  source_file?: string;
  sections_included?: string[];
  sections_excluded?: string[];
  completeness_flags?: {
    all_articles_extracted?: boolean;
    footnotes_linked?: boolean;
    hierarchical_structure_complete?: boolean;
    metadata_complete?: boolean;
    is_minimal_document?: boolean;
  };
}

interface LegalDocument {
  document_metadata: DocumentMetadata;
  document_hierarchy: HierarchyElement[];
  references?: References;
  external_links?: ExternalLinks;
  extraction_metadata?: ExtractionMetadata;
}

// Validation and processing result types
interface ValidationFailure {
  filename: string;
  reason: string;
}

interface ValidationWarning {
  filename: string;
  warning: string;
}

interface ProcessingSummary {
  total: number;
  successful: number;
  failed: number;
  failures: ValidationFailure[];
  warnings: ValidationWarning[];
}

const dbConfig: PoolConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5433'),
  database: process.env.DB_NAME || 'lawyers',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'strongpassword'
};
const pool = new Pool(dbConfig);
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
  static info(message: string, data: any = {}): void {
    console.log(`[INFO] ${new Date().toISOString()} - ${message}`, data);
  }

  static error(message: string, error: any = {}): void {
    console.error(`[ERROR] ${new Date().toISOString()} - ${message}`, error);
  }

  static success(message: string, data: any = {}): void {
    console.log(`[SUCCESS] ${new Date().toISOString()} - ${message}`, data);
  }

  static warning(message: string, data: any = {}): void {
    console.warn(`[WARNING] ${new Date().toISOString()} - ${message}`, data);
  }
}

class ValidationResults {
  private processed: number = 0;
  private successful: number = 0;
  private failed: ValidationFailure[] = [];
  private warnings: ValidationWarning[] = [];

  addSuccess(filename: string): void {
    this.processed++;
    this.successful++;
  }

  addFailure(filename: string, reason: string): void {
    this.processed++;
    this.failed.push({ filename, reason });
  }

  addWarning(filename: string, warning: string): void {
    this.warnings.push({ filename, warning });
  }

  getSummary(): ProcessingSummary {
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
  private static convertDateFormat(dateString: string | null | undefined): string | null {
    if (!dateString) return null;
    
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
  static async insertDocument(client: PoolClient, metadata: DocumentMetadata): Promise<number> {
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
  static async insertVersionInfo(client: PoolClient, documentId: number, versionInfo?: VersionInfo): Promise<void> {
    if (!versionInfo) return;

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
  static async insertHierarchyElement(
    client: PoolClient, 
    documentId: number, 
    element: HierarchyElement, 
    document_number: string,
    parentId: number | null = null, 
    rank: number = 1
  ): Promise<number> {
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
      const parentResult = await client.query(
        'SELECT level, path FROM hierarchy_elements WHERE id = $1',
        [parentId]
      );
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
    const footnoteIdMap = new Map<string, number>();

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
  static async insertArticleContent(client: PoolClient, hierarchyElementId: number, content: ArticleContent, document_number: string): Promise<void> {
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
  static async insertNumberedProvision(
    client: PoolClient, 
    articleContentId: number, 
    provision: NumberedProvision, 
    orderIndex: number
  ): Promise<void> {
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
  static async insertFootnote(client: PoolClient, hierarchyElementId: number, footnote: Footnote): Promise<number> {
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
  static async insertFootnoteReference(
    client: PoolClient, 
    hierarchyElementId: number,
    footnoteId: number,
    reference: FootnoteReference
  ): Promise<void> {
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
  static async insertModifications(client: PoolClient, documentId: number, references?: References): Promise<void> {
    if (!references) return;

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
  static async insertDocumentModifies(client: PoolClient, documentId: number, modification: any): Promise<void> {
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
  static async insertDocumentModifiedBy(
    client: PoolClient, 
    documentId: number, 
    modification: DocumentModification
  ): Promise<void> {
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
  static async insertModifiedArticle(client: PoolClient, modificationId: number, articleNumber: string): Promise<void> {
    // Check if article number contains special note
    let number = articleNumber;
    let note: string | null = null;
    
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
  static async insertExternalLinks(client: PoolClient, documentId: number, externalLinks?: ExternalLinks): Promise<void> {
    if (!externalLinks) return;

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
  static async insertExternalLink(
    client: PoolClient, 
    documentId: number, 
    linkType: string, 
    link: any, 
    orderIndex: number
  ): Promise<void> {
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
  static async insertExtractionMetadata(
    client: PoolClient, 
    documentId: number, 
    metadata?: ExtractionMetadata
  ): Promise<void> {
    if (!metadata) return;

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
class DocumentProcessor {
  private results: ValidationResults;
  private validator: ValidateFunction<LegalDocument>;

  constructor() {
    this.results = new ValidationResults();
    
    // Initialize AJV for JSON validation
    const ajv = new Ajv({ allErrors: true });
    addFormats(ajv);
    this.validator = ajv.compile<LegalDocument>(documentSchema);
  }

  // Validate document structure
  private validateDocument(data: any, filename: string): data is LegalDocument {
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
  async processDocument(filePath: string): Promise<void> {
    const filename = path.basename(filePath);
    Logger.info(`Processing file: ${filename}`);

    try {
      // Read and parse file
      const fileContent = await fs.readFile(filePath, 'utf8');
      let data: any;

      try {
        data = JSON.parse(fileContent);
      } catch (parseError: any) {
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

      } catch (dbError: any) {
        await client.query('ROLLBACK');
        throw dbError;
      } finally {
        client.release();
      }

    } catch (error: any) {
      this.results.addFailure(filename, error.message);
      Logger.error(`Failed to process ${filename}:`, error);
    }
  }

  // Process all files in directory
  async processDirectory(directoryPath: string): Promise<ProcessingSummary> {
    try {
      const files = await fs.readdir(directoryPath);

      // Remove any files ending with _tables.json before processing
      for (const file of files) {
        if (file.endsWith('_tables.json')) {
          const fileToDelete = path.join(directoryPath, file);
          try {
            await fs.unlink(fileToDelete);
            Logger.info(`Deleted ignored file: ${file}`);
          } catch (deleteErr: any) {
            Logger.warning(`Failed to delete ignored file ${file}`, { error: deleteErr });
          }
        }
      }
      
      const jsonFiles = files.filter(file => 
        (file.endsWith('.json') || file.endsWith('.txt')) && !file.endsWith('_tables.json')
      );

      Logger.info(`Found ${jsonFiles.length} files to process`);

      for (const file of jsonFiles) {
        const filePath = path.join(directoryPath, file);
        await this.processDocument(filePath);
      }

      return this.results.getSummary();

    } catch (error) {
      Logger.error('Failed to read directory:', error);
      throw error;
    }
  }
}
async function main(): Promise<void> {
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
  } catch (error) {
    Logger.error(`Directory ${directoryPath} does not exist`);
    process.exit(1);
  }

  // Test database connection
  try {
    await pool.query('SELECT NOW()');
    Logger.info('Database connection successful');
  } catch (error) {
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

  } catch (error) {
    Logger.error('Import process failed:', error);
    process.exit(1);
  } finally {
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

export { DocumentProcessor, DatabaseOperations, LegalDocument, ProcessingSummary };