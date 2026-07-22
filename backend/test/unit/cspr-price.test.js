// Unit tests for payments/cspr-price.js — the CoinGecko CSPR/USD feed
// with the fail-safe fallback chain: live price → stale cache →
// CSPR_USD_RATE env pin. The suite-wide helpers/env.js pins
// CSPR_PRICE_FEED_ENABLED='false'; each test here flips it on explicitly
// and mocks global.fetch so nothing touches the network.

require('../helpers/env');

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');

const {
  getCsprUsdRate,
  getCachedCsprUsdRate,
  _resetCache,
  _COINGECKO_URL,
} = require('../../src/payments/cspr-price');

// ── Fetch stub ─────────────────────────────────────────────────────────────

const realFetch = global.fetch;
let fetchCalls = 0;
let fetchImpl = null;

global.fetch = async (url, opts) => {
  fetchCalls += 1;
  if (!fetchImpl) throw new Error('unexpected fetch (no mock installed)');
  return fetchImpl(String(url), opts);
};

function mockPrice(price) {
  fetchImpl = () => ({
    ok: true,
    status: 200,
    json: async () => ({ 'casper-network': { usd: price } }),
  });
}

function mockHttpError(status) {
  fetchImpl = () => ({ ok: false, status, json: async () => ({}) });
}

// ── Logger capture ─────────────────────────────────────────────────────────

let origLoggerEvent;
let capturedEvents;

// ── Setup ──────────────────────────────────────────────────────────────────

beforeEach(() => {
  _resetCache();
  fetchCalls = 0;
  fetchImpl = null;
  process.env.CSPR_PRICE_FEED_ENABLED = 'true';
  const logger = require('../../src/lib/logger');
  origLoggerEvent = logger.event;
  capturedEvents = [];
  logger.event = (name, fields) => capturedEvents.push({ name, fields });
});

afterEach(() => {
  process.env.CSPR_PRICE_FEED_ENABLED = 'false';
  const logger = require('../../src/lib/logger');
  logger.event = origLoggerEvent;
});

// ── Tests ──────────────────────────────────────────────────────────────────

describe('getCsprUsdRate', () => {
  it('fetches CoinGecko and returns the price as a decimal string', async () => {
    mockPrice(0.0123);
    const r = await getCsprUsdRate();
    assert.equal(r.source, 'coingecko');
    assert.equal(r.rate, '0.01230000');
    assert.equal(fetchCalls, 1);
  });

  it('serves the cache within the TTL (single upstream fetch)', async () => {
    mockPrice(0.02);
    await getCsprUsdRate();
    const r = await getCsprUsdRate();
    assert.equal(r.rate, '0.02000000');
    assert.equal(fetchCalls, 1, 'second call must hit the cache');
  });

  it('dedups concurrent cache-miss callers onto one fetch', async () => {
    mockPrice(0.015);
    const [a, b, c] = await Promise.all([getCsprUsdRate(), getCsprUsdRate(), getCsprUsdRate()]);
    assert.equal(fetchCalls, 1, 'stampede must collapse into one fetch');
    assert.equal(a.rate, '0.01500000');
    assert.deepEqual([b.rate, c.rate], [a.rate, a.rate]);
  });

  it('falls back to the env pin on HTTP error and emits a bizEvent', async () => {
    mockHttpError(429);
    const r = await getCsprUsdRate();
    assert.equal(r.source, 'env');
    assert.equal(r.rate, process.env.CSPR_USD_RATE);
    const ev = capturedEvents.find((e) => e.name === 'cspr_price.fallback');
    assert.ok(ev, 'expected cspr_price.fallback event');
    assert.equal(ev.fields.source, 'env');
    assert.match(ev.fields.error, /429/);
  });

  it('rejects prices outside the sanity bounds (env fallback)', async () => {
    mockPrice(99999);
    const r = await getCsprUsdRate();
    assert.equal(r.source, 'env');
    const ev = capturedEvents.find((e) => e.name === 'cspr_price.fallback');
    assert.match(ev.fields.error, /sanity bounds/);
  });

  it('rejects a malformed response shape (env fallback)', async () => {
    fetchImpl = () => ({ ok: true, status: 200, json: async () => ({ unexpected: true }) });
    const r = await getCsprUsdRate();
    assert.equal(r.source, 'env');
  });

  it('prefers the stale cache over the env pin when upstream fails', async () => {
    // Prime the cache, then age it past the fresh TTL but inside the
    // stale window by rewinding fetchedAt via a second failing fetch.
    mockPrice(0.03);
    await getCsprUsdRate();
    // Force a cache miss on the next call by expiring the fresh TTL:
    // simplest deterministic route is resetting and re-priming with a
    // known fetchedAt is not exposed, so emulate: fail the refresh after
    // the TTL has "expired" — here we exercise the failure branch by
    // clearing only the in-flight state and making fetch fail while the
    // cached entry is still within the stale window but we bypass the
    // fresh-cache return by monkeypatching Date.now.
    const realNow = Date.now;
    try {
      const primedAt = realNow();
      Date.now = () => primedAt + 5 * 60_000; // 5 min later: fresh TTL gone, stale OK
      mockHttpError(500);
      const r = await getCsprUsdRate();
      assert.equal(r.source, 'stale_cache');
      assert.equal(r.rate, '0.03000000');
      const ev = capturedEvents.find((e) => e.name === 'cspr_price.fallback');
      assert.equal(ev.fields.source, 'stale_cache');
    } finally {
      Date.now = realNow;
    }
  });

  it('emits cspr_price.recovered on the first success after a fallback', async () => {
    mockHttpError(503);
    await getCsprUsdRate();
    mockPrice(0.011);
    const r = await getCsprUsdRate();
    assert.equal(r.source, 'coingecko');
    assert.ok(capturedEvents.some((e) => e.name === 'cspr_price.recovered'));
  });

  it('returns the env pin without fetching when the feed is disabled', async () => {
    process.env.CSPR_PRICE_FEED_ENABLED = 'false';
    const r = await getCsprUsdRate();
    assert.equal(r.source, 'env');
    assert.equal(r.rate, process.env.CSPR_USD_RATE);
    assert.equal(fetchCalls, 0);
  });

  it('targets the CoinGecko casper-network simple-price endpoint', () => {
    assert.match(_COINGECKO_URL, /coingecko\.com/);
    assert.match(_COINGECKO_URL, /casper-network/);
    assert.match(_COINGECKO_URL, /vs_currencies=usd/);
  });
});

describe('getCachedCsprUsdRate (sync display accessor)', () => {
  it('returns the env pin when no cache exists', () => {
    const r = getCachedCsprUsdRate();
    assert.equal(r.source, 'env');
    assert.equal(r.rate, process.env.CSPR_USD_RATE);
  });

  it('returns the cached live rate after a successful fetch', async () => {
    mockPrice(0.014);
    await getCsprUsdRate();
    const r = getCachedCsprUsdRate();
    assert.equal(r.source, 'cache');
    assert.equal(r.rate, '0.01400000');
  });

  it('ignores the cache when the feed is disabled', async () => {
    mockPrice(0.014);
    await getCsprUsdRate();
    process.env.CSPR_PRICE_FEED_ENABLED = 'false';
    const r = getCachedCsprUsdRate();
    assert.equal(r.source, 'env');
  });
});

// Restore real fetch on process exit.
process.on('exit', () => {
  global.fetch = realFetch;
});
