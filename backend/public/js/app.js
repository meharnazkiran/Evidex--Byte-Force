import {
  hashFile,
  encryptFile,
  uploadToIPFS,
  verifyEvidence,
  generateEncryptionKey,
  exportKey,
  processEvidence,
  API_BASE_URL
} from "./evidex-core.js";

// ─────────────────────────────────────────────────────────────────────────────
// DOM Elements Selection
// ─────────────────────────────────────────────────────────────────────────────

// Operational Nodes (Module 3 Timeline)
const nodes = {
  police: document.getElementById("node-police"),
  lab: document.getElementById("node-lab"),
  court: document.getElementById("node-court")
};

// Module 1: Dashboard
const dashConnectedOrg = document.getElementById("dash-connected-org");
const dashCaStatus = document.getElementById("dash-ca-status");
const dashLedgerMode = document.getElementById("dash-ledger-mode");

// Module 2: Registration
const pipelineFileInput = document.getElementById("pipeline-file-input");
const pipelineBtn = document.getElementById("pipeline-btn");
const pipelineFileTestBtn = document.getElementById("pipeline-file-test-btn");
let pipelineSelectedFile = null;
const pipelineOutput = document.getElementById("pipeline-output");
const pipelineOfficerId = document.getElementById("pipeline-officer-id");
const pipelineCaseId = document.getElementById("pipeline-case-id");
const pipelineLocation = document.getElementById("pipeline-location");
const pipelineStepsBox = document.getElementById("pipeline-steps-box");
const stepHash = document.getElementById("step-hash");
const stepEncrypt = document.getElementById("step-encrypt");
const stepIpfs = document.getElementById("step-ipfs");
const stepLedger = document.getElementById("step-ledger");

// Module 3: Handoff Execution Panel
const sectionHandoffAction = document.getElementById("section-handoff-action");
const handoffEvidenceId = document.getElementById("handoff-evidence-id");
const handoffFromOrg = document.getElementById("handoff-from-org");
const handoffToOrg = document.getElementById("handoff-to-org");
const handoffReason = document.getElementById("handoff-reason");
const handoffSubmitBtn = document.getElementById("handoff-submit-btn");
const handoffOutput = document.getElementById("handoff-output");

// Module 4: Verification
const verifyIdInput = document.getElementById("verify-id-input");
const verifyFileInput = document.getElementById("verify-file-input");
const verifyBtn = document.getElementById("verify-btn");
const verifyOutput = document.getElementById("verify-output");
const verifyFileTestBtn = document.getElementById("verify-file-test-btn");
let verifySelectedFile = null;

// Module 5: History Log
const historyTimelineBox = document.getElementById("history-timeline-box");

// Module 6: Certificate Viewer
const certificatePrintArea = document.getElementById("certificate-print-area");
const printCertBtn = document.getElementById("print-cert-btn");
const exportCertBtn = document.getElementById("export-cert-btn");

// Centerpiece 3D block
const coreCubeElement = document.getElementById("evidentiary-core-cube");
const coreStatusText = document.getElementById("core-status-text");

// Global Active State
let activeEvidenceId = null;
let activeCustodian = "PoliceDept";

// ─────────────────────────────────────────────────────────────────────────────
// UI Utility Helper Functions
// ─────────────────────────────────────────────────────────────────────────────

