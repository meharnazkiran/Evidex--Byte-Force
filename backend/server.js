const express = require('express');
const multer = require('multer');
const config = require('./config');
const caService = require('./services/caService');
const fabricService = require('./services/fabricService');
const authMiddleware = require('./middleware/authMiddleware');
const authController = require('./controllers/authController');
const evidenceController = require('./controllers/evidenceController');

const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*'
  }
});

// Expose Socket.io instance globally for controllers to emit real-time events
global.io = io;

io.on('connection', (socket) => {
  console.log(`[SOCKET] Client connected: ${socket.id}`);
  socket.on('disconnect', () => {
    console.log(`[SOCKET] Client disconnected: ${socket.id}`);
  });
});

// 1. Basic Middleware
app.use(express.json());

// Set up Multer for in-memory file buffering (useful for hashes and IPFS uploads)
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB max file size
});

// Serve static frontend files
const path = require('path');
app.use(express.static(path.join(__dirname, 'public')));

// Simple Request Logger
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// 2. Authentication & CA Enrollment Endpoints
app.post('/auth/register', authController.register);
app.post('/auth/enroll', authController.enroll);
app.get('/auth/check/:username', async (req, res) => {
  try {
    const enrolled = await caService.isEnrolled(req.params.username);
    res.json({ enrolled });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

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

// GET /evidence/export/:id - Generates and streams Section 63 BSA PDF certificate
app.get('/evidence/export/:id', evidenceController.exportCertificate);

// ============================================================
// SENTINEL AI — Analytics Layer Routes
// ============================================================
const aiController = require('./controllers/aiController');

// POST /ai/verify-access - Verify officer ID against ledger ACL
app.post('/ai/verify-access', aiController.verifyAccess);

// POST /ai/chat - Process AI analytics query (re-verifies access per request)
app.post('/ai/chat', aiController.chat);

// GET /ai/analytics - Get pre-computed ledger analytics (no LLM call)
app.get('/ai/analytics', aiController.getAnalytics);

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

  server.listen(config.PORT, () => {
    console.log(`Backend API Server running at http://localhost:${config.PORT}`);
    console.log('Press Ctrl+C to terminate.');
  });
}

startServer();
