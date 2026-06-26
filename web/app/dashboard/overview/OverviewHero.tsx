// OverviewHero — editorial hero band for the overview page. Mirrors the
// landing page's type recipe (type-eyebrow + pulse-green dot +
// type-display + type-body) and pairs it with a compact, always-dark
// "dashboard summary" card fed with REAL telemetry by the page (not the
// landing's placeholder $420.69 mock). A physical card stays dark in
// both themes, so the card face uses fixed dark gradients + cream ink
// while the accents use the dashboard --green* tokens.
//
// Motion-ignorant by construction: the .overview-hero-reveal class plus
// the inline animationDelay carry the staggered entrance, and the global
// prefers-reduced-motion guard collapses it. No pointer-tilt / rAF loop
// — this is a static card on an operational page.

import type { ReactNode } from 'react';

interface HeroCardData {
  networkLabel: string;
  balanceLabel: string;
  balanceValue: string;
  digitsLabel: string;
  digitsValue: string;
  footLabel: string;
  live: boolean;
}

interface Props {
  eyebrow: string;
  eyebrowLive?: boolean;
  title: ReactNode;
  subtitle: ReactNode;
  card: HeroCardData;
}

export function OverviewHero({ eyebrow, eyebrowLive = true, title, subtitle, card }: Props) {
  return (
    <section className="overview-hero" data-ov-hero>
      <div className="overview-hero-text">
        <div
          className="type-eyebrow overview-hero-reveal"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.55rem',
            animationDelay: '0.05s',
          }}
        >
          <span
            className={eyebrowLive ? 'pulse-green' : undefined}
            style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: eyebrowLive ? 'var(--green)' : 'var(--red)',
              boxShadow: eyebrowLive ? '0 0 12px var(--green-glow)' : 'none',
              display: 'inline-block',
            }}
          />
          {eyebrow}
        </div>
        <h1
          className="type-display overview-hero-reveal"
          style={{
            fontSize: 'clamp(2rem, 3vw + 0.5rem, 2.8rem)',
            color: 'var(--fg)',
            marginTop: '0.7rem',
            marginBottom: '0.6rem',
            animationDelay: '0.13s',
          }}
        >
          {title}
        </h1>
        <p
          className="type-body overview-hero-reveal"
          style={{
            fontSize: '0.9rem',
            color: 'var(--fg-muted)',
            margin: 0,
            animationDelay: '0.21s',
          }}
        >
          {subtitle}
        </p>
      </div>

      <div className="overview-hero-reveal" style={{ animationDelay: '0.29s' }}>
        <article
          className="ov-hero-card"
          data-live={card.live ? 'true' : 'false'}
          aria-label="Dashboard summary card"
        >
          <div className="ov-hero-sheen" aria-hidden />
          <div className="ov-hero-card-content">
            <header className="ov-hero-topline">
              <span className="ov-hero-brand">x402</span>
              <span className="ov-hero-net">
                <span className="ov-hero-net-dot" aria-hidden />
                {card.networkLabel}
              </span>
            </header>
            <div className="ov-hero-middle">
              <div className="ov-hero-middle-left">
                <div className="ov-hero-chip" aria-hidden />
                <div className="ov-hero-balance">
                  <span>{card.balanceLabel}</span>
                  <strong>{card.balanceValue}</strong>
                </div>
              </div>
              <div className="ov-hero-digits">
                <span className="ov-hero-digits-label">{card.digitsLabel}</span>
                <span className="ov-hero-digits-value">{card.digitsValue}</span>
              </div>
            </div>
            <footer className="ov-hero-bottomline">
              <span>{card.footLabel}</span>
              <span className="ov-hero-status">
                <span className="ov-hero-status-dot" aria-hidden />
                {card.live ? 'LIVE' : 'PAUSED'}
              </span>
            </footer>
          </div>
        </article>
      </div>
    </section>
  );
}
