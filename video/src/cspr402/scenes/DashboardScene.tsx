// Scene 4 — operator dashboard digital twin inside cspr402.xyz/dashboard/overview.
// Sidebar nav, OverviewHero summary card, KPI row, spend chart + recent activity
// table — all recreated from the real dashboard components.
import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';
import { COLORS, FONT, EASE } from '../theme';
import { Eyebrow, PulseDot } from '../components/Primitives';
import { BrowserFrame } from '../components/BrowserFrame';
import {
  DashSidebar,
  OverviewHeroCard,
  KpiTile,
  OrderTable,
  SpendChart,
  Card2,
  type OrderRow,
} from '../components/Dashboard';

const ease = EASE.out;
export const DASHBOARD_DURATION = 195;

const ROWS: OrderRow[] = [
  { agent: 'agent-ttl-08c', amount: '$3.20', rail: 'mockUSDC', status: 'delivered', when: '2m' },
  { agent: 'agent-grader', amount: '$0.50', rail: 'CSPR', status: 'processing', when: '5m' },
  { agent: 'agent-feed', amount: '$1.10', rail: 'mockUSDC', status: 'delivered', when: '11m' },
  { agent: 'agent-fetch', amount: '$0.03', rail: 'CSPR', status: 'awaiting_payment', when: '18m' },
];

export function DashboardScene() {
  const f = useCurrentFrame();
  const heroP = interpolate(f, [6, 26], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: ease,
  });

  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center' }}>
      <BrowserFrame url="cspr402.xyz/dashboard/overview" width={1660} height={940}>
        <div style={{ height: '100%', display: 'flex' }}>
          <DashSidebar width={220} />
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
            {/* header */}
            <div
              style={{
                height: 54,
                borderBottom: `1px solid ${COLORS.border}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0 22px',
                flexShrink: 0,
              }}
            >
              <div style={{ fontFamily: FONT.mono, fontSize: 13, color: COLORS.fgDim }}>
                overview
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div
                  style={{
                    height: 30,
                    width: 240,
                    borderRadius: 7,
                    background: COLORS.surface,
                    border: `1px solid ${COLORS.border}`,
                    display: 'flex',
                    alignItems: 'center',
                    padding: '0 12px',
                    color: COLORS.fgDim,
                    fontFamily: FONT.mono,
                    fontSize: 12,
                  }}
                >
                  ⌘K Search…
                </div>
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    fontFamily: FONT.mono,
                    fontSize: 11,
                    color: COLORS.green,
                    background: COLORS.greenMuted,
                    border: `1px solid ${COLORS.greenBorder}`,
                    borderRadius: 999,
                    padding: '4px 10px',
                  }}
                >
                  <PulseDot size={6} /> Live
                </span>
                <span
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: '50%',
                    background: COLORS.surface2,
                    border: `1px solid ${COLORS.border}`,
                  }}
                />
              </div>
            </div>
            {/* content */}
            <div style={{ flex: 1, padding: 26, overflow: 'hidden' }}>
              {/* overview hero band */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: 22,
                  opacity: heroP,
                  transform: `translateY(${interpolate(heroP, [0, 1], [14, 0])}px)`,
                }}
              >
                <div>
                  <Eyebrow>
                    <PulseDot />
                    Casper testnet · live
                  </Eyebrow>
                  <h1
                    style={{
                      margin: '10px 0 0',
                      fontFamily: FONT.display,
                      fontSize: 42,
                      fontWeight: 500,
                      letterSpacing: '-0.025em',
                      color: COLORS.fg,
                    }}
                  >
                    Overview
                  </h1>
                  <p
                    style={{
                      margin: '8px 0 0',
                      fontFamily: FONT.body,
                      fontSize: 14,
                      color: COLORS.fgMuted,
                    }}
                  >
                    Dashboard · created 3d ago
                  </p>
                </div>
                <OverviewHeroCard balance="$1,420.00" digits="3" />
              </div>

              {/* KPI row */}
              <div style={{ display: 'flex', gap: 14, marginBottom: 18 }}>
                <KpiTile index={0} label="Spend 24h" value="$312.10" hint="4 delivered (7d)" />
                <KpiTile index={1} label="Spend 7d" value="$1,420.00" hint="6 orders" />
                <KpiTile
                  index={2}
                  label="Success rate 7d"
                  value="98.4%"
                  hint="delivered / attempted"
                />
                <KpiTile index={3} label="Active agents" value="3" hint="5 total" />
                <KpiTile
                  index={4}
                  label="In flight"
                  value="1"
                  hint="awaiting payment or delivery"
                />
              </div>

              {/* split: chart + recent activity */}
              <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 16 }}>
                <Card2
                  title="Spend — last 14 days"
                  actions={
                    <span style={{ fontFamily: FONT.mono, fontSize: 12, color: COLORS.fgDim }}>
                      Analytics soon
                    </span>
                  }
                  padding={18}
                >
                  <SpendChart width={560} height={190} startFrame={40} />
                </Card2>
                <Card2
                  title="Recent activity"
                  actions={
                    <span style={{ fontFamily: FONT.mono, fontSize: 12, color: COLORS.fgDim }}>
                      View all →
                    </span>
                  }
                  padding={0}
                >
                  <OrderTable rows={ROWS} visible={4} />
                </Card2>
              </div>
            </div>
          </div>
        </div>
      </BrowserFrame>
    </AbsoluteFill>
  );
}
