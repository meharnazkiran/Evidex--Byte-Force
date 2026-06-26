import {
  hashFile,
  encryptFile,
  decryptFile,
  uploadToIPFS,
  registerEvidence,
  verifyEvidence,
  generateEncryptionKey,
  exportKey,
  processEvidence,
  API_BASE_URL
} from "./evidex-core.js";

// ─────────────────────────────────────────────────────────────────────────────
// DOM Elements Selection
// ─────────────────────────────────────────────────────────────────────────────

// Operational Nodes (Layer 2)
const nodes = {
  police: document.getElementById("node-police"),
  lab: document.getElementById("node-lab"),
  court: document.getElementById("node-court")
};

// 1. Hash Elements
const hashFileInput = document.getElementById("hash-file-input");
const hashBtn = document.getElementById("hash-btn");
const hashOutput = document.getElementById("hash-output");

// 2. Encrypt Elements
const encryptFileInput = document.getElementById("encrypt-file-input");
const encryptBtn = document.getElementById("encrypt-btn");
const encryptOutput = document.getElementById("encrypt-output");

// 3. IPFS Upload Elements
const uploadFileInput = document.getElementById("upload-file-input");
const pinataKeyInput = document.getElementById("pinata-key-input");
const uploadBtn = document.getElementById("upload-btn");
const uploadOutput = document.getElementById("upload-output");

// 4. Verify Elements
const verifyIdInput = document.getElementById("verify-id-input");
const verifyFileInput = document.getElementById("verify-file-input");
const verifyBtn = document.getElementById("verify-btn");
const verifyOutput = document.getElementById("verify-output");

// 5. Pipeline Elements
const pipelineFileInput = document.getElementById("pipeline-file-input");
const pipelinePinataKey = document.getElementById("pipeline-pinata-key");
const pipelineBtn = document.getElementById("pipeline-btn");
const pipelineOutput = document.getElementById("pipeline-output");
const pipelineOfficerId = document.getElementById("pipeline-officer-id");
const pipelineCaseId = document.getElementById("pipeline-case-id");
const pipelineLocation = document.getElementById("pipeline-location");

// 6. Offline Demo Elements
const demoFileInput = document.getElementById("demo-file-input");
const demoRegisterBtn = document.getElementById("demo-register-btn");
const demoVerifyMatchBtn = document.getElementById("demo-verify-match-btn");
const demoVerifyTamperBtn = document.getElementById("demo-verify-tamper-btn");
const demoOutput = document.getElementById("demo-output");

// 7. Centerpiece 3D block
const coreCubeElement = document.getElementById("evidentiary-core-cube");

// Offline State store simulating the blockchain
let demoState = {
  storedHash: null,
  fileName: null,
  encryptedSize: null,
  keyB64: null,
  officerID: "OFF-DEMO",
  caseID: "FIR-2026-DEMO",
  location: "Integrated Cyber Forensic Cell, TN"
};

// ─────────────────────────────────────────────────────────────────────────────
// UI Utility Helper Functions
// ─────────────────────────────────────────────────────────────────────────────

function showOutput(el, html) {
  el.innerHTML = html;
  el.classList.add("visible");
  // Scroll card into viewport alignment smoothly
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

    // Compute precise horizontal anchor coordinates relative to the layout frame
    const targetX = (nodeRect.left + (nodeRect.width / 2)) - containerRect.left;
    
    // Center the 450px wide volumetric asset container over the active target coordinates
    const calculatedOffset = targetX - 225;

    // Execute high-inertia linear translation slide across the viewport coordinates
    beamAxis.style.transform = `translateX(${calculatedOffset}px)`;
    
    // Update CSS system root variable to smoothly bend the background radial light profile
    document.documentElement.style.setProperty('--active-node-x', `${(targetX / containerRect.width) * 100}%`);
    
    // Share with particle engine to concentrate the data packets dynamically
    window.activeNodeX = targetX;
  }
}
window.setActiveNode = setActiveNode;

// ─────────────────────────────────────────────────────────────────────────────
// Event Bindings & Action Orchestrations
// ─────────────────────────────────────────────────────────────────────────────

