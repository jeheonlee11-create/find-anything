/**
 * make-audio.mjs — synthesizes ORIGINAL music + sound-effect stems for the
 * Find Anything demo video. No samples are downloaded and no commercial music
 * is used; every waveform is generated here from oscillators and envelopes,
 * so the audio is original and license-free (see AUDIO-LICENSE.md).
 *
 * Output (44.1kHz, 16-bit stereo WAV):
 *   public/audio/music.wav     — ambient pad bed (music stem)
 *   public/audio/effects.wav   — UI sound effects (effects stem)
 *
 * Run: npm run audio   (or: node scripts/make-audio.mjs)
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const SR = 44100;
const DURATION = 59.0; // seconds — matches TOTAL_FRAMES / FPS (1770 / 30)
const N = Math.floor(SR * DURATION);
const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, "..", "public", "audio");
mkdirSync(outDir, { recursive: true });

const midiToFreq = (m) => 440 * Math.pow(2, (m - 69) / 12);
const clamp = (x) => Math.max(-1, Math.min(1, x));

// ----- Music: Am – F – C – G pad loop, warm and calm -----
const CHORDS = [
  [57, 60, 64], // Am
  [53, 57, 60], // F
  [60, 64, 67], // C
  [55, 59, 62], // G
];
const CHORD_LEN = DURATION / CHORDS.length; // ~14.75s each
const XFADE = 1.6; // crossfade seconds between chords

function padVoice(freq, t, detune) {
  const f = freq * Math.pow(2, detune / 1200);
  // 3 partials, softening with harmonic number
  return (
    Math.sin(2 * Math.PI * f * t) * 1.0 +
    Math.sin(2 * Math.PI * f * 2 * t) * 0.22 +
    Math.sin(2 * Math.PI * f * 3 * t) * 0.09
  );
}

function chordAt(idx, t, detune) {
  const notes = CHORDS[idx];
  let s = 0;
  for (const n of notes) s += padVoice(midiToFreq(n), t, detune);
  // sub bass at the root, one octave down
  s += Math.sin(2 * Math.PI * midiToFreq(notes[0] - 12) * t) * 0.5;
  return s / (notes.length + 0.5);
}

const musicL = new Float32Array(N);
const musicR = new Float32Array(N);
for (let i = 0; i < N; i++) {
  const t = i / SR;
  const pos = t / CHORD_LEN;
  const idx = Math.min(CHORDS.length - 1, Math.floor(pos));
  const local = t - idx * CHORD_LEN;
  // crossfade into next chord near the end of each chord window
  let blend = 0;
  if (local > CHORD_LEN - XFADE && idx < CHORDS.length - 1) {
    blend = (local - (CHORD_LEN - XFADE)) / XFADE;
  }
  const cur = chordAt(idx, t, +3);
  const nxt = idx < CHORDS.length - 1 ? chordAt(idx + 1, t, +3) : cur;
  const curR = chordAt(idx, t, -3);
  const nxtR = idx < CHORDS.length - 1 ? chordAt(idx + 1, t, -3) : curR;
  let l = cur * (1 - blend) + nxt * blend;
  let r = curR * (1 - blend) + nxtR * blend;
  // slow tremolo for gentle movement
  const trem = 0.9 + 0.1 * Math.sin(2 * Math.PI * 0.13 * t);
  // global fade in/out
  let env = 1;
  if (t < 1.5) env = t / 1.5;
  if (t > DURATION - 2.2) env = Math.max(0, (DURATION - t) / 2.2);
  const g = 0.34 * trem * env;
  musicL[i] = clamp(l * g);
  musicR[i] = clamp(r * g);
}

// ----- Effects: transitions, confirm chimes, ticks -----
const fxL = new Float32Array(N);
const fxR = new Float32Array(N);
function addAt(tStart, dur, fn, gain = 1, pan = 0) {
  const start = Math.floor(tStart * SR);
  const len = Math.floor(dur * SR);
  for (let k = 0; k < len && start + k < N; k++) {
    const tt = k / SR;
    const s = fn(tt, dur) * gain;
    const lg = pan <= 0 ? 1 : 1 - pan;
    const rg = pan >= 0 ? 1 : 1 + pan;
    fxL[start + k] = clamp(fxL[start + k] + s * lg);
    fxR[start + k] = clamp(fxR[start + k] + s * rg);
  }
}
const expEnv = (t, dur, k = 18) => Math.exp(-k * (t / dur));
// soft rising "whoosh" for scene transitions
const whoosh = (t, dur) => {
  const f = 180 + 900 * (t / dur);
  return Math.sin(2 * Math.PI * f * t) * expEnv(t, dur, 5) * 0.5;
};
// gentle tick
const tick = (t, dur, freq = 1200) => Math.sin(2 * Math.PI * freq * t) * expEnv(t, dur, 40) * 0.5;
// two-note confirm chime
const chime = (freqs) => (t, dur) => {
  let s = 0;
  freqs.forEach((f, i) => {
    const delay = i * 0.09;
    if (t > delay) s += Math.sin(2 * Math.PI * f * (t - delay)) * expEnv(t - delay, dur, 6);
  });
  return s * 0.4;
};

// Scene starts (seconds) derived from config frames / 30fps
const sceneStarts = [7, 14, 21, 27, 35, 41, 47, 55];
sceneStarts.forEach((t, i) => addAt(t, 0.6, whoosh, 0.5, i % 2 === 0 ? -0.3 : 0.3));
// ranking winner confirm (~scene 5 + 5s)
addAt(40, 0.8, chime([midiToFreq(72), midiToFreq(76), midiToFreq(79)]), 0.7);
// coverage tally ticks (7 searched + 1 excluded), scene starts at 41s
for (let i = 0; i < 8; i++) addAt(42.2 + i * 0.18, 0.12, (t, d) => tick(t, d, i === 7 ? 720 : 1500), 0.5, i % 2 ? 0.2 : -0.2);
// evidence feature pills, scene starts 47s
for (let i = 0; i < 8; i++) addAt(50.4 + i * 0.12, 0.1, (t, d) => tick(t, d, 1000 + i * 60), 0.35);
// outro resolve chime at 55s
addAt(55.4, 1.4, chime([midiToFreq(69), midiToFreq(72), midiToFreq(76), midiToFreq(81)]), 0.7);

// ----- WAV encoder (16-bit PCM stereo) -----
function writeWav(path, left, right) {
  const n = left.length;
  const buf = Buffer.alloc(44 + n * 4);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + n * 4, 4);
  buf.write("WAVE", 8);
  buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20); // PCM
  buf.writeUInt16LE(2, 22); // channels
  buf.writeUInt32LE(SR, 24);
  buf.writeUInt32LE(SR * 4, 28); // byte rate
  buf.writeUInt16LE(4, 32); // block align
  buf.writeUInt16LE(16, 34); // bits
  buf.write("data", 36);
  buf.writeUInt32LE(n * 4, 40);
  let o = 44;
  for (let i = 0; i < n; i++) {
    buf.writeInt16LE(Math.round(clamp(left[i]) * 32767), o);
    buf.writeInt16LE(Math.round(clamp(right[i]) * 32767), o + 2);
    o += 4;
  }
  writeFileSync(path, buf);
}

writeWav(join(outDir, "music.wav"), musicL, musicR);
writeWav(join(outDir, "effects.wav"), fxL, fxR);
console.log(`Wrote ${DURATION}s stems -> ${outDir}/music.wav, effects.wav`);
