const caService = require('../services/caService');

/**
 * Register a new user/officer with Fabric CA
 */
async function register(req, res) {
  const { username, role } = req.body;

  if (!username) {
    return res.status(400).json({ error: 'Missing required field: username' });
  }

  try {
    const secret = await caService.registerUser(username, role || 'client');
    res.json({
      message: `User ${username} successfully registered with Fabric CA.`,
      username,
      enrollmentSecret: secret
    });
  } catch (error) {
    res.status(500).json({ error: `Registration failed: ${error.message}` });
  }
}

/**
 * Enroll a registered user/officer to get certificate/keys
 */
async function enroll(req, res) {
  const { username, secret } = req.body;

  if (!username || !secret) {
    return res.status(400).json({ error: 'Missing required fields: username, secret' });
  }

  try {
    await caService.enrollUser(username, secret);
    res.json({
      message: `User ${username} successfully enrolled and certificate stored in wallet.`,
      username
    });
  } catch (error) {
    res.status(500).json({ error: `Enrollment failed: ${error.message}` });
  }
}

module.exports = {
  register,
  enroll
};
