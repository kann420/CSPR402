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
const DEFAULT_VERIFY_POLL_MS = 5000;

// Ledger entry TTL — an in-flight payment older than this is considered
// abandoned and a new submit is allowed. 1 hour is well beyond the
// backend's 2h order-expiry window divided by the typical verify loop,
// and short enough that a genuinely stuck entry doesn't block a legit
// retry forever.
const LEDGER_TTL_MS = 60 * 60 * 1000;

export interface SigningConfig {
  /** Absolute path to the agent's Casper secret-key PEM. */
  keyPath: string;
  /** Casper node JSON-RPC URL used to broadcast the signed deploy. */
  rpcUrl: string;
  /** Key algorithm for PrivateKey.fromPem. Onboard generates Ed25519. */
  algorithm: KeyAlgorithm;
  /** Gas (motes) for the native transfer deploy. */
  transferPaymentMotes: string;
  /** Verify-with-retry deadline (ms). */
  verifyTimeoutMs: number;
  /** Verify-with-retry poll interval (ms). */
  verifyPollMs: number;
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
 * nodes and the operator should pick one rather than us hardcoding a
 * broadcast endpoint.
 */
export function resolveSigningConfig(): SigningConfig | null {
  const config = loadCards402Config();
  const keyPath =
    process.env.CASPER_AGENT_PRIVATE_KEY_PATH ||
    process.env.CSPR402_KEY_PATH ||
    process.env.CARDS402_KEY_PATH ||
    config?.casper_key_path ||
    undefined;
  const rpcUrl = process.env.CASPER_NODE_RPC_URL;
  if (!keyPath || !rpcUrl) return null;
  return {
    keyPath,
    rpcUrl,
    algorithm: parseKeyAlgorithm(process.env.CASPER_AGENT_KEY_ALGORITHM),
    transferPaymentMotes:
      process.env.CASPER_TRANSFER_PAYMENT_MOTES || DEFAULT_TRANSFER_PAYMENT_MOTES,
    verifyTimeoutMs: parsePositiveIntEnv('CSPR402_VERIFY_TIMEOUT_MS', DEFAULT_VERIFY_TIMEOUT_MS),
    verifyPollMs: parsePositiveIntEnv('CSPR402_VERIFY_POLL_MS', DEFAULT_VERIFY_POLL_MS),
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
// Transfer submission (mirrors examples/node-agent/index.mjs:169-193)
// ---------------------------------------------------------------------------

function extractLatestBlockTimestamp(rawBlockResult: unknown): number | null {
  const rawBlock = (rawBlockResult as { block_with_signatures?: { block?: unknown } })
    ?.block_with_signatures?.block;
  const header =
    (rawBlock as { Version2?: { header?: { timestamp?: string } } })?.Version2?.header ||
    (rawBlock as { Version1?: { header?: { timestamp?: string } } })?.Version1?.header ||
    (rawBlock as { header?: { timestamp?: string } })?.header;
  if (!header?.timestamp) return null;
  const parsed = new Date(header.timestamp as string);
  return Number.isNaN(parsed.getTime()) ? null : parsed.getTime();
}

function normalizeDeployHash(value: unknown): string {
  if (typeof value === 'string') return value.toLowerCase();
  const maybe = value as { toHex?: () => string; toJSON?: () => string };
  if (maybe?.toHex && typeof maybe.toHex === 'function') return maybe.toHex().toLowerCase();
  if (maybe?.toJSON && typeof maybe.toJSON === 'function')
    return String(maybe.toJSON()).toLowerCase();
  return String(value).toLowerCase();
}

export async function submitCasperTransfer(
  payment: AttestedPayment,
  privateKey: PrivateKey,
  cfg: SigningConfig,
): Promise<string> {
  const rpcClient = new RpcClient(new HttpHandler(cfg.rpcUrl));
  const status = await rpcClient.getStatus();
  const latestBlock = await rpcClient.getLatestBlock();
  const latestBlockTimestamp = extractLatestBlockTimestamp(latestBlock.rawJSON);
  // Backdate 30s from the latest block to avoid "timestamp in future"
  // rejection at the mempool — same guard node-agent uses.
  const safeTimestamp = latestBlockTimestamp
    ? new Timestamp(new Date(latestBlockTimestamp - 30_000))
    : undefined;
  const builder = new NativeTransferBuilder()
    .from(privateKey.publicKey)
    .target(PublicKey.fromHex(payment.recipient))
    .amount(payment.amount_motes)
    .id(payment.transfer_id)
    .chainName(payment.chain_name)
    .payment(Number(cfg.transferPaymentMotes));
  if (safeTimestamp) builder.timestamp(safeTimestamp);
  // condr: apiVersion "1.x" needs buildFor1_5; newer chains use build().
  const transaction = status.apiVersion.startsWith('1') ? builder.buildFor1_5() : builder.build();
  transaction.sign(privateKey);
  const result = await rpcClient.putTransaction(transaction);
  return normalizeDeployHash(result.transactionHash?.toHex?.() ?? result.transactionHash);
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
  try {
    const verified = await (opts.verify ?? verifyCasperPaymentWithRetry)(
      client,
      orderId,
      deployHash,
      senderPublicKeyHex,
    );
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
