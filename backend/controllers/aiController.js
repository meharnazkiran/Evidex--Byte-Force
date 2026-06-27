const fabricService = require('../services/fabricService');
const aiService = require('../services/aiService');

/**
 * POST /ai/verify-access
 * Verify officer ID against the on-ledger ACL.
 * Returns { authorized: true/false, officerId }
 */
async function verifyAccess(req, res) {
  const { officerId } = req.body;

  if (!officerId || typeof officerId !== 'string' || officerId.trim().length === 0) {
    return res.status(400).json({ 
      error: 'Missing or invalid officerId',
      authorized: false 
    });
  }

  try {
    const authorized = await fabricService.checkAIAccess(officerId.trim());
    
    if (authorized) {
      console.log(`[SENTINEL AI] Access GRANTED for officer: ${officerId}`);
      res.json({ 
        authorized: true, 
        officerId: officerId.trim(),
        message: `Welcome, ${officerId}. SENTINEL AI is ready.`
      });
    } else {
      console.log(`[SENTINEL AI] Access DENIED for officer: ${officerId}`);
      res.status(403).json({ 
        authorized: false, 
        officerId: officerId.trim(),
        message: 'Access denied. Your Officer ID is not authorized for AI analytics. Contact your DCP for clearance.'
      });
    }
  } catch (error) {
    console.error('[SENTINEL AI] Access check error:', error.message);
    res.status(500).json({ 
      error: `AI access verification failed: ${error.message}`,
      authorized: false 
    });
  }
}

/**
 * POST /ai/chat
 * Process a chat message through the AI analytics engine.
 * Requires officerId in body (re-verified on every request for security).
 */
async function chat(req, res) {
  const { officerId, message } = req.body;

  if (!officerId || !message) {
    return res.status(400).json({ error: 'Missing officerId or message' });
  }

  // Re-verify access on every chat request (no stale sessions)
  try {
    const authorized = await fabricService.checkAIAccess(officerId.trim());
    if (!authorized) {
      return res.status(403).json({ 
        error: 'Access denied. Your session is not authorized.',
        authorized: false 
      });
    }
  } catch (error) {
    return res.status(500).json({ error: `Access re-verification failed: ${error.message}` });
  }

  try {
    console.log(`[SENTINEL AI] Query from ${officerId}: "${message.substring(0, 80)}..."`);
    
    const result = await aiService.chat(message);
    
    // Emit real-time event for AI activity monitoring
    if (global.io) {
      global.io.emit('SentinelAIQuery', {
        officerId,
        queryPreview: message.substring(0, 50),
        timestamp: new Date().toISOString()
      });
    }

    res.json({
      officerId,
      query: message,
      response: result.response,
      timestamp: new Date().toISOString(),
      error: result.error || false
    });
  } catch (error) {
    console.error('[SENTINEL AI] Chat error:', error.message);
    res.status(500).json({ error: `AI query failed: ${error.message}` });
  }
}

/**
 * GET /ai/analytics
 * Returns pre-computed analytics (no LLM call, instant response).
 */
async function getAnalytics(req, res) {
  try {
    const stats = await aiService.getQuickAnalytics();
    res.json({ stats, timestamp: new Date().toISOString() });
  } catch (error) {
    res.status(500).json({ error: `Analytics failed: ${error.message}` });
  }
}

module.exports = {
  verifyAccess,
  chat,
  getAnalytics
};
