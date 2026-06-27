// @ts-check
// Casper CEP-18 mockUSDC payment helpers for the CardCasper402 hackathon MVP.

const { _parsePositiveDecimal } = require('./casper');

const CASPER_HASH_RE = /^(hash-)?[0-9a-fA-F]{64}$/;

/** @param {string} value */
function normalizeCasperHash(value) {
  if (typeof value !== 'string' || !CASPER_HASH_RE.test(value)) {
    throw new Error('Casper contract hash must be 64 hex chars, optionally prefixed with hash-');
  }
  return value.replace(/^hash-/i, '').toLowerCase();
}

/** @param {unknown} value */
function normalizeDecimals(value) {
  const raw = value === undefined || value === null || value === '' ? '6' : String(value);
  if (!/^\d+$/.test(raw)) throw new Error('MOCK_USDC_DECIMALS must be a non-negative integer');
  const decimals = Number(raw);
  if (!Number.isSafeInteger(decimals) || decimals < 0 || decimals > 18) {
    throw new Error('MOCK_USDC_DECIMALS must be between 0 and 18');
  }
  return decimals;
}

/**
 * Convert a USD decimal string into mockUSDC base units.
 * mockUSDC uses the configured CEP-18 decimals, defaulting to USDC-like 6.
 * @param {string} amountUsd
 * @param {number|string} [decimalsInput]
 */
function usdToMockUsdcBaseUnits(amountUsd, decimalsInput = process.env.MOCK_USDC_DECIMALS || '6') {
  const decimals = normalizeDecimals(decimalsInput);
  const amount = _parsePositiveDecimal(amountUsd, 'amount_usdc');
  const tokenScale = 10n ** BigInt(decimals);
  if (tokenScale % amount.scale !== 0n) {
    throw new Error('amount_usdc has more decimal precision than mockUSDC supports');
  }
  return amount.units * (tokenScale / amount.scale);
}

/**
 * @param {{ orderId: string, amountUsdc: string, senderPublicKey: string, now?: Date }} opts
 */
function buildMockUsdcPayment(opts) {
  if (process.env.MOCK_USDC_ENABLED !== 'true') {
    throw new Error('MOCK_USDC_ENABLED must be true to create mockUSDC orders');
  }
  const packageHash = process.env.MOCK_USDC_CONTRACT_PACKAGE_HASH;
  if (!packageHash) throw new Error('MOCK_USDC_CONTRACT_PACKAGE_HASH is required');
  const recipient = process.env.CASPER_TREASURY_PUBLIC_KEY;
  if (!recipient) throw new Error('CASPER_TREASURY_PUBLIC_KEY is required');

  const ttlMinutes = parseInt(process.env.CASPER_PAYMENT_TTL_MINUTES || '60', 10);
  if (!Number.isFinite(ttlMinutes) || ttlMinutes <= 0) {
    throw new Error('CASPER_PAYMENT_TTL_MINUTES must be a positive integer');
  }
  const decimals = normalizeDecimals(process.env.MOCK_USDC_DECIMALS || '6');
  const amountBaseUnits = usdToMockUsdcBaseUnits(opts.amountUsdc, decimals);
  const now = opts.now ?? new Date();
  const expiresAt = new Date(now.getTime() + ttlMinutes * 60 * 1000).toISOString();
  const baseUrl = (process.env.CARDS402_BASE_URL || '').replace(/\/$/, '');

  return {
    type: 'casper_cep18_transfer',
    asset: 'mockUSDC',
    decimals,
    network: process.env.CASPER_NETWORK || 'mainnet',
    chain_name: process.env.CASPER_CHAIN_NAME || 'casper',
    contract_package_hash: normalizeCasperHash(packageHash),
    contract_hash: process.env.MOCK_USDC_CONTRACT_HASH
      ? normalizeCasperHash(process.env.MOCK_USDC_CONTRACT_HASH)
      : null,
    sender_public_key: opts.senderPublicKey.toLowerCase(),
    recipient_public_key: recipient.toLowerCase(),
    order_id: opts.orderId,
    amount: opts.amountUsdc,
    amount_base_units: amountBaseUnits.toString(),
    expires_at: expiresAt,
    verify_url: baseUrl ? `${baseUrl}/v1/orders/${opts.orderId}/verify-payment` : null,
  };
}

module.exports = {
  buildMockUsdcPayment,
  normalizeCasperHash,
  usdToMockUsdcBaseUnits,
  _normalizeDecimals: normalizeDecimals,
};
