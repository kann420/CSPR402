import type { CSSProperties } from 'react';

const LOGO_ASPECT = 1036 / 604;

interface Props {
  height?: number;
  mark?: boolean;
  title?: string;
  className?: string;
  style?: CSSProperties;
  transparent?: boolean;
}

export function Wordmark({
  height = 34,
  mark = false,
  title = 'CSPR402',
  className,
  style,
  transparent = false,
}: Props) {
  const width = Math.round(height * LOGO_ASPECT);
  return (
    <img
      src={transparent ? '/logo-transparent.svg' : '/logo.svg'}
      alt={title}
      className={className}
      style={{
        display: 'inline-block',
        width: mark ? height : width,
        height,
        objectFit: mark ? 'cover' : 'contain',
        objectPosition: 'center',
        flexShrink: 0,
        verticalAlign: 'middle',
        ...style,
      }}
    />
  );
}