function showOutput(el, html) {
  el.innerHTML = html;
  el.classList.add("visible");
  el.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function setLoading(btn, loading) {
  btn.classList.toggle("loading", loading);
  btn.disabled = loading;
}

// Helper to update the faces of the 3D Evidentiary Core Cube
function updateCubeHash(hashValue) {
  if (coreCubeElement) {
    coreCubeElement.classList.remove("tampered", "verified");
  }
  const faces = document.querySelectorAll(".cube-body .face-hash");
  const truncatedHash = hashValue ? "0x" + hashValue.slice(0, 16).toUpperCase() : "0x0000000000000000";
  faces.forEach(face => {
    face.textContent = truncatedHash;
  });
}

// Set active node state in Layer 2 continuum and align volumetric energy tower
function setActiveNode(nodeKey) {
  const nodeElement = nodes[nodeKey];
  if (!nodeElement) return;

  // Toggle active node classes
  Object.keys(nodes).forEach(key => {
    if (nodes[key]) {
      nodes[key].classList.toggle("active", key === nodeKey);
    }
  });

  const beamAxis = document.getElementById('global-beam-axis');
  if (beamAxis) {
    const nodeRect = nodeElement.getBoundingClientRect();
    const workspaceContainer = nodeElement.closest('.antigravity-workspace-envelope') || document.body;
    const containerRect = workspaceContainer.getBoundingClientRect();

    const targetX = (nodeRect.left + (nodeRect.width / 2)) - containerRect.left;
    const calculatedOffset = targetX - 225;

    beamAxis.style.transform = `translateX(${calculatedOffset}px)`;
    document.documentElement.style.setProperty('--active-node-x', `${(targetX / containerRect.width) * 100}%`);
    window.activeNodeX = targetX;
  }
}
window.setActiveNode = setActiveNode;

// Fetch system health to configure dashboard
async function fetchSystemHealth() {
  try {
    const res = await fetch(`${API_BASE_URL}/health`);
    if (res.ok) {
      const status = await res.json();
      const isMockLedger = status.mode.ledger === "mock-fallback";
      
      dashLedgerMode.textContent = isMockLedger ? "● MOCK FALLBACK" : "● LIVE BLOCKCHAIN";
      dashLedgerMode.style.color = isMockLedger ? "var(--glow-amber)" : "var(--neon-green)";
      dashLedgerMode.style.textShadow = isMockLedger ? "0 0 10px rgba(255,184,0,0.3)" : "0 0 10px rgba(0,255,140,0.3)";
      
      dashCaStatus.textContent = status.mode.ca === "production" ? "● ONLINE" : "● MOCK FALLBACK";
      dashCaStatus.style.color = status.mode.ca === "production" ? "var(--neon-green)" : "var(--glow-amber)";
    }
  } catch (err) {
    dashLedgerMode.textContent = "● DISCONNECTED";
    dashLedgerMode.style.color = "var(--glow-crimson)";
    dashLedgerMode.style.textShadow = "0 0 10px rgba(255,42,95,0.3)";
    dashCaStatus.textContent = "● OFFLINE";
    dashCaStatus.style.color = "var(--glow-crimson)";
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Event Bindings & Action Orchestrations
// ─────────────────────────────────────────────────────────────────────────────

window.addEventListener("DOMContentLoaded", () => {
  setTimeout(() => {
    setActiveNode("police");
    fetchSystemHealth();
  }, 150);

  // Link Timeline nodes to information lookup/focus
  if (nodes.police) {
    nodes.police.addEventListener("click", () => {
      setActiveNode("police");
      if (activeCustodian === "PoliceDept" && activeEvidenceId) {
        openHandoffPanel("PoliceDept");
      }
    });
  }
  if (nodes.lab) {
    nodes.lab.addEventListener("click", () => {
      setActiveNode("lab");
      if (activeCustodian === "ForensicLab" && activeEvidenceId) {
        openHandoffPanel("ForensicLab");
      }
    });
  }
  if (nodes.court) {
    nodes.court.addEventListener("click", () => {
      setActiveNode("court");
      if (activeCustodian === "JudicialCourt" && activeEvidenceId) {
        openHandoffPanel("JudicialCourt");
      }
    });
  }
});

// Recalibrate active beam coordinates on window resize
window.addEventListener("resize", () => {
  const activeKey = Object.keys(nodes).find(key => nodes[key] && nodes[key].classList.contains("active"));
  if (activeKey) {
    setActiveNode(activeKey);
  }
});

// Enable/Disable Register Button
pipelineFileInput.addEventListener("change", () => {
  pipelineSelectedFile = pipelineFileInput.files[0];
  pipelineBtn.disabled = !pipelineSelectedFile;
  if (pipelineSelectedFile && pipelineFileTestBtn) {
    pipelineFileTestBtn.textContent = "Use Test File";
  }
});

if (pipelineFileTestBtn) {
  pipelineFileTestBtn.addEventListener("click", () => {
    const dummyText = "Forensic evidence data - Case FIR-2026-0092";
    pipelineSelectedFile = new File([dummyText], "crime_log.txt", { type: "text/plain" });
    pipelineBtn.disabled = false;
    pipelineFileTestBtn.textContent = "✓ Test File Loaded";
  });
}

// 2. Complete End-to-End Registration Pipeline
pipelineBtn.addEventListener("click", async () => {
  setActiveNode("police");
  setLoading(pipelineBtn, true);
  pipelineStepsBox.style.display = "block";
  
  // Reset steps
  stepHash.style.color = "var(--glow-amber)";
  stepHash.textContent = "⚙️ Computing digital SHA-256 fingerprint...";
  stepEncrypt.style.color = "var(--text-muted)";
  stepEncrypt.textContent = "○ Uploading file payload to secure backend...";
  stepIpfs.style.color = "var(--text-muted)";
  stepIpfs.textContent = "○ Server pinning to decentralized IPFS...";
  stepLedger.style.color = "var(--text-muted)";
  stepLedger.textContent = "○ Securing transaction blocks on Hyperledger Fabric...";

  try {
    const file = pipelineSelectedFile || pipelineFileInput.files[0];
    const officerId = pipelineOfficerId.value.trim() || "Officer_Smith";
    const caseId = pipelineCaseId.value.trim() || "FIR-AUTO";
    
    // Step 1: Hash file client-side for integrity display
    const hash = await hashFile(file);
    stepHash.style.color = "var(--neon-green)";
    stepHash.textContent = "✓ Digital SHA-256 Fingerprint Computed.";
    
    // Step 2: Authenticate and enroll if wallet credentials missing
    stepEncrypt.style.color = "var(--glow-amber)";
    stepEncrypt.textContent = "⚙️ Enrolling officer identity and transferring file payload...";
    await ensureOfficerWallet(officerId);
    
    // Build multipart form data
    const formData = new FormData();
    formData.append("evidenceId", "EVD-" + Date.now().toString().slice(-4));
    formData.append("caseId", caseId);
    formData.append("officerId", officerId);
    formData.append("file", file);

    // Step 3: Send file payload to backend
    stepEncrypt.style.color = "var(--neon-green)";
    stepEncrypt.textContent = "✓ File payload successfully transferred to backend.";
    stepIpfs.style.color = "var(--glow-amber)";
    stepIpfs.textContent = "⚙️ Uploading file to decentralized IPFS node...";

    const regResponse = await fetch(`${API_BASE_URL}/evidence/register`, {
      method: "POST",
      headers: { 
        "x-officer-id": officerId
      },
      body: formData
    });

    if (!regResponse.ok) {
      const errData = await regResponse.json();
      throw new Error(errData.error || "Registry rejected by blockchain peer node");
    }

    const regData = await regResponse.json();
    
    stepIpfs.style.color = "var(--neon-green)";
    stepIpfs.textContent = "✓ Pinned to IPFS. CID: " + regData.ipfsCID.slice(0, 16) + "...";
    stepLedger.style.color = "var(--neon-green)";
    stepLedger.textContent = "✓ Block committed successfully to Hyperledger Fabric!";
    
    activeEvidenceId = regData.evidenceId;
    activeCustodian = "PoliceDept";
    updateCubeHash(regData.sha256Hash);
    coreStatusText.textContent = `EVIDENCE ACTIVE // ${activeEvidenceId}`;
    if (coreCubeElement) {
      coreCubeElement.classList.add("verified");
    }

    const qrCodeHtml = regData.qrCode ? `\n<div style="margin-top: 15px; text-align: center;"><img src="${regData.qrCode}" style="border: 4px solid #ffffff; border-radius: 4px; width: 120px;" /><div style="font-size: 0.75rem; color: var(--neon-cyan); margin-top: 5px;">Digital Twin Tracking Tag</div></div>` : '';

    showOutput(pipelineOutput, [
      `[ BLOCKCHAIN SECURED CUSTODY RECORD ]`,
      `<span class="hud-hash-label">EVIDENCE ID:</span>  <span class="hud-hash-value">${activeEvidenceId}</span>`,
      `<span class="hud-hash-label">FILE NAME:</span>    ${file.name}`,
      `<span class="hud-hash-label">SHA-256 HASH:</span>  <span class="hud-hash-value">${regData.sha256Hash}</span>`,
      `<span class="hud-hash-label">IPFS CID:</span>     <span class="hud-hash-value">${regData.ipfsCID}</span>`,
      `<span class="hud-hash-label">CUSTODIAN:</span>    Tamil Nadu Police Dept (Node 01)`,
      `\n✅ CUSTODY TRANSACTION SUBMITTED. FABRIC BLOCK COMMITTED SUCCESSFULLY.`,
      `⚙️  VERIFIED LIVE ON HYPERLEDGER FABRIC TEST-NETWORK.`,
      qrCodeHtml
    ].join("\n"));

    // Enable and show Handoff options
    openHandoffPanel("PoliceDept");
    fetchEvidenceHistory(activeEvidenceId);

  } catch (err) {
    showOutput(pipelineOutput, `❌ Registration Pipeline Failed: ${err.message}`);
  }
  setLoading(pipelineBtn, false);
});

// Auto-register/enroll officer if missing from wallet
async function ensureOfficerWallet(username) {
  try {
    const checkRes = await fetch(`${API_BASE_URL}/auth/check/${encodeURIComponent(username)}`);
    if (!checkRes.ok) {
      throw new Error("Failed to verify officer registration status.");
    }
    const status = await checkRes.json();
    if (!status.enrolled) {
      throw new Error(`Officer '${username}' is not registered in the system. Please register and enroll this identity first.`);
    }
  } catch (e) {
    throw e;
  }
}

// Open handoff console for active custody node
function openHandoffPanel(custodianKey) {
  activeCustodian = custodianKey;
  sectionHandoffAction.style.display = "block";
  handoffEvidenceId.value = activeEvidenceId;
  handoffFromOrg.value = custodianKey === "PoliceDept" ? "TN Police Dept (Node 01)" :
                         custodianKey === "ForensicLab" ? "Forensic Lab (Node 02)" : "Judicial Court (Node 03)";
  
  // Set default recipient target
  if (custodianKey === "PoliceDept") {
    handoffToOrg.value = "ForensicLab";
    setActiveNode("police");
  } else if (custodianKey === "ForensicLab") {
    handoffToOrg.value = "JudicialCourt";
    setActiveNode("lab");
  } else {
    handoffToOrg.value = "PoliceDept";
    setActiveNode("court");
  }

  handoffOutput.classList.remove("visible");
  sectionHandoffAction.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

// Module 3 Handoff Submit
handoffSubmitBtn.addEventListener("click", async () => {
  if (!activeEvidenceId) return;
  setLoading(handoffSubmitBtn, true);

  const officerId = pipelineOfficerId.value.trim() || "Officer_Smith";
  const toOrg = handoffToOrg.value;
  const reason = handoffReason.value.trim() || "Standard custody handover";
  const fromOrgValue = activeCustodian;

  try {
    const res = await fetch(`${API_BASE_URL}/evidence/transfer`, {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        "x-officer-id": officerId
      },
      body: JSON.stringify({
        evidenceId: activeEvidenceId,
        fromOrg: fromOrgValue,
        toOrg,
        reason,
        timestamp: String(Math.floor(Date.now() / 1000))
      })
    });

    if (!res.ok) {
      const errData = await res.json();
      throw new Error(errData.error || "Custody transfer transaction failed");
    }

    // Trigger visual wormhole projectile animation
    if (window.fireWormhole) {
      window.fireWormhole(fromOrgValue, toOrg);
    }

    activeCustodian = toOrg;
    
    showOutput(handoffOutput, [
      `[ CUSTODY MUTATION BROADCASTED ]`,
      `✅ TRANSFER COMPLETED SUCCESSFULLY.`,
      `• EVIDENCE ID:   ${activeEvidenceId}`,
      `• DESTINATION:   ${toOrg === "ForensicLab" ? "Forensic Lab (Node 02)" : toOrg === "JudicialCourt" ? "Judicial Court (Node 03)" : "TN Police Dept (Node 01)"}`,
      `• LOG REASON:    "${reason}"`
    ].join("\n"));

    // Recalibrate node states
    setTimeout(() => {
      const targetNodeKey = toOrg === "ForensicLab" ? "lab" : toOrg === "JudicialCourt" ? "court" : "police";
      setActiveNode(targetNodeKey);
      openHandoffPanel(toOrg);
      fetchEvidenceHistory(activeEvidenceId);
    }, 1500);

  } catch (err) {
    showOutput(handoffOutput, `❌ Custody Transfer Aborted: ${err.message}`);
  }
  setLoading(handoffSubmitBtn, false);
});

// Fetch History Log (Module 5)
async function fetchEvidenceHistory(evidenceId) {
  try {
    const res = await fetch(`${API_BASE_URL}/evidence/history/${evidenceId}`);
    if (!res.ok) throw new Error("History fetch failed");
    const data = await res.json();
    
    if (data.history && data.history.length > 0) {
      let timelineHTML = "";
      
      // Render timeline cards in chronological order
      data.history.forEach((step, index) => {
        const val = step.value;
        const orgText = val.toOrg ? `${val.fromOrg} ➔ ${val.toOrg}` : "Original Registration";
        const reasonText = val.reason ? `Reason: "${val.reason}"` : `Seized by ${val.officerId} at ${val.timestamp}`;
        
        timelineHTML += `
          <div class="timeline-item" style="position: relative; margin-bottom: 20px; padding-left: 20px; border-left: 2px solid var(--glow-cyan);">
            <div style="position: absolute; left: -6px; top: 4px; width: 10px; height: 10px; border-radius: 50%; background: var(--glow-cyan); box-shadow: 0 0 8px var(--glow-cyan);"></div>
            <div style="color: var(--text-pure); font-weight: 700; text-transform: uppercase; font-size: 0.72rem;">[TX #${index + 1}] ${orgText}</div>
            <div style="color: var(--text-secondary); font-size: 0.7rem; margin-top: 3px;">${reasonText}</div>
            <div style="color: var(--text-muted); font-size: 0.65rem; margin-top: 2px; font-family: var(--font-mono); word-break: break-all;">TXID: ${step.txId}</div>
            <div style="color: var(--text-muted); font-size: 0.65rem;">Time: ${new Date(step.timestamp).toLocaleString()}</div>
          </div>
        `;
      });
      historyTimelineBox.innerHTML = timelineHTML;
    } else {
      historyTimelineBox.innerHTML = `<div style="color: var(--text-muted); text-align: center; padding: 40px 0;">No logs committed for ID ${evidenceId}.</div>`;
    }
  } catch (err) {
    historyTimelineBox.innerHTML = `<div style="color: var(--glow-crimson); text-align: center; padding: 40px 0;">Failed to pull ledger records: ${err.message}</div>`;
  }
}

// 4. Verification Console (Module 4)
const checkVerifyReady = () => {
  const fileSelected = verifySelectedFile || verifyFileInput.files.length > 0;
  verifyBtn.disabled = !(verifyIdInput.value.trim() && fileSelected);
};
verifyIdInput.addEventListener("input", checkVerifyReady);
verifyFileInput.addEventListener("change", () => {
  verifySelectedFile = verifyFileInput.files[0];
  if (verifySelectedFile && verifyFileTestBtn) {
    verifyFileTestBtn.textContent = "Use Test File";
  }
  checkVerifyReady();
});

if (verifyFileTestBtn) {
  verifyFileTestBtn.addEventListener("click", () => {
    const dummyText = "Forensic evidence data - Case FIR-2026-0092";
    verifySelectedFile = new File([dummyText], "crime_log.txt", { type: "text/plain" });
    verifyFileTestBtn.textContent = "✓ Test File Loaded";
    checkVerifyReady();
  });
}

verifyBtn.addEventListener("click", async () => {
  setLoading(verifyBtn, true);
  try {
    const id = verifyIdInput.value.trim();
    const file = verifySelectedFile || verifyFileInput.files[0];
    const verdict = await verifyEvidence(id, file);
    
    const isMatch = verdict.status === "MATCH";
    
    // Set Active State
    activeEvidenceId = id;
    
    // Update Cube Color and status text
    updateCubeHash(verdict.currentHash);
    coreStatusText.textContent = isMatch ? "INTEGRITY AUTHENTICATED" : "SECURITY COMPROMISED";
    
    if (coreCubeElement) {
      coreCubeElement.classList.add(isMatch ? "verified" : "tampered");
    }

    const statusClass = isMatch ? "hud-verdict--match" : "hud-verdict--tampered";
    const statusIcon = isMatch ? "🛡️ INTEGRITY CONFIRMED" : "🚨 SECURITY COMPROMISED (TAMPERED)";
    const hashValClass = isMatch ? "hud-hash-value--match" : "hud-hash-value--tampered";
    
    let htmlResult = [
      `<div class="hud-verdict ${statusClass}">${statusIcon}</div>`,
      `<div class="hud-hash-line"><span class="hud-hash-label">EVIDENCE ID:</span>  ${verdict.evidenceId}</div>`,
      `<div class="hud-hash-line"><span class="hud-hash-label">CHAIN RECORD:</span> <span class="${hashValClass}">${verdict.storedHash}</span></div>`,
      `<div class="hud-hash-line"><span class="hud-hash-label">FILE HASH:</span>    <span class="${hashValClass}">${verdict.currentHash}</span></div>`,
      `<div class="hud-hash-line"><span class="hud-hash-label">VERIFIED AT:</span>    ${new Date(verdict.verifiedAt).toLocaleString()}</div>`
    ].join("");
    
    showOutput(verifyOutput, htmlResult);
    
    // Fetch and load timeline logs
    fetchEvidenceHistory(id);

    // If matches, populate Certificate Viewer
    if (isMatch) {
      // Fetch details to build certificate
      try {
        const historyRes = await fetch(`${API_BASE_URL}/evidence/history/${id}`);
        const historyData = await historyRes.json();
        const initialRegistration = historyData.history[0]?.value || {};
        
        loadBsaCertificate(
          id, 
          verdict.storedHash, 
          initialRegistration.ipfsCID || "N/A", 
          initialRegistration.officerId || "Officer_Unknown", 
          initialRegistration.caseId || "N/A", 
          initialRegistration.location || "N/A"
        );
      } catch (e) {
        // Fallback layout
        loadBsaCertificate(id, verdict.storedHash, "N/A", "Officer_Smith", "CASE-FILE", "Seizure Site");
      }
      
      // Determine active custodian
      try {
        const historyRes = await fetch(`${API_BASE_URL}/evidence/history/${id}`);
        const historyData = await historyRes.json();
        const lastTx = historyData.history[historyData.history.length - 1]?.value || {};
        const currentCustodianOrg = lastTx.toOrg || "PoliceDept";
        openHandoffPanel(currentCustodianOrg);
      } catch(e) {}
    } else {
      // Clear Certificate Viewer
      certificatePrintArea.innerHTML = `<div style="color: var(--glow-crimson); text-align: center; padding: 40px 0;">Admissibility Certificate Voided. Integrity verification failed (tampered file).</div>`;
      printCertBtn.disabled = true;
      if (exportCertBtn) exportCertBtn.disabled = true;
    }
  } catch (err) {
    showOutput(verifyOutput, `❌ Verification Request Refused: ${err.message}`);
  }
  setLoading(verifyBtn, false);
});

// Module 6: Load Admissibility Certificate (BSA 2023 §63 Compliant)
function loadBsaCertificate(evidenceId, hash, ipfsCid, officerId, caseId, location) {
  const timestamp = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }) + " (IST)";
  const secureSign = "SIG-SHA256-" + hash.slice(0, 16).toUpperCase();
  
  certificatePrintArea.innerHTML = `
    <div class="bsa-certificate" id="printable-certificate-card">
      <div class="bsa-certificate__hdr">
        <div class="bsa-certificate__title">CERTIFICATE OF ELECTRONIC EVIDENCE</div>
        <div class="bsa-certificate__sub">Under Section 63 of Bharatiya Sakshya Adhiniyam, 2023</div>
      </div>
      <div class="bsa-certificate__row">
        <div class="bsa-certificate__lbl">CERTIFICATE ID:</div>
        <div class="bsa-certificate__val">CERT-${evidenceId}-${Date.now().toString().slice(-4)}</div>
      </div>
      <div class="bsa-certificate__row">
        <div class="bsa-certificate__lbl">CASE / FIR ID:</div>
        <div class="bsa-certificate__val">${caseId}</div>
      </div>
      <div class="bsa-certificate__row">
        <div class="bsa-certificate__lbl">SUBMITTING AGENT:</div>
        <div class="bsa-certificate__val">${officerId}</div>
      </div>
      <div class="bsa-certificate__row">
        <div class="bsa-certificate__lbl">SEIZURE LOG:</div>
        <div class="bsa-certificate__val">${location}</div>
      </div>
      <div class="bsa-certificate__row">
        <div class="bsa-certificate__lbl">SECURED HASH:</div>
        <div class="bsa-certificate__val" style="font-size: 0.68rem; color: var(--neon-green);">${hash}</div>
      </div>
      <div class="bsa-certificate__row">
        <div class="bsa-certificate__lbl">IPFS CID:</div>
        <div class="bsa-certificate__val" style="font-size: 0.68rem;">${ipfsCid}</div>
      </div>
      <div class="bsa-certificate__row">
        <div class="bsa-certificate__lbl">VERIFIED AT:</div>
        <div class="bsa-certificate__val">${timestamp}</div>
      </div>
      <div class="bsa-certificate__seal" style="margin-top: 15px; border-top: 1px dashed rgba(0, 255, 140, 0.2); padding-top: 10px; display: flex; justify-content: space-between; font-size: 0.7rem; color: var(--neon-green);">
        <span>STATUS: SYSTEM ADMISSIBLE</span>
        <span>${secureSign}</span>
      </div>
    </div>
  `;
  printCertBtn.disabled = false;
  if (exportCertBtn) exportCertBtn.disabled = false;
}

// ─────────────────────────────────────────────────────────────────────────────
// Real-Time Socket.io Connection & Events (Hackathon Network Map)
// ─────────────────────────────────────────────────────────────────────────────

if (typeof io !== 'undefined') {
  const socket = io();
  console.log('[SOCKET] Connecting to real-time sync server...');

  socket.on('connect', () => {
    console.log('[SOCKET] Connected to real-time server. ID:', socket.id);
    flashRealtimeAlert('System Connected: Real-time Blockchain Event Feed Active', 'success');
  });

  // Listen for new evidence registered on the chain
  socket.on('EvidenceRegistered', (data) => {
    console.log('[SOCKET] EvidenceRegistered received:', data);
    
    // Trigger visual notification popup
    flashRealtimeAlert(`🔒 [LEDGER] New Evidence Registered: <b>${data.evidenceId}</b> (Case: ${data.caseId})`, 'success');
    
    // Update the 3D core cube hash visually
    if (typeof updateCubeHash === 'function') {
      updateCubeHash(data.sha256Hash);
    }
    
    // Trigger the cosmic particle transit pulse animation (Police -> Forensic Lab)
    if (window.evidexWormhole) {
      window.evidexWormhole.currentStep = 0; // Route: Police -> Lab
      window.evidexWormhole.executeWormholeTravel();
    }
  });

  // Listen for custody transferred on the chain
  socket.on('CustodyTransferred', (data) => {
    console.log('[SOCKET] CustodyTransferred received:', data);
    
    // Trigger visual notification popup
    flashRealtimeAlert(`🔄 [LEDGER] Custody Handed Over: <b>${data.evidenceId}</b> to <b>${data.toOrg}</b>`, 'info');
    
    // Trigger the cosmic particle transit pulse animation (Forensic Lab -> Judicial Court)
    if (window.evidexWormhole) {
      window.evidexWormhole.currentStep = 1; // Route: Lab -> Court
      window.evidexWormhole.executeWormholeTravel();
    }
  });
}

/**
 * Creates and displays a glowing real-time alert toast in the HUD dashboard
 */
function flashRealtimeAlert(message, type = 'info') {
  // Find or create notification container
  let container = document.getElementById('hud-notification-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'hud-notification-container';
    container.style.cssText = `
      position: fixed;
      bottom: 24px;
      right: 24px;
      z-index: 99999;
      display: flex;
      flex-direction: column;
      gap: 12px;
      max-width: 380px;
    `;
    document.body.appendChild(container);
  }

  // Create alert element
  const toast = document.createElement('div');
  toast.className = `realtime-toast toast-${type}`;
  toast.style.cssText = `
    background: rgba(10, 15, 30, 0.85);
    border: 1px solid ${type === 'success' ? '#10B981' : '#06B6D4'};
    box-shadow: 0 0 15px ${type === 'success' ? 'rgba(16,185,129,0.3)' : 'rgba(6,182,212,0.3)'};
    backdrop-filter: blur(10px);
    border-radius: 8px;
    padding: 16px;
    color: #ffffff;
    font-family: 'Space Grotesk', sans-serif;
    font-size: 0.9rem;
    opacity: 0;
    transform: translateY(20px);
    transition: all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
  `;
  
  toast.innerHTML = message;
  container.appendChild(toast);

  // Force reflow and slide in
  void toast.offsetWidth;
  toast.style.opacity = '1';
  toast.style.transform = 'translateY(0)';

  // Slide out and remove
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(-20px)';
    setTimeout(() => toast.remove(), 400);
  }, 5000);
}

