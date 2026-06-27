import Link from 'next/link';
import { HeroCard, HeroScene } from '@/app/components/HeroCard';

const steps = [
  {
    num: '01',
    title: 'Create order',
    body: 'The API returns a Casper payment instruction — recipient, exact motes, transfer_id, and expiration — for the amount your agent needs.',
  },
  {
    num: '02',
    title: 'Send CSPR',
    body: 'Your agent submits one native transfer on Casper. No hardcoded RPC, no shared secrets, no custodial wallet sitting between you and the chain.',
  },
  {
    num: '03',
    title: 'Verify deploy',
    body: 'The backend verifies recipient, amount, transfer_id, execution success, and idempotency straight from the deploy before anything ships.',
  },
  {
    num: '04',
    title: 'Card delivered',
    body: 'Order is fulfilled and the API returns a ready-to-use virtual card number plus the Casper receipt that paid for it.',
  },
];

export default function HomePage() {
  return (
    <>
      <section
        className="home-hero"
        style={{
          padding: '6.5rem 1.35rem 5.5rem',
          position: 'relative',
          overflow: 'hidden',
          isolation: 'isolate',
        }}
      >
        <HeroScene />
        <div
          style={{
            maxWidth: 820,
            margin: '0 auto',
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            position: 'relative',
            zIndex: 1,
          }}
        >
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
            Casper mainnet · verified card payments
          </div>

          <h1
            className="type-display"
            style={{
              marginTop: '1.4rem',
              marginBottom: '1.15rem',
              fontSize: 'clamp(2.6rem, 5.4vw + 0.5rem, 4.6rem)',
              color: 'var(--fg)',
              maxWidth: 720,
            }}
          >
            One Casper transfer. <br />
            One verified card.
          </h1>

          <p
            className="type-body"
            style={{
              maxWidth: 620,
              margin: '0 auto 1.9rem',
              fontSize: '1.02rem',
              color: 'var(--fg-muted)',
            }}
          >
            AI agents need to spend money, but getting them a card usually means custodial wallets,
            off-chain trust, and reconciliation by hand. CSPR402 verifies a single on-chain Casper
            payment and returns a virtual card — no middleman holding funds, no manual matching.
          </p>

          <div
            style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', justifyContent: 'center' }}
          >
            <Link href="/dashboard" className="home-cta home-cta--primary">
              Open Dashboard
            </Link>
            <Link href="/docs/quickstart" className="home-cta home-cta--secondary">
              Read the quickstart
            </Link>
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            marginTop: '3.5rem',
            position: 'relative',
            zIndex: 1,
          }}
        >
          <HeroCard />
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
            { label: 'Rail', value: 'CSPR', sub: 'Casper native transfer' },
            { label: 'Verify', value: 'On-chain', sub: 'deploy recipient + amount + id' },
            { label: 'Settlement', value: 'Instant', sub: 'verified → fulfilled' },
            { label: 'Secrets', value: 'Yours', sub: 'keys + RPC stay with the agent' },
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

      <section style={{ padding: '4.5rem 1.35rem 2rem' }}>
        <div style={{ maxWidth: 1080, margin: '0 auto' }}>
          <div
            style={{
              borderRadius: 16,
              border: '1px solid var(--border)',
              overflow: 'hidden',
              background: '#000',
              boxShadow: '0 30px 80px -40px rgba(0,0,0,0.85), 0 0 0 1px rgba(255,255,255,0.02)',
            }}
          >
            <video
              src="/cspr402-release.mp4"
              controls
              autoPlay
              muted
              loop
              playsInline
              preload="metadata"
              aria-label="CSPR402 30-second product demo"
              style={{ display: 'block', width: '100%', height: 'auto' }}
            />
          </div>
        </div>
      </section>

      <section style={{ padding: '5rem 1.35rem' }}>
        <div style={{ maxWidth: 1180, margin: '0 auto' }}>
          <div className="type-eyebrow" style={{ color: 'var(--green)', marginBottom: '1rem' }}>
            How it works
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
            Pay on Casper. Verify on Casper. Get a card.
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
                className="home-step"
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
            textAlign: 'center',
          }}
        >
          <h2
            className="type-display-tight"
            style={{ fontSize: 'clamp(1.6rem, 3vw + 0.5rem, 2.2rem)', margin: '0 0 1rem' }}
          >
            Stop hand-reconciling agent payments.
          </h2>
          <p
            className="type-body"
            style={{ maxWidth: 620, margin: '0 auto 1.4rem', fontSize: '0.95rem' }}
          >
            One deploy, one verification, one card. Built on Casper so the proof of payment is the
            payment itself — no CSV exports, no matching emails, no waiting on a custodian to
            reconcile.
          </p>
          <div
            style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', justifyContent: 'center' }}
          >
            <Link href="/docs" className="home-cta home-cta--primary">
              Read the API docs
            </Link>
            <Link href="/status" className="home-cta home-cta--secondary">
              Check status
            </Link>
          </div>
        </div>
      </section>

      <style>{`
        .home-cta {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          text-decoration: none;
          border-radius: 999px;
          padding: 0.82rem 1.3rem;
          font-family: var(--font-body);
          font-size: 0.88rem;
          transition: transform 0.3s var(--ease-out), background 0.3s var(--ease-out),
            border-color 0.3s var(--ease-out), box-shadow 0.3s var(--ease-out);
        }
        .home-cta--primary {
          background: var(--brand);
          color: #fff;
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
        .home-cta--primary:hover {
          box-shadow: 0 8px 24px -8px var(--brand-glow);
        }
        .home-step {
          transition: border-color 0.3s var(--ease-out), transform 0.3s var(--ease-out);
        }
        .home-step:hover {
          transform: translateY(-2px);
          border-color: var(--green-border);
        }
      `}</style>
    </>
  );
}
