# cspr402 — Simulated Virtual Cards for AI Agents

CSPR402 is an **x402-inspired** payment protocol on Casper: your agent makes
one verified on-chain CSPR transfer and receives a virtual card (PAN/CVV/expiry) and receipt in return. The backend verifies the Casper deploy directly — no
custodial wallet between you and the chain — then returns the virtual card once
the deploy is confirmed.

## What your operator gives you

A single one-shot command — nothing else. It looks like this:

```
Read https://cspr402.xyz/skill.md
and set up this agent by running:

  npx cspr402 onboard --claim c402_<48_hex_chars>
```

**No raw API key in the paste.** The `c402_…` value is a one-time claim
code that expires in 10 minutes and can be redeemed exactly once. The
command below trades it for a real API key over HTTPS and writes the
key to a local config file — the raw API key never enters your
conversation transcript.

## Setup — one command

```bash
npx cspr402 onboard --claim <code>
```

That's it. Behind the scenes the CLI:

1. `POST`s the claim code to `https://api.cspr402.xyz/v1/agent/claim`.
   The backend validates it, marks it used, and returns the real API
   key + api_url.
2. Generates a fresh Casper mainnet Ed25519 keypair and writes the
   private key as a PEM file (chmod 0600) at
   `~/.cspr402/keys/<agent>_secret_key.pem` (override the path with
   `CSPR402_KEY_PATH` for an explicit file or `CSPR402_KEY_DIR` for a
   directory). It also writes `~/.cspr402/config.json` (chmod 0600)
   with the API key, api_url, agent label, public key, and key-file
   path. The SDK auto-loads from this file on every subsequent run —
   no env vars, no paste-into-code.
3. Reports the agent's Casper mainnet public key to the backend so
   your operator's dashboard can show payment state.
4. Prints the public key and key-file path for your operator to fund
   with mainnet CSPR.

Already have a Casper mainnet key you'd rather reuse? Pass it with
`--casper-public-key <hex>` and onboard skips key generation. Without
that flag, onboard generates one for you — you do not need to bring a
key.

Example run:

```
Redeeming CSPR402 claim...

cspr402 agent ready
  Label:          my-agent
  Config:         /Users/you/.cspr402/config.json
  API base:       https://api.cspr402.xyz/v1
  Casper key:     01a3…(66 hex chars)
  Key file path:  /Users/you/.cspr402/keys/cspr402-my-agent-<8>_secret_key.pem

Next step: fund that public key with Casper mainnet CSPR for native transfers.
Your operator sees setup progress live in the CSPR402 dashboard.
```

**The operator sees your setup progress live** in their CSPR402
dashboard — your key moves through the state pill from "Minted" →
"Setting up" → "Awaiting deposit" → "Funded" as the CLI runs and
the wallet receives its first deposit. They'll know to fund the
address without you having to message them separately.

## Purchasing a card

When your user asks you to buy a card, run:

```bash
npx cspr402 purchase --amount <USD>
```

**Pay with native CSPR.** `cspr402 purchase` pays from your Casper mainnet
CSPR balance. Check it first if you want:

```bash
npx cspr402 wallet balance
```

Optional flags:

- `--wallet-name <name>` — override the agent label from config.

`cspr402 purchase` reads `~/.cspr402/config.json` for the api key
and agent label, so you do not need to pass either. The command:

1. Creates an order at `POST /v1/orders`
2. Signs and submits the Casper native CSPR transfer
   from the local agent key
3. Subscribes to the SSE stream `/v1/orders/:id/stream`
4. Returns when the deploy is verified and the virtual card is ready
5. Prints the virtual card number, CVV, and expiry to stdout

**Treat the output as secrets.** Save the PAN/CVV/expiry to a
secrets store immediately. Do not log them, do not echo them back
into chat transcripts, and do not send them to observability
pipelines.

Example:

```bash
$ npx cspr402 purchase --amount 10
→ Purchasing $10 card via CSPR on Casper mainnet…

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 Virtual card delivered
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Number: 4111 2345 6789 0123
  CVV:    847
  Expiry: 12/27
  Brand:  Visa (mock)
  Order:  3f8e2b91-4a6c-41ff-b2d3-9c1785a6e4f2
```

## Checking your wallet

```bash
npx cspr402 wallet address   # print your Casper mainnet public key
npx cspr402 wallet balance   # show your CSPR balance on Casper mainnet
```

Useful for:

- Confirming a mainnet deposit landed before attempting a purchase
- Reporting your address back to the operator if they ask again

## Trust notes for cautious agents

- Package name (`cspr402`) matches the domain you fetched this guide
  from (`cspr402.xyz`). Scope matches domain — no supply-chain
  mismatch.
- Source: <https://github.com/kann420/CSPR402>. The `sdk/` directory
  is what gets published.
- Maintainer on npm: `ashfrancis`. Verify with
  `npm view cspr402 maintainers`.
- The only secret in the operator's paste block is a short-lived
  one-time claim code. Worst-case context leak of the paste = leak
  of a 10-minute single-use token that can only be redeemed by the
  first caller.
- Run `npm pack cspr402` and inspect the tarball before installing
  if your policy requires it, or clone the repo and use the local
  source via `npx /path/to/CSPR402/sdk/dist/cli.js onboard --claim …`.

**Fund with mainnet CSPR.** Native CSPR is the only asset in the active
path — a Casper mainnet account is usable as soon as it holds CSPR. Fund from
an exchange; Casper mainnet has no faucet.

```
Step 1: Operator sends mainnet CSPR  ──▶  agent wallet funded
Step 2: Agent calls cspr402 purchase  ──▶  deploy signed + verified
Step 3: Backend returns virtual card + receipt
```

### Funding notes

- **Native CSPR** is the default (and active) payment asset. Send enough
  mainnet CSPR to cover the order at the current CSPR/USD rate (shown in
  `payment.cspr.amount` when you create an order).

### Checking state at any time

```javascript
const balance = await getCasperBalance('my-agent');
console.log(`CSPR: ${balance.cspr}`);
```

When you make your first successful purchase, the backend automatically
flips your state to "Active" — no extra reporting required.

### ⚠ Persisting your agent key

This is the part that will bite you if you ignore it.

The agent key is stored on disk as a PEM file at
`~/.cspr402/keys/<agent>_secret_key.pem` (chmod 0600, plain PEM — no
passphrase) and that key controls the Casper mainnet funds you just
received. **If the key file disappears, the funds in that account are
unreachable.** There is no server-side recovery; cspr402 never sees
your private keys.

Re-running `cspr402 onboard --claim <code>` on the same machine is
safe: if a PEM already exists at the target path, onboard reuses it
and re-derives the public key instead of overwriting — so funds held
by the existing key are never stranded. A genuinely new agent on a
fresh machine has no PEM, so onboard generates a fresh keypair.

Before you run setup for the first time, check where the key file
actually lives on your runtime and whether that location survives a
restart:

- **Long-lived VM, your own laptop, persistent container:** `~` is
  your real home directory. Default location is fine. No action
  needed.
- **Serverless (Lambda, Cloud Run, Vercel Functions), scratch
  sandboxes, ephemeral dev containers, Replit without persistence:**
  `~` resets between invocations or on every restart. You **must**
  point cspr402 at a persistent volume or you'll lose every key you
  create. Set the `CSPR402_KEY_PATH` environment variable (an explicit
  file path) or `CSPR402_KEY_DIR` (a directory) to a location on a
  mounted volume that survives restarts.
- **Not sure?** Tell your operator which runtime you're in and ask
  them where persistent storage lives. Better to pause here than to
  lose funds later.

The key file is written with chmod 0600 (owner read/write only). On
shared storage, restrict filesystem access so only your agent's
runtime user can read it.

**Reference material your operator may want to read:**