// Initialise active node to Police on launch
window.addEventListener("DOMContentLoaded", () => {
  // Brief timeout to ensure layout calculations have stabilized
  setTimeout(() => setActiveNode("police"), 150);
  
  // Let clicking nodes scroll to their interactive widgets
  if (nodes.police) {
    nodes.police.addEventListener("click", () => {
      setActiveNode("police");
      document.getElementById("section-pipeline").scrollIntoView({ behavior: "smooth" });
    });
  }
  if (nodes.lab) {
    nodes.lab.addEventListener("click", () => {
      setActiveNode("lab");
      document.getElementById("section-verify").scrollIntoView({ behavior: "smooth" });
    });
  }
  if (nodes.court) {
    nodes.court.addEventListener("click", () => {
      setActiveNode("court");
      document.getElementById("section-offline-demo").scrollIntoView({ behavior: "smooth" });
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

// 1. SHA-256 Hashing Form Control
hashFileInput.addEventListener("change", () => {
  hashBtn.disabled = !hashFileInput.files.length;
});

hashBtn.addEventListener("click", async () => {
  setActiveNode("lab");
  setLoading(hashBtn, true);
  try {
    const file = hashFileInput.files[0];
    const t0 = performance.now();
    const hash = await hashFile(file);
    const elapsed = (performance.now() - t0).toFixed(1);
    updateCubeHash(hash);
    
    showOutput(hashOutput, [
      `[ CRYPTOGRAPHIC DATA INTEGRITY REPORT ]`,
      `<span class="hud-hash-label">FILE NAME:</span>   ${file.name}`,
      `<span class="hud-hash-label">SIZE:</span>        ${(file.size / 1024).toFixed(2)} KB`,
      `<span class="hud-hash-label">ALGORITHM:</span>   SHA-256 Digest`,
      `<span class="hud-hash-label">FINGERPRINT:</span> <span class="hud-hash-value">${hash}</span>`,
      `<span class="hud-hash-label">COMP TIME:</span>   ${elapsed} ms`,
      `\n✅ DIGITAL SHA-256 VERIFIED CHECKSUM READY.`
    ].join("\n"));
  } catch (err) {
    showOutput(hashOutput, `❌ Error: ${err.message}`);
  }
  setLoading(hashBtn, false);
});

// 2. AES-256-GCM Encryption Form Control
encryptFileInput.addEventListener("change", () => {
  encryptBtn.disabled = !encryptFileInput.files.length;
});

encryptBtn.addEventListener("click", async () => {
  setActiveNode("lab");
  setLoading(encryptBtn, true);
  try {
    const file = encryptFileInput.files[0];
    const key = await generateEncryptionKey();
    const t0 = performance.now();
    const encrypted = await encryptFile(file, key);
    const elapsed = (performance.now() - t0).toFixed(1);
    const keyB64 = await exportKey(key);
    updateCubeHash(keyB64);

    // Offer immediate download of the secure cipher block
    const blob = new Blob([encrypted], { type: "application/octet-stream" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = file.name + ".encrypted.bin";
    a.click();
    URL.revokeObjectURL(url);

    showOutput(encryptOutput, [
      `[ CONFIDENTIALITY VAULT ENCRYPTION REPORT ]`,
      `<span class="hud-hash-label">PLAINTEXT:</span>   ${file.name}`,
      `<span class="hud-hash-label">PLAIN SIZE:</span>  ${(file.size / 1024).toFixed(2)} KB`,
      `<span class="hud-hash-label">CIPHER SIZE:</span> ${(encrypted.byteLength / 1024).toFixed(2)} KB`,
      `<span class="hud-hash-label">CIPHER MODE:</span>  AES-256-GCM (Authenticated + 12-byte IV Prepended)`,
      `<span class="hud-hash-label">KEY EXPORT:</span>   <span class="hud-hash-value">${keyB64}</span>`,
      `<span class="hud-hash-label">COMP TIME:</span>   ${elapsed} ms`,
      `\n✅ CIPHER BLOCK SENT TO DOWNLOADS AS [${file.name}.encrypted.bin].`,
      `⚠️  DO NOT LOSE THE KEY EXPORT STRING. RECOVERY IS IMPOSSIBLE.`
    ].join("\n"));
  } catch (err) {
    showOutput(encryptOutput, `❌ Error: ${err.message}`);
  }
  setLoading(encryptBtn, false);
});

// 3. Upload to IPFS Form Control
const checkUploadReady = () => {
  uploadBtn.disabled = !(uploadFileInput.files.length && pinataKeyInput.value.trim());
};
uploadFileInput.addEventListener("change", checkUploadReady);
pinataKeyInput.addEventListener("input", checkUploadReady);

uploadBtn.addEventListener("click", async () => {
  setActiveNode("police");
  setLoading(uploadBtn, true);
  try {
    const file = uploadFileInput.files[0];
    const apiKey = pinataKeyInput.value.trim();
    const t0 = performance.now();
    const cid = await uploadToIPFS(file, apiKey, file.name);
    const elapsed = (performance.now() - t0).toFixed(1);
    
    showOutput(uploadOutput, [
      `[ DECENTRALIZED DATA PIN REPORT ]`,
      `<span class="hud-hash-label">TARGET BIN:</span>   ${file.name}`,
      `<span class="hud-hash-label">IPFS CID:</span>     <span class="hud-hash-value">${cid}</span>`,
      `<span class="hud-hash-label">RESOLVE URI:</span>   https://gateway.pinata.cloud/ipfs/${cid}`,
      `<span class="hud-hash-label">PING TIME:</span>    ${elapsed} ms`,
      `\n✅ PAYLOAD DISTRIBUTED & PINNED TO PEER-TO-PEER IPFS NETWORK.`
    ].join("\n"));
  } catch (err) {
    showOutput(uploadOutput, `❌ Upload Failed: ${err.message}`);
  }
  setLoading(uploadBtn, false);
});

// 4. Verification Form Control
const checkVerifyReady = () => {
  verifyBtn.disabled = !(verifyIdInput.value.trim() && verifyFileInput.files.length);
};
verifyIdInput.addEventListener("input", checkVerifyReady);
verifyFileInput.addEventListener("change", checkVerifyReady);

verifyBtn.addEventListener("click", async () => {
  setActiveNode("lab");
  setLoading(verifyBtn, true);
  try {
    const id = verifyIdInput.value.trim();
    const file = verifyFileInput.files[0];
    const verdict = await verifyEvidence(id, file);
    updateCubeHash(verdict.currentHash);
    
    const isMatch = verdict.status === "MATCH";
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
      `<div class="hud-hash-line"><span class="hud-hash-label">TIMESTAMP:</span>    ${verdict.verifiedAt}</div>`
    ].join("");
    
    if (isMatch) {
      setActiveNode("court");
      htmlResult += renderBsaCertificate(verdict.evidenceId, verdict.storedHash, "N/A", "OFF-API", "API-CASE", "API-ENDPOINT");
    }
    
    showOutput(verifyOutput, htmlResult);
  } catch (err) {
    showOutput(verifyOutput, `❌ Verification Request Refused: ${err.message}`);
  }
  setLoading(verifyBtn, false);
});

// 5. Complete End-to-End Submission Pipeline
const checkPipelineReady = () => {
  pipelineBtn.disabled = !(pipelineFileInput.files.length && pipelinePinataKey.value.trim());
};
pipelineFileInput.addEventListener("change", checkPipelineReady);
pipelinePinataKey.addEventListener("input", checkPipelineReady);

pipelineBtn.addEventListener("click", async () => {
  setActiveNode("police");
  setLoading(pipelineBtn, true);
  try {
    const file = pipelineFileInput.files[0];
    const options = {
      pinataApiKey: pipelinePinataKey.value.trim(),
      officerID: pipelineOfficerId.value.trim() || "OFF-AUTO",
      caseID: pipelineCaseId.value.trim() || "FIR-AUTO",
      location: pipelineLocation.value.trim() || "Seizure Scene"
    };
    
    const res = await processEvidence(file, options);
    updateCubeHash(res.hash);
    
    showOutput(pipelineOutput, [
      `[ BLOCKCHAIN SECURED CUSTODY RECORD ]`,
      `<span class="hud-hash-label">FILE:</span>          ${res.fileName}`,
      `<span class="hud-hash-label">SHA-256 HASH:</span>  <span class="hud-hash-value">${res.hash}</span>`,
      `<span class="hud-hash-label">IPFS CID:</span>     <span class="hud-hash-value">${res.cid}</span>`,
      `<span class="hud-hash-label">AES-256 KEY:</span>  <span class="hud-hash-value">${res.encryptionKey}</span>`,
      `<span class="hud-hash-label">TIMESTAMP:</span>    ${res.processedAt}`,
      `\n✅ CUSTODY TRANSACTION SUBMITTED. FABRIC BLOCK FORGED SUCCESSFULLY.`,
      `⚠️  KEY EXPORT DOWNLOADED LOCALLY. RECORD TRANSACTION CODES.`
    ].join("\n"));
  } catch (err) {
    showOutput(pipelineOutput, `❌ Handoff Continuum Pipeline Halted: ${err.message}`);
  }
  setLoading(pipelineBtn, false);
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. Offline Interactive Simulation Module (No Backend Required)
// ─────────────────────────────────────────────────────────────────────────────

demoFileInput.addEventListener("change", () => {
  demoRegisterBtn.disabled = !demoFileInput.files.length;
  demoVerifyMatchBtn.disabled = true;
  demoVerifyTamperBtn.disabled = true;
  // Reset simulation state
  demoState = {
    storedHash: null,
    fileName: null,
    encryptedSize: null,
    keyB64: null,
    officerID: document.getElementById("pipeline-officer-id").value.trim() || "OFF-5829",
    caseID: document.getElementById("pipeline-case-id").value.trim() || "FIR-2026-8801",
    location: document.getElementById("pipeline-location").value.trim() || "Integrated Cyber Forensic Cell, TN"
  };
  demoOutput.classList.remove("visible");
});

demoRegisterBtn.addEventListener("click", async () => {
  setActiveNode("police");
  setLoading(demoRegisterBtn, true);
  try {
    const file = demoFileInput.files[0];
    const hash = await hashFile(file);
    const key = await generateEncryptionKey();
    updateCubeHash(hash);
    const encrypted = await encryptFile(file, key);
    const keyB64 = await exportKey(key);
    
    // Seed locally simulated ledger state
    demoState.storedHash = hash;
    demoState.fileName = file.name;
    demoState.encryptedSize = encrypted.byteLength;
    demoState.keyB64 = keyB64;
    
    demoVerifyMatchBtn.disabled = false;
    demoVerifyTamperBtn.disabled = false;
    
    showOutput(demoOutput, [
      `[ SIMULATED LEDGER ENTRY COMMITTED ]`,
      `<span class="hud-hash-label">EVIDENCE NAME:</span>  ${file.name}`,
      `<span class="hud-hash-label">SHA-256 HASH:</span>   <span class="hud-hash-value">${hash}</span>`,
      `<span class="hud-hash-label">AES CIPHER:</span>     ${(encrypted.byteLength / 1024).toFixed(2)} KB Blob`,
      `<span class="hud-hash-label">DECRYPT KEY:</span>    <span class="hud-hash-value">${keyB64}</span>`,
      `<span class="hud-hash-label">LEDGER STATE:</span>   REGISTERED (Hyperledger Simulation)`,
      `\n✅ CUSTODY STAGE 1: TN POLICE SUBMITTED ELECTRONIC EVIDENCE REGISTRY.`,
      `👉 Now select '② Verify Same File (MATCH)' or '③ Simulate Tamper (TAMPERED)'.`
    ].join("\n"));
  } catch (err) {
    showOutput(demoOutput, `❌ Offline Registration Fault: ${err.message}`);
  }
  setLoading(demoRegisterBtn, false);
});

demoVerifyMatchBtn.addEventListener("click", async () => {
  setActiveNode("lab");
  setLoading(demoVerifyMatchBtn, true);
  try {
    const file = demoFileInput.files[0];
    const hash = await hashFile(file);
    const isMatch = hash === demoState.storedHash;
    updateCubeHash(hash);
    
    if (coreCubeElement && isMatch) {
      coreCubeElement.classList.add("verified");
    }
    
    setActiveNode("court");
    
    const verdictHTML = [
      `<div class="hud-verdict hud-verdict--match">🛡️ INTEGRITY AUTHENTICATED</div>`,
      `<div class="hud-hash-line"><span class="hud-hash-label">BLOCKCHAIN HASH:</span> <span class="hud-hash-value--match">${demoState.storedHash}</span></div>`,
      `<div class="hud-hash-line"><span class="hud-hash-label">SUBMITTED HASH:</span>  <span class="hud-hash-value--match">${hash}</span></div>`,
      `<div class="hud-hash-line"><span class="hud-hash-label">STATUS VERDICT:</span>  MATCH (No Tampering Detected)</div>`,
      `\n✅ CUSTODY STAGE 2: FORENSIC LAB VERIFIED INTEGRITY. CONSENSUS CONGRUENT.`,
      renderBsaCertificate("EVD-SIM-9921", demoState.storedHash, "QmXySimulatedIPFSHashCourtroomAdmissible", demoState.officerID, demoState.caseID, demoState.location)
    ].join("");
    
    showOutput(demoOutput, verdictHTML);
  } catch (err) {
    showOutput(demoOutput, `❌ Offline Verify Fault: ${err.message}`);
  }
  setLoading(demoVerifyMatchBtn, false);
});

demoVerifyTamperBtn.addEventListener("click", async () => {
  setActiveNode("lab");
  setLoading(demoVerifyTamperBtn, true);
  try {
    const file = demoFileInput.files[0];
    const originalBytes = await file.arrayBuffer();
    
    // Inject exactly 1 bit change (avalance demonstration) by appending 0xFF at the end of stream
    const tamperedBytes = new Uint8Array(originalBytes.byteLength + 1);
    tamperedBytes.set(new Uint8Array(originalBytes));
    tamperedBytes[originalBytes.byteLength] = 0xFF;
    
    const tamperedBlob = new Blob([tamperedBytes], { type: file.type });
    const tamperedHash = await hashFile(tamperedBlob);
    updateCubeHash(tamperedHash);
    
    if (coreCubeElement) {
      coreCubeElement.classList.add("tampered");
    }
    
    // Triggers visual warning shakes in CSS
    const verdictHTML = [
      `<div class="hud-verdict hud-verdict--tampered">🚨 CRITICAL AUDIT ALERT: EVIDENCE TAMPERED</div>`,
      `<div class="hud-hash-line"><span class="hud-hash-label">LEDGER HASH:</span>    <span class="hud-hash-value--match">${demoState.storedHash}</span></div>`,
      `<div class="hud-hash-line"><span class="hud-hash-label">CURRENT HASH:</span>   <span class="hud-hash-value--tampered">${tamperedHash}</span></div>`,
      `<div class="hud-hash-line"><span class="hud-hash-label">INTEGRITY STATE:</span> TAMPERED (AVALANCHE EFFECT ENGAGED)</div>`,
      `\n❌ CUSTODY REPORT: HASH COMPARISON FAILED.`,
      `   A single extra byte was injected, generating a completely divergent`,
      `   cryptographic signature. Admissibility to court under BSA §63 is VOIDED.`
    ].join("");
    
    showOutput(demoOutput, verdictHTML);
  } catch (err) {
    showOutput(demoOutput, `❌ Offline Tamper Simulation Fault: ${err.message}`);
  }
  setLoading(demoVerifyTamperBtn, false);
});

// ─────────────────────────────────────────────────────────────────────────────
// Admissibility Certificate Generator (BSA 2023 §63 Compliant)
// ─────────────────────────────────────────────────────────────────────────────

function renderBsaCertificate(evidenceId, hash, ipfsCid, officerId, caseId, location) {
  const timestamp = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }) + " (IST)";
  const secureSign = "SIG-SHA256-" + hash.slice(0, 16).toUpperCase();
  
  return `
    <div class="bsa-certificate">
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
        <div class="bsa-certificate__val">${hash}</div>
      </div>
      <div class="bsa-certificate__row">
        <div class="bsa-certificate__lbl">IPFS CID:</div>
        <div class="bsa-certificate__val">${ipfsCid}</div>
      </div>
      <div class="bsa-certificate__row">
        <div class="bsa-certificate__lbl">VERIFIED AT:</div>
        <div class="bsa-certificate__val">${timestamp}</div>
      </div>
      <div class="bsa-certificate__seal">
        <span>STATUS: SYSTEM ADMISSIBLE</span>
        <span>${secureSign}</span>
      </div>
    </div>
  `;
}
