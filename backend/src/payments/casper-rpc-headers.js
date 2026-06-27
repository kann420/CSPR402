// @ts-check
// Shared HTTP headers for Casper node JSON-RPC calls.
//
// The backend makes raw `fetch` POSTs to `CASPER_NODE_RPC_URL` from two sites
// (casper-verify.js, casper-balance.js) plus one casper-js-sdk HttpHandler
// site (casper-verify.js::getRpcClient). All three must agree on the headers,
// so the optional Authorization header for an authenticated RPC provider
// (e.g. CSPR.cloud `node.cspr.cloud`, which requires an access token) is
// centralised here.
//
// CSPR.cloud expects the raw access token as the `Authorization` header value
// (NO `Bearer ` prefix), e.g. `Authorization: 55f79117-fc4d-4d60-9956-...`.
// Set `CASPER_NODE_RPC_AUTH` to that exact value. Free no-auth endpoints
// (Tatum `casper-mainnet.gateway.tatum.io`, the public testnet node) simply
// leave it unset.

/**
 * Headers for a raw-fetch Casper JSON-RPC POST.
 * @returns {Record<string, string>}
 */
function casperRpcHeaders() {
  const headers = { 'Content-Type': 'application/json' };
  const auth = process.env.CASPER_NODE_RPC_AUTH;
  if (auth) headers.Authorization = auth;
  return headers;
}

/**
 * The Authorization header value (or `undefined` when unset), for the
 * casper-js-sdk HttpHandler's `setCustomHeaders`.
 * @returns {string | undefined}
 */
function casperRpcAuth() {
  const auth = process.env.CASPER_NODE_RPC_AUTH;
  return auth || undefined;
}

module.exports = { casperRpcHeaders, casperRpcAuth };
