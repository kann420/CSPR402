import type { Metadata } from 'next';
import Link from 'next/link';
import { PageHero, PageSection } from '@/app/components/MarketingPage';
import { ogForPage, twitterForPage } from '@/app/lib/seo';

const DESCRIPTION =
  'CSPR402 is a Casper testnet MVP. No signup fee, no issuer fee schedule, and no real card fulfilment - just clearly-scoped demo economics.';

export const metadata: Metadata = {
  title: 'Pricing',
  description: DESCRIPTION,
  alternates: { canonical: 'https://cspr402.xyz/pricing' },
  openGraph: ogForPage({
    title: 'Pricing - CSPR402',
    description: 'Casper testnet demo economics. Wallet-paid network fees. Mock fulfilment only.',
    path: '/pricing',
  }),
  twitter: twitterForPage({
    title: 'Pricing - CSPR402',
    description: 'Casper testnet demo economics.',
  }),
};

const FEE_ROWS = [
  {
    label: 'CSPR402 service fee',
    value: '$0.00',
    note: 'No platform fee is charged in this MVP. The demo is about payment verification, not revenue collection.',
    highlight: true,
  },
  {
    label: 'Signup / account fee',
    value: '$0.00',
    note: 'No subscription, no seat licensing, no minimum volume commitment.',
    highlight: true,
  },
  {
    label: 'Casper testnet network fee',
    value: 'Wallet-paid',
    note: 'Your wallet pays the normal on-chain fee for submitting the deploy. CSPR402 does not add a separate network surcharge.',
  },
  {
    label: 'Mock fulfilment',
    value: '$0.00',
    note: 'Returned card data is simulated for the hackathon MVP. There is no real issuer or production card programme behind this flow.',
    highlight: true,
  },
  {
    label: 'Expired unpaid order',
    value: '$0.00',
    note: 'If the payment window expires before verification, the order simply times out. No funds are taken by the backend.',
  },
];

const LIMITS = [
  { label: 'Settlement rail', value: 'Casper testnet CSPR' },
  { label: 'Verification mode', value: 'Deploy hash + transfer_id' },
  { label: 'Fulfilment', value: 'Mock virtual card only' },
  { label: 'Optional bonus rail', value: 'mockUSDC CEP-18' },
];

const FAQ = [
  {
    q: 'Am I paying for a real card here?',
    a: 'No. CSPR402 returns a simulated virtual card as part of the hackathon MVP. The point of this demo is proving payment instruction generation, Casper deploy verification, and idempotent fulfilment behavior.',
  },
  {
    q: 'Do I pay network fees?',
    a: 'Yes. Your wallet pays the normal Casper testnet fee for the deploy you submit. CSPR402 does not add a second fee layer on top of that.',
  },
  {
    q: 'What assets are supported?',
    a: 'The MVP path is native Casper testnet CSPR. mockUSDC CEP-18 is an optional bonus path for demos, but the product language should stay explicit that it is a mock token rail.',
  },
  {
    q: 'What exactly gets verified?',
    a: 'The backend checks the chain, deploy success, deploy hash, recipient, amount, transfer_id, expiration window, and order state before it fulfils anything.',
  },
  {
    q: 'Can I get a refund?',
    a: 'This MVP is intentionally narrow. If a payment does not match the order requirements, the backend rejects fulfilment. Recovery or refund behavior beyond the verified happy path should be treated as implementation work, not assumed product behavior.',
  },
  {
    q: 'Why keep a pricing page if this is a demo?',
    a: 'Because operators still need a plain-English page that says what is and is not charged, what the wallet pays on-chain, and where the mock/demo boundary starts.',
  },
  {
    q: 'How does CSPR402 stay non-custodial?',
    a: 'The agent sends the Casper testnet payment directly on-chain and the backend verifies the finalized deploy. The service does not hold a pre-funded customer balance in escrow while the order is pending.',
  },
];

const faqJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: FAQ.map((f) => ({
    '@type': 'Question',
    name: f.q,
    acceptedAnswer: {
      '@type': 'Answer',
      text: f.a,
    },
  })),
};

const productJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Product',
  name: 'CSPR402 - Casper testnet payment demo for AI agents',
  description:
    'Casper-first payment verification for autonomous agents. Native CSPR in, mock virtual card receipt out.',
  brand: { '@type': 'Brand', name: 'CSPR402' },
  offers: {
    '@type': 'Offer',
    url: 'https://cspr402.xyz/pricing',
    priceCurrency: 'USD',
    price: '0.00',
    priceValidUntil: '2099-12-31',
    availability: 'https://schema.org/InStock',
    eligibleRegion: { '@type': 'Place', name: 'Worldwide' },
  },
};

