// Local Filesystem Storage Provider untuk Development
// Mirrors AzureBlobService interface untuk easy swapping
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const UPLOADS_DIR = path.join(__dirname, '..', 'uploads');
const UPLOADS_URL = process.env.UPLOADS_URL || 'http://localhost:3000/uploads';

class LocalStorageService {
  constructor() {
    // Create uploads directory if not exists
    if (!fs.existsSync(UPLOADS_DIR)) {
      fs.mkdirSync(UPLOADS_DIR, { recursive: true });
      console.log(`✓ Created uploads directory: ${UPLOADS_DIR}`);
    }
  }

  // Initialize storage (no-op untuk local storage)
  async initializeContainer() {
    console.log(`✓ Local storage ready at: ${UPLOADS_DIR}`);
  }

  // Upload file to local filesystem
  async uploadFile(fileName, fileBuffer, fileType = 'application/pdf') {
    try {
      const filePath = path.join(UPLOADS_DIR, fileName);
      
      // Ensure parent directory exists
      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      // Write file to disk
      fs.writeFileSync(filePath, fileBuffer);

      // Return accessible URL
      const fileUrl = `${UPLOADS_URL}/${fileName}`;
      console.log(`✓ File uploaded locally: ${fileName}`);
      return fileUrl;
    } catch (error) {
      console.error('Error uploading file:', error.message);
      throw error;
    }
  }

  // Generate URL for file (same as uploadFile result)
  async generateSasUrl(fileName, expiryHours = 1) {
    try {
      return `${UPLOADS_URL}/${fileName}`;
    } catch (error) {
      console.error('Error generating URL:', error.message);
      throw error;
    }
  }

  // Download file from local filesystem
  async downloadFile(fileName) {
    try {
      const filePath = path.join(UPLOADS_DIR, fileName);
      
      if (!fs.existsSync(filePath)) {
        throw new Error(`File not found: ${fileName}`);
      }

      return fs.createReadStream(filePath);
    } catch (error) {
      console.error('Error downloading file:', error.message);
      throw error;
    }
  }

  // Get file URL
  getFileUrl(fileName) {
    return `${UPLOADS_URL}/${fileName}`;
  }

  // Delete file from local filesystem
  async deleteFile(fileName) {
    try {
      const filePath = path.join(UPLOADS_DIR, fileName);
      
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        console.log(`✓ File deleted: ${fileName}`);
      }
    } catch (error) {
      console.error('Error deleting file:', error.message);
      throw error;
    }
  }

  // List all files in uploads directory
  async listFiles() {
    try {
      const files = [];
      const items = fs.readdirSync(UPLOADS_DIR);
      
      for (const item of items) {
        const itemPath = path.join(UPLOADS_DIR, item);
        const stat = fs.statSync(itemPath);
        
        if (stat.isFile()) {
          files.push({
            name: item,
            size: stat.size,
            created: stat.birthtime,
            url: `${UPLOADS_URL}/${item}`
          });
        }
      }

      return files;
    } catch (error) {
      console.error('Error listing files:', error.message);
      return [];
    }
  }
}

module.exports = new LocalStorageService();
