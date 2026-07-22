# CSPR402 Agent Examples

Casper mainnet integrations for the CSPR402 MVP. The Node example can
create an order, send native CSPR or mockUSDC CEP-18 with the Casper JS SDK,
verify the deploy, then receive a simulated virtual card.

## Quick Start

1. Start the backend with `PAYMENT_PROVIDER=casper`.
2. Create or copy a local API key from the backend/dev database.
3. Fund a Casper mainnet sender key — buy CSPR on an exchange and send via https://cspr.live/transfer (mainnet has no faucet).
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

Uses the REST API directly via `httpx`. A Casper mainnet payment step is
needed before it is a full CSPR402 demo.

```bash
cd python-agent
pip install -r requirements.txt
CARDS402_API_KEY=cards402_... CARDS402_BASE_URL=http://localhost:4000/v1 python main.py
```

### `langchain-tool/` - LangChain Custom Tools

Three LangChain `BaseTool` subclasses:

- `CSPR402OrderTool` - create a card order
- `CSPR402CheckOrderTool` - poll order status / get card details
- `CSPR402BudgetTool` - check spend vs limit

These are useful reference material for the Casper demo path.

## Legacy Notes

The repo may still contain legacy Stellar/OWS examples and MCP code. They are
slated for removal, not the Casper demo path.

## API Reference

See [`api/agent-api.openapi.yaml`](../api/agent-api.openapi.yaml)
for the agent-facing API contract.
