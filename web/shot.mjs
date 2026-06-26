// Text-based structural verification for the landing page.
//
// No screenshots — this CLI can't reliably render PNGs back to the user,
// so instead we load the page in Playwright and assert on the things that
// actually matter for a redesign: copy, layout metrics, no overflow, no
// console/page/network errors, and the hero card content. Output is a
// plain-text report printed to stdout; exit code is non-zero on any
// failure so it can gate CI / a pre-commit check.
//
//   node shot.mjs                 # http://localhost:3000
//   BASE_URL=http://localhost:3001 node shot.mjs

import { chromium } from 'playwright-core';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000/';

// Text that must appear somewhere in the rendered DOM. Kept in sync with
// web/app/page.tsx + components/HeroCard.tsx — if the copy changes, update
// here too so a silent content regression fails the check.
const REQUIRED_TEXT = [
  'Casper testnet · verified card payments',
  'One Casper transfer.',
  'One verified card.',
  'AI agents need to spend money',
  'Open Dashboard',
  'Read the quickstart',
  'How it works',
  'Pay on Casper. Verify on Casper. Get a card.',
  'Create order',
  'Send CSPR',
  'Verify deploy',
  'Card delivered',
  'Rail',
  'Verify',
  'Settlement',
  'Secrets',
  'Stop hand-reconciling agent payments.',
  'Read the API docs',
  'Check status',
  // Hero card face
  'x402',
  'Casper',
  'Available',
  '$420.69',
  '6969 4200 6969 4242',
  'AI AGENT',
  'VISA · 12/29',
];

const VIEWPORTS = [
  { name: 'desktop', width: 1280, height: 900 },
  { name: 'mobile', width: 390, height: 844 },
];

function fmt(ok, label, detail = '') {
  const mark = ok ? 'PASS' : 'FAIL';
  const line = `  [${mark}] ${label}${detail ? ` — ${detail}` : ''}`;
  if (!ok) process.exitCode = 1;
  return line;
}

