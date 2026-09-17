/** Find Anything — 45s cinematic promo. Four scenes, hard-sequenced. */
import React from "react";
import { AbsoluteFill, Audio, Sequence, staticFile } from "remotion";
import { PROMO_SCENES } from "./promo-config";
import { musicVolume } from "./audio";
import { Scene1_TheHook } from "./Scene1_TheHook";
import { Scene2_TheReveal } from "./Scene2_TheReveal";
import { Scene3_TheResolution } from "./Scene3_TheResolution";
import { Scene4_TheOutro } from "./Scene4_TheOutro";

export type PromoProps = { withAudio: boolean };

export const FindAnythingPromo: React.FC<PromoProps> = ({ withAudio }) => {
  const s1 = PROMO_SCENES.hook;
  const s2 = s1 + PROMO_SCENES.reveal;
  const s3 = s2 + PROMO_SCENES.resolution;
  return (
    <AbsoluteFill style={{ background: "#07080f" }}>
      {withAudio && (
        <>
          {/* Music bed with the keyframed envelope: punch at the frame-240
              drop, subtle dips under the click and the receipt beat. */}
          <Audio src={staticFile("audio/promo-music.wav")} volume={(f) => musicVolume(f)} />
          {/* SFX stem is baked from the same cue sheet the scenes read. */}
          <Audio src={staticFile("audio/promo-effects.wav")} volume={0.9} />
        </>
      )}
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
