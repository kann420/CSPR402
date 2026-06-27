// Scene 5 — payoff: the x402 card is delivered. Hero card front and
// center, a "Card delivered" pill, a Casper receipt stamp, and the
// closing line. Recreates the moment the SDK returns the mock card.
import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';
import { COLORS, FONT, EASE } from '../theme';
import { HeroCard } from '../HeroCard';
import { Pill } from '../components/Primitives';

const ease = EASE.out;
export const CARD_DURATION = 120;

export function CardScene() {
  const f = useCurrentFrame();
  const pillP = interpolate(f, [18, 34], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: ease,
  });
  const stampP = interpolate(f, [40, 58], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: ease,
  });
  const lineP = interpolate(f, [60, 80], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: ease,
  });

  return (
    <AbsoluteFill>
      {/* card */}
      <div style={{ position: 'absolute', inset: 0 }}>
        <HeroCard width={820} revealAt={-10} />
      </div>

      {/* delivered pill, top-center */}
      <div
        style={{
          position: 'absolute',
          top: 120,
          left: 0,
          right: 0,
          display: 'flex',
          justifyContent: 'center',
          opacity: pillP,
          transform: `translateY(${interpolate(pillP, [0, 1], [-12, 0])}px)`,
        }}
      >
        <Pill tone="green" pulse>
          Card delivered
        </Pill>
      </div>

      {/* Casper receipt stamp, bottom-left */}
      <div
        style={{
          position: 'absolute',
          left: 150,
          bottom: 150,
          opacity: stampP,
          transform: `scale(${interpolate(stampP, [0, 1], [0.7, 1])}) rotate(-4deg)`,
        }}
      >
        <div
          style={{
            border: `2px solid ${COLORS.greenBorder}`,
            borderRadius: 14,
            padding: '16px 22px',
            background: COLORS.greenMuted,
            fontFamily: FONT.mono,
            color: COLORS.green,
          }}
        >
          <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: '0.04em' }}>
            ✓ DEPLOY VERIFIED
          </div>
          <div style={{ fontSize: 12, color: COLORS.fgMuted, marginTop: 4, fontFamily: FONT.mono }}>
            casper-test · 7f3c…b2c
          </div>
        </div>
      </div>

      {/* closing line, bottom-center */}
      <div
        style={{
          position: 'absolute',
          bottom: 70,
          left: 0,
          right: 0,
          textAlign: 'center',
          opacity: lineP,
          fontFamily: FONT.display,
          fontSize: 30,
          fontWeight: 500,
          letterSpacing: '-0.02em',
          color: COLORS.fgMuted,
        }}
      >
        Pay on Casper. Verify on Casper. Get a card.
      </div>
    </AbsoluteFill>
  );
}
