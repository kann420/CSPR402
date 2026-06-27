#!/usr/bin/env node
/**
 * CardCasper402 Node.js agent demo.
 *
 * Flow:
 *   1. Create an order through the CardCasper402 API.
 *   2. Send the exact Casper mainnet CSPR transfer requested by the order.
 *   3. Submit the deploy hash back to the API for verification.
 *   4. Print the simulated virtual card receipt returned by the backend.
 *
 * Required environment variables:
 *   CARDS402_API_KEY
 *   CARDS402_BASE_URL
 *   CASPER_NODE_RPC_URL
 *   CASPER_AGENT_PRIVATE_KEY_PATH
 *   CASPER_AGENT_KEY_ALGORITHM=ED25519|SECP256K1
 *
 * Optional:
 *   ORDER_AMOUNT_USDC=2.00
 *   ORDER_PAYMENT_ASSET=cspr_casper|mock_usdc_cep18
 *   CASPER_TRANSFER_PAYMENT_MOTES=100000000
 *   CASPER_CEP18_TRANSFER_PAYMENT_MOTES=3000000000
 *   CASPER_VERIFY_TIMEOUT_MS=300000
 *   CASPER_VERIFY_POLL_MS=5000
 */

import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const require = createRequire(import.meta.url);
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({
  path: [path.join(scriptDir, '.env.local'), path.join(scriptDir, '.env')],
  quiet: true,
});

const {
  HttpHandler,
  KeyAlgorithm,
  NativeTransferBuilder,
  PrivateKey,
  PublicKey,
  RpcClient,
  Timestamp,
  makeCep18TransferTransaction,
} = require('casper-js-sdk');

let API_KEY;
let BASE_URL;
let RPC_URL;
let PRIVATE_KEY_PATH;
let KEY_ALGORITHM;
let ORDER_AMOUNT_USDC;
let ORDER_PAYMENT_ASSET;
let TRANSFER_PAYMENT_MOTES;
let CEP18_TRANSFER_PAYMENT_MOTES;
let VERIFY_TIMEOUT_MS;
let VERIFY_POLL_MS;

class ApiError extends Error {
  constructor(status, body) {
    const message = body.message || body.error || `HTTP ${status}`;
    super(`${message}: ${JSON.stringify(body)}`);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

function requiredEnv(name) {
  const value = process.env[name];
  if (!value || !value.trim()) {
    throw new Error(`Set ${name} in your environment or local .env.local file`);
  }
  return value.trim();
}

function parseKeyAlgorithm(value) {
  const normalized = value.trim().toUpperCase();
  if (normalized === 'ED25519') return KeyAlgorithm.ED25519;
  if (normalized === 'SECP256K1') return KeyAlgorithm.SECP256K1;
  throw new Error('CASPER_AGENT_KEY_ALGORITHM must be ED25519 or SECP256K1');
}

function loadConfig() {
  API_KEY = requiredEnv('CARDS402_API_KEY');
  BASE_URL = requiredEnv('CARDS402_BASE_URL').replace(/\/$/, '');
  RPC_URL = requiredEnv('CASPER_NODE_RPC_URL');
  PRIVATE_KEY_PATH = requiredEnv('CASPER_AGENT_PRIVATE_KEY_PATH');
  KEY_ALGORITHM = parseKeyAlgorithm(requiredEnv('CASPER_AGENT_KEY_ALGORITHM'));
  ORDER_AMOUNT_USDC = process.env.ORDER_AMOUNT_USDC || '2.00';
  ORDER_PAYMENT_ASSET = process.env.ORDER_PAYMENT_ASSET || 'cspr_casper';
  if (!['cspr_casper', 'mock_usdc_cep18'].includes(ORDER_PAYMENT_ASSET)) {
    throw new Error('ORDER_PAYMENT_ASSET must be cspr_casper or mock_usdc_cep18');
  }
  TRANSFER_PAYMENT_MOTES = process.env.CASPER_TRANSFER_PAYMENT_MOTES || '100000000';
  CEP18_TRANSFER_PAYMENT_MOTES = process.env.CASPER_CEP18_TRANSFER_PAYMENT_MOTES || '3000000000';
  VERIFY_TIMEOUT_MS = parsePositiveInt(process.env.CASPER_VERIFY_TIMEOUT_MS || '300000');
  VERIFY_POLL_MS = parsePositiveInt(process.env.CASPER_VERIFY_POLL_MS || '5000');
}

function parsePositiveInt(value) {
  if (!/^\d+$/.test(value)) throw new Error(`Expected a positive integer, got ${value}`);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`Expected a positive integer, got ${value}`);
  }
  return parsed;
}

