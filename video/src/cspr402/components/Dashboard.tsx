// Operator-dashboard primitives recreated from the real app:
//   - Sidebar (web/app/dashboard/_shell/Sidebar.tsx)
//   - OverviewHero summary card (.ov-hero-card in globals.css)
//   - KpiTile + KpiRow (web/app/dashboard/_ui/KpiTile.tsx)
//   - OrderTable / StatusPill (orders + OrderStatusPill)
//   - SpendChart (svg line draw-in)
// Self-animating from useCurrentFrame (local frame within a Sequence).

import { interpolate, useCurrentFrame } from 'remotion';
import type { CSSProperties, ReactNode } from 'react';
import { COLORS, FONT, EASE, ORDER_STATUS } from '../theme';
import { Logo } from '../Logo';
import { Pill } from './Primitives';

const ease = EASE.out;

const NAV = [
  { label: 'Overview', icon: 'M3 12h4l3-9 4 18 3-9h4', active: true },
  {
    label: 'Agents',
    icon: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0z',
  },
  {
    label: 'Orders',
    icon: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M16 13H8M16 17H8M10 9H8',
  },
  {
    label: 'Approvals',
    icon: 'M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11',
    badge: '2',
  },
];

export function DashSidebar({ width = 220 }: { width?: number }) {
  return (
    <div
      style={{
        width,
        flexShrink: 0,
        height: '100%',
        borderRight: `1px solid ${COLORS.border}`,
        background: COLORS.bg,
        display: 'flex',
        flexDirection: 'column',
        padding: '14px 10px',
        gap: 18,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 8px' }}>
        <Logo height={28} color={COLORS.fg} />
        <span
          style={{
            fontSize: 10,
            color: COLORS.fgDim,
            padding: '2px 7px',
            border: `1px solid ${COLORS.border}`,
            borderRadius: 3,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            fontFamily: FONT.mono,
          }}
        >
          Beta
        </span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {NAV.map((n) => (
          <div
            key={n.label}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '9px 12px',
              borderRadius: 6,
              fontSize: 14,
              fontWeight: n.active ? 600 : 500,
              color: n.active ? COLORS.fg : COLORS.fgMuted,
              background: n.active ? COLORS.surface : 'transparent',
            }}
          >
            <NavIcon d={n.icon} color={n.active ? COLORS.fg : COLORS.fgDim} />
            <span style={{ flex: 1 }}>{n.label}</span>
            {n.badge && (
              <span
                style={{
                  minWidth: 18,
                  height: 18,
                  padding: '0 5px',
                  borderRadius: 9,
                  background: COLORS.yellow,
                  color: '#000',
                  fontSize: 11,
                  fontWeight: 700,
                  fontFamily: FONT.mono,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {n.badge}
              </span>
            )}
          </div>
        ))}
        <div
          style={{
            fontSize: 11,
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
            color: COLORS.fgDim,
            padding: '16px 12px 4px',
            fontWeight: 600,
          }}
        >
          Administration
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '9px 12px',
            borderRadius: 6,
            fontSize: 14,
            fontWeight: 500,
            color: COLORS.fgMuted,
          }}
        >
          <NavIcon
            d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9c0 .66.39 1.25 1 1.51H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"
            color={COLORS.fgDim}
          />
          <span style={{ flex: 1 }}>Settings</span>
        </div>
      </div>
    </div>
  );
}

function NavIcon({ d, color }: { d: string; color: string }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={d} />
    </svg>
  );
}

