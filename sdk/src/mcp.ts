// MCP server entry. Exposed via `cspr402 mcp` and dispatched through ./cli.
// The server creates/verifies CSPR402 orders and, when an agent key +
// CASPER_NODE_RPC_URL are configured, can sign and submit Casper native
// transfers via the `pay_order` tool. Private keys are loaded lazily from
// disk by casper-signer, never logged, and never returned in tool output.
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { CSPR402Client, type PaymentInstructions } from './client';
import { loadCards402Config } from './config';
import { payAndVerifyOrder, signingConfigured, SignerError } from './casper-signer';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const PKG_VERSION = require('../package.json').version as string;

const CASPER_PUBLIC_KEY_RE = /^(01[0-9a-f]{64}|02[0-9a-f]{66})$/i;
const DEPLOY_HASH_RE = /^[0-9a-fA-F]{64}$/;
const ORDER_ID_RE = /^[a-zA-Z0-9_-]{1,64}$/;

function normalizePublicKey(value: unknown, label = 'public key'): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const normalized = String(value).trim().toLowerCase();
  if (!CASPER_PUBLIC_KEY_RE.test(normalized)) {
    throw new Error(`${label} must be a Casper public key hex string.`);
  }
  return normalized;
}

function parseAmount(value: unknown): string {
  const amount = String(value ?? '').trim();
  if (!/^\d+(\.\d{1,2})?$/.test(amount)) {
    throw new Error("amount_usdc must be a decimal string like '25.00'.");
  }
  const cents = Math.round(Number(amount) * 100);
  if (!Number.isFinite(cents) || cents < 1) throw new Error('amount_usdc must be at least 0.01.');
  if (cents > 1_000_000) throw new Error('amount_usdc cannot exceed 10000.00.');
  return amount;
}

function parseOrderId(value: unknown): string {
  const orderId = String(value ?? '').trim();
  if (!ORDER_ID_RE.test(orderId)) throw new Error('order_id is invalid.');
  return orderId;
}

function parseDeployHash(value: unknown): string {
  const deployHash = String(value ?? '')
    .trim()
    .toLowerCase();
  if (!DEPLOY_HASH_RE.test(deployHash))
    throw new Error('deploy_hash must be a 64-character Casper deploy hash.');
  return deployHash;
}

function configuredPublicKey(): string | undefined {
  return normalizePublicKey(
    process.env.CSPR402_CASPER_PUBLIC_KEY || loadCards402Config()?.casper_public_key,
    'configured Casper public key',
  );
}

function client(): CSPR402Client {
  return new CSPR402Client();
}

function safeMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message.slice(0, 240) : fallback;
}

function paymentText(payment: PaymentInstructions): string[] {
  if (payment.type === 'casper_cspr_transfer') {
    return [
      'Payment rail: Casper mainnet CSPR',
      `chain_name: ${payment.chain_name}`,
      `recipient: ${payment.recipient}`,
      payment.sender_public_key
        ? `sender_public_key: ${payment.sender_public_key}`
        : 'sender_public_key: not bound',
      `amount_cspr: ${payment.amount_cspr}`,
      `amount_motes: ${payment.amount_motes}`,
      `transfer_id: ${payment.transfer_id}`,
      `expires_at: ${payment.expires_at}`,
    ];
  }
  if (payment.type === 'casper_cep18_transfer') {
    return [
      'Payment rail: mockUSDC CEP-18',
      `chain_name: ${payment.chain_name}`,
      `contract_package_hash: ${payment.contract_package_hash}`,
      payment.contract_hash
        ? `contract_hash: ${payment.contract_hash}`
        : 'contract_hash: not configured',
      `sender_public_key: ${payment.sender_public_key}`,
      `recipient_public_key: ${payment.recipient_public_key}`,
      `amount: ${payment.amount} mockUSDC`,
      `amount_base_units: ${payment.amount_base_units}`,
      `expires_at: ${payment.expires_at}`,
    ];
  }
  return [`Unsupported legacy payment instruction: ${payment.type}`];
}