async function verifyViewport(browser, vp) {
  const lines = [`\n== ${vp.name} (${vp.width}x${vp.height}) ==`];
  const context = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();

  const consoleErrors = [];
  const pageErrors = [];
  const failedRequests = [];
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text());
  });
  page.on('pageerror', (e) => pageErrors.push(e.message));
  page.on('response', (r) => {
    const status = r.status();
    if (status >= 400) failedRequests.push(`${status} ${r.url()}`);
  });

  let resp;
  try {
    resp = await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 30000 });
  } catch (e) {
    lines.push(fmt(false, 'page load', e.message));
    await context.close();
    return lines;
  }
  lines.push(fmt(!!resp && resp.ok(), 'page load', resp ? `HTTP ${resp.status()}` : 'no response'));

  // Let the card intro / load-in animations settle so the card content is
  // in its final state before we assert on it.
  await page.waitForTimeout(2500);

  // innerText (not textContent) so display:none copy is correctly treated as
  // absent — but lowercased on both sides because several targets live in
  // `type-eyebrow` / card-label elements with `text-transform: uppercase`,
  // which innerText returns as ALL-CAPS.
  const bodyText = (await page.evaluate(() => document.body.innerText)).toLowerCase();

  // --- Content checks -----------------------------------------------------
  const missing = REQUIRED_TEXT.filter((t) => !bodyText.includes(t.toLowerCase()));
  lines.push(
    fmt(
      missing.length === 0,
      'required copy present',
      missing.length
        ? `missing: ${missing.map((t) => `"${t}"`).join(', ')}`
        : `${REQUIRED_TEXT.length} strings found`,
    ),
  );

  // --- Hero is centered ---------------------------------------------------
  // The hero column is maxWidth 820 + margin auto + textAlign center, so the
  // H1's horizontal midpoint should land near the viewport center.
  const h1Box = await page.locator('h1.type-display').first().boundingBox();
  if (h1Box) {
    const h1Center = h1Box.x + h1Box.width / 2;
    const drift = Math.abs(h1Center - vp.width / 2);
    lines.push(
      fmt(
        drift <= 8,
        'hero H1 centered',
        `midpoint drift ${drift.toFixed(1)}px from viewport center`,
      ),
    );
  } else {
    lines.push(fmt(false, 'hero H1 centered', 'h1.type-display not found'));
  }

  // --- Hero card rendered with non-zero size ------------------------------
  const card = page.locator('.hc-card').first();
  const cardBox = await card.boundingBox();
  lines.push(
    fmt(
      !!cardBox && cardBox.width > 100 && cardBox.height > 60,
      'hero card has size',
      cardBox ? `${Math.round(cardBox.width)}x${Math.round(cardBox.height)}` : 'not found',
    ),
  );

  // --- H1 computed font-size falls inside the clamp range -----------------
  const h1Size = await page
    .locator('h1.type-display')
    .first()
    .evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  lines.push(fmt(h1Size >= 20 && h1Size <= 80, 'H1 font-size in range', `${h1Size.toFixed(1)}px`));

  // --- No horizontal overflow --------------------------------------------
  // scrollWidth > clientWidth means something is pushing the page wider than
  // the viewport — a common regression when a fixed-width hero element lands
  // on mobile.
  const overflow = await page.evaluate(() => ({
    scrollW: document.documentElement.scrollWidth,
    clientW: document.documentElement.clientWidth,
  }));
  const noOverflow = overflow.scrollW <= overflow.clientW + 1;
  lines.push(
    fmt(
      noOverflow,
      'no horizontal overflow',
      `scrollWidth ${overflow.scrollW} vs clientWidth ${overflow.clientW}`,
    ),
  );

  // --- CTA links point somewhere and resolve to 200 -----------------------
  const ctaHrefs = await page
    .locator('a.home-cta')
    .evaluateAll((els) => els.map((e) => e.getAttribute('href')));
  lines.push(fmt(ctaHrefs.length >= 4, 'CTA count', `${ctaHrefs.length} home-cta links`));
  for (const href of ctaHrefs) {
    if (!href) {
      lines.push(fmt(false, 'CTA href', 'empty href on a.home-cta'));
      continue;
    }
    // Same-origin navigations: hit them and check status. External/absolute
    // links we skip (none expected on the landing hero).
    if (href.startsWith('http')) continue;
    const url = new URL(href, BASE_URL).toString();
    try {
      const r = await page.request.get(url, { timeout: 15000 });
      lines.push(fmt(r.ok(), `CTA → ${href}`, `HTTP ${r.status()}`));
    } catch (e) {
      lines.push(fmt(false, `CTA → ${href}`, e.message));
    }
  }

  // --- Runtime health -----------------------------------------------------
  lines.push(
    fmt(
      consoleErrors.length === 0,
      'no console errors',
      consoleErrors.length ? consoleErrors.slice(0, 3).join(' | ') : 'clean',
    ),
  );
  lines.push(
    fmt(
      pageErrors.length === 0,
      'no page errors',
      pageErrors.length ? pageErrors.slice(0, 3).join(' | ') : 'clean',
    ),
  );
  lines.push(
    fmt(
      failedRequests.length === 0,
      'no 4xx/5xx responses',
      failedRequests.length ? failedRequests.slice(0, 5).join(' | ') : 'clean',
    ),
  );

  await context.close();
  return lines;
}

const browser = await chromium.launch({ headless: true });
const all = [];
for (const vp of VIEWPORTS) {
  all.push(...(await verifyViewport(browser, vp)));
}
await browser.close();

console.log('\n── landing page structural verification ──');
console.log(all.join('\n'));
const failed = all.filter((l) => l.includes('[FAIL]')).length;
console.log(`\n${failed === 0 ? 'ALL PASS' : `${failed} CHECK(S) FAILED`}\n`);
