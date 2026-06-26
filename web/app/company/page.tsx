import type { Metadata } from 'next';
import { PageHero, PageSection } from '@/app/components/MarketingPage';
import { ogForPage, twitterForPage } from '@/app/lib/seo';

export const metadata: Metadata = {
  title: 'Company',
  description:
    "CSPR402 is a small team building a Casper-first payment demo for AI agents. Here's who we are and where we're going.",
  alternates: { canonical: 'https://cards402.com/company' },
  openGraph: ogForPage({
    title: 'Company - CSPR402',
    description:
      'Casper-first payment infrastructure for AI agents. Built by a small, focused team.',
    path: '/company',
  }),
  twitter: twitterForPage({
    title: 'Company - CSPR402',
    description: 'Casper-first payment infrastructure for AI agents.',
  }),
};

const PRINCIPLES = [
  {
    title: 'Agents are the customer.',
    body: 'Not the humans who build them. Every design decision, from claim codes to deploy verification to mock fulfilment labeling, starts by asking what a program actually needs.',
  },
  {
    title: 'Ship one good thing.',
    body: 'CSPR402 does one job: turn a Casper testnet payment into a verified mock-card receipt. We will not bolt on a rewards programme, a fiat on-ramp, or a fake production narrative.',
  },
  {
    title: 'Write it down.',
    body: 'Every non-obvious decision ends up in a design doc, and every design doc eventually shows up on the docs site. If the only person who understands a subsystem is the person who wrote it, we failed.',
  },
  {
    title: 'Honest by default.',
    body: 'No dark patterns. No wish-casting. No pretending a hackathon prototype is already an issuer stack. We tell you what is real, what is mocked, and what still needs building.',
  },
];

const MILESTONES = [
  {
    date: 'Q1 2026',
    title: 'Hackathon fork and scope reset',
    body: 'Forked the upstream project, cut the Stellar-first product story, and narrowed the MVP to Casper testnet verification plus mock fulfilment.',
    status: 'Shipped',
  },
  {
    date: 'Q2 2026',
    title: 'Casper testnet CSPR flow',
    body: 'Orders now return Casper payment instructions, the backend verifies a finalized deploy, and the API returns a simulated virtual card receipt.',
    status: 'Shipped',
  },
  {
    date: 'Q3 2026',
    title: 'mockUSDC CEP-18 bonus rail',
    body: 'Add an optional test-token path without blocking the native CSPR MVP. Keep naming precise and verification strict.',
    status: 'In progress',
  },
  {
    date: 'Q4 2026',
    title: 'Sharper demo and agent tooling',
    body: 'Polish the agent-facing SDK, dashboard copy, and verification surfaces so the Casper-first story is obvious everywhere.',
    status: 'Planned',
  },
];

