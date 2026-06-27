// @ts-check
// Simulated per-order virtual card generator.
//
// CSPR402's card-fulfillment path is simulated (not a real bank-issued,
// spendable card) — the real value of the demo is the on-chain Casper
// payment + deploy verification. The original cards402 fork hard-coded a
// single shared `4242…` card for every order, which is not credible when
// each agent should receive its OWN card. This module generates a fresh,
// unique, Luhn-valid Visa-format card per call so each fulfilled order
// gets a distinct PAN/CVV/expiry.
//
// IMPORTANT: these cards are SIMULATED demo artifacts. They pass Luhn and
// carry a Visa-pattern PAN, but they are not issued by any bank, are not
// routed through any card network, and cannot be spent at merchants. The
// cardholder agreement + privacy pages state this. Real spendable virtual
// cards require an issuer partnership (Pathward/ctx.com, Lithic, Stripe
// Issuing, …) + KYC — out of scope for the MVP.
//
// Uniqueness: 15 random digits + a Luhn check digit gives 10^14 possible
// PANs — collision probability is negligible for any realistic order
// volume, and idempotency does NOT depend on uniqueness anyway: a
// re-verify of an already-delivered order returns the card already
// persisted in the orders row (orders.js `already_verified` path), so
// the generator only ever runs once per order.

const VIRTUAL_CARD_BRAND = 'CSPR402 Virtual Card';

/**
 * Compute the Luhn check digit for the leading digits of a PAN.
 * `partial` is every digit EXCEPT the check digit (i.e. the leftmost
 * length-1 digits). The check digit is the rightmost digit of the full
 * PAN, which is NOT doubled; the partial digits, read right-to-left,
 * sit at positions 1,2,3,… from the check digit and are doubled on
 * odd positions — matching `luhnValid` below.
 * @param {string} partial — digits only
 * @returns {string} single check digit
 */
function luhnCheckDigit(partial) {
  let sum = 0;
  for (let i = partial.length - 1, pos = 1; i >= 0; i--, pos++) {
    let d = partial.charCodeAt(i) - 48;
    if (pos % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return String((10 - (sum % 10)) % 10);
}

/**
 * Validate a full PAN with the Luhn algorithm.
 * @param {string} pan — digits only, 13–19 chars
 * @returns {boolean}
 */
function luhnValid(pan) {
  if (!/^\d{13,19}$/.test(pan)) return false;
  let sum = 0;
  for (let i = pan.length - 1, pos = 0; i >= 0; i--, pos++) {
    let d = pan.charCodeAt(i) - 48;
    if (pos % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return sum % 10 === 0;
}

/**
 * @param {number} n — count of random digits
 * @returns {string} n decimal digits
 */
function randomDigits(n) {
  let s = '';
  for (let i = 0; i < n; i++) s += Math.floor(Math.random() * 10).toString();
  return s;
}

/**
 * Generate a fresh simulated virtual card. Each call returns a distinct
 * Luhn-valid 16-digit Visa-pattern PAN, a 3-digit CVV, and an expiry
 * ~3 years in the future.
 *
 * @returns {{ number: string, cvv: string, expiry: string, brand: string }}
 */
function generateVirtualCard() {
  // Visa-pattern PAN: leading '4' + 14 random digits + Luhn check digit.
  const partial = '4' + randomDigits(14);
  const number = partial + luhnCheckDigit(partial);
  // 3-digit CVV (Visa). 100–999 keeps it always 3 digits.
  const cvv = String(100 + Math.floor(Math.random() * 900));
  // Expiry: current month, ~3 years forward — always clearly in the future.
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const year = String((now.getFullYear() + 3) % 100).padStart(2, '0');
  return {
    number,
    cvv,
    expiry: `${month}/${year}`,
    brand: VIRTUAL_CARD_BRAND,
  };
}

module.exports = {
  generateVirtualCard,
  luhnValid,
  luhnCheckDigit,
  VIRTUAL_CARD_BRAND,
};
