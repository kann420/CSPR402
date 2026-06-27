// Scene 6 — close / CTA. CSPR402 wordmark, hero tagline, the two real
// landing CTAs (Open Dashboard / Read the quickstart), and the URL.
import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';
import { COLORS, FONT, EASE } from '../theme';
import { Eyebrow } from '../components/Primitives';
import { Logo } from '../Logo';
import { CtaButton } from '../components/Primitives';

const ease = EASE.out;
export const CLOSE_DURATION = 90;

export function CloseScene() {
  const f = useCurrentFrame();
  const logoP = interpolate(f, [0, 18], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: ease,
  });
  const titleP = interpolate(f, [8, 28], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: ease,
  });
  const ctaP = interpolate(f, [20, 40], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: ease,
  });
  const urlP = interpolate(f, [28, 46], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: ease,
  });

  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center' }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24 }}>
        <div
          style={{ opacity: logoP, transform: `scale(${interpolate(logoP, [0, 1], [0.9, 1])})` }}
        >
          <Logo height={58} color={COLORS.fg} />
        </div>
        <h1
          style={{
            margin: 0,
            fontFamily: FONT.display,
            fontSize: 64,
            fontWeight: 400,
            letterSpacing: '-0.025em',
            lineHeight: 1.0,
            color: COLORS.fg,
            textAlign: 'center',
            opacity: titleP,
            transform: `translateY(${interpolate(titleP, [0, 1], [20, 0])}px)`,
            filter: `blur(${interpolate(titleP, [0, 1], [6, 0])}px)`,
          }}
        >
          One Casper transfer.
          <br />
          One verified card.
        </h1>
        <div
          style={{
            display: 'flex',
            gap: 14,
            opacity: ctaP,
            transform: `translateY(${interpolate(ctaP, [0, 1], [16, 0])}px)`,
          }}
        >
          <CtaButton primary>Open Dashboard</CtaButton>
          <CtaButton>Read the quickstart</CtaButton>
        </div>
        <div style={{ opacity: urlP }}>
          <Eyebrow color={COLORS.brand}>cspr402.xyz · npm i cspr402</Eyebrow>
        </div>
      </div>
    </AbsoluteFill>
  );
}
