// Unit tests for the checkAgentFundingStatus Casper RPC poller.
//
//   F2-funding-casper: Casper RPC errors are dedup'd and emit a
//               `funding.casper_rpc_error` bizEvent once per outage
//               window. -32009 "No such account" is quiet (expected
//               "wallet unactivated"); other RPC errors and network
//               exceptions alert once per outage window and emit
//               `funding.casper_recovered` on the first success after.

require('../helpers/env');

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { db, resetDb, createTestKey } = require('../helpers/app');

const { checkAgentFundingStatus, _resetFundingCasperOutageState } = require('../../src/jobs');

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

let origProvider;
let origCasperRpc;

beforeEach(() => {
  resetDb();
  fetchCalls.length = 0;
  fetchImpl = null;
  _resetFundingCasperOutageState();
  origProvider = process.env.PAYMENT_PROVIDER;
  origCasperRpc = process.env.CASPER_NODE_RPC_URL;
  captureBizEvents();
});

afterEach(() => {
  if (origProvider === undefined) delete process.env.PAYMENT_PROVIDER;
  else process.env.PAYMENT_PROVIDER = origProvider;
  if (origCasperRpc === undefined) delete process.env.CASPER_NODE_RPC_URL;
  else process.env.CASPER_NODE_RPC_URL = origCasperRpc;
  restoreBizEvents();
});

// ── F2-funding-casper: Casper RPC funding poller ───────────────────────────
//
//   The poller queries the Casper node JSON-RPC (struct params, node
//   api_version 2.0.0): state_get_account_info -> query_balance.
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
    assert.ok(
      fetchCalls.every((c) => c.url === CASPER_RPC_URL),
      'poller should only hit the Casper RPC URL',
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
