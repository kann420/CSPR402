// Unit tests for sdk/src/lib/casper-key.ts — zero-dep Casper Ed25519
// keygen + PEM persistence.
//
// Locks in the PEM-compat invariant that lets onboard generate keys
// with Node's built-in crypto while a casper-js-sdk signer (the
// example node-agent, or a future SDK signer) loads the same PEM:
//   - generated publicKeyHex matches the Casper format `01` + 32 bytes
//   - PEM round-trips through Node crypto re-import to the same pubkey
//   - publicKeyHexFromPem agrees with generateCasperEd25519Key

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import * as crypto from 'node:crypto';
import {
  CASPER_PUBLIC_KEY_RE,
  generateCasperEd25519Key,
  publicKeyHexFromPem,
  readCasperKeyPemIfExists,
  resolveCasperKeyPath,
  writeCasperKeyFile,
} from '../lib/casper-key';

let tmpKeyDir: string;

beforeEach(() => {
  tmpKeyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cspr402-key-test-'));
  process.env.CSPR402_KEY_DIR = tmpKeyDir;
  delete process.env.CSPR402_KEY_PATH;
  delete process.env.CARDS402_KEY_PATH;
});

afterEach(() => {
  try {
    fs.rmSync(tmpKeyDir, { recursive: true, force: true });
  } catch {
    /* best effort */
  }
});

describe('generateCasperEd25519Key', () => {
  it('produces a publicKeyHex matching the Casper format', () => {
    const { publicKeyHex } = generateCasperEd25519Key();
    expect(publicKeyHex).toMatch(CASPER_PUBLIC_KEY_RE);
    expect(publicKeyHex).toMatch(/^01[0-9a-f]{64}$/);
  });

  it('produces a PKCS8 Ed25519 PEM', () => {
    const { pem } = generateCasperEd25519Key();
    expect(pem).toContain('-----BEGIN PRIVATE KEY-----');
    expect(pem).toContain('-----END PRIVATE KEY-----');
  });

  it('each call yields a distinct keypair', () => {
    const a = generateCasperEd25519Key();
    const b = generateCasperEd25519Key();
    expect(a.publicKeyHex).not.toBe(b.publicKeyHex);
    expect(a.pem).not.toBe(b.pem);
  });
});

describe('publicKeyHexFromPem (PEM round-trip)', () => {
  it('re-derives the same publicKeyHex that generate produced', () => {
    const { pem, publicKeyHex } = generateCasperEd25519Key();
    expect(publicKeyHexFromPem(pem)).toBe(publicKeyHex);
  });

  it('agrees with a direct Node crypto re-import of the PEM', () => {
    const { pem, publicKeyHex } = generateCasperEd25519Key();
    // Independent re-derivation path: load PEM, export SPKI DER, take
    // last 32 bytes (raw Ed25519 pub), prefix 01.
    const priv = crypto.createPrivateKey(pem);
    const pub = crypto.createPublicKey(priv);
    const der = pub.export({ type: 'spki', format: 'der' });
    const independent = '01' + der.subarray(der.length - 32).toString('hex');
    expect(publicKeyHexFromPem(pem)).toBe(independent);
    expect(publicKeyHex).toBe(independent);
  });
});

describe('writeCasperKeyFile / readCasperKeyPemIfExists', () => {
  it('writes the PEM to <keyDir>/<slug>_secret_key.pem and reads it back', () => {
    const { pem } = generateCasperEd25519Key();
    const { path: written } = writeCasperKeyFile('my-agent', pem);
    expect(written).toBe(resolveCasperKeyPath('my-agent'));
    expect(fs.existsSync(written)).toBe(true);
    expect(readCasperKeyPemIfExists(written)).toBe(pem);
  });

  it('writes at chmod 0600 on posix', () => {
    if (process.platform === 'win32') return;
    const { pem } = generateCasperEd25519Key();
    const { path: written } = writeCasperKeyFile('mode-agent', pem);
    const stat = fs.statSync(written);
    expect(stat.mode & 0o777).toBe(0o600);
  });

  it('returns null when the key file does not exist (no throw)', () => {
    expect(readCasperKeyPemIfExists(path.join(tmpKeyDir, 'nope.pem'))).toBeNull();
  });

  it('sanitizes a hostile wallet name into a safe filename', () => {
    const { pem } = generateCasperEd25519Key();
    const { path: written } = writeCasperKeyFile('../../evil/$(whoami)', pem);
    const base = path.basename(written);
    expect(base).toMatch(/^[a-z0-9._-]+_secret_key\.pem$/);
    // The resolved path stays inside the configured key dir (no traversal).
    expect(path.resolve(written).startsWith(path.resolve(tmpKeyDir))).toBe(true);
  });
});

describe('resolveCasperKeyPath precedence', () => {
  it('honors CSPR402_KEY_PATH (explicit file) over CSPR402_KEY_DIR', () => {
    const explicit = path.join(tmpKeyDir, 'explicit.pem');
    process.env.CSPR402_KEY_PATH = explicit;
    expect(resolveCasperKeyPath('any-agent')).toBe(path.resolve(explicit));
  });
});
