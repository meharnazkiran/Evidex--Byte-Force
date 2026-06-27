const { GoogleGenerativeAI } = require('@google/generative-ai');
const config = require('../config');
const fabricService = require('./fabricService');

let genAI;
let model;

/**
 * Initialize the Gemini AI model.
 */
function initAI() {
  if (!config.GEMINI_API_KEY) {
    console.warn('[SENTINEL AI] No GEMINI_API_KEY found. AI chat will be unavailable.');
    return false;
  }
  genAI = new GoogleGenerativeAI(config.GEMINI_API_KEY);
  model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
  console.log('[SENTINEL AI] Gemini 2.0 Flash model initialized.');
  return true;
}

/**
 * SECURITY LAYER: Strip sensitive fields from evidence records.
 * Removes ipfsCID and sha256Hash — the AI never sees evidence files or their hashes.
 */
function scrubSensitiveFields(records) {
  return records.map(record => {
    const scrubbed = { ...record };
    delete scrubbed.ipfsCID;
    delete scrubbed.sha256Hash;
    return scrubbed;
  });
}

/**
 * Build the full ledger context for the AI.
 * Fetches all evidence + histories, scrubs sensitive data, computes aggregate stats.
 */
async function buildLedgerContext() {
  const allEvidence = await fabricService.getAllEvidence();
  const allHistories = await fabricService.getAllHistories();

  // Scrub sensitive fields from evidence records
  const scrubbedEvidence = scrubSensitiveFields(allEvidence);

  // Scrub sensitive fields from history values too
  const scrubbedHistories = {};
  for (const [evidenceId, history] of Object.entries(allHistories)) {
    scrubbedHistories[evidenceId] = history.map(item => ({
      txId: item.txId,
      timestamp: item.timestamp,
      isDelete: item.isDelete,
      value: item.value ? (() => {
        const v = { ...item.value };
        delete v.ipfsCID;
        delete v.sha256Hash;
        return v;
      })() : null
    }));
  }

  // Compute aggregate statistics
  const stats = {
    totalEvidenceItems: scrubbedEvidence.length,
    uniqueCases: [...new Set(scrubbedEvidence.map(e => e.caseId))],
    uniqueOfficers: [...new Set(scrubbedEvidence.map(e => e.officerId))],
    organizations: {},
    transferCount: 0,
    evidencePerCase: {},
    evidencePerOfficer: {}
  };

  // Count evidence per case and per officer
  scrubbedEvidence.forEach(e => {
    stats.evidencePerCase[e.caseId] = (stats.evidencePerCase[e.caseId] || 0) + 1;
    stats.evidencePerOfficer[e.officerId] = (stats.evidencePerOfficer[e.officerId] || 0) + 1;
    if (e.toOrg) {
      stats.organizations[e.toOrg] = (stats.organizations[e.toOrg] || 0) + 1;
    }
    if (e.fromOrg) {
      stats.organizations[e.fromOrg] = (stats.organizations[e.fromOrg] || 0) + 1;
    }
  });

  // Count total transfers across all histories
  for (const history of Object.values(scrubbedHistories)) {
    if (history.length > 1) {
      stats.transferCount += history.length - 1; // first entry is registration, rest are transfers
    }
  }

  return {
    evidence: scrubbedEvidence,
    histories: scrubbedHistories,
    stats
  };
}

/**
 * The hardened system prompt for the AI.
 * Defines role boundaries and prevents evidence file access.
 */
const SYSTEM_PROMPT = `You are SENTINEL AI, the intelligence analytics engine for EVIDEX — a blockchain-based forensic evidence chain-of-custody platform built on Hyperledger Fabric.

YOUR ROLE:
- You are a METADATA-ONLY analyst. You analyze evidence management patterns, custody chains, officer activity, organizational workflows, and case statistics.
- You provide insights about case volumes, transfer anomalies, officer workload distribution, tampering risk indicators, and operational summaries.

SECURITY BOUNDARIES (ABSOLUTE — NEVER VIOLATE):
- You have NO access to evidence files, encrypted payloads, IPFS content identifiers (CIDs), or SHA-256 hashes.
- If asked to retrieve, decrypt, view, download, or access any evidence file, you MUST refuse and explain that you only analyze metadata.
- If you notice any field like "ipfsCID" or "sha256Hash" in the data (which should not happen due to scrubbing), do NOT display or reference it.
- Never fabricate data. If the ledger has no records, say so clearly.

RESPONSE STYLE:
- Be concise, professional, and analytical.
- Use bullet points and structured formatting for readability.
- When analyzing data, reference actual case IDs, officer IDs, and organization names from the provided context.
- Provide actionable insights, not just raw numbers.
- For anomaly detection, flag unusual patterns like: long custody gaps, excessive transfers, single-officer concentration, etc.

CONTEXT FORMAT:
You will receive the current state of the Hyperledger Fabric ledger as JSON context. This includes:
- "evidence": Array of evidence metadata records (without sensitive fields)
- "histories": Object mapping evidenceId → array of custody history entries
- "stats": Pre-computed aggregate statistics`;

/**
 * Send a chat message to Gemini with the full ledger context.
 * Automatically falls back to alternate models if quota is exceeded.
 */
async function chat(userMessage) {
  if (!genAI) {
    if (!config.GEMINI_API_KEY) {
      return { 
        response: 'SENTINEL AI is currently offline. Gemini API key is not configured.', 
        error: true 
      };
    }
    genAI = new GoogleGenerativeAI(config.GEMINI_API_KEY);
  }

  // Model priority list — falls back automatically on quota errors
  const modelNames = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-2.0-flash-lite'];

  try {
    // Build fresh context from the ledger for every query (ensures real-time accuracy)
    const context = await buildLedgerContext();

    const prompt = `${SYSTEM_PROMPT}

=== CURRENT LEDGER STATE (Live from Hyperledger Fabric) ===
${JSON.stringify(context, null, 2)}

=== OFFICER QUERY ===
${userMessage}`;

    // Try each model in order until one succeeds
    for (const modelName of modelNames) {
      try {
        const currentModel = genAI.getGenerativeModel({ model: modelName });
        const result = await currentModel.generateContent(prompt);
        const response = result.response.text();
        console.log(`[SENTINEL AI] Response generated using model: ${modelName}`);
        return { response, error: false };
      } catch (modelError) {
        if (modelError.message && modelError.message.includes('429')) {
          console.warn(`[SENTINEL AI] Model ${modelName} quota exceeded, trying next...`);
          continue; // Try next model
        }
        throw modelError; // Re-throw non-quota errors
      }
    }

    // All models exhausted
    return {
      response: '⚠️ All AI model quotas are temporarily exhausted. Please wait a minute and try again, or generate a new API key at https://aistudio.google.com/apikey',
      error: true
    };
  } catch (error) {
    console.error('[SENTINEL AI] Gemini API error:', error.message);
    return { 
      response: `SENTINEL AI encountered an error: ${error.message}`, 
      error: true 
    };
  }
}

/**
 * Get quick analytics summary (pre-computed, no LLM call needed).
 */
async function getQuickAnalytics() {
  const context = await buildLedgerContext();
  return context.stats;
}

module.exports = {
  initAI,
  chat,
  getQuickAnalytics,
  buildLedgerContext
};
