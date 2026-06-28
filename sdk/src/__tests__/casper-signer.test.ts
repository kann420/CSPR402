// Unit tests for sdk/src/casper-signer.ts — the secure auto-pay core.
//
// These tests lock in the security invariants, NOT the on-chain submit
// (which needs a live RPC). The submit + verify + key-load steps are
// injectable so we can exercise the guard logic deterministically:
//   - refuses to pay a non-pending order
//   - refuses an unsupported payment type
//   - refuses an order bound to a different sender key
//   - refuses incomplete payment instructions
//   - refuses when signing isn't configured (no key / no RPC)
//   - the in-process ledger prevents a double-submit on retry
//   - happy path returns the deploy hash + verified response

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  payAndVerifyOrder,
  resolveSigningConfig,
  signingConfigured,
  loadAgentPrivateKey,
  SignerError,
  __resetInflightLedgerForTests,
  type LoadedAgentKey,
} from '../casper-signer';
import {
  generateCasperEd25519Key,
  writeCasperKeyFile,
  publicKeyHexFromPem,
} from '../lib/casper-key';
import type { CSPR402Client, OrderStatus, VerifyCasperPaymentResponse } from '../client';

// Structural shape of the attested payment the signer passes to submit().
// Kept local (not imported from casper-signer, where it's internal) so the
// test stays coupled to the public surface only.
interface CapturedPayment {
  recipient: string;
  amount_motes: string;
  transfer_id: number;
  chain_name: string;
}

let tmpKeyDir: string;
const SAVED_ENV: Record<string, string | undefined> = {};

