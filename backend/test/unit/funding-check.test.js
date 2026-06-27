// Unit tests for the 2026-04-16 checkAgentFundingStatus hardening.
//
//   F1-funding: use the STELLAR_USDC_ISSUER env var (and a testnet-
//               aware Horizon base URL) instead of the hardcoded
//               mainnet issuer. Pre-fix, testnet deployments silently
//               failed to detect USDC funding because the issuer
//               never matched.
//
//   F2-funding: Horizon HTTP errors are now dedup'd and emit a
//               `funding.horizon_error` bizEvent. Pre-fix, a Horizon
//               outage silently `continue`d on every awaiting wallet
//               with zero ops signal. 404 is still quiet (expected
//               "wallet unactivated"); 429/500/503 and network
//               exceptions alert once per outage window.

require('../helpers/env');

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { v4: uuidv4 } = require('uuid');
const { db, resetDb, createTestKey } = require('../helpers/app');

const {
  checkAgentFundingStatus,
  _resetFundingHorizonOutageState,
  _resetFundingCasperOutageState,
  _horizonBase,
  _MAINNET_USDC_ISSUER,
} = require('../../src/jobs');

// ── Fetch stub ─────────────────────────────────────────────────────────────

const realFetch = global.fetch;
const fetchCalls = [];
let fetchImpl = null;

global.fetch = async (url, opts) => {
  fetchCalls.push({ url: String(url), opts });
  if (!fetchImpl) {
    return {
      ok: false,
      status: 404,
      json: async () => ({}),
      text: async () => '',
    };
  }
  return fetchImpl(String(url), opts);
};

function mockFetch(impl) {
  fetchImpl = impl;
}

