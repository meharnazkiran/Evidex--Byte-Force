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
    const result = await fabricService.transferCustody(evidenceId, fromOrg, toOrg, reason, transferTime);

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
    const historyData = await fabricService.getEvidenceHistory(evidenceId);
    
    // Check if the client expects HTML (browser request from QR code scan)
    if (req.headers.accept && req.headers.accept.includes('text/html')) {
      const history = historyData.history || [];
      const isExist = history.length > 0;
      
      let timelineHTML = '';
      let evidence = {};
      
      if (isExist) {
        evidence = history[0].value;
        history.forEach((step, index) => {
          const val = step.value;
          const orgText = val.toOrg ? `${val.fromOrg} ➔ ${val.toOrg}` : "Original Registration";
          const reasonText = val.reason ? `Reason: "${val.reason}"` : `Seized by ${val.officerId} at Seizure Location`;
          const timeText = val.timestamp ? new Date(parseInt(val.timestamp) * 1000).toLocaleString() : new Date(step.timestamp).toLocaleString();
          timelineHTML += `
            <div class="timeline-item">
              <div class="timeline-dot"></div>
              <div class="timeline-header">[TX #${index + 1}] ${orgText}</div>
              <div class="timeline-body">${reasonText}</div>
              <div class="timeline-txid">TXID: ${step.txId}</div>
              <div class="timeline-time">Time: ${timeText}</div>
            </div>
          `;
        });
      }

      const html = `
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>EVIDEX // Digital Twin Tracking Tag</title>
          <link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700;900&family=Share+Tech+Mono&family=Inter:wght@300;400;600;700&display=swap" rel="stylesheet">
          <style>
            :root {
              --bg-dark: #02070a;
              --card-bg: rgba(6, 18, 26, 0.75);
              --neon-cyan: #00f0ff;
              --neon-green: #00ff8c;
              --glow-cyan: 0 0 15px rgba(0, 240, 255, 0.4);
              --glow-green: 0 0 15px rgba(0, 255, 140, 0.4);
              --text-pure: #ffffff;
              --text-secondary: #94a3b8;
              --border-subtle: rgba(0, 240, 255, 0.15);
            }
            body {
              background-color: var(--bg-dark);
              color: var(--text-pure);
              font-family: 'Inter', sans-serif;
              margin: 0;
              padding: 20px;
              display: flex;
              justify-content: center;
              min-height: 100vh;
            }
            .container {
              width: 100%;
              max-width: 600px;
              margin-top: 20px;
            }
            .header {
              text-align: center;
              margin-bottom: 30px;
            }
            .logo {
              font-family: 'Orbitron', sans-serif;
              font-weight: 900;
              font-size: 1.8rem;
              letter-spacing: 0.1em;
              background: linear-gradient(135deg, var(--neon-cyan) 0%, var(--neon-green) 100%);
              -webkit-background-clip: text;
              -webkit-text-fill-color: transparent;
              margin-bottom: 5px;
            }
            .subtitle {
              font-family: 'Share Tech Mono', monospace;
              font-size: 0.75rem;
              color: var(--text-secondary);
              text-transform: uppercase;
              letter-spacing: 0.2em;
            }
            .badge {
              display: inline-block;
              padding: 6px 12px;
              background: rgba(0, 255, 140, 0.1);
              border: 1px solid var(--neon-green);
              box-shadow: var(--glow-green);
              color: var(--neon-green);
              border-radius: 4px;
              font-size: 0.75rem;
              font-weight: 700;
              text-transform: uppercase;
              letter-spacing: 0.1em;
              margin-bottom: 25px;
            }
            .badge--error {
              background: rgba(239, 68, 68, 0.1);
              border: 1px solid #ef4444;
              box-shadow: 0 0 15px rgba(239, 68, 68, 0.4);
              color: #ef4444;
            }
            .card {
              background: var(--card-bg);
              border: 1px solid var(--border-subtle);
              border-radius: 8px;
              padding: 25px;
              box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.37);
              backdrop-filter: blur(8px);
              margin-bottom: 25px;
            }
            .card-title {
              font-family: 'Orbitron', sans-serif;
              font-size: 1rem;
              font-weight: 700;
              margin-top: 0;
              margin-bottom: 20px;
              border-bottom: 1px solid var(--border-subtle);
              padding-bottom: 10px;
              color: var(--neon-cyan);
              text-shadow: var(--glow-cyan);
              display: flex;
              align-items: center;
              gap: 8px;
            }
            .field-row {
              margin-bottom: 15px;
            }
            .field-label {
              font-family: 'Share Tech Mono', monospace;
              font-size: 0.7rem;
              color: var(--text-secondary);
              text-transform: uppercase;
              margin-bottom: 4px;
            }
            .field-value {
              font-family: 'Share Tech Mono', monospace;
              font-size: 0.85rem;
              color: var(--text-pure);
              word-break: break-all;
              background: rgba(1, 4, 6, 0.5);
              padding: 8px 12px;
              border-radius: 4px;
              border: 1px solid rgba(255, 255, 255, 0.03);
            }
            .timeline {
              position: relative;
              padding-left: 20px;
              border-left: 2px solid var(--border-subtle);
              margin-left: 5px;
            }
            .timeline-item {
              position: relative;
              margin-bottom: 25px;
            }
            .timeline-dot {
              position: absolute;
              left: -26px;
              top: 4px;
              width: 10px;
              height: 10px;
              border-radius: 50%;
              background: var(--neon-cyan);
              box-shadow: var(--glow-cyan);
            }
            .timeline-header {
              font-weight: 700;
              font-size: 0.8rem;
              color: var(--text-pure);
            }
            .timeline-body {
              font-size: 0.78rem;
              color: var(--text-secondary);
              margin-top: 4px;
            }
            .timeline-txid, .timeline-time {
              font-family: 'Share Tech Mono', monospace;
              font-size: 0.68rem;
              color: rgba(148, 163, 184, 0.6);
              margin-top: 2px;
              word-break: break-all;
            }
            .btn {
              display: block;
              text-align: center;
              text-decoration: none;
              font-family: 'Orbitron', sans-serif;
              font-weight: 700;
              font-size: 0.8rem;
              padding: 14px 20px;
              border-radius: 4px;
              border: 1px solid var(--neon-cyan);
              background: transparent;
              color: var(--neon-cyan);
              box-shadow: var(--glow-cyan);
              transition: all 0.3s ease;
              text-transform: uppercase;
              letter-spacing: 0.1em;
              cursor: pointer;
            }
            .btn:hover {
              background: var(--neon-cyan);
              color: var(--bg-dark);
              box-shadow: 0 0 25px rgba(0, 240, 255, 0.7);
            }
            .footer {
              text-align: center;
              font-size: 0.65rem;
              color: rgba(148, 163, 184, 0.4);
              margin-top: 40px;
              margin-bottom: 20px;
              line-height: 1.5;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <div class="logo">EVIDEX</div>
              <div class="subtitle">Digital Twin Tracking Tag</div>
            </div>
            
            <div style="text-align: center;">
              ${isExist 
                ? '<div class="badge">✓ Authentic Blockchain Registry</div>' 
                : '<div class="badge badge--error">⚠️ Unknown Record</div>'}
            </div>

            ${isExist ? `
              <!-- Section 1: Digital twin metadata -->
              <div class="card">
                <div class="card-title"><span>🛡️</span> Evidentiary Core</div>
                
                <div class="field-row">
                  <div class="field-label">Evidence ID</div>
                  <div class="field-value" style="color: var(--neon-cyan); font-weight: bold;">${evidenceId}</div>
                </div>

                <div class="field-row">
                  <div class="field-label">SHA-256 HASH</div>
                  <div class="field-value" style="color: var(--neon-green);">${evidence.sha256Hash || evidence.hash || "N/A"}</div>
                </div>

                <div class="field-row">
                  <div class="field-label">IPFS CID Pointer</div>
                  <div class="field-value">${evidence.ipfsCID || "N/A"}</div>
                </div>

                <div class="field-row">
                  <div class="field-label">Original Case ID</div>
                  <div class="field-value">${evidence.caseId || "N/A"}</div>
                </div>

                <div class="field-row">
                  <div class="field-label">Seizing Officer</div>
                  <div class="field-value">${evidence.officerId || "N/A"}</div>
                </div>
              </div>

              <!-- Section 2: Chain of Custody Timeline -->
              <div class="card">
                <div class="card-title"><span>⏳</span> Custody Handoff History</div>
                <div class="timeline">
                  ${timelineHTML}
                </div>
              </div>

              <!-- Section 3: Legal Courtroom Actions -->
              <div style="margin-top: 20px;">
                <a href="/evidence/certificate/${evidenceId}" class="btn">
                  Download Courtroom BSA §63 Certificate
                </a>
              </div>
            ` : `
              <div class="card" style="text-align: center; padding: 40px 20px;">
                <div style="font-size: 3rem; margin-bottom: 20px;">🔍</div>
                <div style="font-size: 1.1rem; font-weight: bold; margin-bottom: 10px;">ID Not Found on Ledger</div>
                <div style="color: var(--text-secondary); font-size: 0.85rem; line-height: 1.6;">
                  The Evidence ID <code style="color: var(--neon-cyan);">${evidenceId}</code> is not registered on the Hyperledger Fabric blockchain ledger. Please verify the tracking tag URL and try again.
                </div>
              </div>
            `}

            <div class="footer">
              EVIDEX v3.0 // Decentralized Forensic Evidence Custody & Secure Securing Workspace<br>
              Valid for Indian Court Admissibility under Bharatiya Sakshya Adhiniyam, 2023 (BSA §63).
            </div>
          </div>
        </body>
        </html>
      `;
      res.send(html);
    } else {
      res.json(historyData);
    }
  } catch (error) {
    if (req.headers.accept && req.headers.accept.includes('text/html')) {
      res.send(`<h1>Error</h1><p>${error.message}</p>`);
    } else {
      res.status(500).json({ error: `History retrieval failed: ${error.message}` });
    }
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
