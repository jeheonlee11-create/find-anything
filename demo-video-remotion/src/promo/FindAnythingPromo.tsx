/** Find Anything — 45s cinematic promo. Four scenes, hard-sequenced. */
import React from "react";
import { AbsoluteFill, Sequence } from "remotion";
import { PROMO_SCENES } from "./promo-config";
import { Scene1_TheHook } from "./Scene1_TheHook";
import { Scene2_TheReveal } from "./Scene2_TheReveal";
import { Scene3_TheResolution } from "./Scene3_TheResolution";
import { Scene4_TheOutro } from "./Scene4_TheOutro";

export const FindAnythingPromo: React.FC = () => {
  const s1 = PROMO_SCENES.hook;
  const s2 = s1 + PROMO_SCENES.reveal;
  const s3 = s2 + PROMO_SCENES.resolution;
  return (
    <AbsoluteFill style={{ background: "#07080f" }}>
      <Sequence durationInFrames={PROMO_SCENES.hook}>
        <Scene1_TheHook />
      </Sequence>
      <Sequence from={s1} durationInFrames={PROMO_SCENES.reveal}>
        <Scene2_TheReveal />
      </Sequence>
      <Sequence from={s2} durationInFrames={PROMO_SCENES.resolution}>
        <Scene3_TheResolution />
      </Sequence>
      <Sequence from={s3} durationInFrames={PROMO_SCENES.outro}>
        <Scene4_TheOutro />
      </Sequence>
    </AbsoluteFill>
  );
};
