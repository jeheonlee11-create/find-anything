import React from "react";
import { Composition } from "remotion";
import { FindAnythingDemo } from "./FindAnythingDemo";
import { FindAnythingWalkthrough } from "./FindAnythingWalkthrough";
import { FindAnythingPromo } from "./promo/FindAnythingPromo";
import { FPS, HEIGHT, TOTAL_FRAMES, WIDTH } from "./config";
import { WT_TOTAL_FRAMES } from "./walkthrough-config";
import { PROMO_FPS, PROMO_HEIGHT, PROMO_TOTAL_FRAMES, PROMO_WIDTH } from "./promo/promo-config";

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="FindAnythingDemo"
        component={FindAnythingDemo}
        durationInFrames={TOTAL_FRAMES}
        fps={FPS}
        width={WIDTH}
        height={HEIGHT}
        defaultProps={{ withAudio: true }}
      />
      <Composition
        id="FindAnythingPromo"
        component={FindAnythingPromo}
        durationInFrames={PROMO_TOTAL_FRAMES}
        fps={PROMO_FPS}
        width={PROMO_WIDTH}
        height={PROMO_HEIGHT}
      />
      <Composition
        id="FindAnythingWalkthrough"
        component={FindAnythingWalkthrough}
        durationInFrames={WT_TOTAL_FRAMES}
        fps={FPS}
        width={WIDTH}
        height={HEIGHT}
        defaultProps={{ withAudio: true }}
      />
    </>
  );
};
