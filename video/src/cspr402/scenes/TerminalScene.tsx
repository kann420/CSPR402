// Scene 3 — real CLI demo: `cspr402 purchase --amount 10` typed out,
// then a Casper receipt/verify card slides in. Recreates the documented
// onboard→purchase flow from the repo README + the SDK CLI.
import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';
import { COLORS, FONT, EASE } from '../theme';
import { Eyebrow } from '../components/Primitives';
import { Terminal, type TermLine } from '../components/Terminal';

const ease = EASE.out;
export const TERMINAL_DURATION = 180;

const LINES: TermLine[] = [
  { text: 'cspr402 purchase --amount 10', kind: 'cmd' },
  { text: 'Creating order on Casper testnet…', tone: 'dim' },
  { text: 'Payment instruction:', tone: 'normal' },
  { text: '  recipient   0203…a91f', tone: 'dim' },
  { text: '  2.5 CSPR (2_500_000_000 motes)', tone: 'dim' },
  { text: '  transfer_id  42', tone: 'dim' },
  { text: 'Submitting native transfer on Casper…', tone: 'dim' },
  { text: 'Deploy 7f3c…b2c accepted (casper-test)', tone: 'blue', kind: 'check' },
  { text: 'Verified recipient · amount · transfer_id', tone: 'blue', kind: 'check' },
  { text: 'Card delivered — **** 4242 · 12/29', tone: 'green', kind: 'check' },
];

export function TerminalScene() {
  const f = useCurrentFrame();
  const receiptP = interpolate(f, [128, 150], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: ease,
  });
  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center' }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 26 }}>
        <Eyebrow>
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: COLORS.green,
              boxShadow: `0 0 12px ${COLORS.green}`,
            }}
          />
          Live demo · cspr402 CLI
        </Eyebrow>
        <div style={{ position: 'relative' }}>
          <Terminal
            width={1080}
            height={560}
            title="cspr402 — purchase"
            lines={LINES}
            startFrame={6}
            charsPerFrame={2.0}
            gap={4}
          />
          {/* Casper receipt card */}
          <div
            style={{
              position: 'absolute',
              right: -56,
              top: 90,
              width: 300,
              opacity: receiptP,
              transform: `translateX(${interpolate(receiptP, [0, 1], [40, 0])}px)`,
            }}
          >
            <div
              style={{
                background: COLORS.surface,
                border: `1px solid ${COLORS.greenBorder}`,
                borderRadius: 14,
                padding: 20,
                boxShadow: `0 0 30px -10px ${COLORS.greenGlow}`,
              }}
            >
              <div
                style={{
                  fontFamily: FONT.mono,
                  fontSize: 11,
                  color: COLORS.green,
                  letterSpacing: '0.12em',
                  textTransform: 'uppercase',
                  marginBottom: 12,
                }}
              >
                ✓ Deploy verified
              </div>
              <Row label="chain" value="casper-test" />
              <Row label="recipient" value="0203…a91f" />
              <Row label="amount" value="2.5 CSPR" />
              <Row label="transfer_id" value="42" />
              <div style={{ height: 1, background: COLORS.border, margin: '12px 0' }} />
              <Row label="status" value="delivered" valColor={COLORS.green} />
            </div>
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
}

function Row({
  label,
  value,
  valColor = COLORS.fg,
}: {
  label: string;
  value: string;
  valColor?: string;
}) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        fontFamily: FONT.mono,
        fontSize: 13,
        marginBottom: 6,
      }}
    >
      <span style={{ color: COLORS.fgDim }}>{label}</span>
      <span style={{ color: valColor }}>{value}</span>
    </div>
  );
}
