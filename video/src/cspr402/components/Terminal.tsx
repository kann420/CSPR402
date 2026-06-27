// Terminal window with progressive typewriter output — recreates the
// real `cspr402 purchase` CLI demo. Lines type char-by-char, newest
// command shows a blinking block cursor while active.

import type { CSSProperties } from 'react';
import { useCurrentFrame } from 'remotion';
import { COLORS, FONT } from '../theme';

export type TermLine = {
  text: string;
  tone?: 'dim' | 'normal' | 'green' | 'brand' | 'red' | 'blue';
  kind?: 'cmd' | 'out' | 'check' | 'warn' | 'blank';
};

const TONE_COLOR: Record<string, string> = {
  dim: COLORS.fgDim,
  normal: COLORS.fgMuted,
  green: COLORS.green,
  brand: COLORS.brand,
  red: COLORS.red,
  blue: COLORS.blue,
};

export function Terminal({
  width,
  height,
  title = 'cspr402 — purchase',
  lines,
  startFrame = 0,
  charsPerFrame = 2.2,
  gap = 5,
  style,
}: {
  width: number;
  height: number;
  title?: string;
  lines: TermLine[];
  startFrame?: number;
  charsPerFrame?: number;
  gap?: number;
  style?: CSSProperties;
}) {
  const frame = useCurrentFrame();
  const elapsed = frame - startFrame;

  // Precompute cumulative start frames per line.
  const starts: number[] = [];
  let t = 0;
  for (const l of lines) {
    const len = l.text.length + (l.kind === 'cmd' ? 2 : 0); // "$ "
    starts.push(t);
    t += Math.ceil(len / charsPerFrame) + gap;
  }

  const padX = 22;
  const lineH = 26;
  const headerH = 38;

  return (
    <div
      style={{
        width,
        height,
        background: COLORS.bgElev,
        border: `1px solid ${COLORS.borderStrong}`,
        borderRadius: 14,
        overflow: 'hidden',
        boxShadow: '0 30px 80px -30px rgba(0,0,0,0.85)',
        ...style,
      }}
    >
      <div
        style={{
          height: headerH,
          display: 'flex',
          alignItems: 'center',
          gap: 14,
          padding: '0 16px',
          background: COLORS.bgElev2,
          borderBottom: `1px solid ${COLORS.border}`,
        }}
      >
        <div style={{ display: 'flex', gap: 8 }}>
          <span style={{ width: 11, height: 11, borderRadius: '50%', background: '#ff5f57' }} />
          <span style={{ width: 11, height: 11, borderRadius: '50%', background: '#febc2e' }} />
          <span style={{ width: 11, height: 11, borderRadius: '50%', background: '#28c840' }} />
        </div>
        <div style={{ fontFamily: FONT.mono, fontSize: 12, color: COLORS.fgDim }}>{title}</div>
      </div>
      <div
        style={{
          padding: `18px ${padX}px`,
          fontFamily: FONT.mono,
          fontSize: 16,
          lineHeight: `${lineH}px`,
        }}
      >
        {lines.map((l, i) => {
          const s = starts[i] ?? 0;
          if (elapsed < s) return null;
          const dur = Math.ceil(l.text.length / charsPerFrame);
          const done = elapsed - s >= dur;
          const shown = done ? l.text : l.text.slice(0, Math.floor((elapsed - s) * charsPerFrame));
          const lastIdx =
            [...starts.keys()].reverse().find((k) => elapsed >= (starts[k] ?? -1)) ?? -1;
          const color = TONE_COLOR[l.tone ?? 'normal'] ?? COLORS.fgMuted;
          return (
            <div key={i} style={{ display: 'flex', alignItems: 'center', minHeight: lineH, color }}>
              {l.kind === 'cmd' && <span style={{ color: COLORS.brand, marginRight: 8 }}>$</span>}
              <span>{shown}</span>
              {!done && i === lastIdx && (
                <span
                  style={{
                    display: 'inline-block',
                    width: 9,
                    height: 18,
                    marginLeft: 4,
                    background: COLORS.green,
                    opacity: Math.floor(frame / 15) % 2 === 0 ? 1 : 0.2,
                  }}
                />
              )}
              {l.kind === 'check' && done && (
                <span style={{ marginLeft: 8, color: COLORS.green }}>✓</span>
              )}
              {l.kind === 'warn' && done && (
                <span style={{ marginLeft: 8, color: COLORS.yellow }}>!</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
