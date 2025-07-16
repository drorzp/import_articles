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
Object.defineProperty(exports, "__esModule", { value: true });
exports.S3BatchProcessor = void 0;
const fs = __importStar(require("fs/promises"));
const path = __importStar(require("path"));
const client_s3_1 = require("@aws-sdk/client-s3");
const yauzl = __importStar(require("yauzl"));
const rimraf_1 = require("rimraf");
const import_documents_1 = require("./import-documents");
const dotenv = __importStar(require("dotenv"));
// Load environment variables
dotenv.config();
class S3BatchProcessor {
    constructor(config) {
        this.config = config;
        this.s3Client = new client_s3_1.S3Client({
            region: config.region,
            credentials: config.accessKeyId && config.secretAccessKey ? {
                accessKeyId: config.accessKeyId,
                secretAccessKey: config.secretAccessKey
            } : undefined
        });
        this.stateFilePath = path.join(process.cwd(), 'processing-state.json');
        this.documentsDir = path.join(process.cwd(), 'documents');
        this.zippedDir = path.join(process.cwd(), 'zipped');
        this.state = {
            lastProcessedFile: null,
            totalFilesProcessed: 0,
            totalDocumentsProcessed: 0,
            totalDocumentsSuccessful: 0,
            totalDocumentsFailed: 0,
            startTime: new Date().toISOString(),
            lastUpdateTime: new Date().toISOString(),
            errors: []
        };
    }
    async loadState() {
        try {
            const stateData = await fs.readFile(this.stateFilePath, 'utf-8');
            this.state = JSON.parse(stateData);
            console.log(`📋 Loaded processing state. Last processed: ${this.state.lastProcessedFile || 'none'}`);
        }
        catch (error) {
            console.log('📋 No existing state found, starting fresh');
        }
    }
    async saveState() {
        this.state.lastUpdateTime = new Date().toISOString();
        await fs.writeFile(this.stateFilePath, JSON.stringify(this.state, null, 2));
    }
    async ensureDirectories() {
        await fs.mkdir(this.documentsDir, { recursive: true });
        await fs.mkdir(this.zippedDir, { recursive: true });
    }
    async listS3ZipFiles() {
        const command = new client_s3_1.ListObjectsV2Command({
            Bucket: this.config.bucket,
            Prefix: this.config.prefix || '',
            MaxKeys: 1000
        });
        const response = await this.s3Client.send(command);
        const zipFiles = [];
        if (response.Contents) {
            for (const object of response.Contents) {
                if (object.Key && object.Key.toLowerCase().endsWith('.zip')) {
                    zipFiles.push({
                        key: object.Key,
                        size: object.Size || 0,
                        lastModified: object.LastModified || new Date()
                    });
                }
            }
        }
        // Sort by key to ensure consistent processing order
        zipFiles.sort((a, b) => a.key.localeCompare(b.key));
        console.log(`📦 Found ${zipFiles.length} zip files in S3`);
        return zipFiles;
    }
    async downloadZipFile(zipFileInfo) {
        const fileName = path.basename(zipFileInfo.key);
        const localPath = path.join(this.zippedDir, fileName);
        console.log(`⬇️  Downloading ${zipFileInfo.key} (${(zipFileInfo.size / 1024 / 1024).toFixed(2)} MB)`);
        const command = new client_s3_1.GetObjectCommand({
            Bucket: this.config.bucket,
            Key: zipFileInfo.key
        });
        const response = await this.s3Client.send(command);
        if (!response.Body) {
            throw new Error(`No body in S3 response for ${zipFileInfo.key}`);
        }
        const stream = response.Body;
        const writeStream = await fs.open(localPath, 'w');
        try {
            for await (const chunk of stream) {
                await writeStream.write(chunk);
            }
        }
        finally {
            await writeStream.close();
        }
        console.log(`✅ Downloaded ${fileName}`);
        return localPath;
    }
    async extractZipFile(zipPath) {
        return new Promise((resolve, reject) => {
            yauzl.open(zipPath, { lazyEntries: true }, (err, zipfile) => {
                if (err) {
                    reject(err);
                    return;
                }
                if (!zipfile) {
                    reject(new Error('Failed to open zip file'));
                    return;
                }
                let extractedCount = 0;
                let totalEntries = 0;
                zipfile.readEntry();
                zipfile.on('entry', async (entry) => {
                    totalEntries++;
                    if (/\/$/.test(entry.fileName)) {
                        // Directory entry
                        zipfile.readEntry();
                        return;
                    }
                    // File entry
                    const outputPath = path.join(this.documentsDir, entry.fileName);
                    // Ensure directory exists
                    await fs.mkdir(path.dirname(outputPath), { recursive: true });
                    zipfile.openReadStream(entry, (err, readStream) => {
                        if (err) {
                            reject(err);
                            return;
                        }
                        if (!readStream) {
                            reject(new Error('Failed to create read stream'));
                            return;
                        }
                        const writeStream = require('fs').createWriteStream(outputPath);
                        readStream.on('end', () => {
                            extractedCount++;
                            zipfile.readEntry();
                        });
                        readStream.on('error', reject);
                        writeStream.on('error', reject);
                        readStream.pipe(writeStream);
                    });
                });
                zipfile.on('end', () => {
                    console.log(`📂 Extracted ${extractedCount} files from zip`);
                    resolve();
                });
                zipfile.on('error', reject);
            });
        });
    }
    async cleanupDirectories() {
        console.log('🧹 Cleaning up directories...');
        try {
            await (0, rimraf_1.rimraf)(this.documentsDir);
            await (0, rimraf_1.rimraf)(this.zippedDir);
            await this.ensureDirectories();
            console.log('✅ Directories cleaned');
        }
        catch (error) {
            console.error('❌ Error cleaning directories:', error);
            throw error;
        }
    }
    async processDocuments() {
        console.log('📄 Processing documents...');
        const processor = new import_documents_1.DocumentProcessor();
        const summary = await processor.processDirectory(this.documentsDir);
        console.log(`📊 Processing complete: ${summary.successful}/${summary.total} successful`);
        return summary;
    }
    shouldProcessFile(zipFileInfo) {
        if (!this.state.lastProcessedFile) {
            return true; // No previous processing, start from beginning
        }
        // Only process files that come after the last processed file (alphabetically)
        return zipFileInfo.key > this.state.lastProcessedFile;
    }
    async processZipFile(zipFileInfo) {
        console.log(`\n🔄 Processing ${zipFileInfo.key}...`);
        try {
            // Download zip file
            const localZipPath = await this.downloadZipFile(zipFileInfo);
            // Extract zip file
            await this.extractZipFile(localZipPath);
            // Process documents
            const summary = await this.processDocuments();
            // Update state
            this.state.lastProcessedFile = zipFileInfo.key;
            this.state.totalFilesProcessed++;
            this.state.totalDocumentsProcessed += summary.total;
            this.state.totalDocumentsSuccessful += summary.successful;
            this.state.totalDocumentsFailed += summary.failed;
            // Save state after each successful zip file
            await this.saveState();
            console.log(`✅ Successfully processed ${zipFileInfo.key}`);
            console.log(`📈 Progress: ${this.state.totalFilesProcessed} zip files, ${this.state.totalDocumentsSuccessful}/${this.state.totalDocumentsProcessed} documents successful`);
        }
        catch (error) {
            console.error(`❌ Error processing ${zipFileInfo.key}:`, error.message);
            // Record error but continue with next file
            this.state.errors.push({
                zipFile: zipFileInfo.key,
                error: error.message,
                timestamp: new Date().toISOString()
            });
            await this.saveState();
            throw error; // Re-throw to be handled by caller
        }
        finally {
            // Always cleanup after processing each zip file
            await this.cleanupDirectories();
        }
    }
    async processAllZipFiles() {
        console.log('🚀 Starting S3 batch processing...');
        try {
            // Load previous state
            await this.loadState();
            // Ensure directories exist
            await this.ensureDirectories();
            // Get list of zip files from S3
            const zipFiles = await this.listS3ZipFiles();
            if (zipFiles.length === 0) {
                console.log('📭 No zip files found in S3');
                return;
            }
            // Filter files to process (skip already processed ones)
            const filesToProcess = zipFiles.filter(file => this.shouldProcessFile(file));
            if (filesToProcess.length === 0) {
                console.log('✅ All zip files have already been processed');
                return;
            }
            console.log(`📋 ${filesToProcess.length} zip files to process (${zipFiles.length - filesToProcess.length} already processed)`);
            // Process each zip file
            for (const zipFile of filesToProcess) {
                try {
                    await this.processZipFile(zipFile);
                }
                catch (error) {
                    console.error(`⚠️  Skipping ${zipFile.key} due to error, continuing with next file...`);
                    // Continue with next file even if current one fails
                }
            }
            // Final summary
            console.log('\n🎉 Batch processing complete!');
            console.log(`📊 Final Summary:`);
            console.log(`   - Zip files processed: ${this.state.totalFilesProcessed}`);
            console.log(`   - Documents processed: ${this.state.totalDocumentsProcessed}`);
            console.log(`   - Documents successful: ${this.state.totalDocumentsSuccessful}`);
            console.log(`   - Documents failed: ${this.state.totalDocumentsFailed}`);
            console.log(`   - Errors encountered: ${this.state.errors.length}`);
            if (this.state.errors.length > 0) {
                console.log('\n❌ Errors:');
                this.state.errors.forEach(error => {
                    console.log(`   - ${error.zipFile}: ${error.error}`);
                });
            }
        }
        catch (error) {
            console.error('💥 Fatal error in batch processing:', error);
            throw error;
        }
    }
    async resetState() {
        console.log('🔄 Resetting processing state...');
        this.state = {
            lastProcessedFile: null,
            totalFilesProcessed: 0,
            totalDocumentsProcessed: 0,
            totalDocumentsSuccessful: 0,
            totalDocumentsFailed: 0,
            startTime: new Date().toISOString(),
            lastUpdateTime: new Date().toISOString(),
            errors: []
        };
        await this.saveState();
        console.log('✅ State reset complete');
    }
    async showStatus() {
        await this.loadState();
        console.log('\n📊 Current Processing Status:');
        console.log(`   Last processed file: ${this.state.lastProcessedFile || 'none'}`);
        console.log(`   Zip files processed: ${this.state.totalFilesProcessed}`);
        console.log(`   Documents processed: ${this.state.totalDocumentsProcessed}`);
        console.log(`   Documents successful: ${this.state.totalDocumentsSuccessful}`);
        console.log(`   Documents failed: ${this.state.totalDocumentsFailed}`);
        console.log(`   Start time: ${this.state.startTime}`);
        console.log(`   Last update: ${this.state.lastUpdateTime}`);
        console.log(`   Errors: ${this.state.errors.length}`);
        if (this.state.errors.length > 0) {
            console.log('\n❌ Recent Errors:');
            this.state.errors.slice(-5).forEach(error => {
                console.log(`   - ${error.zipFile}: ${error.error}`);
            });
        }
    }
}
exports.S3BatchProcessor = S3BatchProcessor;
async function main() {
    const args = process.argv.slice(2);
    if (args.length === 0) {
        console.log('Usage: ts-node s3-batch-processor.ts <command>');
        console.log('');
        console.log('Commands:');
        console.log('  process                    - Process all zip files from S3 bucket');
        console.log('  status                     - Show current processing status');
        console.log('  reset                      - Reset processing state');
        console.log('');
        console.log('Configuration (via .env file or environment variables):');
        console.log('  AWS_REGION                 - AWS region (default: us-east-1)');
        console.log('  AWS_ACCESS_KEY_ID          - AWS access key (optional if using IAM roles)');
        console.log('  AWS_SECRET_ACCESS_KEY      - AWS secret key (optional if using IAM roles)');
        console.log('  S3_BUCKET                  - S3 bucket name (required)');
        console.log('  S3_PREFIX                  - S3 prefix/folder (optional)');
        console.log('');
        console.log('Examples:');
        console.log('  ts-node s3-batch-processor.ts process');
        console.log('  ts-node s3-batch-processor.ts status');
        console.log('  ts-node s3-batch-processor.ts reset');
        process.exit(1);
    }
    const command = args[0];
    // Read configuration from environment variables
    const config = {
        region: process.env.AWS_REGION || 'us-east-1',
        bucket: process.env.S3_BUCKET || '',
        prefix: process.env.S3_PREFIX || '',
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    };
    // Validate required configuration
    if (!config.bucket) {
        console.error('❌ S3_BUCKET environment variable is required');
        console.error('💡 Please set S3_BUCKET in your .env file or environment variables');
        process.exit(1);
    }
    console.log(`🔧 Configuration:`);
    console.log(`   Region: ${config.region}`);
    console.log(`   Bucket: ${config.bucket}`);
    console.log(`   Prefix: ${config.prefix || '(none)'}`);
    console.log(`   Using AWS credentials: ${config.accessKeyId ? 'Yes (from env)' : 'No (using IAM/default)'}`);
    console.log('');
    const processor = new S3BatchProcessor(config);
    try {
        switch (command) {
            case 'process':
                await processor.processAllZipFiles();
                break;
            case 'status':
                await processor.showStatus();
                break;
            case 'reset':
                await processor.resetState();
                break;
            default:
                console.error(`❌ Unknown command: ${command}`);
                process.exit(1);
        }
    }
    catch (error) {
        console.error('💥 Process failed:', error);
        process.exit(1);
    }
}
// Run if executed directly
if (require.main === module) {
    main().catch(error => {
        console.error('💥 Unhandled error:', error);
        process.exit(1);
    });
}
