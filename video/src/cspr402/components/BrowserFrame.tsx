// macOS-style browser frame wrapping a recreated CSPR402 web screen.
// Traffic lights, a tab pinning cspr402.xyz, and a url bar — the chrome
// the real app's screenshots use (web/shot.mjs).

import type { CSSProperties, ReactNode } from 'react';
import { COLORS, FONT } from '../theme';

export function BrowserFrame({
  url = 'cspr402.xyz',
  width,
  height,
  children,
  style,
}: {
  url?: string;
  width: number;
  height: number;
  children: ReactNode;
  style?: CSSProperties;
}) {
  const chrome = 44;
  return (
    <div
      style={{
        width,
        height,
        background: COLORS.bg,
        border: `1px solid ${COLORS.borderStrong}`,
        borderRadius: 16,
        overflow: 'hidden',
        boxShadow: `0 40px 120px -40px rgba(0,0,0,0.9), 0 0 0 1px rgba(255,255,255,0.04)`,
        ...style,
      }}
    >
      {/* title/tab bar */}
      <div
        style={{
          height: chrome,
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          padding: '0 16px',
          background: COLORS.bgElev,
          borderBottom: `1px solid ${COLORS.border}`,
        }}
      >
        <div style={{ display: 'flex', gap: 8 }}>
          <span style={{ width: 12, height: 12, borderRadius: '50%', background: '#ff5f57' }} />
          <span style={{ width: 12, height: 12, borderRadius: '50%', background: '#febc2e' }} />
          <span style={{ width: 12, height: 12, borderRadius: '50%', background: '#28c840' }} />
        </div>
        {/* tab */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '5px 14px',
            borderRadius: '8px 8px 0 0',
            background: COLORS.surface2,
            border: `1px solid ${COLORS.border}`,
            color: COLORS.fg,
            fontFamily: FONT.body,
            fontSize: 13,
          }}
        >
          <LockIcon />
          {url}
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: COLORS.green,
              marginLeft: 4,
            }}
          />
        </div>
        {/* url bar spacer */}
        <div
          style={{
            flex: 1,
            maxWidth: 460,
            height: 26,
            borderRadius: 8,
            background: COLORS.surface,
            border: `1px solid ${COLORS.border}`,
            display: 'flex',
            alignItems: 'center',
            padding: '0 12px',
            color: COLORS.fgDim,
            fontFamily: FONT.mono,
            fontSize: 12,
            gap: 8,
          }}
        >
          <LockIcon />
          https://{url}
        </div>
      </div>
      <div style={{ height: height - chrome, position: 'relative', overflow: 'hidden' }}>
        {children}
      </div>
    </div>
  );
}

function LockIcon() {
  return (
    <svg width="10" height="12" viewBox="0 0 10 12" fill="none">
      <rect
        x="0.75"
        y="5"
        width="8.5"
        height="6.25"
        rx="1.5"
        stroke={COLORS.fgDim}
        strokeWidth="1.2"
      />
      <path
        d="M2.5 5V3.5a2.5 2.5 0 1 1 5 0V5"
        stroke={COLORS.fgDim}
        strokeWidth="1.2"
        fill="none"
      />
    </svg>
  );
}
