// Same-origin Casper JSON-RPC relay — the fix for "CORS error when sending
// the transaction to the node".
//
// WHY THIS EXISTS
//
// CSPR.click submits a signed transaction from the BROWSER: its core client
// calls `sendSignedTransaction(rpcEndpoint, digest, tx)` where `rpcEndpoint`
// is whatever `clickSDKOptions.casperNode` was initialised with (see
// @make-software/csprclick-core-client → casper-client/index.d.ts). That is a
// cross-origin `fetch` from https://cspr402.xyz to a Casper node.
//
// No public Casper JSON-RPC endpoint answers the CORS preflight for an
// arbitrary web origin:
//   - casper-mainnet.gateway.tatum.io/rpc → no Access-Control-Allow-Origin
//   - node.cspr.cloud                     → needs an Authorization header the
//                                           browser must never hold anyway
//   - http://<ip>:7777/rpc                → no CORS *and* mixed content on an
//                                           HTTPS page
// So the browser blocks the POST before it leaves the tab and the demo dies
// at exactly the "send transaction" step, which is what the judge reported.
//
// The relay removes the whole class of failure: the browser only ever talks to
// OUR origin, and the node call happens server-side where CORS does not exist
// and the optional RPC access token stays secret. `casperNode` is pointed at
// CASPER_RPC_RELAY_PATH, and the portal's own submit fallback posts here too.
//
// It is deliberately a NARROW relay, not an open JSON-RPC proxy:
//   - method allowlist (read methods + submit-a-signed-transaction only;
//     no speculative_exec, no batch requests)
//   - request body size cap
//   - per-IP rate limit
//   - CORS headers so it also works when the caller is the CSPR.click iframe
//     (origin accounts.cspr.click) rather than our own page
//
// Relaying a SIGNED transaction is safe for the same reason the SDK's
// multi-node failover is (sdk/src/casper-signer.ts:111-128): the signature
// binds recipient / amount / transfer_id / chain_name, so the relay cannot
// redirect funds, and the backend re-verifies the deploy hash on chain before
// any card is issued.

/** Path the browser posts JSON-RPC to. Same origin ⇒ no preflight failure. */
export const CASPER_RPC_RELAY_PATH = '/api/casper-rpc';

/**
 * JSON-RPC methods the relay will forward. Submit + the read methods
 * casper-js-sdk / CSPR.click need to build and follow a native transfer.
 * `speculative_exec` is excluded on purpose (expensive, and no client of ours
 * needs it), as is anything that mutates node state.
 */
export const ALLOWED_RPC_METHODS: readonly string[] = [
  // submit
  'account_put_transaction',
  'account_put_deploy',
  // follow-up / status
  'info_get_status',
  'info_get_deploy',
  'info_get_transaction',
  'info_get_chainspec',
  'chain_get_block',
  'chain_get_block_transfers',
  'chain_get_state_root_hash',
  // balances (the portal shows the agent's live CSPR balance)
  'query_balance',
  'query_balance_details',
  'state_get_balance',
  'state_get_account_info',
  'state_get_entity',
  'query_global_state',
];

/**
 * Built-in public Casper mainnet 2.x nodes, mirroring the failover pool in
 * sdk/src/casper-signer.ts (DEFAULT_CASPER_NODE_IPS). Kept as a separate copy
 * because the web app can't import from the SDK package source; refresh both
 * together when the public IPs churn, or override at runtime with
 * CASPER_NODE_RPC_FALLBACK_IPS — no redeploy of this file needed.
 *
 * These are appended AFTER the operator's own CASPER_NODE_RPC_URL, and they
 * matter for more than redundancy: the gateway the repo's .env examples
 * suggest (casper-mainnet.gateway.tatum.io) answers reads but does NOT
 * implement `account_put_transaction`, so a Condor-format native transfer can
 * only be submitted through a real 2.x node.
 */