function okResponse(body) {
  return {
    ok: true,
    status: 200,
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

function errorResponse(status) {
  return {
    ok: false,
    status,
    json: async () => ({}),
    text: async () => '',
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────

async function seedAwaitingAgent(walletKey) {
  const { id } = await createTestKey({ label: 'awaiting' });
  db.prepare(
    `UPDATE api_keys SET agent_state = 'awaiting_funding', wallet_public_key = ? WHERE id = ?`,
  ).run(walletKey, id);
  return id;
}

function getAgentState(id) {
  return /** @type {any} */ (
    db.prepare(`SELECT agent_state, agent_state_detail FROM api_keys WHERE id = ?`).get(id)
  );
}

// ── Logger capture ─────────────────────────────────────────────────────────

let origLoggerEvent;
let capturedEvents;

function captureBizEvents() {
  const logger = require('../../src/lib/logger');
  origLoggerEvent = logger.event;
  capturedEvents = [];
  logger.event = (name, fields) => capturedEvents.push({ name, fields });
}

function restoreBizEvents() {
  const logger = require('../../src/lib/logger');
  logger.event = origLoggerEvent;
}

// ── Common setup ──────────────────────────────────────────────────────────

let origNetwork;
let origIssuer;
let origProvider;
let origCasperRpc;

beforeEach(() => {
  resetDb();
  fetchCalls.length = 0;
  fetchImpl = null;
  _resetFundingHorizonOutageState();
  _resetFundingCasperOutageState();
  origNetwork = process.env.STELLAR_NETWORK;
  origIssuer = process.env.STELLAR_USDC_ISSUER;
  origProvider = process.env.PAYMENT_PROVIDER;
  origCasperRpc = process.env.CASPER_NODE_RPC_URL;
  // The F1/F2 tests below are Stellar-path. The poller's default
  // provider is now 'casper', so route these to the Stellar branch
  // explicitly. Casper cases override to 'casper' per-test.
  process.env.PAYMENT_PROVIDER = 'stellar';
  captureBizEvents();
});

afterEach(() => {
  if (origNetwork === undefined) delete process.env.STELLAR_NETWORK;
  else process.env.STELLAR_NETWORK = origNetwork;
  if (origIssuer === undefined) delete process.env.STELLAR_USDC_ISSUER;
  else process.env.STELLAR_USDC_ISSUER = origIssuer;
  if (origProvider === undefined) delete process.env.PAYMENT_PROVIDER;
  else process.env.PAYMENT_PROVIDER = origProvider;
  if (origCasperRpc === undefined) delete process.env.CASPER_NODE_RPC_URL;
  else process.env.CASPER_NODE_RPC_URL = origCasperRpc;
  restoreBizEvents();
});

// ── F1-funding: env-configurable USDC issuer + network-aware base ─────────

describe('F1-funding: env-configurable Horizon base URL', () => {
  it('uses mainnet Horizon when STELLAR_NETWORK is unset', () => {
    delete process.env.STELLAR_NETWORK;
    assert.equal(_horizonBase(), 'https://horizon.stellar.org');
  });

  it('uses mainnet Horizon when STELLAR_NETWORK=mainnet', () => {
    process.env.STELLAR_NETWORK = 'mainnet';
    assert.equal(_horizonBase(), 'https://horizon.stellar.org');
  });

  it('uses testnet Horizon when STELLAR_NETWORK=testnet', () => {
    process.env.STELLAR_NETWORK = 'testnet';
    assert.equal(_horizonBase(), 'https://horizon-testnet.stellar.org');
  });
});

describe('F1-funding: env-configurable USDC issuer', () => {
  it('hits the mainnet Horizon URL when STELLAR_NETWORK=mainnet', async () => {
    process.env.STELLAR_NETWORK = 'mainnet';
    await seedAwaitingAgent('GWALLET_A');
    mockFetch(() => errorResponse(404));
    await checkAgentFundingStatus();
    assert.equal(fetchCalls.length, 1);
    assert.match(fetchCalls[0].url, /^https:\/\/horizon\.stellar\.org\/accounts\/GWALLET_A$/);
  });

  it('hits the testnet Horizon URL when STELLAR_NETWORK=testnet', async () => {
    process.env.STELLAR_NETWORK = 'testnet';
    await seedAwaitingAgent('GWALLET_B');
    mockFetch(() => errorResponse(404));
    await checkAgentFundingStatus();
    assert.equal(fetchCalls.length, 1);
    assert.match(
      fetchCalls[0].url,
      /^https:\/\/horizon-testnet\.stellar\.org\/accounts\/GWALLET_B$/,
    );
  });

  it('detects USDC funding using a testnet-specific issuer from env', async () => {
    process.env.STELLAR_NETWORK = 'testnet';
    // Fake testnet USDC issuer (shape-valid 56-char G-key).
    const TESTNET_USDC = 'G' + 'T'.repeat(55);
    process.env.STELLAR_USDC_ISSUER = TESTNET_USDC;

    const agentId = await seedAwaitingAgent('GWALLET_TESTNET');
    mockFetch(() =>
      okResponse({
        balances: [
          { asset_type: 'native', balance: '0.5000000' }, // below 2 XLM floor
          {
            asset_type: 'credit_alphanum4',
            asset_code: 'USDC',
            asset_issuer: TESTNET_USDC,
            balance: '10.5000000',
          },
        ],
      }),
    );

    await checkAgentFundingStatus();

    // Agent should be funded — pre-fix, the hardcoded mainnet issuer
    // never matched this entry and the agent stayed in awaiting_funding
    // forever despite having USDC on testnet.
    const state = getAgentState(agentId);
    assert.equal(state.agent_state, 'funded');
    assert.match(state.agent_state_detail, /usdc=10\.50/);
  });

  it('does NOT match mainnet USDC balance on a testnet deploy (isolation)', async () => {
    process.env.STELLAR_NETWORK = 'testnet';
    const TESTNET_USDC = 'G' + 'T'.repeat(55);
    process.env.STELLAR_USDC_ISSUER = TESTNET_USDC;

    const agentId = await seedAwaitingAgent('GWALLET_MIX');
    mockFetch(() =>
      okResponse({
        balances: [
          {
            asset_type: 'credit_alphanum4',
            asset_code: 'USDC',
            // Mainnet issuer — must NOT match on a testnet deploy.
            asset_issuer: _MAINNET_USDC_ISSUER,
            balance: '10.00',
          },
        ],
      }),
    );

    await checkAgentFundingStatus();
    // Agent stays awaiting — we only fund on the configured issuer.
    assert.equal(getAgentState(agentId).agent_state, 'awaiting_funding');
  });

  it('still matches mainnet USDC when STELLAR_USDC_ISSUER is unset', async () => {
    delete process.env.STELLAR_USDC_ISSUER;
    const agentId = await seedAwaitingAgent('GWALLET_DEFAULT');
    mockFetch(() =>
      okResponse({
        balances: [
          {
            asset_type: 'credit_alphanum4',
            asset_code: 'USDC',
            asset_issuer: _MAINNET_USDC_ISSUER,
            balance: '5.00',
          },
        ],
      }),
    );
    await checkAgentFundingStatus();
    assert.equal(getAgentState(agentId).agent_state, 'funded');
  });
});

// ── F2-funding: Horizon HTTP error observability ──────────────────────────

describe('F2-funding: Horizon error alerting', () => {
  it('is QUIET on 404 (unactivated wallet — expected)', async () => {
    await seedAwaitingAgent('GWALLET_UNACTIVATED');
    mockFetch(() => errorResponse(404));
    await checkAgentFundingStatus();
    // No bizEvent.
    assert.equal(capturedEvents.filter((e) => e.name === 'funding.horizon_error').length, 0);
  });

  it('emits funding.horizon_error on HTTP 500', async () => {
    await seedAwaitingAgent('GWALLET_500');
    mockFetch(() => errorResponse(500));
    await checkAgentFundingStatus();
    const err = capturedEvents.find((e) => e.name === 'funding.horizon_error');
    assert.ok(err, 'expected horizon_error event on HTTP 500');
    assert.equal(err.fields.status, 500);
  });

  it('emits funding.horizon_error on HTTP 429 (rate limit)', async () => {
    await seedAwaitingAgent('GWALLET_429');
    mockFetch(() => errorResponse(429));
    await checkAgentFundingStatus();
    const err = capturedEvents.find((e) => e.name === 'funding.horizon_error');
    assert.ok(err);
    assert.equal(err.fields.status, 429);
  });

  it('emits exactly ONE horizon_error per outage (dedup across awaiting rows)', async () => {
    // Three awaiting agents; Horizon returns 503 for all of them.
    // Pre-fix: zero bizEvents. Post-fix: one per outage, not per agent.
    await seedAwaitingAgent('GWALLET_A');
    await seedAwaitingAgent('GWALLET_B');
    await seedAwaitingAgent('GWALLET_C');
    mockFetch(() => errorResponse(503));
    await checkAgentFundingStatus();
    const errs = capturedEvents.filter((e) => e.name === 'funding.horizon_error');
    assert.equal(errs.length, 1, `expected 1 deduped horizon_error, got ${errs.length}`);
  });

  it('clears the outage flag on recovery and emits funding.horizon_recovered', async () => {
    await seedAwaitingAgent('GWALLET_RECOVER');

    // First tick: Horizon is down (503).
    mockFetch(() => errorResponse(503));
    await checkAgentFundingStatus();
    assert.ok(capturedEvents.some((e) => e.name === 'funding.horizon_error'));

    // Second tick: Horizon is back, wallet is unfunded but the fetch
    // succeeds. We expect a `funding.horizon_recovered` bizEvent.
    capturedEvents.length = 0;
    mockFetch(() =>
      okResponse({
        balances: [{ asset_type: 'native', balance: '0.1' }],
      }),
    );
    await checkAgentFundingStatus();
    assert.ok(
      capturedEvents.some((e) => e.name === 'funding.horizon_recovered'),
      `expected horizon_recovered event on first successful fetch after outage`,
    );
  });

  it('re-alerts on a NEW outage after recovery', async () => {
    await seedAwaitingAgent('GWALLET_FLAP');

    // Outage 1.
    mockFetch(() => errorResponse(500));
    await checkAgentFundingStatus();
    assert.equal(capturedEvents.filter((e) => e.name === 'funding.horizon_error').length, 1);

    // Recovery.
    mockFetch(() => okResponse({ balances: [{ asset_type: 'native', balance: '0.1' }] }));
    await checkAgentFundingStatus();

    // Outage 2 — must emit a fresh error event, not be suppressed
    // by the first outage's dedup state.
    capturedEvents.length = 0;
    mockFetch(() => errorResponse(500));
    await checkAgentFundingStatus();
    assert.equal(
      capturedEvents.filter((e) => e.name === 'funding.horizon_error').length,
      1,
      'second outage must re-alert after recovery cleared the dedup flag',
    );
  });

  it('emits horizon_error when fetch itself throws (network/timeout)', async () => {
    await seedAwaitingAgent('GWALLET_NETWORK');
    // Silence the expected console.error line.
    const origErr = console.error;
    console.error = () => {};
    try {
      mockFetch(() => {
        throw new Error('connect ECONNREFUSED');
      });
      await checkAgentFundingStatus();
    } finally {
      console.error = origErr;
    }
    const err = capturedEvents.find((e) => e.name === 'funding.horizon_error');
    assert.ok(err);
    assert.equal(err.fields.status, 'exception');
    assert.match(err.fields.error, /ECONNREFUSED/);
  });
});

// ── F2-funding-casper: Casper RPC funding poller ───────────────────────────
//
//   checkAgentFundingStatus routes on PAYMENT_PROVIDER (default 'casper').
//   The Casper branch queries the Casper node JSON-RPC (struct params,
//   node api_version 2.0.0): state_get_account_info -> query_balance.
//   A freshly-onboarded key has no on-chain account until its first
//   deposit, surfaced as RPC error -32009 "No such account" (quiet,
//   retry next tick — NOT an outage). motes>0 flips agent_state to
//   'funded' with detail `cspr=<motes/1e9>`.

const CASPER_RPC_URL = 'https://node.testnet.casper.network/rpc';
// Valid-shape Casper Ed25519 public key: '01' + 32 bytes hex.
const CASPER_PK = '01' + 'a3'.repeat(32);

// Route a mocked fetch to a per-method Casper JSON-RPC handler.
// `handler(method, params)` returns either `{ result }` or `{ error }`.
function casperRpcMock(handler) {
  mockFetch((url, opts) => {
    const body = JSON.parse(opts.body);
    const out = handler(body.method, body.params);
    if (out.error) return okResponse({ jsonrpc: '2.0', id: '1', error: out.error });
    return okResponse({ jsonrpc: '2.0', id: '1', result: out.result });
  });
}

describe('F2-funding-casper: Casper RPC funding poller', () => {
  beforeEach(() => {
    process.env.PAYMENT_PROVIDER = 'casper';
    process.env.CASPER_NODE_RPC_URL = CASPER_RPC_URL;
  });

  it('flips to funded when query_balance returns >0 motes', async () => {
    const agentId = await seedAwaitingAgent(CASPER_PK);
    casperRpcMock((method) => {
      if (method === 'state_get_account_info') {
        return { result: { account: { account_hash: 'account-hash-deadbeef' } } };
      }
      if (method === 'query_balance') {
        // 5 CSPR = 5_000_000_000 motes
        return { result: { balance: '5000000000' } };
      }
      throw new Error(`unexpected method ${method}`);
    });

    await checkAgentFundingStatus();

    const state = getAgentState(agentId);
    assert.equal(state.agent_state, 'funded');
    assert.match(state.agent_state_detail, /^cspr=5\.000000000$/);
    // Casper branch must NOT touch Horizon.
    assert.ok(
      fetchCalls.every((c) => c.url === CASPER_RPC_URL),
      'casper branch should only hit the Casper RPC URL',
    );
    // Both RPC methods were called in order.
    const methods = fetchCalls.map((c) => JSON.parse(c.opts.body).method);
    assert.deepEqual(methods, ['state_get_account_info', 'query_balance']);
  });

  it('stays awaiting (quiet, no alert) on -32009 No such account', async () => {
    const agentId = await seedAwaitingAgent(CASPER_PK);
    casperRpcMock(() => ({ error: { code: -32009, message: 'No such account' } }));

    await checkAgentFundingStatus();

    assert.equal(getAgentState(agentId).agent_state, 'awaiting_funding');
    // No outage alert — -32009 is "not funded yet", not an outage.
    assert.equal(capturedEvents.filter((e) => e.name === 'funding.casper_rpc_error').length, 0);
    // Only the first RPC call happened (no query_balance after not-found).
    const methods = fetchCalls.map((c) => JSON.parse(c.opts.body).method);
    assert.deepEqual(methods, ['state_get_account_info']);
  });

  it('stays awaiting on a funded account with zero balance', async () => {
    const agentId = await seedAwaitingAgent(CASPER_PK);
    casperRpcMock((method) => {
      if (method === 'state_get_account_info') {
        return { result: { account: { account_hash: 'account-hash-zero' } } };
      }
      return { result: { balance: '0' } };
    });

    await checkAgentFundingStatus();

    assert.equal(getAgentState(agentId).agent_state, 'awaiting_funding');
  });

  it('emits funding.casper_rpc_error once per outage (dedup across rows)', async () => {
    await seedAwaitingAgent(CASPER_PK);
    await seedAwaitingAgent('01' + 'b4'.repeat(32));
    await seedAwaitingAgent('01' + 'c5'.repeat(32));
    // -32603 = generic RPC error (NOT -32009) → outage path.
    casperRpcMock(() => ({ error: { code: -32603, message: 'internal error' } }));

    const origErr = console.error;
    console.error = () => {};
    try {
      await checkAgentFundingStatus();
    } finally {
      console.error = origErr;
    }

    const errs = capturedEvents.filter((e) => e.name === 'funding.casper_rpc_error');
    assert.equal(errs.length, 1, `expected 1 deduped casper_rpc_error, got ${errs.length}`);
  });

  it('emits funding.casper_recovered on the first successful RPC after an outage', async () => {
    await seedAwaitingAgent(CASPER_PK);

    // Tick 1: outage (non-32009 RPC error).
    casperRpcMock(() => ({ error: { code: -32603, message: 'internal error' } }));
    const origErr = console.error;
    console.error = () => {};
    try {
      await checkAgentFundingStatus();
    } finally {
      console.error = origErr;
    }
    assert.ok(capturedEvents.some((e) => e.name === 'funding.casper_rpc_error'));

    // Tick 2: node responds (account still unfunded → -32009 is a valid
    // node answer, not an outage) → recovered event fires.
    capturedEvents.length = 0;
    casperRpcMock(() => ({ error: { code: -32009, message: 'No such account' } }));
    await checkAgentFundingStatus();
    assert.ok(
      capturedEvents.some((e) => e.name === 'funding.casper_recovered'),
      'expected casper_recovered on first successful node response after outage',
    );
    // And it stays awaiting (still unfunded).
    assert.equal(capturedEvents.filter((e) => e.name === 'funding.casper_rpc_error').length, 0);
  });

  it('emits casper_rpc_error when fetch itself throws (network/timeout)', async () => {
    await seedAwaitingAgent(CASPER_PK);
    const origErr = console.error;
    console.error = () => {};
    try {
      mockFetch(() => {
        throw new Error('connect ECONNREFUSED');
      });
      await checkAgentFundingStatus();
    } finally {
      console.error = origErr;
    }
    const err = capturedEvents.find((e) => e.name === 'funding.casper_rpc_error');
    assert.ok(err);
    assert.match(err.fields.error, /ECONNREFUSED/);
  });
});

// Restore real fetch on process exit.
process.on('exit', () => {
  global.fetch = realFetch;
});
