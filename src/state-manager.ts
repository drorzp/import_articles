import * as fs from 'fs/promises';
import * as path from 'path';

interface ZipFileResult {
  fileName: string;
  processedAt: string;
  documentsProcessed: number;
  documentsSuccessful: number;
  documentsFailed: number;
  successRate: string;
  processingTimeMs: number;
  errors: Array<{
    documentPath: string;
    error: string;
    timestamp: string;
  }>;
}

interface ProcessingState {
  lastProcessedFile: string | null;
  totalFilesProcessed: number;
  totalDocumentsProcessed: number;
  totalDocumentsSuccessful: number;
  totalDocumentsFailed: number;
  startTime: string;
  lastUpdateTime: string;
  errors: Array<{
    zipFile: string;
    error: string;
    timestamp: string;
  }>;
  failedDocuments: Array<{
    zipFile: string;
    documentPath: string;
    error: string;
    timestamp: string;
  }>;
  processedZipFiles: ZipFileResult[];
}

class StateManager {
  private stateFilePath: string;

  constructor(stateFilePath?: string) {
    this.stateFilePath = stateFilePath || path.join(process.cwd(), 'processing-state.json');
  }

  async loadState(): Promise<ProcessingState | null> {
    try {
      const stateData = await fs.readFile(this.stateFilePath, 'utf-8');
      return JSON.parse(stateData);
    } catch (error) {
      return null;
    }
  }

  async showDetailedStatus(): Promise<void> {
    const state = await this.loadState();
    
    if (!state) {
      console.log('📭 No processing state found');
      return;
    }

    console.log('\n📊 Detailed Processing Status:');
    console.log('='.repeat(50));
    console.log(`📁 Last processed file: ${state.lastProcessedFile || 'none'}`);
    console.log(`📦 Zip files processed: ${state.totalFilesProcessed}`);
    console.log(`📄 Total documents processed: ${state.totalDocumentsProcessed}`);
    console.log(`✅ Documents successful: ${state.totalDocumentsSuccessful}`);
    console.log(`❌ Documents failed: ${state.totalDocumentsFailed}`);
    
    if (state.totalDocumentsProcessed > 0) {
      const successRate = ((state.totalDocumentsSuccessful / state.totalDocumentsProcessed) * 100).toFixed(2);
      console.log(`📈 Success rate: ${successRate}%`);
    }
    
    console.log(`🕐 Started: ${new Date(state.startTime).toLocaleString()}`);
    console.log(`🕐 Last updated: ${new Date(state.lastUpdateTime).toLocaleString()}`);
    
    if (state.startTime && state.lastUpdateTime) {
      const duration = new Date(state.lastUpdateTime).getTime() - new Date(state.startTime).getTime();
      const hours = Math.floor(duration / (1000 * 60 * 60));
      const minutes = Math.floor((duration % (1000 * 60 * 60)) / (1000 * 60));
      console.log(`⏱️  Total processing time: ${hours}h ${minutes}m`);
    }
    
    console.log(`⚠️  Errors encountered: ${state.errors.length}`);
    console.log(`📄 Failed documents: ${state.failedDocuments?.length || 0}`);

    if (state.errors.length > 0) {
      console.log('\n❌ Zip File Error Details:');
      console.log('-'.repeat(50));
      state.errors.forEach((error, index) => {
        console.log(`${index + 1}. File: ${error.zipFile}`);
        console.log(`   Error: ${error.error}`);
        console.log(`   Time: ${new Date(error.timestamp).toLocaleString()}`);
        console.log('');
      });
    }

    if (state.failedDocuments && state.failedDocuments.length > 0) {
      console.log('\n📄 Failed Document Details:');
      console.log('-'.repeat(50));
      state.failedDocuments.forEach((failedDoc, index) => {
        console.log(`${index + 1}. Document: ${failedDoc.documentPath}`);
        console.log(`   Zip File: ${failedDoc.zipFile}`);
        console.log(`   Error: ${failedDoc.error}`);
        console.log(`   Time: ${new Date(failedDoc.timestamp).toLocaleString()}`);
        console.log('');
      });
    }

    if (state.processedZipFiles && state.processedZipFiles.length > 0) {
      console.log('\n📦 Processed Zip File Details:');
      console.log('-'.repeat(50));
      state.processedZipFiles.forEach((zipFile, index) => {
        console.log(`${index + 1}. File: ${zipFile.fileName}`);
        console.log(`   Processed at: ${new Date(zipFile.processedAt).toLocaleString()}`);
        console.log(`   Documents processed: ${zipFile.documentsProcessed}`);
        console.log(`   Documents successful: ${zipFile.documentsSuccessful}`);
        console.log(`   Documents failed: ${zipFile.documentsFailed}`);
        console.log(`   Success rate: ${zipFile.successRate}`);
        console.log(`   Processing time: ${zipFile.processingTimeMs}ms`);
        console.log('');
      });
    }
  }

