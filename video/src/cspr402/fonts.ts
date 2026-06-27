// Loads the real CSPR402 fonts (Inter, Fraunces, JetBrains Mono) via
// @remotion/google-fonts so the video's typography matches the app.
// Weights/subsets are narrowed to latin to keep the render fast. If a
// fetch fails the @font-face is simply never registered and the
// fallback stacks in theme.FONT take over — the render never hangs.

import { useLayoutEffect } from 'react';
import { delayRender, continueRender } from 'remotion';
import { loadFont as loadInter } from '@remotion/google-fonts/Inter';
import { loadFont as loadFraunces } from '@remotion/google-fonts/Fraunces';
import { loadFont as loadMono } from '@remotion/google-fonts/JetBrainsMono';

const LAT = { subsets: ['latin' as const] };

export const inter = loadInter('normal', { weights: ['400', '500', '600', '700', '800'], ...LAT });
export const fraunces = loadFraunces('normal', { weights: ['400', '500', '600', '700'], ...LAT });
export const frauncesItalic = loadFraunces('italic', { weights: ['400', '500'], ...LAT });
export const mono = loadMono('normal', { weights: ['400', '500', '700'], ...LAT });

// Canonical family names — referenced throughout the video. Matches theme.FONT.
export const FONT_NAMES = {
  display: fraunces.fontFamily, // "Fraunces"
  displayItalic: frauncesItalic.fontFamily,
  body: inter.fontFamily, // "Inter"
  mono: mono.fontFamily, // "JetBrains Mono"
} as const;

const waitAll = () =>
  Promise.allSettled([
    inter.waitUntilDone(),
    fraunces.waitUntilDone(),
    frauncesItalic.waitUntilDone(),
    mono.waitUntilDone(),
  ]);

// Mount once near the root so Remotion waits for fonts before capturing.
// 20s hard ceiling — if every fetch fails we still proceed (fallback fonts).
export function EnsureFonts() {
  useLayoutEffect(() => {
    const handle = delayRender('cspr402 fonts');
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      continueRender(handle);
    };
    Promise.race([waitAll(), new Promise((r) => setTimeout(r, 20_000))]).then(finish, finish);
    return () => finish();
  }, []);
  return null;
}