function normalizeDeployHash(value) {
  if (typeof value === 'string') return value.toLowerCase();
  if (value && typeof value.toHex === 'function') return value.toHex().toLowerCase();
  if (value && typeof value.toJSON === 'function') return String(value.toJSON()).toLowerCase();
  return String(value).toLowerCase();
}

function extractLatestBlockTimestamp(rawBlockResult) {
  const rawBlock = rawBlockResult?.block_with_signatures?.block;
  const header = rawBlock?.Version2?.header || rawBlock?.Version1?.header || rawBlock?.header;
  if (!header?.timestamp) return null;
  const parsed = new Date(header.timestamp);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

async function api(path, init = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'X-Api-Key': API_KEY,
      ...(init.headers || {}),
    },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(res.status, body);
  }
  return body;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function loadPrivateKey() {
  const pem = await readFile(PRIVATE_KEY_PATH, 'utf8');
  return PrivateKey.fromPem(pem, KEY_ALGORITHM);
}

async function createOrder(senderPublicKey) {
  const body = {
    amount_usdc: ORDER_AMOUNT_USDC,
    ...(ORDER_PAYMENT_ASSET === 'mock_usdc_cep18'
      ? { payment_asset: ORDER_PAYMENT_ASSET, payer_public_key: senderPublicKey }
      : {}),
  };
  return api('/orders', {
    method: 'POST',
    headers: { 'Idempotency-Key': randomUUID() },
    body: JSON.stringify(body),
  });
}

async function submitCasperTransfer(payment, privateKey) {
  const rpcClient = new RpcClient(new HttpHandler(RPC_URL));
  const status = await rpcClient.getStatus();
  const latestBlock = await rpcClient.getLatestBlock();
  const latestBlockTimestamp = extractLatestBlockTimestamp(latestBlock.rawJSON);
  const safeTimestamp = latestBlockTimestamp
    ? new Timestamp(new Date(latestBlockTimestamp.getTime() - 30_000))
    : undefined;
  const builder = new NativeTransferBuilder()
    .from(privateKey.publicKey)
    .target(PublicKey.fromHex(payment.recipient))
    .amount(payment.amount_motes)
    .id(payment.transfer_id)
    .chainName(payment.chain_name)
    .payment(Number(TRANSFER_PAYMENT_MOTES));
  if (safeTimestamp) {
    builder.timestamp(safeTimestamp);
  }
  const transaction = status.apiVersion.startsWith('1') ? builder.buildFor1_5() : builder.build();

  transaction.sign(privateKey);

  const result = await rpcClient.putTransaction(transaction);
  return normalizeDeployHash(result.transactionHash?.toHex?.() ?? result.transactionHash);
}

