// Unit tests for the auth.js route-level token extraction.
//
// F1-auth-routes (2026-04-16): /auth/logout and /auth/me extract the
// Bearer token themselves (they bypass the requireAuth middleware).
// Pre-fix they had the same two bugs that requireAuth had before
// F1/F2-requireAuth:
//   (1) Array-valued Authorization header → 500 (arrays have no .replace)
//   (2) Trailing whitespace preserved → session lookup misses → silent
//       logout failure or phantom 401 on /auth/me
//
// These tests exercise the routes end-to-end via supertest.

require('../helpers/env');

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { PrivateKey, KeyAlgorithm, byteHash } = require('casper-js-sdk');
const { request, db, createTestSession, resetDb } = require('../helpers/app');

// ── /auth/me ────────────────────────────────────────────────────────────────

describe('F1-auth-routes: /auth/me token handling', () => {
  let token;

  beforeEach(() => {
    resetDb();
    const session = createTestSession({ email: 'test@cards402.com' });
    token = session.token;
  });

  it('returns user for a valid Bearer token', async () => {
    const res = await request.get('/auth/me').set('Authorization', `Bearer ${token}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.user.email, 'test@cards402.com');
  });

  it('accepts a token with trailing whitespace (F1 trim fix)', async () => {
    // Pre-fix: trailing space → hashToken mismatch → 401.
    const res = await request.get('/auth/me').set('Authorization', `Bearer ${token}  `);
    assert.equal(res.status, 200, 'trailing whitespace must not prevent session lookup');
    assert.equal(res.body.user.email, 'test@cards402.com');
  });

  it('accepts a token with trailing tab and newline', async () => {
    const res = await request.get('/auth/me').set('Authorization', `Bearer ${token}\t`);
    assert.equal(res.status, 200);
  });

  it('401 when Authorization header is missing', async () => {
    const res = await request.get('/auth/me');
    assert.equal(res.status, 401);
  });

  it('401 when token is invalid (not a real session)', async () => {
    const res = await request.get('/auth/me').set('Authorization', 'Bearer totallywrongtokenabc');
    assert.equal(res.status, 401);
  });

  it('does NOT crash on a non-string Authorization header value', async () => {
    // supertest doesn't let us set a numeric Authorization header, but
    // we can set a value that would NOT match the Bearer regex. The
    // important thing is it doesn't crash to 500.
    const res = await request.get('/auth/me').set('Authorization', 'NotBearer');
    assert.equal(res.status, 401);
  });

  it('401 when Bearer prefix is present but token is empty after strip', async () => {
    const res = await request.get('/auth/me').set('Authorization', 'Bearer   ');
    assert.equal(res.status, 401);
  });
});

// ── /auth/logout ────────────────────────────────────────────────────────────

describe('F1-auth-routes: /auth/logout token handling', () => {
  let token;

  beforeEach(() => {
    resetDb();
    const session = createTestSession({ email: 'test@cards402.com' });
    token = session.token;
  });

  it('deletes the session for a valid Bearer token', async () => {
    const res = await request.post('/auth/logout').set('Authorization', `Bearer ${token}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
    // Session should be gone.
    const meRes = await request.get('/auth/me').set('Authorization', `Bearer ${token}`);
    assert.equal(meRes.status, 401, 'session should be deleted after logout');
  });

  it('deletes the session even when token has trailing whitespace (F1 trim fix)', async () => {
    // Pre-fix: trailing space → hashToken mismatch → session NOT deleted.
    const res = await request.post('/auth/logout').set('Authorization', `Bearer ${token} `);
    assert.equal(res.status, 200);
    // Verify the session is actually gone.
    const meRes = await request.get('/auth/me').set('Authorization', `Bearer ${token}`);
    assert.equal(meRes.status, 401, 'session should be deleted despite trailing whitespace');
  });

  it('returns ok: true even when no Authorization header is sent (idempotent)', async () => {
    const res = await request.post('/auth/logout');
    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
  });

  it('does NOT crash on a non-Bearer Authorization value', async () => {
    const res = await request.post('/auth/logout').set('Authorization', 'Basic abc');
    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
  });

  it('does NOT crash when Bearer token is whitespace-only', async () => {
    const res = await request.post('/auth/logout').set('Authorization', 'Bearer   \t  ');
    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
  });
});

describe('wallet auth signature verification', () => {
  beforeEach(() => {
    resetDb();
  });

  it('accepts a Casper Wallet signMessage signature over raw Casper-prefixed message bytes', async () => {
    const key = PrivateKey.generate(KeyAlgorithm.ED25519);
    const publicKey = key.publicKey.toHex().toLowerCase();
    const challenge = await request
      .post('/auth/wallet/challenge')
      .send({ public_key: publicKey, domain: 'localhost:3000' });
    assert.equal(challenge.status, 200);

    const payload = Buffer.from(`Casper Message:\n${challenge.body.message}`, 'utf8');
    const signatureHex = Buffer.from(key.signAndAddAlgorithmBytes(payload)).toString('hex');
    const verify = await request.post('/auth/wallet/verify').send({
      public_key: publicKey,
      nonce: challenge.body.nonce,
      signature_hex: signatureHex,
    });

    assert.equal(verify.status, 200);
    assert.equal(verify.body.user.wallet_public_key, publicKey);
    assert.equal(typeof verify.body.token, 'string');
  });

  it('accepts a Ledger-style signature over the Blake2b digest of the Casper-prefixed message', async () => {
    const key = PrivateKey.generate(KeyAlgorithm.ED25519);
    const publicKey = key.publicKey.toHex().toLowerCase();
    const challenge = await request
      .post('/auth/wallet/challenge')
      .send({ public_key: publicKey, domain: 'localhost:3000' });
    assert.equal(challenge.status, 200);

    const digest = byteHash(Buffer.from(`Casper Message:\n${challenge.body.message}`, 'utf8'));
    const signatureHex = Buffer.from(key.signAndAddAlgorithmBytes(digest)).toString('hex');
    const verify = await request.post('/auth/wallet/verify').send({
      public_key: publicKey,
      nonce: challenge.body.nonce,
      signature_hex: signatureHex,
    });

    assert.equal(verify.status, 200);
  });

  it('accepts a raw 64-byte Casper message signature by adding the public-key algorithm byte', async () => {
    const key = PrivateKey.generate(KeyAlgorithm.ED25519);
    const publicKey = key.publicKey.toHex().toLowerCase();
    const challenge = await request
      .post('/auth/wallet/challenge')
      .send({ public_key: publicKey, domain: 'localhost:3000' });
    assert.equal(challenge.status, 200);

    const digest = byteHash(Buffer.from(`Casper Message:\n${challenge.body.message}`, 'utf8'));
    const signatureHex = Buffer.from(key.sign(digest)).toString('hex');
    const verify = await request.post('/auth/wallet/verify').send({
      public_key: publicKey,
      nonce: challenge.body.nonce,
      signature_hex: signatureHex,
    });

    assert.equal(verify.status, 200);
  });

  it('accepts a secp256k1 signMessage signature with a trailing recovery byte', async () => {
    const key = PrivateKey.generate(KeyAlgorithm.SECP256K1);
    const publicKey = key.publicKey.toHex().toLowerCase();
    const challenge = await request
      .post('/auth/wallet/challenge')
      .send({ public_key: publicKey, domain: 'localhost:3000' });
    assert.equal(challenge.status, 200);

    const digest = Buffer.from(`Casper Message:\n${challenge.body.message}`, 'utf8');
    const compactSignatureWithRecoveryByte = Buffer.concat([
      Buffer.from(key.sign(digest)),
      Buffer.from([0]),
    ]);
    const verify = await request.post('/auth/wallet/verify').send({
      public_key: publicKey,
      nonce: challenge.body.nonce,
      signature_hex: compactSignatureWithRecoveryByte.toString('hex'),
    });

    assert.equal(verify.status, 200);
  });

  it('keeps accepting providers that sign the raw challenge message bytes', async () => {
    const key = PrivateKey.generate(KeyAlgorithm.ED25519);
    const publicKey = key.publicKey.toHex().toLowerCase();
    const challenge = await request
      .post('/auth/wallet/challenge')
      .send({ public_key: publicKey, domain: 'localhost:3000' });
    assert.equal(challenge.status, 200);

    const signatureHex = Buffer.from(
      key.signAndAddAlgorithmBytes(Buffer.from(challenge.body.message, 'utf8')),
    ).toString('hex');
    const verify = await request.post('/auth/wallet/verify').send({
      public_key: publicKey,
      nonce: challenge.body.nonce,
      signature_hex: signatureHex,
    });

    assert.equal(verify.status, 200);
  });
});
