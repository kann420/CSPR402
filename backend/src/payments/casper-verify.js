// @ts-check
// Casper testnet CSPR deploy verification for CardCasper402.

const {
  CLValueParser,
  EntityIdentifier,
  ErrorCode,
  HttpHandler,
  PublicKey,
  RpcClient,
} = require('casper-js-sdk');

const DEPLOY_HASH_RE = /^[0-9a-fA-F]{64}$/;
const CASPER_PUBLIC_KEY_RE = /^(01[0-9a-fA-F]{64}|02[0-9a-fA-F]{66})$/;
const CASPER_HASH_RE = /^(hash-)?[0-9a-fA-F]{64}$/;
const ACCOUNT_HASH_RE = /^account-hash-[0-9a-fA-F]{64}$/;
const UREF_RE = /^uref-[0-9a-fA-F]{64}-\d{3}$/;
const recipientTargetCache = new Map();

class CasperPaymentVerificationError extends Error {
  /**
   * @param {string} code
   * @param {string} message
   * @param {number} status
   * @param {Record<string, unknown>} [details]
   */
  constructor(code, message, status, details = {}) {
    super(message);
    this.name = 'CasperPaymentVerificationError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

/** @param {string} value */
function assertDeployHash(value) {
  if (typeof value !== 'string' || !DEPLOY_HASH_RE.test(value)) {
    throw new CasperPaymentVerificationError(
      'invalid_deploy_hash',
      'deploy_hash must be a 64-character hex string',
      400,
    );
  }
}

/** @param {unknown} value */
function normalizePublicKey(value) {
  if (typeof value === 'string') return value.toLowerCase();
  if (value && typeof value === 'object') {
    const obj = /** @type {Record<string, unknown>} */ (value);
    if (typeof obj.PublicKey === 'string') return obj.PublicKey.toLowerCase();
    if (typeof obj.public_key === 'string') return obj.public_key.toLowerCase();
    if (typeof obj.publicKey === 'string') return obj.publicKey.toLowerCase();
  }
  return null;
}

/** @param {unknown} value */
function normalizeAccountHash(value) {
  const raw =
    typeof value === 'string'
      ? value
      : value && typeof value === 'object'
        ? /** @type {Record<string, unknown>} */ (value).Account ||
          /** @type {Record<string, unknown>} */ (value).AccountHash ||
          /** @type {Record<string, unknown>} */ (value).account_hash ||
          /** @type {Record<string, unknown>} */ (value).accountHash
        : null;
  if (typeof raw !== 'string') return null;
  if (ACCOUNT_HASH_RE.test(raw)) return raw.toLowerCase();
  if (/^[0-9a-fA-F]{64}$/.test(raw)) return `account-hash-${raw.toLowerCase()}`;
  return null;
}

/** @param {unknown} value */
function normalizeCasperHash(value) {
  if (typeof value !== 'string' || !CASPER_HASH_RE.test(value)) return null;
  return value.replace(/^hash-/i, '').toLowerCase();
}

/** @param {unknown} value */
function normalizeURef(value) {
  const raw =
    typeof value === 'string'
      ? value
      : value && typeof value === 'object'
        ? /** @type {Record<string, unknown>} */ (value).URef ||
          /** @type {Record<string, unknown>} */ (value).uref
        : null;
  if (typeof raw !== 'string' || !UREF_RE.test(raw)) return null;
  return raw.toLowerCase();
}

/** @param {unknown} value */
function normalizeDeployHash(value) {
  if (typeof value === 'string' && DEPLOY_HASH_RE.test(value)) return value.toLowerCase();
  if (value && typeof value === 'object') {
    const obj = /** @type {Record<string, unknown>} */ (value);
    if (typeof obj.Deploy === 'string') return normalizeDeployHash(obj.Deploy);
    if (typeof obj.Version1 === 'string') return normalizeDeployHash(obj.Version1);
    if (typeof obj.hash === 'string') return normalizeDeployHash(obj.hash);
  }
  return null;
}

/** @param {unknown} value */
function normalizeTransferId(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return Number.isSafeInteger(value) ? value : null;
  if (typeof value === 'bigint') {
    if (value > BigInt(Number.MAX_SAFE_INTEGER)) return null;
    return Number(value);
  }
  if (typeof value === 'string' && /^\d+$/.test(value)) {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) ? parsed : null;
  }
  if (value && typeof value === 'object') {
    const obj = /** @type {Record<string, unknown>} */ (value);
    if ('Some' in obj) return normalizeTransferId(obj.Some);
  }
  return null;
}

/**
 * @param {Array<[string, { parsed?: unknown }]> | { Named?: Array<[string, { parsed?: unknown }]> } | undefined} args
 */
function normalizeNamedArgs(args) {
  if (Array.isArray(args)) return args;
  if (args && typeof args === 'object' && Array.isArray(args.Named)) return args.Named;
  return [];
}

/**
 * @param {Array<[string, { parsed?: unknown }]> | { Named?: Array<[string, { parsed?: unknown }]> } | undefined} args
 * @param {string} name
 */
function findNamedArg(args, name) {
  const namedArgs = normalizeNamedArgs(args);
  const found = namedArgs.find((entry) => Array.isArray(entry) && entry[0] === name);
  return found?.[1] || null;
}

/**
 * @param {Array<[string, { parsed?: unknown }]> | { Named?: Array<[string, { parsed?: unknown }]> } | undefined} args
 * @param {string} name
 */
function findParsedArg(args, name) {
  return findNamedArg(args, name)?.parsed;
}

/** @param {unknown} arg */
function parseClArg(arg) {
  if (!arg || typeof arg !== 'object') return null;
  const obj = /** @type {{ parsed?: unknown }} */ (arg);
  if (obj.parsed !== undefined) return obj.parsed;
  try {
    return CLValueParser.fromJSON(arg).toString();
  } catch {
    return null;
  }
}

/**
 * @param {Array<[string, { parsed?: unknown, bytes?: string, cl_type?: unknown }]> | { Named?: Array<[string, { parsed?: unknown, bytes?: string, cl_type?: unknown }]> } | undefined} args
 * @param {string} name
 */
function findClArg(args, name) {
  return parseClArg(findNamedArg(args, name));
}

/** @param {unknown} deploy */
function extractLegacyDeployTransfer(deploy) {
  if (!deploy || typeof deploy !== 'object') return null;
  const d = /** @type {Record<string, any>} */ (deploy);
  const transfer = d.session?.Transfer;
  if (!transfer) return null;
  const args = transfer.args;
  return {
    amountMotes: String(findParsedArg(args, 'amount') ?? ''),
    recipient: normalizePublicKey(findParsedArg(args, 'target')),
    transferId: normalizeTransferId(findParsedArg(args, 'id')),
  };
}

/** @param {unknown} transaction */
function extractTransactionTransfer(transaction) {
  if (!transaction || typeof transaction !== 'object') return null;
  const t = /** @type {Record<string, any>} */ (transaction);
  const version = t.Version1 || t;
  const fields = version.payload?.fields || version.body || {};
  if (fields.entry_point && fields.entry_point !== 'Transfer') return null;
  const args = fields.args;
  return {
    amountMotes: String(findParsedArg(args, 'amount') ?? ''),
    transferId: normalizeTransferId(findParsedArg(args, 'id')),
  };
}

/**
 * @param {unknown} value
 * @returns {{
 *   amountMotes: string,
 *   transferId: number | null,
 *   recipientAccountHash: string | null,
 *   recipientPurse: string | null,
 *   deployHash: string | null,
 * } | null}
 */
function normalizeExecutionTransfer(value) {
  if (!value || typeof value !== 'object') return null;
  const transfer =
    /** @type {Record<string, any>} */ (value).Version2 ||
    /** @type {Record<string, any>} */ (value).WriteTransfer ||
    value;
  return {
    amountMotes: String(transfer.amount ?? ''),
    transferId: normalizeTransferId(transfer.id),
    recipientAccountHash: normalizeAccountHash(transfer.to),
    recipientPurse: normalizeURef(transfer.target),
    deployHash: normalizeDeployHash(transfer.deploy_hash || transfer.transaction_hash),
  };
}

/** @param {unknown} result */
function unwrapExecutionResult(result) {
  if (!result || typeof result !== 'object') return null;
  const obj = /** @type {Record<string, any>} */ (result);
  if (obj.execution_result) return unwrapExecutionResult(obj.execution_result);
  if (obj.result) return unwrapExecutionResult(obj.result);
  if (obj.Version2) return obj.Version2;
  if (obj.Success || obj.Failure) return obj;
  return obj;
}

/** @param {unknown} rpcValue */
function extractExecutionInfo(rpcValue) {
  const v = /** @type {Record<string, any>} */ (rpcValue || {});
  if (v.execution_info) return v.execution_info;
  if (Array.isArray(v.execution_results)) return v.execution_results[0] || null;
  return null;
}

/** @param {unknown} rpcValue */
function extractExecutionTransfers(rpcValue) {
  const executionInfo = extractExecutionInfo(rpcValue);
  const unwrapped = unwrapExecutionResult(executionInfo);
  if (!unwrapped) return [];

  const records = [];
  if (Array.isArray(unwrapped.transfers)) {
    for (const transfer of unwrapped.transfers) {
      const normalized = normalizeExecutionTransfer(transfer);
      if (normalized) records.push(normalized);
    }
  }

  const transforms =
    unwrapped.effect?.transforms ||
    unwrapped.effects ||
    unwrapped.Success?.effect?.transforms ||
    [];
  if (Array.isArray(transforms)) {
    for (const entry of transforms) {
      const normalized = normalizeExecutionTransfer(entry?.transform?.WriteTransfer);
      if (normalized) records.push(normalized);
    }
  }

  return records;
}

/** @param {unknown} executionInfo */
function executionStatus(executionInfo) {
  if (!executionInfo) return { state: 'pending', cost: null };
  const unwrapped = unwrapExecutionResult(executionInfo);
  if (!unwrapped) return { state: 'pending', cost: null };
  if ('error_message' in unwrapped) {
    return unwrapped.error_message
      ? { state: 'failed', error: String(unwrapped.error_message), cost: unwrapped.cost ?? null }
      : { state: 'success', cost: unwrapped.cost ?? null };
  }
  if (unwrapped.Failure) {
    return {
      state: 'failed',
      error: unwrapped.Failure.error_message || 'execution failed',
      cost: unwrapped.Failure.cost ?? null,
    };
  }
  if (unwrapped.Success) return { state: 'success', cost: unwrapped.Success.cost ?? null };
  return { state: 'pending', cost: null };
}

function getRpcClient() {
  const url = process.env.CASPER_NODE_RPC_URL;
  if (!url) {
    throw new CasperPaymentVerificationError(
      'casper_rpc_not_configured',
      'CASPER_NODE_RPC_URL is required to verify Casper payments',
      503,
    );
  }
  return new RpcClient(new HttpHandler(url, 'fetch'));
}

/**
 * @param {string} method
 * @param {Record<string, unknown>} params
 */
async function casperRpc(method, params) {
  const url = process.env.CASPER_NODE_RPC_URL;
  if (!url) {
    throw new CasperPaymentVerificationError(
      'casper_rpc_not_configured',
      'CASPER_NODE_RPC_URL is required to verify Casper payments',
      503,
    );
  }
  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: '1', method, params }),
      signal: AbortSignal.timeout(15000),
    });
  } catch (err) {
    throw new CasperPaymentVerificationError('casper_rpc_error', 'Casper RPC request failed', 502, {
      error: err instanceof Error ? err.message : String(err),
    });
  }
  if (!res.ok) {
    throw new CasperPaymentVerificationError(
      'casper_rpc_error',
      'Casper RPC returned HTTP error',
      502,
      {
        status: res.status,
      },
    );
  }
  const body = await res.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    throw new CasperPaymentVerificationError(
      'casper_rpc_error',
      'Casper RPC returned invalid JSON',
      502,
    );
  }
  if (body.error) {
    const message = String(body.error.data || body.error.message || 'Casper RPC error');
    if (/not found|no such deploy|unknown deploy|no such transaction/i.test(message)) {
      throw new CasperPaymentVerificationError('payment_pending', 'Deploy not found yet', 425);
    }
    throw new CasperPaymentVerificationError('casper_rpc_error', message, 502, {
      code: body.error.code,
    });
  }
  return body.result?.value ?? body.result;
}

