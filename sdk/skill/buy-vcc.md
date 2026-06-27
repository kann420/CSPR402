# Buy VCC

Purchase a simulated virtual card via cspr402.xyz by paying with CSPR (or
mockUSDC) on Casper mainnet.

## Usage

/buy-vcc [amount]

## Instructions

When invoked:

1. Check if `CARDS402_API_KEY` and `CSPR402_AGENT_NAME` are set. If not, explain:
   - `CARDS402_API_KEY` — get one at cspr402.xyz
   - `CSPR402_AGENT_NAME` — the agent label; run `setup_wallet` (MCP) or:
     ```typescript
     import { setupCasperAgent } from 'cspr402';
     const address = setupCasperAgent(process.env.CSPR402_AGENT_NAME!);
     // Fund address with mainnet CSPR, then come back
     ```

2. Ask what amount they want (default $10 if not specified) and whether to pay with native CSPR or mockUSDC (CEP-18).

3. Before purchasing, check the budget:

   ```typescript
   import { CSPR402Client } from 'cspr402';
   const client = new CSPR402Client({ apiKey: process.env.CARDS402_API_KEY! });
   const usage = await client.getUsage();
   ```

   If `usage.budget.remaining_usdc` is not null and the amount exceeds it, tell the user and stop. Show the current budget.

4. Purchase the card:

   ```typescript
   import { purchaseCardCasper } from 'cspr402';

   const card = await purchaseCardCasper({
     apiKey: process.env.CARDS402_API_KEY!,
     agentName: process.env.CSPR402_AGENT_NAME!,
     passphrase: process.env.CSPR402_AGENT_PASSPHRASE,
     keyPath: process.env.CSPR402_KEY_PATH,
     amountUsdc: '10.00', // or whatever the user requested
     paymentAsset: 'cspr', // or 'mock_usdc'
   });
   ```

5. Display the card details:

   ```
   ✅ Virtual Card Ready

   Number: XXXX XXXX XXXX XXXX
   CVV:    XXX
   Expiry: XX/XX
   Brand:  CSPR402 Virtual Card

   Order: <order_id>
   ```

6. Report the updated spend summary:

   ```typescript
   const usage = await client.getUsage();
   ```

   ```
   💳 Spend update for <label>:
   $<spent> spent of $<limit> limit — $<remaining> remaining
   Orders: <delivered> delivered, <failed> failed
   ```

   If there is no limit, say "no limit set".

7. Remind the user this is a one-time use simulated virtual card for the Casper mainnet demo.

## Environment variables needed

- `CARDS402_API_KEY` — your CSPR402 API key (get one at cspr402.xyz)
- `CSPR402_AGENT_NAME` — agent label (must be funded with mainnet CSPR or mockUSDC)
- `CSPR402_AGENT_PASSPHRASE` — agent key encryption passphrase (optional)
- `CSPR402_KEY_PATH` — agent key file path (optional, default: cspr402 config dir)