  async setLastProcessedFile(fileName: string): Promise<void> {
    const state = await this.loadState();
    
    if (!state) {
      console.log('❌ No existing state found. Cannot update last processed file.');
      return;
    }

    state.lastProcessedFile = fileName;
    state.lastUpdateTime = new Date().toISOString();
    
    await fs.writeFile(this.stateFilePath, JSON.stringify(state, null, 2));
    console.log(`✅ Updated last processed file to: ${fileName}`);
  }

  async resetState(): Promise<void> {
    const newState: ProcessingState = {
      lastProcessedFile: null,
      totalFilesProcessed: 0,
      totalDocumentsProcessed: 0,
      totalDocumentsSuccessful: 0,
      totalDocumentsFailed: 0,
      startTime: new Date().toISOString(),
      lastUpdateTime: new Date().toISOString(),
      errors: [],
      failedDocuments: [],
      processedZipFiles: []
    };
    
    await fs.writeFile(this.stateFilePath, JSON.stringify(newState, null, 2));
    console.log('✅ Processing state has been reset');
  }

  async backupState(): Promise<void> {
    const state = await this.loadState();
    
    if (!state) {
      console.log('❌ No state to backup');
      return;
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = path.join(
      path.dirname(this.stateFilePath),
      `processing-state-backup-${timestamp}.json`
    );
    
    await fs.writeFile(backupPath, JSON.stringify(state, null, 2));
    console.log(`✅ State backed up to: ${backupPath}`);
  }

  async addDocumentFailure(zipFile: string, documentPath: string, error: string): Promise<void> {
    const state = await this.loadState();
    
    if (!state) {
      console.log('❌ No existing state found. Cannot add document failure.');
      return;
    }

    if (!state.failedDocuments) {
      state.failedDocuments = [];
    }

    state.failedDocuments.push({
      zipFile,
      documentPath,
      error,
      timestamp: new Date().toISOString()
    });
    
    state.lastUpdateTime = new Date().toISOString();
    await fs.writeFile(this.stateFilePath, JSON.stringify(state, null, 2));
  }

  async addZipFileResult(
    fileName: string,
    documentsProcessed: number,
    documentsSuccessful: number,
    documentsFailed: number,
    processingTimeMs: number,
    documentErrors: Array<{ documentPath: string; error: string; timestamp: string }> = []
  ): Promise<void> {
    const state = await this.loadState();
    
    if (!state) {
      console.log('❌ No existing state found. Cannot add zip file result.');
      return;
    }

    if (!state.processedZipFiles) {
      state.processedZipFiles = [];
    }

    const successRate = documentsProcessed > 0 
      ? ((documentsSuccessful / documentsProcessed) * 100).toFixed(2) + '%'
      : '0%';

    state.processedZipFiles.push({
      fileName,
      processedAt: new Date().toISOString(),
      documentsProcessed,
      documentsSuccessful,
      documentsFailed,
      successRate,
      processingTimeMs,
      errors: documentErrors
    });
    
    state.lastUpdateTime = new Date().toISOString();
    await fs.writeFile(this.stateFilePath, JSON.stringify(state, null, 2));
  }

  async exportReport(): Promise<void> {
    const state = await this.loadState();
    
    if (!state) {
      console.log('❌ No state to export');
      return;
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const reportPath = path.join(process.cwd(), `processing-report-${timestamp}.json`);
    
    const report = {
      summary: {
        lastProcessedFile: state.lastProcessedFile,
        totalFilesProcessed: state.totalFilesProcessed,
        totalDocumentsProcessed: state.totalDocumentsProcessed,
        totalDocumentsSuccessful: state.totalDocumentsSuccessful,
        totalDocumentsFailed: state.totalDocumentsFailed,
        successRate: state.totalDocumentsProcessed > 0 
          ? ((state.totalDocumentsSuccessful / state.totalDocumentsProcessed) * 100).toFixed(2) + '%'
          : '0%',
        startTime: state.startTime,
        lastUpdateTime: state.lastUpdateTime,
        totalErrors: state.errors.length,
        totalFailedDocuments: state.failedDocuments?.length || 0
      },
      errors: state.errors,
      failedDocuments: state.failedDocuments || [],
      processedZipFiles: state.processedZipFiles || [],
      generatedAt: new Date().toISOString()
    };
    
    await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
    console.log(`✅ Report exported to: ${reportPath}`);
  }

  async showAllZipFilesReport(): Promise<void> {
    const state = await this.loadState();
    
    if (!state) {
      console.log('📭 No processing state found');
      return;
    }

    console.log('\n📦 COMPREHENSIVE ZIP FILES REPORT');
    console.log('='.repeat(60));
    
    // Overall summary
    console.log('\n📊 OVERALL SUMMARY:');
    console.log(`📁 Total zip files processed: ${state.totalFilesProcessed}`);
    console.log(`📄 Total documents processed: ${state.totalDocumentsProcessed}`);
    console.log(`✅ Total documents successful: ${state.totalDocumentsSuccessful}`);
    console.log(`❌ Total documents failed: ${state.totalDocumentsFailed}`);
    
    if (state.totalDocumentsProcessed > 0) {
      const overallSuccessRate = ((state.totalDocumentsSuccessful / state.totalDocumentsProcessed) * 100).toFixed(2);
      console.log(`📈 Overall success rate: ${overallSuccessRate}%`);
    }
    
    console.log(`🕐 Processing started: ${new Date(state.startTime).toLocaleString()}`);
    console.log(`🕐 Last updated: ${new Date(state.lastUpdateTime).toLocaleString()}`);

    // Individual zip file details
    if (state.processedZipFiles && state.processedZipFiles.length > 0) {
      console.log('\n📦 INDIVIDUAL ZIP FILE RESULTS:');
      console.log('='.repeat(60));
      
      state.processedZipFiles.forEach((zipFile, index) => {
        console.log(`\n${index + 1}. ${zipFile.fileName}`);
        console.log(`   📅 Processed: ${new Date(zipFile.processedAt).toLocaleString()}`);
        console.log(`   📄 Documents: ${zipFile.documentsProcessed} total`);
        console.log(`   ✅ Successful: ${zipFile.documentsSuccessful}`);
        console.log(`   ❌ Failed: ${zipFile.documentsFailed}`);
        console.log(`   📈 Success Rate: ${zipFile.successRate}`);
        console.log(`   ⏱️  Processing Time: ${(zipFile.processingTimeMs / 1000).toFixed(2)}s`);
        
        if (zipFile.errors && zipFile.errors.length > 0) {
          console.log(`   ⚠️  Document Errors: ${zipFile.errors.length}`);
          zipFile.errors.slice(0, 3).forEach((error, errorIndex) => {
            console.log(`      ${errorIndex + 1}. ${error.documentPath}: ${error.error}`);
          });
          if (zipFile.errors.length > 3) {
            console.log(`      ... and ${zipFile.errors.length - 3} more errors`);
          }
        }
      });
    } else {
      console.log('\n📭 No individual zip file results found');
      console.log('   (This might be an older processing state before per-zip tracking was added)');
    }

    // Failed zip files (those that couldn't be processed at all)
    if (state.errors && state.errors.length > 0) {
      console.log('\n❌ FAILED ZIP FILES:');
      console.log('='.repeat(60));
      state.errors.forEach((error, index) => {
        console.log(`${index + 1}. ${error.zipFile}`);
        console.log(`   Error: ${error.error}`);
        console.log(`   Time: ${new Date(error.timestamp).toLocaleString()}`);
        console.log('');
      });
    }

    console.log('\n' + '='.repeat(60));
    console.log('📋 Report completed');
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const stateManager = new StateManager();

  if (args.length === 0) {
    console.log('State Manager - Processing State Management Tool');
    console.log('');
    console.log('Usage: npm run state <command> [options]');
    console.log('');
    console.log('Commands:');
    console.log('  status                     - Show detailed processing status');
    console.log('  reset                      - Reset processing state');
    console.log('  backup                     - Backup current state');
    console.log('  export                     - Export processing report');
    console.log('  all-zip-files              - Show comprehensive report of all zip files');
    console.log('  set-last <filename>        - Set last processed file');
    console.log('');
    console.log('Examples:');
    console.log('  npm run state status');
    console.log('  npm run state reset');
    console.log('  npm run state backup');
    console.log('  npm run state export');
    console.log('  npm run state all-zip-files');
    console.log('  npm run state set-last "some-file.zip"');
    return;
  }

  const command = args[0];

  try {
    switch (command) {
      case 'status':
        await stateManager.showDetailedStatus();
        
      case 'reset':
        await stateManager.resetState();
        break;
        
      case 'backup':
        await stateManager.backupState();
        break;
        
      case 'export':
        await stateManager.exportReport();
        break;
        
      case 'all-zip-files':
        await stateManager.showAllZipFilesReport();
        break;
        
      case 'set-last':
        if (!args[1]) {
          console.error('❌ Filename is required for set-last command');
          process.exit(1);
        }
        await stateManager.setLastProcessedFile(args[1]);
        break;
        
      default:
        console.error(`❌ Unknown command: ${command}`);
        console.log('Run without arguments to see available commands');
        process.exit(1);
    }
  } catch (error: any) {
    console.error('💥 Error:', error.message);
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

export { StateManager };
