import React from "react";
import { AbsoluteFill, Audio, Sequence, interpolate, staticFile, useCurrentFrame } from "remotion";
import { SCENES, SCENE_ORDER, SceneName, TRANSITION, sceneStart } from "./config";
import { theme } from "./theme";
import { BothVisible, Coverage, Draft, Evidence, Excluded, Final, Hook, Outro, Ranking } from "./scenes";

const SCENE_COMPONENTS: Record<SceneName, React.FC> = {
  hook: Hook,
  draft: Draft,
  final: Final,
  bothVisible: BothVisible,
  ranking: Ranking,
  excluded: Excluded,
  coverage: Coverage,
  evidence: Evidence,
  outro: Outro,
};

/** Fades a scene in at its start and out before its end (fade-through-bg). */
const FadeWrap: React.FC<{ duration: number; children: React.ReactNode }> = ({ duration, children }) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(
    frame,
    [0, TRANSITION, duration - TRANSITION, duration],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );
  return <AbsoluteFill style={{ opacity }}>{children}</AbsoluteFill>;
};

export type DemoProps = { withAudio: boolean };

export const FindAnythingDemo: React.FC<DemoProps> = ({ withAudio }) => {
  return (
    <AbsoluteFill style={{ background: theme.bg }}>
      {withAudio && (
        <>
          <Audio src={staticFile("audio/music.wav")} volume={0.8} />
          <Audio src={staticFile("audio/effects.wav")} volume={0.9} />
        </>
      )}
      {SCENE_ORDER.map((name) => {
        const Comp = SCENE_COMPONENTS[name];
        return (
          <Sequence key={name} from={sceneStart(name)} durationInFrames={SCENES[name]} name={name}>
            <FadeWrap duration={SCENES[name]}>
              <Comp />
            </FadeWrap>
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};