function toolArgs(input: unknown): Record<string, unknown> {
  return (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
}

const server = new Server(
  { name: 'cspr402', version: PKG_VERSION },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'purchase_vcc',
      description:
        'Create a CSPR402 virtual card order and return Casper payment instructions. The agent must pay externally, then call verify_payment.',
      inputSchema: {
        type: 'object',
        properties: {
          amount_usdc: {
            type: 'string',
            pattern: '^\\d+(\\.\\d{1,2})?$',
            description: "Virtual card value in USD, for example '25.00'.",
          },
          payment_asset: {
            type: 'string',
            enum: ['cspr_casper', 'mock_usdc_cep18'],
            description: 'Payment rail. Default is cspr_casper.',
          },
          payer_public_key: {
            type: 'string',
            description: 'Casper mainnet public key to bind the order to a sender.',
          },
        },
        required: ['amount_usdc'],
      },
    },
    {
      name: 'verify_payment',
      description: 'Verify a finalized Casper mainnet deploy hash for an existing CSPR402 order.',
      inputSchema: {
        type: 'object',
        properties: {
          order_id: { type: 'string', description: 'CSPR402 order id' },
          deploy_hash: { type: 'string', description: '64-character Casper deploy hash' },
          sender_public_key: { type: 'string', description: 'Casper sender public key' },
        },
        required: ['order_id', 'deploy_hash'],
      },
    },
    {
      name: 'pay_order',
      description:
        'Pay and verify a pending CSPR402 Casper CSPR order using this agent’s local key. ' +
        'Re-fetches the order from the backend and signs EXACTLY the backend-supplied ' +
        'recipient, amount, transfer_id, and chain_name (transported over HTTPS) — it ' +
        'never accepts a destination or amount from the caller, so it cannot be steered ' +
        'to pay a different address by prompt injection. Optional treasury allowlist ' +
        '(CSPR402_TREASURY_PUBLIC_KEYS) further refuses unapproved recipients. ' +
        'Requires CASPER_NODE_RPC_URL and an agent key written by `cspr402 onboard`. ' +
        'Call after purchase_vcc to auto-complete the card without manual on-chain work. ' +
        'Returns the deploy hash and a masked card (brand only — never PAN/CVV).',
      inputSchema: {
        type: 'object',
        properties: {
          order_id: { type: 'string', description: 'CSPR402 order id to pay and verify' },
        },
        required: ['order_id'],
      },
    },
    {
      name: 'check_order',
      description: 'Check the status of a CSPR402 order.',
      inputSchema: {
        type: 'object',
        properties: {
          order_id: { type: 'string', description: 'CSPR402 order id' },
        },
        required: ['order_id'],
      },
    },
    {
      name: 'check_budget',
      description: 'Check this agent API key spend summary and remaining budget.',
      inputSchema: { type: 'object', properties: {}, required: [] },
    },
    {
      name: 'setup_wallet',
      description:
        'Inspect the configured Casper public key/key path. This tool is read-only and never reads private key material.',
      inputSchema: { type: 'object', properties: {}, required: [] },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const name = request.params.name;
  const args = toolArgs(request.params.arguments);

  if (name === 'setup_wallet') {
    try {
      const config = loadCards402Config();
      const publicKey = configuredPublicKey();
      return {
        content: [
          {
            type: 'text',
            text: [
              'CSPR402 wallet context',
              '',
              `Casper public key: ${publicKey || 'not configured'}`,
              // Mask the key file: never surface the absolute PEM path into
              // the LLM transcript — that would pre-stage the exact exfil
              // target for a later prompt-injection. Show only whether it's
              // configured; the operator views the full path on their own
              // machine via 'cspr402 wallet key-path'.
              `Key file:         ${
                config?.casper_key_path || process.env.CSPR402_CASPER_KEY_PATH
                  ? 'configured (path hidden; use CLI ' + "'wallet key-path' to view)"
                  : 'not configured'
              }`,
              `API URL:           ${config?.api_url || process.env.CSPR402_BASE_URL || 'not configured'}`,
              '',
              'To finish setup, run:',
              '  cspr402 onboard --claim <claim_code>',
              '',
              'Onboard auto-generates a Casper mainnet Ed25519 keypair and reports the',
              "public key to your operator's dashboard. Add --casper-public-key <hex>",
              'only if you want to reuse a pre-existing key.',
              '',
              signingConfigured()
                ? 'Auto-pay is ON. After purchase_vcc, call pay_order { order_id } to sign, submit, and verify the Casper transfer with this agent’s key — no manual on-chain step.'
                : 'Auto-pay is OFF. Set CASPER_NODE_RPC_URL (and run onboard so an agent key exists) to enable pay_order; otherwise pay via Casper Wallet/CSPR.click and call verify_payment.',
            ].join('\n'),
          },
        ],
      };
    } catch (err) {
      return {
        content: [
          {
            type: 'text',
            text: `Error reading wallet context: ${safeMessage(err, 'setup failed')}`,
          },
        ],
        isError: true,
      };
    }
  }

  if (name === 'purchase_vcc') {
    try {
      const amount_usdc = parseAmount(args.amount_usdc);
      const payment_asset =
        args.payment_asset === 'mock_usdc_cep18' ? 'mock_usdc_cep18' : 'cspr_casper';
      const payer_public_key =
        normalizePublicKey(args.payer_public_key, 'payer_public_key') || configuredPublicKey();
      if (payment_asset === 'mock_usdc_cep18' && !payer_public_key) {
        throw new Error('mock_usdc_cep18 requires payer_public_key.');
      }
      const order = await client().createOrder({
        amount_usdc,
        payment_asset,
        ...(payer_public_key ? { payer_public_key } : {}),
      });
      return {
        content: [
          {
            type: 'text',
            text: [
              `Order: ${order.order_id}`,
              `Status: ${order.status}`,
              '',
              ...paymentText(order.payment),
              '',
              ...(signingConfigured()
                ? [
                    'This agent can auto-pay. Complete the card with:',
                    `pay_order { order_id: "${order.order_id}" }`,
                  ]
                : [
                    'After the Casper transfer finalizes, call:',
                    `verify_payment { order_id: "${order.order_id}", deploy_hash: "<hash>" }`,
                  ]),
            ].join('\n'),
          },
        ],
      };
    } catch (err) {
      return {
        content: [
          {
            type: 'text',
            text: `Error creating CSPR402 order: ${safeMessage(err, 'create failed')}`,
          },
        ],
        isError: true,
      };
    }
  }

  if (name === 'verify_payment') {
    try {
      const orderId = parseOrderId(args.order_id);
      const deployHash = parseDeployHash(args.deploy_hash);
      const senderPublicKey =
        normalizePublicKey(args.sender_public_key, 'sender_public_key') || configuredPublicKey();
      const verified = await client().verifyCasperPayment(orderId, deployHash, {
        ...(senderPublicKey ? { senderPublicKey } : {}),
      });
      const lines = [
        `Verified: ${verified.ok}`,
        verified.note ? `Note: ${verified.note}` : null,
        `Order: ${verified.order.order_id}`,
        `Status: ${verified.order.status} (phase: ${verified.order.phase})`,
        `Receipt: ${verified.receipt.type}`,
        `Deploy: ${verified.receipt.deploy_hash}`,
        verified.order.card
          ? `Virtual card: ${verified.order.card.brand || 'CSPR402 Virtual Card'}`
          : null,
      ].filter(Boolean) as string[];
      return { content: [{ type: 'text', text: lines.join('\n') }] };
    } catch (err) {
      return {
        content: [
          { type: 'text', text: `Error verifying payment: ${safeMessage(err, 'verify failed')}` },
        ],
        isError: true,
      };
    }
  }

  if (name === 'pay_order') {
    try {
      const orderId = parseOrderId(args.order_id);
      const result = await payAndVerifyOrder(client(), orderId, {
        onPending: (attempt) => {
          // Best-effort progress line — swallowed if the client isn't
          // streaming. Kept off the final tool result so the result stays
          // a clean card-fulfilled block.
          process.stderr.write(
            `Payment still pending on Casper mainnet, retrying verify (attempt ${attempt})...\n`,
          );
        },
      });
      const verified = result.verified;
      const lines = [
        `Order: ${verified.order.order_id}`,
        `Status: ${verified.order.status} (phase: ${verified.order.phase})`,
        `Receipt: ${verified.receipt.type}`,
        `Deploy: ${verified.receipt.deploy_hash}`,
        verified.note ? `Note: ${verified.note}` : null,
        // Masked only — PAN/CVV never enter the LLM transcript. The
        // operator retrieves full card details via the dashboard or the
        // CLI/node-agent on the agent's own machine.
        verified.order.card
          ? `Virtual card: ${verified.order.card.brand || 'CSPR402 Virtual Card'} (masked)`
          : null,
        result.submitted
          ? 'Funded by a fresh on-chain transfer.'
          : 'Re-verified an existing transfer.',
      ].filter(Boolean) as string[];
      return { content: [{ type: 'text', text: lines.join('\n') }] };
    } catch (err) {
      const message =
        err instanceof SignerError
          ? `${err.message}${err.deployHash ? ` (deploy ${err.deployHash})` : ''}`
          : safeMessage(err, 'pay failed');
      return {
        content: [{ type: 'text', text: `Error paying order: ${message}` }],
        isError: true,
      };
    }
  }

  if (name === 'check_order') {
    try {
      const order = await client().getOrder(parseOrderId(args.order_id));
      const lines = [
        `Order: ${order.order_id}`,
        `Status: ${order.status} (phase: ${order.phase})`,
        `Amount: $${order.amount_usdc}`,
        `Payment asset: ${order.payment_asset}`,
        `Created: ${order.created_at}`,
        `Updated: ${order.updated_at}`,
      ];
      if (order.receipt) {
        lines.push(`Receipt: ${order.receipt.type}`);
        lines.push(`Deploy: ${order.receipt.deploy_hash}`);
      }
      if (order.card) lines.push(`Virtual card: ${order.card.brand || 'CSPR402 Virtual Card'}`);
      if (order.error) lines.push(`Error: ${order.error}`);
      if (order.note) lines.push(`Note: ${order.note}`);
      return { content: [{ type: 'text', text: lines.join('\n') }] };
    } catch (err) {
      return {
        content: [
          { type: 'text', text: `Error checking order: ${safeMessage(err, 'check failed')}` },
        ],
        isError: true,
      };
    }
  }

  if (name === 'check_budget') {
    try {
      const usage = await client().getUsage();
      const { budget, orders, label } = usage;
      const lines = [
        `Budget summary${label ? ` for "${label}"` : ''}`,
        '',
        `Spent:     $${budget.spent_usdc}`,
        budget.limit_usdc ? `Limit:     $${budget.limit_usdc}` : 'Limit:     unlimited',
        budget.remaining_usdc !== null
          ? `Remaining: $${budget.remaining_usdc}`
          : 'Remaining: unlimited',
        '',
        `Orders: total ${orders.total}, delivered ${orders.delivered}, failed ${orders.failed}, in progress ${orders.in_progress}`,
      ];
      return { content: [{ type: 'text', text: lines.join('\n') }] };
    } catch (err) {
      return {
        content: [
          { type: 'text', text: `Error checking budget: ${safeMessage(err, 'budget failed')}` },
        ],
        isError: true,
      };
    }
  }

  return {
    content: [{ type: 'text', text: `Unknown tool: ${name}` }],
    isError: true,
  };
});

export async function startMcpServer(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