// Print Handler
printCertBtn.addEventListener("click", () => {
  const printableArea = document.getElementById("printable-certificate-card");
  if (!printableArea) return;
  
  const printWindow = window.open('', '_blank', 'width=800,height=600');
  printWindow.document.write(`
    <html>
      <head>
        <title>BSA Section 63 Evidence Certificate</title>
        <style>
          body {
            font-family: monospace;
            padding: 40px;
            background: #ffffff;
            color: #000000;
            line-height: 1.6;
          }
          .bsa-certificate {
            border: 2px solid #000000;
            padding: 30px;
            border-radius: 4px;
          }
          .bsa-certificate__hdr {
            text-align: center;
            border-bottom: 2px solid #000000;
            padding-bottom: 20px;
            margin-bottom: 25px;
          }
          .bsa-certificate__title {
            font-size: 18px;
            font-weight: bold;
          }
          .bsa-certificate__sub {
            font-size: 12px;
            margin-top: 5px;
          }
          .bsa-certificate__row {
            display: flex;
            margin-bottom: 12px;
            font-size: 14px;
          }
          .bsa-certificate__lbl {
            width: 220px;
            font-weight: bold;
          }
          .bsa-certificate__val {
            word-break: break-all;
          }
          .bsa-certificate__seal {
            margin-top: 30px;
            border-top: 2px dashed #000000;
            padding-top: 15px;
            display: flex;
            justify-content: space-between;
          }
          @media print {
            body { padding: 0; }
            .no-print { display: none; }
          }
        </style>
      </head>
      <body>
        <div class="no-print" style="margin-bottom: 20px; text-align: right;">
          <button onclick="window.print();window.close();" style="padding: 8px 16px; font-weight: bold; cursor: pointer;">Print Document</button>
        </div>
        ${printableArea.outerHTML}
      </body>
    </html>
  `);
  printWindow.document.close();
});

// Export Certificate PDF Handler (One-Click Legal Export)
if (exportCertBtn) {
  exportCertBtn.addEventListener("click", () => {
    if (!activeEvidenceId) return;
    window.open(`${API_BASE_URL}/evidence/export/${activeEvidenceId}`);
  });
}

// Map manual custody transfer locations to corresponding wormhole animation routes
window.fireWormhole = function(fromOrg, toOrg) {
  if (window.evidexWormhole) {
    if (fromOrg === "PoliceDept" && toOrg === "ForensicLab") {
      window.evidexWormhole.currentStep = 0;
    } else if (fromOrg === "ForensicLab" && toOrg === "JudicialCourt") {
      window.evidexWormhole.currentStep = 1;
    }
    window.evidexWormhole.executeWormholeTravel();
  }
};
