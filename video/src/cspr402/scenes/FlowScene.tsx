// Scene 2 — "How it works" 4-step flow rendered inside the real
// cspr402.xyz browser chrome. Steps, copy and visual treatment mirror
// the landing page's home-hero / steps section.
import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';
import { COLORS, FONT, EASE } from '../theme';
import { Eyebrow } from '../components/Primitives';
import { BrowserFrame } from '../components/BrowserFrame';
import { rise } from './SceneWrap';

const ease = EASE.out;

export const FLOW_DURATION = 165;

const STEPS = [
  {
    num: '01',
    title: 'Create order',
    body: 'The API returns a Casper payment instruction — recipient, exact motes, transfer_id and expiration — for the amount your agent needs.',
  },
  {
    num: '02',
    title: 'Send CSPR',
    body: 'Your agent submits one native transfer on Casper. No hardcoded RPC, no shared secrets, no custodial wallet in the middle.',
  },
  {
    num: '03',
    title: 'Verify deploy',
    body: 'The backend verifies recipient, amount, transfer_id, execution success and idempotency straight from the deploy before anything ships.',
  },
  {
    num: '04',
    title: 'Card delivered',
    body: 'Order is fulfilled and the API returns a ready-to-use virtual card number plus the Casper receipt that paid for it.',
  },
];

export function FlowScene() {
  const f = useCurrentFrame();
  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center' }}>
      <BrowserFrame url="cspr402.xyz" width={1620} height={900}>
        <div
          style={{ height: '100%', padding: '40px 44px', display: 'flex', flexDirection: 'column' }}
        >
          <div style={rise(f, 4, 20, 24, 8)}>
            <Eyebrow color={COLORS.brand}>How it works</Eyebrow>
            <h2
              style={{
                margin: '14px 0 0',
                fontFamily: FONT.display,
                fontSize: 50,
                fontWeight: 500,
                letterSpacing: '-0.03em',
                lineHeight: 1.02,
                color: COLORS.fg,
              }}
            >
              Pay on Casper. Verify on Casper. Get a card.
            </h2>
          </div>

          <div style={{ display: 'flex', gap: 18, marginTop: 38, flex: 1, alignItems: 'stretch' }}>
            {STEPS.map((s, i) => {
              const p = interpolate(f, [18 + i * 9, 34 + i * 9], [0, 1], {
                extrapolateLeft: 'clamp',
                extrapolateRight: 'clamp',
                easing: ease,
              });
              return (
                <div
                  key={s.num}
                  style={{
                    position: 'relative',
                    flex: 1,
                    opacity: p,
                    transform: `translateY(${interpolate(p, [0, 1], [26, 0])}px)`,
                  }}
                >
                  <div
                    style={{
                      height: '100%',
                      background: COLORS.surface,
                      border: `1px solid ${COLORS.border}`,
                      borderRadius: 16,
                      padding: '24px 22px',
                      display: 'flex',
                      flexDirection: 'column',
                    }}
                  >
                    <div
                      style={{
                        fontFamily: FONT.mono,
                        fontSize: 14,
                        color: COLORS.brand,
                        letterSpacing: '0.12em',
                        marginBottom: 14,
                      }}
                    >
                      {s.num}
                    </div>
                    <h3
                      style={{
                        margin: '0 0 12px',
                        fontFamily: FONT.display,
                        fontSize: 24,
                        fontWeight: 500,
                        letterSpacing: '-0.02em',
                        color: COLORS.fg,
                      }}
                    >
                      {s.title}
                    </h3>
                    <p
                      style={{
                        margin: 0,
                        fontFamily: FONT.body,
                        fontSize: 15,
                        lineHeight: 1.55,
                        color: COLORS.fgMuted,
                      }}
                    >
                      {s.body}
                    </p>
                  </div>
                  {/* connector arrow */}
                  {i < STEPS.length - 1 && (
                    <div
                      style={{
                        position: 'absolute',
                        right: -14,
                        top: '50%',
                        width: 18,
                        height: 2,
                        background: COLORS.brandBorder,
                      }}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </BrowserFrame>
    </AbsoluteFill>
  );
}
