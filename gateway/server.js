const express = require('express');
const grpc = require('@grpc/grpc-js');
const { connect, signers } = require('@hyperledger/fabric-gateway');
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

// Configuration variables (can be overridden via environment variables)
const PEER_ENDPOINT = process.env.PEER_ENDPOINT || 'localhost:7051';
const PEER_HOST_ALIAS = process.env.PEER_HOST_ALIAS || 'peer0.org1.example.com';
const CHANNEL_NAME = process.env.CHANNEL_NAME || 'mychannel';
const CHAINCODE_NAME = process.env.CHAINCODE_NAME || 'evidence';

// Default paths pointing to standard fabric-samples test-network Org1 setup
const getFabricSamplesPath = () => {
    if (process.env.FABRIC_SAMPLES_PATH) return process.env.FABRIC_SAMPLES_PATH;
    
    // Check common paths
    const paths = [
        path.resolve(__dirname, '../../fabric-samples'), // User home directory from Desktop/evidex/gateway
        path.resolve(__dirname, '../fabric-samples'),    // Inside the project root
        'C:/Users/mages/fabric-samples',                 // Absolute path for Windows user home
        '/mnt/c/Users/mages/fabric-samples'              // WSL path fallback
    ];
    
    for (const p of paths) {
        try {
            // Simple synchronous check if directory exists using fs
            const fsSync = require('fs');
            if (fsSync.existsSync(p)) {
                return p;
            }
        } catch (e) {}
    }
    return paths[0]; // fallback to default
};

const FABRIC_SAMPLES_PATH = getFabricSamplesPath();
const ORG_PATH = path.resolve(FABRIC_SAMPLES_PATH, 'test-network/organizations/peerOrganizations/org1.example.com');
const KEY_DIRECTORY_PATH = path.resolve(ORG_PATH, 'users/User1@org1.example.com/msp/keystore');
const CERT_PATH = path.resolve(ORG_PATH, 'users/User1@org1.example.com/msp/signcerts/cert.pem');
const TLS_CERT_PATH = path.resolve(ORG_PATH, 'peers/peer0.org1.example.com/tls/ca.crt');

let contract;

async function getFirstDirFile(dirPath) {
    const files = await fs.readdir(dirPath);
    return path.join(dirPath, files[0]);
}

async function initGateway() {
    try {
        console.log('Connecting to Fabric Gateway...');
        
        // 1. Load TLS Certificate
        const tlsCert = await fs.readFile(TLS_CERT_PATH);
        
        // 2. Establish gRPC Client connection
        const tlsCredentials = grpc.credentials.createSsl(tlsCert);
        const client = new grpc.Client(PEER_ENDPOINT, tlsCredentials, {
            'grpc.ssl_target_name_override': PEER_HOST_ALIAS,
            'grpc.default_authority': PEER_HOST_ALIAS,
        });

        // 3. Load user certificate and private key for signing
        const cert = await fs.readFile(CERT_PATH);
        const keyPath = await getFirstDirFile(KEY_DIRECTORY_PATH);
        const privateKeyPem = await fs.readFile(keyPath);
        const privateKey = crypto.createPrivateKey(privateKeyPem);
        const signer = signers.newPrivateKeySigner(privateKey);

        // 4. Connect Gateway
        const gateway = connect({
            client,
            identity: { mspId: 'Org1MSP', credentials: cert },
            signer,
            evaluateOptions: () => ({ deadline: Date.now() + 5000 }),
            submitOptions: () => ({ deadline: Date.now() + 5000 }),
        });

        // 5. Get contract
        const network = gateway.getNetwork(CHANNEL_NAME);
        contract = network.getContract(CHAINCODE_NAME);
        console.log('Successfully connected to Chaincode contract:', CHAINCODE_NAME);
    } catch (error) {
        console.error('Failed to initialize Fabric Gateway:', error);
    }
}

// Middleware to ensure gateway/contract is connected
app.use((req, res, next) => {
    if (!contract) {
        return res.status(503).json({ error: 'Fabric Gateway not initialized. Check server logs.' });
    }
    next();
});

// 1. Register Evidence
app.post('/api/evidence/register', async (req, res) => {
    const { evidenceId, caseId, officerId, ipfsCID, sha256Hash, timestamp } = req.body;
    if (!evidenceId || !caseId || !officerId || !ipfsCID || !sha256Hash || !timestamp) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    try {
        await contract.submitTransaction(
            'RegisterEvidence', 
            evidenceId, 
            caseId, 
            officerId, 
            ipfsCID, 
            sha256Hash, 
            String(timestamp)
        );
        res.json({ message: 'Evidence successfully registered', evidenceId });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 2. Transfer Custody
app.post('/api/evidence/transfer', async (req, res) => {
    const { evidenceId, fromOrg, toOrg, reason, timestamp } = req.body;
    if (!evidenceId || !fromOrg || !toOrg || !reason || !timestamp) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    try {
        await contract.submitTransaction(
            'TransferCustody', 
            evidenceId, 
            fromOrg, 
            toOrg, 
            reason, 
            String(timestamp)
        );
        res.json({ message: 'Custody successfully transferred', evidenceId, fromOrg, toOrg });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 3. Verify Integrity
app.post('/api/evidence/verify', async (req, res) => {
    const { evidenceId, providedHash } = req.body;
    if (!evidenceId || !providedHash) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    try {
        const resultBytes = await contract.evaluateTransaction('VerifyIntegrity', evidenceId, providedHash);
        const result = JSON.parse(new TextDecoder().decode(resultBytes));
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 4. Get Evidence History
app.get('/api/evidence/history/:id', async (req, res) => {
    const evidenceId = req.params.id;
    try {
        const resultBytes = await contract.evaluateTransaction('GetEvidenceHistory', evidenceId);
        const history = JSON.parse(new TextDecoder().decode(resultBytes) || '[]');
        res.json({ evidenceId, history });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ============================================================
// SENTINEL AI — Gateway Endpoints
// ============================================================

// 5. Check AI Access (verify officer is in ledger ACL)
app.post('/api/ai/check-access', async (req, res) => {
    const { officerId } = req.body;
    if (!officerId) {
        return res.status(400).json({ error: 'Missing officerId' });
    }
    try {
        const resultBytes = await contract.evaluateTransaction('CheckAIAccess', officerId);
        const authorized = JSON.parse(new TextDecoder().decode(resultBytes));
        res.json({ officerId, authorized });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 6. Manage AI Access (add/remove officer from ledger ACL)
app.post('/api/ai/manage-access', async (req, res) => {
    const { officerId, action } = req.body;
    if (!officerId || !action) {
        return res.status(400).json({ error: 'Missing officerId or action' });
    }
    try {
        await contract.submitTransaction('ManageAIAccess', officerId, action);
        res.json({ message: `AI access ${action} successful for ${officerId}` });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 7. Get All Evidence Metadata (for AI context building)
app.get('/api/evidence/all', async (req, res) => {
    try {
        const resultBytes = await contract.evaluateTransaction('GetAllEvidence');
        const evidence = JSON.parse(new TextDecoder().decode(resultBytes) || '[]');
        res.json({ evidence });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Start express server & connect to Gateway
app.listen(PORT, async () => {
    console.log(`Gateway API Server running on port ${PORT}`);
    await initGateway();
});

