const config = require('../config');

// In-memory ledger fallback in case the blockchain gateway is offline
const mockLedger = new Map();
const mockHistory = new Map();
let useMockLedger = false;

/**
 * Initialize fabricService - check if Gateway API is reachable.
 */
async function initFabric() {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000);
    
    // Attempt a simple check of the gateway (e.g. ping or fetch index)
    // If gateway is up, it might return 500 for non-existent id, but it resolves without throwing.
    // If it is down, it throws a network connection error.
    await fetch(`${config.REST_GATEWAY_URL}/api/evidence/history/test-probe`, { 
      signal: controller.signal 
    });
    
    clearTimeout(timeoutId);
    console.log(`Successfully connected to Blockchain Gateway at: ${config.REST_GATEWAY_URL}`);
  } catch (error) {
    console.warn(`[WARNING] Blockchain Gateway is offline or unreachable: ${error.message}. Enabling Mock Ledger Mode.`);
    useMockLedger = true;
  }
}

/**
 * Call gateway to register new evidence on chain.
 */
async function registerEvidence(evidenceId, caseId, officerId, ipfsCID, sha256Hash, timestamp) {
  if (!useMockLedger) {
    try {
      const response = await fetch(`${config.REST_GATEWAY_URL}/api/evidence/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ evidenceId, caseId, officerId, ipfsCID, sha256Hash, timestamp })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to register evidence');
      }
      return data;
    } catch (error) {
      if (error.message.includes('ECONNREFUSED') || error.message.includes('fetch failed')) {
        console.warn(`[WARNING] Gateway went offline. Switching to Mock Ledger fallback.`);
        useMockLedger = true;
        // Retry using mock ledger by calling registerEvidence again
        return registerEvidence(evidenceId, caseId, officerId, ipfsCID, sha256Hash, timestamp);
      } else {
        throw error;
      }
    }
  }

  // Mock Ledger execution
  console.log(`Ledger (Mock): Registering evidence ${evidenceId}`);
  if (mockLedger.has(evidenceId)) {
    throw new Error(`the evidence ${evidenceId} already exists`);
  }

  const record = { evidenceId, caseId, officerId, ipfsCID, sha256Hash, timestamp };
  mockLedger.set(evidenceId, record);

  // Initialize history
  const historyItem = {
    txId: `tx-${Math.random().toString(36).substring(2, 15)}`,
    value: { ...record },
    timestamp: new Date().toISOString(),
    isDelete: false
  };
  mockHistory.set(evidenceId, [historyItem]);

  return { message: 'Evidence successfully registered', evidenceId };
}

/**
 * Call gateway to transfer custody of an evidence item.
 */
async function transferCustody(evidenceId, fromOrg, toOrg, reason, timestamp) {
  if (!useMockLedger) {
    try {
      const response = await fetch(`${config.REST_GATEWAY_URL}/api/evidence/transfer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ evidenceId, fromOrg, toOrg, reason, timestamp })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to transfer custody');
      }
      return data;
    } catch (error) {
      if (error.message.includes('ECONNREFUSED') || error.message.includes('fetch failed')) {
        console.warn(`[WARNING] Gateway went offline. Switching to Mock Ledger fallback.`);
        useMockLedger = true;
        // Retry using mock ledger by calling transferCustody again
        return transferCustody(evidenceId, fromOrg, toOrg, reason, timestamp);
      } else {
        throw error;
      }
    }
  }

  // Mock Ledger execution
  console.log(`Ledger (Mock): Transferring custody of ${evidenceId} from ${fromOrg} to ${toOrg}`);
  const record = mockLedger.get(evidenceId);
  if (!record) {
    throw new Error(`the evidence ${evidenceId} does not exist`);
  }

  // Update record state
  record.fromOrg = fromOrg;
  record.toOrg = toOrg;
  record.reason = reason;
  record.timestamp = timestamp;
  mockLedger.set(evidenceId, record);

  // Append history
  const history = mockHistory.get(evidenceId) || [];
  const historyItem = {
    txId: `tx-${Math.random().toString(36).substring(2, 15)}`,
    value: { ...record },
    timestamp: new Date().toISOString(),
    isDelete: false
  };
  history.push(historyItem);
  mockHistory.set(evidenceId, history);

  return { message: 'Custody successfully transferred', evidenceId, fromOrg, toOrg };
}

/**
 * Call gateway to verify evidence integrity.
 */
async function verifyIntegrity(evidenceId, providedHash) {
  if (!useMockLedger) {
    try {
      const response = await fetch(`${config.REST_GATEWAY_URL}/api/evidence/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ evidenceId, providedHash })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to verify integrity');
      }
      return data;
    } catch (error) {
      if (error.message.includes('ECONNREFUSED') || error.message.includes('fetch failed')) {
        console.warn(`[WARNING] Gateway went offline. Switching to Mock Ledger fallback.`);
        useMockLedger = true;
        // Retry using mock ledger by calling verifyIntegrity again
        return verifyIntegrity(evidenceId, providedHash);
      } else {
        throw error;
      }
    }
  }

  // Mock Ledger execution
  console.log(`Ledger (Mock): Verifying integrity of ${evidenceId}`);
  const record = mockLedger.get(evidenceId);
  if (!record) {
    throw new Error(`the evidence ${evidenceId} does not exist`);
  }

  // Get original registration record (first history entry)
  const history = mockHistory.get(evidenceId) || [];
  const originalRecord = history[0] ? history[0].value : record;

  const verified = originalRecord.sha256Hash === providedHash;
  return {
    verified,
    storedHash: originalRecord.sha256Hash,
    timestamp: record.timestamp
  };
}

/**
 * Call gateway to fetch evidence history.
 */
async function getEvidenceHistory(evidenceId) {
  if (!useMockLedger) {
    try {
      const response = await fetch(`${config.REST_GATEWAY_URL}/api/evidence/history/${evidenceId}`);
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to retrieve evidence history');
      }
      return data;
    } catch (error) {
      if (error.message.includes('ECONNREFUSED') || error.message.includes('fetch failed')) {
        console.warn(`[WARNING] Gateway went offline. Switching to Mock Ledger fallback.`);
        useMockLedger = true;
        // Retry using mock ledger by calling getEvidenceHistory again
        return getEvidenceHistory(evidenceId);
      } else {
        throw error;
      }
    }
  }

  // Mock Ledger execution
  console.log(`Ledger (Mock): Getting history for ${evidenceId}`);
  if (!mockLedger.has(evidenceId)) {
    throw new Error(`the evidence ${evidenceId} does not exist`);
  }

  const history = mockHistory.get(evidenceId) || [];
  return { evidenceId, history };
}

module.exports = {
  initFabric,
  registerEvidence,
  transferCustody,
  verifyIntegrity,
  getEvidenceHistory,
  isMockLedger: () => useMockLedger
};
