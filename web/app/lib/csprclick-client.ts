'use client';

import { CASPER_RPC_RELAY_PATH } from '@/app/lib/casper-rpc';

type CsprClickAccount = {
  public_key?: string | null;
  provider?: string;
};

export type CsprClickSignResult = {
  cancelled?: boolean;
  signatureHex?: string | null;
  signature?: string | Uint8Array | number[] | null;
  error?: string | null;
  /** Assembled signed deploy (pre-Condor format), when the provider returns one. */
  deploy?: object | null;
  /** Assembled signed TransactionV1, when the provider returns one. */
  transaction?: object | null;
};

export type CsprClickSendResult = {
  cancelled?: boolean;
  deployHash?: string | null;
  transactionHash?: string | null;
  error?: string | null;
  status?: string | null;
  errorData?: unknown;
  csprCloudTransaction?: unknown;
};

type CsprClickClient = {
  init(options: {
    appName: string;
    appId: string;
    contentMode: 'iframe' | 'popup';
    casperNode?: string;
    chainName?: string;
    providers: string[];
    uiContainer?: string;
    rootAppElement?: string;
    showTopBar?: boolean;
  }): void;
  on?(event: string, cb: (evt: unknown) => void): void;
  connect(provider: string, options?: unknown): Promise<CsprClickAccount | undefined>;
  signIn(): void;
  signOut(): void;
  disconnect(provider?: string, options?: unknown): void;
  isProviderPresent?(provider: string): boolean;
  getSignInOptions?(refresh?: boolean): Promise<unknown>;
  getActivePublicKey(): Promise<string | undefined> | string | undefined;
  getActiveAccountAsync?(options?: unknown): Promise<CsprClickAccount | null>;
  signMessage(message: string, signingPublicKey: string): Promise<CsprClickSignResult | undefined>;
  /**
   * Sign WITHOUT submitting. Purely local (extension messaging), so unlike
   * `send` it can never hit a CORS wall — this is the portal's primary path.
   */
  sign?(
    transactionJSON: string | object,
    signingPublicKey: string,
  ): Promise<CsprClickSignResult | undefined>;
  send(
    transactionJSON: string | object,
    signingPublicKey: string,
    onStatusUpdate?: (status: string, data: unknown) => void,
    timeout?: number,
  ): Promise<CsprClickSendResult | undefined>;
};

type PublicRuntimeConfig = {
  csprclick_app_id?: string | null;
  csprclick_cdn_version?: string | null;
  csprclick_providers?: string | null;
  casper_chain_name?: string | null;
};

declare global {
  interface Window {
    csprclick?: CsprClickClient;
    clickSDKOptions?: {
      appName: string;
      appId: string;
      contentMode: 'iframe' | 'popup';
      casperNode?: string;
      chainName?: string;
      providers: string[];
    };
    clickUIOptions?: {
      uiContainer: string;
      rootAppElement: string;
      showTopBar: boolean;
      show1ClickModal?: boolean;
    };
    __cspr402CsprClickRuntime?: Promise<CsprClickClient>;
    __cspr402CsprClickInitialized?: boolean;
    __cspr402PublicConfig?: Promise<PublicRuntimeConfig>;
  }
}

const CSPRCLICK_DEFAULT_VERSION = '2.1.0';
const CSPRCLICK_SCRIPT_ID = 'csprclick-client';
const CSPRCLICK_LEGACY_SCRIPT_ID = 'csprclick-runtime';
const LOCAL_APP_ID = 'csprclick-template';
const DEFAULT_PROVIDERS = ['casper-wallet'];

function normalizePublicKey(publicKey: string | undefined | null): string | null {
  const normalized = publicKey?.trim().toLowerCase();
  if (!normalized) return null;
  return /^(01[0-9a-f]{64}|02[0-9a-f]{66})$/.test(normalized) ? normalized : null;
}

function extractPublicKey(value: unknown): string | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  const direct = normalizePublicKey(
    typeof record.public_key === 'string' ? record.public_key : null,
  );
  if (direct) return direct;
  const account = record.account;
  if (!account || typeof account !== 'object') return null;
  const accountRecord = account as Record<string, unknown>;
  return normalizePublicKey(
    typeof accountRecord.public_key === 'string' ? accountRecord.public_key : null,
  );
}

function bytesToHex(bytes: Uint8Array | number[]): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function normalizeHex(value: string): string {
  return value.trim().replace(/^0x/i, '').toLowerCase();
}

function signatureToHex(signature: string | Uint8Array | number[]): string {
  if (typeof signature === 'string') return normalizeHex(signature);
  return bytesToHex(signature);
}

