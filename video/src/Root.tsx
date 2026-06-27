import { Composition } from 'remotion';
import { HelloWorld } from './HelloWorld';
import { CSPR402Composition } from './cspr402/Release';

export const Root: React.FC = () => {
  return (
    <>
      {/* Legacy minimal scaffold — kept for reference; the official
          release video is the CSPR402Release composition below. */}
      <Composition
        id="HelloWorld"
        component={HelloWorld}
        durationInFrames={150}
        fps={30}
        width={1920}
        height={1080}
        defaultProps={{
          title: 'CasperCard402',
          accent: '#e11d2a',
        }}
      />
      <CSPR402Composition />
    </>
  );
};
