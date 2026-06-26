import Link from 'next/link';
import { CopyCodeBlock } from '@/app/components/CopyCodeBlock';

const orderSnippet = `const order = await fetch('http://127.0.0.1:4000/v1/orders', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Api-Key': process.env.CSPR402_API_KEY!,
  },
  body: JSON.stringify({
    amount_usdc: '25.00',
    payment_asset: 'cspr_casper',
    payer_public_key: '<casper public key>',
  }),
}).then((res) => res.json());

// order.payment => recipient, amount, transfer_id, expires_at`;

const verifySnippet = `const verified = await fetch(
  \`http://127.0.0.1:4000/v1/orders/\${order.order_id}/verify-payment\`,
  {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Api-Key': process.env.CSPR402_API_KEY!,
    },
    body: JSON.stringify({
      deploy_hash: '<casper deploy hash>',
      sender_public_key: '<optional agent pubkey>',
    }),
  },
).then((res) => res.json());`;

const steps = [
  {
    num: '01',
    title: 'Create order',
    body: 'Backend returns a Casper testnet payment instruction with recipient, exact motes, transfer_id, and expiration.',
  },
  {
    num: '02',
    title: 'Send CSPR',
    body: 'Agent or local script submits one native transfer with casper-js-sdk. No hardcoded RPC or secrets in code.',
  },
  {
    num: '03',
    title: 'Verify deploy',
    body: 'Backend checks recipient, amount, transfer_id, execution success, and idempotency before fulfillment.',
  },
  {
    num: '04',
    title: 'Return receipt',
    body: 'Order is marked delivered and the API returns a mock virtual card plus a Casper receipt payload.',
  },
];

