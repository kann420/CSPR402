# CSPR402 Architecture

## Overview

CSPR402 is an agentic virtual-card service running on the Casper testnet. An AI
agent pays CSPR (native) or mockUSDC (a CEP-18 token) to a treasury account on
the `casper-test` chain; the backend verifies the on-chain deploy directly
against a Casper node JSON-RPC endpoint and, on success, issues a mock virtual
card (PAN/CVV/expiry) to the agent.

The active deployment is the MVP mode:

- `PAYMENT_PROVIDER=casper`
- `MOCK_CARD_MODE=true`
- `VIRTUAL_CARD_PROVIDER=mock`

There is **no on-chain smart contract in the active path**. Payment verification
is pull-based: the backend queries the Casper node RPC (`info_get_transaction`
with `info_get_deploy` fallback) when the agent calls the verify endpoint.
Fulfillment is mocked — a sealed mock card is written to the database at the
moment payment is verified. A real virtual-card fulfillment service is out of
scope for the MVP.

The product identity: npm package `cspr402`, web domain `https://cspr402.xyz`,
API base `https://api.cspr402.xyz/v1`, CLI binary `cspr402`. The repository
directory is `CasperCard402`; the backend's internal label is `CardCasper402`
and its database file is `cardcasper402.db`.

## Components

| Component | Directory  | Role                                                                                                                                                           |
| --------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| backend   | `backend/` | Node.js / Express 4 API: agent auth, order state machine, Casper deploy verification, policy engine, operator dashboard API, webhook delivery, background jobs |
| web       | `web/`     | Next.js 16 marketing site, public docs, operator dashboard, CSPR.click wallet integration                                                                      |
| sdk       | `sdk/`     | TypeScript client + CLI (`cspr402`) + MCP server (npm `cspr402`)                                                                                               |

No smart-contract directory is part of the active architecture. Verification is
pull-based against the Casper node RPC.

```
CasperCard402/
├── backend/   Node.js/Express API, SQLite, Casper RPC verification
├── web/       Next.js 16 site + dashboard + CSPR.click wallet
├── sdk/       TypeScript client, CLI, MCP server (npm cspr402)
├── docs/      Documentation
├── examples/  Example integrations
└── scripts/   Repo tooling (lint, api-validate, verify)
```

## End-to-end flow

1. **Operator mints a one-time claim code** for an agent in the dashboard. The
   code is stored as `SHA256(code)` in `agent_claims`; the raw API key is sealed
   (AES-256-GCM secret-box) in `sealed_payload`.

2. **Agent redeems the claim code**: `POST /v1/agent/claim {code}` returns
   `api_key` (+ `webhook_secret`). Redemption is single-use: the hash is looked
   up, the sealed payload is decrypted, and the row is wiped inside a single
   `BEGIN IMMEDIATE` better-sqlite3 transaction so a crash between mark-used and
   wipe cannot leave the payload extractable. A `401 invalid_claim` is returned
   for invalid, expired, or already-used codes (same error for all three so
   probing cannot distinguish them).

3. **Agent reports onboarding**: `POST /v1/agent/status {state, wallet_public_key, detail}`.
   `state` ∈ `{initializing, awaiting_funding, funded}`. `wallet_public_key` is
   validated with `casper-js-sdk` `PublicKey.fromHex` after a regex
   `^(01[0-9a-f]{64}|02[0-9a-f]{66})$` shape check. Each call emits an
   `agent_state` event on the in-process event bus, which the dashboard SSE
   stream relays to connected browsers.

