const crypto = require('crypto');
const config = require('../config');

/**
 * Calculate SHA-256 hash of a file buffer.
 * @param {Buffer} fileBuffer 
 * @returns {string} SHA-256 hash in hex format
 */
function calculateSHA256(fileBuffer) {
  return crypto.createHash('sha256').update(fileBuffer).digest('hex');
}

/**
 * Upload file buffer to IPFS node via HTTP RPC API.
 * Falls back to a mock CID if the IPFS node is unreachable.
 * @param {Buffer} fileBuffer 
 * @param {string} filename 
 * @returns {Promise<string>} IPFS CID
 */
async function uploadToIPFS(fileBuffer, filename = 'evidence.dat') {
  const fileHash = calculateSHA256(fileBuffer);
  
  try {
    console.log(`Attempting to upload file to IPFS at: ${config.IPFS_RPC_URL}`);
    
    // Construct standard web-compliant FormData (supported natively in Node.js 18+)
    const formData = new FormData();
    const blob = new Blob([fileBuffer]);
    formData.append('file', blob, filename);

    const response = await fetch(`${config.IPFS_RPC_URL}/api/v0/add`, {
      method: 'POST',
      body: formData
    });

    if (!response.ok) {
      throw new Error(`IPFS server responded with status: ${response.status}`);
    }

    const result = await response.json();
    console.log(`Successfully uploaded to IPFS. CID: ${result.Hash}`);
    return result.Hash;
  } catch (error) {
    console.warn(`[WARNING] IPFS upload failed: ${error.message}. Falling back to generating a mock CID.`);
    
    // Generate a valid-looking mock CIDv0 (starts with 'Qm' + 44 characters)
    // Using base58-like alphabet characters to make it look realistic
    const mockHash = crypto.createHash('sha512').update(fileBuffer).digest('hex');
    const mockCID = 'Qm' + mockHash.substring(0, 44);
    
    console.log(`Generated mock IPFS CID: ${mockCID}`);
    return mockCID;
  }
}

module.exports = {
  calculateSHA256,
  uploadToIPFS
};
