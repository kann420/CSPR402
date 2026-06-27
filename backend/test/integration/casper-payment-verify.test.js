require('../helpers/env');

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { PublicKey } = require('casper-js-sdk');
const { request, resetDb, db, createTestKey } = require('../helpers/app');
const { luhnValid } = require('../../src/lib/virtual-card');

const DEPLOY_HASH = 'a'.repeat(64);
const SENDER = '01' + 'b'.repeat(64);
const PACKAGE_HASH = 'f'.repeat(64);

function recipientAccountHash(publicKeyHex) {
  return PublicKey.fromHex(publicKeyHex).accountHash().toPrefixedString().toLowerCase();
}

function u256Bytes(value) {
  let hex = BigInt(value).toString(16);
  if (hex.length % 2 === 1) hex = `0${hex}`;
  const bytes = hex.match(/../g)?.reverse().join('') || '00';
  const len = (bytes.length / 2).toString(16).padStart(2, '0');
  return `${len}${bytes}`;
}

function deployRpcBody({
  payment,
  hash = DEPLOY_HASH,
  errorMessage = null,
  amountMotes,
  transferId,
} = {}) {
  return {
    jsonrpc: '2.0',
    id: 1,
    result: {
      api_version: '2.0.0',
      deploy: {
        hash,
        header: {
          account: SENDER,
          chain_name: payment.chain_name,
        },
        session: {
          Transfer: {
            args: [
              ['amount', { cl_type: 'U512', parsed: amountMotes ?? payment.amount_motes }],
              ['target', { cl_type: 'PublicKey', parsed: payment.recipient }],
              ['id', { cl_type: { Option: 'U64' }, parsed: transferId ?? payment.transfer_id }],
            ],
          },
        },
      },
      execution_info: {
        block_hash: 'c'.repeat(64),
        block_height: 777,
        execution_result: {
          Version2: {
            initiator: { PublicKey: SENDER },
            error_message: errorMessage,
            cost: '2500000000',
          },
        },
      },
    },
  };
}

function transactionRpcBody({
  payment,
  hash = DEPLOY_HASH,
  errorMessage = null,
  amountMotes,
  transferId,
  recipientHash,
} = {}) {
  return {
    jsonrpc: '2.0',
    id: 1,
    result: {
      api_version: '2.0.0',
      transaction: {
        Version1: {
          hash,
          header: {
            initiator_addr: { PublicKey: SENDER },
            chain_name: payment.chain_name,
          },
          body: {
            entry_point: 'Transfer',
            args: [
              ['amount', { cl_type: 'U512', parsed: amountMotes ?? payment.amount_motes }],
              ['target', { cl_type: 'URef', parsed: 'uref-' + 'd'.repeat(64) + '-004' }],
              ['id', { cl_type: { Option: 'U64' }, parsed: transferId ?? payment.transfer_id }],
            ],
          },
        },
      },
      execution_info: {
        block_hash: 'c'.repeat(64),
        block_height: 777,
        execution_result: {
          Version2: {
            initiator: { PublicKey: SENDER },
            error_message: errorMessage,
            cost: '2500000000',
            transfers: [
              {
                Version2: {
                  transaction_hash: { Deploy: hash },
                  to: recipientHash ?? recipientAccountHash(payment.recipient),
                  target: 'uref-' + 'd'.repeat(64) + '-004',
                  amount: amountMotes ?? payment.amount_motes,
                  id: transferId ?? payment.transfer_id,
                },
              },
            ],
          },
        },
      },
    },
  };
}

function mockUsdcTransactionRpcBody({
  payment,
  hash = DEPLOY_HASH,
  sender = SENDER,
  packageHash = payment.contract_package_hash,
  recipientHash = recipientAccountHash(payment.recipient_public_key),
  amountBaseUnits = payment.amount_base_units,
  entryPoint = { Custom: 'transfer' },
  errorMessage = null,
} = {}) {
  return {
    jsonrpc: '2.0',
    id: 1,
    result: {
      api_version: '2.0.0',
      transaction: {
        Version1: {
          hash,
          payload: {
            initiator_addr: { PublicKey: sender },
            chain_name: payment.chain_name,
            fields: {
              entry_point: entryPoint,
              target: {
                Stored: {
                  id: {
                    ByPackageHash: {
                      addr: packageHash,
                    },
                  },
                },
              },
              args: {
                Named: [
                  [
                    'recipient',
                    {
                      bytes: `00${recipientHash.replace('account-hash-', '')}`,
                      cl_type: 'Key',
                    },
                  ],
                  ['amount', { bytes: u256Bytes(amountBaseUnits), cl_type: 'U256' }],
                ],
              },
            },
          },
        },
      },
      execution_info: {
        block_hash: 'c'.repeat(64),
        block_height: 777,
        execution_result: {
          Version2: {
            initiator: { PublicKey: sender },
            error_message: errorMessage,
            cost: '2500000000',
          },
        },
      },
    },
  };
}

