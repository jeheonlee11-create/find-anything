import React from "react";
import { AbsoluteFill, Audio, Sequence, staticFile } from "remotion";
import { WT_ORDER, WT_SCENES, wtSceneStart } from "./walkthrough-config";
import { theme } from "./theme";
import { WT_CAMERA, WT_SCENE_COMPONENTS } from "./walkthrough-scenes";
import { Camera, CinematicBackground } from "./components/cinematic";

export type WalkthroughProps = { withAudio: boolean };

/** Longer, literal product walkthrough (~2:35). Same design system and
 *  cinematic treatment as the 59s demo, which remains untouched. */
export const FindAnythingWalkthrough: React.FC<WalkthroughProps> = ({ withAudio }) => {
  return (
    <AbsoluteFill style={{ background: theme.bg }}>
      {withAudio && (
        <>
          <Audio src={staticFile("audio/walkthrough-music.wav")} volume={0.8} />
          <Audio src={staticFile("audio/walkthrough-effects.wav")} volume={0.9} />
        </>
      )}

      <CinematicBackground />

      {WT_ORDER.map((name) => {
        const Comp = WT_SCENE_COMPONENTS[name];
        const cam = WT_CAMERA[name];
        return (
          <Sequence key={name} from={wtSceneStart(name)} durationInFrames={WT_SCENES[name]} name={name}>
            <Camera duration={WT_SCENES[name]} from={cam.from} drift={cam.drift}>
              <Comp />
            </Camera>
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};