/** @param {string} deployHash */
async function fetchTransaction(deployHash) {
  assertDeployHash(deployHash);
  return casperRpc('info_get_transaction', {
    transaction_hash: { Version1: deployHash.toLowerCase() },
  });
}

/** @param {string} deployHash */
async function fetchDeploy(deployHash) {
  assertDeployHash(deployHash);
  return casperRpc('info_get_deploy', {
    deploy_hash: deployHash.toLowerCase(),
    finalized_approvals: true,
  });
}

/** @param {unknown} value */
function extractEnvelope(value) {
  if (!value || typeof value !== 'object') return null;
  const obj = /** @type {Record<string, any>} */ (value);
  return obj.transaction || obj.deploy || null;
}

/** @param {unknown} envelope */
function extractEnvelopeHash(envelope) {
  if (!envelope || typeof envelope !== 'object') return null;
  const obj = /** @type {Record<string, any>} */ (envelope);
  const version = obj.Version1 || obj;
  return normalizeDeployHash(version.hash);
}

/** @param {unknown} envelope */
function extractEnvelopeChainName(envelope) {
  if (!envelope || typeof envelope !== 'object') return null;
  const obj = /** @type {Record<string, any>} */ (envelope);
  const version = obj.Version1 || obj;
  return (
    version.payload?.chain_name || version.header?.chain_name || version.header?.chainName || null
  );
}

