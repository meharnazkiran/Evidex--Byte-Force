/**
 * ============================================================================
 * EVIDEX — Person 4: Client-Side Evidence Processing Module
 * ============================================================================
 *
 * Blockchain-based forensic evidence chain-of-custody system for Indian courts.
 *
 * This module handles:
 *   1. SHA-256 hashing of evidence files (tamper detection)
 *   2. AES-256-GCM encryption of files before upload (confidentiality)
 *   3. Uploading encrypted blobs to IPFS via Pinata (decentralised storage)
 *   4. Registering evidence metadata with the backend API
 *   5. Verifying evidence integrity (MATCH / TAMPERED)
 *
 * Zero dependencies — uses only the Web Crypto API (crypto.subtle).
 *
 * @module evidex-core
 * @version 1.0.0
 */

// ─────────────────────────────────────────────────────────────────────────────
// Configuration
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Base URL of the Person 2 backend API.
 * Change this to point at your deployment (e.g. "https://api.evidex.in").
 */
const API_BASE_URL = window.location.origin;

// ─────────────────────────────────────────────────────────────────────────────
// 1. SHA-256 Hashing
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Computes the SHA-256 hash of a File or Blob using the Web Crypto API.
 *
 * The hash is computed over the raw bytes of the file, producing a
 * deterministic 64-character hex string that serves as the digital
 * fingerprint for tamper detection.
 *
 * @param   {File|Blob} file — The evidence file to hash.
 * @returns {Promise<string>} 64-char lowercase hex SHA-256 digest.
 *
 * @example
 *   const hash = await hashFile(selectedFile);
 *   console.log(hash); // "a1b2c3d4e5f6..."
 */
async function hashFile(file) {
  if (!(file instanceof Blob)) {
    throw new TypeError("hashFile() expects a File or Blob instance.");
  }

  // Read the file into an ArrayBuffer
  const buffer = await file.arrayBuffer();

  // Compute SHA-256 digest via Web Crypto
  const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);

  // Convert the raw hash bytes to a hex string
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");

  return hashHex;
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. AES-256-GCM Encryption
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generates a new AES-256-GCM CryptoKey for file encryption.
 *
 * The key is extractable so it can be exported and shared securely
 * with authorised parties (e.g. the investigating officer or court).
 *
 * @returns {Promise<CryptoKey>} A fresh AES-256-GCM key.
 */
async function generateEncryptionKey() {
  return crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    true, // extractable — so we can export it later
    ["encrypt", "decrypt"]
  );
}

/**
 * Exports a CryptoKey to a Base64 string for storage / transmission.
 *
 * @param   {CryptoKey} key — The AES-256 key to export.
 * @returns {Promise<string>} Base64-encoded raw key bytes.
 */
async function exportKey(key) {
  const rawKey = await crypto.subtle.exportKey("raw", key);
  return btoa(String.fromCharCode(...new Uint8Array(rawKey)));
}

/**
 * Imports a Base64-encoded raw key back into a CryptoKey object.
 *
 * @param   {string} base64Key — Base64 string of the raw key bytes.
 * @returns {Promise<CryptoKey>} Imported AES-256-GCM CryptoKey.
 */
async function importKey(base64Key) {
  const rawBytes = Uint8Array.from(atob(base64Key), (c) => c.charCodeAt(0));
  return crypto.subtle.importKey(
    "raw",
    rawBytes,
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"]
  );
}

/**
 * Encrypts a File or Blob using AES-256-GCM.
 *
 * The output format is:  [12-byte IV] + [ciphertext + GCM auth tag]
 * The IV is randomly generated and prepended to the ciphertext so that
 * decryption only needs the key — no separate IV transport.
 *
 * @param   {File|Blob}  file — The evidence file to encrypt.
 * @param   {CryptoKey}  key  — An AES-256-GCM CryptoKey.
 * @returns {Promise<ArrayBuffer>} Encrypted payload (IV + ciphertext).
 *
 * @example
 *   const key       = await generateEncryptionKey();
 *   const encrypted = await encryptFile(selectedFile, key);
 */