export function OverviewHeroCard({
  balance = '$1,420.00',
  digits = '3',
}: {
  balance?: string;
  digits?: string;
}) {
  return (
    <div
      style={{
        position: 'relative',
        width: 320,
        aspectRatio: '1.586',
        borderRadius: 22,
        overflow: 'hidden',
        border: `1px solid rgba(255,255,255,0.16)`,
        boxShadow:
          '0 1.5rem 3rem rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.04) inset, 0 0 3rem rgba(255,42,35,0.4)',
        color: '#f5f1e8',
        fontFamily: FONT.body,
        background: `
          linear-gradient(135deg, rgba(255,255,255,0.14), rgba(255,255,255,0.02) 35%, rgba(255,255,255,0.08)),
          linear-gradient(160deg, rgba(255,42,35,0.18), rgba(225,26,20,0.08) 42%, rgba(120,8,5,0.18) 78%, rgba(255,42,35,0.10)),
          #0a0a0a`,
      }}
    >
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage: `repeating-linear-gradient(90deg, rgba(255,255,255,0.04) 0 1px, transparent 1px 34px), repeating-linear-gradient(0deg, rgba(255,255,255,0.03) 0 1px, transparent 1px 34px)`,
          opacity: 0.3,
        }}
      />
      <div
        style={{
          position: 'relative',
          zIndex: 1,
          height: '100%',
          display: 'grid',
          gridTemplateRows: 'auto 1fr auto',
          padding: '20px 22px',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            letterSpacing: '0.16em',
            textTransform: 'uppercase',
            fontSize: 10,
            color: 'rgba(255,245,225,0.65)',
          }}
        >
          <span
            style={{
              fontFamily: FONT.display,
              fontSize: 20,
              fontWeight: 600,
              letterSpacing: '-0.04em',
              textTransform: 'none',
              color: '#fff8ec',
              textShadow: '0 0 14px rgba(255,42,35,0.45)',
            }}
          >
            x402
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: COLORS.brand,
                boxShadow: '0 0 8px rgba(255,42,35,0.7)',
              }}
            />
            Casper
          </span>
        </div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'auto 1fr',
            alignItems: 'center',
            gap: 18,
          }}
        >
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'auto auto',
              alignItems: 'center',
              gap: 14,
            }}
          >
            <div
              style={{
                width: 42,
                height: 32,
                borderRadius: 9,
                position: 'relative',
                background:
                  'linear-gradient(135deg, rgba(255,245,210,0.95), rgba(255,207,110,0.45))',
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  inset: 5,
                  border: '1px solid rgba(90,60,0,0.18)',
                  borderRadius: 6,
                }}
              />
            </div>
            <div>
              <div
                style={{
                  fontSize: 9,
                  letterSpacing: '0.14em',
                  textTransform: 'uppercase',
                  color: 'rgba(255,245,225,0.65)',
                  marginBottom: 6,
                }}
              >
                Spend 7d
              </div>
              <div
                style={{
                  fontFamily: FONT.display,
                  fontSize: 30,
                  fontWeight: 700,
                  letterSpacing: '-0.03em',
                  color: '#fff8ec',
                  textShadow: '0 0 1.5rem rgba(255,42,35,0.4)',
                }}
              >
                {balance}
              </div>
            </div>
          </div>
          <div
            style={{
              display: 'grid',
              gap: 3,
              justifyItems: 'end',
              textAlign: 'right',
              fontFamily: FONT.mono,
              color: 'rgba(255,249,235,0.95)',
            }}
          >
            <div
              style={{
                fontSize: 8,
                textTransform: 'uppercase',
                letterSpacing: '0.14em',
                color: 'rgba(255,245,225,0.6)',
              }}
            >
              Active agents
            </div>
            <div style={{ fontSize: 14, letterSpacing: '0.12em' }}>{digits}</div>
          </div>
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            letterSpacing: '0.16em',
            textTransform: 'uppercase',
            fontSize: 10,
            color: 'rgba(255,245,225,0.65)',
          }}
        >
          <div>Dashboard</div>
          <span
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: COLORS.green }}
          >
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: COLORS.green,
                boxShadow: '0 0 8px rgba(124,255,178,0.6)',
              }}
            />
            LIVE
          </span>
        </div>
      </div>
    </div>
  );
}

export function KpiTile({
  label,
  value,
  hint,
  index = 0,
}: {
  label: string;
  value: string;
  hint?: string;
  index?: number;
}) {
  const f = useCurrentFrame();
  const p = interpolate(f, [8 + index * 5, 22 + index * 5], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: ease,
  });
  return (
    <div
      style={{
        flex: 1,
        minWidth: 0,
        background: COLORS.surface,
        border: `1px solid ${COLORS.border}`,
        borderRadius: 14,
        padding: '16px 18px',
        opacity: p,
        transform: `translateY(${interpolate(p, [0, 1], [14, 0])}px)`,
        position: 'relative',
      }}
    >
      <div
        style={{
          fontFamily: FONT.mono,
          fontSize: 11,
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          color: COLORS.fgDim,
          marginBottom: 8,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontFamily: FONT.display,
          fontSize: 30,
          fontWeight: 500,
          letterSpacing: '-0.02em',
          color: COLORS.fg,
          lineHeight: 1,
        }}
      >
        {value}
      </div>
      {hint && (
        <div style={{ fontFamily: FONT.mono, fontSize: 11, color: COLORS.fgDim, marginTop: 8 }}>
          {hint}
        </div>
      )}
    </div>
  );
}

export function StatusPill({ status }: { status: keyof typeof ORDER_STATUS }) {
  const def = (ORDER_STATUS[status] ?? ORDER_STATUS.processing)!;
  return <Pill tone={def.tone}>{def.label}</Pill>;
}

