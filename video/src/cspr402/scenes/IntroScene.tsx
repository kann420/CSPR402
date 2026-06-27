// Scene 1 — cold open: CSPR402 logo + eyebrow + hero tagline, then the
// x402 hero card reveals underneath. Mirrors the landing hero.
import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';
import { COLORS, FONT, EASE } from '../theme';
import { Eyebrow, PulseDot } from '../components/Primitives';
import { Logo } from '../Logo';
import { HeroCard } from '../HeroCard';

const ease = EASE.out;

export const INTRO_DURATION = 150;

export function IntroScene() {
  const f = useCurrentFrame();
  const logoP = interpolate(f, [4, 28], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: ease,
  });
  const eyebrowP = interpolate(f, [12, 30], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: ease,
  });
  const titleP = interpolate(f, [20, 44], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: ease,
  });

  return (
    <AbsoluteFill>
      {/* upper region: logo + eyebrow + tagline */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: 600,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 18,
        }}
      >
        <div
          style={{ opacity: logoP, transform: `scale(${interpolate(logoP, [0, 1], [0.92, 1])})` }}
        >
          <Logo height={52} color={COLORS.fg} />
        </div>
        <div style={{ opacity: eyebrowP }}>
          <Eyebrow>
            <PulseDot />
            Casper testnet · verified card payments
          </Eyebrow>
        </div>
        <h1
          style={{
            margin: 0,
            fontFamily: FONT.display,
            fontSize: 80,
            fontWeight: 400,
            letterSpacing: '-0.025em',
            lineHeight: 1.0,
            color: COLORS.fg,
            textAlign: 'center',
            opacity: titleP,
            transform: `translateY(${interpolate(titleP, [0, 1], [22, 0])}px)`,
            filter: `blur(${interpolate(titleP, [0, 1], [8, 0])}px)`,
          }}
        >
          One Casper transfer.
          <br />
          One verified card.
        </h1>
      </div>

      {/* lower region: hero card reveal */}
      <div style={{ position: 'absolute', top: 600, left: 0, right: 0, bottom: 0 }}>
        <HeroCard width={760} revealAt={Math.round(40)} />
      </div>
    </AbsoluteFill>
  );
}
