// CSPR402 brand lockup — the REAL project logo, matching the landing-page
// header (web/app/components/MarketingChrome.tsx): the neon 402 card-mark
// (web/public/logo-transparent.svg) + a vertical divider + "CSPR402" text
// in the brand display face (Fraunces 600).
//
// Why this and not repo-root logo.svg: logo.svg is inherited from the
// "Cards402" fork — its glyphs spell "Cards402" and its mark is a generic
// spiral. The actual CSPR402 brand mark (clean vector redraw of the neon
// payment-card enclosing "402": red 4, red 0, blue 2) lives in
// web/public/logo-transparent.svg, which is what the live header renders.
// We copy that SVG into video/public and load it via staticFile so the
// video's logo is pixel-identical to the site.

import type { CSSProperties } from 'react';
import { Img, staticFile } from 'remotion';
import { FONT } from './theme';

// logo-transparent.svg is 1036x604 (the Wordmark LOGO_ASPECT).
const MARK_ASPECT = 1036 / 604;

interface LogoProps {
  height?: number;
  /** Text color. The mark is full-color neon and is not tinted. */
  color?: string;
  style?: CSSProperties;
  className?: string;
}

// Full header lockup: [402 card-mark] | divider | "CSPR402". Height-driven;
// proportions mirror MarketingChrome (mark height 38, divider 20, text
// 1.05rem at mark-height 38).
export function Logo({ height = 34, color = '#f4f4f4', style }: LogoProps) {
  const gap = Math.round(height * 0.26);
  const dividerH = Math.round(height * 0.53);
  const textPx = Math.round(height * 0.44);
  return (
    <div
      style={{ display: 'inline-flex', alignItems: 'center', gap, ...style }}
      role="img"
      aria-label="CSPR402"
    >
      <LogoMark size={height} />
      <span
        aria-hidden
        style={{ width: 1, height: dividerH, background: 'rgba(255,255,255,0.16)', flexShrink: 0 }}
      />
      <span
        style={{
          fontFamily: FONT.display,
          fontWeight: 600,
          fontSize: textPx,
          letterSpacing: '-0.02em',
          lineHeight: 1,
          color,
          whiteSpace: 'nowrap',
        }}
      >
        CSPR402
      </span>
    </div>
  );
}

// Neon 402 card-mark only. width = height * MARK_ASPECT.
export function LogoMark({
  size = 40,
  style,
}: {
  size?: number;
  color?: string;
  style?: CSSProperties;
}) {
  const w = Math.round(size * MARK_ASPECT);
  return (
    <Img
      src={staticFile('logo-transparent.svg')}
      width={w}
      height={size}
      style={{ display: 'block', objectFit: 'contain', ...style }}
      role="img"
      aria-label="CSPR402 mark"
    />
  );
}
