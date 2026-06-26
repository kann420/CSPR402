'use client';

import { NativeTransferBuilder, PublicKey, Timestamp } from 'casper-js-sdk';
import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { connectWallet, sendTransaction, signWalletMessage } from '@/app/lib/csprclick-client';

type OrderResponse = {
  order_id: string;
  status: string;
  phase: string;
  amount_usdc: string;
  payment?: {
    type: string;
    network: string;
    chain_name: string;
    recipient: string;
    sender_public_key?: string | null;
    amount_cspr?: string;
    amount_motes?: string;
    transfer_id?: number;
    order_id?: string;
    expires_at?: string;
  };
};

type VerifyResponse = {
  ok: boolean;
  note?: string;
  receipt?: {
    deploy_hash: string;
    recipient: string;
    transfer_id: number;
    amount_motes: string;
    sender_public_key?: string | null;
    chain_name: string;
  };
  order?: {
    status: string;
    phase: string;
    card?: {
      number: string;
      cvv: string;
      expiry: string;
      brand: string;
    };
  };
};

type WalletStep = 'idle' | 'connected' | 'challenge' | 'sign' | 'verify' | 'ready';

async function readJson(res: Response) {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = body?.message || body?.error || `HTTP ${res.status}`;
    if (process.env.NODE_ENV !== 'production' && body?.debug) {
      throw new Error(`${message} Debug: ${JSON.stringify(body.debug)}`);
    }
    throw new Error(message);
  }
  return body;
}

