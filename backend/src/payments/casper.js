// @ts-check
// Casper CSPR payment helpers for the CardCasper402 MVP.

const db = require('../db');

const MOTES_PER_CSPR = 1_000_000_000n;
const DEFAULT_MIN_TRANSFER_MOTES = 2_500_000_000n;
const TRANSFER_ID_STATE_KEY = 'casper_next_transfer_id';
const FIRST_TRANSFER_ID = 100000;
const MAX_SAFE_TRANSFER_ID = Number.MAX_SAFE_INTEGER - 1;

class CasperPaymentAmountError extends Error {
  /**
   * @param {string} message
   * @param {Record<string, string>} details
   */
  constructor(message, details) {
    super(message);
    this.name = 'CasperPaymentAmountError';
    this.code = 'casper_min_transfer_amount';
    this.status = 400;
    this.details = details;
  }
}

/**
 * @param {string} value
 * @param {string} fieldName
 * @returns {{ units: bigint, scale: bigint }}
 */
function parsePositiveDecimal(value, fieldName) {
  if (typeof value !== 'string') {
    throw new Error(`${fieldName} must be a decimal string`);
  }
  const trimmed = value.trim();
  if (!/^\d+(\.\d+)?$/.test(trimmed)) {
    throw new Error(`${fieldName} must be a positive decimal string`);
  }
  const [whole, frac = ''] = trimmed.split('.');
  const scale = 10n ** BigInt(frac.length);
  const units = BigInt(whole || '0') * scale + BigInt(frac || '0');
  if (units <= 0n) {
    throw new Error(`${fieldName} must be greater than zero`);
  }
  return { units, scale };
}

/**
 * @param {bigint} numerator
 * @param {bigint} denominator
 */
function divCeil(numerator, denominator) {
  if (denominator <= 0n) throw new Error('divCeil denominator must be positive');
  return (numerator + denominator - 1n) / denominator;
}

/**
 * Convert a USD amount to CSPR motes using a fixed USD-per-CSPR rate.
 * @param {string} amountUsd
 * @param {string} csprUsdRate
 * @returns {bigint}
 */
function usdToMotes(amountUsd, csprUsdRate) {
  const amount = parsePositiveDecimal(amountUsd, 'amount_usdc');
  const rate = parsePositiveDecimal(csprUsdRate, 'CSPR_USD_RATE');
  return divCeil(amount.units * rate.scale * MOTES_PER_CSPR, amount.scale * rate.units);
}

/**
 * @param {bigint} motes
 */
function formatCSPR(motes) {
  if (motes < 0n) throw new Error('motes must be non-negative');
  const whole = motes / MOTES_PER_CSPR;
  const frac = String(motes % MOTES_PER_CSPR).padStart(9, '0');
  return `${whole}.${frac}`;
}

function minTransferMotes() {
  const raw = process.env.CASPER_MIN_TRANSFER_MOTES;
  if (!raw) return DEFAULT_MIN_TRANSFER_MOTES;
  if (!/^\d+$/.test(raw.trim())) {
    throw new Error('CASPER_MIN_TRANSFER_MOTES must be a positive integer');
  }
  const motes = BigInt(raw);
  if (motes <= 0n) {
    throw new Error('CASPER_MIN_TRANSFER_MOTES must be greater than zero');
  }
  return motes;
}

function allocateTransferId() {
  const row = /** @type {{ value?: string } | undefined} */ (
    db.prepare(`SELECT value FROM system_state WHERE key = ?`).get(TRANSFER_ID_STATE_KEY)
  );
  const current = row?.value ? Number(row.value) : FIRST_TRANSFER_ID;
  if (!Number.isSafeInteger(current) || current < FIRST_TRANSFER_ID) {
    throw new Error(`Invalid ${TRANSFER_ID_STATE_KEY} value`);
  }
  if (current > MAX_SAFE_TRANSFER_ID) {
    throw new Error('Casper transfer id counter exhausted');
  }
  db.prepare(
    `INSERT INTO system_state (key, value)
     VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
  ).run(TRANSFER_ID_STATE_KEY, String(current + 1));
  return current;
}

/**
 * @param {{ orderId: string, amountUsdc: string, transferId: number, senderPublicKey?: string | null, now?: Date }} opts
 */
function buildCasperPayment(opts) {
  const ttlMinutes = parseInt(process.env.CASPER_PAYMENT_TTL_MINUTES || '60', 10);
  if (!Number.isFinite(ttlMinutes) || ttlMinutes <= 0) {
    throw new Error('CASPER_PAYMENT_TTL_MINUTES must be a positive integer');
  }
  const rate = process.env.CSPR_USD_RATE;
  if (!rate) throw new Error('CSPR_USD_RATE is required');
  const recipient = process.env.CASPER_TREASURY_PUBLIC_KEY;
  if (!recipient) throw new Error('CASPER_TREASURY_PUBLIC_KEY is required');

  const amountMotes = usdToMotes(opts.amountUsdc, rate);
  const minimumMotes = minTransferMotes();
  if (amountMotes < minimumMotes) {
    throw new CasperPaymentAmountError(
      `Casper native transfers on ${process.env.CASPER_CHAIN_NAME || 'casper'} must be at least ${formatCSPR(minimumMotes)} CSPR.`,
      {
        amount_motes: amountMotes.toString(),
        amount_cspr: formatCSPR(amountMotes),
        minimum_motes: minimumMotes.toString(),
        minimum_cspr: formatCSPR(minimumMotes),
      },
    );
  }
  const now = opts.now ?? new Date();
  const expiresAt = new Date(now.getTime() + ttlMinutes * 60 * 1000).toISOString();

  return {
    type: 'casper_cspr_transfer',
    network: process.env.CASPER_NETWORK || 'mainnet',
    chain_name: process.env.CASPER_CHAIN_NAME || 'casper',
    recipient,
    sender_public_key: opts.senderPublicKey || null,
    order_id: opts.orderId,
    amount_usdc: opts.amountUsdc,
    amount_cspr: formatCSPR(amountMotes),
    amount_motes: amountMotes.toString(),
    transfer_id: opts.transferId,
    expires_at: expiresAt,
  };
}

module.exports = {
  CasperPaymentAmountError,
  DEFAULT_MIN_TRANSFER_MOTES,
  MOTES_PER_CSPR,
  FIRST_TRANSFER_ID,
  TRANSFER_ID_STATE_KEY,
  allocateTransferId,
  buildCasperPayment,
  formatCSPR,
  minTransferMotes,
  usdToMotes,
  _parsePositiveDecimal: parsePositiveDecimal,
};