export default function CompanyPage() {
  return (
    <>
      <PageHero
        eyebrow="Company"
        title="Payment infrastructure for autonomous"
        accent="agents"
        intro="CSPR402 exists because agent payment demos get fuzzy fast: vague wallets, vague settlement, vague receipts, and a lot of hand-waving around what was actually verified. We're taking the opposite route: one Casper testnet payment, one backend verification pass, one clearly-labeled mock fulfilment result."
      />

      <PageSection>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 0.8fr) minmax(0, 1.2fr)',
            gap: '3rem',
            alignItems: 'start',
          }}
          className="company-mission-grid"
        >
          <div>
            <div className="type-eyebrow" style={{ color: 'var(--green)', marginBottom: '1rem' }}>
              Mission
            </div>
            <h2
              className="type-display-tight"
              style={{
                fontSize: 'clamp(1.8rem, 3vw + 0.4rem, 2.5rem)',
                color: 'var(--fg)',
                margin: 0,
                lineHeight: 1.05,
              }}
            >
              Make agent payment demos precise enough to trust.
            </h2>
          </div>
          <div>
            <p className="type-body" style={{ fontSize: '1rem', marginBottom: '1.2rem' }}>
              The web assumed a human was always there, at the other end of a checkout form, tapping
              a 3-D Secure OTP out of an iPhone. AI agents broke that assumption. The industry
              responded with either "wrap it in a shared corporate card" or "let the agent ask the
              human". Neither scales.
            </p>
            <p className="type-body" style={{ fontSize: '1rem', marginBottom: '1.2rem' }}>
              CSPR402 is the smallest credible answer we could ship. A Casper testnet payment in, a
              simulated virtual card receipt out, and a verification path that makes every important
              decision explicit. Boring, correct, and mostly invisible. That's the job.
            </p>
          </div>
        </div>
      </PageSection>

      <PageSection
        background="surface"
        eyebrow="Principles"
        title="Four things we refuse to compromise on."
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
            gap: '0',
            borderTop: '1px solid var(--border)',
            borderLeft: '1px solid var(--border)',
          }}
        >
          {PRINCIPLES.map((p) => (
            <article
              key={p.title}
              style={{
                padding: '1.85rem 1.65rem 2.15rem',
                borderRight: '1px solid var(--border)',
                borderBottom: '1px solid var(--border)',
                background: 'var(--bg)',
              }}
            >
              <h3
                style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: '1.3rem',
                  fontWeight: 500,
                  letterSpacing: '-0.02em',
                  color: 'var(--fg)',
                  margin: '0 0 0.85rem',
                  lineHeight: 1.12,
                }}
              >
                {p.title}
              </h3>
              <p
                style={{
                  fontFamily: 'var(--font-body)',
                  fontSize: '0.85rem',
                  color: 'var(--fg-muted)',
                  lineHeight: 1.65,
                  margin: 0,
                }}
              >
                {p.body}
              </p>
            </article>
          ))}
        </div>
      </PageSection>

      <PageSection eyebrow="Timeline" title="Where we are and where we're going.">
        <div
          style={{
            display: 'grid',
            gap: '0',
            borderTop: '1px solid var(--border)',
          }}
        >
          {MILESTONES.map((m) => (
            <div
              key={m.title}
              style={{
                padding: '2rem 0',
                borderBottom: '1px solid var(--border)',
                display: 'grid',
                gridTemplateColumns: 'minmax(120px, 140px) minmax(0, 1fr) minmax(120px, 140px)',
                gap: '2rem',
                alignItems: 'baseline',
              }}
              className="company-milestone-row"
            >
              <div
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.72rem',
                  color: 'var(--fg-dim)',
                  letterSpacing: '0.04em',
                  textTransform: 'uppercase',
                }}
              >
                {m.date}
              </div>
              <div>
                <h3
                  style={{
                    fontFamily: 'var(--font-display)',
                    fontSize: '1.3rem',
                    fontWeight: 500,
                    color: 'var(--fg)',
                    margin: '0 0 0.5rem',
                    letterSpacing: '-0.02em',
                  }}
                >
                  {m.title}
                </h3>
                <p
                  style={{
                    fontFamily: 'var(--font-body)',
                    fontSize: '0.88rem',
                    color: 'var(--fg-muted)',
                    lineHeight: 1.6,
                    margin: 0,
                    maxWidth: 580,
                  }}
                >
                  {m.body}
                </p>
              </div>
              <div>
                <span
                  className={m.status === 'Shipped' ? 'status-delivered' : ''}
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: '0.68rem',
                    padding: '0.28rem 0.6rem',
                    borderRadius: 999,
                    border: '1px solid',
                    fontWeight: 600,
                    whiteSpace: 'nowrap',
                    color:
                      m.status === 'Shipped'
                        ? 'var(--green)'
                        : m.status === 'In progress'
                          ? 'var(--yellow)'
                          : 'var(--fg-dim)',
                    borderColor:
                      m.status === 'Shipped'
                        ? 'var(--green-border)'
                        : m.status === 'In progress'
                          ? 'var(--yellow-border)'
                          : 'var(--border-strong)',
                    background:
                      m.status === 'Shipped'
                        ? 'var(--green-muted)'
                        : m.status === 'In progress'
                          ? 'var(--yellow-muted)'
                          : 'transparent',
                  }}
                >
                  {m.status}
                </span>
              </div>
            </div>
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
            border: '1px solid var(--border)',
            borderRadius: 16,
          }}
        >
          <div className="type-eyebrow" style={{ color: 'var(--green)', marginBottom: '0.9rem' }}>
            Contact
          </div>
          <h2
            className="type-display-tight"
            style={{
              fontSize: 'clamp(1.5rem, 2.8vw + 0.5rem, 2.1rem)',
              color: 'var(--fg)',
              margin: '0 0 1.35rem',
              maxWidth: 620,
            }}
          >
            Want to work with us, invest, or just say hi?
          </h2>
          <div
            style={{
              display: 'flex',
              gap: '1.5rem',
              flexWrap: 'wrap',
              fontFamily: 'var(--font-mono)',
              fontSize: '0.8rem',
            }}
          >
            {[
              ['General', 'hello@cards402.com'],
              ['Careers', 'careers@cards402.com'],
              ['Press', 'press@cards402.com'],
              ['Partnerships', 'partners@cards402.com'],
            ].map(([label, email]) => (
              <div key={label}>
                <div
                  className="type-eyebrow"
                  style={{ fontSize: '0.58rem', marginBottom: '0.35rem' }}
                >
                  {label}
                </div>
                <a
                  href={`mailto:${email}`}
                  style={{
                    color: 'var(--fg)',
                    textDecoration: 'none',
                    borderBottom: '1px solid var(--green-border)',
                  }}
                >
                  {email}
                </a>
              </div>
            ))}
          </div>
        </div>
      </section>

      <style>{`
        @media (max-width: 820px) {
          .company-mission-grid { grid-template-columns: minmax(0, 1fr) !important; gap: 1.5rem !important; }
          .company-milestone-row { grid-template-columns: minmax(0, 1fr) !important; gap: 0.75rem !important; }
        }
      `}</style>
    </>
  );
}