export type OrderRow = {
  agent: string;
  amount: string;
  rail: string;
  status: keyof typeof ORDER_STATUS;
  when: string;
};

export function OrderTable({
  rows,
  visible = rows.length,
  style,
}: {
  rows: OrderRow[];
  visible?: number;
  style?: CSSProperties;
}) {
  const f = useCurrentFrame();
  return (
    <div style={{ width: '100%', ...style }}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1.2fr 0.8fr 0.8fr 1.1fr 0.7fr',
          padding: '10px 14px',
          borderBottom: `1px solid ${COLORS.border}`,
        }}
      >
        {['Agent', 'Amount', 'Rail', 'Status', 'When'].map((h, i) => (
          <div
            key={h}
            style={{
              fontFamily: FONT.mono,
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: COLORS.muted,
              textAlign: i === 1 ? 'right' : 'left',
            }}
          >
            {h}
          </div>
        ))}
      </div>
      {rows.slice(0, visible).map((r, i) => {
        const p = interpolate(f, [10 + i * 4, 20 + i * 4], [0, 1], {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
          easing: ease,
        });
        return (
          <div
            key={i}
            style={{
              display: 'grid',
              gridTemplateColumns: '1.2fr 0.8fr 0.8fr 1.1fr 0.7fr',
              alignItems: 'center',
              padding: '12px 14px',
              borderBottom: i < visible - 1 ? `1px solid ${COLORS.borderHairline}` : 'none',
              opacity: p,
              transform: `translateX(${interpolate(p, [0, 1], [-10, 0])}px)`,
            }}
          >
            <div style={{ fontFamily: FONT.mono, fontSize: 13 }}>{r.agent}</div>
            <div
              style={{
                fontFamily: FONT.mono,
                fontSize: 13,
                textAlign: 'right',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {r.amount}
            </div>
            <div style={{ fontFamily: FONT.mono, fontSize: 12, color: COLORS.fgDim }}>{r.rail}</div>
            <div>
              <StatusPill status={r.status} />
            </div>
            <div style={{ fontFamily: FONT.mono, fontSize: 12, color: COLORS.fgDim }}>{r.when}</div>
          </div>
        );
      })}
    </div>
  );
}

export function SpendChart({
  width = 520,
  height = 200,
  startFrame = 0,
}: {
  width?: number;
  height?: number;
  startFrame?: number;
}) {
  const f = useCurrentFrame();
  const pts = [18, 32, 24, 40, 30, 52, 44, 60, 50, 72, 64, 80, 74, 92];
  const max = 100;
  const W = width;
  const H = height;
  const stepX = W / (pts.length - 1);
  const path = pts
    .map((v, i) => `${i === 0 ? 'M' : 'L'} ${i * stepX} ${H - (v / max) * (H - 20) - 10}`)
    .join(' ');
  const area = `${path} L ${W} ${H} L 0 ${H} Z`;
  const draw = interpolate(f - startFrame, [0, 36], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: ease,
  });
  return (
    <svg width={W} height={H} style={{ display: 'block' }}>
      <defs>
        <linearGradient id="sc-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={COLORS.brand} stopOpacity="0.25" />
          <stop offset="100%" stopColor={COLORS.brand} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#sc-fill)" opacity={draw} />
      <path
        d={path}
        fill="none"
        stroke={COLORS.brand}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        pathLength={1}
        strokeDasharray={1}
        strokeDashoffset={1 - draw}
      />
      {pts.map((v, i) => {
        const px = i * stepX;
        const py = H - (v / max) * (H - 20) - 10;
        return (
          <circle
            key={i}
            cx={px}
            cy={py}
            r={draw > i / pts.length ? 2.6 : 0}
            fill={COLORS.fg}
            opacity={0.85}
          />
        );
      })}
    </svg>
  );
}

export function Card2({
  children,
  title,
  actions,
  padding = 22,
  style,
}: {
  children: ReactNode;
  title?: string;
  actions?: ReactNode;
  padding?: number;
  style?: CSSProperties;
}) {
  return (
    <div
      style={{
        background: COLORS.surface,
        border: `1px solid ${COLORS.border}`,
        borderRadius: 14,
        padding,
        ...style,
      }}
    >
      {(title || actions) && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 16,
          }}
        >
          {title && (
            <div style={{ fontFamily: FONT.body, fontSize: 15, fontWeight: 600, color: COLORS.fg }}>
              {title}
            </div>
          )}
          {actions}
        </div>
      )}
      {children}
    </div>
  );
}
