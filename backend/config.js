require('dotenv').config();
const path = require('path');

module.exports = {
  PORT: process.env.PORT || 4000,
  REST_GATEWAY_URL: process.env.REST_GATEWAY_URL || 'http://localhost:3000',
  IPFS_RPC_URL: process.env.IPFS_RPC_URL || 'http://localhost:5001',
  CA_URL: process.env.CA_URL || 'http://localhost:7054',
  CA_NAME: process.env.CA_NAME || 'ca.org1.example.com',
  WALLET_PATH: path.resolve(__dirname, process.env.WALLET_PATH || './wallet')
};
