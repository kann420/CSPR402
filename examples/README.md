# CSPR402 Agent Examples

Small hackathon integrations for the Casper testnet MVP. The Node example can
create an order, send native CSPR or mockUSDC CEP-18 with the Casper JS SDK,
verify the deploy, then receive a simulated virtual card.

## Quick Start

1. Start the backend with `PAYMENT_PROVIDER=casper`.
2. Create or copy a local API key from the backend/dev database.
3. Fund a Casper testnet sender key with faucet CSPR.
4. Copy `node-agent/.env.example` to `node-agent/.env.local` and fill local values.
5. Keep all API keys, RPC URLs, and key paths in ignored `.env.local` files.

## Examples

### `node-agent/` - Node.js + Casper JS SDK

The recommended Casper demo path. Uses REST for the CSPR402 API and
`casper-js-sdk` for native CSPR or mockUSDC CEP-18 transfer submission.

```bash
cd node-agent
npm install
cp .env.example .env.local
node index.mjs
```

Optional:

```bash
ORDER_AMOUNT_USDC=2.00
ORDER_PAYMENT_ASSET=cspr_casper
CASPER_TRANSFER_PAYMENT_MOTES=100000000
CASPER_CEP18_TRANSFER_PAYMENT_MOTES=3000000000
CASPER_VERIFY_TIMEOUT_MS=300000
CASPER_VERIFY_POLL_MS=5000
```

Set `ORDER_PAYMENT_ASSET=mock_usdc_cep18` only after the backend has a deployed
mockUSDC CEP-18 package hash configured. This is a mock/test token rail, not
official USDC.

### `python-agent/` - Python + REST API

Uses the REST API directly via `httpx`. This legacy example still needs a
Casper payment step before it is a full CSPR402 demo.

```bash
cd python-agent
pip install -r requirements.txt
CARDS402_API_KEY=cards402_... CARDS402_BASE_URL=http://localhost:4000/v1 python main.py
```

### `langchain-tool/` - LangChain Custom Tools

Three LangChain `BaseTool` subclasses from the upstream repo:

- `Cards402OrderTool` - create a card order
- `Cards402CheckOrderTool` - poll order status / get card details
- `Cards402BudgetTool` - check spend vs limit

These are useful reference material, but the payment wording still needs to be
converted from Stellar to Casper before public demo use.

## Legacy Notes

The upstream repo still contains Stellar/OWS examples and MCP code. They are
reference material for this fork, not the Casper demo path.

## API Reference

See [`contract/api/agent-api.openapi.yaml`](../contract/api/agent-api.openapi.yaml)
for the agent-facing API contract.
