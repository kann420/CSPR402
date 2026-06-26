'use client';

type CsprClickAccount = {
  public_key?: string | null;
  provider?: string;
};

export type CsprClickSignResult = {
  cancelled?: boolean;
  signatureHex?: string | null;
  signature?: string | Uint8Array | number[] | null;
  error?: string | null;
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
  send(
    transactionJSON: string | object,
    signingPublicKey: string,
    onStatusUpdate?: (status: string, data: unknown) => void,
    timeout?: number,
  ): Promise<CsprClickSendResult | undefined>;
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

function resolveAppId(): string {
  const configured = process.env.NEXT_PUBLIC_CSPRCLICK_APP_ID?.trim();
  if (configured) return configured;
  if (typeof window !== 'undefined') {
    const host = window.location.hostname;
    if (host === 'localhost' || host === '127.0.0.1' || host === '::1') return LOCAL_APP_ID;
  }
  throw new Error('NEXT_PUBLIC_CSPRCLICK_APP_ID is required for CSPR.click.');
}

function runtimeSrc(): string {
  const version =
    process.env.NEXT_PUBLIC_CSPRCLICK_CDN_VERSION?.trim() || CSPRCLICK_DEFAULT_VERSION;
  return `https://cdn.cspr.click/ui/v${version}/csprclick-client-${version}.js`;
}

function configuredProviders(): string[] {
  const raw = process.env.NEXT_PUBLIC_CSPRCLICK_PROVIDERS?.trim();
  const providers = raw
    ? raw
        .split(',')
        .map((provider) => provider.trim())
        .filter(Boolean)
    : DEFAULT_PROVIDERS;
  return providers.length > 0 ? providers : DEFAULT_PROVIDERS;
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

  window.clickSDKOptions = {
    appName: 'CSPR402',
    appId: resolveAppId(),
    contentMode: 'iframe',
    casperNode: process.env.NEXT_PUBLIC_CASPER_NODE_RPC_URL,
    chainName: process.env.NEXT_PUBLIC_CASPER_CHAIN_NAME || 'casper-test',
    providers: configuredProviders(),
  };
  window.clickUIOptions = {
    uiContainer: 'csprclick-ui',
    rootAppElement: '#app',
    showTopBar: false,
    show1ClickModal: false,
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
    const desiredSrc = runtimeSrc();
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

  const providers = configuredProviders();
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