export function PortalDemoClient() {
  const [amountUsdc, setAmountUsdc] = useState('0.03');
  const [deployHash, setDeployHash] = useState('');
  const [walletPublicKey, setWalletPublicKey] = useState('');
  const [walletSessionReady, setWalletSessionReady] = useState(false);
  const [walletStep, setWalletStep] = useState<WalletStep>('idle');
  const [order, setOrder] = useState<OrderResponse | null>(null);
  const [verified, setVerified] = useState<VerifyResponse | null>(null);
  const [busy, setBusy] = useState<'wallet' | 'create' | 'send' | 'verify' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [statusUpdates, setStatusUpdates] = useState<string[]>([]);

  const payment = order?.payment;
  const orderId = order?.order_id || '';

  useEffect(() => {
    if (walletSessionReady && busy === 'wallet') {
      setBusy(null);
    }
  }, [busy, walletSessionReady]);

  const paymentChecklist = useMemo(
    () => [
      walletSessionReady
        ? `Wallet session ready: ${shortKey(walletPublicKey)}`
        : walletPublicKey
          ? `Wallet connected: ${shortKey(walletPublicKey)}`
          : 'Connect a Casper testnet wallet.',
      payment?.recipient
        ? `Recipient: ${shortKey(payment.recipient)}`
        : 'Recipient appears after create-order.',
      payment?.amount_motes
        ? `${payment.amount_cspr || ''} CSPR (${payment.amount_motes} motes)`
        : 'Exact motes appear after create-order.',
      payment?.transfer_id !== undefined
        ? `transfer_id: ${payment.transfer_id}`
        : 'transfer_id appears after create-order.',
      payment?.expires_at ? `Expires: ${payment.expires_at}` : 'Expiry appears after create-order.',
    ],
    [payment, walletPublicKey, walletSessionReady],
  );

  async function ensureWalletSession() {
    if (walletPublicKey && walletSessionReady) {
      setWalletStep('ready');
      return walletPublicKey;
    }
    setBusy('wallet');
    const publicKey = await connectWallet();
    setWalletPublicKey(publicKey);
    setWalletStep('connected');

    if (!walletSessionReady) {
      setWalletStep('challenge');
      const challenge = await fetch('/api/auth/wallet/challenge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          public_key: publicKey,
          domain: window.location.host,
        }),
      }).then(readJson);
      setWalletStep('sign');
      const signatureHex = await signWalletMessage(challenge.message, publicKey);
      setWalletStep('verify');
      await fetch('/api/auth/wallet/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          public_key: publicKey,
          nonce: challenge.nonce,
          signature_hex: signatureHex,
        }),
      }).then(readJson);
      setWalletSessionReady(true);
      setWalletStep('ready');
    }
    return publicKey;
  }

  async function connectWalletSession() {
    setError(null);
    try {
      await ensureWalletSession();
    } catch (err) {
      setError((err as Error).message);
      setWalletStep(walletPublicKey ? 'connected' : 'idle');
    } finally {
      setBusy(null);
    }
  }

  async function createOrder() {
    setBusy('create');
    setError(null);
    setVerified(null);
    setStatusUpdates([]);
    try {
      const publicKey = await ensureWalletSession();
      const res = await fetch('/api/demo-proxy/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount_usdc: amountUsdc,
          payment_asset: 'cspr_casper',
          payer_public_key: publicKey,
          metadata: { source: 'portal-demo', brand: 'cspr402' },
        }),
      });
      const body = (await readJson(res)) as OrderResponse;
      setOrder(body);
      setDeployHash('');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function sendAndVerify() {
    if (!payment?.recipient || !payment.amount_motes || payment.transfer_id === undefined) {
      setError('Create an order first.');
      return;
    }
    setBusy('send');
    setError(null);
    setVerified(null);
    try {
      const publicKey = await ensureWalletSession();
      if (payment.recipient.toLowerCase() === publicKey.toLowerCase()) {
        throw new Error(
          'Configured treasury recipient matches the connected wallet. Set CASPER_TREASURY_PUBLIC_KEY to a different testnet account and restart the backend.',
        );
      }
      // Casper nodes reject future timestamps, so backdate slightly to absorb local clock skew.
      const txTimestamp = new Timestamp(new Date(Date.now() - 60_000));
      const transaction = new NativeTransferBuilder()
        .from(PublicKey.fromHex(publicKey))
        .target(PublicKey.fromHex(payment.recipient))
        .amount(payment.amount_motes)
        .id(Number(payment.transfer_id))
        .chainName(payment.chain_name)
        .timestamp(txTimestamp)
        .payment(100_000_000)
        .build();

      const result = await sendTransaction(
        transaction.toJSON() as object,
        publicKey,
        (status, data) => {
          setStatusUpdates((prev) =>
            [`${new Date().toLocaleTimeString()} - ${status}${statusDetail(data)}`, ...prev].slice(
              0,
              8,
            ),
          );
        },
      );
      const hash = result.deployHash || result.transactionHash;
      if (!hash) throw new Error('CSPR.click did not return a deploy hash.');
      setDeployHash(hash);
      await verifyPayment(hash, publicKey);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function verifyPayment(hashOverride?: string, senderOverride?: string) {
    if (!orderId) {
      setError('Create an order first.');
      return;
    }
    const hash = (hashOverride || deployHash).trim();
    if (!hash) {
      setError('Deploy hash is required.');
      return;
    }
    setBusy('verify');
    setError(null);
    try {
      const publicKey = senderOverride || walletPublicKey || (await ensureWalletSession());
      const res = await fetch(`/api/demo-proxy/orders/${orderId}/verify-payment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deploy_hash: hash,
          sender_public_key: publicKey,
        }),
      });
      const body = (await readJson(res)) as VerifyResponse;
      setVerified(body);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div style={{ maxWidth: 1180, margin: '0 auto', padding: '4.5rem 1.35rem 6rem' }}>
      <div className="type-eyebrow" style={{ color: 'var(--green)', marginBottom: '1rem' }}>
        CSPR402 portal demo
      </div>
      <h1
        className="type-display"
        style={{ fontSize: 'clamp(2.3rem, 4vw + 0.5rem, 3.8rem)', margin: '0 0 1rem' }}
      >
        Pay with Casper testnet CSPR, then verify the deploy.
      </h1>
      <p
        className="type-body"
        style={{ maxWidth: 760, color: 'var(--fg-muted)', marginBottom: '2rem' }}
      >
        Connect a Casper wallet, create a CSPR-native order, approve the transfer, and receive one
        mock virtual card receipt. mockUSDC CEP-18 stays available as an advanced rail.
      </p>

      <div className="portal-grid" style={{ display: 'grid', gap: '1.25rem' }}>
        <div style={{ display: 'grid', gap: '1.25rem' }}>
          <Panel title="1. Wallet">
            <button
              onClick={() => void connectWalletSession()}
              disabled={busy !== null}
              style={primaryButtonStyle}
            >
              {busy === 'wallet'
                ? walletButtonBusyText(walletStep)
                : walletSessionReady
                  ? 'Wallet session ready'
                  : walletPublicKey
                    ? 'Finish wallet session'
                    : 'Connect Casper Wallet'}
            </button>
            {walletPublicKey && (
              <div style={{ ...smallCopyStyle, marginTop: '0.85rem', overflowWrap: 'anywhere' }}>
                {walletPublicKey}
              </div>
            )}
            <div style={{ ...smallCopyStyle, marginTop: '0.65rem' }}>
              {walletStatusText(walletStep, walletSessionReady)}
            </div>
          </Panel>

          <Panel title="2. Create order">
            <Field label="amount_usdc">
              <input
                value={amountUsdc}
                onChange={(e) => setAmountUsdc(e.target.value)}
                min="0.03"
                placeholder="0.03"
                style={inputStyle}
              />
            </Field>
            <button onClick={createOrder} disabled={busy !== null} style={primaryButtonStyle}>
              {busy === 'create' ? 'Creating...' : 'Create CSPR order'}
            </button>
          </Panel>

          <Panel title="3. Pay">
            <button
              onClick={sendAndVerify}
              disabled={!orderId || !payment || busy !== null}
              style={primaryButtonStyle}
            >
              {busy === 'send' ? 'Opening wallet...' : 'Send CSPR and verify'}
            </button>
            <div style={{ display: 'grid', gap: '0.55rem', marginTop: '0.9rem' }}>
              {paymentChecklist.map((item) => (
                <div key={item} style={smallCopyStyle}>
                  {item}
                </div>
              ))}
            </div>
          </Panel>

          <Panel title="Fallback verify">
            <Field label="deploy_hash">
              <input
                value={deployHash}
                onChange={(e) => setDeployHash(e.target.value)}
                placeholder="64-char Casper deploy hash"
                style={inputStyle}
              />
            </Field>
            <button
              onClick={() => void verifyPayment()}
              disabled={!orderId || !deployHash.trim() || busy !== null}
              style={secondaryButtonStyle}
            >
              {busy === 'verify' ? 'Verifying...' : 'Verify pasted deploy hash'}
            </button>
          </Panel>
        </div>

        <div style={{ display: 'grid', gap: '1.25rem' }}>
          <Panel title="Order response">
            {order ? (
              <JsonBlock value={order} />
            ) : (
              <EmptyCopy text="Create an order to see the exact Casper payment instruction." />
            )}
          </Panel>

          <Panel title="Transaction status">
            {statusUpdates.length ? (
              <div style={{ display: 'grid', gap: '0.45rem' }}>
                {statusUpdates.map((item) => (
                  <div key={item} style={smallCopyStyle}>
                    {item}
                  </div>
                ))}
              </div>
            ) : (
              <EmptyCopy text="CSPR.click status updates appear here while the wallet submits the transfer." />
            )}
          </Panel>

          <Panel title="Verification response">
            {verified ? (
              <JsonBlock value={verified} />
            ) : (
              <EmptyCopy text="After verification, this panel shows the receipt and mock virtual card payload." />
            )}
          </Panel>
        </div>
      </div>

      {error && (
        <div
          style={{
            marginTop: '1.25rem',
            padding: '0.9rem 1rem',
            borderRadius: 8,
            border: '1px solid var(--red-border)',
            background: 'var(--red-muted)',
            color: 'var(--red)',
            fontSize: '0.88rem',
          }}
        >
          {error}
        </div>
      )}

      <style>{`
        .portal-grid {
          grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.1fr);
        }
        @media (max-width: 960px) {
          .portal-grid {
            grid-template-columns: minmax(0, 1fr) !important;
          }
        }
      `}</style>
    </div>
  );
}

function shortKey(value: string) {
  return value.length > 18 ? `${value.slice(0, 10)}...${value.slice(-8)}` : value;
}

function walletButtonBusyText(step: WalletStep) {
  if (step === 'challenge') return 'Preparing login...';
  if (step === 'sign') return 'Waiting for signature...';
  if (step === 'verify') return 'Verifying session...';
  return 'Waiting for wallet...';
}

function walletStatusText(step: WalletStep, ready: boolean) {
  if (ready || step === 'ready') return 'Session ready for create-order.';
  if (step === 'sign') return 'Signature request is open in Casper Wallet.';
  if (step === 'verify') return 'Signature received; backend is verifying the wallet session.';
  if (step === 'challenge') return 'Creating a one-time wallet login challenge.';
  if (step === 'connected')
    return 'Wallet connected; complete the login signature to create orders.';
  return 'No wallet session yet.';
}

function statusDetail(data: unknown) {
  if (!data) return '';
  if (typeof data === 'string') return `: ${data.slice(0, 180)}`;
  if (typeof data !== 'object') return `: ${String(data).slice(0, 180)}`;
  const record = data as Record<string, unknown>;
  const useful =
    record.error ||
    record.message ||
    record.transactionHash ||
    record.deployHash ||
    record.hash ||
    record.status;
  if (useful) return `: ${String(useful).slice(0, 180)}`;
  try {
    return `: ${JSON.stringify(data).slice(0, 180)}`;
  } catch {
    return '';
  }
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 8,
        padding: '1.15rem',
      }}
    >
      <div className="type-eyebrow" style={{ color: 'var(--green)', marginBottom: '0.85rem' }}>
        {title}
      </div>
      {children}
    </section>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label style={{ display: 'grid', gap: '0.45rem', marginBottom: '0.9rem' }}>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--fg-dim)' }}>
        {label}
      </span>
      {children}
    </label>
  );
}

function JsonBlock({ value }: { value: unknown }) {
  return (
    <pre
      style={{
        margin: 0,
        padding: '1rem',
        borderRadius: 8,
        background: 'rgba(6, 8, 6, 0.9)',
        border: '1px solid var(--border)',
        overflowX: 'auto',
        fontFamily: 'var(--font-mono)',
        fontSize: '0.76rem',
        lineHeight: 1.6,
        color: 'var(--fg)',
      }}
    >
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

function EmptyCopy({ text }: { text: string }) {
  return <div style={smallCopyStyle}>{text}</div>;
}

const inputStyle: CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  borderRadius: 8,
  border: '1px solid var(--border)',
  background: 'var(--bg)',
  color: 'var(--fg)',
  padding: '0.85rem 0.95rem',
  fontSize: '0.9rem',
  fontFamily: 'var(--font-body)',
};

const primaryButtonStyle: CSSProperties = {
  borderRadius: 8,
  border: '1px solid var(--green-border)',
  background: 'var(--green-muted)',
  color: 'var(--green)',
  fontWeight: 600,
  fontFamily: 'var(--font-mono)',
  padding: '0.82rem 1.15rem',
  cursor: 'pointer',
};

const secondaryButtonStyle: CSSProperties = {
  ...primaryButtonStyle,
  border: '1px solid var(--border)',
  background: 'var(--surface)',
  color: 'var(--fg)',
};

const smallCopyStyle: CSSProperties = {
  fontSize: '0.86rem',
  color: 'var(--fg-muted)',
  lineHeight: 1.6,
};
