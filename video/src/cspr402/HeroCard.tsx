// x402 hero card — frame-driven recreation of web/app/components/HeroCard.tsx.
// Verbatim copy: x402 wordmark (Fraunces), Casper net dot (brand red), gold EMV
// chip, Available $420.69, Card Number 6969 4200 6969 4242, AI AGENT, VISA·12/29.
// The real card tilts on pointer parallax; here the reveal/sheen/idle-drift are
// driven by useCurrentFrame so the same visual reads on video.

import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';
import { COLORS, FONT, EASE } from './theme';

export interface HeroCardProps {
  width?: number;
  balance?: string;
  number?: string;
  foot?: string;
  expiry?: string;
  revealAt?: number; // local frame to start the reveal
}

const ease = EASE.out;

export const HeroCard: React.FC<HeroCardProps> = ({
  width = 760,
  balance = '$420.69',
  number = '6969 4200 6969 4242',
  foot = 'AI AGENT',
  expiry = 'VISA · 12/29',
  revealAt = 0,
}) => {
  const frame = useCurrentFrame();
  const f = frame - revealAt;
  const H = width / 1.586;
  const s = width / 544; // scale factor vs the real ~544px card

  // One-shot entrance: lift + scale + blur.
  const enter = interpolate(f, [0, 42], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: ease,
  });
  const yShift = interpolate(enter, [0, 1], [32 * s, 0]);
  const enterScale = interpolate(enter, [0, 1], [0.92, 1]);
  const enterOpacity = enter;
  const blur = interpolate(enter, [0, 1], [8, 0]);

  // Outline draw (stroke dashoffset 1 -> 0).
  const outline = interpolate(f, [3, 33], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: ease,
  });
  // Outline dims after drawing.
  const outlineOpacity = interpolate(f, [33, 50], [1, 0.18], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // Holographic shell wipe up (clip inset 100% -> 0%).
  const shell = interpolate(f, [20, 53], [100, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: ease,
  });

  // Aura pulse.
  const aura = interpolate(f, [9, 30, 46], [0, 0.95, 0.45], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // Content lifts in (blurred -> sharp) once shell arrives.
  const content = interpolate(f, [33, 57], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: ease,
  });
  const contentY = interpolate(content, [0, 1], [16 * s, 0]);
  const contentBlur = interpolate(content, [0, 1], [10, 0]);

  // Continuous idle drift (breath) + looping sheen sweep once revealed.
  const idle = Math.sin((f - 57) * 0.12) * 2.2;
  const idleY = Math.cos((f - 57) * 0.1) * 1.4;
  const tiltY = idle * 0.55; // deg
  const tiltX = -idleY * 0.7;

  // Sheen: one-shot skewed light band sweeping left->right during reveal.
  // The real marketing card's sheen is a static reveal (gated by load
  // progress), not a perpetual loop — so we sweep once and settle.
  const SHEEN_START = 57;
  const SHEEN_DUR = 48;
  const sheenX = interpolate(f, [SHEEN_START, SHEEN_START + SHEEN_DUR], [-160, 360], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: ease,
  });
  const sheenOp = interpolate(
    f,
    [SHEEN_START, SHEEN_START + 8, SHEEN_START + SHEEN_DUR - 12, SHEEN_START + SHEEN_DUR],
    [0, 0.85, 0.85, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  );

  const radius = 1.7 * 16 * s;

  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', perspective: 1800 }}>
      {/* aura */}
      <div
        style={{
          position: 'absolute',
          width: width * 1.18,
          height: H * 1.5,
          borderRadius: '50%',
          background: `radial-gradient(circle at 50% 50%, rgba(255,42,35,0.18), transparent 54%)`,
          opacity: aura * 0.7,
          filter: 'blur(18px)',
        }}
      />
      {/* shadow puddle */}
      <div
        style={{
          position: 'absolute',
          width: width * 0.8,
          height: 28 * s,
          marginTop: H * 0.52,
          borderRadius: '50%',
          background: `radial-gradient(ellipse at center, rgba(255,42,35,0.28), rgba(255,42,35,0.08) 48%, transparent 72%)`,
          opacity: enterOpacity * 0.85,
        }}
      />

      <div
        style={{
          position: 'relative',
          width,
          height: H,
          transformStyle: 'preserve-3d',
          transform: `translateY(${yShift}px) scale(${enterScale})`,
          opacity: enterOpacity,
          filter: `blur(${blur}px)`,
        }}
      >
        <article
          style={{
            position: 'relative',
            width,
            height: H,
            borderRadius: radius,
            overflow: 'hidden',
            transform: `rotateX(${tiltX}deg) rotateY(${tiltY}deg)`,
            willChange: 'transform',
            color: '#f5f1e8',
            fontFamily: FONT.body,
            background: `
              linear-gradient(135deg, rgba(255,255,255,0.14), rgba(255,255,255,0.02) 35%, rgba(255,255,255,0.08)),
              linear-gradient(160deg, rgba(255,42,35,0.18), rgba(225,26,20,0.08) 42%, rgba(120,8,5,0.18) 78%, rgba(255,42,35,0.10)),
              ${COLORS.cardBase}`,
            border: `1px solid rgba(255,255,255,0.16)`,
            boxShadow: `0 2rem 4rem rgba(0,0,0,0.65), 0 0 0 1px rgba(255,255,255,0.04) inset, 0 0 4rem rgba(255,42,35,0.16)`,
          }}
        >
          {/* holographic shell wipe */}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              clipPath: `inset(${shell}% 0 0 0 round ${radius}px)`,
              background: `
                linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0.015)),
                linear-gradient(145deg, rgba(255,42,35,0.20), rgba(225,26,20,0.10) 44%, rgba(120,8,5,0.20) 78%, rgba(255,42,35,0.12))`,
            }}
          />
          {/* grid texture */}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              backgroundImage: `
                repeating-linear-gradient(90deg, rgba(255,255,255,0.04) 0 1px, transparent 1px ${34 * s}px),
                repeating-linear-gradient(0deg, rgba(255,255,255,0.03) 0 1px, transparent 1px ${34 * s}px)`,
              maskImage: 'linear-gradient(180deg, transparent, black 18%, black 82%, transparent)',
              WebkitMaskImage:
                'linear-gradient(180deg, transparent, black 18%, black 82%, transparent)',
              opacity: 0.35 * enterOpacity,
            }}
          />
          {/* outline draw (SVG rect, stroke-dashoffset) */}
          <svg
            viewBox="0 0 600 378"
            preserveAspectRatio="none"
            style={{ position: 'absolute', inset: 0, width, height: H, pointerEvents: 'none' }}
          >
            <rect
              x="1.5"
              y="1.5"
              width="597"
              height="375"
              rx="28"
              ry="28"
              fill="none"
              stroke="rgba(255,245,225,0.95)"
              strokeWidth={1.35}
              strokeLinecap="round"
              strokeDasharray={2200}
              strokeDashoffset={outline * 2200}
              opacity={outlineOpacity}
              style={{
                filter:
                  'drop-shadow(0 0 8px rgba(255,255,255,0.20)) drop-shadow(0 0 18px rgba(255,42,35,0.22))',
              }}
            />
          </svg>

          {/* orbs */}
          <div
            style={{
              position: 'absolute',
              width: 74 * s,
              height: 74 * s,
              right: -16 * s,
              bottom: 64 * s,
              borderRadius: '50%',
              background:
                'radial-gradient(circle at 35% 35%, rgba(255,255,255,0.8), rgba(255,42,35,0.10) 38%, transparent 68%)',
              opacity: 0.95 * enterOpacity,
            }}
          />
          <div
            style={{
              position: 'absolute',
              width: 46 * s,
              height: 46 * s,
              left: -16 * s,
              top: 96 * s,
              borderRadius: '50%',
              background:
                'radial-gradient(circle at 40% 40%, rgba(255,255,255,0.75), rgba(255,42,35,0.14) 34%, transparent 70%)',
              opacity: 0.75 * enterOpacity,
            }}
          />
          {/* concentric decorative rings (top-right) */}
          <div
            style={{
              position: 'absolute',
              top: '18%',
              right: '-24%',
              width: 9 * 16 * s,
              height: 9 * 16 * s,
              borderRadius: '50%',
              border: '1px solid rgba(255,255,255,0.12)',
              opacity: 0.6 * enterOpacity,
            }}
          >
            <div
              style={{
                position: 'absolute',
                inset: 1.4 * 16 * s,
                borderRadius: '50%',
                border: '1px solid rgba(255,42,35,0.22)',
              }}
            />
          </div>

          {/* sheen sweep */}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              overflow: 'hidden',
              borderRadius: radius,
              pointerEvents: 'none',
              opacity: sheenOp,
            }}
          >
            <div
              style={{
                position: 'absolute',
                top: 0,
                bottom: 0,
                left: `${sheenX}%`,
                width: '50%',
                transform: 'skewX(-12deg)',
                background:
                  'linear-gradient(115deg, transparent 20%, rgba(255,255,255,0.18) 45%, transparent 58%)',
              }}
            />
          </div>

          {/* content */}
          <div
            style={{
              position: 'relative',
              zIndex: 2,
              height: '100%',
              display: 'grid',
              gridTemplateRows: 'auto 1fr auto',
              padding: `${1.3 * 16 * s}px ${1.6 * 16 * s}px`,
              opacity: content,
              transform: `translateY(${contentY}px)`,
              filter: `blur(${contentBlur}px)`,
            }}
          >
            {/* topline */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                letterSpacing: `${0.16 * 16}px`,
                textTransform: 'uppercase',
                fontSize: 0.64 * 16 * s,
                color: COLORS.inkMuted,
              }}
            >
              <span
                style={{
                  fontFamily: FONT.display,
                  fontSize: 1.5 * 16 * s,
                  fontWeight: 600,
                  letterSpacing: '-0.04em',
                  lineHeight: 1,
                  color: COLORS.ink,
                  textTransform: 'none',
                  textShadow: `0 0 14px rgba(255,42,35,0.45), 0 0 28px rgba(255,42,35,0.22)`,
                  fontVariationSettings: '"opsz" 144, "SOFT" 30',
                }}
              >
                x402
              </span>
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 0.4 * 16 * s,
                  whiteSpace: 'nowrap',
                }}
              >
                <span
                  style={{
                    width: 0.4 * 16 * s,
                    height: 0.4 * 16 * s,
                    borderRadius: '50%',
                    background: COLORS.brand,
                    boxShadow: '0 0 8px rgba(255,42,35,0.7)',
                  }}
                />
                Casper
              </span>
            </div>

            {/* middle */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'auto 1fr',
                alignItems: 'center',
                gap: 1.6 * 16 * s,
              }}
            >
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'auto auto',
                  alignItems: 'center',
                  gap: 1 * 16 * s,
                }}
              >
                {/* chip */}
                <div
                  style={{
                    position: 'relative',
                    width: 3.1 * 16 * s,
                    height: 2.35 * 16 * s,
                    borderRadius: 0.7 * 16 * s,
                    background: `linear-gradient(135deg, rgba(255,245,210,0.95), rgba(255,207,110,0.45)), linear-gradient(90deg, rgba(0,0,0,0.2), transparent)`,
                    boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.08)',
                  }}
                >
                  <div
                    style={{
                      position: 'absolute',
                      inset: 0.35 * 16 * s,
                      border: '1px solid rgba(90,60,0,0.18)',
                      borderRadius: 0.45 * 16 * s,
                    }}
                  />
                  <div
                    style={{
                      position: 'absolute',
                      left: 0.35 * 16 * s,
                      right: 0.35 * 16 * s,
                      bottom: 0.9 * 16 * s,
                      height: 1,
                      background: 'rgba(90,60,0,0.18)',
                    }}
                  />
                </div>
                {/* balance */}
                <div>
                  <div
                    style={{
                      fontSize: 0.62 * 16 * s,
                      letterSpacing: `${0.14 * 16}px`,
                      textTransform: 'uppercase',
                      color: COLORS.inkMuted,
                      marginBottom: 0.5 * 16 * s,
                    }}
                  >
                    Available
                  </div>
                  <div
                    style={{
                      fontFamily: FONT.display,
                      fontSize: 2.3 * 16 * s,
                      fontWeight: 700,
                      letterSpacing: '-0.04em',
                      color: COLORS.ink,
                      textShadow: `0 0 2rem rgba(255,42,35,0.28)`,
                      fontVariationSettings: '"opsz" 144, "SOFT" 20',
                    }}
                  >
                    {balance}
                  </div>
                </div>
              </div>
              {/* digits */}
              <div
                style={{
                  display: 'grid',
                  gap: 0.25 * 16 * s,
                  justifyContent: 'end',
                  textAlign: 'right',
                  fontFamily: FONT.mono,
                  color: 'rgba(255,249,235,0.95)',
                }}
              >
                <div
                  style={{
                    fontSize: 0.6 * 16 * s,
                    textTransform: 'uppercase',
                    letterSpacing: `${0.16 * 16}px`,
                    color: COLORS.inkDim,
                  }}
                >
                  Card Number
                </div>
                <div style={{ fontSize: 0.9 * 16 * s, letterSpacing: `${0.2 * 16}px` }}>
                  {number}
                </div>
              </div>
            </div>

            {/* bottomline */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                letterSpacing: `${0.16 * 16}px`,
                textTransform: 'uppercase',
                fontSize: 0.64 * 16 * s,
                color: COLORS.inkMuted,
              }}
            >
              <div>{foot}</div>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 0.45 * 16 * s }}>
                {expiry}
              </div>
            </div>
          </div>
        </article>
      </div>
    </AbsoluteFill>
  );
};
