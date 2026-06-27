import {
  CSPR402Client,
  Cards402Error,
  type OrderResponse,
  type PaymentInstructions,
  type VerifyCasperPaymentResponse,
} from '../client';
import { loadCards402Config } from '../config';

type PaymentAsset = 'cspr_casper' | 'mock_usdc_cep18';

interface PurchaseArgs {
  amount?: string;
  asset?: PaymentAsset;
  assetInvalid?: string;
  payerPublicKey?: string;
  orderId?: string;
  verifyDeployHash?: string;
  senderPublicKey?: string;
  noWait?: boolean;
  help?: boolean;
}

const CASPER_PUBLIC_KEY_RE = /^(01[0-9a-f]{64}|02[0-9a-f]{66})$/i;
const ORDER_ID_RE = /^[a-zA-Z0-9_-]{1,64}$/;

function parseArgs(argv: string[]): PurchaseArgs {
  const out: PurchaseArgs = {};
  const takeAsset = (value: string | undefined): void => {
    if (!value) return;
    if (value === 'cspr_casper' || value === 'mock_usdc_cep18') out.asset = value;
    else out.assetInvalid = value;
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg) continue;
    if (arg === '-h' || arg === '--help') out.help = true;
    else if (arg === '-a' || arg === '--amount') out.amount = argv[++i];
    else if (arg.startsWith('--amount=')) out.amount = arg.slice('--amount='.length);
    else if (arg === '--asset') takeAsset(argv[++i]);
    else if (arg.startsWith('--asset=')) takeAsset(arg.slice('--asset='.length));
    else if (arg === '--payer-public-key' || arg === '--public-key') out.payerPublicKey = argv[++i];
    else if (arg.startsWith('--payer-public-key='))
      out.payerPublicKey = arg.slice('--payer-public-key='.length);
    else if (arg.startsWith('--public-key='))
      out.payerPublicKey = arg.slice('--public-key='.length);
    else if (arg === '--sender-public-key') out.senderPublicKey = argv[++i];
    else if (arg.startsWith('--sender-public-key='))
      out.senderPublicKey = arg.slice('--sender-public-key='.length);
    else if (arg === '--order' || arg === '--order-id') out.orderId = argv[++i];
    else if (arg.startsWith('--order=')) out.orderId = arg.slice('--order='.length);
    else if (arg.startsWith('--order-id=')) out.orderId = arg.slice('--order-id='.length);
    else if (arg === '--verify') out.verifyDeployHash = argv[++i];
    else if (arg.startsWith('--verify=')) out.verifyDeployHash = arg.slice('--verify='.length);
    else if (arg === '--no-wait') out.noWait = true;
  }
  return out;
}

// Casper mainnet finality is ~16s/block, and a deploy can sit in the mempool
// for several blocks before executing. The backend returns 425
// (payment_pending) until the deploy is finalized. Without this loop the CLI
// throws on the first 425 and exits, forcing the operator to re-run `purchase
// --verify` by hand every block — which is where the multi-minute purchase
// latency came from. Mirror node-agent's verifyPaymentWithRetry instead.
const VERIFY_TIMEOUT_MS = parsePositiveEnv('CSPR402_VERIFY_TIMEOUT_MS', 300000);
const VERIFY_POLL_MS = parsePositiveEnv('CSPR402_VERIFY_POLL_MS', 5000);

function parsePositiveEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.floor(n);
}

async function verifyPaymentWithRetry(
  client: CSPR402Client,
  orderId: string,
  deployHash: string,
  senderPublicKey: string | undefined,
): Promise<VerifyCasperPaymentResponse> {
  const deadline = Date.now() + VERIFY_TIMEOUT_MS;
  let attempts = 0;
  // First attempt is immediate so a fast (already-finalized) verify still
  // returns in one round-trip with no delay.
  while (Date.now() < deadline) {
    attempts += 1;
    try {
      return await client.verifyCasperPayment(orderId, deployHash, {
        ...(senderPublicKey ? { senderPublicKey } : {}),
      });
    } catch (err) {
      const pending =
        err instanceof Cards402Error && (err.status === 425 || err.code === 'payment_pending');
      if (!pending || Date.now() + VERIFY_POLL_MS >= deadline) throw err;
      process.stdout.write(
        `Payment still pending on Casper mainnet, retrying verify in ${VERIFY_POLL_MS}ms (attempt ${attempts})...\n`,
      );
      await new Promise((r) => setTimeout(r, VERIFY_POLL_MS));
    }
  }
  throw new Error(
    `Timed out waiting for Casper payment verification after ${attempts} attempts ` +
      `(${VERIFY_TIMEOUT_MS / 1000}s). Poll the order status or re-run with a larger CSPR402_VERIFY_TIMEOUT_MS.`,
  );
}

