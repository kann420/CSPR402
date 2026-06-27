// Scene shell: full-frame dark canvas + dot-grid + red ambient glow,
// with a standardized in/out fade so adjacent scenes crossfade cleanly.

import type { CSSProperties, ReactNode } from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';
import { COLORS } from '../theme';
import { DotGrid, RedAmbient } from '../components/Primitives';

export function SceneWrap({
  duration,
  fade = 10,
  ambient = true,
  grid = true,
  children,
  style,
}: {
  duration: number;
  fade?: number;
  ambient?: boolean;
  grid?: boolean;
  children: ReactNode;
  style?: CSSProperties;
}) {
  const f = useCurrentFrame();
  const fadeIn = interpolate(f, [0, fade], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const fadeOut = interpolate(f, [duration - fade, duration], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const opacity = Math.min(fadeIn, fadeOut);
  return (
    <AbsoluteFill style={{ background: COLORS.bg, opacity, ...style }}>
      {grid && <DotGrid opacity={0.7} />}
      {ambient && <RedAmbient />}
      {children}
    </AbsoluteFill>
  );
}

// slide/blur reveal keyed to local frame — used by individual scene blocks.
export function rise(f: number, start: number, dur = 18, dy = 24, blurPx = 6) {
  const p = interpolate(f, [start, start + dur], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  return {
    opacity: p,
    transform: `translateY(${interpolate(p, [0, 1], [dy, 0])}px)`,
    filter: `blur(${interpolate(p, [0, 1], [blurPx, 0])}px)`,
  };
}
