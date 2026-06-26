const express = require('express');
const multer = require('multer');
const config = require('./config');
const caService = require('./services/caService');
const fabricService = require('./services/fabricService');
const authMiddleware = require('./middleware/authMiddleware');
const authController = require('./controllers/authController');
const evidenceController = require('./controllers/evidenceController');

const app = express();

// 1. Basic Middleware
app.use(express.json());

// Set up Multer for in-memory file buffering (useful for hashes and IPFS uploads)
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB max file size
});

// Simple Request Logger
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// 2. Authentication & CA Enrollment Endpoints
app.post('/auth/register', authController.register);
app.post('/auth/enroll', authController.enroll);

// 3. Evidence Custody Endpoints
// POST /evidence/register - Authenticates officer, receives file or metadata, uploads to IPFS, records on chain
app.post(
  '/evidence/register', 
  authMiddleware.authenticateOfficer, 
  upload.single('file'), 
  evidenceController.registerEvidence
);

// POST /evidence/transfer - Authenticates org/officer, logs custody handoff
app.post(
  '/evidence/transfer', 
  authMiddleware.authenticateOfficer, 
  evidenceController.transferCustody
);

// GET /evidence/verify/:id - Fetches chain metadata, compares to query hash OR uploaded file hash
app.get(
  '/evidence/verify/:id', 
  upload.single('file'), 
  evidenceController.verifyEvidence
);

// GET /evidence/history/:id - Retrieves full audit history timeline
app.get('/evidence/history/:id', evidenceController.getHistory);

// Health Check
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    mode: {
      ca: caService.isMock() ? 'mock-fallback' : 'production',
      ledger: fabricService.isMockLedger() ? 'mock-fallback' : 'production'
    }
  });
});

// 4. Error Handler Middleware
app.use((err, req, res, next) => {
  console.error('[SERVER ERROR]', err);
  res.status(500).json({ error: `Internal Server Error: ${err.message}` });
});

// 5. Start Server and Initialize Connections
async function startServer() {
  console.log('Starting Chain of Custody Backend...');
  
  // Initialize services
  await caService.initCA();
  await fabricService.initFabric();

  app.listen(config.PORT, () => {
    console.log(`Backend API Server running at http://localhost:${config.PORT}`);
    console.log('Press Ctrl+C to terminate.');
  });
}

startServer();