/**
 * @param {unknown} envelope
 * @param {unknown} executionInfo
 */
function extractEnvelopeSender(envelope, executionInfo) {
  if (envelope && typeof envelope === 'object') {
    const obj = /** @type {Record<string, any>} */ (envelope);
    const version = obj.Version1 || obj;
    const fromHeader =
      normalizePublicKey(version.payload?.initiator_addr) ||
      normalizePublicKey(version.header?.initiator_addr) ||
      normalizePublicKey(version.header?.account);
    if (fromHeader) return fromHeader;
  }
  return normalizePublicKey(unwrapExecutionResult(executionInfo)?.initiator);
}

/** @param {unknown} value */
function normalizeEntryPoint(value) {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object') {
    const obj = /** @type {Record<string, unknown>} */ (value);
    if (typeof obj.Custom === 'string') return obj.Custom;
    if (typeof obj.custom === 'string') return obj.custom;
  }
  return null;
}

/** @param {unknown} envelope */
function extractEnvelopeFields(envelope) {
  if (!envelope || typeof envelope !== 'object') return {};
  const obj = /** @type {Record<string, any>} */ (envelope);
  const version = obj.Version1 || obj;
  return version.payload?.fields || version.body || {};
}

/** @param {unknown} envelope */
function extractLegacySession(envelope) {
  if (!envelope || typeof envelope !== 'object') return null;
  const obj = /** @type {Record<string, any>} */ (envelope);
  return obj.session || null;
}