4. **Agent creates an order**: `POST /v1/orders {amount_usdc, payment_asset?, payer_public_key?, webhook_url?, metadata?}`
   with `X-Api-Key` and optional `Idempotency-Key`.
   - `amount_usdc`: decimal string, ≤2 decimal places, `$0.01`–`$10000`.
   - `payment_asset`: `cspr_casper` (default) or `mock_usdc_cep18`
     (requires `MOCK_USDC_ENABLED=true`, `MOCK_USDC_CONTRACT_PACKAGE_HASH`, and a
     bound `payer_public_key`). The `usdc` value is rejected in casper
     mode with `invalid_payment_asset`.
   - **Spend-limit check** (`spend_limit_usdc`): settled + in-flight
     (`pending_payment`, `ordering`, `refund_pending`, `awaiting_approval`) + new
     ≤ limit.
   - **Policy engine** (`src/policy.js`, `checkPolicy`): rule order — suspended →
     `single_tx_hard_cap` → `after_hours` → `blocked_day` → `daily_limit` →
     `approval_threshold` → approved. Approval-gated orders transition to
     `awaiting_approval` and a row is written to `approval_requests` with a TTL of
     `APPROVAL_TTL_MINUTES` (default 120 minutes). Preview without persisting via
     `GET /v1/policy/check?amount=`.
   - **Sandbox keys** (`api_keys.mode='sandbox'`): return a sealed fake card
     immediately (`status='delivered'`, phase `ready`).
   - **Real mode, `cspr_casper`**: `allocateTransferId()` pulls a monotonic
     counter from `system_state` key `casper_next_transfer_id` (starts at
     `100000`); `buildCasperPayment()` converts USD → motes via `CSPR_USD_RATE`
     using ceil-division (`usdToMotes`), enforces `CASPER_MIN_TRANSFER_MOTES`
     (default `2_500_000_000` = 2.5 CSPR), recipient =
     `CASPER_TREASURY_PUBLIC_KEY`, TTL `CASPER_PAYMENT_TTL_MINUTES` (default 60).
     The payment instruction has `type: 'casper_cspr_transfer'` with `network`,
     `chain_name`, `recipient`, `sender_public_key`, `order_id`, `amount_usdc`,
     `amount_cspr`, `amount_motes`, `transfer_id`, `expires_at`.
   - **`mock_usdc_cep18`**: `buildMockUsdcPayment()` produces
     `type: 'casper_cep18_transfer'`, `asset: 'mockUSDC'`, `decimals` (default 6,
     `MOCK_USDC_DECIMALS`), `contract_package_hash`, optional `contract_hash`,
     `sender_public_key`, `recipient_public_key`, `order_id`, `amount`,
     `amount_base_units`, `expires_at`, `verify_url`.
   - The order row is written `pending_payment` with `vcc_payment_json`,
     `casper_transfer_id`, `casper_expected_sender_public_key`, `payment_asset`.
     Response `201`:
     `{order_id, status:'pending_payment', phase:'awaiting_payment', amount_usdc, payment, poll_url, budget}`.
     All DB writes happen inside one synchronous `BEGIN IMMEDIATE` transaction,
     closing the spend-limit, daily-limit, and idempotency-key TOCTOU races.

5. **Agent submits the transfer on Casper** (a native CSPR transfer carrying
   `transfer_id` + `amount_motes` to the treasury, or a CEP-18 `transfer(...)`
   call to the mockUSDC package), then calls
   `POST /v1/orders/:id/verify-payment {deploy_hash, sender_public_key?}`.

   `verifyCasperDeployPayment` / `verifyCasperCep18Payment` fetch
   `info_get_transaction` then fall back to `info_get_deploy` from
   `CASPER_NODE_RPC_URL`. They verify: deploy-hash match, `chain_name ==
'casper-test'`, sender (if bound), execution success, and:
   - native CSPR: recipient (account-hash, or main purse resolved via
     `getAccountInfo` / `getLatestEntity` when the execution record only carries
     a purse URef), `transfer_id`, `amount_motes >= expected`.
   - CEP-18: entry point `transfer`, contract package hash, recipient account
     hash, `amount_base_units >= expected`.

   On success, an atomic `UPDATE pending_payment → delivered` writes a sealed
   mock card (`4242424242424242` / `123` / `12/99` / `Mock Virtual Card`),
   `casper_deploy_hash`, `casper_sender_public_key`, `casper_paid_at`, and
   `payment_receipt_json`. The update is guarded by
   `casper_deploy_hash IS NULL` plus a pre-check uniqueness query so a single
   deploy cannot fulfill two orders. `total_spent_usdc` is incremented and a
   webhook is enqueued. The receipt is `casper_cspr_receipt` (`transfer_id`,
   `amount_motes`, `recipient`, `deploy_hash`, `chain_name`, `block_hash`,
   `block_height`, `gas_cost_motes`) or `casper_mock_usdc_receipt`
   (`contract_package_hash`, `amount_base_units`, `recipient_account_hash`, …).

   Verification error codes: `invalid_deploy_hash`, `payment_pending` (425),
   `wrong_chain`, `wrong_sender`, `wrong_recipient`, `wrong_transfer_id`,
   `underpaid`, `not_native_transfer`, `not_cep18_transfer`, `wrong_contract`,
   `payment_already_redeemed` (409), `payment_expired` (410), `order_not_payable`
   (409), `missing_payment_instructions`, `wrong_payment_provider`,
   `invalid_sender_public_key`, `casper_rpc_error` (502), `casper_rpc_not_configured`
   (503).

