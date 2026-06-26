require('../helpers/env');

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const db = require('../../src/db');
const {
  DEFAULT_MIN_TRANSFER_MOTES,
  allocateTransferId,
  buildCasperPayment,
  formatCSPR,
  usdToMotes,
  TRANSFER_ID_STATE_KEY,
} = require('../../src/payments/casper');
const { buildMockUsdcPayment, usdToMockUsdcBaseUnits } = require('../../src/payments/casper-cep18');

function restoreEnv(name, value) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

describe('Casper CSPR payment helpers', () => {
  beforeEach(() => {
    db.prepare(`DELETE FROM system_state WHERE key = ?`).run(TRANSFER_ID_STATE_KEY);
  });

  it('converts USD to motes with integer math', () => {
    assert.equal(usdToMotes('10.00', '0.01').toString(), '1000000000000');
    assert.equal(formatCSPR(1_000_000_000_000n), '1000.000000000');
  });

  it('rounds up fractional motes instead of undercharging', () => {
    assert.equal(usdToMotes('0.01', '0.03').toString(), '333333334');
  });

  it('rejects invalid rates and amounts', () => {
    assert.throws(() => usdToMotes('10.00', '0'), /CSPR_USD_RATE/);
    assert.throws(() => usdToMotes('10.00', 'abc'), /CSPR_USD_RATE/);
    assert.throws(() => usdToMotes('0', '0.01'), /amount_usdc/);
  });

  it('allocates numeric transfer ids from a serialized DB counter', () => {
    assert.equal(allocateTransferId(), 100000);
    assert.equal(allocateTransferId(), 100001);

    const row = db
      .prepare(`SELECT value FROM system_state WHERE key = ?`)
      .get(TRANSFER_ID_STATE_KEY);
    assert.equal(row.value, '100002');
  });

  it('builds a Casper transfer payment envelope', () => {
    const payment = buildCasperPayment({
      orderId: 'order-123',
      amountUsdc: '10.00',
      transferId: 123456,
      now: new Date('2026-01-01T00:00:00.000Z'),
    });

    assert.equal(payment.type, 'casper_cspr_transfer');
    assert.equal(payment.network, 'testnet');
    assert.equal(payment.chain_name, 'casper-test');
    assert.equal(payment.recipient, process.env.CASPER_TREASURY_PUBLIC_KEY);
    assert.equal(payment.order_id, 'order-123');
    assert.equal(payment.amount_usdc, '10.00');
    assert.equal(payment.amount_motes, '1000000000000');
    assert.equal(payment.amount_cspr, '1000.000000000');
    assert.equal(payment.transfer_id, 123456);
    assert.equal(payment.expires_at, '2026-01-01T01:00:00.000Z');
  });

  it('rejects native CSPR payment instructions below the Casper transfer minimum', () => {
    assert.equal(DEFAULT_MIN_TRANSFER_MOTES.toString(), '2500000000');
    assert.throws(
      () =>
        buildCasperPayment({
          orderId: 'order-small',
          amountUsdc: '0.01',
          transferId: 123456,
          now: new Date('2026-01-01T00:00:00.000Z'),
        }),
      (err) => {
        assert.equal(err.code, 'casper_min_transfer_amount');
        assert.equal(err.status, 400);
        assert.equal(err.details.minimum_motes, '2500000000');
        assert.equal(err.details.amount_motes, '1000000000');
        return true;
      },
    );
  });
});

describe('Casper mockUSDC CEP-18 payment helpers', () => {
  it('converts USD to mockUSDC base units with integer math', () => {
    assert.equal(usdToMockUsdcBaseUnits('10.00', 6).toString(), '10000000');
    assert.equal(usdToMockUsdcBaseUnits('0.01', 6).toString(), '10000');
  });

  it('builds a mockUSDC CEP-18 payment envelope', () => {
    const previous = {
      enabled: process.env.MOCK_USDC_ENABLED,
      packageHash: process.env.MOCK_USDC_CONTRACT_PACKAGE_HASH,
      contractHash: process.env.MOCK_USDC_CONTRACT_HASH,
      decimals: process.env.MOCK_USDC_DECIMALS,
      baseUrl: process.env.CARDS402_BASE_URL,
    };
    process.env.MOCK_USDC_ENABLED = 'true';
    process.env.MOCK_USDC_CONTRACT_PACKAGE_HASH = 'f'.repeat(64);
    process.env.MOCK_USDC_CONTRACT_HASH = 'hash-' + 'e'.repeat(64);
    process.env.MOCK_USDC_DECIMALS = '6';
    process.env.CARDS402_BASE_URL = 'https://api.cards402.test';
    try {
      const payment = buildMockUsdcPayment({
        orderId: 'order-cep18',
        amountUsdc: '10.00',
        senderPublicKey: '01' + 'b'.repeat(64),
        now: new Date('2026-01-01T00:00:00.000Z'),
      });

      assert.equal(payment.type, 'casper_cep18_transfer');
      assert.equal(payment.asset, 'mockUSDC');
      assert.equal(payment.decimals, 6);
      assert.equal(payment.contract_package_hash, 'f'.repeat(64));
      assert.equal(payment.contract_hash, 'e'.repeat(64));
      assert.equal(payment.sender_public_key, '01' + 'b'.repeat(64));
      assert.equal(payment.recipient_public_key, process.env.CASPER_TREASURY_PUBLIC_KEY);
      assert.equal(payment.amount_base_units, '10000000');
      assert.equal(
        payment.verify_url,
        'https://api.cards402.test/v1/orders/order-cep18/verify-payment',
      );
    } finally {
      restoreEnv('MOCK_USDC_ENABLED', previous.enabled);
      restoreEnv('MOCK_USDC_CONTRACT_PACKAGE_HASH', previous.packageHash);
      restoreEnv('MOCK_USDC_CONTRACT_HASH', previous.contractHash);
      restoreEnv('MOCK_USDC_DECIMALS', previous.decimals);
      restoreEnv('CARDS402_BASE_URL', previous.baseUrl);
    }
  });
});
