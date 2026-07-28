import React from "react";
import { Composition } from "remotion";
import { FindAnythingDemo } from "./FindAnythingDemo";
import { FindAnythingWalkthrough } from "./FindAnythingWalkthrough";
import { FPS, HEIGHT, TOTAL_FRAMES, WIDTH } from "./config";
import { WT_TOTAL_FRAMES } from "./walkthrough-config";

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
