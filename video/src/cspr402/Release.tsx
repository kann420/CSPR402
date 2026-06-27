// CSPR402Release — the official-release 30s marketing composition.
// 1920x1080 @ 30fps, 900 frames. Six scenes crossfaded via overlapping
// <Sequence>s, each wrapped in <SceneWrap> for the dark canvas + fade.
// Independent of the legacy HelloWorld scaffold.

import { Composition, Sequence } from 'remotion';
import { VIEWPORT, DURATION_FRAMES } from './theme';
import { EnsureFonts } from './fonts';
import { SceneWrap } from './scenes/SceneWrap';
import { IntroScene, INTRO_DURATION } from './scenes/IntroScene';
import { FlowScene, FLOW_DURATION } from './scenes/FlowScene';
import { TerminalScene, TERMINAL_DURATION } from './scenes/TerminalScene';
import { DashboardScene, DASHBOARD_DURATION } from './scenes/DashboardScene';
import { CardScene, CARD_DURATION } from './scenes/CardScene';
import { CloseScene } from './scenes/CloseScene';

const FADE = 10; // crossfade overlap per scene

// Start times — each scene begins FADE frames before the previous ends,
// so the two SceneWraps crossfade for that overlap window.
const intro = 0; // 0
const flow = intro + INTRO_DURATION - FADE; // 140
const terminal = flow + FLOW_DURATION - FADE; // 295
const dashboard = terminal + TERMINAL_DURATION - FADE; // 465
const card = dashboard + DASHBOARD_DURATION - FADE; // 650
const close = card + CARD_DURATION - FADE; // 760

export const CSPR402Release: React.FC = () => {
  return (
    <>
      <EnsureFonts />
      <Sequence from={intro} durationInFrames={INTRO_DURATION + FADE}>
        <SceneWrap duration={INTRO_DURATION + FADE}>
          <IntroScene />
        </SceneWrap>
      </Sequence>

      <Sequence from={flow} durationInFrames={FLOW_DURATION + FADE}>
        <SceneWrap duration={FLOW_DURATION + FADE}>
          <FlowScene />
        </SceneWrap>
      </Sequence>

      <Sequence from={terminal} durationInFrames={TERMINAL_DURATION + FADE}>
        <SceneWrap duration={TERMINAL_DURATION + FADE}>
          <TerminalScene />
        </SceneWrap>
      </Sequence>

      <Sequence from={dashboard} durationInFrames={DASHBOARD_DURATION + FADE}>
        <SceneWrap duration={DASHBOARD_DURATION + FADE}>
          <DashboardScene />
        </SceneWrap>
      </Sequence>

      <Sequence from={card} durationInFrames={CARD_DURATION + FADE}>
        <SceneWrap duration={CARD_DURATION + FADE}>
          <CardScene />
        </SceneWrap>
      </Sequence>

      <Sequence from={close} durationInFrames={900 - close}>
        <SceneWrap duration={900 - close}>
          <CloseScene />
        </SceneWrap>
      </Sequence>
    </>
  );
};

export const CSPR402Composition: React.FC = () => {
  return (
    <Composition
      id="CSPR402Release"
      component={CSPR402Release}
      durationInFrames={DURATION_FRAMES}
      fps={VIEWPORT.fps}
      width={VIEWPORT.width}
      height={VIEWPORT.height}
    />
  );
};