async function submitMockUsdcTransfer(payment, privateKey) {
  const rpcClient = new RpcClient(new HttpHandler(RPC_URL));
  const status = await rpcClient.getStatus();
  const latestBlock = await rpcClient.getLatestBlock();
  const latestBlockTimestamp = extractLatestBlockTimestamp(latestBlock.rawJSON);
  const safeTimestamp = latestBlockTimestamp
    ? new Timestamp(new Date(latestBlockTimestamp.getTime() - 30_000))
    : undefined;
  const transaction = makeCep18TransferTransaction({
    contractPackageHash: payment.contract_package_hash,
    senderPublicKeyHex: privateKey.publicKey.toHex(),
    recipientPublicKeyHex: payment.recipient_public_key,
    transferAmount: payment.amount_base_units,
    paymentAmount: CEP18_TRANSFER_PAYMENT_MOTES,
    chainName: payment.chain_name,
    casperNetworkApiVersion: status.apiVersion,
    ...(safeTimestamp ? { timestamp: safeTimestamp.toJSON() } : {}),
  });
  transaction.sign(privateKey);

  const result = await rpcClient.putTransaction(transaction);
  return normalizeDeployHash(result.transactionHash?.toHex?.() ?? result.transactionHash);
}

async function verifyPayment(orderId, deployHash, senderPublicKey) {
  return api(`/orders/${encodeURIComponent(orderId)}/verify-payment`, {
    method: 'POST',
    body: JSON.stringify({
      deploy_hash: deployHash,
      sender_public_key: senderPublicKey,
    }),
  });
}

async function verifyPaymentWithRetry(orderId, deployHash, senderPublicKey) {
  const deadline = Date.now() + VERIFY_TIMEOUT_MS;
  let attempts = 0;
  while (Date.now() < deadline) {
    attempts += 1;
    try {
      return await verifyPayment(orderId, deployHash, senderPublicKey);
    } catch (err) {
      const pending =
        err instanceof ApiError && (err.status === 425 || err.body?.error === 'payment_pending');
      if (!pending || Date.now() + VERIFY_POLL_MS >= deadline) throw err;
      console.log(`Payment still pending, retrying verify in ${VERIFY_POLL_MS}ms`);
      await sleep(VERIFY_POLL_MS);
    }
  }
  throw new Error(`Timed out waiting for Casper payment verification after ${attempts} attempts`);
}

async function main() {
  loadConfig();
  const privateKey = await loadPrivateKey();
  const senderPublicKey = privateKey.publicKey.toHex();
  console.log(`Using Casper sender ${senderPublicKey}`);

  const order = await createOrder(senderPublicKey);
  if (!['casper_cspr_transfer', 'casper_cep18_transfer'].includes(order.payment?.type)) {
    throw new Error(`Expected a Casper payment, got ${order.payment?.type || 'missing'}`);
  }

  console.log(`Order ${order.order_id} created`);
  let deployHash;
  if (order.payment.type === 'casper_cep18_transfer') {
    console.log(
      `Pay ${order.payment.amount_base_units} mockUSDC base units to ` +
        `${order.payment.recipient_public_key}`,
    );
    deployHash = await submitMockUsdcTransfer(order.payment, privateKey);
  } else {
    console.log(
      `Pay ${order.payment.amount_cspr} CSPR to ${order.payment.recipient} ` +
        `with transfer_id ${order.payment.transfer_id}`,
    );
    deployHash = await submitCasperTransfer(order.payment, privateKey);
  }
  console.log(`Submitted Casper deploy ${deployHash}`);
  console.log('Waiting for backend verification...');

  const verified = await verifyPaymentWithRetry(order.order_id, deployHash, senderPublicKey);
  const card = verified.order.card;
  const receipt = verified.receipt;

  console.log('\nVirtual card fulfilled');
  console.log(`  Order:       ${verified.order.order_id}`);
  console.log(`  Deploy hash: ${receipt.deploy_hash}`);
  if (receipt.type === 'casper_mock_usdc_receipt') {
    console.log(`  Asset:       mockUSDC CEP-18`);
    console.log(`  Amount:      ${receipt.amount_base_units} base units`);
  } else {
    console.log(`  Transfer id: ${receipt.transfer_id}`);
    console.log(`  Amount:      ${receipt.amount_motes} motes`);
  }
  console.log(`  Card:        ${card.number}`);
  console.log(`  CVV:         ${card.cvv}`);
  console.log(`  Expiry:      ${card.expiry}`);
  console.log(`  Brand:       ${card.brand || 'CSPR402 Virtual Card'}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
