'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { NavLinks } from './NavLinks';
import { Wordmark } from './Wordmark';
import type { MouseEvent, ReactNode } from 'react';

export function MarketingChrome({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const hideChrome = pathname.startsWith('/dashboard');

  if (hideChrome) {
    return <>{children}</>;
  }

  return (
    <>
      <a href="#main" className="skip-link">
        Skip to main content
      </a>
      <div className="grain" aria-hidden />
      <nav
        className="marketing-nav"
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 50,
        }}
      >
        <div
          style={{
            maxWidth: 1180,
            margin: '0 auto',
            padding: '0 1.35rem',
            height: 64,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <Link
            href="/"
            style={{
              textDecoration: 'none',
              display: 'flex',
              alignItems: 'center',
              gap: '0.6rem',
              color: 'var(--fg)',
              transition: 'color 0.4s var(--ease-out)',
            }}
            onMouseEnter={(e: MouseEvent<HTMLAnchorElement>) =>
              (e.currentTarget.style.color = 'var(--green)')
            }
            onMouseLeave={(e: MouseEvent<HTMLAnchorElement>) =>
              (e.currentTarget.style.color = 'var(--fg)')
            }
          >
            <Wordmark height={38} title="CSPR402" />
          </Link>
          <NavLinks />
        </div>
      </nav>

      <main id="main" style={{ flex: 1, position: 'relative', zIndex: 2 }}>
        {children}
      </main>

      <footer
        style={{
          borderTop: '1px solid var(--border)',
          padding: '3.5rem 1.35rem 2.25rem',
          marginTop: '6rem',
          position: 'relative',
          zIndex: 2,
        }}
      >
        <div
          style={{
            maxWidth: 1180,
            margin: '0 auto',
            display: 'flex',
            flexDirection: 'column',
            gap: '2.5rem',
          }}
        >
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: '2rem',
              alignItems: 'start',
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
              <Wordmark height={34} title="CSPR402" />
              <p
                style={{
                  fontSize: '0.78rem',
                  color: 'var(--fg-dim)',
                  lineHeight: 1.6,
                  maxWidth: 280,
                  margin: 0,
                }}
              >
                CSPR402 is a hackathon fork for Casper testnet payments, backend deploy
                verification, and simulated virtual card fulfillment.
              </p>
            </div>

            <FooterCol title="Product">
              <FooterLink href="/docs">Docs</FooterLink>
              <FooterLink href="/docs/quickstart">Quickstart</FooterLink>
              <FooterLink href="/portal">Portal demo</FooterLink>
              <FooterLink href="/compare">Compare</FooterLink>
              <FooterLink href="/status">Status</FooterLink>
              <FooterLink href="/dashboard">Dashboard</FooterLink>
            </FooterCol>

            <FooterCol title="Build">
              <FooterLink href="/skill.md">skill.md</FooterLink>
              <FooterLink href="/llms.txt">llms.txt</FooterLink>
              <FooterLink href="https://docs.casper.network/" external>
                Casper docs
              </FooterLink>
              <FooterLink href="https://github.com/CTX-com/Cards402" external>
                Upstream fork
              </FooterLink>
            </FooterCol>

            <FooterCol title="Scope">
              <FooterLink href="/terms">Terms</FooterLink>
              <FooterLink href="/affiliate">Affiliate</FooterLink>
              <FooterLink href="/changelog">Changelog</FooterLink>
            </FooterCol>

            <FooterCol title="Mode">
              <div style={{ fontSize: '0.82rem', color: 'var(--fg-muted)', lineHeight: 1.55 }}>
                Casper testnet only.
                <br />
                Mock virtual card only.
                <br />
                No real Visa issuance in this MVP.
              </div>
            </FooterCol>
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingTop: '1.5rem',
              borderTop: '1px solid var(--border)',
              fontSize: '0.72rem',
              color: 'var(--fg-dim)',
              fontFamily: 'var(--font-mono)',
              flexWrap: 'wrap',
              gap: '0.75rem',
            }}
          >
            <span>Local hackathon build for Casper testnet transfer verification.</span>

            <div style={{ display: 'flex', alignItems: 'center', gap: '1.1rem' }}>
              <div style={{ display: 'flex', gap: '0.65rem' }}>
                <a
                  href="https://github.com/CTX-com/Cards402"
                  target="_blank"
                  rel="noreferrer"
                  aria-label="Upstream GitHub repository"
                  style={{
                    color: 'var(--fg-dim)',
                    display: 'inline-flex',
                    transition: 'color 0.3s var(--ease-out)',
                  }}
                  onMouseEnter={(e: MouseEvent<HTMLAnchorElement>) =>
                    (e.currentTarget.style.color = 'var(--fg)')
                  }
                  onMouseLeave={(e: MouseEvent<HTMLAnchorElement>) =>
                    (e.currentTarget.style.color = 'var(--fg-dim)')
                  }
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                    <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
                  </svg>
                </a>
              </div>

              <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span
                  className="pulse-green"
                  style={{
                    display: 'inline-block',
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    background: 'var(--green)',
                    boxShadow: '0 0 10px var(--green-glow)',
                  }}
                />
                Casper testnet flow enabled
              </span>
            </div>
          </div>
        </div>
      </footer>
    </>
  );
}

function FooterCol({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.7rem' }}>
      <div className="type-eyebrow" style={{ fontSize: '0.64rem', color: 'var(--fg-dim)' }}>
        {title}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>{children}</div>
    </div>
  );
}

function FooterLink({
  href,
  children,
  external,
}: {
  href: string;
  children: ReactNode;
  external?: boolean;
}) {
  return (
    <Link
      href={href}
      target={external ? '_blank' : undefined}
      rel={external ? 'noreferrer' : undefined}
      style={{
        color: 'var(--fg-muted)',
        textDecoration: 'none',
        fontSize: '0.82rem',
        fontFamily: 'var(--font-body)',
        transition: 'color 0.3s var(--ease-out)',
        display: 'inline-block',
        width: 'fit-content',
      }}
      onMouseEnter={(e: MouseEvent<HTMLAnchorElement>) =>
        (e.currentTarget.style.color = 'var(--fg)')
      }
      onMouseLeave={(e: MouseEvent<HTMLAnchorElement>) =>
        (e.currentTarget.style.color = 'var(--fg-muted)')
      }
    >
      {children}
    </Link>
  );
}