function usage(): void {
  process.stderr.write(`Usage:
  cspr402 purchase --amount <USD> [--payer-public-key <hex>]
  cspr402 purchase --amount <USD> --asset mock_usdc_cep18 --payer-public-key <hex>
  cspr402 purchase --order <order-id> --verify <deploy-hash> [--sender-public-key <hex>]

Creates a CSPR402 order and prints Casper mainnet payment instructions. The CLI
does not store private key material or sign transfers. Pay from Casper Wallet,
CSPR.click, casper-client, or your own agent runtime, then verify the deploy hash.

Options:
  -a, --amount <USD>              Virtual card value, for example 25.00
  --asset <asset>                 cspr_casper (default) or mock_usdc_cep18
  --payer-public-key <hex>        Casper mainnet public key to bind the order
  --order <order-id>              Existing order to verify
  --verify <deploy-hash>          Casper deploy hash to verify
  --sender-public-key <hex>       Sender public key for verify; defaults to payer/config key
  --no-wait                       Verify once and exit on 425 pending instead of polling
  -h, --help                      Show this message

Verify polls the backend every CSPR402_VERIFY_POLL_MS (default 5000) until the
deploy finalizes, up to CSPR402_VERIFY_TIMEOUT_MS (default 300000). Casper
mainnet finality is ~16s/block, so a pending deploy normally clears in well
under the 5-minute budget. Use --no-wait for the old one-shot behavior.

Examples:
  cspr402 purchase --amount 10 --payer-public-key 01...
  cspr402 purchase --order ord_123 --verify <64-char-deploy-hash>
`);
}

function normalizeCasperPublicKey(value: string | undefined, label: string): string | undefined {
  if (!value) return undefined;
  const normalized = value.trim().toLowerCase();
  if (!CASPER_PUBLIC_KEY_RE.test(normalized)) {
    throw new Error(`${label} must be a Casper public key hex string.`);
  }
  return normalized;
}

function validateAmount(amount: string | undefined): string {
  if (!amount) throw new Error('--amount <USD> is required.');
  if (!/^\d+(\.\d{1,2})?$/.test(amount)) {
    throw new Error('--amount must be a decimal string with up to 2 decimal places.');
  }
  const cents = Math.round(Number(amount) * 100);
  if (!Number.isFinite(cents) || cents < 1) throw new Error('--amount must be at least 0.01.');
  if (cents > 1_000_000) throw new Error('--amount cannot exceed 10000.00.');
  return amount;
}

function validateOrderId(orderId: string | undefined): string {
  if (!orderId || !ORDER_ID_RE.test(orderId)) {
    throw new Error('--order must be a valid CSPR402 order id.');
  }
  return orderId;
}

function validateDeployHash(deployHash: string | undefined): string {
  const normalized = (deployHash || '').trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(normalized)) {
    throw new Error('--verify must be a 64-character Casper deploy hash.');
  }
  return normalized;
}

function configuredPayer(args: PurchaseArgs): string | undefined {
  const config = loadCards402Config();
  return normalizeCasperPublicKey(
    args.payerPublicKey ||
      args.senderPublicKey ||
      process.env.CSPR402_CASPER_PUBLIC_KEY ||
      config?.casper_public_key,
    'payer public key',
  );
}

