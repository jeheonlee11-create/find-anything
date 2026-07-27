import React from "react";
import { Composition } from "remotion";
import { FindAnythingDemo } from "./FindAnythingDemo";
import { FPS, HEIGHT, TOTAL_FRAMES, WIDTH } from "./config";

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="FindAnythingDemo"
      component={FindAnythingDemo}
      durationInFrames={TOTAL_FRAMES}
      fps={FPS}
      width={WIDTH}
      height={HEIGHT}
      defaultProps={{ withAudio: true }}
    />
  );
};
