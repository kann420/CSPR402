// Casper testnet Ed25519 keypair generation + PEM persistence.
//
// `cspr402 onboard` calls `generateCasperEd25519Key()` to mint a fresh
// agent keypair when the operator did not supply `--casper-public-key`,
// writes the private key as a PKCS8 PEM (0600) under ~/.cspr402/keys/,
// and reports the derived public key hex (`01` + 32-byte Ed25519 pub)
// to the backend so the dashboard stepper can advance to "Awaiting
// deposit".
//
// Zero new dependencies: Node's built-in `crypto.generateKeyPairSync
// ('ed25519')` produces a standard RFC 8410 PKCS8 PEM that is
// byte-identical to what `casper-js-sdk`'s `PrivateKey.toPem()` emits,
// so the example node-agent (and any future SDK signer) can load the
// PEM via `PrivateKey.fromPem(pem, KeyAlgorithm.ED25519)` and derive
// the same public key. Verified empirically.

import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { atomicWriteFile600, ensurePrivateDir } from '../config';

/**
 * Casper public key hex: algorithm byte (`01` Ed25519 | `02` secp256k1)
 * + 32/33-byte raw public key hex. Same shape used across the SDK
 * (onboard.ts, purchase.ts, wallet.ts) and the backend
 * (env.js, app.js, casper-verify.js).
 */
export const CASPER_PUBLIC_KEY_RE = /^(01[0-9a-fA-F]{64}|02[0-9a-fA-F]{66})$/;

export interface CasperKey {
  /** PKCS8 Ed25519 private key PEM (`-----BEGIN PRIVATE KEY-----`). */
  pem: string;
  /** Casper public key hex, `01` + 32-byte Ed25519 pub hex (66 chars). */
  publicKeyHex: string;
}

/**
 * Derive the Casper public key hex from an Ed25519 public KeyObject /
 * SPKI DER. The raw 32-byte Ed25519 public key is the last 32 bytes of
 * the SPKI DER; prefix with algorithm byte `01`.
 */
function ed25519PublicKeyHex(pub: crypto.KeyObject | Buffer): string {
  const der = Buffer.isBuffer(pub) ? pub : pub.export({ type: 'spki', format: 'der' });
  const raw = der.subarray(der.length - 32);
  return '01' + raw.toString('hex');
}

/**
 * Generate a fresh Ed25519 Casper testnet keypair using Node's built-in
 * crypto. Returns the PKCS8 PEM private key + the Casper public key hex.
 * Validates the derived public key against `CASPER_PUBLIC_KEY_RE`.
 */
export function generateCasperEd25519Key(): CasperKey {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519');
  const pem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
  const publicKeyHex = ed25519PublicKeyHex(publicKey).toLowerCase();
  if (!CASPER_PUBLIC_KEY_RE.test(publicKeyHex)) {
    throw new Error(
      `Generated Casper public key ${publicKeyHex} failed validation. ` +
        `This should be impossible for a Node Ed25519 keypair — please report.`,
    );
  }
  return { pem, publicKeyHex };
}

/**
 * Re-derive the Casper public key hex from an existing PKCS8 Ed25519
 * PEM. Used by onboard's idempotency path: if a key file already exists
 * at the target path, reuse it (re-derive the public key) instead of
 * overwriting it, so funds already held by that key are not stranded.
 */
export function publicKeyHexFromPem(pem: string): string {
  const priv = crypto.createPrivateKey(pem);
  const pub = crypto.createPublicKey(priv);
  const publicKeyHex = ed25519PublicKeyHex(pub).toLowerCase();
  if (!CASPER_PUBLIC_KEY_RE.test(publicKeyHex)) {
    throw new Error(
      `Re-derived Casper public key ${publicKeyHex} failed validation. ` +
        `The PEM may not be an Ed25519 key.`,
    );
  }
  return publicKeyHex;
}

/**
 * Filesystem-safe form of the wallet name for the key filename. Keeps
 * alnum, dot, underscore, hyphen; collapses everything else to `-`;
 * falls back to `agent`. Prevents path traversal via a malicious
 * `--wallet-name`.
 */
function safeKeyFileSlug(walletName: string): string {
  const slug =
    walletName
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 64) || 'agent';
  return `${slug}_secret_key.pem`;
}

/**
 * Resolve the absolute path of the agent's Casper secret-key PEM.
 * Priority:
 *   1. `CSPR402_KEY_PATH` env — explicit full file path override
 *      (use to point at a persistent volume on serverless runtimes).
 *   2. `CSPR402_KEY_DIR` env — directory override; filename is
 *      `<wallet_name>_secret_key.pem`.
 *   3. default `~/.cspr402/keys/<wallet_name>_secret_key.pem`.
 */
export function resolveCasperKeyPath(walletName: string): string {
  const explicit = process.env.CSPR402_KEY_PATH || process.env.CARDS402_KEY_PATH;
  if (explicit) return path.resolve(explicit);
  const slug = safeKeyFileSlug(walletName);
  const dir =
    process.env.CSPR402_KEY_DIR ||
    process.env.CARDS402_KEY_DIR ||
    path.join(os.homedir(), '.cspr402', 'keys');
  return path.join(dir, slug);
}

/**
 * Write the Casper secret-key PEM atomically with 0600 permissions,
 * creating + hardening the parent directory. Returns the absolute path.
 * Does NOT overwrite an existing file at the resolved path — callers
 * must check existence first (see onboard's idempotency path) to avoid
 * stranding funds on a pre-existing key.
 */
export function writeCasperKeyFile(walletName: string, pem: string): { path: string } {
  const p = resolveCasperKeyPath(walletName);
  ensurePrivateDir(path.dirname(p));
  atomicWriteFile600(p, pem);
  return { path: p };
}

/**
 * Read a PEM from disk if it exists, else return null. Used by onboard
 * to decide whether to reuse an existing key or generate a new one.
 */
export function readCasperKeyPemIfExists(keyPath: string): string | null {
  try {
    const buf = fs.readFileSync(keyPath, 'utf8');
    return typeof buf === 'string' ? buf : null;
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw err;
  }
}
