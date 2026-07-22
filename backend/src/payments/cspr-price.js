// @ts-check
// CSPR/USD price from the CoinGecko simple-price API, with a fail-safe
// fallback chain: live price → stale cache → CSPR_USD_RATE env pin.
//
// Order creation must never fail because a third-party price API is
// down: getCsprUsdRate() never throws in casper mode (env.js requires
// CSPR_USD_RATE, so the final fallback is always available). Verification
// is immune to price drift by construction — usdToMotes runs once at
// order creation and the resulting amount_motes is what verify-payment
// compares against.
//
// Hardening carried over from the retired xlm-price.js (adversarial
// audit 2026-04-15):
//
//   F1  Short-TTL in-memory cache. Without it every POST /v1/orders
//       does a synchronous HTTP round trip to CoinGecko, whose free
//       tier allows ~10-30 req/min — an /v1/orders burst would turn
//       into price-API 429s. 60s is well below CSPR volatility at the
//       per-order level.
//
//   F2  Sanity bounds on the returned price. CSPR/USD has lived in
//       ~[$0.003, $1.33] since mainnet launch; anything outside
//       [0.0005, 5] is obvious garbage from a parser bug or a
//       compromised upstream. Reject rather than letting "CSPR at
//       $99999" price an order at near-zero motes.
//
//   F5  In-flight promise memoization to prevent a fetch stampede when
//       the cache expires under concurrent order creation.

// Called via the module object (not destructured) so tests can patch
// logger.event and observe the fallback/recovered signals.
const logger = require('../lib/logger');

const COINGECKO_URL =
  'https://api.coingecko.com/api/v3/simple/price?ids=casper-network&vs_currencies=usd';

// CSPR/USD sanity bounds (see F2 above).
const MIN_SANE_PRICE = 0.0005;
const MAX_SANE_PRICE = 5.0;

// Fresh-cache TTL: at most ~1 fetch per minute regardless of order rate.
const CACHE_TTL_MS = 60_000;

// How long an expired cache entry is still preferable to the env pin
// when the upstream is failing. A 15-minute-old market price tracks the
// market better than a hand-set env constant.
const STALE_MAX_AGE_MS = 15 * 60_000;

// Per-fetch timeout. Keeps a CoinGecko brownout from stalling order
// creation for more than one bounded round trip (cache misses only).
const FETCH_TIMEOUT_MS = 4_000;

let _cache = /** @type {{ rate: string, fetchedAt: number } | null} */ (null);
let _inFlight = /** @type {Promise<string> | null} */ (null);

// Tracks whether the last resolution used a fallback, so the first
// successful fetch afterwards emits a single `cspr_price.recovered`.
let _fallbackActive = false;

function feedEnabled() {
  return (process.env.CSPR_PRICE_FEED_ENABLED || 'true') === 'true';
}

function envRate() {
  return process.env.CSPR_USD_RATE || null;
}

/**
 * Convert the CoinGecko float to the decimal string usdToMotes expects.
 * 8 decimal places is far below mote resolution at any sane price.
 * @param {number} price
 */
function toRateString(price) {
  return price.toFixed(8);
}

async function fetchCoinGecko() {
  const res = await fetch(COINGECKO_URL, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: { accept: 'application/json' },
  });
  if (!res.ok) {
    throw new Error(`CoinGecko HTTP ${res.status}`);
  }
  const data = /** @type {any} */ (await res.json());
  const price = data?.['casper-network']?.usd;
  if (typeof price !== 'number' || !Number.isFinite(price)) {
    throw new Error('CoinGecko response missing casper-network.usd number');
  }
  if (price < MIN_SANE_PRICE || price > MAX_SANE_PRICE) {
    throw new Error(
      `CoinGecko CSPR/USD ${price} outside sanity bounds [${MIN_SANE_PRICE}, ${MAX_SANE_PRICE}]`,
    );
  }
  return price;
}

/**
 * Resolve the CSPR/USD rate for order pricing. Async — call BEFORE any
 * db.transaction; the transaction body must stay synchronous.
 *
 * Never throws when CSPR_USD_RATE is configured (casper mode requires
 * it): failures degrade through stale cache to the env pin instead.
 *
 * @returns {Promise<{ rate: string | null, source: 'coingecko' | 'stale_cache' | 'env' }>}
 */
async function getCsprUsdRate() {
  if (!feedEnabled()) {
    return { rate: envRate(), source: 'env' };
  }
  if (_cache && Date.now() - _cache.fetchedAt < CACHE_TTL_MS) {
    return { rate: _cache.rate, source: 'coingecko' };
  }
  if (!_inFlight) {
    _inFlight = (async () => {
      const price = await fetchCoinGecko();
      _cache = { rate: toRateString(price), fetchedAt: Date.now() };
      return _cache.rate;
    })().finally(() => {
      _inFlight = null;
    });
  }
  try {
    const rate = await _inFlight;
    if (_fallbackActive) {
      _fallbackActive = false;
      logger.event('cspr_price.recovered', { rate });
    }
    return { rate, source: 'coingecko' };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    _fallbackActive = true;
    if (_cache && Date.now() - _cache.fetchedAt < STALE_MAX_AGE_MS) {
      logger.event('cspr_price.fallback', { source: 'stale_cache', error });
      return { rate: _cache.rate, source: 'stale_cache' };
    }
    logger.event('cspr_price.fallback', { source: 'env', error });
    return { rate: envRate(), source: 'env' };
  }
}

/**
 * Synchronous accessor for display surfaces (dashboard info) that must
 * not block on a fetch: returns the cached live rate when one exists
 * within the stale window, else the env pin. Never fetches.
 *
 * @returns {{ rate: string | null, source: 'cache' | 'env' }}
 */
function getCachedCsprUsdRate() {
  if (feedEnabled() && _cache && Date.now() - _cache.fetchedAt < STALE_MAX_AGE_MS) {
    return { rate: _cache.rate, source: 'cache' };
  }
  return { rate: envRate(), source: 'env' };
}

/** Test-only: reset module state so each case starts fresh. */
function _resetCache() {
  _cache = null;
  _inFlight = null;
  _fallbackActive = false;
}

module.exports = {
  getCsprUsdRate,
  getCachedCsprUsdRate,
  _resetCache,
  _COINGECKO_URL: COINGECKO_URL,
  _MIN_SANE_PRICE: MIN_SANE_PRICE,
  _MAX_SANE_PRICE: MAX_SANE_PRICE,
};
