// CSPR402 Remotion theme — transcribed verbatim from web/app/globals.css.
// Dark, red-black. Green is reserved for LIVE / SUCCESS status only
// (matching the real app's rule: decorative accents = brand red).

import { Easing } from 'remotion';

export const COLORS = {
  // canvas + ink
  bg: '#050505',
  bgElev: '#0c0c0c',
  bgElev2: '#111111',
  fg: '#f4f4f4',
  fgMuted: 'rgba(255,255,255,0.66)',
  fgDim: 'rgba(255,255,255,0.44)',
  muted: 'rgba(255,255,255,0.44)',

  // surfaces
  surface: '#0c0c0c',
  surface2: '#141414',
  surface3: '#1a1a1a',
  surfaceHover: 'rgba(255,255,255,0.04)',
  border: 'rgba(255,255,255,0.08)',
  borderStrong: 'rgba(255,255,255,0.16)',
  borderHairline: 'rgba(255,255,255,0.05)',

  // success / live green (status only)
  green: '#7cffb2',
  greenDim: '#4fd894',
  greenMuted: 'rgba(124,255,178,0.10)',
  greenBorder: 'rgba(124,255,178,0.26)',
  greenGlow: 'rgba(124,255,178,0.35)',

  // brand red (marketing + decorative accent)
  brand: '#ff2a23',
  brandDim: '#e11a14',
  brandMuted: 'rgba(255,42,35,0.12)',
  brandBorder: 'rgba(255,42,35,0.30)',
  brandGlow: 'rgba(255,42,35,0.40)',

  // status hues
  red: '#ff7a7a',
  redMuted: 'rgba(255,122,122,0.12)',
  redBorder: 'rgba(255,122,122,0.26)',
  yellow: '#ffd166',
  yellowMuted: 'rgba(255,209,102,0.12)',
  yellowBorder: 'rgba(255,209,102,0.26)',
  blue: '#8ab4ff',
  blueMuted: 'rgba(138,180,255,0.12)',
  blueBorder: 'rgba(138,180,255,0.26)',
  purple: '#c8a8ff',
  purpleMuted: 'rgba(200,168,255,0.12)',
  purpleBorder: 'rgba(200,168,255,0.26)',

  // card ink (cream — the hero card face text)
  ink: '#fff8ec',
  inkMuted: 'rgba(255,245,225,0.65)',
  inkDim: 'rgba(255,245,225,0.60)',
  cardBase: '#0a0a0a',
} as const;

export const FONT = {
  // Family names loaded via @remotion/google-fonts (see fonts.ts).
  // Fallbacks mirror web/app/globals.css verbatim.
  display: "'Fraunces','IBM Plex Serif',Georgia,'Times New Roman',serif",
  body: "'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif",
  mono: "'JetBrains Mono',ui-monospace,monospace",
} as const;

// Easing curves from globals.css (--ease-*), expressed as EasingFunctions
// (Remotion's interpolate() takes a function, not a bezier tuple).
export const EASE = {
  out: Easing.bezier(0.16, 1, 0.3, 1),
  inOut: Easing.bezier(0.77, 0, 0.18, 1),
  spring: Easing.bezier(0.34, 1.56, 0.64, 1),
};

// Video format.
export const VIEWPORT = { width: 1920, height: 1080, fps: 30 } as const;
export const DURATION_FRAMES = 900; // 30s @ 30fps

// Status-pill tone mapping — lifted from .status-* rules in globals.css.
// tone -> { color, bg, border }.
type Tone = 'green' | 'yellow' | 'blue' | 'purple' | 'red' | 'dim';

const TONES: Record<Tone, { color: string; bg: string; border: string }> = {
  green: { color: COLORS.green, bg: COLORS.greenMuted, border: COLORS.greenBorder },
  yellow: { color: COLORS.yellow, bg: COLORS.yellowMuted, border: COLORS.yellowBorder },
  blue: { color: COLORS.blue, bg: COLORS.blueMuted, border: COLORS.blueBorder },
  purple: { color: COLORS.purple, bg: COLORS.purpleMuted, border: COLORS.purpleBorder },
  red: { color: COLORS.red, bg: COLORS.redMuted, border: COLORS.redBorder },
  dim: { color: COLORS.fgDim, bg: COLORS.surface, border: COLORS.borderStrong },
};

// Public OrderPhase values (what integrators see) — from .status-* rules.
export const ORDER_STATUS: Record<string, { label: string; tone: Tone }> = {
  awaiting_approval: { label: 'Awaiting approval', tone: 'purple' },
  awaiting_payment: { label: 'Awaiting payment', tone: 'yellow' },
  pending_payment: { label: 'Pending payment', tone: 'yellow' },
  processing: { label: 'Processing', tone: 'blue' },
  payment_confirmed: { label: 'Payment confirmed', tone: 'blue' },
  ordering: { label: 'Ordering', tone: 'purple' },
  claim_received: { label: 'Claim received', tone: 'purple' },
  delivered: { label: 'Delivered', tone: 'green' },
  ready: { label: 'Ready', tone: 'green' },
  refunded: { label: 'Refunded', tone: 'yellow' },
  refund_pending: { label: 'Refund pending', tone: 'yellow' },
  failed: { label: 'Failed', tone: 'red' },
  rejected: { label: 'Rejected', tone: 'red' },
  expired: { label: 'Expired', tone: 'dim' },
};

export function tone(t: Tone) {
  return TONES[t];
}
