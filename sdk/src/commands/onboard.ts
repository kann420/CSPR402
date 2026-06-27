// `cspr402 onboard --claim <code>` - one-shot agent setup.

import { assertSafeBaseUrl, loadCards402Config, saveCards402Config } from '../config';
import {
  generateCasperEd25519Key,
  publicKeyHexFromPem,
  readCasperKeyPemIfExists,
  resolveCasperKeyPath,
  writeCasperKeyFile,
} from '../lib/casper-key';
import { CSPR402Client } from '../client';

export { deriveDefaultWalletName as _deriveDefaultWalletName };

const CASPER_PUBLIC_KEY_RE = /^(01[0-9a-fA-F]{64}|02[0-9a-fA-F]{66})$/;

interface OnboardArgs {
  claim?: string;
  agentName?: string;
  walletName?: string;
  apiBase?: string;
  casperPublicKey?: string;
  casperKeyPath?: string;
  help?: boolean;
}

interface ClaimResponse {
  api_key?: string;
  webhook_secret?: string | null;
  api_key_id?: string;
  label?: string | null;
  api_url?: string;
  error?: string;
  message?: string;
}

function parseArgs(argv: string[]): OnboardArgs {
  const out: OnboardArgs = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === undefined) continue;
    if (arg === '--help' || arg === '-h') out.help = true;
    else if (arg === '--claim') out.claim = argv[++i];
    else if (arg.startsWith('--claim=')) out.claim = arg.slice('--claim='.length);
    else if (arg === '--agent-name') out.agentName = argv[++i];
    else if (arg.startsWith('--agent-name=')) out.agentName = arg.slice('--agent-name='.length);
    else if (arg === '--wallet-name') out.walletName = argv[++i];
    else if (arg.startsWith('--wallet-name=')) out.walletName = arg.slice('--wallet-name='.length);
    else if (arg === '--api-base') out.apiBase = argv[++i];
    else if (arg.startsWith('--api-base=')) out.apiBase = arg.slice('--api-base='.length);
    else if (arg === '--casper-public-key' || arg === '--public-key')
      out.casperPublicKey = argv[++i];
    else if (arg.startsWith('--casper-public-key='))
      out.casperPublicKey = arg.slice('--casper-public-key='.length);
    else if (arg.startsWith('--public-key='))
      out.casperPublicKey = arg.slice('--public-key='.length);
    else if (arg === '--casper-key-path' || arg === '--key-path') out.casperKeyPath = argv[++i];
    else if (arg.startsWith('--casper-key-path='))
      out.casperKeyPath = arg.slice('--casper-key-path='.length);
    else if (arg.startsWith('--key-path=')) out.casperKeyPath = arg.slice('--key-path='.length);
  }
  return out;
}

function usage(): void {
  process.stderr
    .write(`Usage: cspr402 onboard --claim <code> [--casper-public-key <hex>] [--casper-key-path <path>] [--api-base <url>]

Exchanges a one-time claim code from the CSPR402 dashboard for an api key and
writes ~/.cspr402/config.json with 0600 permissions. The config can store a
Casper public key or a path to a local key file, but never stores private key
material directly.

Options:
  --claim <code>             One-time claim code from the dashboard. Required.
  --casper-public-key <hex>  Casper testnet public key for payer binding.
  --casper-key-path <path>   Local key-file path. Keep the file outside git.
  --api-base <url>           Override the default https://api.cspr402.xyz/v1
  -h, --help                 Show this message
`);
}

function deriveDefaultWalletName(claim: string, label: string | null): string {
  const raw = claim.replace(/^(cspr402_claim_|c402_)/i, '');
  const suffix = raw.slice(0, 8).toLowerCase();
  const slug =
    (label ?? 'agent')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 24) || 'agent';
  return `cspr402-${slug}-${suffix}`;
}

function normalizeCasperPublicKey(value: string | undefined): string | undefined {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return undefined;
  if (!CASPER_PUBLIC_KEY_RE.test(normalized)) {
    throw new Error('Casper public key must be a valid public key hex string.');
  }
  return normalized;
}

async function redeemClaim(apiBase: string, claim: string): Promise<ClaimResponse> {
  const claimUrl = new URL(`${apiBase.replace(/\/$/, '')}/agent/claim`);
  const res = await fetch(claimUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: claim }),
  });
  const body = (await res.json().catch(() => ({}))) as ClaimResponse;
  if (!res.ok) {
    throw new Error(body.message || body.error || `claim failed with HTTP ${res.status}`);
  }
  return body;
}

