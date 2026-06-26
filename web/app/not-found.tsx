import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Not found',
  description: 'The page you are looking for does not exist on CSPR402.',
  robots: { index: false, follow: false },
};

const SUGGESTIONS = [
  { href: '/', label: 'Home', body: 'The landing page and the hero card.' },
  { href: '/docs', label: 'Docs', body: 'Full HTTP API reference.' },
  {
    href: '/docs/quickstart',
    label: 'Quickstart',
    body: 'Five-minute integration walkthrough.',
  },
  { href: '/pricing', label: 'Pricing', body: 'Demo economics and MVP boundaries.' },
  { href: '/dashboard', label: 'Dashboard', body: 'Keys, orders, and agents.' },
  {
    href: '/changelog',
    label: 'Changelog',
    body: 'Everything shipped, chronologically.',
  },
];

export default function NotFound() {
  return (
    <div
      style={{
        minHeight: 'calc(100vh - 64px)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '4rem 1.35rem 6rem',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <div
        aria-hidden
        className="radial-green-glow"
        style={{ opacity: 0.08, filter: 'blur(80px)' }}
      />

      <div
        style={{
          position: 'relative',
          maxWidth: 720,
          width: '100%',
          textAlign: 'center',
        }}
      >
        <div className="type-eyebrow" style={{ color: 'var(--green)', marginBottom: '1.2rem' }}>
          HTTP 404 · Not found
        </div>
        <h1
          className="type-display"
          style={{
            fontSize: 'clamp(3.5rem, 8vw + 1rem, 7rem)',
            color: 'var(--fg)',
            margin: '0 0 1rem',
            lineHeight: 0.9,
          }}
        >
          Four{' '}
          <span
            style={{
              fontStyle: 'italic',
              fontVariationSettings: '"opsz" 144, "SOFT" 80',
              color: 'var(--green)',
            }}
          >
            oh
          </span>{' '}
          four.
        </h1>
        <p
          className="type-body"
          style={{
            fontSize: '1.02rem',
            color: 'var(--fg-muted)',
            maxWidth: 540,
            margin: '0 auto 3rem',
          }}
        >
          The URL you hit doesn&apos;t resolve to a CSPR402 page. If you landed here from a link on
          our site, please email{' '}
          <a
            href="mailto:support@cards402.com"
            style={{
              color: 'var(--fg)',
              textDecoration: 'none',
              borderBottom: '1px solid var(--green-border)',
            }}
          >
            support@cards402.com
          </a>{' '}
          so we can fix it.
        </p>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: '0.85rem',
            textAlign: 'left',
            maxWidth: 680,
            margin: '0 auto',
          }}
        >
          {SUGGESTIONS.map((s) => (
            <Link
              key={s.href}
              href={s.href}
              className="not-found-card"
              style={{
                display: 'block',
                padding: '1.2rem 1.1rem 1.25rem',
                border: '1px solid var(--border)',
                borderRadius: 12,
                background: 'var(--surface)',
                textDecoration: 'none',
              }}
            >
              <div
                className="type-eyebrow"
                style={{ fontSize: '0.58rem', marginBottom: '0.45rem', color: 'var(--green)' }}
              >
                {s.label}
              </div>
              <div
                style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: '1.1rem',
                  color: 'var(--fg)',
                  marginBottom: '0.35rem',
                }}
              >
                {s.label}
              </div>
              <div
                style={{
                  fontFamily: 'var(--font-body)',
                  fontSize: '0.82rem',
                  color: 'var(--fg-muted)',
                  lineHeight: 1.55,
                }}
              >
                {s.body}
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
