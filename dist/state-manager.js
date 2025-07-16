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
exports.StateManager = void 0;
const fs = __importStar(require("fs/promises"));
const path = __importStar(require("path"));
class StateManager {
    constructor(stateFilePath) {
        this.stateFilePath = stateFilePath || path.join(process.cwd(), 'processing-state.json');
    }
    async loadState() {
        try {
            const stateData = await fs.readFile(this.stateFilePath, 'utf-8');
            return JSON.parse(stateData);
        }
        catch (error) {
            return null;
        }
    }
    async showDetailedStatus() {
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
        if (state.errors.length > 0) {
            console.log('\n❌ Error Details:');
            console.log('-'.repeat(50));
            state.errors.forEach((error, index) => {
                console.log(`${index + 1}. File: ${error.zipFile}`);
                console.log(`   Error: ${error.error}`);
                console.log(`   Time: ${new Date(error.timestamp).toLocaleString()}`);
                console.log('');
            });
        }
    }
    async setLastProcessedFile(fileName) {
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
    async resetState() {
        const newState = {
            lastProcessedFile: null,
            totalFilesProcessed: 0,
            totalDocumentsProcessed: 0,
            totalDocumentsSuccessful: 0,
            totalDocumentsFailed: 0,
            startTime: new Date().toISOString(),
            lastUpdateTime: new Date().toISOString(),
            errors: []
        };
        await fs.writeFile(this.stateFilePath, JSON.stringify(newState, null, 2));
        console.log('✅ Processing state has been reset');
    }
    async backupState() {
        const state = await this.loadState();
        if (!state) {
            console.log('❌ No state to backup');
            return;
        }
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupPath = path.join(path.dirname(this.stateFilePath), `processing-state-backup-${timestamp}.json`);
        await fs.writeFile(backupPath, JSON.stringify(state, null, 2));
        console.log(`✅ State backed up to: ${backupPath}`);
    }
    async exportReport() {
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
                totalErrors: state.errors.length
            },
            errors: state.errors,
            generatedAt: new Date().toISOString()
        };
        await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
        console.log(`✅ Report exported to: ${reportPath}`);
    }
}
exports.StateManager = StateManager;
async function main() {
    const args = process.argv.slice(2);
    if (args.length === 0) {
        console.log('Usage: ts-node state-manager.ts <command> [options]');
        console.log('');
        console.log('Commands:');
        console.log('  status                     - Show detailed processing status');
        console.log('  reset                      - Reset processing state');
        console.log('  backup                     - Backup current state');
        console.log('  export                     - Export processing report');
        console.log('  set-last <filename>        - Set last processed file');
        console.log('');
        console.log('Examples:');
        console.log('  ts-node state-manager.ts status');
        console.log('  ts-node state-manager.ts set-last documents-batch-001.zip');
        console.log('  ts-node state-manager.ts backup');
        process.exit(1);
    }
    const command = args[0];
    const stateManager = new StateManager();
    try {
        switch (command) {
            case 'status':
                await stateManager.showDetailedStatus();
                break;
            case 'reset':
                await stateManager.resetState();
                break;
            case 'backup':
                await stateManager.backupState();
                break;
            case 'export':
                await stateManager.exportReport();
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
                process.exit(1);
        }
    }
    catch (error) {
        console.error('💥 Command failed:', error);
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