export async function onboardCommand(argv: string[]): Promise<number> {
  const args = parseArgs(argv);
  if (args.help) {
    usage();
    return 0;
  }
  if (!args.claim) {
    process.stderr.write('error: --claim <code> is required\n\n');
    usage();
    return 2;
  }

  const claim = args.claim.trim();
  if (!/^(cspr402_claim_|c402_)[a-f0-9]{16,}$/i.test(claim)) {
    process.stderr.write(
      `error: '${claim.slice(0, 16)}...' does not look like a valid claim code.\n` +
        'Expected format: cspr402_claim_<hex>.\n',
    );
    return 2;
  }

  let apiBase =
    args.apiBase ||
    process.env.CSPR402_BASE_URL ||
    process.env.CARDS402_BASE_URL ||
    'https://api.cspr402.xyz/v1';
  try {
    apiBase = assertSafeBaseUrl(apiBase, { context: '--api-base / CSPR402_BASE_URL' });
  } catch (err) {
    process.stderr.write(`error: ${err instanceof Error ? err.message : String(err)}\n`);
    return 2;
  }

  let casperPublicKey: string | undefined;
  try {
    casperPublicKey = normalizeCasperPublicKey(
      args.casperPublicKey || process.env.CSPR402_CASPER_PUBLIC_KEY,
    );
  } catch (err) {
    process.stderr.write(`error: ${err instanceof Error ? err.message : String(err)}\n`);
    return 2;
  }
  let casperKeyPath = args.casperKeyPath || process.env.CSPR402_CASPER_KEY_PATH;

  const existing = loadCards402Config();
  if (existing) {
    process.stderr.write(
      'An existing cspr402 config was found at ~/.cspr402/config.json; proceeding with the new claim.\n\n',
    );
  }

  process.stdout.write('Redeeming CSPR402 claim...\n');
  let claimResponse: ClaimResponse;
  try {
    claimResponse = await redeemClaim(apiBase, claim);
  } catch (err) {
    process.stderr.write(`error: ${err instanceof Error ? err.message : String(err)}\n`);
    return 1;
  }

  if (!claimResponse.api_key) {
    process.stderr.write('error: claim response missing api_key.\n');
    return 1;
  }

  const finalApiUrl = assertSafeBaseUrl(claimResponse.api_url || apiBase, {
    context: 'claim response api_url',
  });
  const agentName =
    args.agentName ||
    args.walletName ||
    deriveDefaultWalletName(claim, claimResponse.label ?? null);

  // Auto-generate a Casper Ed25519 keypair when the operator did not
  // supply `--casper-public-key`, so the dashboard stepper can advance
  // to "Awaiting deposit" without an out-of-band key. Idempotent: if a
  // PEM already exists at the target path (e.g. re-running onboard on
  // the same machine), reuse it and re-derive the public key instead of
  // overwriting — overwriting would strand any funds already held by
  // the existing key.
  let keyOrigin: 'generated' | 'reused' | 'supplied' = 'supplied';
  if (!casperPublicKey) {
    const keyPath = resolveCasperKeyPath(agentName);
    const existingPem = readCasperKeyPemIfExists(keyPath);
    if (existingPem) {
      casperPublicKey = publicKeyHexFromPem(existingPem);
      casperKeyPath = keyPath;
      keyOrigin = 'reused';
    } else {
      const { pem, publicKeyHex } = generateCasperEd25519Key();
      const { path: writtenPath } = writeCasperKeyFile(agentName, pem);
      casperPublicKey = publicKeyHex;
      casperKeyPath = writtenPath;
      keyOrigin = 'generated';
    }
  }

  // After the keygen block casperPublicKey is always a string (either
  // supplied, re-derived from an existing PEM, or freshly generated).
  // This guard narrows the type for TypeScript and is a defensive
  // assertion that the invariant holds.
  if (!casperPublicKey) {
    process.stderr.write('error: failed to establish a Casper public key.\n');
    return 1;
  }

  const { path: configPath } = saveCards402Config({
    api_key: claimResponse.api_key,
    api_url: finalApiUrl,
    webhook_secret: claimResponse.webhook_secret ?? null,
    wallet_name: agentName,
    casper_public_key: casperPublicKey,
    casper_key_path: casperKeyPath,
    created_at: new Date().toISOString(),
  });

  const client = new CSPR402Client({ apiKey: claimResponse.api_key, baseUrl: finalApiUrl });
  // casperPublicKey is now always defined — either supplied by the
  // operator or auto-generated above — so the agent always reports
  // `awaiting_funding` with a real wallet_public_key, which is what
  // drives the dashboard stepper from "Claim redeemed" to "Awaiting
  // deposit" (the previously-unreachable "fund wallet" step).
  await client.reportStatus('awaiting_funding', {
    wallet_public_key: casperPublicKey,
    detail:
      keyOrigin === 'generated'
        ? 'Casper wallet generated'
        : keyOrigin === 'reused'
          ? 'Casper wallet reused'
          : 'Casper public key configured',
  });

  process.stdout.write('\n');
  process.stdout.write('cspr402 agent ready\n');
  process.stdout.write(`  Label:          ${claimResponse.label ?? '(none)'}\n`);
  process.stdout.write(`  Config:         ${configPath}\n`);
  process.stdout.write(`  API base:       ${finalApiUrl}\n`);
  process.stdout.write(`  Casper key:     ${casperPublicKey}\n`);
  if (keyOrigin !== 'supplied' && casperKeyPath) {
    process.stdout.write(`  Key file path:  ${casperKeyPath}\n`);
  }
  process.stdout.write('\n');
  process.stdout.write(
    'Next step: fund that public key with Casper testnet CSPR for native transfers.\n',
  );
  process.stdout.write('Your operator sees setup progress live in the CSPR402 dashboard.\n');
  return 0;
}