export default function HomePage() {
  return (
    <>
      <section
        style={{
          padding: '6.25rem 1.35rem 5rem',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <div
          className="radial-green-glow"
          aria-hidden
          style={{ opacity: 0.2, top: '-10%', right: '-5%', width: 520, height: 520 }}
        />
        <div
          style={{
            maxWidth: 1180,
            margin: '0 auto',
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1.05fr) minmax(0, 0.95fr)',
            gap: '3rem',
            alignItems: 'start',
          }}
          className="home-hero-grid"
        >
          <div>
            <div
              className="type-eyebrow"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.55rem' }}
            >
              <span
                className="pulse-green"
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background: 'var(--green)',
                  boxShadow: '0 0 12px var(--green-glow)',
                }}
              />
              Day 2 build - Casper testnet payment verification
            </div>

            <h1
              className="type-display"
              style={{
                marginTop: '1.35rem',
                marginBottom: '1.25rem',
                fontSize: 'clamp(2.7rem, 5.8vw + 0.5rem, 5rem)',
                color: 'var(--fg)',
                maxWidth: 760,
              }}
            >
              CSPR402 turns one Casper transfer into one verified mock card flow.
            </h1>

            <p
              className="type-body"
              style={{
                maxWidth: 620,
                fontSize: '1rem',
                color: 'var(--fg-muted)',
                marginBottom: '1.8rem',
              }}
            >
              This fork no longer sells a Stellar or real Visa story. It is a local hackathon MVP:
              create order, pay with Casper testnet CSPR, verify the deploy, and receive a simulated
              virtual card plus receipt.
            </p>

            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
              <Link href="/portal" className="home-cta home-cta--primary">
                Open portal demo
              </Link>
              <Link href="/docs/quickstart" className="home-cta home-cta--secondary">
                Local quickstart
              </Link>
            </div>
          </div>

          <div
            style={{
              background: 'linear-gradient(180deg, rgba(20,28,21,0.9), rgba(8,10,8,0.96))',
              border: '1px solid var(--green-border)',
              borderRadius: 18,
              padding: '1.1rem',
              boxShadow: 'var(--shadow-float)',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '0.95rem',
              }}
            >
              <div className="type-eyebrow" style={{ color: 'var(--green)' }}>
                Demo surface
              </div>
              <span
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.7rem',
                  color: 'var(--fg-dim)',
                }}
              >
                local only
              </span>
            </div>
            <CopyCodeBlock label="Create order">{orderSnippet}</CopyCodeBlock>
            <div style={{ height: '0.85rem' }} />
            <CopyCodeBlock label="Verify deploy">{verifySnippet}</CopyCodeBlock>
          </div>
        </div>
      </section>

      <section
        style={{
          borderTop: '1px solid var(--border)',
          borderBottom: '1px solid var(--border)',
          background: 'var(--surface)',
          padding: '2rem 1.35rem',
        }}
      >
        <div
          style={{
            maxWidth: 1180,
            margin: '0 auto',
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: '2rem',
          }}
        >
          {[
            { label: 'Rail', value: 'CSPR', sub: 'Casper testnet native transfer' },
            { label: 'Verify', value: 'Deploy', sub: 'recipient + amount + transfer_id' },
            { label: 'Fulfillment', value: 'Mock', sub: 'simulated virtual card only' },
            { label: 'Secrets', value: '.env', sub: 'RPC, keys, API vars kept local' },
          ].map((item) => (
            <div key={item.label}>
              <div className="type-eyebrow" style={{ fontSize: '0.62rem', marginBottom: '0.7rem' }}>
                {item.label}
              </div>
              <div
                style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: 'clamp(1.75rem, 3vw + 0.4rem, 2.3rem)',
                  fontWeight: 400,
                  letterSpacing: '-0.025em',
                  lineHeight: 1,
                  color: 'var(--fg)',
                  marginBottom: '0.35rem',
                }}
              >
                {item.value}
              </div>
              <div
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.7rem',
                  color: 'var(--fg-dim)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                }}
              >
                {item.sub}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section style={{ padding: '5rem 1.35rem' }}>
        <div style={{ maxWidth: 1180, margin: '0 auto' }}>
          <div className="type-eyebrow" style={{ color: 'var(--green)', marginBottom: '1rem' }}>
            Flow
          </div>
          <h2
            className="type-display-tight"
            style={{
              maxWidth: 760,
              fontSize: 'clamp(2rem, 4vw + 0.5rem, 3.35rem)',
              marginBottom: '3rem',
              color: 'var(--fg)',
            }}
          >
            The Day 2 path is intentionally narrow, testable, and honest.
          </h2>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
              gap: '1rem',
            }}
          >
            {steps.map((step) => (
              <article
                key={step.num}
                style={{
                  padding: '1.6rem',
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  borderRadius: 14,
                }}
              >
                <div
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: '0.68rem',
                    color: 'var(--green)',
                    letterSpacing: '0.12em',
                    marginBottom: '1rem',
                  }}
                >
                  {step.num}
                </div>
                <h3
                  style={{
                    fontFamily: 'var(--font-display)',
                    fontSize: '1.25rem',
                    fontWeight: 500,
                    letterSpacing: '-0.02em',
                    color: 'var(--fg)',
                    marginTop: 0,
                    marginBottom: '0.7rem',
                  }}
                >
                  {step.title}
                </h3>
                <p
                  style={{
                    margin: 0,
                    fontSize: '0.86rem',
                    color: 'var(--fg-muted)',
                    lineHeight: 1.6,
                  }}
                >
                  {step.body}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section style={{ padding: '0 1.35rem 6rem' }}>
        <div
          style={{
            maxWidth: 920,
            margin: '0 auto',
            padding: '2.6rem 2.2rem',
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 16,
          }}
        >
          <div className="type-eyebrow" style={{ color: 'var(--green)', marginBottom: '0.85rem' }}>
            What changed from the fork
          </div>
          <h2
            className="type-display-tight"
            style={{ fontSize: 'clamp(1.6rem, 3vw + 0.5rem, 2.2rem)', margin: '0 0 1rem' }}
          >
            No more pretending this repo still runs on Stellar.
          </h2>
          <p
            className="type-body"
            style={{ maxWidth: 700, fontSize: '0.95rem', marginBottom: '1.4rem' }}
          >
            The web copy, docs, and operator surfaces now point at Casper testnet transfer
            verification. Anything not implemented yet is labeled as not wired, instead of quietly
            inheriting legacy Stellar or issuer copy from upstream.
          </p>
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            <Link href="/docs" className="home-cta home-cta--secondary">
              Read API docs
            </Link>
            <Link href="/status" className="home-cta home-cta--secondary">
              Check local status
            </Link>
          </div>
        </div>
      </section>

      <style>{`
        .home-hero-grid {
          grid-template-columns: minmax(0, 1.05fr) minmax(0, 0.95fr);
        }
        .home-cta {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          text-decoration: none;
          border-radius: 999px;
          padding: 0.82rem 1.3rem;
          font-family: var(--font-body);
          font-size: 0.88rem;
          transition: transform 0.3s var(--ease-out), background 0.3s var(--ease-out);
        }
        .home-cta--primary {
          background: var(--fg);
          color: var(--bg);
          font-weight: 600;
        }
        .home-cta--secondary {
          background: transparent;
          color: var(--fg);
          border: 1px solid var(--border-strong);
          font-weight: 500;
        }
        .home-cta:hover {
          transform: translateY(-1px);
        }
        @media (max-width: 900px) {
          .home-hero-grid {
            grid-template-columns: minmax(0, 1fr) !important;
          }
        }
      `}</style>
    </>
  );
}