export const DEFAULT_CASPER_NODE_IPS: readonly string[] = [
  '51.79.77.160',
  '5.39.72.32',
  '51.255.80.161',
  '168.119.211.235',
  '135.181.72.181',
  '65.108.47.253',
  '103.219.170.17',
  '5.9.80.109',
  '135.181.166.115',
  '51.222.43.40',
  '185.227.70.209',
  '192.99.14.207',
  '142.44.136.182',
  '51.79.99.33',
  '152.89.62.54',
  '152.53.144.92',
];

/** Last-resort read endpoint. Rate limited (~5 req/min) and submit-incapable. */
export const DEFAULT_RELAY_NODE_URL = 'https://casper-mainnet.gateway.tatum.io/rpc';

/** Signed native transfers are ~1KB; the cap only exists to bound abuse. */
export const MAX_RPC_BODY_BYTES = 512 * 1024;

/** Per-node attempt budget. Failover moves on rather than hanging the tab. */
export const RELAY_NODE_TIMEOUT_MS = 8_000;

/**
 * Ceiling on endpoints tried per request. The default pool is deliberately
 * long for redundancy, but a browser waiting on a payment can't sit through
 * 16 sequential timeouts.
 */
export const MAX_RELAY_ATTEMPTS = 6;

/** JSON-RPC "method not found" — the node can't serve this call at all. */
const JSON_RPC_METHOD_NOT_FOUND = -32601;

/**
 * The env slice the relay reads. Kept as a plain record (not an interface with
 * named keys) so `process.env` — whose Next-augmented type has no index
 * signature overlap — is assignable, and so tests can pass a literal.
 */
export type RelayEnv = Record<string, string | undefined>;

/**
 * Normalise one node-pool entry. A bare IP becomes `http://IP:7777/rpc` (the
 * Casper RPC convention, same shape as sdk/src/casper-signer.ts's default
 * pool); anything with a scheme is used verbatim. Plain HTTP is fine here —
 * this call is made by the server, never by the browser.
 */
export function normalizeNodeEntry(entry: string): string | null {
  const trimmed = entry.trim();
  if (!trimmed) return null;
  if (!trimmed.includes('://')) return `http://${trimmed}:7777/rpc`;
  try {
    const url = new URL(trimmed);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return trimmed;
  } catch {
    return null;
  }
}

/**
 * The node pool the relay forwards to, most-preferred first:
 *   1. CASPER_NODE_RPC_URL           (comma-separated operator endpoints)
 *   2. CASPER_NODE_RPC_FALLBACK_IPS  (comma-separated override of the pool)
 *   3. the built-in public 2.x pool  (unless CASPER_RPC_RELAY_DEFAULTS=0)
 *   4. the public read gateway       (so a bare deployment still answers)
 * De-duplicated, order preserved. Never empty.
 */
export function resolveRelayNodeUrls(env: RelayEnv): string[] {
  const operator = env.CASPER_NODE_RPC_URL ?? '';
  const override = env.CASPER_NODE_RPC_FALLBACK_IPS ?? '';
  const defaultsEnabled = (env.CASPER_RPC_RELAY_DEFAULTS ?? '1') !== '0';
  const pool = override.trim()
    ? override
    : defaultsEnabled
      ? DEFAULT_CASPER_NODE_IPS.join(',')
      : '';

  const urls = [operator, pool, DEFAULT_RELAY_NODE_URL]
    .filter((value) => value.trim())
    .join(',')
    .split(',')
    .map(normalizeNodeEntry)
    .filter((value): value is string => value !== null);

  const seen = new Set<string>();
  const deduped = urls.filter((url) => {
    if (seen.has(url)) return false;
    seen.add(url);
    return true;
  });
  return deduped.length > 0 ? deduped : [DEFAULT_RELAY_NODE_URL];
}

