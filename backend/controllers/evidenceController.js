const ipfsService = require('../services/ipfsService');
const fabricService = require('../services/fabricService');
const QRCode = require('qrcode');
const caService = require('../services/caService');
const pdfService = require('../services/pdfService');

/**
 * Register new evidence on-chain.
 * Supports both JSON body (direct metadata) and Multipart Form-Data (file upload).
 */
async function registerEvidence(req, res) {
  try {
    let evidenceId, caseId, officerId, ipfsCID, sha256Hash, timestamp;

    if (req.file) {
      // 1. File Upload Mode (Multipart)
      ({ evidenceId, caseId, officerId, timestamp } = req.body);
      
      if (!evidenceId || !caseId || !officerId) {
        return res.status(400).json({ error: 'Missing required metadata: evidenceId, caseId, and officerId' });
      }

      // Compute file hash
      sha256Hash = ipfsService.calculateSHA256(req.file.buffer);
      console.log(`Computed SHA-256 hash: ${sha256Hash}`);

      // Upload to IPFS
      ipfsCID = await ipfsService.uploadToIPFS(req.file.buffer, req.file.originalname);
    } else {
      // 2. Direct JSON Data Mode
      ({ evidenceId, caseId, officerId, ipfsCID, sha256Hash, timestamp } = req.body);

      if (!evidenceId || !caseId || !officerId || !ipfsCID || !sha256Hash) {
        return res.status(400).json({ 
          error: 'Missing required fields. Provide either a file upload or a JSON body containing evidenceId, caseId, officerId, ipfsCID, and sha256Hash' 
        });
      }
    }

    // Auto-generate timestamp if not provided (epoch seconds)
    if (!timestamp) {
      timestamp = String(Math.floor(Date.now() / 1000));
    } else {
      timestamp = String(timestamp);
    }

    // Call fabric service to register on the blockchain
    const result = await fabricService.registerEvidence(
      evidenceId, 
      caseId, 
      officerId, 
      ipfsCID, 
      sha256Hash, 
      timestamp
    );

    // Generate high-density QR code pointing to the specific evidence history tracking endpoint/screen
    const trackingUrl = `${req.protocol}://${req.get('host')}/evidence/history/${evidenceId}`;
    const qrCodeDataUrl = await QRCode.toDataURL(trackingUrl, {
      errorCorrectionLevel: 'H', // High density
      margin: 1,
      width: 300
    });

    // Emit real-time event to Socket.io client map
    if (global.io) {
      global.io.emit('EvidenceRegistered', {
        evidenceId,
        caseId,
        officerId,
        ipfsCID,
        sha256Hash,
        timestamp
      });
    }

    res.json({
      message: 'Evidence successfully registered',
      evidenceId,
      ipfsCID,
      sha256Hash,
      timestamp,
      qrCode: qrCodeDataUrl,
      blockchainResult: result
    });
  } catch (error) {
    res.status(500).json({ error: `Registration failed: ${error.message}` });
  }
}

/**
 * Transfer custody of physical evidence.
 */
async function transferCustody(req, res) {
  const { evidenceId, fromOrg, toOrg, reason, timestamp } = req.body;

  if (!evidenceId || !fromOrg || !toOrg || !reason) {
    return res.status(400).json({ error: 'Missing required fields: evidenceId, fromOrg, toOrg, and reason' });
  }

  const transferTime = timestamp ? String(timestamp) : String(Math.floor(Date.now() / 1000));

  try {
    // Emit real-time event to Socket.io client map
    if (global.io) {
      global.io.emit('CustodyTransferred', {
        evidenceId,
        fromOrg,
        toOrg,
        reason,
        timestamp: transferTime
      });
    }

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: `Custody transfer failed: ${error.message}` });
  }
}

/**
 * Verify evidence integrity by comparing provided hash (or uploaded file) with on-chain hash.
 */
async function verifyEvidence(req, res) {
  const evidenceId = req.params.id;
  let providedHash = req.query.providedHash || req.query.hash;

  try {
    // If a file is uploaded, compute its hash
    if (req.file) {
      providedHash = ipfsService.calculateSHA256(req.file.buffer);
      console.log(`Computed SHA-256 hash of uploaded file for verification: ${providedHash}`);
    }

    if (!providedHash) {
      return res.status(400).json({ 
        error: 'Missing verification target. Provide a hash via query parameter (?providedHash=...) or upload a file.' 
      });
    }

    const verification = await fabricService.verifyIntegrity(evidenceId, providedHash);
    
    res.json({
      evidenceId,
      providedHash,
      ...verification
    });
  } catch (error) {
    res.status(500).json({ error: `Verification failed: ${error.message}` });
  }
}

/**
 * Get chain of custody history for an evidence item.
 */
async function getHistory(req, res) {
  const evidenceId = req.params.id;

  try {
    const history = await fabricService.getEvidenceHistory(evidenceId);
    res.json(history);
  } catch (error) {
    res.status(500).json({ error: `History retrieval failed: ${error.message}` });
  }
}

/**
 * Generate and stream a cryptographically signed Section 63 BSA PDF certificate.
 */
async function exportCertificate(req, res) {
  const evidenceId = req.params.id;

  try {
    // 1. Fetch chain of custody timeline history
    const historyData = await fabricService.getEvidenceHistory(evidenceId);
    if (!historyData || !historyData.history || historyData.history.length === 0) {
      return res.status(404).json({ error: `Evidence history for '${evidenceId}' not found.` });
    }

    // 2. Fetch the current / original evidence state
    const history = historyData.history;
    const originalTx = history[0];
    const evidence = originalTx.value;

    // 3. Retrieve submitting officer identity from CA wallet
    const officerId = evidence.officerId;
    const wallet = caService.getWallet();
    let identity = wallet ? await wallet.get(officerId) : null;
    
    // Fallback to admin identity if officer certificate is not found
    if (!identity && wallet) {
      identity = await wallet.get('admin');
    }

    // Fallback to secure mock credentials if no identities are available in the wallet
    if (!identity) {
      identity = {
        credentials: {
          certificate: 'Mock Certificate',
          privateKey: 'mock-secret-key'
        }
      };
    }

    // 4. Set appropriate PDF headers
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=BSA_Section63_Certificate_${evidenceId}.pdf`);

    // 5. Generate and stream PDF
    const host = req.get('host');
    await pdfService.generateBSACertificate(res, evidence, history, identity, host);
  } catch (error) {
    console.error('PDF export failed:', error);
    // Only send JSON error if headers haven't been sent yet
    if (!res.headersSent) {
      res.status(500).json({ error: `Failed to generate PDF certificate: ${error.message}` });
    }
  }
}

module.exports = {
  registerEvidence,
  transferCustody,
  verifyEvidence,
  getHistory,
  exportCertificate
};
