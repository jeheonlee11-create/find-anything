/**
 * make-promo-audio.mjs — synthesizes the ORIGINAL 45s promo score + SFX stems.
 * Same policy as make-audio.mjs: every waveform is generated from oscillators
 * and envelopes right here; no samples, no stock music, no voiceover
 * (see AUDIO-LICENSE.md).
 *
 * Musical brief: cinematic minimalist electronica, 118 BPM, four sections —
 *   0–8s    sub drone + ticking pulse (tension)
 *   8–22s   the drop: four-on-the-floor kick, offbeat hat, driving bass,
 *           analog-style plucked arpeggio
 *   22–35s  uplifting Am–F–C–G progression, soft kick, gentle bell accents
 *   35–45s  beat drops out; warm Am(add9) pad, clean resonant finish
 *
 * SFX cue frames come from src/promo/audio-cues.json — the same file the
 * Remotion code reads — so the stems and the visuals cannot drift apart.
 *
 * Output (44.1kHz, 16-bit stereo WAV):
 *   public/audio/promo-music.wav
 *   public/audio/promo-effects.wav
 *
 * Run: npm run audio:promo
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const cueSheet = JSON.parse(
  readFileSync(join(here, "..", "src", "promo", "audio-cues.json"), "utf8"),
);
const FPS = cueSheet.fps;
const BPM = cueSheet.bpm;
const CUES = cueSheet.cues;

const SR = 44100;
const DURATION = 45.0;
const N = Math.floor(SR * DURATION);
const BEAT = 60 / BPM; // 0.5085s
const outDir = join(here, "..", "public", "audio");
mkdirSync(outDir, { recursive: true });

const midiToFreq = (m) => 440 * Math.pow(2, (m - 69) / 12);
const clamp = (x) => Math.max(-1, Math.min(1, x));
const frameToSec = (f) => f / FPS;

/* ------------------------------------------------------------ tiny toolkit */

/** Deterministic noise so renders are reproducible. */
let noiseState = 22222;
const noise = () => {
  noiseState = (noiseState * 1664525 + 1013904223) >>> 0;
  return noiseState / 2147483648 - 1;
};
const noiseBuf = new Float32Array(SR * 2);
for (let i = 0; i < noiseBuf.length; i++) noiseBuf[i] = noise();
const nz = (i) => noiseBuf[i % noiseBuf.length];

const env = (t, a, d, s = 0, r = 0.001, dur = a + d) => {
  if (t < 0) return 0;
  if (t < a) return t / a;
  if (t < a + d) return 1 - (1 - s) * ((t - a) / d);
  if (t < dur) return s;
  return Math.max(0, s * (1 - (t - dur) / r));
};

/* ------------------------------------------------------------------- music */

const L = new Float32Array(N);
const R = new Float32Array(N);
const add = (i, l, r) => {
  if (i >= 0 && i < N) {
    L[i] += l;
    R[i] += r;
  }
};

const S1 = 8; // drop
const S2 = 22; // evidence
const S3 = 35; // outro
const sectionGain = (t) =>
  t < S1 ? 1 : t < S2 ? 1 : t < S3 ? 0.92 : 1;

// -- Section 1+: sub drone (A1), breathing, present until the outro pad.
for (let i = 0; i < N; i++) {
  const t = i / SR;
  if (t >= S3) break;
  const f = 55 * (1 + 0.003 * Math.sin(2 * Math.PI * 0.11 * t));
  const breathe = 0.72 + 0.28 * Math.sin(2 * Math.PI * 0.07 * t + 1);
  const fadeIn = Math.min(1, t / 1.4);
  const duck = t > S1 - 0.35 && t < S1 ? (S1 - t) / 0.35 : 1; // pre-drop gap
  const post = t >= S1 ? 0.55 : 1; // drone sits lower once the kit runs
  const s = Math.sin(2 * Math.PI * f * t) * 0.3 * breathe * fadeIn * duck * post;
  add(i, s, s);
}