/**
 * Should the relay try the next node instead of returning this body?
 *
 * A JSON-RPC error is normally the node's real answer ("invalid transaction",
 * "duplicate") and must reach the portal verbatim. The one exception is
 * "method not found": some gateways (Tatum's, for one) serve reads but have no
 * `account_put_transaction`, and answering a payment with -32601 would strand
 * the demo. Nothing was executed, so moving on is safe — it cannot double-pay.
 */
export function shouldFailOver(responseText: string): boolean {
  try {
    const parsed = JSON.parse(responseText) as { error?: { code?: unknown } };
    return parsed?.error?.code === JSON_RPC_METHOD_NOT_FOUND;
  } catch {
    // Unparseable body from a "healthy" HTTP 200 — not a usable answer.
    return true;
  }
}

export type RpcValidation =
  { ok: true; method: string } | { ok: false; code: string; message: string };

/**
 * Validate the JSON-RPC envelope before anything leaves our server. Rejects
 * batches (an array body) so one request can never fan out into N node calls,
 * and rejects any method outside ALLOWED_RPC_METHODS.
 */
export function validateRpcRequest(body: unknown): RpcValidation {
  if (Array.isArray(body)) {
    return {
      ok: false,
      code: 'batch_not_supported',
      message: 'Batch JSON-RPC requests are not relayed. Send one request at a time.',
    };
  }
  if (!body || typeof body !== 'object') {
    return { ok: false, code: 'invalid_body', message: 'Expected a JSON-RPC request object.' };
  }
  const method = (body as { method?: unknown }).method;
  if (typeof method !== 'string' || !method) {
    return { ok: false, code: 'invalid_method', message: 'JSON-RPC "method" must be a string.' };
  }
  if (!ALLOWED_RPC_METHODS.includes(method)) {
    return {
      ok: false,
      code: 'method_not_allowed',
      message: `JSON-RPC method "${method}" is not relayed by CSPR402.`,
    };
  }
  return { ok: true, method };
}

/**
 * Which Origin the relay echoes back. Default `*` — the relay is
 * unauthenticated and method-limited, and the caller may legitimately be the
 * CSPR.click iframe (accounts.cspr.click) rather than our own page, so pinning
 * to our own origin would re-break the exact flow this relay exists to fix.
 * Set CASPER_RPC_RELAY_ORIGINS to a comma-separated allowlist to narrow it.
 */
export function resolveAllowedOrigin(env: RelayEnv, requestOrigin: string | null): string | null {
  const configured = env.CASPER_RPC_RELAY_ORIGINS?.trim();
  if (!configured || configured === '*') return '*';
  const allowed = configured
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  if (!requestOrigin) return null;
  return allowed.includes(requestOrigin) ? requestOrigin : null;
}

export interface RateLimiter {
  /** @returns true when the call is allowed, false when the bucket is empty. */
  take(key: string, now?: number): boolean;
}

/**
 * Fixed-window per-key limiter. In-memory and per-instance — enough to stop a
 * casual scraper from turning the relay into free RPC, not a distributed
 * quota. Buckets older than the window are swept on write so the map can't
 * grow unbounded.
 */
export function createRateLimiter(limit: number, windowMs: number): RateLimiter {
  const buckets = new Map<string, { count: number; resetAt: number }>();
  return {
    take(key: string, now: number = Date.now()): boolean {
      const bucket = buckets.get(key);
      if (!bucket || bucket.resetAt <= now) {
        for (const [existingKey, existing] of buckets) {
          if (existing.resetAt <= now) buckets.delete(existingKey);
        }
        buckets.set(key, { count: 1, resetAt: now + windowMs });
        return true;
      }
      if (bucket.count >= limit) return false;
      bucket.count += 1;
      return true;
    },
  };
}

/**
 * Client key for the rate limiter. Railway/Vercel put the real client IP first
 * in X-Forwarded-For; we take only that first hop because every later entry is
 * attacker-controlled.
 */
export function clientKeyFromHeaders(headers: Headers): string {
  const forwarded = headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }
  return headers.get('x-real-ip')?.trim() || 'unknown';
}
