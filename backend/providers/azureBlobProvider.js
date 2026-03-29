// Azure Blob Storage service untuk handle book files
const crypto = require('crypto');
const { BlobServiceClient } = require('@azure/storage-blob');
require('dotenv').config();

const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
const containerName = process.env.AZURE_STORAGE_CONTAINER_NAME || 'books';

class AzureBlobService {
  constructor() {
    this.blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
    this.containerClient = this.blobServiceClient.getContainerClient(containerName);
  }

  // Initialize container (create if not exists)
  async initializeContainer() {
    try {
      // Check if container exists
      const exists = await this.containerClient.exists();
      if (!exists) {
        // Create private container (no public access)
        await this.blobServiceClient.createContainer(containerName);
        console.log(`✓ Container '${containerName}' created (private)`);
      } else {
        console.log(`✓ Container '${containerName}' already exists`);
      }
    } catch (error) {
      console.error('Error initializing container:', error.message);
      throw error;
    }
  }

  // Upload file to Azure Blob
  async uploadFile(fileName, fileBuffer, fileType = 'application/pdf') {
    try {
      const blockBlobClient = this.containerClient.getBlockBlobClient(fileName);
      
      await blockBlobClient.uploadData(fileBuffer, {
        blobHTTPHeaders: { blobContentType: fileType }
      });

      const fileUrl = blockBlobClient.url;
      console.log(`✓ File uploaded: ${fileName}`);
      return fileUrl;
    } catch (error) {
      console.error('Error uploading file:', error.message);
      throw error;
    }
  }

  // Generate SAS URL for temporary access
  async generateSasUrl(fileName, expiryHours = 1) {
    try {
      const blockBlobClient = this.containerClient.getBlockBlobClient(fileName);
      
      // For demo, return direct URL (container is public)
      // In production, use SAS tokens for security
      return blockBlobClient.url;
    } catch (error) {
      console.error('Error generating SAS URL:', error.message);
      throw error;
    }
  }

  // Download file from Azure Blob
  async downloadFile(fileName) {
    try {
      const blockBlobClient = this.containerClient.getBlockBlobClient(fileName);
      const downloadBlockBlobResponse = await blockBlobClient.download(0);
      
      return downloadBlockBlobResponse.readableStreamBody;
    } catch (error) {
      console.error('Error downloading file:', error.message);
      if (error.stack) console.error('Stack:', error.stack);
      throw error;
    }
  }

  // Get file URL
  getFileUrl(fileName) {
    const blockBlobClient = this.containerClient.getBlockBlobClient(fileName);
    return blockBlobClient.url;
  }

  // Delete file from Azure Blob
  async deleteFile(fileName) {
    try {
      const blockBlobClient = this.containerClient.getBlockBlobClient(fileName);
      await blockBlobClient.delete();
      console.log(`✓ File deleted: ${fileName}`);
    } catch (error) {
      console.error('Error deleting file:', error.message);
      throw error;
    }
  }

  // List all files in container
  async listFiles() {
    try {
      const files = [];
      for await (const blob of this.containerClient.listBlobsFlat()) {
        files.push({
          name: blob.name,
          size: blob.properties.contentLength,
          url: this.getFileUrl(blob.name)
        });
      }
      return files;
    } catch (error) {
      console.error('Error listing files:', error.message);
      throw error;
    }
  }
}

module.exports = new AzureBlobService();
