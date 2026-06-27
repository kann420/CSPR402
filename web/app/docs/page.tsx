import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { CopyCodeBlock } from '@/app/components/CopyCodeBlock';

export const metadata: Metadata = {
  title: 'API Docs',
  description:
    'CSPR402 API reference: create an order, pay with Casper mainnet CSPR, verify the deploy, and receive a virtual card.',
};

const createOrderRequest = `POST /v1/orders
X-Api-Key: cards402_...
Content-Type: application/json

{
  "amount_usdc": "25.00"
}`;

const createOrderResponse = `{
  "order_id": "92d636de-df11-4196-9627-ec7850c925b7",
  "status": "pending_payment",
  "phase": "awaiting_payment",
  "amount_usdc": "25.00",
  "payment": {
    "type": "casper_cspr_transfer",
    "network": "mainnet",
    "chain_name": "casper",
    "recipient": "01f7...treasury-public-key",
    "amount": "2500",
    "amount_motes": "250000000000",
    "transfer_id": 100004,
    "order_id": "92d636de-df11-4196-9627-ec7850c925b7",
    "expires_at": "2026-06-24T10:15:00.000Z"
  },
  "poll_url": "/v1/orders/92d636de-df11-4196-9627-ec7850c925b7"
}`;

const verifyRequest = `POST /v1/orders/:id/verify-payment
X-Api-Key: cards402_...
Content-Type: application/json

{
  "deploy_hash": "73eb92b1c72b52b5a469bcab4c7e894fdf619245100bd8ad00893b8a59132988",
  "sender_public_key": "0203...optional-agent-public-key"
}`;

const verifyResponse = `{
  "ok": true,
  "receipt": {
    "type": "casper_cspr_receipt",
    "order_id": "92d636de-df11-4196-9627-ec7850c925b7",
    "payment_asset": "cspr_casper",
    "network": "mainnet",
    "chain_name": "casper",
    "deploy_hash": "73eb92b1c72b52b5a469bcab4c7e894fdf619245100bd8ad00893b8a59132988",
    "sender_public_key": "0203...optional-agent-public-key",
    "recipient": "01f7...treasury-public-key",
    "transfer_id": 100004,
    "amount_motes": "250000000000",
    "card_mode": "mock"
  },
  "order": {
    "order_id": "92d636de-df11-4196-9627-ec7850c925b7",
    "status": "delivered",
    "phase": "ready",
    "amount_usdc": "25.00",
    "payment_asset": "cspr_casper",
    "card": {
      "number": "4111111111111111",
      "cvv": "123",
      "expiry": "12/99",
      "brand": "Visa"
    }
  }
}`;

const pollPending = `GET /v1/orders/92d636de-df11-4196-9627-ec7850c925b7
X-Api-Key: cards402_...

{
  "order_id": "92d636de-df11-4196-9627-ec7850c925b7",
  "status": "pending_payment",
  "phase": "awaiting_payment",
  "amount_usdc": "25.00",
  "payment_asset": "cspr_casper",
  "created_at": "2026-06-24T09:45:00.000Z",
  "updated_at": "2026-06-24T09:45:00.000Z"
}`;

const pollDelivered = `{
  "order_id": "92d636de-df11-4196-9627-ec7850c925b7",
  "status": "delivered",
  "phase": "ready",
  "amount_usdc": "25.00",
  "payment_asset": "cspr_casper",
  "created_at": "2026-06-24T09:45:00.000Z",
  "updated_at": "2026-06-24T09:48:12.000Z",
  "card": {
    "number": "4111111111111111",
    "cvv": "123",
    "expiry": "12/99",
    "brand": "Visa"
  }
}`;

function Section({
  id,
  eyebrow,
  title,
  children,
}: {
  id: string;
  eyebrow: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      style={{
        scrollMarginTop: 96,
        paddingTop: '3rem',
        marginTop: '2rem',
        borderTop: '1px solid var(--border)',
      }}
    >
      <div className="type-eyebrow" style={{ color: 'var(--green)', marginBottom: '1rem' }}>
        {eyebrow}
      </div>
      <h2
        className="type-display-tight"
        style={{ fontSize: 'clamp(1.8rem, 3vw + 0.5rem, 2.5rem)', margin: '0 0 1rem' }}
      >
        {title}
      </h2>
      {children}
    </section>
  );
}

