/**
 * Promo audio: the beat grid, the SFX cue sheet, and the music volume
 * envelope. `audio-cues.json` is the single source of truth — the WAV
 * generator (scripts/make-promo-audio.mjs) bakes stems from the same file,
 * so a retimed cue only ever changes in one place.
 */
import cueSheet from "./audio-cues.json";
import { PROMO_TOTAL_FRAMES } from "./promo-config";

export const BPM: number = cueSheet.bpm;
/** Frames per beat at 30fps · 118 BPM ≈ 15.25 frames. */
export const BEAT_F = (60 / BPM) * cueSheet.fps;
/** Snap a beat count to its frame on the grid. */
export const beat = (n: number) => Math.round(n * BEAT_F);

export const CUES = cueSheet.cues;

/**
 * Music bed envelope, frame → gain.
 * Sparse and low before the drop; full punch AT the drop (frame 240); subtle
 * dips while dense UI is on screen (rows + cursor work, then the receipt);
 * the outro pad carries near full until the final fade.
 */
export function musicVolume(frame: number): number {
  const points: [number, number][] = [
    [0, 0.5],
    [220, 0.62], // tension rises into the drop
    [239, 0.66],
    [240, 1.0], // the drop lands at full punch
    [300, 0.88],
    [470, 0.86],
    [500, 0.66], // dip under the glide + click micro-interaction
    [560, 0.84],
    [700, 0.8],
    [724, 0.66], // dip under the receipt/verification beat
    [800, 0.84],
    [1040, 0.86],
    [1060, 0.92], // pad-only outro breathes
    [PROMO_TOTAL_FRAMES - 36, 0.9],
    [PROMO_TOTAL_FRAMES - 1, 0],
  ];
  for (let i = 0; i < points.length - 1; i++) {
    const [f0, v0] = points[i];
    const [f1, v1] = points[i + 1];
    if (frame >= f0 && frame <= f1)
      return v0 + ((frame - f0) / Math.max(1, f1 - f0)) * (v1 - v0);
  }
  return frame < 0 ? points[0][1] : 0;
}
