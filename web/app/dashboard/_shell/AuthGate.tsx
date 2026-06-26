'use client';

import { useState } from 'react';
import { Button } from '../_ui/Button';
import { Input } from '../_ui/Input';
import { Wordmark } from '@/app/components/Wordmark';
import { connectWallet, signWalletMessage } from '@/app/lib/csprclick-client';

const ENABLE_EMAIL_FALLBACK = process.env.NEXT_PUBLIC_ENABLE_EMAIL_LOGIN === 'true';

async function readJson(res: Response) {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.message || body?.error || `HTTP ${res.status}`);
  return body;
}

export function AuthGate() {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [stage, setStage] = useState<'email' | 'code'>('email');
  const [busy, setBusy] = useState<'wallet' | 'demo' | 'email' | 'code' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [walletPublicKey, setWalletPublicKey] = useState<string | null>(null);

  async function connectAndSignIn() {
    setError(null);
    setBusy('wallet');
    try {
      const publicKey = await connectWallet();
      setWalletPublicKey(publicKey);
      const challenge = await fetch('/api/auth/wallet/challenge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          public_key: publicKey,
          domain: window.location.host,
        }),
      }).then(readJson);
      const signatureHex = await signWalletMessage(challenge.message, publicKey);
      await fetch('/api/auth/wallet/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          public_key: publicKey,
          nonce: challenge.nonce,
          signature_hex: signatureHex,
        }),
      }).then(readJson);
      window.location.reload();
    } catch (err) {
      setError((err as Error).message || 'Wallet login failed.');
    } finally {
      setBusy(null);
    }
  }

  async function demoSignIn() {
    setError(null);
    setBusy('demo');
    try {
      await fetch('/api/auth/demo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      }).then(readJson);
      window.location.reload();
    } catch (err) {
      setError((err as Error).message || 'Demo login failed.');
    } finally {
      setBusy(null);
    }
  }

  async function sendCode() {
    setError(null);
    setBusy('email');
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) throw new Error('failed to send code');
      setStage('code');
    } catch (err) {
      setError((err as Error).message || 'failed');
    } finally {
      setBusy(null);
    }
  }

  async function verifyCode() {
    setError(null);
    setBusy('code');
    try {
      const res = await fetch('/api/auth/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code }),
      });
      if (!res.ok) throw new Error('invalid code');
      window.location.reload();
    } catch (err) {
      setError((err as Error).message || 'failed');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--bg)',
        padding: '1.5rem',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 400,
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 8,
          padding: '1.7rem',
          boxShadow: 'var(--shadow-card)',
        }}
      >
        <div style={{ marginBottom: '1rem', color: 'var(--fg)' }}>
          <Wordmark height={42} />
        </div>
        <div
          style={{
            fontSize: '0.8rem',
            color: 'var(--fg-dim)',
            marginBottom: '1.1rem',
            lineHeight: 1.5,
          }}
        >
          Sign in with a Casper testnet wallet to open the demo dashboard.
        </div>

        <Button
          type="button"
          variant="primary"
          onClick={connectAndSignIn}
          disabled={busy !== null}
          style={{ width: '100%', justifyContent: 'center' }}
        >
          {busy === 'wallet' ? 'Waiting for wallet...' : 'Connect Casper Wallet'}
        </Button>

        <Button
          type="button"
          variant="secondary"
          onClick={demoSignIn}
          disabled={busy !== null}
          style={{ width: '100%', justifyContent: 'center', marginTop: '0.7rem' }}
        >
          {busy === 'demo' ? 'Opening...' : 'Open demo dashboard'}
        </Button>

        {walletPublicKey && (
          <div
            style={{
              marginTop: '0.85rem',
              fontFamily: 'var(--font-mono)',
              fontSize: '0.68rem',
              lineHeight: 1.5,
              color: 'var(--fg-dim)',
              overflowWrap: 'anywhere',
            }}
          >
            {walletPublicKey}
          </div>
        )}

        {ENABLE_EMAIL_FALLBACK && (
          <div
            style={{
              marginTop: '1.3rem',
              paddingTop: '1.1rem',
              borderTop: '1px solid var(--border)',
            }}
          >
            <div
              style={{
                fontSize: '0.72rem',
                color: 'var(--fg-dim)',
                marginBottom: '0.8rem',
              }}
            >
              Developer email fallback
            </div>
            {stage === 'email' ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!busy && email) void sendCode();
                }}
                style={{ display: 'flex', flexDirection: 'column', gap: '0.7rem' }}
              >
                <Input
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
                <Button
                  type="submit"
                  variant="secondary"
                  disabled={busy !== null || !email}
                  style={{ width: '100%', justifyContent: 'center' }}
                >
                  {busy === 'email' ? 'Sending...' : 'Send code'}
                </Button>
              </form>
            ) : (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!busy && code.length >= 6) void verifyCode();
                }}
                style={{ display: 'flex', flexDirection: 'column', gap: '0.7rem' }}
              >
                <Input
                  placeholder="6-digit code"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                />
                <Button
                  type="submit"
                  variant="secondary"
                  disabled={busy !== null || code.length < 6}
                  style={{ width: '100%', justifyContent: 'center' }}
                >
                  {busy === 'code' ? 'Verifying...' : 'Sign in'}
                </Button>
              </form>
            )}
          </div>
        )}

        {error && (
          <div
            style={{
              marginTop: '0.85rem',
              fontSize: '0.72rem',
              color: 'var(--red)',
              padding: '0.55rem 0.7rem',
              background: 'var(--red-muted)',
              border: '1px solid var(--red-border)',
              borderRadius: 6,
            }}
          >
            {error}
          </div>
        )}
      </div>
    </div>
  );
}
