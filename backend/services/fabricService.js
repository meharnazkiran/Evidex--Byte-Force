const config = require('../config');

// In-memory ledger fallback in case the blockchain gateway is offline
const mockLedger = new Map();
const mockHistory = new Map();
let useMockLedger = false;

// Sentinel AI — Mock ACL for authorized AI users
const mockAIAccessList = new Set(['DCP_Rajesh', 'SP_Ananya']);

/**
 * Initialize fabricService - check if Gateway API is reachable.
 */
async function initFabric() {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000);
    
    await fetch(`${config.REST_GATEWAY_URL}/api/evidence/history/test-probe`, { 
      signal: controller.signal 
    });
    
    clearTimeout(timeoutId);
    console.log(`Successfully connected to Blockchain Gateway at: ${config.REST_GATEWAY_URL}`);

    // Seed the AI ACL on the live ledger (idempotent — chaincode skips duplicates)
    try {
      await fetch(`${config.REST_GATEWAY_URL}/api/ai/manage-access`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ officerId: 'DCP_Rajesh', action: 'add' })
      });
      await fetch(`${config.REST_GATEWAY_URL}/api/ai/manage-access`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ officerId: 'SP_Ananya', action: 'add' })
      });
      console.log('Sentinel AI: Seeded authorized officers on ledger ACL.');
    } catch (e) {
      console.warn('Sentinel AI: Could not seed ACL on live ledger (non-critical).');
    }
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

  record.fromOrg = fromOrg;
  record.toOrg = toOrg;
  record.reason = reason;
  record.timestamp = timestamp;
  mockLedger.set(evidenceId, record);

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

// ============================================================
// SENTINEL AI — Ledger Access Control & Metadata Retrieval
// ============================================================

/**
 * Check if an officer is authorized to use the AI analytics layer.
 */
async function checkAIAccess(officerId) {
  if (!useMockLedger) {
    try {
      const response = await fetch(`${config.REST_GATEWAY_URL}/api/ai/check-access`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ officerId })
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to check AI access');
      }
      return data.authorized;
    } catch (error) {
      if (error.message.includes('ECONNREFUSED') || error.message.includes('fetch failed')) {
        console.warn('[WARNING] Gateway offline for AI access check. Using mock ACL.');
        return mockAIAccessList.has(officerId);
      }
      throw error;
    }
  }

  console.log(`Ledger (Mock): Checking AI access for ${officerId}`);
  return mockAIAccessList.has(officerId);
}

/**
 * Add or remove an officer from the AI access list.
 */
async function manageAIAccess(officerId, action) {
  if (!useMockLedger) {
    try {
      const response = await fetch(`${config.REST_GATEWAY_URL}/api/ai/manage-access`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ officerId, action })
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to manage AI access');
      }
      return data;
    } catch (error) {
      if (error.message.includes('ECONNREFUSED') || error.message.includes('fetch failed')) {
        console.warn('[WARNING] Gateway offline. Managing mock ACL.');
        if (action === 'add') mockAIAccessList.add(officerId);
        else if (action === 'remove') mockAIAccessList.delete(officerId);
        return { message: `AI access ${action} successful for ${officerId} (mock)` };
      }
      throw error;
    }
  }

  if (action === 'add') mockAIAccessList.add(officerId);
  else if (action === 'remove') mockAIAccessList.delete(officerId);
  return { message: `AI access ${action} successful for ${officerId} (mock)` };
}

/**
 * Fetch all evidence records from the ledger for AI context building.
 */
async function getAllEvidence() {
  if (!useMockLedger) {
    try {
      const response = await fetch(`${config.REST_GATEWAY_URL}/api/evidence/all`);
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to get all evidence');
      }
      return data.evidence || [];
    } catch (error) {
      if (error.message.includes('ECONNREFUSED') || error.message.includes('fetch failed')) {
        console.warn('[WARNING] Gateway offline. Using mock ledger for AI context.');
        return Array.from(mockLedger.values());
      }
      throw error;
    }
  }

  console.log(`Ledger (Mock): Fetching all evidence for AI context`);
  return Array.from(mockLedger.values());
}

/**
 * Fetch all custody histories for AI analysis.
 */
async function getAllHistories() {
  const allEvidence = await getAllEvidence();
  const histories = {};
  
  for (const evidence of allEvidence) {
    try {
      const historyData = await getEvidenceHistory(evidence.evidenceId);
      histories[evidence.evidenceId] = historyData.history || [];
    } catch (e) {
      histories[evidence.evidenceId] = [];
    }
  }
  
  return histories;
}

module.exports = {
  initFabric,
  registerEvidence,
  transferCustody,
  verifyIntegrity,
  getEvidenceHistory,
  checkAIAccess,
  manageAIAccess,
  getAllEvidence,
  getAllHistories,
  isMockLedger: () => useMockLedger
};
