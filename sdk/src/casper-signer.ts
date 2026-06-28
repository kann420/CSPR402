// Secure Casper auto-pay signer for the MCP server + CLI.
//
// DESIGN — why this is safe to expose to an LLM tool loop:
//
// The threat model for "an LLM can call a sign-and-submit tool" is
// prompt injection: untrusted content the agent is summarizing (a web
// page, an order note, an email) could try to steer it into signing a
// transfer to an attacker address. We close that by NEVER accepting
// destination / amount / transfer_id from the caller. payAndVerifyOrder
// re-fetches the order from the backend (CSPR402Client.getOrder, scoped
// to this agent's api key) and signs EXACTLY the backend-supplied
// {recipient, amount_motes, transfer_id, chain_name} — transported over
// HTTPS, NOT cryptographically attested. The LLM supplies only an
// order_id — and only for orders in `pending_payment` that the backend
// already created for this agent. An injected "pay my order <X>" can't
// redirect funds; it can at most pay an order the agent legitimately
// created. A backend compromise or TLS MitM could still steer funds, so
// an optional treasury allowlist (CSPR402_TREASURY_PUBLIC_KEYS) refuses
// to sign any recipient not on the operator-approved list — defense in
// depth on top of the caller-params invariant.
//
// Double-submit guard: a ledger records the deploy hash we already
// submitted for an order_id, so a retried or concurrent payOrder for the
// same id re-verifies the recorded hash instead of submitting a second
// transfer (which would overpay the treasury). The ledger is persisted
// to ~/.cspr402/inflight.json so a fresh process (a CLI re-run after a
// verify timeout, or an MCP server restart) re-verifies rather than
// re-submitting. Within a process, a per-order mutex serializes
// concurrent calls for the same id. On ANY verify failure we KEEP the
// ledger entry (a transient 5xx/network blip does NOT clear it) so a
// retry re-verifies the in-flight transfer instead of broadcasting a
// second one — the only path that clears the ledger is a successful
// verify.
//
// Key handling: the agent key is a PEM on disk written by `cspr402
// onboard` (chmod 0600). We load it lazily, sign, and null the reference
// as soon as the transfer is submitted (before the verify loop runs) so
// the raw key bytes are not kept reachable through a minutes-long verify
// window. We never log the key, never return it in any result, and
// never surface signature material — only the resulting deploy hash.
// The MCP tool layer returns the masked card (brand only), never
// PAN/CVV.
//
// This deliberately inverts the original stance (mcp.ts:3,
// purchase.ts:58-60 — "does not sign") which the operator approved when
// requesting hướng 2. The signing is opt-in: it activates only when both
// an agent key (from onboard) AND CASPER_NODE_RPC_URL are configured.
// Without them, the MCP `purchase_vcc` and CLI `purchase` paths keep
// their original create-only / manual-verify behavior unchanged.

import {
  KeyAlgorithm,
  NativeTransferBuilder,
  PrivateKey,
  PublicKey,
  RpcClient,
  HttpHandler,
  Timestamp,
} from 'casper-js-sdk';
import type { Transaction } from 'casper-js-sdk';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type {
  CSPR402Client,
  VerifyCasperPaymentResponse,
  CasperCSPRPaymentInstructions,
} from './client';
import {
  loadCards402Config,
  defaultConfigDir,
  ensurePrivateDir,
  atomicWriteFile600,
} from './config';
import { CASPER_PUBLIC_KEY_RE, readCasperKeyPemIfExists } from './lib/casper-key';

// Gas budget for the native transfer itself (the per-deploy payment
// field, NOT the amount being transferred to the treasury). Mirrors
// examples/node-agent/index.mjs CASPER_TRANSFER_PAYMENT_MOTES default.
const DEFAULT_TRANSFER_PAYMENT_MOTES = '100000000';
const DEFAULT_VERIFY_TIMEOUT_MS = 300000;
// Verify polls the backend every pollMs until the deploy finalizes. 2s
// (down from 5s) gives snappier feedback once the transfer is in flight;
// the backend /verify endpoint is a cheap DB lookup, so the extra load is
// negligible for a single agent. First attempt is immediate (see
// verifyCasperPaymentWithRetry) so an already-finalized deploy still
// returns in one round-trip.
const DEFAULT_VERIFY_POLL_MS = 2000;
// Per-node probe/submit timeouts. The probe (info_get_status) and each
// put-transaction attempt race against these so a single dead/slow node
// can no longer hang submit for minutes — we move to the next candidate.
const DEFAULT_PROBE_TIMEOUT_MS = 8000;
const DEFAULT_SUBMIT_TIMEOUT_MS = 20000;