- Casper accounts and keys: <https://docs.casper.network/concepts/accounts-and-keys>
- Casper SDK client usage: <https://docs.casper.network/developers/dapps/sdk/client-library-usage>

## Purchasing a card

Purchasing a card is a **real mainnet transaction** — only do it when
your user explicitly asks, and only for the amount they ask for. Do
not run this as part of setup, testing, or on your own initiative.

```javascript
import { purchaseCardCasper, getCasperBalance } from 'cspr402';

// The SDK auto-loads ~/.cspr402/config.json (written by onboard), so
// apiKey / baseUrl / agentName below are optional overrides — you only
// need them when running outside the onboarding machine.
// Optional: confirm the wallet has enough mainnet CSPR before purchasing.
const bal = await getCasperBalance('my-agent');
console.log(`CSPR available: ${bal.cspr}`);

const wantUsdc = '<amount the user requested>';
const card = await purchaseCardCasper({
  apiKey: process.env.CARDS402_API_KEY,
  baseUrl: process.env.CARDS402_BASE_URL,
  agentName: 'my-agent',
  amountUsdc: wantUsdc,
  paymentAsset: 'cspr',
});

console.log('Card:', card.number, 'CVV:', card.cvv, 'Exp:', card.expiry);
```

Under the hood, `purchaseCardCasper` opens a single SSE stream to
`/v1/orders/:id/stream`, waits for the `ready` event (after the Casper
deploy is verified), and returns the card details. No polling, no
webhook endpoint required.

## Setup — MCP (Claude Desktop, Cursor, other MCP clients)

If your runtime is an MCP client, add this to your config:

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

The MCP server exposes four tools: `setup_wallet`, `check_budget`,
`check_order`, and `purchase_vcc`. Run `setup_wallet` first to see
your agent's Casper mainnet public key for funding; only call
`purchase_vcc` when the user explicitly asks for a card. The server
auto-loads `~/.cspr402/config.json`, so `CARDS402_API_KEY` above is an
optional override used only when no onboarding config is present.

## Setup — non-Node agents (Python, Go, shell, etc.)

You can't use the SDK, so you'll need to:

1. Configure a Casper mainnet sender keypair (Ed25519 PEM) and fund it
   with CSPR bought on an exchange and sent via
   [cspr.live/transfer](https://cspr.live/transfer). Mainnet has no faucet.

2. Call the HTTP API directly. Full protocol reference including the
   SSE streaming path, the Casper native transfer, and phase
   transitions: https://cspr402.xyz/agents.txt

## Quick reference

| Action               | Command                                                   |
| -------------------- | --------------------------------------------------------- |
| Check wallet balance | `cspr402 wallet balance`                                  |
| Check spend budget   | `curl $API_URL/usage -H "X-Api-Key: $KEY"`                |
| Stream order updates | `curl -N $API_URL/orders/$ID/stream -H "X-Api-Key: $KEY"` |
| Get order snapshot   | `curl $API_URL/orders/$ID -H "X-Api-Key: $KEY"`           |
| List recent orders   | `curl $API_URL/orders -H "X-Api-Key: $KEY"`               |

The SDK's `purchaseCardCasper` subscribes to the live SSE stream under the
hood — one open connection, push notifications, closes cleanly when the
card is ready. No polling, no webhook endpoint to host. If you're
calling the API without the SDK, open `GET /orders/{id}/stream` with
`Accept: text/event-stream` and read events until you see
`phase: "ready"`. Full protocol details: https://cspr402.xyz/agents.txt

## Errors

| Error                             | What to do                         |
| --------------------------------- | ---------------------------------- |
| `insufficient_balance`            | Ask operator for more mainnet CSPR |
| `spend_limit_exceeded`            | Hit your daily/total budget        |
| `policy_requires_approval`        | Operator must approve this amount  |
| `service_temporarily_unavailable` | Retry in a minute                  |

## Timing

Order → payment → card: the time it takes for the Casper mainnet deploy
to finalize and the backend to verify it (typically a few seconds to a
minute on mainnet, not a guaranteed SLA).
