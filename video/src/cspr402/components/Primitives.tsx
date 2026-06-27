// Small reusable primitives mirroring CSPR402's real UI atoms:
// dot-grid backdrop, red ambient glow, eyebrow label, status pill,
// CTA buttons, divider. Colours/fonts from theme.ts (globals.css).

import type { CSSProperties, ReactNode } from 'react';
import { AbsoluteFill } from 'remotion';
import { COLORS, FONT } from '../theme';

export function DotGrid({ opacity = 1, size = 28 }: { opacity?: number; size?: number }) {
  return (
    <AbsoluteFill
      style={{
        opacity,
        backgroundImage: `radial-gradient(circle, rgba(255,255,255,0.06) 1px, transparent 1px)`,
        backgroundSize: `${size}px ${size}px`,
      }}
    />
  );
}

export function RedAmbient({
  x = '50%',
  y = '40%',
  r = '50% 40%',
  opacity = 0.4,
}: {
  x?: string;
  y?: string;
  r?: string;
  opacity?: number;
}) {
  return (
    <AbsoluteFill
      style={{
        pointerEvents: 'none',
        background: `radial-gradient(ellipse ${r} at ${x} ${y}, ${COLORS.brandGlow}, transparent 70%)`,
        opacity,
        filter: 'blur(40px)',
      }}
    />
  );
}

export function Eyebrow({
  children,
  color = COLORS.green,
  style,
}: {
  children: ReactNode;
  color?: string;
  style?: CSSProperties;
}) {
  return (
    <div
      style={{
        fontFamily: FONT.mono,
        fontSize: 13,
        fontWeight: 500,
        letterSpacing: '0.14em',
        textTransform: 'uppercase',
        color,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 10,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export function PulseDot({ color = COLORS.green, size = 6 }: { color?: string; size?: number }) {
  return (
    <span
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: color,
        boxShadow: `0 0 12px ${color}`,
      }}
    />
  );
}

export function Pill({
  children,
  tone = 'green',
  pulse = false,
  style,
}: {
  children: ReactNode;
  tone?: 'green' | 'yellow' | 'blue' | 'purple' | 'red' | 'dim' | 'brand';
  pulse?: boolean;
  style?: CSSProperties;
}) {
  const map: Record<string, { c: string; b: string; bd: string }> = {
    green: { c: COLORS.green, b: COLORS.greenMuted, bd: COLORS.greenBorder },
    yellow: { c: COLORS.yellow, b: COLORS.yellowMuted, bd: COLORS.yellowBorder },
    blue: { c: COLORS.blue, b: COLORS.blueMuted, bd: COLORS.blueBorder },
    purple: { c: COLORS.purple, b: COLORS.purpleMuted, bd: COLORS.purpleBorder },
    red: { c: COLORS.red, b: COLORS.redMuted, bd: COLORS.redBorder },
    brand: { c: COLORS.brand, b: COLORS.brandMuted, bd: COLORS.brandBorder },
    dim: { c: COLORS.fgDim, b: COLORS.surface, bd: COLORS.borderStrong },
  };
  const t = map[tone]!;
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        fontFamily: FONT.mono,
        fontSize: 11,
        fontWeight: 500,
        letterSpacing: '0.04em',
        color: t.c,
        background: t.b,
        border: `1px solid ${t.bd}`,
        borderRadius: 999,
        padding: '2px 9px',
        whiteSpace: 'nowrap',
        ...style,
      }}
    >
      {pulse && <PulseDot color={t.c} size={6} />}
      {children}
    </span>
  );
}

export function CtaButton({
  children,
  primary = false,
  style,
}: {
  children: ReactNode;
  primary?: boolean;
  style?: CSSProperties;
}) {
  // Mirrors the landing's home-cta: solid brand pill (primary) or bordered ghost.
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        fontFamily: FONT.body,
        fontSize: 17,
        fontWeight: 600,
        padding: '12px 22px',
        borderRadius: 999,
        ...(primary
          ? {
              background: COLORS.brand,
              color: '#0a0a0a',
              boxShadow: `0 8px 30px -8px ${COLORS.brandGlow}`,
            }
          : {
              background: 'transparent',
              color: COLORS.fg,
              border: `1px solid ${COLORS.borderStrong}`,
            }),
        ...style,
      }}
    >
      {children}
    </span>
  );
}

export function Card({
  children,
  style,
  padding = 28,
}: {
  children: ReactNode;
  style?: CSSProperties;
  padding?: number;
}) {
  return (
    <div
      style={{
        background: COLORS.surface,
        border: `1px solid ${COLORS.border}`,
        borderRadius: 14,
        padding,
        boxShadow: COLORS ? '0 1px 2px rgba(0,0,0,0.5)' : undefined,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

// Fractional wordmark used in close scene, fixed-aspect logo badge.
export function Badge({
  children,
  color = COLORS.fgDim,
  border = COLORS.border,
}: {
  children: ReactNode;
  color?: string;
  border?: string;
}) {
  return (
    <span
      style={{
        fontSize: 10,
        color,
        padding: '2px 7px',
        border: `1px solid ${border}`,
        borderRadius: 3,
        textTransform: 'uppercase',
        letterSpacing: '0.08em',
        fontFamily: FONT.mono,
      }}
    >
      {children}
    </span>
  );
}
