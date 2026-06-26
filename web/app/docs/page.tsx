import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { CopyCodeBlock } from '@/app/components/CopyCodeBlock';

export const metadata: Metadata = {
  title: 'API Docs',
  description:
    'CSPR402 API reference for creating an order, paying with Casper testnet CSPR, and verifying the resulting deploy.',
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
    "network": "testnet",
    "chain_name": "casper-test",
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
    "network": "testnet",
    "chain_name": "casper-test",
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
        Docs - Day 2 API
      </div>
      <h1
        className="type-display"
        style={{ fontSize: 'clamp(2.4rem, 4vw + 0.5rem, 3.8rem)', margin: '0 0 1.2rem' }}
      >
        Casper testnet payment flow, end to end.
      </h1>
      <p
        className="type-body"
        style={{ maxWidth: 680, fontSize: '1rem', color: 'var(--fg-muted)' }}
      >
        CSPR402 now documents the actual implemented MVP: create an order, send a Casper testnet
        native transfer with a unique <code>transfer_id</code>, then ask the backend to verify the
        deploy before mock fulfillment. For local setup, start with{' '}
        <Link href="/docs/quickstart" style={{ color: 'var(--fg)' }}>
          Quickstart
        </Link>
        .
      </p>

      <Section id="auth" eyebrow="01 - Auth" title="One API key header.">
        <p className="type-body" style={{ maxWidth: 720 }}>
          All agent-side requests use <code>X-Api-Key</code>. Keep the real value in local env only.
          The web demo at <Link href="/portal">/portal</Link> asks you to paste the key at runtime
          and does not hardcode it into source.
        </p>
      </Section>

      <Section
        id="create-order"
        eyebrow="02 - Create order"
        title="Get exact Casper payment instructions."
      >
        <p className="type-body" style={{ maxWidth: 720 }}>
          <code>POST /v1/orders</code> returns the treasury recipient, exact amount, amount in
          motes, transfer id, and expiry. The agent should pay exactly that instruction.
        </p>
        <CopyCodeBlock label="Request">{createOrderRequest}</CopyCodeBlock>
        <div style={{ height: '0.9rem' }} />
        <CopyCodeBlock label="Response">{createOrderResponse}</CopyCodeBlock>
      </Section>

      <Section
        id="verify"
        eyebrow="03 - Verify deploy"
        title="Confirm the actual transfer before delivery."
      >
        <p className="type-body" style={{ maxWidth: 720 }}>
          <code>POST /v1/orders/:id/verify-payment</code> is the Day 2 checkpoint. Backend only
          fulfills once the deploy is found and all verification rules pass.
        </p>
        <CopyCodeBlock label="Request">{verifyRequest}</CopyCodeBlock>
        <div style={{ height: '0.9rem' }} />
        <CopyCodeBlock label="Response">{verifyResponse}</CopyCodeBlock>
      </Section>

      <Section id="rules" eyebrow="04 - Rules" title="What backend verification enforces.">
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
            gap: '1rem',
          }}
        >
          {[
            'Deploy exists on Casper testnet and execution succeeded.',
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

      <Section id="statuses" eyebrow="05 - Statuses" title="Stable order states.">
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
                ['delivered', 'Deploy verified, mock card fulfilled, receipt available.'],
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

      <Section id="errors" eyebrow="06 - Errors" title="Common verification failures.">
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
