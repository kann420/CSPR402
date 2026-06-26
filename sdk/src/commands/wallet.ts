import { loadCards402Config } from '../config';

const CASPER_PUBLIC_KEY_RE = /^(01[0-9a-f]{64}|02[0-9a-f]{66})$/i;
const DEFAULT_RPC_URL = 'https://node.testnet.casper.network/rpc';
const MOTES_PER_CSPR = 1_000_000_000n;

function usage(): void {
  process.stderr.write(`Usage: cspr402 wallet <subcommand> [--public-key <hex>] [--rpc-url <url>]

Subcommands:
  address              Print the configured Casper public key
  key-path             Print the configured local key-file path, if one was saved
  balance              Query Casper testnet CSPR balance for the configured public key
  info                 Print configured wallet context
  -h, --help           Show this message

The wallet command is read-only. It never reads or stores private key material;
the optional key path is only a local pointer saved by onboarding.
`);
}

function parseFlag(rest: string[], name: string): string | undefined {
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    if (!arg) continue;
    if (arg === name) return rest[i + 1];
    if (arg.startsWith(`${name}=`)) return arg.slice(name.length + 1);
  }
  return undefined;
}

function normalizePublicKey(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const normalized = value.trim().toLowerCase();
  if (!CASPER_PUBLIC_KEY_RE.test(normalized)) {
    throw new Error('Casper public key must be 01 + 32 bytes or 02 + 33 bytes in hex.');
  }
  return normalized;
}

function resolvePublicKey(rest: string[]): string {
  const config = loadCards402Config();
  const publicKey = normalizePublicKey(
    parseFlag(rest, '--public-key') ||
      process.env.CSPR402_CASPER_PUBLIC_KEY ||
      config?.casper_public_key,
  );
  if (!publicKey) {
    throw new Error(
      "No Casper public key configured. Re-run 'cspr402 onboard --claim <code> --casper-public-key <hex>' or pass --public-key.",
    );
  }
  return publicKey;
}

function resolveRpcUrl(rest: string[]): string {
  return (
    parseFlag(rest, '--rpc-url') ||
    process.env.CSPR402_CASPER_NODE_RPC_URL ||
    process.env.CASPER_NODE_RPC_URL ||
    DEFAULT_RPC_URL
  );
}

async function rpcCall(rpcUrl: string, method: string, params: unknown[]): Promise<unknown> {
  const res = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: 1, jsonrpc: '2.0', method, params }),
  });
  const body = (await res.json().catch(() => ({}))) as {
    error?: { message?: string; data?: unknown };
    result?: unknown;
  };
  if (!res.ok || body.error) {
    const msg =
      body.error?.message ||
      (typeof body.error?.data === 'string' ? body.error.data : undefined) ||
      `Casper RPC HTTP ${res.status}`;
    throw new Error(msg);
  }
  return body.result;
}

function unwrapValue(result: unknown): Record<string, unknown> {
  const obj = result as Record<string, unknown>;
  if (obj && typeof obj === 'object' && obj.value && typeof obj.value === 'object') {
    return obj.value as Record<string, unknown>;
  }
  return obj || {};
}

function formatCSPR(motesRaw: string): string {
  const motes = BigInt(motesRaw);
  const whole = motes / MOTES_PER_CSPR;
  const frac = String(motes % MOTES_PER_CSPR).padStart(9, '0');
  return `${whole}.${frac}`;
}

async function fetchBalance(
  publicKey: string,
  rpcUrl: string,
): Promise<{ accountHash: string; motes: string }> {
  const accountInfo = unwrapValue(
    await rpcCall(rpcUrl, 'state_get_account_info', [
      { name: 'account_identifier', value: publicKey },
    ]),
  );
  const account = accountInfo.account as Record<string, unknown> | undefined;
  const accountHash = typeof account?.account_hash === 'string' ? account.account_hash : undefined;
  if (!accountHash) {
    throw new Error('Account was not found on Casper testnet. Fund it with testnet CSPR first.');
  }

  const balanceResult = unwrapValue(
    await rpcCall(rpcUrl, 'query_balance', [
      {
        name: 'purse_identifier',
        value: { main_purse_under_account_hash: accountHash },
      },
    ]),
  );
  const balance = balanceResult.balance;
  if (typeof balance !== 'string' || !/^\d+$/.test(balance)) {
    throw new Error('Casper RPC did not return a parseable balance.');
  }
  return { accountHash, motes: balance };
}

export async function walletCommand(argv: string[]): Promise<number> {
  const [sub, ...rest] = argv;
  if (!sub || sub === '-h' || sub === '--help' || sub === 'help') {
    usage();
    return sub ? 0 : 2;
  }

  try {
    const config = loadCards402Config();

    if (sub === 'address') {
      process.stdout.write(`${resolvePublicKey(rest)}\n`);
      return 0;
    }

    if (sub === 'key-path') {
      const keyPath =
        parseFlag(rest, '--key-path') ||
        process.env.CSPR402_CASPER_KEY_PATH ||
        config?.casper_key_path;
      if (!keyPath) {
        process.stderr.write('No Casper key-file path configured.\n');
        return 1;
      }
      process.stdout.write(`${keyPath}\n`);
      return 0;
    }

    if (sub === 'info') {
      const publicKey = normalizePublicKey(
        parseFlag(rest, '--public-key') ||
          process.env.CSPR402_CASPER_PUBLIC_KEY ||
          config?.casper_public_key,
      );
      process.stdout.write(
        `config:     ${process.env.CSPR402_CONFIG_DIR || '~/.cspr402'}/config.json\n`,
      );
      process.stdout.write(
        `api_url:    ${config?.api_url || process.env.CSPR402_BASE_URL || 'not configured'}\n`,
      );
      process.stdout.write(`public_key: ${publicKey || 'not configured'}\n`);
      process.stdout.write(
        `key_path:   ${config?.casper_key_path || process.env.CSPR402_CASPER_KEY_PATH || 'not configured'}\n`,
      );
      process.stdout.write(`rpc_url:    ${resolveRpcUrl(rest)}\n`);
      return 0;
    }

    if (sub === 'balance') {
      const publicKey = resolvePublicKey(rest);
      const rpcUrl = resolveRpcUrl(rest);
      const balance = await fetchBalance(publicKey, rpcUrl);
      process.stdout.write(`address:      ${publicKey}\n`);
      process.stdout.write(`account_hash: ${balance.accountHash}\n`);
      process.stdout.write(`motes:        ${balance.motes}\n`);
      process.stdout.write(`cspr:         ${formatCSPR(balance.motes)}\n`);
      return 0;
    }

    process.stderr.write(`error: unknown wallet subcommand '${sub}'\n`);
    usage();
    return 2;
  } catch (err) {
    process.stderr.write(`error: ${err instanceof Error ? err.message : String(err)}\n`);
    return 1;
  }
}
