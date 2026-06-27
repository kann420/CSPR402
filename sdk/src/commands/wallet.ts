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
      "No Casper public key configured. Run 'cspr402 onboard --claim <code>' to generate one, or pass --public-key.",
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

/**
 * Error from the Casper JSON-RPC layer. Carries the numeric `code` so
 * callers can classify (e.g. -32009 "No such account" = unfunded key,
 * not an outage).
 */
class CasperRpcError extends Error {
  code?: number;
  constructor(message: string, code?: number) {
    super(message);
    this.name = 'CasperRpcError';
    this.code = code;
  }
}

/**
 * Send a Casper JSON-RPC call. `params` is the struct/object form
 * required by node api_version 2.0.0 (the legacy `[{name,value}]`
 * array form is rejected with -32602). Returns `body.result`; throws
 * `CasperRpcError` (with `code`) on an RPC error or non-200.
 */
async function rpcCall(rpcUrl: string, method: string, params: unknown): Promise<unknown> {
  const res = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: 1, jsonrpc: '2.0', method, params }),
  });
  const body = (await res.json().catch(() => ({}))) as {
    error?: { code?: number; message?: string; data?: unknown };
    result?: unknown;
  };
  if (!res.ok || body.error) {
    const msg =
      body.error?.message ||
      (typeof body.error?.data === 'string' ? body.error.data : undefined) ||
      `Casper RPC HTTP ${res.status}`;
    throw new CasperRpcError(msg, body.error?.code);
  }
  return body.result;
}

const ACCOUNT_NOT_FOUND_CODE = -32009;

function formatCSPR(motesRaw: string): string {
  const motes = BigInt(motesRaw);
  const whole = motes / MOTES_PER_CSPR;
  const frac = String(motes % MOTES_PER_CSPR).padStart(9, '0');
  return `${whole}.${frac}`;
}

interface BalanceResult {
  accountHash: string | null;
  motes: string;
  notFound: boolean;
}

/**
 * Fetch the CSPR balance for a Casper public key via
 * `state_get_account_info` → `query_balance` (struct params, node
 * api_version 2.0.0). A freshly-generated key that has never received
 * CSPR has no on-chain account: `state_get_account_info` returns RPC
 * error -32009 "No such account", which we surface as `notFound: true`
 * with `motes: '0'` (NOT an error — the agent simply hasn't been
 * funded yet).
 */
async function fetchBalance(publicKey: string, rpcUrl: string): Promise<BalanceResult> {
  let accountInfo: unknown;
  try {
    accountInfo = await rpcCall(rpcUrl, 'state_get_account_info', {
      public_key: publicKey,
    });
  } catch (err) {
    if (err instanceof CasperRpcError && err.code === ACCOUNT_NOT_FOUND_CODE) {
      return { accountHash: null, motes: '0', notFound: true };
    }
    throw err;
  }
  const account = (accountInfo as Record<string, unknown> | undefined)?.account as
    | Record<string, unknown>
    | undefined;
  const accountHash = typeof account?.account_hash === 'string' ? account.account_hash : undefined;
  if (!accountHash) {
    return { accountHash: null, motes: '0', notFound: true };
  }

  const balanceResult = (await rpcCall(rpcUrl, 'query_balance', {
    purse_identifier: { main_purse_under_account_hash: accountHash },
  })) as Record<string, unknown> | undefined;
  const balance = balanceResult?.balance;
  if (typeof balance !== 'string' || !/^\d+$/.test(balance)) {
    throw new Error('Casper RPC did not return a parseable balance.');
  }
  return { accountHash, motes: balance, notFound: false };
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
      if (balance.notFound) {
        process.stdout.write('status:       account not funded yet\n');
        process.stdout.write('cspr:         0\n');
      } else {
        process.stdout.write(`account_hash: ${balance.accountHash}\n`);
        process.stdout.write(`motes:        ${balance.motes}\n`);
        process.stdout.write(`cspr:         ${formatCSPR(balance.motes)}\n`);
      }
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
