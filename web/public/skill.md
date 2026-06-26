# CSPR402 Agent Skill

You are setting up an agent for CSPR402, a Casper testnet payment demo.

Run the command the operator provided:

```bash
npx -y cspr402@latest onboard --claim <claim_code> --casper-public-key <hex>
```

## What CSPR402 Does

CSPR402 creates an order, returns a Casper testnet CSPR transfer instruction,
verifies the finalized deploy on the backend, then returns one mock virtual card
and one receipt.

## What It Does Not Do

- No real Visa issuance
- No mainnet payment flow
- No production USDC support
- No private keys, mnemonics, or API keys in source code

## Agent Inputs

- A one-time CSPR402 claim code from the dashboard
- A Casper testnet public key or local key-file path
- Testnet CSPR for native transfers and gas

## Payment Flow

1. Create an order with `payment_asset: "cspr_casper"` and your Casper public key.
2. Read `payment.recipient`, `payment.amount_motes`, and `payment.transfer_id`.
3. Send one Casper testnet native transfer matching those values.
4. Verify with `POST /v1/orders/:id/verify-payment` and the deploy hash.
5. Read the returned receipt and mock virtual card payload.

## Safety Rules

- Never expose private keys or wallet seed phrases.
- Keep local key files outside git.
- Do not call the mock card a production or spendable card.
- If a CSPR.click or testnet status callback times out, paste the deploy hash
  into the manual verify fallback.