function errorDataSummary(errorData: unknown): string | null {
  if (!errorData) return null;
  if (typeof errorData === 'string') return errorData;
  try {
    return JSON.stringify(errorData);
  } catch {
    return String(errorData);
  }
}

/**
 * The JSON-RPC endpoint the browser is allowed to talk to: our own
 * same-origin relay (app/api/casper-rpc), never a Casper node directly.
 *
 * This is the CORS fix. CSPR.click's core client POSTs the signed transaction
 * from the browser to whatever `casperNode` was initialised with, and no
 * public Casper node answers a cross-origin preflight — so pointing it at a
 * node URL is what made "send transaction" fail with a CORS error. Pointing it
 * at our own origin makes the preflight moot; the relay does the node call
 * server-side. NEXT_PUBLIC_CASPER_RPC_RELAY_URL overrides it only for
 * deployments that host the relay elsewhere (it must still be CORS-enabled).
 */
export function casperRpcUrl(): string {
  const override = process.env.NEXT_PUBLIC_CASPER_RPC_RELAY_URL?.trim();
  if (override) return override;
  if (typeof window === 'undefined') return CASPER_RPC_RELAY_PATH;
  return new URL(CASPER_RPC_RELAY_PATH, window.location.origin).toString();
}

function isLocalHost(): boolean {
  if (typeof window === 'undefined') return false;
  return ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname);
}

async function loadPublicConfig(): Promise<PublicRuntimeConfig> {
  if (typeof window === 'undefined') return {};
  if (!window.__cspr402PublicConfig) {
    window.__cspr402PublicConfig = fetch('/api/public-config', { cache: 'no-store' })
      .then((res) => (res.ok ? (res.json() as Promise<PublicRuntimeConfig>) : {}))
      .catch(() => ({}));
  }
  return window.__cspr402PublicConfig;
}

async function resolveAppId(config: PublicRuntimeConfig): Promise<string> {
  const configured =
    config.csprclick_app_id?.trim() || process.env.NEXT_PUBLIC_CSPRCLICK_APP_ID?.trim();
  if (configured && (configured !== LOCAL_APP_ID || isLocalHost())) return configured;
  if (isLocalHost()) return LOCAL_APP_ID;
  throw new Error(
    'Casper Wallet login is not configured for cspr402.xyz yet. Register a CSPR.click app id for this domain, set CSPRCLICK_APP_ID on Railway, then redeploy. Use Open demo dashboard for now.',
  );
}

function runtimeSrc(config: PublicRuntimeConfig): string {
  const version =
    config.csprclick_cdn_version?.trim() ||
    process.env.NEXT_PUBLIC_CSPRCLICK_CDN_VERSION?.trim() ||
    CSPRCLICK_DEFAULT_VERSION;
  return `https://cdn.cspr.click/ui/v${version}/csprclick-client-${version}.js`;
}

async function configuredProviders(): Promise<string[]> {
  const config = await loadPublicConfig();
  const raw =
    config.csprclick_providers?.trim() || process.env.NEXT_PUBLIC_CSPRCLICK_PROVIDERS?.trim();
  const providers = raw
    ? raw
        .split(',')
        .map((provider) => provider.trim())
        .filter(Boolean)
    : DEFAULT_PROVIDERS;
  return providers.length > 0 ? providers : DEFAULT_PROVIDERS;
}

async function assertCsprClickAppReady(appId: string): Promise<void> {
  if (appId === LOCAL_APP_ID && isLocalHost()) return;
  try {
    const res = await fetch(
      `https://accounts.cspr.click/api/application/${encodeURIComponent(appId)}.json`,
      { cache: 'no-store' },
    );
    if (!res.ok) {
      throw new Error(
        `CSPR.click rejected the configured app id for this domain (HTTP ${res.status}). Register an app id for cspr402.xyz or use Open demo dashboard for now.`,
      );
    }
  } catch (err) {
    if (err instanceof Error && err.message.includes('CSPR.click rejected')) throw err;
    // Do not fail closed on transient CSPR.click account-api/network issues;
    // the SDK can still attempt its own provider flow.
  }
}

function timeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      (value) => {
        window.clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        window.clearTimeout(timer);
        reject(err);
      },
    );
  });
}