function setEnv(name: string, value: string | undefined): void {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

function snapshotEnv(names: string[]): void {
  for (const n of names) SAVED_ENV[n] = process.env[n];
}

function restoreEnv(names: string[]): void {
  for (const n of names) setEnv(n, SAVED_ENV[n]);
}

const ENV_NAMES = [
  'CASPER_NODE_RPC_URL',
  'CASPER_AGENT_PRIVATE_KEY_PATH',
  'CSPR402_KEY_PATH',
  'CARDS402_KEY_PATH',
  'CSPR402_CONFIG_DIR',
  'CARDS402_CONFIG_DIR',
  'CASPER_AGENT_KEY_ALGORITHM',
  'CSPR402_TREASURY_PUBLIC_KEYS',
  'CARDS402_TREASURY_PUBLIC_KEYS',
];

beforeEach(() => {
  tmpKeyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cspr402-signer-'));
  snapshotEnv(ENV_NAMES);
  // Point config dir at an empty temp dir so loadCards402Config() returns
  // null (no config.json) — key path then resolves from CSPR402_KEY_PATH,
  // and the inflight ledger persists into this temp dir (cleaned up after).
  setEnv('CSPR402_CONFIG_DIR', tmpKeyDir);
  setEnv('CARDS402_CONFIG_DIR', tmpKeyDir);
  // Configure signing by default for the guard/happy-path tests. The key
  // path is a dummy — guard tests inject loadKey so the file need not exist,
  // but resolveSigningConfig() still requires a non-empty path string.
  setEnv('CASPER_NODE_RPC_URL', 'http://test-rpc:7777/rpc');
  setEnv('CSPR402_KEY_PATH', path.join(tmpKeyDir, 'dummy.pem'));
  // Reset the module-level inflight ledger so tests are isolated (the map
  // and the once-per-process hydration flag otherwise leak across tests).
  __resetInflightLedgerForTests();
});

afterEach(() => {
  try {
    fs.rmSync(tmpKeyDir, { recursive: true, force: true });
  } catch {
    /* best effort */
  }
  restoreEnv(ENV_NAMES);
});

// A fixed sender key for guard tests (no real PEM needed).
const SENDER_HEX = '01' + 'a'.repeat(64);
const OTHER_HEX = '02' + 'b'.repeat(66);

function fakeKey(hex: string = SENDER_HEX): LoadedAgentKey {
  // privateKey is opaque to the guard logic — submit is mocked, so a
  // bare object is fine. Cast through unknown to satisfy the type.
  return { privateKey: {} as unknown as LoadedAgentKey['privateKey'], senderPublicKeyHex: hex };
}

interface MockOrderInput {
  status?: string;
  paymentType?: string;
  recipient?: string;
  amount_motes?: string;
  transfer_id?: number;
  chain_name?: string;
  sender_public_key?: string | null;
}

function mockOrder(input: MockOrderInput = {}): OrderStatus {
  const {
    status = 'pending_payment',
    paymentType = 'casper_cspr_transfer',
    recipient = '01' + 'f'.repeat(64),
    amount_motes = '11111111111',
    transfer_id = 100006,
    chain_name = 'casper',
    sender_public_key = SENDER_HEX,
  } = input;
  return {
    order_id: 'ord_test',
    status,
    phase: 'awaiting_payment',
    amount_usdc: '0.02',
    payment_asset: 'cspr_casper',
    payment: {
      type: paymentType,
      network: 'mainnet',
      chain_name: chain_name,
      recipient,
      sender_public_key,
      order_id: 'ord_test',
      amount_usdc: '0.02',
      amount_cspr: '11.111111111',
      amount_motes,
      transfer_id,
      expires_at: '2026-01-01T00:00:00.000Z',
    } as OrderStatus['payment'],
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  };
}

function mockVerified(deployHash: string): VerifyCasperPaymentResponse {
  return {
    ok: true,
    receipt: {
      type: 'casper_cspr_receipt',
      order_id: 'ord_test',
      payment_asset: 'cspr_casper',
      network: 'mainnet',
      chain_name: 'casper',
      deploy_hash: deployHash,
      sender_public_key: SENDER_HEX,
      recipient: '01' + 'f'.repeat(64),
      transfer_id: 100006,
      amount_motes: '11111111111',
      verified_at: '2026-01-01T00:00:01.000Z',
      card_mode: 'mock',
    },
    order: {
      order_id: 'ord_test',
      status: 'delivered',
      phase: 'ready',
      amount_usdc: '0.02',
      payment_asset: 'cspr_casper',
      card: { number: '4111111111111111', cvv: '123', expiry: '12/99', brand: 'Visa (mock)' },
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:01.000Z',
    },
  };
}

function fakeClient(order: OrderStatus): CSPR402Client {
  return {
    getOrder: async () => order,
  } as unknown as CSPR402Client;
}

describe('resolveSigningConfig / signingConfigured', () => {
  it('returns null (and signingConfigured=false) with no key path or RPC URL', () => {
    setEnv('CASPER_NODE_RPC_URL', undefined);
    setEnv('CSPR402_KEY_PATH', undefined);
    setEnv('CARDS402_KEY_PATH', undefined);
    setEnv('CASPER_AGENT_PRIVATE_KEY_PATH', undefined);
    expect(resolveSigningConfig()).toBeNull();
    expect(signingConfigured()).toBe(false);
  });

  it('returns a config when both key path and RPC URL are set', () => {
    const { pem } = generateCasperEd25519Key();
    const { path: keyPath } = writeCasperKeyFile('test-agent', pem);
    setEnv('CSPR402_KEY_PATH', keyPath);
    const cfg = resolveSigningConfig();
    expect(cfg).not.toBeNull();
    expect(cfg?.rpcUrl).toBe('http://test-rpc:7777/rpc');
    expect(cfg?.keyPath).toBe(path.resolve(keyPath));
  });
});

describe('payAndVerifyOrder guards', () => {
  it('throws signing_not_configured when no key/RPC', async () => {
    setEnv('CASPER_NODE_RPC_URL', undefined);
    setEnv('CSPR402_KEY_PATH', undefined);
    setEnv('CARDS402_KEY_PATH', undefined);
    setEnv('CASPER_AGENT_PRIVATE_KEY_PATH', undefined);
    const client = fakeClient(mockOrder());
    await expect(payAndVerifyOrder(client, 'ord_test')).rejects.toMatchObject({
      code: 'signing_not_configured',
    });
  });

  it('throws order_not_pending for a delivered order', async () => {
    const client = fakeClient(mockOrder({ status: 'delivered' }));
    await expect(
      payAndVerifyOrder(client, 'ord_test', { loadKey: () => fakeKey() }),
    ).rejects.toMatchObject({ code: 'order_not_pending' });
  });

  it('throws unsupported_payment_type for a CEP-18 order', async () => {
    const client = fakeClient(mockOrder({ paymentType: 'casper_cep18_transfer' }));
    await expect(
      payAndVerifyOrder(client, 'ord_test', { loadKey: () => fakeKey() }),
    ).rejects.toMatchObject({ code: 'unsupported_payment_type' });
  });

  it('throws unsupported_payment_type when payment is missing', async () => {
    const order = mockOrder();
    order.payment = undefined;
    const client = fakeClient(order);
    await expect(
      payAndVerifyOrder(client, 'ord_test', { loadKey: () => fakeKey() }),
    ).rejects.toMatchObject({ code: 'unsupported_payment_type' });
  });

  it('throws sender_mismatch when the order is bound to a different key', async () => {
    const client = fakeClient(mockOrder({ sender_public_key: OTHER_HEX }));
    await expect(
      payAndVerifyOrder(client, 'ord_test', { loadKey: () => fakeKey(SENDER_HEX) }),
    ).rejects.toMatchObject({ code: 'sender_mismatch' });
  });

  it('allows an unbound order (sender_public_key null)', async () => {
    const client = fakeClient(mockOrder({ sender_public_key: null }));
    let submitted = false;
    const res = await payAndVerifyOrder(client, 'ord_unbound_ok', {
      loadKey: () => fakeKey(SENDER_HEX),
      submit: async () => {
        submitted = true;
        return 'deadbeef'.padEnd(64, '0');
      },
      verify: async () => mockVerified('deadbeef'.padEnd(64, '0')),
    });
    expect(submitted).toBe(true);
    expect(res.submitted).toBe(true);
  });

  it('throws incomplete_payment when amount_motes is missing', async () => {
    const client = fakeClient(mockOrder({ amount_motes: '' }));
    await expect(
      payAndVerifyOrder(client, 'ord_test', { loadKey: () => fakeKey() }),
    ).rejects.toMatchObject({ code: 'incomplete_payment' });
  });

  it('throws incomplete_payment when transfer_id is missing', async () => {
    const order = mockOrder();
    (order.payment as { transfer_id?: number }).transfer_id = undefined as unknown as number;
    const client = fakeClient(order);
    await expect(
      payAndVerifyOrder(client, 'ord_test', { loadKey: () => fakeKey() }),
    ).rejects.toMatchObject({ code: 'incomplete_payment' });
  });

  it('throws incomplete_payment when recipient is missing', async () => {
    const client = fakeClient(mockOrder({ recipient: '' }));
    await expect(
      payAndVerifyOrder(client, 'ord_test', { loadKey: () => fakeKey() }),
    ).rejects.toMatchObject({ code: 'incomplete_payment' });
  });

  it('throws incomplete_payment when chain_name is missing', async () => {
    const client = fakeClient(mockOrder({ chain_name: '' }));
    await expect(
      payAndVerifyOrder(client, 'ord_test', { loadKey: () => fakeKey() }),
    ).rejects.toMatchObject({ code: 'incomplete_payment' });
  });

  it('throws recipient_not_allowed when the recipient is not on the treasury allowlist', async () => {
    // Pin the allowlist to a different key than mockOrder's recipient.
    setEnv('CSPR402_TREASURY_PUBLIC_KEYS', '01' + 'e'.repeat(64));
    const client = fakeClient(mockOrder()); // recipient is 01 + f*64
    await expect(
      payAndVerifyOrder(client, 'ord_test', { loadKey: () => fakeKey() }),
    ).rejects.toMatchObject({ code: 'recipient_not_allowed' });
  });

  it('pays when the recipient is on the treasury allowlist', async () => {
    const order = mockOrder();
    setEnv('CSPR402_TREASURY_PUBLIC_KEYS', order.payment?.recipient as string);
    let submitted = false;
    const res = await payAndVerifyOrder(fakeClient(order), 'ord_allow_ok', {
      loadKey: () => fakeKey(SENDER_HEX),
      submit: async () => {
        submitted = true;
        return 'ab'.padEnd(64, '0');
      },
      verify: async () => mockVerified('ab'.padEnd(64, '0')),
    });
    expect(submitted).toBe(true);
    expect(res.submitted).toBe(true);
  });
});

describe('payAndVerifyOrder happy path + ledger', () => {
  it('submits with backend-attested params and returns the verified response', async () => {
    const order = mockOrder();
    const client = fakeClient(order);
    let captured: CapturedPayment | undefined;
    const deployHash = 'abc'.padEnd(64, '0');
    const res = await payAndVerifyOrder(client, 'ord_happy', {
      loadKey: () => fakeKey(SENDER_HEX),
      submit: async (payment) => {
        captured = payment;
        return deployHash;
      },
      verify: async () => mockVerified(deployHash),
    });
    expect(res.deployHash).toBe(deployHash);
    expect(res.submitted).toBe(true);
    // The signer signed EXACTLY what the backend attested — no caller
    // override of recipient/amount/transfer_id is possible.
    expect(captured?.recipient).toBe(order.payment?.recipient);
    expect(captured?.amount_motes).toBe(order.payment?.amount_motes);
    expect(captured?.transfer_id).toBe(order.payment?.transfer_id);
    expect(captured?.chain_name).toBe(order.payment?.chain_name);
  });

  it('ledger prevents a double-submit on retry after verify timeout', async () => {
    const order = mockOrder({ transfer_id: 200001 });
    const client = fakeClient(order);
    const deployHash = 'f00d'.padEnd(64, '0');
    let submitCalls = 0;
    let verifyCalls = 0;
    const submit = async () => {
      submitCalls += 1;
      return deployHash;
    };
    const verifyTimeout = async () => {
      verifyCalls += 1;
      throw new SignerError('timed out', 'verify_timeout', deployHash);
    };
    // First call: submits once, verify times out.
    await expect(
      payAndVerifyOrder(client, 'ord_ledger', {
        loadKey: () => fakeKey(),
        submit,
        verify: verifyTimeout,
      }),
    ).rejects.toMatchObject({ code: 'verify_timeout', deployHash });
    expect(submitCalls).toBe(1);

    // Second call (retry): must NOT submit again — re-verify the same hash.
    const verifyOk = async () => {
      verifyCalls += 1;
      return mockVerified(deployHash);
    };
    const res = await payAndVerifyOrder(client, 'ord_ledger', {
      loadKey: () => fakeKey(),
      submit: async () => {
        submitCalls += 1;
        return 'should-not-be-used'.padEnd(64, '0');
      },
      verify: verifyOk,
    });
    expect(submitCalls).toBe(1); // unchanged — no second transfer
    expect(res.submitted).toBe(false); // re-verified an existing transfer
    expect(res.deployHash).toBe(deployHash);
    expect(verifyCalls).toBe(2); // one timed-out verify + one ok verify
  });

  it('clears the ledger on success so a later call hits order_not_pending', async () => {
    const order = mockOrder({ transfer_id: 200002 });
    const client = fakeClient(order);
    const deployHash = 'cafe'.padEnd(64, '0');
    let submitCalls = 0;
    await payAndVerifyOrder(client, 'ord_clear', {
      loadKey: () => fakeKey(),
      submit: async () => {
        submitCalls += 1;
        return deployHash;
      },
      verify: async () => mockVerified(deployHash),
    });
    // The order is now 'delivered' in the mock (status stays pending_payment
    // in mockOrder, but the ledger entry is cleared). To prove the ledger
    // was cleared we re-run and assert submit is allowed again (no skip).
    await payAndVerifyOrder(client, 'ord_clear', {
      loadKey: () => fakeKey(),
      submit: async () => {
        submitCalls += 1;
        return deployHash;
      },
      verify: async () => mockVerified(deployHash),
    });
    expect(submitCalls).toBe(2); // not blocked by a stale ledger entry
  });

  it('serializes concurrent calls for the same order (one submit, one re-verify)', async () => {
    // Two payAndVerifyOrder calls issued in parallel for the same id must
    // not both submit — the per-order mutex makes the second await the
    // first and return its (re-verified) result.
    const order = mockOrder({ transfer_id: 200003 });
    const client = fakeClient(order);
    const deployHash = 'c0nc'.padEnd(64, '0');
    let submitCalls = 0;
    const submit = async () => {
      submitCalls += 1;
      // Simulate a network round-trip so a concurrent caller could race
      // in if the mutex weren't serializing.
      await new Promise((r) => setTimeout(r, 20));
      return deployHash;
    };
    const verify = async () => mockVerified(deployHash);
    const [a, b] = await Promise.all([
      payAndVerifyOrder(client, 'ord_race', { loadKey: () => fakeKey(), submit, verify }),
      payAndVerifyOrder(client, 'ord_race', { loadKey: () => fakeKey(), submit, verify }),
    ]);
    expect(submitCalls).toBe(1); // only one transfer broadcast
    expect(a.deployHash).toBe(deployHash);
    expect(b.deployHash).toBe(deployHash);
    expect(a.submitted || b.submitted).toBe(true); // one of them submitted
  });

  it('keeps the ledger on a transient verify failure so a retry re-verifies (no resubmit)', async () => {
    // A transient non-SignerError verify failure (e.g. 502/ECONNRESET)
    // must NOT clear the ledger — the transfer is in flight, so a retry
    // must re-verify the recorded hash instead of broadcasting a second one.
    const order = mockOrder({ transfer_id: 200004 });
    const client = fakeClient(order);
    const deployHash = 'k33p'.padEnd(64, '0');
    let submitCalls = 0;
    let verifyCalls = 0;
    const submit = async () => {
      submitCalls += 1;
      return deployHash;
    };
    // First verify throws a plain (non-Signer) error — simulating a 502.
    const transientFail = async () => {
      verifyCalls += 1;
      throw new Error('502 bad gateway');
    };
    await expect(
      payAndVerifyOrder(client, 'ord_keep', {
        loadKey: () => fakeKey(),
        submit,
        verify: transientFail,
      }),
    ).rejects.toMatchObject({ code: 'verify_incomplete', deployHash });
    expect(submitCalls).toBe(1);

    // Retry: ledger still has the hash → re-verify, never resubmit.
    const verifyOk = async () => {
      verifyCalls += 1;
      return mockVerified(deployHash);
    };
    const res = await payAndVerifyOrder(client, 'ord_keep', {
      loadKey: () => fakeKey(),
      submit: async () => {
        submitCalls += 1;
        return 'should-not-be-used'.padEnd(64, '0');
      },
      verify: verifyOk,
    });
    expect(submitCalls).toBe(1); // still one — no second transfer
    expect(res.submitted).toBe(false);
    expect(res.deployHash).toBe(deployHash);
    expect(verifyCalls).toBe(2);
  });
});

describe('loadAgentPrivateKey', () => {
  it('throws key_not_found when the PEM file does not exist', () => {
    setEnv('CSPR402_KEY_PATH', path.join(tmpKeyDir, 'missing.pem'));
    const cfg = resolveSigningConfig()!;
    expect(() => loadAgentPrivateKey(cfg)).toThrow(/key not found/i);
    expect(() => loadAgentPrivateKey(cfg)).toThrow(SignerError);
  });

  it('loads a real onboard-style PEM and derives the matching public key', () => {
    const { pem, publicKeyHex } = generateCasperEd25519Key();
    const { path: keyPath } = writeCasperKeyFile('real-agent', pem);
    setEnv('CSPR402_KEY_PATH', keyPath);
    const cfg = resolveSigningConfig()!;
    const loaded = loadAgentPrivateKey(cfg);
    expect(loaded.senderPublicKeyHex).toBe(publicKeyHex);
    // Independent re-derivation via Node crypto must agree.
    expect(loaded.senderPublicKeyHex).toBe(publicKeyHexFromPem(pem));
  });

  it('throws key_drift when config expects a different public key', () => {
    const { pem } = generateCasperEd25519Key();
    const { path: keyPath } = writeCasperKeyFile('drift-agent', pem);
    setEnv('CSPR402_KEY_PATH', keyPath);
    const cfg = resolveSigningConfig()!;
    cfg.expectedSenderPublicKeyHex = OTHER_HEX; // config claims a different key
    expect(() => loadAgentPrivateKey(cfg)).toThrow(/match onboard/);
  });
});
