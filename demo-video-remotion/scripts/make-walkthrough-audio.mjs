/**
 * make-walkthrough-audio.mjs — ORIGINAL music + effects stems for the
 * ~2:35 walkthrough video. Same synthesis approach as make-audio.mjs:
 * every waveform is generated from oscillators and envelopes; no samples,
 * no commercial music (see AUDIO-LICENSE.md).
 *
 * Output (44.1kHz, 16-bit stereo WAV):
 *   public/audio/walkthrough-music.wav
 *   public/audio/walkthrough-effects.wav
 *
 * Run: npm run audio:walkthrough
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const SR = 44100;
const DURATION = 155.0; // seconds — WT_TOTAL_FRAMES (4650) / FPS (30)
const N = Math.floor(SR * DURATION);
const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, "..", "public", "audio");
mkdirSync(outDir, { recursive: true });

const midiToFreq = (m) => 440 * Math.pow(2, (m - 69) / 12);
const clamp = (x) => Math.max(-1, Math.min(1, x));

// ----- Music: same warm Am–F–C–G language, cycled for the longer runtime -----
const CHORDS = [
  [57, 60, 64], // Am
  [53, 57, 60], // F
  [60, 64, 67], // C
  [55, 59, 62], // G
];
const CYCLES = 2.5; // 10 chord windows across 155s (~15.5s each)
const WINDOWS = Math.round(CHORDS.length * CYCLES);
const CHORD_LEN = DURATION / WINDOWS;
const XFADE = 1.8;

function padVoice(freq, t, detune) {
  const f = freq * Math.pow(2, detune / 1200);
  return (
    Math.sin(2 * Math.PI * f * t) * 1.0 +
    Math.sin(2 * Math.PI * f * 2 * t) * 0.22 +
    Math.sin(2 * Math.PI * f * 3 * t) * 0.09
  );
}
function chordAt(win, t, detune) {
  const notes = CHORDS[win % CHORDS.length];
  let s = 0;
  for (const n of notes) s += padVoice(midiToFreq(n), t, detune);
  s += Math.sin(2 * Math.PI * midiToFreq(notes[0] - 12) * t) * 0.5;
  return s / (notes.length + 0.5);
}

const musicL = new Float32Array(N);
const musicR = new Float32Array(N);
for (let i = 0; i < N; i++) {
  const t = i / SR;
  const win = Math.min(WINDOWS - 1, Math.floor(t / CHORD_LEN));
  const local = t - win * CHORD_LEN;
  let blend = 0;
  if (local > CHORD_LEN - XFADE && win < WINDOWS - 1) blend = (local - (CHORD_LEN - XFADE)) / XFADE;
  const cur = chordAt(win, t, +3);
  const nxt = win < WINDOWS - 1 ? chordAt(win + 1, t, +3) : cur;
  const curR = chordAt(win, t, -3);
  const nxtR = win < WINDOWS - 1 ? chordAt(win + 1, t, -3) : curR;
  const l = cur * (1 - blend) + nxt * blend;
  const r = curR * (1 - blend) + nxtR * blend;
  const trem = 0.9 + 0.1 * Math.sin(2 * Math.PI * 0.11 * t);
  let env = 1;
  if (t < 1.5) env = t / 1.5;
  if (t > DURATION - 2.5) env = Math.max(0, (DURATION - t) / 2.5);
  const g = 0.32 * trem * env;
  musicL[i] = clamp(l * g);
  musicR[i] = clamp(r * g);
}

// ----- Effects -----
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
const whoosh = (t, dur) => Math.sin(2 * Math.PI * (180 + 900 * (t / dur)) * t) * expEnv(t, dur, 5) * 0.5;
const tick = (t, dur, freq = 1200) => Math.sin(2 * Math.PI * freq * t) * expEnv(t, dur, 40) * 0.5;
const chime = (freqs) => (t, dur) => {
  let s = 0;
  freqs.forEach((f, i) => {
    const delay = i * 0.09;
    if (t > delay) s += Math.sin(2 * Math.PI * f * (t - delay)) * expEnv(t - delay, dur, 6);
  });
  return s * 0.4;
};
const boom = (t, dur) => {
  const f = 46 + 10 * Math.exp(-8 * (t / dur));
  const atk = Math.min(1, t / 0.012);
  return Math.sin(2 * Math.PI * f * t) * atk * Math.exp(-4.5 * (t / dur)) * 0.9;
};
const riser = (t, dur) => {
  const prog = t / dur;
  const f = 120 + 620 * prog * prog;
  return (Math.sin(2 * Math.PI * f * t) + Math.sin(2 * Math.PI * f * 1.005 * t)) * 0.5 * prog * prog * 0.35;
};

// Scene starts in seconds (from walkthrough-config frames / 30):
// title 0 · connect 6 · indexing 22 · ask 42 · conflict 57 · ranking 77
// coverage 93 · evidence 111 · api 131 · outro 143
const sceneStarts = [6, 22, 42, 57, 77, 93, 111, 131, 143];
sceneStarts.forEach((t, i) => addAt(t, 0.6, whoosh, 0.5, i % 2 === 0 ? -0.3 : 0.3));

// connect: click at ~12.3s (frame 190 in-scene) + confirm chime
addAt(12.33, 0.1, (t, d) => tick(t, d, 900), 0.6);
addAt(12.55, 0.9, chime([midiToFreq(72), midiToFreq(76)]), 0.6);

// indexing: soft progress ticks while the count climbs (32→39.3s), then done-chime
for (let i = 0; i < 10; i++) addAt(32 + i * 0.7, 0.1, (t, d) => tick(t, d, 1400), 0.22, i % 2 ? 0.2 : -0.2);
addAt(39.4, 1.0, chime([midiToFreq(72), midiToFreq(76), midiToFreq(79)]), 0.65);

// ask: keyboard-ish ticks while the query types (44.3–50.3s)
for (let i = 0; i < 24; i++) addAt(44.3 + i * 0.25, 0.05, (t, d) => tick(t, d, 2000 + (i % 5) * 120), 0.16, i % 2 ? 0.15 : -0.15);
addAt(52.0, 0.1, (t, d) => tick(t, d, 900), 0.5); // submit

// conflict: banner impact
addAt(58.8, 1.4, boom, 0.4);

// ranking: winner reveal
addAt(77.0, 1.6, boom, 0.5);
addAt(78.4, 0.9, chime([midiToFreq(72), midiToFreq(76), midiToFreq(79)]), 0.7);

// coverage: tally ticks (7 searched, then the excluded thunk)
for (let i = 0; i < 7; i++) addAt(94.5 + i * 0.55, 0.12, (t, d) => tick(t, d, 1500), 0.45, i % 2 ? 0.2 : -0.2);
addAt(100.4, 0.3, (t, d) => tick(t, d, 620), 0.55);

// evidence: tool pills
for (let i = 0; i < 4; i++) addAt(115.0 + i * 0.4, 0.1, (t, d) => tick(t, d, 1000 + i * 80), 0.35);

// api: line-by-line soft ticks
for (let i = 0; i < 7; i++) addAt(132.3 + i * 0.75, 0.06, (t, d) => tick(t, d, 1800), 0.18);

// outro: riser + resolve chime + closing boom
addAt(141.0, 2.0, riser, 0.4);
addAt(143.0, 2.2, boom, 0.5);
addAt(143.5, 1.5, chime([midiToFreq(69), midiToFreq(72), midiToFreq(76), midiToFreq(81)]), 0.7);

// ----- WAV encoder (16-bit PCM stereo) -----
function writeWav(path, left, right) {
  const n = left.length;
  const bytesPerSample = 2;
  const blockAlign = 2 * bytesPerSample;
  const dataSize = n * blockAlign;
  const buf = Buffer.alloc(44 + dataSize);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write("WAVE", 8);
  buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(2, 22);
  buf.writeUInt32LE(SR, 24);
  buf.writeUInt32LE(SR * blockAlign, 28);
  buf.writeUInt16LE(blockAlign, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(dataSize, 40);
  for (let i = 0; i < n; i++) {
    buf.writeInt16LE(Math.round(clamp(left[i]) * 32767), 44 + i * blockAlign);
    buf.writeInt16LE(Math.round(clamp(right[i]) * 32767), 44 + i * blockAlign + 2);
  }
  writeFileSync(path, buf);
}

writeWav(join(outDir, "walkthrough-music.wav"), musicL, musicR);
writeWav(join(outDir, "walkthrough-effects.wav"), fxL, fxR);
console.log(`Wrote walkthrough-music.wav and walkthrough-effects.wav (${DURATION}s @ ${SR}Hz)`);
