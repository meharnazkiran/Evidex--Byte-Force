const FabricCAServices = require('fabric-ca-client');
const { Wallets } = require('fabric-network');
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const config = require('../config');

let wallet;
let caClient;
let useMock = false;

// Basic Mock Wallet database in case file system wallet fails or mock mode is active
const mockUserStore = new Map();

/**
 * Initialize CA client and wallet.
 */
async function initCA() {
  try {
    // 1. Initialize Wallet
    wallet = await Wallets.newFileSystemWallet(config.WALLET_PATH);
    console.log(`Fabric Wallet initialized at: ${config.WALLET_PATH}`);
    
    // 2. Initialize Fabric CA Client
    console.log(`Connecting to Fabric CA at: ${config.CA_URL}`);
    caClient = new FabricCAServices(config.CA_URL, null, config.CA_NAME);
    
    // Test CA connection (or check if CA container is up)
    // If it fails, we fall back to Mock mode.
    try {
      // Small timeout probe to check if CA is online
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2000);
      await fetch(config.CA_URL, { signal: controller.signal }).catch(() => { throw new Error('Unreachable'); });
      clearTimeout(timeoutId);
      console.log('Fabric CA server is ONLINE.');
    } catch (e) {
      console.warn(`[WARNING] Fabric CA server is offline. Enabling Mock CA mode.`);
      useMock = true;
    }
  } catch (error) {
    console.warn(`[WARNING] Failed to initialize Fabric CA SDK: ${error.message}. Enabling Mock CA mode.`);
    useMock = true;
  }
}

/**
 * Helper to generate a realistic mock certificate
 */
function generateMockCert(username, org = 'Org1MSP') {
  const pubKey = crypto.randomBytes(128).toString('base64');
  return `-----BEGIN CERTIFICATE-----\n` +
         `MIIB1TCCAT6gAwIBAgIU${crypto.randomBytes(8).toString('hex')}...\n` +
         `CN=${username},O=Evidex,OU=${org}\n` +
         `PublicKey=${pubKey.substring(0, 64)}\n` +
         `-----END CERTIFICATE-----`;
}

/**
 * Enroll Admin Registrar (required to register users).
 */
async function enrollAdmin() {
  if (!wallet) await initCA();

  if (useMock) {
    console.log('CA (Mock Mode): Checking admin registration...');
    const adminExists = await wallet.get('admin');
    if (!adminExists) {
      const mockAdminIdentity = {
        credentials: {
          certificate: generateMockCert('admin'),
          privateKey: crypto.randomBytes(32).toString('hex')
        },
        mspId: 'Org1MSP',
        type: 'X.509'
      };
      await wallet.put('admin', mockAdminIdentity);
      console.log('CA (Mock Mode): Successfully enrolled admin registrar.');
    }
    return;
  }

  try {
    const adminExists = await wallet.get('admin');
    if (adminExists) {
      console.log('Admin identity already exists in wallet.');
      return;
    }

    console.log('Enrolling admin registrar with CA...');
    const enrollment = await caClient.enroll({
      enrollmentID: 'admin',
      enrollmentSecret: 'adminpw'
    });

    const x509Identity = {
      credentials: {
        certificate: enrollment.certificate,
        privateKey: enrollment.key.toBytes(),
      },
      mspId: 'Org1MSP',
      type: 'X.509',
    };

    await wallet.put('admin', x509Identity);
    console.log('Successfully enrolled admin registrar and saved to wallet.');
  } catch (error) {
    console.error('Failed to enroll admin registrar: ', error);
    console.warn('CA: Falling back to Mock mode for admin enrollment.');
    useMock = true;
    await enrollAdmin(); // retry in mock mode
  }
}

/**
 * Register a new Officer/Lab with the CA.
 * @param {string} username 
 * @param {string} userRole (e.g. officer, lab)
 * @returns {Promise<string>} Enrollment secret
 */
async function registerUser(username, userRole = 'client') {
  if (!wallet) await initCA();
  await enrollAdmin();

  if (useMock) {
    console.log(`CA (Mock Mode): Registering user ${username}...`);
    const secret = crypto.randomBytes(6).toString('hex');
    mockUserStore.set(username, { secret, userRole, registered: true });
    console.log(`CA (Mock Mode): Registered ${username} with secret: ${secret}`);
    return secret;
  }

  try {
    const userExists = await wallet.get(username);
    if (userExists) {
      throw new Error(`Identity '${username}' already exists in wallet.`);
    }

    const adminIdentity = await wallet.get('admin');
    const provider = wallet.getProviderRegistry().getProvider(adminIdentity.type);
    const adminUser = await provider.getUserContext(adminIdentity, 'admin');

    const secret = await caClient.register({
      affiliation: 'org1.department1',
      enrollmentID: username,
      role: userRole,
    }, adminUser);

    console.log(`Successfully registered user ${username} with CA. secret generated.`);
    return secret;
  } catch (error) {
    console.error(`Failed to register user ${username}: `, error);
    throw error;
  }
}

/**
 * Enroll a registered user to obtain certs and keys.
 * @param {string} username 
 * @param {string} secret 
 */
async function enrollUser(username, secret) {
  if (!wallet) await initCA();

  if (useMock) {
    console.log(`CA (Mock Mode): Enrolling user ${username}...`);
    const user = mockUserStore.get(username);
    if (!user || user.secret !== secret) {
      throw new Error('Invalid username or enrollment secret');
    }

    const mockUserIdentity = {
      credentials: {
        certificate: generateMockCert(username),
        privateKey: crypto.randomBytes(32).toString('hex')
      },
      mspId: 'Org1MSP',
      type: 'X.509'
    };

    await wallet.put(username, mockUserIdentity);
    user.enrolled = true;
    mockUserStore.set(username, user);
    console.log(`CA (Mock Mode): Successfully enrolled ${username} and saved to wallet.`);
    return mockUserIdentity;
  }

  try {
    const enrollment = await caClient.enroll({
      enrollmentID: username,
      enrollmentSecret: secret
    });

    const x509Identity = {
      credentials: {
        certificate: enrollment.certificate,
        privateKey: enrollment.key.toBytes(),
      },
      mspId: 'Org1MSP',
      type: 'X.509',
    };

    await wallet.put(username, x509Identity);
    console.log(`Successfully enrolled user ${username} and saved to wallet.`);
    return x509Identity;
  } catch (error) {
    console.error(`Failed to enroll user ${username}: `, error);
    throw error;
  }
}

/**
 * Verify if an identity is enrolled in the wallet.
 * @param {string} username 
 * @returns {Promise<boolean>}
 */
async function isEnrolled(username) {
  if (!wallet) await initCA();
  const identity = await wallet.get(username);
  return !!identity;
}

module.exports = {
  initCA,
  enrollAdmin,
  registerUser,
  enrollUser,
  isEnrolled,
  getWallet: () => wallet,
  isMock: () => useMock
};