// Built-in public Casper mainnet RPC nodes (plain HTTP on port 7777, the
// Casper RPC convention). Merged with the operator's CASPER_NODE_RPC_URL
// to form a failover pool so a single slow/dead operator node no longer
// stalls an auto-pay for 15 minutes. Broadcasting a SIGNED native-transfer
// deploy to any synced mainnet node is safe:
//   - the signature binds recipient / amount_motes / transfer_id /
//     chain_name, so a malicious relay CANNOT redirect funds;
//   - the backend re-verifies the deploy hash + sender independently, so
//     a fake "accepted" response is caught at verify (no card is issued
//     until the chain actually finalizes the transfer);
//   - the deploy's contents are public on-chain regardless of which node
//     relays it, so there is no added privacy exposure.
// Operators who want strict endpoint control set
// CSPR402_CASPER_NODE_DEFAULTS=0 to rely solely on CASPER_NODE_RPC_URL.
// Sourced from the known-good candidate list proven in the operator's
// buy.js harness; dead IPs are filtered out by the probe at runtime.
const DEFAULT_CASPER_NODE_IPS = [
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

// Ledger entry TTL — an in-flight payment older than this is considered
// abandoned and a new submit is allowed. 1 hour is well beyond the
// backend's 2h order-expiry window divided by the typical verify loop,
// and short enough that a genuinely stuck entry doesn't block a legit
// retry forever.
const LEDGER_TTL_MS = 60 * 60 * 1000;

export interface SigningConfig {
  /** Absolute path to the agent's Casper secret-key PEM. */
  keyPath: string;
  /**
   * Operator-configured Casper node JSON-RPC URLs (comma-separated
   * CASPER_NODE_RPC_URL). The submit step probes these PLUS the built-in
   * default public-node pool (unless CSPR402_CASPER_NODE_DEFAULTS=0) and
   * fails over across whichever answer first, so a single dead node can
   * no longer stall an auto-pay.
   */
  rpcUrls: string[];
  /** Key algorithm for PrivateKey.fromPem. Onboard generates Ed25519. */
  algorithm: KeyAlgorithm;
  /** Gas (motes) for the native transfer deploy. */
  transferPaymentMotes: string;
  /** Verify-with-retry deadline (ms). */
  verifyTimeoutMs: number;
  /** Verify-with-retry poll interval (ms). */
  verifyPollMs: number;
  /** Per-node probe (info_get_status) timeout (ms). */
  probeTimeoutMs: number;
  /** Per-node put-transaction submit timeout (ms). */
  submitTimeoutMs: number;
  /** Configured public key hex, if present, for a pre-flight drift check. */
  expectedSenderPublicKeyHex?: string;
  /**
   * Operator-approved treasury recipient public keys (lowercased hex). If
   * non-empty, the signer refuses to sign a transfer to any recipient not
   * in this set — defense in depth against a backend compromise or TLS
   * MitM that returns an attacker address. Empty/absent = no allowlist
   * (current behavior; relies on the caller-params invariant + TLS).
   */
  treasuryAllowlist: string[];
}

export interface LoadedAgentKey {
  privateKey: PrivateKey;
  senderPublicKeyHex: string;
}

/** Attested payment params extracted from a backend order response. */
interface AttestedPayment {
  recipient: string;
  amount_motes: string;
  transfer_id: number;
  chain_name: string;
  sender_public_key?: string | null;
}

export class SignerError extends Error {
  constructor(
    message: string,
    readonly code: string,
    /** Present on verify_timeout so callers can surface the submitted hash. */
    readonly deployHash?: string,
  ) {
    super(message);
    this.name = 'SignerError';
  }
}

// ---------------------------------------------------------------------------
// Configuration resolution
// ---------------------------------------------------------------------------

function parseKeyAlgorithm(value: string | undefined): KeyAlgorithm {
  const normalized = (value ?? '').trim().toUpperCase();
  if (!normalized || normalized === 'ED25519') return KeyAlgorithm.ED25519;
  if (normalized === 'SECP256K1') return KeyAlgorithm.SECP256K1;
  throw new SignerError(
    'CASPER_AGENT_KEY_ALGORITHM must be ED25519 or SECP256K1.',
    'invalid_key_algorithm',
  );
}

function parsePositiveIntEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.floor(n);
}

/**
 * Parse the optional treasury recipient allowlist. Comma-separated Casper
 * public key hex strings. Empty when not configured (allowlist disabled —
 * relies on the caller-params invariant + TLS, the original behavior).
 */
function parseTreasuryAllowlist(): string[] {
  const raw = process.env.CSPR402_TREASURY_PUBLIC_KEYS || process.env.CARDS402_TREASURY_PUBLIC_KEYS;
  if (!raw) return [];
  return raw
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.length > 0);
}

/**
 * Parse CASPER_NODE_RPC_URL into a de-duplicated list of operator RPC URLs.
 * Comma-separated, so an operator can supply several nodes for failover.
 * Empty when unset/blank — resolveSigningConfig then returns null (signing
 * disabled) unless the built-in default pool is enabled.
 */