// -- Section 1: ticking pulse on every beat, sparse and dry.
for (let b = 0; frameToSec(0) + b * BEAT < S1 - 0.05; b++) {
  const t0 = b * BEAT;
  const start = Math.floor(t0 * SR);
  const veloc = b % 4 === 0 ? 0.5 : 0.3;
  for (let j = 0; j < SR * 0.05; j++) {
    const t = j / SR;
    const e = env(t, 0.001, 0.045);
    const s = (Math.sin(2 * Math.PI * 2050 * t) * 0.5 + nz(j) * 0.4) * e * 0.16 * veloc;
    add(start + j, s * 0.8, s * 1.1); // ticks lean right
  }
}

// -- Sections 2+3: kick, hat, bass, arpeggio.
const kick = (start, gain) => {
  for (let j = 0; j < SR * 0.28; j++) {
    const t = j / SR;
    const f = 92 * Math.pow(0.42, t * 9) + 44;
    const e = env(t, 0.002, 0.26);
    const s = Math.sin(2 * Math.PI * f * t) * e * gain;
    add(start + j, s, s);
  }
};
const hat = (start, gain) => {
  for (let j = 0; j < SR * 0.06; j++) {
    const t = j / SR;
    const e = env(t, 0.001, 0.055);
    const s = (nz(j + 977) - nz(j + 976) * 0.5) * e * gain;
    add(start + j, s * 0.7, s);
  }
};
const bassNote = (start, midi, len, gain) => {
  const f = midiToFreq(midi);
  for (let j = 0; j < SR * len; j++) {
    const t = j / SR;
    const e = env(t, 0.004, len - 0.02, 0.4, 0.05, len);
    // Saw-ish: fundamental + 2 partials, lowpassed feel via partial rolloff.
    const s =
      (Math.sin(2 * Math.PI * f * t) +
        0.4 * Math.sin(2 * Math.PI * f * 2 * t) +
        0.12 * Math.sin(2 * Math.PI * f * 3 * t)) *
      e *
      gain;
    add(start + j, s, s);
  }
};
const pluck = (start, midi, gain, pan = 0) => {
  const f = midiToFreq(midi);
  for (let j = 0; j < SR * 0.34; j++) {
    const t = j / SR;
    const e = env(t, 0.002, 0.3);
    const bright = Math.pow(0.5, t * 14); // closing filter
    const s =
      (Math.sin(2 * Math.PI * f * t) +
        0.55 * bright * Math.sin(2 * Math.PI * f * 2 * t) +
        0.3 * bright * Math.sin(2 * Math.PI * f * 3 * t) +
        0.15 * bright * Math.sin(2 * Math.PI * f * 4 * t)) *
      e *
      gain;
    add(start + j, s * (1 - pan) * 0.9, s * (1 + pan) * 0.9);
  }
};

const ARP = [57, 60, 64, 67, 64, 60, 69, 64]; // Am pentatonic ride
for (let b = 0; ; b++) {
  const t0 = S1 + b * BEAT;
  if (t0 >= S3 - 0.05) break;
  const inEvidence = t0 >= S2;
  const start = Math.floor(t0 * SR);
  kick(start, inEvidence ? 0.5 : 0.66);
  hat(Math.floor((t0 + BEAT / 2) * SR), inEvidence ? 0.1 : 0.16);
  // Driving bass: root eighths, A with passing G/F under the later chords.
  const root = !inEvidence ? 33 : [33, 29, 36, 31][Math.floor((t0 - S2) / (2 * BEAT)) % 4];
  bassNote(start, root, BEAT * 0.48, inEvidence ? 0.2 : 0.3);
  bassNote(Math.floor((t0 + BEAT / 2) * SR), root, BEAT * 0.4, inEvidence ? 0.13 : 0.22);
  // Arpeggio sixteenths through the drop; halves in the evidence section.
  const steps = inEvidence ? 2 : 4;
  for (let s16 = 0; s16 < steps; s16++) {
    const ts = t0 + (s16 * BEAT) / 4;
    pluck(
      Math.floor(ts * SR),
      ARP[(b * 4 + s16) % ARP.length] + (inEvidence ? 12 : 0),
      inEvidence ? 0.1 : 0.17,
      s16 % 2 === 0 ? -0.35 : 0.35,
    );
  }
}