6. **Agent polls** `GET /v1/orders/:id` or opens the SSE stream
   `GET /v1/orders/:id/stream`. Internal status → public phase map:
   `awaiting_approval` → `awaiting_approval`, `pending_payment` →
   `awaiting_payment`, `ordering` → `processing`, `delivered` → `ready`,
   `failed` → `failed`, `refund_pending` → `failed`, `refunded` → `refunded`,
   `expired` → `expired`, `rejected` → `rejected`, `pending_manual_recovery` →
   `pending_recovery`. The card is sealed at rest (card-vault + secret-box) and
   decrypted only on authorized read; the brand is normalized before egress.

## API reference

All `/v1/*` endpoints require `X-Api-Key` unless noted. A pre-auth failure rate
limiter (`skipSuccessfulRequests: true`) runs before the auth middleware so
bad-key floods cannot saturate bcrypt.

### Agent onboarding

- `POST /v1/agent/claim` — unauthenticated, 10/min/IP. Body `{code}`. Returns
  `{api_key, webhook_secret, api_key_id, label, api_url}`. Single-use; claim
  hash stored as SHA256; sealed payload decrypted inside the redemption
  transaction.
- `POST /v1/agent/status` — 60/min/key. Body
  `{state?, wallet_public_key?, detail?}`. `state` ∈
  `{initializing, awaiting_funding, funded}`. Emits an `agent_state` event bus
  event. Idempotent.

### Orders

- `POST /v1/orders` — 60/hour/key (overridable per key via `rate_limit_rpm`).
  Headers: `X-Api-Key`, optional `Idempotency-Key` (≤255 chars, no duplicate
  header). Body `{amount_usdc, payment_asset?, payer_public_key?, webhook_url?, metadata?}`.
  Returns `201` with `{order_id, status, phase, amount_usdc, payment, poll_url, budget}`
  (real mode), `202` with approval fields (approval-gated), or `201` with a
  sandbox card (sandbox keys). Errors: `invalid_request`, `invalid_idempotency_key`,
  `invalid_payment_asset`, `invalid_payer_public_key`, `self_payment_not_supported`,
  `mock_usdc_not_enabled`, `invalid_amount`, `invalid_webhook_url`, `invalid_metadata`,
  `spend_limit_exceeded` (403), `policy_blocked` (403), `casper_min_transfer_amount`
  (400), `service_temporarily_unavailable` (503 when frozen).
- `POST /v1/orders/:id/verify-payment` — 600/min/key. Body
  `{deploy_hash, sender_public_key?}`. Returns `{ok, receipt, order}`. Error
  codes listed in the flow above.
- `GET /v1/orders/:id` — 600/min/key. Returns the full order response, including
  `card` and `receipt` when `delivered`.