export default function PricingPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify([faqJsonLd, productJsonLd]),
        }}
      />
      <PageHero
        eyebrow="Pricing"
        title="Casper testnet in. Mock"
        accent="fulfilment"
        intro="CSPR402 is a hackathon MVP, not a production issuer. There is no subscription, no signup fee, and no hidden platform charge. The only real cost in the happy path is the on-chain Casper testnet fee your wallet pays to submit the deploy."
      />

      <PageSection>
        <div className="pricing-fee-grid">
          {FEE_ROWS.map((row) => (
            <div key={row.label} className={`pricing-fee-tile ${row.highlight ? 'is-free' : ''}`}>
              <div className="type-eyebrow" style={{ fontSize: '0.6rem', marginBottom: '0.9rem' }}>
                {row.label}
              </div>
              <div
                style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: 'clamp(1.65rem, 2.8vw + 0.3rem, 2.25rem)',
                  fontWeight: 400,
                  letterSpacing: '-0.025em',
                  lineHeight: 1,
                  color: row.highlight ? 'var(--green)' : 'var(--fg)',
                  marginBottom: '0.9rem',
                }}
              >
                {row.value}
              </div>
              <p
                style={{
                  fontFamily: 'var(--font-body)',
                  fontSize: '0.82rem',
                  lineHeight: 1.6,
                  color: 'var(--fg-muted)',
                  margin: 0,
                }}
              >
                {row.note}
              </p>
            </div>
          ))}
        </div>
      </PageSection>

      <PageSection background="surface">
        <div
          style={{
            display: 'grid',
            gap: '3rem',
            gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
            alignItems: 'start',
          }}
          className="pricing-limits-grid"
        >
          <div>
            <div className="type-eyebrow" style={{ color: 'var(--green)', marginBottom: '1rem' }}>
              MVP boundaries
            </div>
            <h2
              className="type-display-tight"
              style={{
                fontSize: 'clamp(1.7rem, 2.8vw + 0.4rem, 2.4rem)',
                color: 'var(--fg)',
                margin: '0 0 1.5rem',
                maxWidth: 480,
              }}
            >
              What this demo actually covers.
            </h2>
            <p
              className="type-body"
              style={{ maxWidth: 500, fontSize: '0.95rem', marginBottom: '2rem' }}
            >
              Keep the language precise: Casper testnet payment, backend verification, and simulated
              virtual card fulfilment. Nothing on this page should be read as a production card
              programme.
            </p>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                gap: '1rem',
              }}
            >
              {LIMITS.map((l) => (
                <div
                  key={l.label}
                  style={{
                    padding: '1.15rem 1.1rem',
                    border: '1px solid var(--border)',
                    background: 'var(--bg)',
                    borderRadius: 12,
                  }}
                >
                  <div
                    className="type-eyebrow"
                    style={{ fontSize: '0.58rem', marginBottom: '0.55rem' }}
                  >
                    {l.label}
                  </div>
                  <div
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: '1.1rem',
                      color: 'var(--fg)',
                      fontWeight: 500,
                    }}
                  >
                    {l.value}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div
            style={{
              padding: '2rem 1.85rem',
              background: 'var(--bg)',
              border: '1px solid var(--border)',
              borderRadius: 14,
            }}
          >
            <div className="type-eyebrow" style={{ color: 'var(--fg-dim)', marginBottom: '1rem' }}>
              Fulfilment mode
            </div>
            <h3
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: '1.5rem',
                fontWeight: 500,
                color: 'var(--fg)',
                margin: '0 0 0.75rem',
                letterSpacing: '-0.02em',
              }}
            >
              Mock virtual card only
            </h3>
            <p
              style={{
                fontFamily: 'var(--font-body)',
                fontSize: '0.86rem',
                lineHeight: 1.65,
                color: 'var(--fg-muted)',
                margin: '0 0 1rem',
              }}
            >
              The API returns simulated card details for demo purposes only. They are not real Visa
              credentials, not reloadable balances, and not tied to a live issuer.
            </p>
            <ul
              style={{
                listStyle: 'none',
                padding: 0,
                margin: '0 0 1.25rem',
                fontFamily: 'var(--font-mono)',
                fontSize: '0.74rem',
                color: 'var(--fg-muted)',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.35rem',
              }}
            >
              <li>Payment rail · Casper testnet native CSPR</li>
              <li>Correlation · order_id + transfer_id + deploy hash</li>
              <li>Card mode · simulated / mock only</li>
              <li>Issuer dependency · none in this MVP path</li>
            </ul>
            <Link href="/legal/cardholder-agreement" className="link-arrow">
              Mock-card disclosure
            </Link>
          </div>
        </div>
      </PageSection>

      <PageSection eyebrow="Common questions" title="Pricing, in plain English.">
        <div
          style={{
            display: 'grid',
            gap: '0',
            borderTop: '1px solid var(--border)',
          }}
        >
          {FAQ.map((f) => (
            <details
              key={f.q}
              className="pricing-faq"
              style={{
                padding: '1.4rem 0.25rem',
                borderBottom: '1px solid var(--border)',
              }}
            >
              <summary
                style={{
                  cursor: 'pointer',
                  listStyle: 'none',
                  fontFamily: 'var(--font-display)',
                  fontSize: '1.15rem',
                  fontWeight: 500,
                  letterSpacing: '-0.015em',
                  color: 'var(--fg)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '1rem',
                }}
              >
                {f.q}
                <span
                  className="pricing-faq-chevron"
                  aria-hidden
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: '1rem',
                    color: 'var(--fg-dim)',
                    transition: 'transform 0.4s var(--ease-out)',
                    flexShrink: 0,
                  }}
                >
                  +
                </span>
              </summary>
              <p
                style={{
                  fontFamily: 'var(--font-body)',
                  fontSize: '0.92rem',
                  lineHeight: 1.7,
                  color: 'var(--fg-muted)',
                  margin: '0.9rem 0 0',
                  maxWidth: 680,
                }}
              >
                {f.a}
              </p>
            </details>
          ))}
        </div>
      </PageSection>

      <section style={{ padding: '3rem 1.35rem 6rem' }}>
        <div
          style={{
            maxWidth: 920,
            margin: '0 auto',
            padding: '3rem 2.5rem',
            background: 'var(--surface)',
            border: '1px solid var(--green-border)',
            borderRadius: 16,
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          <div className="radial-green-glow" aria-hidden style={{ opacity: 0.2 }} />
          <div style={{ position: 'relative' }}>
            <div
              className="type-eyebrow"
              style={{ color: 'var(--green)', marginBottom: '0.85rem' }}
            >
              Ready when you are
            </div>
            <h2
              className="type-display-tight"
              style={{
                fontSize: 'clamp(1.6rem, 3vw + 0.5rem, 2.4rem)',
                color: 'var(--fg)',
                margin: '0 0 1.5rem',
                maxWidth: 620,
              }}
            >
              The first verified demo receipt is two API calls away.
            </h2>
            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
              <Link
                href="/docs/quickstart"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.55rem',
                  padding: '0.85rem 1.35rem',
                  borderRadius: 999,
                  background: 'var(--fg)',
                  color: 'var(--bg)',
                  textDecoration: 'none',
                  fontSize: '0.88rem',
                  fontWeight: 600,
                }}
              >
                5-minute quickstart {'->'}
              </Link>
              <Link
                href="/dashboard"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.55rem',
                  padding: '0.85rem 1.35rem',
                  borderRadius: 999,
                  background: 'transparent',
                  color: 'var(--fg)',
                  border: '1px solid var(--border-strong)',
                  textDecoration: 'none',
                  fontSize: '0.88rem',
                  fontWeight: 500,
                }}
              >
                Create an API key
              </Link>
            </div>
          </div>
        </div>
      </section>

      <style>{`
        .pricing-fee-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
          gap: 1px;
          background: var(--border);
          border: 1px solid var(--border);
          border-radius: 14px;
          overflow: hidden;
        }
        .pricing-fee-tile {
          padding: 1.85rem 1.5rem;
          background: var(--bg);
          transition: background 0.4s var(--ease-out);
        }
        .pricing-fee-tile.is-free {
          background: var(--surface);
        }
        .pricing-fee-tile:hover {
          background: var(--surface);
        }
        .pricing-faq summary::-webkit-details-marker { display: none; }
        .pricing-faq[open] .pricing-faq-chevron { transform: rotate(45deg); }

        @media (max-width: 820px) {
          .pricing-limits-grid { grid-template-columns: minmax(0, 1fr) !important; }
        }
      `}</style>
    </>
  );
}
