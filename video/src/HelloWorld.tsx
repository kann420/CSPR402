import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';

type HelloWorldProps = {
  title: string;
  accent: string;
};

export const HelloWorld: React.FC<HelloWorldProps> = ({ title, accent }) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 30], [0, 1], {
    extrapolateRight: 'clamp',
  });
  const scale = interpolate(frame, [0, 30], [0.9, 1], {
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill
      style={{
        backgroundColor: '#0a0a0a',
        justifyContent: 'center',
        alignItems: 'center',
      }}
    >
      <h1
        style={{
          color: '#ffffff',
          fontFamily: 'Inter, system-ui, sans-serif',
          fontSize: 140,
          fontWeight: 800,
          margin: 0,
          opacity,
          transform: `scale(${scale})`,
          letterSpacing: -4,
        }}
      >
        {title}
      </h1>
      <div
        style={{
          marginTop: 24,
          width: 120,
          height: 6,
          borderRadius: 3,
          backgroundColor: accent,
          opacity,
        }}
      />
    </AbsoluteFill>
  );
};