- `GET /v1/orders/:id/stream` — SSE, 600/min/key. Emits `event: phase` with the
  same JSON body as `GET /:id` on every `updated_at` change; closes on terminal
  phase. Per-key concurrent stream cap (`MAX_STREAMS_PER_KEY`, default 20) and
  global cap (`MAX_STREAMS_TOTAL`, default 1000).
- `GET /v1/orders` — 600/min/key. Filters: `status`, `since_created_at`,
  `since_updated_at`, `limit` (≤200), `offset`. Returns
  `{id, status, amount_usdc, payment_asset, created_at, updated_at}` rows.

### Budget and policy

- `GET /v1/usage` — 600/min/key. Returns `{api_key_id, label, budget, orders}`
  where `budget = {spent_usdc, in_flight_usdc, committed_usdc, limit_usdc, remaining_usdc}`
  (`remaining_usdc` subtracts committed = settled + in-flight, matching the
  order-creation spend check) and `orders` is a per-status count.
- `GET /v1/policy/check?amount=` — 600/min/key. Dry-run policy preview; does not
  persist to `policy_decisions`.

### Public endpoints (no auth)

- `GET /api/version` — 60/min/IP. Returns `hmac_protocol: 'v3'` and feature
  flags: `idempotency_key`, `casper_cspr_transfer`, `webhook_circuit_breaker`,
  `callback_nonce`.
- `GET /status` — 180/min/IP. Health snapshot: `ok`, `payment_provider`,
  `frozen`, `consecutive_failures`, order counts (`pending_payment`,
  `in_progress`, `refund_pending`), 24h rollup (`total`, `delivered`, `failed`,
  `refunded`, `expired`, `success_rate`), webhook dead-letter count
  (`failed_permanent_24h`), SSE stream count, and process uptime/`started_at`.

### Operator surfaces

- `/dashboard/*` — operator API (agents, orders, approvals, alerts,
  treasury/margins, webhooks, audit log). Session-authenticated via the auth
  router; backed by the `dashboards` + `users` + `sessions` tables.
- `/dashboard/platform/*` — platform-owner cross-tenant surface, gated by
  `requirePlatformOwner`.
- `/internal/*` — internal helpers.
- `/vcc-callback` — HMAC v3 callback channel, 120/min/IP. Mocked in the MVP
  (`VIRTUAL_CARD_PROVIDER=mock`); the per-order callback nonce and per-order
  secret are wired but no real fulfillment service calls back.
- Optional MPP (Machine Payments Protocol): `/v1/.well-known/mpp`,
  `/v1/cards/:product/:amount`, `/v1/mpp/receipts/:id`, gated by
  `MPP_ENABLED=true`. Mounted before the auth chain so the unauthenticated
  discovery endpoints are reachable.

## Data model

SQLite (better-sqlite3, WAL mode, `busy_timeout=5000`, foreign keys on). Path
from `DB_PATH` (default `cardcasper402.db`). Migrations run automatically on
startup (`applyMigration(N)`), each wrapped in a transaction with the version
marker; the schema version is checked against `EXPECTED_SCHEMA_VERSION` and the
process refuses to start if the on-disk schema is newer than the code.

Key tables and their roles in the active path:

- **`orders`** — core state machine. Statuses: `pending_payment`,
  `awaiting_approval`, `ordering`, `delivered`, `failed`, `refund_pending`,
  `refunded`, `expired`, `rejected`, `pending_manual_recovery`. Casper-specific
  columns: `payment_asset`, `casper_transfer_id` (unique partial index),
  `casper_expected_sender_public_key`, `casper_deploy_hash` (unique partial
  index), `casper_sender_public_key`, `casper_paid_at`, `vcc_payment_json`,
  `payment_receipt_json`, `webhook_url`, `metadata`, `request_id`, `source`.
  Card columns (`card_number`, `card_cvv`, `card_expiry`, `card_brand`) hold
  sealed ciphertext at rest.