export default function DocsPage() {
  return (
    <div style={{ maxWidth: 920, margin: '0 auto', padding: '4.5rem 1.75rem 6rem' }}>
      <div className="type-eyebrow" style={{ color: 'var(--green)', marginBottom: '1rem' }}>
        API Reference
      </div>
      <h1
        className="type-display"
        style={{ fontSize: 'clamp(2.4rem, 4vw + 0.5rem, 3.8rem)', margin: '0 0 1.2rem' }}
      >
        Casper mainnet payment flow, end to end.
      </h1>
      <p
        className="type-body"
        style={{ maxWidth: 680, fontSize: '1rem', color: 'var(--fg-muted)' }}
      >
        Create an order, send a Casper mainnet native transfer with a unique{' '}
        <code>transfer_id</code>, then ask the backend to verify the deploy before mock fulfillment.
        For local setup, start with{' '}
        <Link href="/docs/quickstart" style={{ color: 'var(--fg)' }}>
          Quickstart
        </Link>
        .
      </p>

      <Section id="auth" eyebrow="01 · Authentication" title="One header, one key.">
        <p className="type-body" style={{ maxWidth: 720 }}>
          Every request carries an <code>X-Api-Key</code> header. Keys are prefixed{' '}
          <code>cards402_</code> and scoped to a per-key spend budget. Keep the real value in local
          env only — the web demo at <Link href="/portal">/portal</Link> asks for the key at runtime
          and never hardcodes it into source.
        </p>
        <CopyCodeBlock label="Header">X-Api-Key: cards402_a1b2c3d4e5f6...</CopyCodeBlock>
      </Section>

      <Section id="create-order" eyebrow="02 · Create order" title="One transfer in, one card out.">
        <p className="type-body" style={{ maxWidth: 720 }}>
          <code>POST /v1/orders</code> returns the treasury recipient, exact amount, amount in
          motes, transfer id, and expiry. The agent sends exactly that instruction to Casper mainnet
          within the payment window.
        </p>
        <CopyCodeBlock label="Request">{createOrderRequest}</CopyCodeBlock>
        <div style={{ height: '0.9rem' }} />
        <CopyCodeBlock label="Response">{createOrderResponse}</CopyCodeBlock>
      </Section>

      <Section id="verify" eyebrow="03 · Verify deploy" title="Prove the transfer, get the card.">
        <p className="type-body" style={{ maxWidth: 720 }}>
          <code>POST /v1/orders/:id/verify-payment</code> is the verification step. The backend
          looks up the deploy on Casper mainnet, checks every rule in the next section, and only
          fulfills once all of them pass. Idempotent — call it as many times as you like.
        </p>
        <CopyCodeBlock label="Request">{verifyRequest}</CopyCodeBlock>
        <div style={{ height: '0.9rem' }} />
        <CopyCodeBlock label="Response">{verifyResponse}</CopyCodeBlock>
      </Section>

      <Section id="poll" eyebrow="04 · Poll" title="When you'd rather not stream.">
        <p className="type-body" style={{ maxWidth: 720 }}>
          <code>GET /v1/orders/:id</code> returns the same order shape as the create response. Poll
          it after the transfer lands and before (or instead of) calling verify. The{' '}
          <code>poll_url</code> from the create response is the path to use.
        </p>
        <CopyCodeBlock label="Pending">{pollPending}</CopyCodeBlock>
        <div style={{ height: '0.9rem' }} />
        <CopyCodeBlock label="Delivered">{pollDelivered}</CopyCodeBlock>
      </Section>

      <Section
        id="rules"
        eyebrow="05 · Verification rules"
        title="Six rules, enforced server-side."
      >
        <p
          className="type-body"
          style={{ maxWidth: 720, color: 'var(--fg-muted)', marginBottom: '1.25rem' }}
        >
          The backend re-runs all six on every verify call. Fail any one and the deploy is rejected.
        </p>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
            gap: '1rem',
          }}
        >
          {[
            'Deploy exists on Casper mainnet and execution succeeded.',
            'Recipient equals the configured treasury public key.',
            'Amount matches the order payment instruction.',
            'transfer_id maps to the order and is not reused.',
            'Order is still payable and not already fulfilled.',
            'Repeated verify calls stay idempotent.',
          ].map((rule) => (
            <div
              key={rule}
              style={{
                padding: '1rem 1.1rem',
                border: '1px solid var(--border)',
                background: 'var(--surface)',
                borderRadius: 12,
                fontSize: '0.88rem',
                color: 'var(--fg-muted)',
                lineHeight: 1.55,
              }}
            >
              {rule}
            </div>
          ))}
        </div>
      </Section>

      <Section id="statuses" eyebrow="06 · Order statuses" title="A tiny state machine.">
        <p
          className="type-body"
          style={{ maxWidth: 720, color: 'var(--fg-muted)', marginBottom: '1.25rem' }}
        >
          Linear and terminal-leaning: <code>pending_payment</code> resolves to{' '}
          <code>delivered</code> on a verified deploy; everything else is a dead end.
        </p>
        <div style={{ overflowX: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th>Status</th>
                <th>Meaning</th>
              </tr>
            </thead>
            <tbody>
              {[
                ['pending_payment', 'Order was created and is waiting for the Casper transfer.'],
                ['delivered', 'Deploy verified, virtual card fulfilled, receipt available.'],
                ['failed', 'Verification or fulfillment failed.'],
                ['expired', 'Payment window ended before a valid transfer was confirmed.'],
                ['rejected', 'Order could not proceed due to policy or operator action.'],
              ].map(([status, meaning]) => (
                <tr key={status}>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}>{status}</td>
                  <td style={{ color: 'var(--fg-muted)', fontSize: '0.88rem' }}>{meaning}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section id="errors" eyebrow="07 · Error codes" title="Typed, stable, documented.">
        <p
          className="type-body"
          style={{ maxWidth: 720, color: 'var(--fg-muted)', marginBottom: '1.25rem' }}
        >
          All errors return JSON with an <code>error</code> string and an optional{' '}
          <code>message</code>. The codes below cover every verification failure mode.
        </p>
        <div style={{ overflowX: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th>Code</th>
                <th>Meaning</th>
              </tr>
            </thead>
            <tbody>
              {[
                ['invalid_deploy_hash', 'deploy_hash is missing or malformed.'],
                ['order_not_found', 'Order id does not belong to the provided API key.'],
                ['order_not_payable', 'Order is no longer in a payable state.'],
                ['payment_expired', 'Order expired before a valid verification happened.'],
                [
                  'payment_already_redeemed',
                  'That deploy hash has already been used for another order.',
                ],
                ['casper_rpc_error', 'Backend could not complete RPC verification.'],
              ].map(([code, meaning]) => (
                <tr key={code}>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}>{code}</td>
                  <td style={{ color: 'var(--fg-muted)', fontSize: '0.88rem' }}>{meaning}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
    </div>
  );
}
