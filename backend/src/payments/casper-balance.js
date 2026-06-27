// Casper mainnet wallet balance fetch — used by the funding poller
// (jobs.js::checkAgentFundingStatus) to flip `agent_state` from
// `awaiting_funding` to `funded` once an agent's Casper public key
// receives its first mainnet CSPR deposit.
//
// RPC shape is the struct/object form required by node api_version
// 2.0.0 (the legacy `[{name,value}]` array form is rejected with
// -32602). Verified empirically against
// https://casper-mainnet.gateway.tatum.io/rpc (api 2.0.0, protocol 2.2.2):
//   state_get_account_info  params: { public_key: <hex> }
//     success -> result.account.account_hash  (string, "account-hash-"-prefixed)
//     unfunded -> error.code -32009 "No such account"
//   query_balance  params: { purse_identifier: { main_purse_under_account_hash: <accountHash> } }
//     success -> result.balance  (decimal motes string)
//
// A freshly-generated key has no on-chain account until it receives
// its first CSPR; `state_get_account_info` then returns -32009, which
// we surface as `{ notFound: true, motes: 0n }` (NOT an error — the
// agent simply has not been funded yet). `query_balance` is NOT a
// reliable unfunded signal (an all-zeros purse returns a system
// balance), so unfunded is detected via `state_get_account_info`.

const { MOTES_PER_CSPR } = require('./casper');
const { casperRpcHeaders } = require('./casper-rpc-headers');

const ACCOUNT_NOT_FOUND_CODE = -32009;
const RPC_TIMEOUT_MS = 15000;

class CasperBalanceError extends Error {
  constructor(message, { code } = {}) {
    super(message);
    this.name = 'CasperBalanceError';
    this.code = code;
  }
}

/**
 * Raw Casper JSON-RPC call (struct params). Returns `body.result`.
 * Throws `CasperBalanceError` (with `code`) on RPC error or non-200.
 *
 * @param {string} method
 * @param {Record<string, unknown>} params
 * @param {{ rpcUrl?: string }} [opts]
 * @returns {Promise<any>}
 */
async function casperBalanceRpc(method, params, opts = {}) {
  const url = opts.rpcUrl || process.env.CASPER_NODE_RPC_URL;
  if (!url) {
    throw new CasperBalanceError('CASPER_NODE_RPC_URL is not configured');
  }
  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: casperRpcHeaders(),
      body: JSON.stringify({ jsonrpc: '2.0', id: '1', method, params }),
      signal: AbortSignal.timeout(RPC_TIMEOUT_MS),
    });
  } catch (err) {
    throw new CasperBalanceError(
      `Casper RPC request failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  if (!res.ok) {
    throw new CasperBalanceError(`Casper RPC returned HTTP ${res.status}`);
  }
  const body = await res.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    throw new CasperBalanceError('Casper RPC returned invalid JSON');
  }
  if (body.error) {
    const message = String(body.error.data || body.error.message || 'Casper RPC error');
    throw new CasperBalanceError(message, { code: body.error.code });
  }
  return body.result;
}

/**
 * Fetch the CSPR balance (in motes) for a Casper public key.
 *
 * @param {string} publicKey Casper public key hex (`01…`/`02…`)
 * @param {{ rpcUrl?: string }} [opts]
 * @returns {Promise<{ motes: bigint, funded: boolean, notFound: boolean }>}
 *   `notFound: true` means the key has no on-chain account yet (never
 *   funded); `motes` is 0n in that case. `funded` is `motes > 0n`.
 */
async function fetchCasperBalance(publicKey, opts = {}) {
  let accountInfo;
  try {
    accountInfo = await casperBalanceRpc('state_get_account_info', { public_key: publicKey }, opts);
  } catch (err) {
    if (err instanceof CasperBalanceError && err.code === ACCOUNT_NOT_FOUND_CODE) {
      return { motes: 0n, funded: false, notFound: true };
    }
    throw err;
  }
  const account = accountInfo?.account;
  const accountHash =
    account && typeof account.account_hash === 'string' ? account.account_hash : undefined;
  if (!accountHash) {
    // Account present in response without a main purse hash — treat
    // as not-yet-funded rather than mis-flipping to funded.
    return { motes: 0n, funded: false, notFound: true };
  }

  const balanceResult = await casperBalanceRpc(
    'query_balance',
    { purse_identifier: { main_purse_under_account_hash: accountHash } },
    opts,
  );
  const balanceStr = balanceResult?.balance;
  if (typeof balanceStr !== 'string' || !/^\d+$/.test(balanceStr)) {
    throw new CasperBalanceError('Casper RPC did not return a parseable balance');
  }
  const motes = BigInt(balanceStr);
  return { motes, funded: motes > 0n, notFound: false };
}

/**
 * Format motes as a CSPR decimal string (9 fractional digits).
 * @param {bigint} motes
 * @returns {string}
 */
function formatCSPR(motes) {
  const whole = motes / MOTES_PER_CSPR;
  const frac = String(motes % MOTES_PER_CSPR).padStart(9, '0');
  return `${whole}.${frac}`;
}

module.exports = {
  fetchCasperBalance,
  formatCSPR,
  casperBalanceRpc,
  CasperBalanceError,
  MOTES_PER_CSPR,
  ACCOUNT_NOT_FOUND_CODE,
};
