import React from "react";
import { AbsoluteFill, Audio, Sequence, staticFile } from "remotion";
import { SCENES, SCENE_ORDER, SceneName, sceneStart } from "./config";
import { theme } from "./theme";
import { BothVisible, Coverage, Draft, Evidence, Excluded, Final, Hook, Outro, Ranking } from "./scenes";
import { Camera, CinematicBackground } from "./components/cinematic";

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

/** Per-scene virtual-camera moves (start scale + [dx,dy] drift in px) for
 *  variety — some push in, some drift laterally. */
const CAMERA: Record<SceneName, { from: number; drift: [number, number] }> = {
  hook: { from: 1.1, drift: [0, -22] },
  draft: { from: 1.06, drift: [26, -10] },
  final: { from: 1.06, drift: [-26, -10] },
  bothVisible: { from: 1.09, drift: [0, -16] },
  ranking: { from: 1.07, drift: [18, -18] },
  excluded: { from: 1.06, drift: [-16, -14] },
  coverage: { from: 1.08, drift: [14, -16] },
  evidence: { from: 1.07, drift: [0, -20] },
  outro: { from: 1.12, drift: [0, -6] },
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

      {/* Persistent atmospheric layer — plays continuously under every scene. */}
      <CinematicBackground />

      {SCENE_ORDER.map((name) => {
        const Comp = SCENE_COMPONENTS[name];
        const cam = CAMERA[name];
        return (
          <Sequence key={name} from={sceneStart(name)} durationInFrames={SCENES[name]} name={name}>
            <Camera duration={SCENES[name]} from={cam.from} drift={cam.drift}>
              <Comp />
            </Camera>
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};
