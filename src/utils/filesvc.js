/**
 * Files.vc Uploader Utility
 * 
 * This file provides a simple wrapper around the files.vc-Uploader module
 * to easily upload files to files.vc from your application.
 */

// Import the uploadFile function from the submodule
const { uploadFile } = require('../../external/filesvc-uploader/lib/uploader');

/**
 * Upload a file to files.vc
 * 
 * @param {string} filePath - Path to the file to upload
 * @param {object} options - Optional configuration
 * @param {string} options.apiKey - Override the API key from .env
 * @param {string} options.accountId - Override the account ID from .env
 * @returns {Promise<{page_url: string, file_url: string}>} - Upload result with URLs
 */
async function uploadToFilesVC(filePath, options = {}) {
  try {
    const result = await uploadFile(filePath, {
      apiKey: options.apiKey, // Will use .env value if not provided
      accountId: options.accountId, // Will use .env value if not provided
      logger: console.log
    });
    
    return {
      page_url: result.page_url,
      file_url: result.file_url
    };
  } catch (error) {
    console.error('File upload failed:', error.message);
    throw error;
  }
}

module.exports = {
  uploadToFilesVC
}; 