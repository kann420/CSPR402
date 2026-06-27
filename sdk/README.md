# cspr402

> Simulated virtual cards for AI agents — pay with native CSPR (or mockUSDC
> via CEP-18) on Casper testnet, get a mock card number, CVV, and expiry
> after the deploy is verified. The active MVP path is Casper testnet CSPR
> order creation and deploy verification, with optional mockUSDC CEP-18
> test-token payments.

CSPR402 is an x402-inspired API: an AI agent pays on Casper testnet, the
backend verifies the Casper deploy, and returns a simulated virtual card.
This SDK lets agents create an order, submit a Casper native CSPR transfer,
and receive mock card details programmatically — all in one call.

[cspr402.xyz](https://cspr402.xyz) is the dashboard and docs surface.

## Install

```bash
npm install cspr402
```

Requires Node.js 18 or newer (the SDK uses native `fetch`, `ReadableStream`, and `WebCrypto`).

## Quick start

```typescript
import { purchaseCardCasper, getCasperBalance } from 'cspr402';

// 1. Configure or load your Casper testnet agent key. Idempotent.
const address = setupCasperAgent('my-agent');
console.log('Fund this Casper testnet public key:', address);

// 2. Pause here until the address has testnet CSPR. Re-run to check:
const bal = await getCasperBalance('my-agent');
console.log(`CSPR: ${bal.cspr}  mockUSDC: ${bal.mockUsdc}`);

// 3. Purchase a card — only do this when the user explicitly asks.
const card = await purchaseCardCasper({
  apiKey: process.env.CARDS402_API_KEY!,
  agentName: 'my-agent',
  amountUsdc: '10.00',
  paymentAsset: 'cspr', // or 'mock_usdc' (CEP-18 test token)
});

console.log(card.number, card.cvv, card.expiry);
```

`purchaseCardCasper` handles the whole flow:

1. `POST /v1/orders` with the amount
2. Sign + submit the Casper native CSPR (or mockUSDC CEP-18) transfer from your agent key
3. Subscribe to the SSE stream at `/v1/orders/:id/stream`
4. Return the mock card details as soon as the `ready` event arrives (deploy verified)

No polling loops, no webhook endpoint required.

## Funding your wallet

Casper testnet accounts are usable as soon as they hold CSPR:

- **Pay with native CSPR:** send enough testnet CSPR to cover the order at the
  current CSPR/USD rate (shown in `payment.cspr.amount` when you create an
  order). Fund from the Casper testnet faucet.
- **Pay with mockUSDC (CEP-18):** a Casper testnet mock token rail, not
  official USDC. Only use it once the backend has a deployed mockUSDC CEP-18
  package hash configured and the operator has funded you with the mock token.

## Step-by-step API (for more control)

```typescript
import { CSPR402Client } from 'cspr402';

const client = new CSPR402Client({
  apiKey: process.env.CARDS402_API_KEY!,
  // baseUrl defaults to https://api.cspr402.xyz/v1
});

// Create the order
const order = await client.createOrder({ amount_usdc: '10.00' });
console.log(
  `Pay ${order.payment.cspr.amount} CSPR to ${order.payment.recipient_public_key} (transfer_id ${order.payment.transfer_id})`,
);

// ... submit the Casper native transfer yourself, then verify:
await client.verifyCasperPayment(order.order_id, deployHash, { senderPublicKey });

// Wait for delivery (uses SSE under the hood, with polling fallback)
const card = await client.waitForCard(order.order_id, { timeoutMs: 120000 });
console.log(card.number, card.cvv, card.expiry);
```

### Casper testnet flow (mockUSDC CEP-18)

```typescript
const mockUsdcOrder = await client.createOrder({
  amount_usdc: '10.00',
  payment_asset: 'mock_usdc_cep18',
  payer_public_key: senderPublicKey,
});
// Submit mockUsdcOrder.payment as a CEP-18 transfer, then verify with the same method.
await client.verifyCasperPayment(mockUsdcOrder.order_id, deployHash, { senderPublicKey });
```

`mock_usdc_cep18` is a Casper testnet mock token rail for demos, not official USDC.

## MCP server — for Claude Desktop, Cursor, and other MCP clients

Add to your client's `mcpServers` config:

```json
{
  "mcpServers": {
    "cspr402": {
      "command": "npx",
      "args": ["-y", "cspr402"],
      "env": { "CARDS402_API_KEY": "cards402_<your key>" }
    }
  }
}
```

The MCP server exposes four tools: `setup_wallet`, `check_budget`, `check_order`, and `purchase_vcc`.

## Error handling

All SDK errors inherit from `CSPR402Error`. Typed subclasses let you react to specific failure modes:

```typescript
import {
  CSPR402Error,
  AuthError,
  SpendLimitError,
  RateLimitError,
  ServiceUnavailableError,
  InvalidAmountError,
  OrderFailedError,
  WaitTimeoutError,
} from 'cspr402';

try {
  const card = await purchaseCardCasper({ ... });
} catch (err) {
  if (err instanceof SpendLimitError) { /* cap reached — ask owner to raise */ }
  else if (err instanceof OrderFailedError) { /* check err.refund for refund tx */ }
  else if (err instanceof WaitTimeoutError) { /* network flake or stalled fulfillment */ }
  else if (err instanceof AuthError) { /* bad key */ }
}
```

## Keeping card details safe

`purchaseCardCasper` returns the mock card PAN, CVV, and expiry as plain strings. **Treat them as secrets.** Don't log them, don't write them to disk, don't send them to observability pipelines unless those pipelines are explicitly PCI-compliant.

## Links

- [cspr402.xyz](https://cspr402.xyz) — dashboard and docs
- [cspr402.xyz/docs](https://cspr402.xyz/docs) — full API reference
- [cspr402.xyz/skill.md](https://cspr402.xyz/skill.md) — drop-in agent onboarding brief
- [cspr402.xyz/llms.txt](https://cspr402.xyz/llms.txt) — LLM-index of every docs surface
- [github.com/kann420/CSPR402](https://github.com/kann420/CSPR402) — source

## License

MIT — see [LICENSE](./LICENSE).