async function encryptFile(file, key) {
  if (!(file instanceof Blob)) {
    throw new TypeError("encryptFile() expects a File or Blob instance.");
  }

  // Read file bytes
  const plaintext = await file.arrayBuffer();

  // Generate a random 12-byte initialisation vector (IV)
  // GCM recommends 12 bytes for optimal performance and security.
  const iv = crypto.getRandomValues(new Uint8Array(12));

  // Encrypt using AES-256-GCM
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    plaintext
  );

  // Prepend the IV to the ciphertext for self-contained decryption
  const combined = new Uint8Array(iv.byteLength + ciphertext.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ciphertext), iv.byteLength);

  return combined.buffer;
}

/**
 * Decrypts an AES-256-GCM encrypted payload back to the original bytes.
 *
 * Expects the format produced by encryptFile(): [12-byte IV] + [ciphertext].
 *
 * @param   {ArrayBuffer} encryptedBuffer — The encrypted payload.
 * @param   {CryptoKey}   key             — The same AES-256-GCM key used to encrypt.
 * @returns {Promise<ArrayBuffer>} The decrypted original file bytes.
 */
async function decryptFile(encryptedBuffer, key) {
  const data = new Uint8Array(encryptedBuffer);

  // Extract the 12-byte IV from the start
  const iv = data.slice(0, 12);
  const ciphertext = data.slice(12);

  // Decrypt
  return crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. IPFS Upload via Pinata
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Uploads an encrypted blob to IPFS using the Pinata pinning API.
 *
 * Pinata is a cloud-hosted IPFS pinning service — no local IPFS node needed.
 * The encrypted blob is sent as a multipart/form-data upload to Pinata's
 * /pinning/pinFileToIPFS endpoint, and the returned CID (Content Identifier)
 * is the permanent, content-addressed reference to the encrypted evidence.
 *
 * @param   {Blob|ArrayBuffer} encryptedBlob  — The encrypted file data.
 * @param   {string}           pinataApiKey    — Your Pinata API JWT token.
 * @param   {string}           [fileName]      — Optional filename for the pin.
 * @returns {Promise<string>}  The IPFS CID (e.g. "QmXy...").
 *
 * @example
 *   const cid = await uploadToIPFS(encryptedBlob, "eyJhbGci...");
 */
async function uploadToIPFS(encryptedBlob, pinataApiKey, fileName) {
  if (!pinataApiKey || typeof pinataApiKey !== "string") {
    throw new Error("A valid Pinata API JWT token is required.");
  }

  // Normalise input to a Blob
  const blob =
    encryptedBlob instanceof Blob
      ? encryptedBlob
      : new Blob([encryptedBlob], { type: "application/octet-stream" });

  // Build multipart form
  const formData = new FormData();
  formData.append("file", blob, fileName || "evidex-encrypted-evidence.bin");

  // Optional Pinata metadata — helps organise pins on the dashboard
  const pinataMetadata = JSON.stringify({
    name: fileName || "evidex-evidence",
    keyvalues: {
      system: "EVIDEX",
      uploadedAt: new Date().toISOString(),
    },
  });
  formData.append("pinataMetadata", pinataMetadata);

  // Upload to Pinata
  const response = await fetch(
    "https://api.pinata.cloud/pinning/pinFileToIPFS",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${pinataApiKey}`,
      },
      body: formData,
    }
  );

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(
      `Pinata upload failed (HTTP ${response.status}): ${errorBody}`
    );
  }

  const result = await response.json();

  // result.IpfsHash is the CID
  return result.IpfsHash;
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. Backend Integration — Register Evidence
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Registers evidence on the backend (Person 2's API), which in turn
 * records the hash and CID on Hyperledger Fabric.
 *
 * @param   {string} hash     — SHA-256 hex hash of the original file.
 * @param   {string} cid      — IPFS CID of the encrypted file.
 * @param   {Object} metadata — Additional evidence metadata.
 * @param   {string} metadata.officerID — Badge / ID of the uploading officer.
 * @param   {string} metadata.caseID    — FIR or case reference number.
 * @param   {string} metadata.location  — Seizure / collection location.
 * @returns {Promise<Object>} The backend's response payload.
 *
 * @example
 *   const result = await registerEvidence(hash, cid, {
 *     officerID: "OFF-1234",
 *     caseID:    "FIR-2025-0042",
 *     location:  "Mumbai, Maharashtra",
 *   });
 */
async function registerEvidence(hash, cid, metadata) {
  if (!hash || !cid) {
    throw new Error("Both hash and cid are required to register evidence.");
  }

  const payload = {
    evidenceId: "EVD-" + Date.now().toString().slice(-4),
    caseId: metadata.caseID || "FIR-2026-DEFAULT",
    officerId: metadata.officerID || "OFF-ADMIN",
    ipfsCID: cid,
    sha256Hash: hash,
    timestamp: String(Math.floor(Date.now() / 1000))
  };

  const response = await fetch(`${API_BASE_URL}/evidence/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(
      `Evidence registration failed (HTTP ${response.status}): ${errorBody}`
    );
  }

  return response.json();
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. Tamper Detection — Verify Evidence
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Verifies the integrity of an evidence file against the blockchain record.
 *
 * Workflow:
 *   1. Compute SHA-256 of the supplied file (current state).
 *   2. Fetch the stored hash from the backend (blockchain state).
 *   3. Compare the two hashes.
 *   4. Return a clear verdict object.
 *
 * @param   {string}    evidenceId — The evidence ID assigned by the backend.
 * @param   {File|Blob} file       — The file to verify.
 * @returns {Promise<Object>} Verification result:
 *   {
 *     status:      "MATCH" | "TAMPERED",
 *     storedHash:  string,   // hash from blockchain
 *     currentHash: string,   // hash of the supplied file
 *     verifiedAt:  string,   // ISO timestamp
 *     evidenceId:  string,
 *   }
 *
 * @example
 *   const verdict = await verifyEvidence("EVD-001", reuploadedFile);
 *   if (verdict.status === "TAMPERED") alert("⚠️ Evidence has been tampered!");
 */
async function verifyEvidence(evidenceId, file) {
  if (!evidenceId) {
    throw new Error("evidenceId is required for verification.");
  }

  // Step 1 — Hash the current file
  const currentHash = await hashFile(file);

  // Step 2 — Fetch the stored hash from the backend using query params
  const response = await fetch(
    `${API_BASE_URL}/evidence/verify/${encodeURIComponent(evidenceId)}?providedHash=${encodeURIComponent(currentHash)}`
  );

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(
      `Evidence verification lookup failed (HTTP ${response.status}): ${errorBody}`
    );
  }

  const data = await response.json();
  const isMatch = data.verified === true;
  const storedHash = data.storedHash || "";

  // Step 3 — Compare
  const status = isMatch ? "MATCH" : "TAMPERED";

  // Step 4 — Build result
  return {
    status,
    storedHash,
    currentHash,
    verifiedAt: new Date().toISOString(),
    evidenceId,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. End-to-End Pipeline
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Full pipeline: hash → encrypt → upload to IPFS → register on blockchain.
 *
 * This is the primary function an officer calls when submitting new evidence.
 * It orchestrates all four steps and returns a comprehensive result object.
 *
 * @param   {File}   file          — The raw evidence file.
 * @param   {Object} options
 * @param   {string} options.pinataApiKey — Pinata JWT token.
 * @param   {string} options.officerID    — Officer badge / ID.
 * @param   {string} options.caseID       — FIR / case number.
 * @param   {string} options.location     — Seizure location.
 * @returns {Promise<Object>} Pipeline result with hash, CID, key, and backend response.
 */
async function processEvidence(file, options = {}) {
  const { pinataApiKey, officerID, caseID, location } = options;

  // Step 1 — Hash the original file
  const hash = await hashFile(file);

  // Step 2 — Generate encryption key & encrypt
  const encryptionKey = await generateEncryptionKey();
  const encryptedBuffer = await encryptFile(file, encryptionKey);

  // Export the key so it can be stored / shared securely
  const exportedKey = await exportKey(encryptionKey);

  // Step 3 — Upload encrypted blob to IPFS
  const cid = await uploadToIPFS(encryptedBuffer, pinataApiKey, file.name);

  // Step 4 — Register on the backend / blockchain
  const registration = await registerEvidence(hash, cid, {
    officerID,
    caseID,
    location,
  });

  return {
    hash,
    cid,
    encryptionKey: exportedKey, // Base64 — store securely!
    fileName: file.name,
    fileSize: file.size,
    registration,
    processedAt: new Date().toISOString(),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Exports (ES Module)
// ─────────────────────────────────────────────────────────────────────────────

export {
  // Core functions (Person 4 deliverables)
  hashFile,
  encryptFile,
  decryptFile,
  uploadToIPFS,
  registerEvidence,
  verifyEvidence,

  // Key management helpers
  generateEncryptionKey,
  exportKey,
  importKey,

  // End-to-end pipeline
  processEvidence,

  // Configuration
  API_BASE_URL,
};