async function loadRuntime(): Promise<CsprClickClient> {
  if (typeof window === 'undefined') throw new Error('CSPR.click is only available in browser.');
  if (window.csprclick) return window.csprclick;
  if (window.__cspr402CsprClickRuntime) return window.__cspr402CsprClickRuntime;

  const config = await loadPublicConfig();
  const appId = await resolveAppId(config);
  await assertCsprClickAppReady(appId);
  const providers = await configuredProviders();

  window.clickSDKOptions = {
    appName: 'CSPR402',
    appId,
    contentMode: 'iframe',
    // Always the same-origin relay — see casperRpcUrl(). A raw node URL here
    // is exactly what produced the judge-reported CORS failure on submit.
    casperNode: casperRpcUrl(),
    chainName:
      config.casper_chain_name?.trim() ||
      process.env.NEXT_PUBLIC_CASPER_CHAIN_NAME?.trim() ||
      'casper',
    providers,
  };
  window.clickUIOptions = {
    uiContainer: 'csprclick-ui',
    rootAppElement: '#app',
    showTopBar: false,
  };

  window.__cspr402CsprClickRuntime = new Promise<CsprClickClient>((resolve, reject) => {
    const rejectAndReset = (err: Error) => {
      window.clearTimeout(timer);
      window.__cspr402CsprClickRuntime = undefined;
      reject(err);
    };
    const timer = window.setTimeout(() => {
      rejectAndReset(
        new Error('CSPR.click runtime did not become available. Check CDN access and refresh.'),
      );
    }, 15000);
    const settle = () => {
      if (window.csprclick) {
        window.clearTimeout(timer);
        window.__cspr402CsprClickInitialized = true;
        resolve(window.csprclick);
      }
    };
    const handleScriptError = () => {
      rejectAndReset(new Error('Failed to load CSPR.click runtime.'));
    };
    const desiredSrc = runtimeSrc(config);
    const legacyScript = document.getElementById(CSPRCLICK_LEGACY_SCRIPT_ID);
    const existing = document.getElementById(CSPRCLICK_SCRIPT_ID) ?? legacyScript;
    window.addEventListener('csprclick:loaded', settle, { once: true });
    if (existing) {
      const script = existing as HTMLScriptElement;
      const isWrongRuntime = script.src && script.src !== desiredSrc;
      if (isWrongRuntime && !window.csprclick) {
        script.remove();
      } else {
        script.addEventListener('load', settle, { once: true });
        script.addEventListener('error', handleScriptError, { once: true });
        settle();
        return;
      }
    }

    if (legacyScript) {
      legacyScript.remove();
    }

    const script = document.createElement('script');
    script.id = CSPRCLICK_SCRIPT_ID;
    script.async = true;
    script.src = desiredSrc;
    script.onload = settle;
    script.onerror = handleScriptError;
    document.head.appendChild(script);
  }).catch((err) => {
    window.__cspr402CsprClickRuntime = undefined;
    throw err;
  });

  return window.__cspr402CsprClickRuntime;
}

export async function getCsprClick(): Promise<CsprClickClient> {
  return loadRuntime();
}

export async function getActivePublicKey(): Promise<string | null> {
  const click = await getCsprClick();
  const publicKey = normalizePublicKey(await click.getActivePublicKey());
  if (publicKey) return publicKey;
  const account = await click.getActiveAccountAsync?.();
  return normalizePublicKey(account?.public_key);
}

async function waitForSignedIn(click: CsprClickClient, timeoutMs: number): Promise<string> {
  const started = Date.now();

  return timeout(
    new Promise<string>((resolve, reject) => {
      let settled = false;
      const settle = (publicKey: string | null) => {
        if (settled || !publicKey) return;
        settled = true;
        resolve(publicKey);
      };

      click.on?.('csprclick:signed_in', (evt) => settle(extractPublicKey(evt)));
      click.on?.('csprclick:switched_account', (evt) => settle(extractPublicKey(evt)));
      click.on?.('csprclick:disconnected', () => {
        if (!settled) {
          settled = true;
          reject(new Error('Wallet disconnected before sign-in completed.'));
        }
      });
      click.on?.('csprclick:signed_out', () => {
        if (!settled) {
          settled = true;
          reject(new Error('Wallet session closed before sign-in completed.'));
        }
      });

      const poll = async () => {
        if (settled) return;
        const activeKey = await getActivePublicKey().catch(() => null);
        if (activeKey) {
          settle(activeKey);
          return;
        }
        if (Date.now() - started >= timeoutMs) return;
        window.setTimeout(poll, 500);
      };
      void poll();
    }),
    timeoutMs,
    'Wallet sign-in timed out. Check the Casper Wallet popup, unlock the extension, then try again.',
  );
}

