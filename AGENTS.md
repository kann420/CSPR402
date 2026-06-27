# CSPR402 Agent Guide

CSPR402 is an x402-inspired API where an AI agent or user pays on Casper
mainnet, the backend verifies the Casper deploy, then returns a simulated
virtual card and receipt.

The active payment path is Casper-only. Remaining Stellar/Soroban files in
the repo are legacy and slated for removal; do not assume their payment
behavior is current.

## Non-negotiable Rules

- NEVER hardcode API keys, private keys, mnemonics, bearer tokens, webhook
  secrets, RPC provider secrets, or faucet credentials in source code.
- NEVER commit `.env`, wallet key files, generated private keys, local
  databases, devnet state, or real API responses containing secrets.
- If something is unknown, do not guess. Verify with local code, official docs,
  a test transaction, or ask the user.
- Always debug and verify changes. Every implementation step should end with a
  relevant command, test, smoke check, or documented blocker.
- Use Casper mainnet only for the MVP. Do not claim production Visa issuance or
  production USDC support unless it has been explicitly implemented and
  verified.
- The virtual card issuer is simulated for this hackathon MVP. Never represent
  virtual card data as a real Visa card or a spendable instrument.

## MVP Scope

Ship the smallest credible demo first:

1. Create an order via API.
2. Return Casper mainnet payment instructions.
3. Pay with native CSPR on Casper mainnet.
4. Backend verifies the finalized payment.
5. Backend marks the order paid and fulfills a virtual card.
6. API returns card details, receipt, and Casper deploy hash.

`mockUSDC` via CEP-18 is a bonus after the CSPR path works. Do not block the
MVP on finding an official Casper mainnet USDC path.

## Architecture Direction

- `backend/`: Express API and SQLite order state machine with Casper deploy
  verification (native CSPR + CEP-18 mockUSDC).
- `sdk/`: Casper payment helpers and an agent-friendly client.
- `web/`: dashboard/demo surface with Casper-native product copy.
- `contract/`: legacy reference only. The active CSPR402 path has no on-chain
  contract; native CSPR transfer with `transfer_id` is preferred for
  day-one speed.
- `examples/`: keep one Node agent demo and one simple HTTP/curl flow working.

## Casper Payment Design

For native CSPR MVP payments:

- Store money as integers in motes or typed decimal strings. Do not use JS
  floating point for balances, quotes, fees, or comparisons.
- Generate an order id and a numeric Casper `transfer_id` that maps uniquely to
  the order.
- Payment instructions must include chain name, recipient public key, exact
  amount, transfer id, expiration time, and verification endpoint.
- Verify the finalized deploy before fulfillment:
  - chain is Casper mainnet
  - execution succeeded
  - deploy hash matches the submitted payment
  - sender is the expected payer when known
  - recipient is the configured treasury/payment account
  - amount equals or exceeds the required amount
  - transfer id maps to the order
  - order is not expired and not already fulfilled
- Payment verification must be idempotent. Repeated callbacks, polls, or manual
  verify requests must not mint multiple cards for the same order.

For `mockUSDC`:

- Use CEP-18 on mainnet or local devnet.
- Name it clearly as mock/test token in API responses and UI.
- Verify contract hash/package, entry point, sender, recipient, amount, and
  order correlation.

## Environment

Keep real values in local `.env` files only. Use checked-in examples for names
and documentation.

Recommended Casper variables:

```bash
PAYMENT_PROVIDER=casper
CASPER_NETWORK=mainnet
CASPER_CHAIN_NAME=casper
CASPER_NODE_RPC_URL=https://casper-mainnet.gateway.tatum.io/rpc
CASPER_EVENT_STREAM_URL=https://node.cspr.cloud/events/main
CASPER_TREASURY_PUBLIC_KEY=
CASPER_TREASURY_PRIVATE_KEY_PATH=
CSPR_USD_RATE=0.01
CASPER_MIN_TRANSFER_MOTES=2500000000
CASPER_PAYMENT_TTL_MINUTES=60
CASPER_MIN_CONFIRMATIONS=1
CASPER_PAYMENT_TIMEOUT_MS=900000
MOCK_CARD_MODE=true
VIRTUAL_CARD_PROVIDER=mock
MOCK_USDC_CONTRACT_HASH=
```

Do not store private key material directly in env unless there is no safer
local-dev alternative. Prefer a key file path that points to an ignored local
file.

## Tooling And Skills

Current local setup notes live in `docs/agent/casper-tooling.md`.

Important status:

- No relevant Casper blockchain Codex skill was found with `npx skills find`.
  Results for `casper` mostly refer to unrelated "Casper Studios" skills.
- `casper-devnet` is the desired MCP/local-chain tool for contract work, but
  this machine currently needs Windows SDK libraries before the Cargo install
  can succeed.
- Do not install random blockchain skills/plugins unless they directly help
  Casper and the reason is documented.

## Verification Commands

Use the narrowest command that proves the change:

```bash
npm install
npm test
npm run lint
npm run typecheck
cd backend && npm test
cd sdk && npm test
cd web && npm run build
```

For Casper-specific work, add or run smoke tests that prove:

- an order can be created
- a Casper payment can be submitted or mocked deterministically
- the backend rejects wrong amount, wrong recipient, wrong transfer id, failed
  deploys, expired orders, and duplicate fulfillment
- the happy path returns one card and one receipt

If a command cannot run because of missing local dependencies, document the
exact command, error, and fix.

## Development Style

- Use `rg` or `rg --files` first when exploring.
- Keep changes scoped to the MVP. Avoid broad refactors until the CSPR payment
  path works end to end.
- Preserve user changes. Do not reset, checkout, or delete work you did not
  create.
- Add tests close to the changed behavior.
- Update docs when behavior, env vars, or API response shapes change.
- Prefer official Casper docs and repo references:
  - https://docs.casper.network/
  - https://github.com/casper-network
  - https://github.com/veles-labs/casper-devnet
  - https://docs.cspr.cloud/

## Product Language

Use precise hackathon language:

- Say "simulated virtual card" for this MVP.
- Say "Casper mainnet CSPR" for native payment.
- Say "mockUSDC CEP-18" unless an official, verified Casper mainnet USDC path is
  implemented.
- Do not say "real Visa", "production card", "mainnet payment", or "real USDC"
  unless that capability has been implemented and verified.