function printPayment(payment: PaymentInstructions): void {
  process.stdout.write('\nPayment instruction\n');
  process.stdout.write('-------------------\n');
  if (payment.type === 'casper_cspr_transfer') {
    process.stdout.write(`Rail:        Casper mainnet CSPR\n`);
    process.stdout.write(`Chain:       ${payment.chain_name}\n`);
    process.stdout.write(`Recipient:   ${payment.recipient}\n`);
    if (payment.sender_public_key)
      process.stdout.write(`Sender:      ${payment.sender_public_key}\n`);
    process.stdout.write(`Amount:      ${payment.amount_cspr} CSPR\n`);
    process.stdout.write(`Motes:       ${payment.amount_motes}\n`);
    process.stdout.write(`transfer_id: ${payment.transfer_id}\n`);
    process.stdout.write(`Expires:     ${payment.expires_at}\n`);
    return;
  }
  if (payment.type === 'casper_cep18_transfer') {
    process.stdout.write(`Rail:        mockUSDC CEP-18\n`);
    process.stdout.write(`Chain:       ${payment.chain_name}\n`);
    process.stdout.write(`Package:     ${payment.contract_package_hash}\n`);
    if (payment.contract_hash) process.stdout.write(`Contract:    ${payment.contract_hash}\n`);
    process.stdout.write(`Sender:      ${payment.sender_public_key}\n`);
    process.stdout.write(`Recipient:   ${payment.recipient_public_key}\n`);
    process.stdout.write(`Amount:      ${payment.amount} mockUSDC\n`);
    process.stdout.write(`Base units:  ${payment.amount_base_units}\n`);
    process.stdout.write(`Expires:     ${payment.expires_at}\n`);
    return;
  }
  process.stdout.write(`Unsupported legacy payment instruction: ${payment.type}\n`);
}

function printOrder(order: OrderResponse): void {
  process.stdout.write(`Order:       ${order.order_id}\n`);
  process.stdout.write(`Status:      ${order.status}\n`);
  printPayment(order.payment);
  process.stdout.write('\nAfter payment finalizes, verify with:\n');
  process.stdout.write(`  cspr402 purchase --order ${order.order_id} --verify <deploy-hash>\n`);
}

export async function purchaseCommand(argv: string[]): Promise<number> {
  const args = parseArgs(argv);
  if (args.help) {
    usage();
    return 0;
  }

  try {
    if (args.assetInvalid) throw new Error(`--asset must be cspr_casper or mock_usdc_cep18.`);

    const client = new CSPR402Client();

    if (args.verifyDeployHash || args.orderId) {
      const orderId = validateOrderId(args.orderId);
      const deployHash = validateDeployHash(args.verifyDeployHash);
      const senderPublicKey = normalizeCasperPublicKey(
        args.senderPublicKey ||
          args.payerPublicKey ||
          process.env.CSPR402_CASPER_PUBLIC_KEY ||
          loadCards402Config()?.casper_public_key,
        'sender public key',
      );
      const verified = args.noWait
        ? await client.verifyCasperPayment(orderId, deployHash, {
            ...(senderPublicKey ? { senderPublicKey } : {}),
          })
        : await verifyPaymentWithRetry(client, orderId, deployHash, senderPublicKey);
      process.stdout.write(`Payment verified for ${verified.order.order_id}\n`);
      process.stdout.write(`Status: ${verified.order.status} (phase: ${verified.order.phase})\n`);
      process.stdout.write(`Receipt: ${verified.receipt.type}\n`);
      process.stdout.write(`Deploy: ${verified.receipt.deploy_hash}\n`);
      if (verified.order.card) {
        process.stdout.write(
          `Virtual card: ${verified.order.card.brand || 'CSPR402 Virtual Card'}\n`,
        );
      }
      return 0;
    }

    const amount = validateAmount(args.amount);
    const paymentAsset = args.asset || 'cspr_casper';
    const payerPublicKey = configuredPayer(args);
    if (paymentAsset === 'mock_usdc_cep18' && !payerPublicKey) {
      throw new Error(
        'mock_usdc_cep18 requires --payer-public-key so the order is bound to the sender.',
      );
    }

    const order = await client.createOrder({
      amount_usdc: amount,
      payment_asset: paymentAsset,
      ...(payerPublicKey ? { payer_public_key: payerPublicKey } : {}),
    });
    printOrder(order);
    return 0;
  } catch (err) {
    process.stderr.write(`error: ${err instanceof Error ? err.message : String(err)}\n`);
    return 1;
  }
}
