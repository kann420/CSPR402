// Unit tests for the onboard command's wallet-name derivation. The
// helper is the load-bearing piece that fixes the "second agent reuses
// the first agent's OWS wallet" bug — the test exists to keep that
// behaviour locked in across future edits.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { onboardCommand, _deriveDefaultWalletName } from './onboard';
import { loadCards402Config } from '../config';
import { publicKeyHexFromPem } from '../lib/casper-key';

describe('deriveDefaultWalletName', () => {
  const claimA = 'c402_a1b2c3d4e5f607080910111213141516171819202122232425262728293031';
  const claimB = 'c402_ff00112233445566778899aabbccddeeff00112233445566778899aabbccdd';

  it('produces a name prefixed with cspr402-', () => {
    expect(_deriveDefaultWalletName(claimA, 'research-bot')).toMatch(/^cspr402-/);
  });

  it('includes a slugified version of the label', () => {
    expect(_deriveDefaultWalletName(claimA, 'Research Bot v2!')).toContain('research-bot-v2');
  });

  it('falls back to "agent" when the label is null', () => {
    expect(_deriveDefaultWalletName(claimA, null)).toContain('agent');
  });

  it('falls back to "agent" when the label is empty', () => {
    expect(_deriveDefaultWalletName(claimA, '')).toContain('agent');
  });

  it('produces different names for different claims — even with the same label', () => {
    const a = _deriveDefaultWalletName(claimA, 'research-bot');
    const b = _deriveDefaultWalletName(claimB, 'research-bot');
    expect(a).not.toBe(b);
  });

  it('is deterministic — same inputs always yield the same name', () => {
    expect(_deriveDefaultWalletName(claimA, 'research-bot')).toBe(
      _deriveDefaultWalletName(claimA, 'research-bot'),
    );
  });

  it('accepts a claim without the c402_ prefix', () => {
    const raw = _deriveDefaultWalletName(claimA, 'x');
    const noPrefix = _deriveDefaultWalletName(claimA.replace(/^c402_/, ''), 'x');
    expect(raw).toBe(noPrefix);
  });

  it('caps the label slug so a long label does not blow out the path', () => {
    const long = 'a'.repeat(200);
    const name = _deriveDefaultWalletName(claimA, long);
    // cspr402- + slug (<=24) + - + 8-hex = ~42 chars max
    expect(name.length).toBeLessThanOrEqual(48);
  });

  it('never contains characters unsafe for a filesystem vault path', () => {
    const name = _deriveDefaultWalletName(claimA, '../../evil/$(whoami)');
    expect(name).toMatch(/^cspr402-[a-z0-9-]+$/);
  });
});

// ── onboard auto-keygen integration ─────────────────────────────────────────
//
// Locks in the root-cause fix: `onboard --claim <code>` with no
// --casper-public-key auto-generates an Ed25519 Casper testnet keypair,
// writes the PEM (0600), and reports `state='awaiting_funding'` with a
// real wallet_public_key — the previously-unreachable "Awaiting deposit"
// stepper step. Pre-fix, a fresh agent reported `state='initializing'`
// with no wallet key and the dashboard stalled at "Claim redeemed".

const CLAIM = 'c402_a1b2c3d4e5f607080910111213141516171819202122232425262728293031';
const API_BASE = 'https://api.cspr402.xyz/v1';

let tmpHome: string;
let tmpConfigDir: string;
let tmpKeyDir: string;
let realFetch: typeof global.fetch;
let statusPosts: Array<{ body: string }>;

function jsonResponse(body: unknown) {
  return {
    ok: true,
    status: 200,
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

beforeEach(() => {
  tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'cspr402-onboard-home-'));
  tmpConfigDir = path.join(tmpHome, 'config');
  tmpKeyDir = path.join(tmpHome, 'keys');
  fs.mkdirSync(tmpConfigDir, { recursive: true });
  fs.mkdirSync(tmpKeyDir, { recursive: true });

  // Isolate config + key resolution to the tmp home.
  process.env.CSPR402_CONFIG_DIR = tmpConfigDir;
  process.env.CSPR402_KEY_DIR = tmpKeyDir;
  delete process.env.CSPR402_KEY_PATH;
  delete process.env.CARDS402_KEY_PATH;
  delete process.env.CSPR402_CASPER_PUBLIC_KEY;
  delete process.env.CSPR402_BASE_URL;
  delete process.env.CARDS402_BASE_URL;

  statusPosts = [];
  realFetch = global.fetch;
  global.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url);
    if (u.endsWith('/agent/claim')) {
      return jsonResponse({
        api_key: 'cards402_testkey',
        api_url: API_BASE,
        label: 'my-agent',
        webhook_secret: null,
      }) as unknown as Response;
    }
    if (u.endsWith('/agent/status')) {
      statusPosts.push({ body: init?.body ? String(init.body) : '' });
      return jsonResponse({ ok: true }) as unknown as Response;
    }
    throw new Error(`unexpected fetch ${u}`);
  }) as typeof global.fetch;
});