/** @param {unknown} target */
function extractStoredPackageHash(target) {
  if (!target || typeof target !== 'object') return null;
  const obj = /** @type {Record<string, any>} */ (target);
  return (
    normalizeCasperHash(obj.Stored?.id?.ByPackageHash?.addr) ||
    normalizeCasperHash(obj.Stored?.id?.ByPackageHash) ||
    normalizeCasperHash(obj.Stored?.id?.ByHash?.addr) ||
    normalizeCasperHash(obj.Stored?.id?.ByHash) ||
    normalizeCasperHash(obj.stored?.id?.byPackageHash?.addr) ||
    normalizeCasperHash(obj.stored?.id?.byHash?.addr)
  );
}

/** @param {unknown} envelope */
function extractCep18Transfer(envelope) {
  if (!envelope || typeof envelope !== 'object') return null;
  const fields = extractEnvelopeFields(envelope);
  const entryPoint = normalizeEntryPoint(fields.entry_point || fields.entryPoint);
  if (entryPoint) {
    if (entryPoint !== 'transfer') return null;
    const args = fields.args;
    return {
      entryPoint,
      contractPackageHash: extractStoredPackageHash(fields.target),
      recipientAccountHash: normalizeAccountHash(findClArg(args, 'recipient')),
      amountBaseUnits: String(findClArg(args, 'amount') ?? ''),
    };
  }

  const session = extractLegacySession(envelope);
  const stored =
    session?.StoredVersionedContractByHash ||
    session?.storedVersionedContractByHash ||
    session?.StoredContractByHash ||
    session?.storedContractByHash ||
    null;
  if (!stored || normalizeEntryPoint(stored.entry_point || stored.entryPoint) !== 'transfer') {
    return null;
  }
  return {
    entryPoint: 'transfer',
    contractPackageHash: normalizeCasperHash(stored.hash),
    recipientAccountHash: normalizeAccountHash(findClArg(stored.args, 'recipient')),
    amountBaseUnits: String(findClArg(stored.args, 'amount') ?? ''),
  };
}

/**
 * @param {string} publicKeyHex
 * @returns {{ publicKey: string, accountHash: string, mainPurse: string | null }}
 */