// -- Section 3: uplifting pads (Am F C G), and Section 4: Am(add9) resolve.
const PADS = [
  { t0: S2, t1: S2 + 3.25, notes: [57, 60, 64, 71] },
  { t0: S2 + 3.25, t1: S2 + 6.5, notes: [53, 57, 60, 69] },
  { t0: S2 + 6.5, t1: S2 + 9.75, notes: [55, 60, 64, 72] },
  { t0: S2 + 9.75, t1: S3, notes: [55, 59, 62, 71] },
  { t0: S3, t1: DURATION - 0.2, notes: [45, 57, 60, 64, 71] }, // Am(add9), low root
];
for (const pad of PADS) {
  const len = pad.t1 - pad.t0;
  const start = Math.floor(pad.t0 * SR);
  const outro = pad.t0 >= S3;
  for (let j = 0; j < SR * len; j++) {
    const t = j / SR;
    const e = env(t, outro ? 1.6 : 0.9, len - (outro ? 2.6 : 1.4), 0.82, outro ? 2.4 : 0.9, len);
    let l = 0;
    let r = 0;
    for (let k = 0; k < pad.notes.length; k++) {
      const f = midiToFreq(pad.notes[k]);
      const det = 1 + (k % 2 === 0 ? 0.0012 : -0.0012);
      const vib = 1 + 0.0018 * Math.sin(2 * Math.PI * 0.9 * (t + k));
      const v =
        Math.sin(2 * Math.PI * f * det * vib * (t + pad.t0)) +
        0.2 * Math.sin(2 * Math.PI * f * 2 * det * (t + pad.t0));
      if (k % 2 === 0) l += v;
      else r += v;
    }
    const g = (outro ? 0.2 : 0.12) * e;
    add(start + j, l * g, r * g);
  }
}

// -- Gentle bell accents on evidence-section downbeats (not the SFX chime).
for (let k = 0; k < 4; k++) {
  const t0 = S2 + k * 3.25;
  const start = Math.floor(t0 * SR);
  const f = midiToFreq([76, 74, 79, 78][k]);
  for (let j = 0; j < SR * 1.1; j++) {
    const t = j / SR;
    const e = env(t, 0.004, 1.05);
    const s = (Math.sin(2 * Math.PI * f * t) + 0.35 * Math.sin(2 * Math.PI * f * 2.01 * t)) * e * 0.05;
    add(start + j, s * 0.8, s);
  }
}

// Master: section gain + soft clip.
for (let i = 0; i < N; i++) {
  const g = sectionGain(i / SR);
  L[i] = clamp(Math.tanh(L[i] * 1.15 * g));
  R[i] = clamp(Math.tanh(R[i] * 1.15 * g));
}

/* --------------------------------------------------------------------- sfx */

const EL = new Float32Array(N);
const ER = new Float32Array(N);
const addFx = (i, l, r) => {
  if (i >= 0 && i < N) {
    EL[i] += l;
    ER[i] += r;
  }
};

// Kinetic text ticks.
for (const f of CUES.textTicks) {
  const start = Math.floor(frameToSec(f) * SR);
  for (let j = 0; j < SR * 0.07; j++) {
    const t = j / SR;
    const e = env(t, 0.001, 0.06);
    const s = (Math.sin(2 * Math.PI * 1500 * t) * 0.6 + Math.sin(2 * Math.PI * 2250 * t) * 0.3) * e * 0.3;
    addFx(start + j, s, s);
  }
}

