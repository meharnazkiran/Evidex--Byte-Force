const caService = require('../services/caService');

/**
 * Middleware to check if the officer/lab identity is enrolled in the Fabric CA.
 * Looks for 'x-officer-id' or 'x-lab-id' in the headers.
 */
async function authenticateOfficer(req, res, next) {
  const officerId = req.headers['x-officer-id'] || req.headers['x-lab-id'] || req.body.officerId || req.body.fromOrg;

  if (!officerId) {
    return res.status(401).json({ 
      error: 'Unauthorized: Missing officer or organization credentials. Provide x-officer-id or x-lab-id header.' 
    });
  }

  try {
    const enrolled = await caService.isEnrolled(officerId);
    
    if (!enrolled) {
      return res.status(403).json({ 
        error: `Forbidden: Identity '${officerId}' is not enrolled in Fabric CA wallet. Enroll user first.` 
      });
    }

    // Set identity on request for downstream usage
    req.authenticatedIdentity = officerId;
    next();
  } catch (error) {
    res.status(500).json({ error: `Authentication check failed: ${error.message}` });
  }
}

module.exports = {
  authenticateOfficer
};
