/**
 * Script to verify ProcurementEscrow on Mezo Testnet Blockscout
 * Explorer: https://explorer.test.mezo.org
 * Chain ID: 31611
 */

const https = require('https');

const ESCROW_ADDRESS = '0x88EDbF3E966Ba23F0262771CBCF6d217718BD048';
const MEZO_EXPLORER_API = 'https://explorer.test.mezo.org/api';

console.log('--------------------------------------------------');
console.log('Verifying ProcurementEscrow on Mezo Testnet Blockscout');
console.log('Contract Address:', ESCROW_ADDRESS);
console.log('Explorer URL: https://explorer.test.mezo.org/address/' + ESCROW_ADDRESS);
console.log('--------------------------------------------------');

// Blockscout API verification payload parameters
const verificationPayload = {
  addressHash: ESCROW_ADDRESS,
  compilerVersion: 'v0.8.24+commit.e11b9ed9',
  optimization: true,
  optimizationRuns: 200,
  contractName: 'ProcurementEscrow',
  evmVersion: 'paris',
};

console.log('Verification Parameters:', JSON.stringify(verificationPayload, null, 2));
console.log('Status: Source code prepared at contracts/ProcurementEscrow.sol');
console.log('Ready for Blockscout API verification.');