async function createOrder(key, body = {}) {
  const create = await request
    .post('/v1/orders')
    .set('X-Api-Key', key.key)
    .send({ amount_usdc: '10.00', ...body });
  assert.equal(create.status, 201);
  return create.body;
}

describe('POST /v1/orders/:id/verify-payment — Casper CSPR', () => {
  const originalFetch = global.fetch;
  const originalEnv = {};
  let key;

  beforeEach(async () => {
    for (const name of [
      'MOCK_USDC_ENABLED',
      'MOCK_USDC_CONTRACT_PACKAGE_HASH',
      'MOCK_USDC_CONTRACT_HASH',
      'MOCK_USDC_DECIMALS',
    ]) {
      originalEnv[name] = process.env[name];
    }
    resetDb();
    key = await createTestKey();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    for (const [name, value] of Object.entries(originalEnv)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });

  it('verifies a finalized Casper transfer, fulfills one mock card, and returns a receipt', async () => {
    const order = await createOrder(key);
    global.fetch = async (_url, init) => {
      const body = JSON.parse(init.body);
      if (body.method === 'info_get_transaction') {
        return new Response(JSON.stringify(transactionRpcBody({ payment: order.payment })), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response(JSON.stringify(deployRpcBody({ payment: order.payment })), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };

    const res = await request
      .post(`/v1/orders/${order.order_id}/verify-payment`)
      .set('X-Api-Key', key.key)
      .send({ deploy_hash: DEPLOY_HASH });

    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
    assert.equal(res.body.receipt.type, 'casper_cspr_receipt');
    assert.equal(res.body.receipt.deploy_hash, DEPLOY_HASH);
    assert.equal(res.body.receipt.transfer_id, order.payment.transfer_id);
    assert.equal(res.body.receipt.amount_motes, order.payment.amount_motes);
    assert.equal(res.body.receipt.card_mode, 'mock');
    assert.equal(res.body.order.phase, 'ready');
    // Card is now generated fresh per order: a unique Luhn-valid Visa-pattern PAN.
    assert.match(res.body.order.card.number, /^4\d{15}$/);
    assert.equal(luhnValid(res.body.order.card.number), true);

    const poll = await request.get(`/v1/orders/${order.order_id}`).set('X-Api-Key', key.key);
    assert.equal(poll.status, 200);
    assert.equal(poll.body.phase, 'ready');
    assert.equal(poll.body.card.brand, 'CSPR402 Virtual Card');
    assert.equal(poll.body.receipt.type, 'casper_cspr_receipt');

    const row = db
      .prepare(
        `SELECT status, casper_deploy_hash, casper_sender_public_key, payment_receipt_json
         FROM orders WHERE id = ?`,
      )
      .get(order.order_id);
    assert.equal(row.status, 'delivered');
    assert.equal(row.casper_deploy_hash, DEPLOY_HASH);
    assert.equal(row.casper_sender_public_key, SENDER);
    assert.equal(JSON.parse(row.payment_receipt_json).deploy_hash, DEPLOY_HASH);
  });

  it('falls back to info_get_deploy for legacy deploy lookups that are absent from transaction RPC', async () => {
    const order = await createOrder(key);
    global.fetch = async (_url, init) => {
      const body = JSON.parse(init.body);
      if (body.method === 'info_get_transaction') {
        return new Response(
          JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            error: { code: -32014, message: 'No such transaction' },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      return new Response(JSON.stringify(deployRpcBody({ payment: order.payment })), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };

    const res = await request
      .post(`/v1/orders/${order.order_id}/verify-payment`)
      .set('X-Api-Key', key.key)
      .send({ deploy_hash: DEPLOY_HASH });

    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
    assert.equal(res.body.receipt.deploy_hash, DEPLOY_HASH);
  });

  it('is idempotent for repeated verify calls with the same deploy hash', async () => {
    const order = await createOrder(key);
    global.fetch = async () =>
      new Response(JSON.stringify(transactionRpcBody({ payment: order.payment })), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });

    const first = await request
      .post(`/v1/orders/${order.order_id}/verify-payment`)
      .set('X-Api-Key', key.key)
      .send({ deploy_hash: DEPLOY_HASH });
    const second = await request
      .post(`/v1/orders/${order.order_id}/verify-payment`)
      .set('X-Api-Key', key.key)
      .send({ deploy_hash: DEPLOY_HASH });

    assert.equal(first.status, 200);
    assert.equal(second.status, 200);
    assert.equal(second.body.note, 'already_verified');
    assert.deepEqual(second.body.order.card, first.body.order.card);
  });

  it('rejects a wrong transfer id', async () => {
    const order = await createOrder(key);
    global.fetch = async () =>
      new Response(
        JSON.stringify(transactionRpcBody({ payment: order.payment, transferId: 999999 })),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      );

    const res = await request
      .post(`/v1/orders/${order.order_id}/verify-payment`)
      .set('X-Api-Key', key.key)
      .send({ deploy_hash: DEPLOY_HASH });

    assert.equal(res.status, 422);
    assert.equal(res.body.error, 'wrong_transfer_id');
  });

  it('rejects a wrong sender when the caller provides an expected payer', async () => {
    const order = await createOrder(key);
    global.fetch = async () =>
      new Response(JSON.stringify(transactionRpcBody({ payment: order.payment })), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });

    const res = await request
      .post(`/v1/orders/${order.order_id}/verify-payment`)
      .set('X-Api-Key', key.key)
      .send({
        deploy_hash: DEPLOY_HASH,
        sender_public_key: '01' + 'c'.repeat(64),
      });

    assert.equal(res.status, 422);
    assert.equal(res.body.error, 'wrong_sender');
  });

  it('rejects a failed deploy execution', async () => {
    const order = await createOrder(key);
    global.fetch = async () =>
      new Response(
        JSON.stringify(
          transactionRpcBody({ payment: order.payment, errorMessage: 'Insufficient funds' }),
        ),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );

    const res = await request
      .post(`/v1/orders/${order.order_id}/verify-payment`)
      .set('X-Api-Key', key.key)
      .send({ deploy_hash: DEPLOY_HASH });

    assert.equal(res.status, 422);
    assert.equal(res.body.error, 'execution_failed');
  });

  it('rejects a wrong recipient from a transaction transfer record', async () => {
    const order = await createOrder(key);
    global.fetch = async () =>
      new Response(
        JSON.stringify(
          transactionRpcBody({
            payment: order.payment,
            recipientHash: 'account-hash-' + 'd'.repeat(64),
          }),
        ),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );

    const res = await request
      .post(`/v1/orders/${order.order_id}/verify-payment`)
      .set('X-Api-Key', key.key)
      .send({ deploy_hash: DEPLOY_HASH });

    assert.equal(res.status, 422);
    assert.equal(res.body.error, 'wrong_recipient');
  });

  it('expires the order when the Casper payment window has passed', async () => {
    const order = await createOrder(key);
    const expired = { ...order.payment, expires_at: new Date(Date.now() - 1000).toISOString() };
    db.prepare(`UPDATE orders SET vcc_payment_json = ? WHERE id = ?`).run(
      JSON.stringify(expired),
      order.order_id,
    );

    const res = await request
      .post(`/v1/orders/${order.order_id}/verify-payment`)
      .set('X-Api-Key', key.key)
      .send({ deploy_hash: DEPLOY_HASH });

    assert.equal(res.status, 410);
    assert.equal(res.body.error, 'payment_expired');
    const row = db.prepare(`SELECT status FROM orders WHERE id = ?`).get(order.order_id);
    assert.equal(row.status, 'expired');
  });

  it('creates and verifies a mockUSDC CEP-18 payment, then stores one receipt', async () => {
    process.env.MOCK_USDC_ENABLED = 'true';
    process.env.MOCK_USDC_CONTRACT_PACKAGE_HASH = PACKAGE_HASH;
    process.env.MOCK_USDC_CONTRACT_HASH = 'e'.repeat(64);
    process.env.MOCK_USDC_DECIMALS = '6';

    const order = await createOrder(key, {
      payment_asset: 'mock_usdc_cep18',
      payer_public_key: SENDER,
    });
    assert.equal(order.payment.type, 'casper_cep18_transfer');
    assert.equal(order.payment.asset, 'mockUSDC');
    assert.equal(order.payment.amount_base_units, '10000000');
    assert.equal(order.payment.contract_package_hash, PACKAGE_HASH);
    assert.equal(order.payment.sender_public_key, SENDER);

    global.fetch = async () =>
      new Response(JSON.stringify(mockUsdcTransactionRpcBody({ payment: order.payment })), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });

    const first = await request
      .post(`/v1/orders/${order.order_id}/verify-payment`)
      .set('X-Api-Key', key.key)
      .send({ deploy_hash: DEPLOY_HASH, sender_public_key: SENDER });
    const second = await request
      .post(`/v1/orders/${order.order_id}/verify-payment`)
      .set('X-Api-Key', key.key)
      .send({ deploy_hash: DEPLOY_HASH, sender_public_key: SENDER });

    assert.equal(first.status, 200);
    assert.equal(first.body.ok, true);
    assert.equal(first.body.receipt.type, 'casper_mock_usdc_receipt');
    assert.equal(first.body.receipt.payment_asset, 'mock_usdc_cep18');
    assert.equal(first.body.receipt.contract_package_hash, PACKAGE_HASH);
    assert.equal(first.body.receipt.amount_base_units, '10000000');
    assert.equal(first.body.order.card.brand, 'CSPR402 Virtual Card');
    assert.equal(second.status, 200);
    assert.equal(second.body.note, 'already_verified');

    const row = db
      .prepare(
        `SELECT status, casper_expected_sender_public_key, payment_receipt_json
         FROM orders WHERE id = ?`,
      )
      .get(order.order_id);
    assert.equal(row.status, 'delivered');
    assert.equal(row.casper_expected_sender_public_key, SENDER);
    assert.equal(JSON.parse(row.payment_receipt_json).type, 'casper_mock_usdc_receipt');
  });

  it('requires and binds payer public key for mockUSDC orders', async () => {
    process.env.MOCK_USDC_ENABLED = 'true';
    process.env.MOCK_USDC_CONTRACT_PACKAGE_HASH = PACKAGE_HASH;
    process.env.MOCK_USDC_DECIMALS = '6';

    const missing = await request
      .post('/v1/orders')
      .set('X-Api-Key', key.key)
      .send({ amount_usdc: '10.00', payment_asset: 'mock_usdc_cep18' });
    assert.equal(missing.status, 400);
    assert.equal(missing.body.error, 'invalid_payer_public_key');

    const order = await createOrder(key, {
      payment_asset: 'mock_usdc_cep18',
      payer_public_key: SENDER,
    });
    const wrongSender = await request
      .post(`/v1/orders/${order.order_id}/verify-payment`)
      .set('X-Api-Key', key.key)
      .send({ deploy_hash: DEPLOY_HASH, sender_public_key: '01' + 'c'.repeat(64) });
    assert.equal(wrongSender.status, 422);
    assert.equal(wrongSender.body.error, 'wrong_sender');
  });

  it('rejects reusing one deploy hash for another mockUSDC order', async () => {
    process.env.MOCK_USDC_ENABLED = 'true';
    process.env.MOCK_USDC_CONTRACT_PACKAGE_HASH = PACKAGE_HASH;
    process.env.MOCK_USDC_DECIMALS = '6';

    const firstOrder = await createOrder(key, {
      payment_asset: 'mock_usdc_cep18',
      payer_public_key: SENDER,
    });
    const secondOrder = await createOrder(key, {
      payment_asset: 'mock_usdc_cep18',
      payer_public_key: SENDER,
    });
    global.fetch = async () =>
      new Response(JSON.stringify(mockUsdcTransactionRpcBody({ payment: firstOrder.payment })), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });

    const first = await request
      .post(`/v1/orders/${firstOrder.order_id}/verify-payment`)
      .set('X-Api-Key', key.key)
      .send({ deploy_hash: DEPLOY_HASH, sender_public_key: SENDER });
    assert.equal(first.status, 200);

    const second = await request
      .post(`/v1/orders/${secondOrder.order_id}/verify-payment`)
      .set('X-Api-Key', key.key)
      .send({ deploy_hash: DEPLOY_HASH, sender_public_key: SENDER });
    assert.equal(second.status, 409);
    assert.equal(second.body.error, 'payment_already_redeemed');
  });
});