function deriveRecipientTargets(publicKeyHex) {
  if (!CASPER_PUBLIC_KEY_RE.test(publicKeyHex)) {
    throw new CasperPaymentVerificationError(
      'invalid_expected_recipient',
      'Configured Casper treasury public key is invalid',
      500,
    );
  }
  const normalized = publicKeyHex.toLowerCase();
  const cached = recipientTargetCache.get(normalized);
  if (cached) return cached;
  const targets = {
    publicKey: normalized,
    accountHash: PublicKey.fromHex(normalized).accountHash().toPrefixedString().toLowerCase(),
    mainPurse: null,
  };
  recipientTargetCache.set(normalized, targets);
  return targets;
}

/**
 * @param {{ publicKey: string, accountHash: string, mainPurse: string | null }} targets
 */
async function fillRecipientMainPurse(targets) {
  if (targets.mainPurse) return targets;
  try {
    const client = getRpcClient();
    try {
      const account = await client.getAccountInfo(null, {
        publicKey: PublicKey.fromHex(targets.publicKey),
      });
      const purse =
        normalizeURef(account?.rawJSON?.value?.account?.main_purse) ||
        normalizeURef(account?.rawJSON?.account?.main_purse) ||
        normalizeURef(account?.account?.mainPurse?.toJSON?.()) ||
        normalizeURef(account?.account?.mainPurse?.toString?.());
      if (purse) {
        targets.mainPurse = purse;
        return targets;
      }
    } catch (err) {
      const migrated =
        err &&
        typeof err === 'object' &&
        'code' in err &&
        err.code === ErrorCode.AccountMigratedToEntity;
      if (!migrated) {
        throw err;
      }
    }

    const entity = await client.getLatestEntity(
      EntityIdentifier.fromPublicKey(PublicKey.fromHex(targets.publicKey)),
    );
    const purse =
      normalizeURef(entity?.rawJSON?.value?.entity?.main_purse) ||
      normalizeURef(entity?.rawJSON?.entity?.main_purse) ||
      normalizeURef(entity?.entity?.addressableEntity?.entity?.mainPurse?.toJSON?.()) ||
      normalizeURef(entity?.entity?.addressableEntity?.entity?.mainPurse?.toString?.()) ||
      normalizeURef(entity?.entity?.legacyAccount?.mainPurse?.toJSON?.()) ||
      normalizeURef(entity?.entity?.legacyAccount?.mainPurse?.toString?.());
    if (purse) targets.mainPurse = purse;
  } catch {
    // If purse lookup fails, fall back to account-hash-only verification.
  }
  return targets;
}

/**
 * @param {ReturnType<typeof normalizeExecutionTransfer>[]} transfers
 * @param {{
 *   deployHash: string,
 *   expectedTransferId: number,
 * }} opts
 */
function selectExecutionTransfer(transfers, opts) {
  const matchingId = transfers.filter(
    (transfer) =>
      transfer &&
      transfer.transferId === opts.expectedTransferId &&
      (!transfer.deployHash || transfer.deployHash === opts.deployHash.toLowerCase()),
  );
  if (matchingId.length > 0) return matchingId[0];
  return (
    transfers.find((transfer) => transfer && transfer.transferId === opts.expectedTransferId) ||
    null
  );
}

/**
 * @param {string} deployHash
 * @returns {Promise<{ source: 'transaction' | 'deploy', value: any }>}
 */
async function fetchTransactionOrDeploy(deployHash) {
  try {
    const value = await fetchTransaction(deployHash);
    if (extractEnvelope(value)) {
      return { source: 'transaction', value };
    }
  } catch (err) {
    if (!(err instanceof CasperPaymentVerificationError)) throw err;
    if (err.code !== 'payment_pending' && err.code !== 'casper_rpc_error') {
      throw err;
    }
  }
  return { source: 'deploy', value: await fetchDeploy(deployHash) };
}

/**
 * @param {{
 *   source: 'transaction' | 'deploy',
 *   value: any,
 *   deployHash: string,
 *   expectedChainName: string,
 *   expectedRecipient: string,
 *   expectedAmountMotes: string,
 *   expectedTransferId: number,
 *   expectedSender?: string | null,
 * }} opts
 */
