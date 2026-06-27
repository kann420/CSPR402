// Unit tests for lib/virtual-card — the per-order simulated virtual card
// generator. Replaces the old single shared `4242…` card with a fresh,
// unique, Luhn-valid Visa-pattern card per fulfilled order.
//
// These cards are SIMULATED demo artifacts (not real bank-issued / not
// spendable). The guarantees that matter here: each call yields a distinct
// 16-digit Luhn-valid PAN, a 3-digit CVV, a future MM/YY expiry, and the
// CSPR402 project brand.

require('../helpers/env');

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  generateVirtualCard,
  luhnValid,
  luhnCheckDigit,
  VIRTUAL_CARD_BRAND,
} = require('../../src/lib/virtual-card');

describe('luhnValid / luhnCheckDigit', () => {
  it('validates the canonical Stripe test PAN and rejects a corrupted one', () => {
    assert.equal(luhnValid('4242424242424242'), true);
    assert.equal(luhnValid('4111111111111111'), true);
    assert.equal(luhnValid('4242424242424243'), false);
    assert.equal(luhnValid('4242'), false); // too short
    assert.equal(luhnValid('424242424242424a'), false); // non-digit
  });

  it('luhnCheckDigit produces a check digit that makes luhnValid true', () => {
    const partial = '400000000000000'; // 15 digits
    const check = luhnCheckDigit(partial);
    assert.match(check, /^\d$/);
    assert.equal(luhnValid(partial + check), true);
  });
});

describe('generateVirtualCard', () => {
  it('returns a 16-digit Visa-pattern PAN that passes Luhn', () => {
    const card = generateVirtualCard();
    assert.match(card.number, /^4\d{15}$/);
    assert.equal(luhnValid(card.number), true);
  });

  it('returns a 3-digit CVV and a future MM/YY expiry', () => {
    const card = generateVirtualCard();
    assert.match(card.cvv, /^\d{3}$/);
    assert.match(card.expiry, /^(0[1-9]|1[0-2])\/\d{2}$/);
    // Expiry is ~3 years ahead of the current month.
    const [mm, yy] = card.expiry.split('/').map(Number);
    const now = new Date();
    const expiryYear = 2000 + yy;
    const expiryMonth = mm;
    const nowTotal = now.getFullYear() * 12 + now.getMonth();
    const expiryTotal = expiryYear * 12 + (expiryMonth - 1);
    assert.ok(
      expiryTotal - nowTotal >= 12 * 2,
      `expiry ${card.expiry} should be at least ~2 years in the future`,
    );
  });

  it('uses the CSPR402 project brand', () => {
    const card = generateVirtualCard();
    assert.equal(card.brand, VIRTUAL_CARD_BRAND);
    assert.equal(card.brand, 'CSPR402 Virtual Card');
  });

  it('generates a distinct PAN on each call (uniqueness across orders)', () => {
    const pans = new Set();
    for (let i = 0; i < 200; i++) {
      pans.add(generateVirtualCard().number);
    }
    // 200 distinct 16-digit Luhn-valid PANs — collisions are astronomically
    // unlikely (10^14 space). A collision here would indicate a broken RNG.
    assert.equal(pans.size, 200);
  });

  it('every PAN in a large batch passes Luhn (not just the first)', () => {
    for (let i = 0; i < 500; i++) {
      assert.equal(luhnValid(generateVirtualCard().number), true);
    }
  });
});