- **`api_keys`** — `id`, `key_hash` (bcrypt), `key_prefix` (prefix index for
  auth candidate lookup), `label`, `spend_limit_usdc`, `total_spent_usdc`,
  `policy_daily_limit_usdc`, `policy_single_tx_limit_usdc`,
  `policy_require_approval_above_usdc`, `policy_allowed_hours`,
  `policy_allowed_days`, `mode` (`live`/`sandbox`), `rate_limit_rpm`,
  `webhook_secret`, `default_webhook_url`, `wallet_public_key`, `agent_state`,
  `agent_state_at`, `agent_state_detail`, `dashboard_id`, `suspended`,
  `expires_at`, `enabled`.
- **`agent_claims`** — one-time claim codes. `code` (SHA256, unique),
  `api_key_id`, `sealed_payload` (AES-256-GCM, wiped on redemption),
  `expires_at`, `used_at`, `claimed_ip`.
- **`approval_requests`** — `id`, `api_key_id`, `order_id`, `amount_usdc`,
  `agent_note`, `status` (`pending`/`approved`/`rejected`/`expired`),
  `requested_at`, `expires_at`, `decided_at`, `decision_note`, `decided_by`.
- **`policy_decisions`** — audit log of every `checkPolicy` decision
  (`approved`/`blocked`/`pending_approval`), with `rule` and `reason`.
- **`idempotency_keys`** — `(key, api_key_id)` primary key, `request_fingerprint`
  (SHA256 of canonical-JSON body), `response_status`, `response_body`. 24h
  retention (pruned by background jobs).
- **`webhook_queue`** — retry queue. `url`, `payload` (card-redacted),
  `secret`, `attempts` (≤ `MAX_WEBHOOK_ATTEMPTS` = 3), `next_attempt`,
  `last_error`, `delivered`. Retry delays 30s / 5m / 30m.
- **`webhook_deliveries`** — outbound delivery log (request/response/latency,
  card-redacted, 30-day retention).
- **`unmatched_payments`** — on-chain payments that could not be matched to a
  pending order (column set retained for the refund-reconciliation job).
- **`system_state`** — single-row key/value. Holds `casper_next_transfer_id`,
  `frozen`, `consecutive_failures`, and spend-alert debounce keys
  (`spend_alert:<key>:<total|daily>:<threshold>`).
- **`audit_log`** — `dashboard_id`, `actor_*`, `action`, `resource_type`,
  `resource_id`, `details` (JSON, ≤16KB), `ip`, `user_agent`. Permanent forensic
  trail of mutating dashboard actions.
- **`users`**, **`dashboards`**, **`sessions`**, **`auth_codes`**,
  **`wallet_auth_challenges`** — operator auth (email codes + Casper wallet
  signed-challenge login).
- **`alert_rules`**, **`alert_firings`** — per-dashboard alert evaluator state.
- **`mpp_challenges`** — MPP pre-order rows (bounded TTL, nightly sweep).
- **`schema_migrations`** — applied migration versions.

## Background jobs (`src/jobs.js`)

`startJobs()` runs on boot and on intervals; `stopJobs()` cancels them on
shutdown. Each sub-job runs in its own try/catch so one failure cannot block the
rest. A `jobsRunning` mutex prevents overlapping `runJobs` ticks. Active jobs:

- `expireStaleOrders` — flips `pending_payment` → `expired` past the 2-hour
  window (UPDATE-then-SELECT with an `updated_at` marker to avoid racing a
  concurrent delivery), fires expired webhooks.
- `expireApprovalRequests` — `pending` → `expired` approvals past their TTL;
  flips the order to `rejected`.
- `reconcileOrderingFulfillment` — retries stuck `ordering` rows (frozen-aware);
  hard-fails after `STUCK_FAIL_AFTER_MS` (default 30m) or
  `MAX_FULFILLMENT_ATTEMPTS` (default 3), routing through
  `refundOrQuarantine`. In casper mock mode there is no outbound treasury leg,
  so this path is effectively dormant for the MVP.
- `recoverStuckOrders` — polls the (mocked) fulfillment service for stuck rows;
  surfaces stuck-delivered signals for ops.