async function verifyCasperSourcePayment(opts) {
  const envelope = extractEnvelope(opts.value);
  if (!envelope) {
    throw new CasperPaymentVerificationError('payment_pending', 'Deploy not found yet', 425);
  }

  const executionInfo = extractExecutionInfo(opts.value);
  const executionTransfers =
    opts.source === 'transaction' ? extractExecutionTransfers(opts.value) : [];
  let actualHash = extractEnvelopeHash(envelope);
  if (
    opts.source === 'transaction' &&
    actualHash !== opts.deployHash.toLowerCase() &&
    executionTransfers.some((transfer) => transfer?.deployHash === opts.deployHash.toLowerCase())
  ) {
    actualHash = opts.deployHash.toLowerCase();
  }
  if (actualHash !== opts.deployHash.toLowerCase()) {
    throw new CasperPaymentVerificationError(
      'deploy_hash_mismatch',
      'RPC deploy hash mismatch',
      409,
      { expected: opts.deployHash.toLowerCase(), actual: actualHash },
    );
  }

  const chainName = extractEnvelopeChainName(envelope);
  if (chainName !== opts.expectedChainName) {
    throw new CasperPaymentVerificationError(
      'wrong_chain',
      'Deploy was submitted to the wrong chain',
      422,
      {
        expected: opts.expectedChainName,
        actual: chainName,
      },
    );
  }

  const sender = extractEnvelopeSender(envelope, executionInfo);
  if (opts.expectedSender) {
    const expectedSender = opts.expectedSender.toLowerCase();
    if (!CASPER_PUBLIC_KEY_RE.test(opts.expectedSender) || sender !== expectedSender) {
      throw new CasperPaymentVerificationError(
        'wrong_sender',
        'Deploy sender does not match expected payer',
        422,
      );
    }
  }

  const status = executionStatus(executionInfo);
  if (status.state === 'pending') {
    throw new CasperPaymentVerificationError('payment_pending', 'Deploy has not executed yet', 425);
  }
  if (status.state === 'failed') {
    throw new CasperPaymentVerificationError(
      'execution_failed',
      'Casper deploy execution failed',
      422,
      {
        error: status.error || null,
      },
    );
  }

  let paid;
  let expected;
  try {
    expected = BigInt(opts.expectedAmountMotes);
  } catch {
    throw new CasperPaymentVerificationError(
      'invalid_transfer_amount',
      'Expected Casper transfer amount could not be parsed',
      500,
    );
  }

  if (opts.source === 'transaction') {
    const intendedTransfer =
      extractTransactionTransfer(envelope) || extractLegacyDeployTransfer(envelope);
    if (!intendedTransfer) {
      throw new CasperPaymentVerificationError(
        'not_native_transfer',
        'Deploy is not a native CSPR transfer',
        422,
      );
    }
    if (intendedTransfer.transferId !== opts.expectedTransferId) {
      throw new CasperPaymentVerificationError(
        'wrong_transfer_id',
        'Casper transfer id does not match order',
        422,
        {
          expected: opts.expectedTransferId,
          actual: intendedTransfer.transferId,
        },
      );
    }

    const executionTransfer = selectExecutionTransfer(executionTransfers, {
      deployHash: opts.deployHash,
      expectedTransferId: opts.expectedTransferId,
    });
    if (!executionTransfer) {
      throw new CasperPaymentVerificationError(
        'not_native_transfer',
        'Casper execution result did not include a native transfer record',
        422,
      );
    }

    const expectedRecipient = deriveRecipientTargets(opts.expectedRecipient);
    let matchesRecipient = executionTransfer.recipientAccountHash === expectedRecipient.accountHash;
    if (
      !matchesRecipient &&
      !executionTransfer.recipientAccountHash &&
      executionTransfer.recipientPurse
    ) {
      await fillRecipientMainPurse(expectedRecipient);
      matchesRecipient =
        expectedRecipient.mainPurse !== null &&
        executionTransfer.recipientPurse === expectedRecipient.mainPurse;
    }
    if (!matchesRecipient) {
      throw new CasperPaymentVerificationError(
        'wrong_recipient',
        'Casper transfer recipient does not match order',
        422,
        {
          expected_public_key: expectedRecipient.publicKey,
          expected_account_hash: expectedRecipient.accountHash,
          expected_main_purse: expectedRecipient.mainPurse,
          actual_account_hash: executionTransfer.recipientAccountHash,
          actual_target_purse: executionTransfer.recipientPurse,
        },
      );
    }

    try {
      paid = BigInt(executionTransfer.amountMotes);
    } catch {
      throw new CasperPaymentVerificationError(
        'invalid_transfer_amount',
        'Casper transfer amount could not be parsed',
        422,
      );
    }

    if (paid < expected) {
      throw new CasperPaymentVerificationError(
        'underpaid',
        'Casper transfer amount is below the required amount',
        422,
        {
          expected: expected.toString(),
          actual: paid.toString(),
        },
      );
    }

    return {
      deployHash: opts.deployHash.toLowerCase(),
      senderPublicKey: sender,
      recipient: opts.expectedRecipient.toLowerCase(),
      amountMotes: paid.toString(),
      transferId: executionTransfer.transferId,
      chainName,
      blockHash: executionInfo?.block_hash || null,
      blockHeight: executionInfo?.block_height || null,
      gasCostMotes: status.cost !== null && status.cost !== undefined ? String(status.cost) : null,
    };
  }

  const transfer = extractLegacyDeployTransfer(envelope);
  if (!transfer) {
    throw new CasperPaymentVerificationError(
      'not_native_transfer',
      'Deploy is not a native CSPR transfer',
      422,
    );
  }
  if (transfer.recipient !== opts.expectedRecipient.toLowerCase()) {
    throw new CasperPaymentVerificationError(
      'wrong_recipient',
      'Casper transfer recipient does not match order',
      422,
      {
        expected: opts.expectedRecipient,
        actual: transfer.recipient,
      },
    );
  }
  if (transfer.transferId !== opts.expectedTransferId) {
    throw new CasperPaymentVerificationError(
      'wrong_transfer_id',
      'Casper transfer id does not match order',
      422,
      {
        expected: opts.expectedTransferId,
        actual: transfer.transferId,
      },
    );
  }

  try {
    paid = BigInt(transfer.amountMotes);
  } catch {
    throw new CasperPaymentVerificationError(
      'invalid_transfer_amount',
      'Casper transfer amount could not be parsed',
      422,
    );
  }
  if (paid < expected) {
    throw new CasperPaymentVerificationError(
      'underpaid',
      'Casper transfer amount is below the required amount',
      422,
      {
        expected: expected.toString(),
        actual: paid.toString(),
      },
    );
  }

  return {
    deployHash: opts.deployHash.toLowerCase(),
    senderPublicKey: sender,
    recipient: transfer.recipient,
    amountMotes: paid.toString(),
    transferId: transfer.transferId,
    chainName,
    blockHash: executionInfo?.block_hash || null,
    blockHeight: executionInfo?.block_height || null,
    gasCostMotes: status.cost !== null && status.cost !== undefined ? String(status.cost) : null,
  };
}