// Drop impact: reverse noise swell into a sub boom.
{
  const impact = frameToSec(CUES.dropImpact);
  const swellStart = Math.floor((impact - 0.55) * SR);
  for (let j = 0; j < SR * 0.55; j++) {
    const t = j / SR;
    const e = Math.pow(t / 0.55, 2.4);
    const s = nz(j + 5000) * e * 0.22;
    addFx(swellStart + j, s, s);
  }
  const start = Math.floor(impact * SR);
  for (let j = 0; j < SR * 0.7; j++) {
    const t = j / SR;
    const f = 82 * Math.pow(0.4, t * 5) + 42;
    const e = env(t, 0.001, 0.65);
    const s = Math.sin(2 * Math.PI * f * t) * e * 0.85 + nz(j) * env(t, 0.001, 0.05) * 0.25;
    addFx(start + j, s, s);
  }
}

// Mouse glide (airy band of noise) resolving into a tactile click.
{
  const glide0 = frameToSec(CUES.uiGlideStart);
  const glideLen = frameToSec(CUES.uiClick) - glide0;
  const start = Math.floor(glide0 * SR);
  for (let j = 0; j < SR * glideLen; j++) {
    const t = j / SR;
    const shape = Math.sin((Math.PI * t) / glideLen);
    const s = (nz(j + 9000) + nz(j + 9001)) * 0.5 * shape * 0.07;
    addFx(start + j, s * (1 - t / glideLen), s * (0.6 + (0.7 * t) / glideLen));
  }
  const click = Math.floor(frameToSec(CUES.uiClick) * SR);
  for (let j = 0; j < SR * 0.09; j++) {
    const t = j / SR;
    const e = env(t, 0.0008, 0.028);
    const body = env(t, 0.002, 0.08);
    const s = (nz(j + 40) * 0.5 + Math.sin(2 * Math.PI * 640 * t) * 0.5) * e * 0.5 + Math.sin(2 * Math.PI * 210 * t) * body * 0.18;
    addFx(click + j, s, s);
  }
}

// Success chime: two-note bell (E5 → A5) with a soft shimmer ring.
{
  const start = Math.floor(frameToSec(CUES.successChime) * SR);
  const bell = (offset, midi, gain) => {
    const f = midiToFreq(midi);
    for (let j = 0; j < SR * 1.0; j++) {
      const t = j / SR;
      const e = env(t, 0.003, 0.95);
      const s =
        (Math.sin(2 * Math.PI * f * t) +
          0.4 * Math.sin(2 * Math.PI * f * 2.02 * t) +
          0.18 * Math.sin(2 * Math.PI * f * 2.99 * t)) *
        e *
        gain;
      addFx(start + offset + j, s * 0.85, s);
    }
  };
  bell(0, 76, 0.3);
  bell(Math.floor(SR * 0.13), 81, 0.34);
}

// Final air swoosh on the pullback.
{
  const start = Math.floor(frameToSec(CUES.airSwoosh) * SR);
  const len = 1.25;
  for (let j = 0; j < SR * len; j++) {
    const t = j / SR;
    const shape = Math.sin((Math.PI * t) / len);
    // Two detuned noise reads make it feel like moving air, not static.
    const s = (nz(j + 14000) * 0.6 + nz(Math.floor(j * 0.61) + 20000) * 0.4) * shape * shape * 0.24;
    addFx(start + j, s * (1 + 0.4 * Math.sin(t * 3)), s * (1 - 0.4 * Math.sin(t * 3)));
  }
}

for (let i = 0; i < N; i++) {
  EL[i] = clamp(EL[i]);
  ER[i] = clamp(ER[i]);
}

/* --------------------------------------------------------------- wav write */

function writeWav(path, l, r) {
  const bytesPerSample = 2;
  const blockAlign = 2 * bytesPerSample;
  const dataSize = l.length * blockAlign;
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
  for (let i = 0; i < l.length; i++) {
    buf.writeInt16LE(Math.round(clamp(l[i]) * 32767), 44 + i * blockAlign);
    buf.writeInt16LE(Math.round(clamp(r[i]) * 32767), 46 + i * blockAlign);
  }
  writeFileSync(path, buf);
  console.log("wrote", path, `${(buf.length / 1e6).toFixed(1)}MB`);
}

writeWav(join(outDir, "promo-music.wav"), L, R);
writeWav(join(outDir, "promo-effects.wav"), EL, ER);
