#!/usr/bin/env node
// Timing probe: pinpoints WHERE the purchase→card latency lives.
//
// You already have an order_id + deploy_hash from a `cspr402 purchase` run
// (the one that took ~13 min). Feed them in here and this script will:
//   1. Poll the backend verify-payment endpoint every POLL_MS (default 5s).
//   2. In parallel, poll the Casper node RPC (info_get_transaction) to see
//      when the deploy actually appears + finalizes at the node level.
//   3. Print a timeline so you can see the split:
//        - Casper finality delay  (deploy accepted → execution success at RPC)
//        - RPC indexing delay     (executed at RPC → backend verify sees it)
//        - backend verify cost    (per-call ms)
//        - human/manual gap        (anything before you started this probe)
//
// Usage (powershell):
//   $env:CARDS402_API_KEY="cards402_..."
//   $env:CARDS402_BASE_URL="http://localhost:4000/v1"
//   $env:PROBE_ORDER_ID="..."
//   $env:PROBE_DEPLOY_HASH="<64 hex>"
//   node scripts/measure-verify.mjs
//
// Optional: SENDER_PUBLIC_KEY, CASPER_NODE_RPC_URL (enables raw-RPC line),
//           POLL_MS (default 5000), TIMEOUT_MS (default 900000 = 15 min).

const API_KEY = process.env.CARDS402_API_KEY;
const BASE_URL = (process.env.CARDS402_BASE_URL || '').replace(/\/$/, '');
const ORDER_ID = process.env.PROBE_ORDER_ID;
const DEPLOY_HASH = (process.env.PROBE_DEPLOY_HASH || '').toLowerCase();
const SENDER = process.env.SENDER_PUBLIC_KEY || undefined;
const RPC_URL = process.env.CASPER_NODE_RPC_URL || undefined;
const POLL_MS = Number(process.env.POLL_MS || 5000);
const TIMEOUT_MS = Number(process.env.TIMEOUT_MS || 900000);

if (!API_KEY || !BASE_URL || !ORDER_ID || !DEPLOY_HASH) {
  console.error('Need CARDS402_API_KEY, CARDS402_BASE_URL, PROBE_ORDER_ID, PROBE_DEPLOY_HASH.');
  process.exit(2);
}
if (!/^[0-9a-f]{64}$/.test(DEPLOY_HASH)) {
  console.error('PROBE_DEPLOY_HASH must be 64 lowercase hex chars.');
  process.exit(2);
}

const t0 = Date.now();
const elapsed = () => `${((Date.now() - t0) / 1000).toFixed(1)}s`;
let rpcSeen = null; // first time RPC showed the deploy executed
let backendDone = null; // first time backend verify returned 200

async function rawRpc() {
  if (!RPC_URL) return null;
  const t = Date.now();
  try {
    const res = await fetch(RPC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: '1',
        method: 'info_get_transaction',
        params: { transaction_hash: { Version1: DEPLOY_HASH } },
      }),
      signal: AbortSignal.timeout(15000),
    });
    const body = await res.json().catch(() => null);
    if (!body || body.error) {
      const msg = body?.error?.message || body?.error?.code || 'rpc error';
      return {
        ms: Date.now() - t,
        state: /not found|no such/i.test(String(msg)) ? 'not_found' : 'rpc_error',
        msg,
      };
    }
    const v = body.result?.value;
    const exec = v?.execution_info ?? v?.execution_results?.[0];
    if (!v) return { ms: Date.now() - t, state: 'not_found' };
    if (!exec) return { ms: Date.now() - t, state: 'accepted_pending' };
    const result = exec.result || exec.Version2 || exec;
    if (result?.Failure)
      return { ms: Date.now() - t, state: 'failed', msg: result.Failure.error_message };
    if (result?.Success || !('error_message' in (result || {})))
      return { ms: Date.now() - t, state: 'executed', block: exec.block_hash || null };
    return { ms: Date.now() - t, state: 'pending', msg: result?.error_message };
  } catch (err) {
    return { ms: Date.now() - t, state: 'rpc_error', msg: err?.message };
  }
}

async function backendVerify() {
  const t = Date.now();
  try {
    const res = await fetch(`${BASE_URL}/orders/${encodeURIComponent(ORDER_ID)}/verify-payment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Api-Key': API_KEY },
      body: JSON.stringify({
        deploy_hash: DEPLOY_HASH,
        ...(SENDER ? { sender_public_key: SENDER } : {}),
      }),
      signal: AbortSignal.timeout(30000),
    });
    const body = await res.json().catch(() => ({}));
    return { ms: Date.now() - t, status: res.status, body };
  } catch (err) {
    return { ms: Date.now() - t, status: 0, err: err?.message };
  }
}

function summarize() {
  console.log('\n══ TIMELINE SUMMARY ══');
  console.log(`Total probe wall-clock : ${elapsed()}`);
  if (rpcSeen) console.log(`Casper RPC: deploy executed at ${rpcSeen}`);
  if (backendDone) console.log(`Backend verify 200 at  : ${backendDone}`);
  if (rpcSeen && backendDone) {
    const gap = (Number(backendDone) - Number(rpcSeen)) / 1000;
    console.log(`RPC-executed → backend-200 gap: ${gap.toFixed(1)}s (RPC indexing + verify logic)`);
  }
  console.log('\nInterpretation:');
  console.log(
    '• If "accepted_pending" lasts minutes   → deploy stuck in mempool (gas too low). Fix: raise gas.',
  );
  console.log(
    '• If RPC "executed" fast but backend 425 lingers → RPC node slow to index, or backend verify logic slow.',
  );
  console.log(
    '• If everything is fast here but your full run was 13 min → the 13 min was MANUAL handoff (CLI has no 425 retry).',
  );
}

const deadline = Date.now() + TIMEOUT_MS;
let attempt = 0;
console.log(
  `probe start. order=${ORDER_ID} deploy=${DEPLOY_HASH} poll=${POLL_MS}ms timeout=${TIMEOUT_MS}ms rpc=${RPC_URL ? 'on' : 'off'}`,
);

while (Date.now() < deadline) {
  attempt += 1;
  const [bk, rpc] = await Promise.all([backendVerify(), rawRpc()]);
  const bkErr = bk.body?.error || bk.err || '';
  const line = `[${elapsed()}] #${attempt} backend=${bk.status} (${bk.ms}ms) ${bkErr || 'ok'}`;
  const rpcLine = rpc
    ? ` | rpc=${rpc.state} (${rpc.ms}ms)${rpc.block ? ` block=${rpc.block.slice(0, 10)}` : ''}${rpc.msg ? ` ${String(rpc.msg).slice(0, 60)}` : ''}`
    : '';
  console.log(line + rpcLine);

  if (rpc && rpc.state === 'executed' && !rpcSeen) rpcSeen = elapsed();
  if (bk.status === 200) {
    backendDone = elapsed();
    summarize();
    process.exit(0);
  }
  if (rpc && rpc.state === 'failed') {
    console.log('Deploy executed but FAILED on-chain — verify will never succeed. Stop.');
    summarize();
    process.exit(1);
  }
  await new Promise((r) => setTimeout(r, POLL_MS));
}

console.log('Timed out before backend verify returned 200.');
summarize();
process.exit(1);