/**
 * @param {{
 *   source: 'transaction' | 'deploy',
 *   value: any,
 *   deployHash: string,
 *   expectedChainName: string,
 *   expectedContractPackageHash: string,
 *   expectedRecipient: string,
 *   expectedAmountBaseUnits: string,
 *   expectedSender: string,
 * }} opts
 */
async function verifyCasperSourceCep18Payment(opts) {
  const envelope = extractEnvelope(opts.value);
  if (!envelope) {
    throw new CasperPaymentVerificationError('payment_pending', 'Deploy not found yet', 425);
  }

  const executionInfo = extractExecutionInfo(opts.value);
  const executionTransfers =
    opts.source === 'transaction' ? extractExecutionTransfers(opts.value) : [];
  let actualHash = extractEnvelopeHash(envelope);
  if (
    opts.source === 'transaction' &&
    actualHash !== opts.deployHash.toLowerCase() &&
    executionTransfers.some((transfer) => transfer?.deployHash === opts.deployHash.toLowerCase())
  ) {
    actualHash = opts.deployHash.toLowerCase();
  }
  if (actualHash !== opts.deployHash.toLowerCase()) {
    throw new CasperPaymentVerificationError(
      'deploy_hash_mismatch',
      'RPC deploy hash mismatch',
      409,
      { expected: opts.deployHash.toLowerCase(), actual: actualHash },
    );
  }

  const chainName = extractEnvelopeChainName(envelope);
  if (chainName !== opts.expectedChainName) {
    throw new CasperPaymentVerificationError(
      'wrong_chain',
      'Deploy was submitted to the wrong chain',
      422,
      {
        expected: opts.expectedChainName,
        actual: chainName,
      },
    );
  }

  const expectedSender = opts.expectedSender.toLowerCase();
  const sender = extractEnvelopeSender(envelope, executionInfo);
  if (!CASPER_PUBLIC_KEY_RE.test(opts.expectedSender) || sender !== expectedSender) {
    throw new CasperPaymentVerificationError(
      'wrong_sender',
      'Deploy sender does not match expected payer',
      422,
    );
  }

  const status = executionStatus(executionInfo);
  if (status.state === 'pending') {
    throw new CasperPaymentVerificationError('payment_pending', 'Deploy has not executed yet', 425);
  }
  if (status.state === 'failed') {
    throw new CasperPaymentVerificationError(
      'execution_failed',
      'Casper deploy execution failed',
      422,
      {
        error: status.error || null,
      },
    );
  }

  const transfer = extractCep18Transfer(envelope);
  if (!transfer) {
    throw new CasperPaymentVerificationError(
      'not_cep18_transfer',
      'Deploy is not a CEP-18 transfer call',
      422,
    );
  }

  const expectedPackageHash = normalizeCasperHash(opts.expectedContractPackageHash);
  if (!expectedPackageHash || transfer.contractPackageHash !== expectedPackageHash) {
    throw new CasperPaymentVerificationError(
      'wrong_contract',
      'CEP-18 transfer target does not match mockUSDC package hash',
      422,
      {
        expected: expectedPackageHash,
        actual: transfer.contractPackageHash,
      },
    );
  }

  const expectedRecipient = deriveRecipientTargets(opts.expectedRecipient);
  if (transfer.recipientAccountHash !== expectedRecipient.accountHash) {
    throw new CasperPaymentVerificationError(
      'wrong_recipient',
      'CEP-18 transfer recipient does not match order',
      422,
      {
        expected_public_key: expectedRecipient.publicKey,
        expected_account_hash: expectedRecipient.accountHash,
        actual_account_hash: transfer.recipientAccountHash,
      },
    );
  }

  let expected;
  let paid;
  try {
    expected = BigInt(opts.expectedAmountBaseUnits);
    paid = BigInt(transfer.amountBaseUnits);
  } catch {
    throw new CasperPaymentVerificationError(
      'invalid_transfer_amount',
      'CEP-18 transfer amount could not be parsed',
      422,
    );
  }
  if (paid < expected) {
    throw new CasperPaymentVerificationError(
      'underpaid',
      'CEP-18 transfer amount is below the required amount',
      422,
      {
        expected: expected.toString(),
        actual: paid.toString(),
      },
    );
  }

  return {
    deployHash: opts.deployHash.toLowerCase(),
    senderPublicKey: sender,
    recipient: opts.expectedRecipient.toLowerCase(),
    recipientAccountHash: transfer.recipientAccountHash,
    contractPackageHash: transfer.contractPackageHash,
    amountBaseUnits: paid.toString(),
    chainName,
    blockHash: executionInfo?.block_hash || null,
    blockHeight: executionInfo?.block_height || null,
    gasCostMotes: status.cost !== null && status.cost !== undefined ? String(status.cost) : null,
  };
}