- `reconcileRefundQuarantine` — audits orphaned refund/quarantine rows.
- `retryWebhooks` — drains `webhook_queue` with per-origin circuit breakers;
  re-hydrates redacted card fields from the sealed vault before firing.
- `evaluateAlertsForAllDashboards` — runs alert rules per dashboard.
- `checkAgentFundingStatus` — (funding check; inert in casper mock mode
  where on-chain balances aren't polled) 15s interval.
- Retention sweeps: `pruneIdempotencyKeys` (24h), `pruneExpiredSessions`,
  `pruneExpiredAuthCodes`, `pruneExpiredAgentClaims` (24h),
  `pruneWebhookDeliveries` (30d), `prunePolicyDecisions` (90d), `purgeOldCards`
  (nulls sealed card columns after `CARD_RETENTION_DAYS`, default 30).

## Security model

- **API keys**: bcrypt hashes with a `key_prefix` index for candidate lookup
  (`MAX_AUTH_CANDIDATES` bounds the number of compares). A pre-auth failure
  rate limiter (`skipSuccessfulRequests: true`, `AUTH_FAILURE_LIMIT_PER_WINDOW`,
  default 60 / 15min / IP) runs before the bcrypt middleware so bad-key floods
  cannot saturate a CPU core.
- **Webhook delivery**: HMAC-SHA256 (`lib/hmac.js`, protocol v3) over
  `${timestamp}.${orderId}.${nonce}.${rawBody}` with a per-order callback nonce;
  v2 (order-id-bound, no nonce) is a transitional fallback, v1 is rejected. A
  per-origin circuit breaker (5 failures / 60s → 5min cooldown) and a
  permanent-failure dead-letter queue (surfaced on `/status` as
  `failed_permanent_24h`) bound blast radius. Webhook payloads are card-redacted
  before persistence; the live fetch re-hydrates card fields from the sealed
  vault.
- **Sealed card vault** (`lib/card-vault.js` + `lib/secret-box.js`): PAN/CVV/expiry
  are AES-256-GCM sealed at rest; `seal()` throws in production when no key is
  configured. Fields are byte-length capped (64 bytes). `openCard()` decrypts
  only on authorized read; the brand is normalized before reaching the agent.
- **SSRF guard** (`lib/ssrf.js`): `assertSafeUrl()` resolves DNS and checks
  every resolved address against a private-IP blocklist (RFC 1918, loopback,
  link-local, CGNAT, cloud metadata, 6to4/Teredo/NAT64/IPv4-mapped IPv6).
  HTTPS is required for webhook URLs in production; `fetch` runs with
  `redirect: 'error'` to close the redirect-SSRF hole. `webhook_url` is capped
  at 2048 chars; `metadata` at 8KB serialized.
- **Idempotency**: `Idempotency-Key` (≤255 chars, duplicate header rejected)
  with a 24h cache keyed on a canonical-JSON SHA256 fingerprint
  (`canonicalJson`, depth ≤32). Conflict (same key, different body) → `409
idempotency_conflict`.
- **Request ID**: `X-Request-ID` is validated (charset `[A-Za-z0-9._:-]{1,64}`)
  to prevent header-injection self-DoS and outbound header corruption; invalid
  input falls back to a server UUID.
- **CORS**: allowlist validated at boot (each entry must be a bare origin; a
  non-bare or unparseable value exits the process). Methods include `DELETE`;
  `X-Request-ID` is in both allowed and exposed headers.
- **Transport security**: helmet with HSTS (2 years, `includeSubDomains`,
  `preload`). HTTPS is enforced in production (honors `X-Forwarded-Proto`
  because `trust proxy` is set); non-HTTPS returns `426 https_required`.
- **Per-endpoint rate limits**: order create 60/hour/key (configurable),
  order poll/verify/SSE 600/min/key, `/status` 180/min/IP, `agent/status`
  60/min/key, `/vcc-callback` 120/min/IP, `/v1/agent/claim` 10/min/IP,
  `/api/version` 60/min/IP.
- **Process resilience**: graceful shutdown on `SIGINT`/`SIGTERM`/`SIGHUP`
  (stops jobs, closes HTTP server, hard-exits after 15s fallback).
  `uncaughtException` logs a structured payload and shuts down;
  `unhandledRejection` logs and continues.
- **Audit log** (`lib/audit.js`): every mutating dashboard action writes an
  immutable `audit_log` row (BigInt-safe JSON, details capped at 16KB, header
  values coerced to strings so a duplicated `User-Agent` cannot silently drop
  the row).

## Web (`web/`)

Next.js 16 + React 19 + Tailwind 4, `casper-js-sdk`. Routes include the landing
page, docs, blog, pricing, company, careers, press, privacy, security, status,
`portal` (agent), and `dashboard` (operator). Domain `cspr402.xyz`.

CSPR.click wallet integration lives in `web/app/lib/csprclick-client.ts`:

- Loads the CSPR.click runtime from CDN (`https://cdn.cspr.click/ui/v<version>/csprclick-client-<version>.js`,
  default version `2.1.0`).
- Connects Casper Wallet, signs messages, and sends deploys on `casper-test`.
- Public config is fetched from `/api/public-config` (`csprclick_app_id`,
  `csprclick_cdn_version`, `csprclick_providers`, `casper_node_rpc_url`,
  `casper_chain_name`); the app id is resolved per domain and asserted against
  `https://accounts.cspr.click/api/application/<appId>.json` before use. On
  localhost a local sentinel app id is used.
- Public key normalization regex `^(01[0-9a-f]{64}|02[0-9a-f]{66})$` matches the
  backend's validation.

## SDK (`sdk/`)

npm package `cspr402` (TypeScript, Node ≥18). Exports a `cspr402` CLI binary
and an MCP server entry point (`./mcp`). Commands: `cspr402 onboard`,
`cspr402 purchase`, `cspr402 wallet`, `cspr402 mcp`. The HTTP client wraps the
agent API: claim redemption, order creation, deploy verification, and mock
virtual card retrieval, all against `https://api.cspr402.xyz/v1`. Repository
`github.com/kann420/CSPR402`, homepage `cspr402.xyz`.

## Environment variables

See `backend/.env.casper.example` for the canonical list. The Casper-active
variables:

| Variable                           | Purpose                                                                                                     |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `PORT`                             | HTTP listen port (default 4000).                                                                            |
| `NODE_ENV`                         | `production` enables HTTPS enforcement, sealed-vault requirement, JSON logging.                             |
| `DB_PATH`                          | SQLite path (default `cardcasper402.db`).                                                                   |
| `PAYMENT_PROVIDER`                 | `casper` for the active MVP path.                                                                           |
| `MOCK_CARD_MODE`                   | `true` — mock card fulfillment.                                                                             |
| `VIRTUAL_CARD_PROVIDER`            | `mock`.                                                                                                     |
| `CASPER_NETWORK`                   | `testnet`.                                                                                                  |
| `CASPER_CHAIN_NAME`                | `casper-test` (verified against the deploy's `chain_name`).                                                 |
| `CASPER_NODE_RPC_URL`              | Casper node JSON-RPC endpoint used by `verifyCasperDeployPayment` / `verifyCasperCep18Payment`.             |
| `CASPER_EVENT_STREAM_URL`          | Casper node event stream URL (configured for completeness; the active path is pull-based, no watcher runs). |
| `CSPR_USD_RATE`                    | USD-per-CSPR rate used by `usdToMotes` (ceil-division).                                                     |
| `CASPER_MIN_TRANSFER_MOTES`        | Minimum native transfer amount (default `2500000000` = 2.5 CSPR).                                           |
| `CASPER_PAYMENT_TTL_MINUTES`       | Payment instruction TTL (default 60).                                                                       |
| `CASPER_TREASURY_PUBLIC_KEY`       | Treasury recipient public key.                                                                              |
| `CASPER_TREASURY_PRIVATE_KEY_PATH` | Path to treasury signing key material (kept out of git).                                                    |
| `CASPER_MIN_CONFIRMATIONS`         | Minimum confirmations for verification policy.                                                              |
| `CASPER_PAYMENT_TIMEOUT_MS`        | Payment verification timeout.                                                                               |
| `MOCK_USDC_ENABLED`                | `true` enables `mock_usdc_cep18` orders.                                                                    |
| `MOCK_USDC_CONTRACT_PACKAGE_HASH`  | Required when `MOCK_USDC_ENABLED=true`; verified against the deploy's stored package hash.                  |
| `MOCK_USDC_CONTRACT_HASH`          | Optional display/query metadata.                                                                            |
| `MOCK_USDC_DECIMALS`               | CEP-18 decimals (default 6).                                                                                |
| `VCC_API_BASE`                     | Mocked fulfillment service base URL.                                                                        |
| `CORS_ORIGINS`                     | Comma-separated bare origins, validated at boot.                                                            |
| `VCC_CALLBACK_SECRET`              | Shared HMAC secret for the (mocked) callback channel.                                                       |
| `PUBLIC_API_BASE_URL`              | Public API base returned to agents (default `https://api.cspr402.xyz/v1`).                                  |
| `AUTH_FAILURE_LIMIT_PER_WINDOW`    | Pre-auth failure limiter budget (default 60 / 15min).                                                       |
| `APPROVAL_TTL_MINUTES`             | Approval request TTL (default 120).                                                                         |
| `MAX_SSE_STREAMS_PER_KEY`          | Per-key concurrent SSE cap (default 20).                                                                    |
| `MAX_SSE_STREAMS_TOTAL`            | Global concurrent SSE cap (default 1000).                                                                   |
| `MPP_ENABLED`                      | `true` enables the MPP discovery endpoints.                                                                 |

The secret-box encryption key and the public base URL used for receipts/verify
URLs are configured under keys whose names contain a brand token; their
exact names are documented in `backend/.env.casper.example`. Generate the
encryption key with `openssl rand -hex 32` (64 hex chars / 32 bytes); `seal()`
throws in production if it is unset.

## Process entry points

- `backend/src/index.js` — boots `startJobs()`, then `app.listen(PORT)`. In
  casper mode no chain watcher runs. Registers `SIGINT`/`SIGTERM`/`SIGHUP`
  graceful-shutdown handlers and `uncaughtException`/`unhandledRejection`
  handlers with structured logging.
- `backend/src/app.js` — builds the Express app (request ID, helmet, CORS,
  HTTPS enforcement, body capture for HMAC, route mounting, public `/status` and
  `/api/version`, claim/agent-status handlers, auth chain, order router, MPP,
  dashboard/internal/platform/vcc-callback routers).
- `backend/src/payments/casper.js` — `allocateTransferId`, `buildCasperPayment`,
  `usdToMotes`, `formatCSPR`, `minTransferMotes`.
- `backend/src/payments/casper-cep18.js` — `buildMockUsdcPayment`,
  `usdToMockUsdcBaseUnits`, `normalizeCasperHash`.
- `backend/src/payments/casper-verify.js` — `verifyCasperDeployPayment`,
  `verifyCasperCep18Payment`, `CasperPaymentVerificationError`, deploy/envelope
  parsing, recipient purse resolution via `getAccountInfo` / `getLatestEntity`.
- `backend/src/orders/core.js` — `insertPendingPaymentOrder` (the single
  canonical `pending_payment` INSERT shared by all API surfaces).
- `backend/src/policy.js` — `checkPolicy`, `recordDecision`.
- `backend/src/fulfillment.js` — `isFrozen`, `enqueueWebhook`, `fireWebhook`,
  `scheduleRefund`, `refundOrQuarantine`, `quarantineForManualRecovery`,
  per-origin circuit breaker, card-redaction for persisted webhook copies.
- `backend/src/lib/` — `card-vault.js`, `secret-box.js`, `hmac.js`, `ssrf.js`,
  `audit.js`, `event-bus.js`, `logger.js`, `permissions.js`.
