# Legal Documents Import System

A comprehensive system for importing legal documents from S3 zip files into a PostgreSQL database with robust error handling and progress tracking.

## Features

- **S3 Batch Processing**: Automatically download and process zip files from S3 buckets
- **Progress Tracking**: Resume processing from the last successfully processed file
- **Error Recovery**: Continue processing even if individual files fail
- **State Management**: Persistent state tracking with detailed reporting
- **Zip File Handling**: Automatic extraction and cleanup of zip files
- **Database Integration**: Direct import into PostgreSQL with transaction safety

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment Variables

Copy the example environment file and configure your settings:

```bash
cp .env.example .env
```

Edit the `.env` file with your configuration:

```bash
# AWS Configuration
AWS_REGION=us-east-2
AWS_ACCESS_KEY_ID=your-access-key-id
AWS_SECRET_ACCESS_KEY=your-secret-access-key

# S3 Configuration
S3_BUCKET=your-s3-bucket-name
S3_PREFIX=legal-documents/

# Database Configuration
DB_HOST=localhost
DB_PORT=5433
DB_NAME=lawyers
DB_USER=postgres
DB_PASSWORD=strongpassword
```

**Alternative: AWS CLI or IAM Roles**
- **AWS CLI**: Run `aws configure` (no need to set AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY in .env)
- **IAM Roles**: For EC2/ECS deployment (no credentials needed in .env)

### 3. Start Processing

```bash
# Process all zip files from S3 bucket
npm run import:s3 process

# Check processing status
npm run import:s3 status

# Reset processing state (start from beginning)
npm run import:s3 reset
```

## Commands

### S3 Batch Processor

```bash
# Process zip files from S3 (uses .env configuration)
npm run import:s3 process

# Show current status
npm run import:s3 status

# Reset processing state
npm run import:s3 reset
```

### State Manager

```bash
# Show detailed status
npm run state status

# Backup current state
npm run state backup

# Export processing report
npm run state export

# Set last processed file manually
npm run state set-last filename.zip

# Reset state
npm run state reset
```

### Local Document Processing

```bash
# Process local directory
npm run import /path/to/documents
```

## How It Works

### Processing Flow

1. **List S3 Files**: Retrieves all zip files from the specified S3 bucket/prefix
2. **Resume Logic**: Skips files that have already been processed (based on saved state)
3. **Download**: Downloads the next zip file to local `zipped/` directory
4. **Extract**: Extracts zip contents to `documents/` directory
5. **Process**: Imports all JSON/TXT files into the database
6. **Cleanup**: Removes all files from both directories
7. **Update State**: Saves progress and moves to next file
8. **Repeat**: Continues until all files are processed

### State Tracking

The system maintains a `processing-state.json` file that tracks:

- Last successfully processed zip file
- Total files and documents processed
- Success/failure counts
- Error details with timestamps
- Processing start and update times

### Error Handling

- **File-level errors**: Individual zip files that fail are logged but don't stop the entire process
- **Document-level errors**: Individual documents that fail are logged in the processing summary
- **Network errors**: Automatic retry logic for S3 operations
- **Database errors**: Transaction rollback ensures data consistency

## Directory Structure

```
├── src/
│   ├── import-documents.ts      # Core document processing logic
│   ├── s3-batch-processor.ts    # S3 batch processing system
│   └── state-manager.ts         # State management utilities
├── documents/                   # Temporary extraction directory
├── zipped/                      # Temporary download directory
├── processing-state.json        # Processing state (auto-generated)
└── s3-config.example.json       # Example S3 configuration
```

## Configuration

### Environment Configuration

All configuration is managed through the `.env` file. Copy `.env.example` to `.env` and update with your values:

```bash
# AWS Configuration
AWS_REGION=us-east-2
AWS_ACCESS_KEY_ID=your-access-key-id
AWS_SECRET_ACCESS_KEY=your-secret-access-key

# S3 Configuration
S3_BUCKET=your-s3-bucket-name
S3_PREFIX=legal-documents/

# Database Configuration
DB_HOST=localhost
DB_PORT=5433
DB_NAME=lawyers
DB_USER=postgres
DB_PASSWORD=strongpassword
```

### Environment Variables

- `AWS_REGION`: AWS region (default: us-east-1)
- `AWS_ACCESS_KEY_ID`: AWS access key
- `AWS_SECRET_ACCESS_KEY`: AWS secret key
- `DB_HOST`: PostgreSQL host
- `DB_PORT`: PostgreSQL port
- `DB_NAME`: Database name
- `DB_USER`: Database user
- `DB_PASSWORD`: Database password

## Monitoring and Troubleshooting

### Check Status

```bash
# Quick status
npm run import:s3 status

# Detailed status with error history
npm run state status
```

### Export Reports

```bash
# Export detailed processing report
npm run state export
```

### Resume Processing

If processing is interrupted:

1. Check the current state: `npm run state status`
2. Resume processing: `npm run import:s3 process <bucket> [prefix]`

The system will automatically resume from the last successfully processed file.

### Manual State Management

```bash
# Set a specific starting point
npm run state set-last documents-batch-050.zip

# Backup state before making changes
npm run state backup

# Reset to start over
npm run state reset
```

### Common Issues

**AWS Credentials**
- Ensure AWS credentials are properly configured
- Check IAM permissions for S3 access

**Database Connection**
- Verify database is running and accessible
- Check connection parameters in `src/import-documents.ts`

**Disk Space**
- Ensure sufficient disk space for zip downloads and extraction
- Large zip files are cleaned up after processing

**Memory Usage**
- Processing very large zip files may require increased Node.js memory
- Use `--max-old-space-size=4096` if needed

## Production Deployment

### Build for Production

```bash
npm run build
```

### Run in Production

```bash
# Use compiled JavaScript
npm run import:s3:prod process <bucket> [prefix]
npm run state:prod status
```

### Docker Deployment

Example Dockerfile:

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY dist/ ./dist/
CMD ["node", "dist/s3-batch-processor.js", "process"]
```

## License

ISC