/**
 * @param {{
 *   deployHash: string,
 *   expectedChainName: string,
 *   expectedRecipient: string,
 *   expectedAmountMotes: string,
 *   expectedTransferId: number,
 *   expectedSender?: string | null,
 * }} opts
 */
async function verifyCasperDeployPayment(opts) {
  assertDeployHash(opts.deployHash);
  const source = await fetchTransactionOrDeploy(opts.deployHash);
  return verifyCasperSourcePayment({ ...opts, ...source });
}

/**
 * @param {{
 *   deployHash: string,
 *   expectedChainName: string,
 *   expectedContractPackageHash: string,
 *   expectedRecipient: string,
 *   expectedAmountBaseUnits: string,
 *   expectedSender: string,
 * }} opts
 */
async function verifyCasperCep18Payment(opts) {
  assertDeployHash(opts.deployHash);
  const source = await fetchTransactionOrDeploy(opts.deployHash);
  return verifyCasperSourceCep18Payment({ ...opts, ...source });
}

module.exports = {
  CasperPaymentVerificationError,
  verifyCasperCep18Payment,
  verifyCasperDeployPayment,
  _extractCep18Transfer: extractCep18Transfer,
  _extractExecutionTransfers: extractExecutionTransfers,
  _extractLegacyDeployTransfer: extractLegacyDeployTransfer,
  _extractTransactionTransfer: extractTransactionTransfer,
  _executionStatus: executionStatus,
  _assertDeployHash: assertDeployHash,
  _normalizeCasperHash: normalizeCasperHash,
};
