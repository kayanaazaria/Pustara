// Initialize Azure Blob Storage container
require('dotenv').config();
const { Client } = require('pg');
const azureBlob = require('../providers/azureBlobProvider');

const connectionString = process.env.DATABASE_URL;
const client = new Client({ connectionString });

async function initializeAzureBlob() {
  try {
    // 1. Initialize Azure Blob container
    console.log('🔷 Initializing Azure Blob Storage...');
    await azureBlob.initializeContainer();

    // 2. Connect to database
    await client.connect();
    console.log('✓ Connected to Neon database');

    // 3. Add file_url column to books table (if not exists)
    console.log('📝 Adding file_url column to books table...');
    await client.query(`
      ALTER TABLE books
      ADD COLUMN IF NOT EXISTS file_url TEXT,
      ADD COLUMN IF NOT EXISTS file_size BIGINT,
      ADD COLUMN IF NOT EXISTS file_type VARCHAR(50) DEFAULT 'pdf'
    `);
    console.log('✓ Books table updated');

    // 4. Verify container and list files
    console.log('\n📦 Azure Blob Storage Status:');
    const files = await azureBlob.listFiles();
    console.log(`✓ Container has ${files.length} files`);
    if (files.length > 0) {
      console.log('📄 Files in container:');
      files.forEach(file => {
        console.log(`   - ${file.name} (${(file.size / 1024).toFixed(2)} KB)`);
      });
    }

    console.log('\n✅ Azure Blob Storage initialized successfully!');
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

initializeAzureBlob();
