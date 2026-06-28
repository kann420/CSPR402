'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { NavLinks } from './NavLinks';
import { Wordmark } from './Wordmark';
import { XSocialLink } from './XSocialLink';
import { useEffect, useState } from 'react';
import type { MouseEvent, ReactNode } from 'react';

export function MarketingChrome({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const hideChrome = pathname.startsWith('/dashboard');
  const [scrolled, setScrolled] = useState(false);

  // Toggle a deeper-glass state once the page is scrolled past a few
  // pixels — gives the frozen header a perceptible "settle" effect.
  useEffect(() => {
    if (hideChrome) return;
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [hideChrome]);

  if (hideChrome) {
    return <>{children}</>;
  }

  return (
    <>
      <a href="#main" className="skip-link">
        Skip to main content
      </a>
      <div className="grain" aria-hidden />
      <nav className={`marketing-nav marketing-surface${scrolled ? ' is-scrolled' : ''}`}>
        <div
          style={{
            position: 'relative',
            zIndex: 2,
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
            className="marketing-logo"
            style={{
              textDecoration: 'none',
              display: 'flex',
              alignItems: 'center',
              gap: '0.6rem',
              color: 'var(--fg)',
              transition: 'color 0.4s var(--ease-out)',
            }}
            onMouseEnter={(e: MouseEvent<HTMLAnchorElement>) =>
              (e.currentTarget.style.color = 'var(--brand)')
            }
            onMouseLeave={(e: MouseEvent<HTMLAnchorElement>) =>
              (e.currentTarget.style.color = 'var(--fg)')
            }
          >
            <Wordmark height={38} title="CSPR402" transparent className="marketing-logo-mark" />
            <span
              style={{ width: 1, height: 20, background: 'var(--border-strong)' }}
              aria-hidden
            />
            <span
              className="brand-wordmark-text"
              style={{
                fontFamily: 'var(--font-display)',
                fontWeight: 600,
                fontSize: '1.05rem',
                letterSpacing: '-0.02em',
                lineHeight: 1,
                color: 'var(--fg)',
                whiteSpace: 'nowrap',
              }}
            >
              CSPR402
            </span>
          </Link>
          <NavLinks />
        </div>
      </nav>

      <main
        id="main"
        className="marketing-surface"
        style={{ flex: 1, position: 'relative', zIndex: 2 }}
      >
        {children}
      </main>

      <footer
        className="marketing-surface"
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
              <Wordmark height={34} title="CSPR402" transparent />
              <p
                style={{
                  fontSize: '0.78rem',
                  color: 'var(--fg-dim)',
                  lineHeight: 1.6,
                  maxWidth: 280,
                  margin: 0,
                }}
              >
                CSPR402 turns one on-chain Casper payment into a verified virtual card for AI agents
                — no custodial wallet, no off-chain trust, no manual reconciliation.
              </p>
            </div>

            <FooterCol title="Product">
              <FooterLink href="/docs">Docs</FooterLink>
              <FooterLink href="/docs/quickstart">Quickstart</FooterLink>
              <FooterLink href="/portal">Portal demo</FooterLink>
              <FooterLink href="/status">Status</FooterLink>
              <FooterLink href="/dashboard">Dashboard</FooterLink>
            </FooterCol>

            <FooterCol title="Build">
              <FooterLink href="/skill.md">skill.md</FooterLink>
              <FooterLink href="/llms.txt">llms.txt</FooterLink>
              <FooterLink href="https://docs.casper.network/" external>
                Casper docs
              </FooterLink>
            </FooterCol>

            <FooterCol title="Mode">
              <div style={{ fontSize: '0.82rem', color: 'var(--fg-muted)', lineHeight: 1.55 }}>
                Casper mainnet only.
                <br />
                Virtual card only.
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
            <span>Verified on-chain Casper payments for AI agents.</span>

            <div style={{ display: 'flex', alignItems: 'center', gap: '1.1rem' }}>
              <XSocialLink size={15} />
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
                Casper mainnet flow enabled
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