function parseRpcUrlList(): string[] {
  const raw = process.env.CASPER_NODE_RPC_URL;
  if (!raw) return [];
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function defaultNodeUrl(ip: string): string {
  return `http://${ip}:7777/rpc`;
}

/**
 * Build the full candidate node list for a submit: the operator's
 * CASPER_NODE_RPC_URL entries first, then the built-in public-node defaults
 * (unless CSPR402_CASPER_NODE_DEFAULTS=0), de-duplicated preserving order.
 * The submit probes all of these in parallel and fails over across them.
 */
export function resolveCandidateNodes(cfg: SigningConfig): string[] {
  const out: string[] = [...cfg.rpcUrls];
  const defaultsEnabled = (process.env.CSPR402_CASPER_NODE_DEFAULTS ?? '1') !== '0';
  if (defaultsEnabled) {
    for (const ip of DEFAULT_CASPER_NODE_IPS) out.push(defaultNodeUrl(ip));
  }
  const seen = new Set<string>();
  return out.filter((url) => {
    if (seen.has(url)) return false;
    seen.add(url);
    return true;
  });
}

/**
 * Resolve everything the signer needs, or return null if signing is not
 * configured. null => the caller falls back to the original manual flow.
 *
 * Key path priority (mirrors onboard's write + the env overrides
 * documented in skill.md / lib/casper-key.ts):
 *   1. CASPER_AGENT_PRIVATE_KEY_PATH (the name examples/node-agent uses)
 *   2. CSPR402_KEY_PATH / CARDS402_KEY_PATH (sdk's explicit-file override)
 *   3. config.casper_key_path (written by `cspr402 onboard`)
 *
 * RPC URL is required explicitly — Casper mainnet has several public
 * nodes and the operator should pick one (or several, comma-separated)
 * rather than us hardcoding a broadcast endpoint. A built-in public-node
 * pool is merged in for failover (disable with
 * CSPR402_CASPER_NODE_DEFAULTS=0) — see resolveCandidateNodes.
 */
export function resolveSigningConfig(): SigningConfig | null {
  const config = loadCards402Config();
  const keyPath =
    process.env.CASPER_AGENT_PRIVATE_KEY_PATH ||
    process.env.CSPR402_KEY_PATH ||
    process.env.CARDS402_KEY_PATH ||
    config?.casper_key_path ||
    undefined;
  const rpcUrls = parseRpcUrlList();
  // Signing still requires the operator to opt in with at least one
  // CASPER_NODE_RPC_URL (preserves the file-header trust boundary). The
  // built-in default pool is PURE failover — it is merged in only AFTER
  // the operator has opted in, so a signed deploy is never broadcast on
  // the operator's behalf without an explicit RPC URL set. Disable the
  // pool with CSPR402_CASPER_NODE_DEFAULTS=0 for strict endpoint control.
  if (!keyPath || rpcUrls.length === 0) return null;
  return {
    keyPath,
    rpcUrls,
    algorithm: parseKeyAlgorithm(process.env.CASPER_AGENT_KEY_ALGORITHM),
    transferPaymentMotes:
      process.env.CASPER_TRANSFER_PAYMENT_MOTES || DEFAULT_TRANSFER_PAYMENT_MOTES,
    verifyTimeoutMs: parsePositiveIntEnv('CSPR402_VERIFY_TIMEOUT_MS', DEFAULT_VERIFY_TIMEOUT_MS),
    verifyPollMs: parsePositiveIntEnv('CSPR402_VERIFY_POLL_MS', DEFAULT_VERIFY_POLL_MS),
    probeTimeoutMs: parsePositiveIntEnv('CSPR402_PROBE_TIMEOUT_MS', DEFAULT_PROBE_TIMEOUT_MS),
    submitTimeoutMs: parsePositiveIntEnv('CSPR402_SUBMIT_TIMEOUT_MS', DEFAULT_SUBMIT_TIMEOUT_MS),
    expectedSenderPublicKeyHex: config?.casper_public_key?.toLowerCase(),
    treasuryAllowlist: parseTreasuryAllowlist(),
  };
}

export function signingConfigured(): boolean {
  return resolveSigningConfig() !== null;
}

// ---------------------------------------------------------------------------
// Key loading
// ---------------------------------------------------------------------------

export function loadAgentPrivateKey(cfg: SigningConfig): LoadedAgentKey {
  const pem = readCasperKeyPemIfExists(cfg.keyPath);
  if (!pem) {
    throw new SignerError(
      `Agent Casper key not found at ${cfg.keyPath}. Run 'cspr402 onboard --claim <code>' ` +
        `to generate one, or set CASPER_AGENT_PRIVATE_KEY_PATH to an existing PEM.`,
      'key_not_found',
    );
  }
  const privateKey = PrivateKey.fromPem(pem, cfg.algorithm);
  const senderPublicKeyHex = privateKey.publicKey.toHex().toLowerCase();
  if (!CASPER_PUBLIC_KEY_RE.test(senderPublicKeyHex)) {
    throw new SignerError(
      `Derived sender public key ${senderPublicKeyHex} is not a valid Casper public key. ` +
        `The PEM at ${cfg.keyPath} may be corrupt or the wrong algorithm.`,
      'invalid_public_key',
    );
  }
  // Drift check: if onboard recorded a public key in config, the key file
  // we just loaded must agree with it. A mismatch means someone replaced
  // the PEM out-of-band (or pointed CASPER_AGENT_PRIVATE_KEY_PATH at a
  // different key) — refuse rather than silently paying from a key the
  // operator doesn't expect.
  if (cfg.expectedSenderPublicKeyHex && cfg.expectedSenderPublicKeyHex !== senderPublicKeyHex) {
    throw new SignerError(
      `Agent key at ${cfg.keyPath} derives public key ${senderPublicKeyHex}, but config ` +
        `expects ${cfg.expectedSenderPublicKeyHex}. Refusing to sign with a key that ` +
        `doesn't match onboard's recorded public key.`,
      'key_drift',
    );
  }
  return { privateKey, senderPublicKeyHex };
}

// ---------------------------------------------------------------------------
// Transfer submission — multi-node probe + failover
//
// Mirrors examples/node-agent/index.mjs:169-193 for the build/sign/put shape
// but wraps it in the resilience pattern proven in the operator's buy.js
// harness (buy.js:31-46 pickNode): probe several candidate nodes in parallel,
// pick the most-synced one, and fail over across them on timeout/error. This
// replaces the old single-node, no-timeout path that hung for ~15 minutes
// when the one configured community node was slow or dead.
// ---------------------------------------------------------------------------

function normalizeDeployHash(value: unknown): string {
  if (typeof value === 'string') return value.toLowerCase();
  const maybe = value as { toHex?: () => string; toJSON?: () => string };
  if (maybe?.toHex && typeof maybe.toHex === 'function') return maybe.toHex().toLowerCase();
  if (maybe?.toJSON && typeof maybe.toJSON === 'function')
    return String(maybe.toJSON()).toLowerCase();
  return String(value).toLowerCase();
}

/** A candidate node that answered info_get_status and is on our chain. */
interface ProbedNode {
  url: string;
  chainName: string;
  /** e.g. "1.5.0" or "2.0.0" — drives buildFor1_5() vs build(). */
  apiVersion: string;
  /** last_added_block_info.timestamp as epoch ms — used to date the deploy. */
  blockTimestampMs: number;
  /** last_added_block_info.height — higher = more synced. */
  height: number;
}

/**
 * Parse a raw info_get_status JSON-RPC response into a ProbedNode, or null
 * if the node is unreachable, on the wrong chain, or missing the fields we
 * need. The raw JSON-RPC payload is snake_case (api_version, chainspec_name,
 * last_added_block_info) — we read it directly (not the SDK's camelCase
 * wrapper) because we fetch it with a plain fetch + AbortController timeout
 * rather than the SDK's timeout-less HttpHandler.
 */
export function parseInfoGetStatus(raw: unknown, url: string): ProbedNode | null {
  const result = (raw as { result?: Record<string, unknown>; error?: unknown })?.result;
  if (!result || (raw as { error?: unknown }).error) return null;
  const chainName = result.chainspec_name;
  const apiVersion = result.api_version;
  const labi = result.last_added_block_info as
    | { timestamp?: unknown; height?: unknown }
    | undefined;
  const tsRaw = labi?.timestamp;
  const height = typeof labi?.height === 'number' ? labi.height : -1;
  if (
    typeof chainName !== 'string' ||
    typeof apiVersion !== 'string' ||
    typeof tsRaw !== 'string'
  ) {
    return null;
  }
  const ms = Date.parse(tsRaw);
  if (!Number.isFinite(ms)) return null;
  return { url, chainName, apiVersion, blockTimestampMs: ms, height };
}

/**
 * One JSON-RPC POST with an AbortController timeout. Resolves to the parsed
 * JSON body, or rejects on HTTP error / timeout / network failure. The
 * caller (probeCandidateNodes) swallows rejections so one dead node doesn't
 * abort the parallel probe.
 */
async function rpcCall(
  url: string,
  method: string,
  params: unknown,
  fetchImpl: typeof fetch,
  timeoutMs: number,
): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Probe every candidate node in parallel with an AbortController-bounded
 * timeout, keep only those on the requested chain with a usable block
 * timestamp, and return them sorted most-synced-first (highest height).
 * Borrows buy.js:31-46 pickNode verbatim in shape.
 */
export async function probeCandidateNodes(
  urls: string[],
  chainName: string,
  fetchImpl: typeof fetch,
  timeoutMs: number,
): Promise<ProbedNode[]> {
  const probes = await Promise.all(
    urls.map(async (url) => {
      try {
        const raw = await rpcCall(url, 'info_get_status', {}, fetchImpl, timeoutMs);
        return parseInfoGetStatus(raw, url);
      } catch {
        return null;
      }
    }),
  );
  return probes
    .filter((p): p is ProbedNode => p !== null && p.chainName === chainName)
    .sort((a, b) => b.height - a.height);
}

/**
 * Race a promise against a timeout. The SDK's HttpHandler has no
 * AbortSignal/timeout (see casper-js-sdk@5.0.12), so we layer one on top.
 * On timeout we reject so the submit loop can fail over to the next node.
 * Because the underlying fetch can't be cancelled, we attach a no-op
 * `.catch` to the original promise so a late rejection from a timed-out
 * call doesn't surface as an unhandled rejection after we've moved on.
 */
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
  promise.catch(() => {
    /* swallow late rejection from the abandoned underlying call */
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

/** Default put-transaction: a fresh RpcClient per node URL. */
async function defaultPutToNode(url: string, transaction: Transaction): Promise<void> {
  const rpcClient = new RpcClient(new HttpHandler(url));
  await rpcClient.putTransaction(transaction);
}

/** Test/override hooks for submitCasperTransfer. Not part of the public API. */
export interface SubmitInternalOpts {
  /** Override the fetch used for node probing (tests). */
  fetchImpl?: typeof fetch;
  /**
   * Override the per-node submit step (tests). Resolves on accept, rejects
   * on error — the deploy hash is computed locally, so this need not
   * return it. Production uses defaultPutToNode (RpcClient.putTransaction).
   */
  putToNode?: (url: string, transaction: Transaction) => Promise<void>;
}

/**
 * Sign and submit the backend-attested native CSPR transfer, with multi-node
 * probe + per-call timeout + failover. Returns the deploy hash.
 *
 * Safety properties (see the file header for the full threat model):
 *   - Build + sign ONCE. The same signed deploy is reused across every
 *     failover target, so re-broadcasting to another node is idempotent on
 *     chain (dedup by hash). We never re-sign per node — different
 *     timestamps would yield different hashes and risk a double transfer if
 *     two nodes both accepted.
 *   - After signing, NEVER throw: the deploy hash is computed locally
 *     (transaction.hash.toHex()) and returned even if every node times out.
 *     The caller records it in the inflight ledger, so a retry re-VERIFIES
 *     that hash instead of submitting a second transfer. This closes the
 *     double-spend window that a throw-on-timeout would open (a node may
 *     have accepted the deploy even though its response was lost).
 *   - Failover targets are filtered to the best node's api_version major
 *     (1.x vs 2.x) so the single built transaction format is valid for all
 *     of them.
 *
 * Throws only BEFORE signing — 'no_node_configured' / 'no_synced_node' —
 * when nothing can be submitted, which is safe to retry.
 */
export async function submitCasperTransfer(
  payment: AttestedPayment,
  privateKey: PrivateKey,
  cfg: SigningConfig,
  internal: SubmitInternalOpts = {},
): Promise<string> {
  const candidates = resolveCandidateNodes(cfg);
  if (candidates.length === 0) {
    throw new SignerError(
      'No Casper node RPC URLs available. Set CASPER_NODE_RPC_URL ' +
        '(comma-separated) or re-enable CSPR402_CASPER_NODE_DEFAULTS.',
      'no_node_configured',
    );
  }
  const fetchImpl = internal.fetchImpl ?? (globalThis.fetch as typeof fetch);
  const probed = await probeCandidateNodes(
    candidates,
    payment.chain_name,
    fetchImpl,
    cfg.probeTimeoutMs,
  );
  if (probed.length === 0) {
    throw new SignerError(
      `No reachable synced Casper node for chain "${payment.chain_name}" among ` +
        `${candidates.length} candidate(s). Check CASPER_NODE_RPC_URL, the network, ` +
        `or raise CSPR402_PROBE_TIMEOUT_MS.`,
      'no_synced_node',
    );
  }

  // All failover targets must accept the SAME transaction format, so keep
  // only nodes whose api_version major (1.x vs 2.x) matches the best node.
  const best = probed[0];
  if (!best) {
    // Unreachable given the probed.length === 0 check above, but satisfies
    // the index-access narrowing and is a safe backstop.
    throw new SignerError('No synced Casper node after probe (unexpected).', 'no_synced_node');
  }
  const bestMajor = best.apiVersion.charAt(0);
  const targets = probed.filter((p) => p.apiVersion.charAt(0) === bestMajor);

  // Build + sign ONCE. Backdate 30s from the best node's last-block
  // (consensus) time to avoid "timestamp in future" rejection at the
  // mempool — same guard node-agent uses. The best node has the highest
  // height, so its consensus time is the most current; lagging failover
  // targets are within a block or two and covered by the 30s backdate.
  const safeTimestamp = new Timestamp(new Date(best.blockTimestampMs - 30_000));
  const builder = new NativeTransferBuilder()
    .from(privateKey.publicKey)
    .target(PublicKey.fromHex(payment.recipient))
    .amount(payment.amount_motes)
    .id(payment.transfer_id)
    .chainName(payment.chain_name)
    .payment(Number(cfg.transferPaymentMotes))
    .timestamp(safeTimestamp);
  const transaction = best.apiVersion.startsWith('1') ? builder.buildFor1_5() : builder.build();
  transaction.sign(privateKey);

  // Compute the deploy hash LOCALLY (before any submit) so we can record it
  // even if every node times out. The hash is a deterministic function of
  // the deploy body and is independent of the approval signature, so this
  // matches what the node returns and what the backend will see on chain.
  const deployHash = normalizeDeployHash(transaction.hash.toHex());

  const putToNode = internal.putToNode ?? defaultPutToNode;
  for (const node of targets) {
    try {
      await withTimeout(
        putToNode(node.url, transaction),
        cfg.submitTimeoutMs,
        `submit to ${node.url}`,
      );
      return deployHash;
    } catch {
      // Timeout or explicit reject — the signed deploy is idempotent by
      // hash, so it is safe to try the next node with the SAME deploy.
    }
  }
  // Every node failed or timed out. The deploy MAY still have been accepted
  // by a node whose response was lost, so do NOT throw — return the local
  // hash. The caller records it in the ledger and verifies; a retry then
  // re-verifies this hash instead of broadcasting a second transfer.
  return deployHash;
}

// ---------------------------------------------------------------------------
// Verify with retry (shared by MCP pay_order + CLI auto-pay + --verify)
// ---------------------------------------------------------------------------

export interface VerifyRetryOpts {
  timeoutMs?: number;
  pollMs?: number;
  /** Called on each 425 payment_pending retry so callers can log progress. */
  onPending?: (attempt: number) => void;
}

export async function verifyCasperPaymentWithRetry(
  client: CSPR402Client,
  orderId: string,
  deployHash: string,
  senderPublicKey: string | undefined,
  opts: VerifyRetryOpts = {},
): Promise<VerifyCasperPaymentResponse> {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_VERIFY_TIMEOUT_MS;
  const pollMs = opts.pollMs ?? DEFAULT_VERIFY_POLL_MS;
  const deadline = Date.now() + timeoutMs;
  let attempts = 0;
  // First attempt is immediate so an already-finalized deploy returns in
  // one round-trip with no delay.
  while (Date.now() < deadline) {
    attempts += 1;
    try {
      return await client.verifyCasperPayment(orderId, deployHash, {
        ...(senderPublicKey ? { senderPublicKey } : {}),
      });
    } catch (err) {
      const pending =
        err instanceof Error &&
        ((err as { status?: number }).status === 425 ||
          (err as { code?: string }).code === 'payment_pending');
      if (!pending || Date.now() + pollMs >= deadline) throw err;
      opts.onPending?.(attempts);
      await new Promise((r) => setTimeout(r, pollMs));
    }
  }
  throw new SignerError(
    `Timed out waiting for Casper payment verification after ${attempts} attempts ` +
      `(${Math.floor(timeoutMs / 1000)}s). The transfer WAS submitted (deploy ${deployHash}) — ` +
      `do NOT re-pay. Poll with check_order or re-run verify.`,
    'verify_timeout',
    deployHash,
  );
}

// ---------------------------------------------------------------------------
// payAndVerifyOrder — the security core
// ---------------------------------------------------------------------------

// order_id -> { deploy hash we already submitted, the sender public key
// we signed with, timestamp }. Prevents a retried or concurrent call from
// submitting a second transfer for the same order (which would send a
// duplicate CSPR payment to the treasury). The senderPublicKeyHex is stored
// so a re-verify (same process or a restarted one) can pass it to verify
// without re-loading the private key.
//
// Two layers:
//   - inflightPayments: the in-memory hot path, checked on every call.
//   - inflight.json on disk: survives process restarts so a fresh CLI run
//     or MCP server re-verifies instead of re-submitting. Hydrated into the
//     in-memory map lazily on first use.
interface InflightEntry {
  deployHash: string;
  senderPublicKeyHex?: string;
  ts: number;
}
const inflightPayments = new Map<string, InflightEntry>();

function inflightLedgerPath(): string {
  return path.join(defaultConfigDir(), 'inflight.json');
}

let ledgerHydrated = false;

function hydrateLedger(): void {
  if (ledgerHydrated) return;
  ledgerHydrated = true;
  const p = inflightLedgerPath();
  try {
    if (!fs.existsSync(p)) return;
    const raw = fs.readFileSync(p, 'utf8');
    const parsed = JSON.parse(raw) as { [orderId: string]: InflightEntry };
    const now = Date.now();
    for (const [orderId, entry] of Object.entries(parsed)) {
      if (
        entry &&
        typeof entry.deployHash === 'string' &&
        typeof entry.ts === 'number' &&
        now - entry.ts <= LEDGER_TTL_MS
      ) {
        inflightPayments.set(orderId, {
          deployHash: entry.deployHash,
          senderPublicKeyHex:
            typeof entry.senderPublicKeyHex === 'string' ? entry.senderPublicKeyHex : undefined,
          ts: entry.ts,
        });
      }
    }
  } catch {
    // Corrupt/unreadable ledger is non-fatal — fall back to an empty
    // ledger. We'd rather risk a duplicate than hard-fail an agent that
    // just restarted. The TTL + verify-before-submit still bounds it.
  }
}

function persistLedger(): void {
  const p = inflightLedgerPath();
  try {
    ensurePrivateDir(path.dirname(p));
    const snapshot: { [orderId: string]: InflightEntry } = {};
    for (const [orderId, entry] of inflightPayments) {
      snapshot[orderId] = {
        deployHash: entry.deployHash,
        senderPublicKeyHex: entry.senderPublicKeyHex,
        ts: entry.ts,
      };
    }
    atomicWriteFile600(p, JSON.stringify(snapshot, null, 2));
  } catch {
    // Best-effort: disk persistence is a defense-in-depth layer. If it
    // fails (read-only fs, full disk), the in-memory ledger still
    // guards the current process; only cross-process recovery degrades.
  }
}

function ledgerGet(orderId: string): InflightEntry | undefined {
  hydrateLedger();
  const entry = inflightPayments.get(orderId);
  if (!entry) return undefined;
  if (Date.now() - entry.ts > LEDGER_TTL_MS) {
    inflightPayments.delete(orderId);
    persistLedger();
    return undefined;
  }
  return entry;
}

function ledgerSet(orderId: string, deployHash: string, senderPublicKeyHex: string): void {
  inflightPayments.set(orderId, { deployHash, senderPublicKeyHex, ts: Date.now() });
  persistLedger();
}

function ledgerClear(orderId: string): void {
  if (!inflightPayments.has(orderId)) return;
  inflightPayments.delete(orderId);
  persistLedger();
}

/** Test-only: reset the ledger between tests. Not exported from the package. */
export function __resetInflightLedgerForTests(): void {
  inflightPayments.clear();
  inflightOrderLocks.clear();
  ledgerHydrated = false;
}

/** Extract + validate the attested payment fields from a backend order. */
function attest(payment: CasperCSPRPaymentInstructions): AttestedPayment {
  if (!payment.recipient || typeof payment.recipient !== 'string') {
    throw new SignerError('Order payment is missing a recipient.', 'incomplete_payment');
  }
  if (!payment.amount_motes || typeof payment.amount_motes !== 'string') {
    throw new SignerError('Order payment is missing amount_motes.', 'incomplete_payment');
  }
  if (typeof payment.transfer_id !== 'number' || !Number.isFinite(payment.transfer_id)) {
    throw new SignerError('Order payment is missing transfer_id.', 'incomplete_payment');
  }
  if (!payment.chain_name || typeof payment.chain_name !== 'string') {
    throw new SignerError('Order payment is missing chain_name.', 'incomplete_payment');
  }
  return {
    recipient: payment.recipient,
    amount_motes: payment.amount_motes,
    transfer_id: payment.transfer_id,
    chain_name: payment.chain_name,
    sender_public_key: payment.sender_public_key ?? null,
  };
}

export interface PayOrderResult {
  orderId: string;
  deployHash: string;
  verified: VerifyCasperPaymentResponse;
  /** Did we submit a fresh transfer this call, or re-verify an existing one? */
  submitted: boolean;
}

export interface PayAndVerifyOpts {
  /** Override the key loader (tests). */
  loadKey?: (cfg: SigningConfig) => LoadedAgentKey;
  /** Override the submit step (tests). */
  submit?: (
    payment: AttestedPayment,
    privateKey: PrivateKey,
    cfg: SigningConfig,
  ) => Promise<string>;
  /** Override the verify-retry step (tests). */
  verify?: (
    client: CSPR402Client,
    orderId: string,
    deployHash: string,
    senderPublicKey: string | undefined,
  ) => Promise<VerifyCasperPaymentResponse>;
  onPending?: (attempt: number) => void;
}

// Per-order mutex: a concurrent payAndVerifyOrder for the same order_id
// awaits the in-flight one and returns its result (which re-verified the
// recorded hash rather than submitting a second transfer). Without this
// the check-then-submit gap between ledgerGet and ledgerSet — separated
// by the submit network round-trip — let two parallel calls both submit.
const inflightOrderLocks = new Map<string, Promise<PayOrderResult>>();

/**
 * Pay a pending CSPR402 Casper-CSPR order with this agent's local key and
 * verify it. The caller supplies ONLY the order_id; recipient / amount /
 * transfer_id / chain_name all come from the backend order response and
 * are signed verbatim. See the file header for the threat model.
 */
export async function payAndVerifyOrder(
  client: CSPR402Client,
  orderId: string,
  opts: PayAndVerifyOpts = {},
): Promise<PayOrderResult> {
  // Serialize per-order. The second concurrent call for the same id
  // awaits the first's promise and returns its result — only one
  // transfer is ever submitted. The lock is released in finally so a
  // thrown verify_timeout still frees the slot for the retry.
  const existing = inflightOrderLocks.get(orderId);
  if (existing) return existing;
  const p = doPayAndVerifyOrder(client, orderId, opts);
  inflightOrderLocks.set(orderId, p);
  try {
    return await p;
  } finally {
    inflightOrderLocks.delete(orderId);
  }
}

async function doPayAndVerifyOrder(
  client: CSPR402Client,
  orderId: string,
  opts: PayAndVerifyOpts,
): Promise<PayOrderResult> {
  const cfg = resolveSigningConfig();
  if (!cfg) {
    throw new SignerError(
      'Auto-pay is not configured. Set CASPER_NODE_RPC_URL and run ' +
        "'cspr402 onboard' (which writes the agent key), or pay manually " +
        'and call verify_payment.',
      'signing_not_configured',
    );
  }

  // Re-fetch the order from the backend — this is the attestation step.
  // The backend scopes getOrder to this agent's api key, so we only ever
  // see our own orders here.
  const order = await client.getOrder(orderId);

  if (order.status !== 'pending_payment') {
    throw new SignerError(
      `Order ${orderId} is not pending payment (status=${order.status}). ` +
        `Nothing to pay — call check_order to inspect it.`,
      'order_not_pending',
    );
  }
  if (!order.payment || order.payment.type !== 'casper_cspr_transfer') {
    throw new SignerError(
      `Order ${orderId} is not a Casper native CSPR order (type=${order.payment?.type ?? 'none'}). ` +
        `Auto-pay currently supports casper_cspr_transfer only.`,
      'unsupported_payment_type',
    );
  }
  const payment = attest(order.payment);

  // Treasury allowlist (defense in depth): if the operator pinned an
  // approved recipient set, refuse to sign any transfer whose recipient
  // is not on it. Survives a backend compromise / TLS MitM that returns an
  // attacker address — the caller-params invariant alone can't, since the
  // params come over TLS, not cryptographically attested.
  if (cfg.treasuryAllowlist.length > 0) {
    const recipient = payment.recipient.toLowerCase();
    if (!cfg.treasuryAllowlist.includes(recipient)) {
      throw new SignerError(
        `Order ${orderId} recipient ${recipient} is not in the configured treasury allowlist. ` +
          `Refusing to sign a transfer to an unapproved recipient.`,
        'recipient_not_allowed',
      );
    }
  }

  // Double-submit guard: if we already submitted a transfer for this
  // order (in this process, or persisted from a prior process), re-verify
  // that hash instead of paying again. The recorded sender public key is
  // reused for verify so we never have to re-load the private key on the
  // re-verify path.
  const existing = ledgerGet(orderId);
  let deployHash: string;
  let submitted = false;
  // `senderPublicKeyHex` is needed for verify; the private key is not —
  // so the key is loaded inside the `if` block below and block-scoped out
  // before verify runs, dropping the only reachable reference to the raw
  // key bytes. That limits the key's lifetime to the submit step instead
  // of the whole (possibly minutes-long) verify window.
  let senderPublicKeyHex: string | undefined = existing?.senderPublicKeyHex;
  if (existing) {
    deployHash = existing.deployHash;
  } else {
    const { privateKey, senderPublicKeyHex: hex } = (opts.loadKey ?? loadAgentPrivateKey)(cfg);

    // Sender binding: if the order was created bound to a specific sender
    // (purchase_vcc/CLI pass payer_public_key), our key must match it. If
    // it was created unbound we can still pay — but the order is ours
    // (scoped by api key above), so paying it is legitimate.
    if (payment.sender_public_key && payment.sender_public_key.toLowerCase() !== hex) {
      throw new SignerError(
        `Order ${orderId} is bound to sender ${payment.sender_public_key}, but this agent's key ` +
          `is ${hex}. Refusing to pay an order bound to a different sender.`,
        'sender_mismatch',
      );
    }
    senderPublicKeyHex = hex;

    deployHash = await (opts.submit ?? submitCasperTransfer)(payment, privateKey, cfg);
    ledgerSet(orderId, deployHash, hex);
    submitted = true;
    // `privateKey` goes out of scope here — verify below uses only
    // `deployHash` + `senderPublicKeyHex`.
  }

  // Verify the submitted (or previously-submitted) deploy. Crucially, a
  // failure here does NOT clear the ledger — the transfer is in flight on
  // chain, and a transient 5xx/network blip during verify must not let a
  // retry submit a SECOND transfer. Only a successful verify clears it.
  //
  // Thread cfg.verifyTimeoutMs / cfg.verifyPollMs / opts.onPending into the
  // default retry path so the env overrides (and the 5s->2s poll default)
  // actually take effect for MCP/CLI auto-pay, and so the caller's
  // onPending progress callback fires on each 425 retry. When opts.verify is
  // injected (tests), it is called directly with the four base args — the
  // cfg threading is skipped, so existing tests are unaffected.
  try {
    const verifyFn =
      opts.verify ??
      ((c: CSPR402Client, id: string, h: string, s: string | undefined) =>
        verifyCasperPaymentWithRetry(c, id, h, s, {
          timeoutMs: cfg.verifyTimeoutMs,
          pollMs: cfg.verifyPollMs,
          onPending: opts.onPending,
        }));
    const verified = await verifyFn(client, orderId, deployHash, senderPublicKeyHex);
    ledgerClear(orderId);
    return { orderId, deployHash, verified, submitted };
  } catch (err) {
    // KEEP the ledger entry on every verify failure. The transfer was
    // broadcast (or a prior call broadcast it); a retry must re-verify
    // the recorded hash, never re-submit. Surface the deploy hash so the
    // caller (CLI/MCP) can print the recovery command.
    if (err instanceof SignerError) {
      // verify_timeout already carries the deploy hash; pass through.
      // For any other SignerError from verify, ensure the hash is attached.
      if (!err.deployHash) {
        throw new SignerError(err.message, err.code, deployHash);
      }
      throw err;
    }
    // Transient/non-SignerError verify failure (5xx, ECONNRESET, etc.):
    // the transfer IS in flight — wrap so callers see the deploy hash and
    // the same recovery path as verify_timeout.
    throw new SignerError(
      `Verify failed for order ${orderId} (deploy ${deployHash}): ${
        err instanceof Error ? err.message : String(err)
      }. The transfer WAS submitted — do NOT re-pay. Re-verify with check_order or 'cspr402 purchase --order ${orderId} --verify ${deployHash}'.`,
      'verify_incomplete',
      deployHash,
    );
  }
}