export async function connectWallet(timeoutMs = 60000): Promise<string> {
  const click = await getCsprClick();
  const current = await getActivePublicKey();
  if (current) return current;

  const providers = await configuredProviders();
  const presentProviders = providers.filter((provider) => {
    try {
      return click.isProviderPresent?.(provider) ?? true;
    } catch {
      return false;
    }
  });

  if (presentProviders.length === 0) {
    await click.getSignInOptions?.(true).catch(() => undefined);
    throw new Error(
      'CSPR.click did not detect Casper Wallet. Install/unlock the Casper Wallet extension, refresh this page, then try again.',
    );
  }

  click.signIn();
  return waitForSignedIn(click, timeoutMs);
}

export async function signWalletMessage(message: string, publicKey: string): Promise<string> {
  const click = await getCsprClick();
  const result = await timeout(
    click.signMessage(message, publicKey),
    60000,
    'Wallet signature timed out. Check the Casper Wallet popup, unlock the extension, then try again.',
  );
  if (!result || result.cancelled) throw new Error('Wallet signature was cancelled.');
  if (result.error) throw new Error(result.error);
  if (result.signatureHex) return normalizeHex(result.signatureHex);
  if (result.signature) return signatureToHex(result.signature);
  throw new Error('Wallet did not return a signature.');
}

export type SignedTransactionResult = {
  /** Signature hex as returned by the wallet, algorithm prefix normalised on. */
  signatureHex: string | null;
  /** Signed TransactionV1 JSON, when the provider assembled one for us. */
  transaction: object | null;
  /** Signed Deploy JSON, when the provider assembled one for us. */
  deploy: object | null;
};

/**
 * Whether a Casper signature hex already carries its 1-byte algorithm prefix.
 * casper-js-sdk's `Transaction.sign` stores prefixed bytes
 * (`PrivateKey.signAndAddAlgorithmBytes`), but wallet providers differ: some
 * return the bare 64-byte curve signature. 64 bytes = 128 hex chars for both
 * ed25519 and secp256k1, so a 130-char value is already prefixed.
 */
export function hasAlgorithmPrefix(signatureHex: string): boolean {
  return normalizeHex(signatureHex).length > 128;
}

/**
 * Prefix a bare signature with the algorithm tag taken from the signer's
 * public key (`01` ed25519 / `02` secp256k1), so the approval the node sees
 * matches what a locally-signed transaction would carry.
 */
export function withAlgorithmPrefix(signatureHex: string, publicKeyHex: string): string {
  const signature = normalizeHex(signatureHex);
  if (hasAlgorithmPrefix(signature)) return signature;
  return `${normalizeHex(publicKeyHex).slice(0, 2)}${signature}`;
}

/**
 * Ask the wallet to sign a transaction WITHOUT submitting it. This never
 * touches the network, so it is immune to the CORS failure that broke
 * `send()`; the caller submits the result through the same-origin relay.
 */
export async function signTransaction(
  transactionJSON: object,
  publicKey: string,
): Promise<SignedTransactionResult> {
  const click = await getCsprClick();
  if (!click.sign) {
    throw new Error('CSPR.click runtime does not expose sign().');
  }
  const result = await timeout(
    click.sign(transactionJSON, publicKey),
    120000,
    'Wallet signature timed out. Check the Casper Wallet popup, unlock the extension, then try again.',
  );
  if (!result || result.cancelled) throw new Error('Transaction signature was cancelled.');
  if (result.error) throw new Error(result.error);

  const rawSignature = result.signatureHex
    ? normalizeHex(result.signatureHex)
    : result.signature
      ? signatureToHex(result.signature)
      : null;

  if (!rawSignature && !result.transaction && !result.deploy) {
    throw new Error('Wallet did not return a signature for the transaction.');
  }

  return {
    signatureHex: rawSignature ? withAlgorithmPrefix(rawSignature, publicKey) : null,
    transaction: result.transaction ?? null,
    deploy: result.deploy ?? null,
  };
}

/**
 * CSPR.click's sign-and-submit. Kept as the fallback for providers that don't
 * implement `sign()`. It submits from the browser to `casperNode`, which is
 * now our same-origin relay (see casperRpcUrl) rather than a Casper node, so
 * this path no longer trips CORS either.
 */
export async function sendTransaction(
  transactionJSON: object,
  publicKey: string,
  onStatusUpdate?: (status: string, data: unknown) => void,
): Promise<CsprClickSendResult> {
  const click = await getCsprClick();
  const result = await click.send(transactionJSON, publicKey, onStatusUpdate, 120);
  if (!result) throw new Error('CSPR.click returned no transaction result.');
  if (result.cancelled) throw new Error('Transaction signature was cancelled.');
  if (result.error) {
    const detail = errorDataSummary(result.errorData);
    throw new Error(detail ? `${result.error} (${detail.slice(0, 300)})` : result.error);
  }
  return result;
}