afterEach(() => {
  global.fetch = realFetch;
  try {
    fs.rmSync(tmpHome, { recursive: true, force: true });
  } catch {
    /* best effort */
  }
});

describe('onboard auto-keygen', () => {
  it('generates a keypair, writes PEM, reports awaiting_funding + wallet_public_key', async () => {
    const code = await onboardCommand(['--claim', CLAIM]);
    expect(code).toBe(0);

    // Config written with the public key + key path.
    const cfg = loadCards402Config();
    expect(cfg?.casper_public_key).toMatch(/^01[0-9a-f]{64}$/);
    expect(cfg?.casper_key_path).toBeTruthy();

    // PEM exists at the configured path, 0600 on posix.
    expect(fs.existsSync(cfg!.casper_key_path!)).toBe(true);
    if (process.platform !== 'win32') {
      const stat = fs.statSync(cfg!.casper_key_path!);
      expect(stat.mode & 0o777).toBe(0o600);
    }

    // The reported wallet_public_key matches the key derived from the PEM
    // (so the dashboard key and the on-disk signer are the same key).
    const pem = fs.readFileSync(cfg!.casper_key_path!, 'utf8');
    const derivedFromPem = publicKeyHexFromPem(pem);
    expect(cfg?.casper_public_key).toBe(derivedFromPem);

    // reportStatus was called with awaiting_funding + the real key.
    const status = statusPosts.find((p) => p.body.includes('"awaiting_funding"'));
    expect(status).toBeDefined();
    const parsed = JSON.parse(status!.body);
    expect(parsed.state).toBe('awaiting_funding');
    expect(parsed.wallet_public_key).toBe(cfg?.casper_public_key);
  });

  it('does NOT write a key file when --casper-public-key is supplied', async () => {
    const supplied = '01' + 'ab'.repeat(32); // valid Ed25519 pubkey hex
    const code = await onboardCommand(['--claim', CLAIM, '--casper-public-key', supplied]);
    expect(code).toBe(0);

    // No PEM written to the isolated key dir.
    const files = fs.readdirSync(tmpKeyDir).filter((f) => f.endsWith('.pem'));
    expect(files).toEqual([]);

    const cfg = loadCards402Config();
    expect(cfg?.casper_public_key).toBe(supplied);
    // Supplied-key path: no key-file path recorded.
    expect(cfg?.casper_key_path).toBeFalsy();

    const status = statusPosts.find((p) => p.body.includes('"awaiting_funding"'));
    expect(JSON.parse(status!.body).wallet_public_key).toBe(supplied);
  });

  it('reuses an existing PEM on re-run (idempotent — no fund stranding)', async () => {
    // First onboard generates a key.
    await onboardCommand(['--claim', CLAIM]);
    const cfg1 = loadCards402Config();
    const pem1 = fs.readFileSync(cfg1!.casper_key_path!, 'utf8');
    const pub1 = cfg1!.casper_public_key!;

    // Second onboard on the "same machine" — the PEM already exists at
    // the resolved path, so it must be reused, not overwritten.
    const filesBefore = fs.readdirSync(tmpKeyDir).filter((f) => f.endsWith('.pem'));
    const code = await onboardCommand(['--claim', CLAIM]);
    expect(code).toBe(0);

    const cfg2 = loadCards402Config();
    const pem2 = fs.readFileSync(cfg2!.casper_key_path!, 'utf8');
    expect(cfg2?.casper_public_key).toBe(pub1);
    expect(pem2).toBe(pem1);

    // No new key file was created — same single PEM.
    const filesAfter = fs.readdirSync(tmpKeyDir).filter((f) => f.endsWith('.pem'));
    expect(filesAfter).toEqual(filesBefore);
  });
});
