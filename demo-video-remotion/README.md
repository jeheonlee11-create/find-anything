# Find Anything — demo video (React + Remotion)

A new **1920×1080 · 16:9 · 30fps · 59s** product demo of the synthetic Acme AI
pricing-conflict story. Standalone project — it does **not** touch the main app,
and does **not** overwrite the previously approved videos
(`../public/find-anything-demo.mp4`, `~/Downloads/FindAnything Demo Video.mov`).

## Deliverables (in `out/` and `public/audio/`)
| File | What |
|------|------|
| `out/find-anything-demo-1080p.mp4` | Final 1080p, H.264 + AAC (music + effects) |
| `out/find-anything-demo-silent.mp4` | Silent 1080p (understandable via on-screen cards) |
| `out/find-anything-demo-preview.mp4` | Low-res 0.5× preview |
| `out/thumbnail.png` | Poster frame (scene 4) |
| `out/find-anything-demo.srt` | Subtitles / narrative cards |
| `public/audio/music.wav` | Music stem (original) |
| `public/audio/effects.wav` | Effects stem (original) |
| `STORYBOARD.md` | Timestamped storyboard |
| `AUDIO-LICENSE.md` | Audio source & license record |

## Cinematic layer
A persistent `CinematicBackground` (drifting particles, an orbiting lime glow, a
diagonal sheen, vignette, and tiled film grain) plays continuously under every
scene. Each scene runs through a virtual `Camera` (slow push-in + drift + a soft
focus-dissolve on entry/exit), and headlines blur-in kinetically. Audio adds
sub-boom impacts on the key reveals and a riser into the outro. See
`src/components/cinematic.tsx`.

## Edit
- **Timing & copy:** `src/config.ts` (`SCENES` frame counts + `COPY`). Everything
  on screen is driven from here.
- **Look:** `src/theme.ts` (brand tokens), `src/components/ui.tsx` (shared parts).
- **Scenes:** `src/scenes.tsx` (one component per beat).
- **Audio:** `scripts/make-audio.mjs` (chords, events, gains).

## Run / render
```bash
npm install                 # already installed here
npm run audio               # (re)generate original music + effects stems
npm run studio              # interactive editor at http://localhost:3000
npm run render              # → out/find-anything-demo-1080p.mp4 (with audio)
npm run render:silent       # → out/find-anything-demo-silent.mp4
npm run render:preview      # → out/find-anything-demo-preview.mp4 (0.5×)
npm run thumbnail           # → out/thumbnail.png
```
Rendering uses Remotion's bundled headless Chromium + ffmpeg (downloaded on
first render). No network assets are required at render time.

## Validation performed
- ffprobe: 59.05s, 1920×1080 (DAR 16:9), 30fps H.264 + AAC 48kHz stereo.
- Representative frames inspected (hook → outro): large readable copy, no black
  frames, on-brand.
- Audio mixed peak ≈ −3.5 dBFS → no clipping.
- Contradiction preserved throughout ($95k/$20k draft stays visible beside the
  $120k/$25k final); no unsupported product claims; synthetic Acme AI data only;
  no voiceover; original audio only.

## Walkthrough composition (added later)

`FindAnythingWalkthrough` — a ~2:35 literal product walkthrough (connect →
index → ask → conflict → ranking → coverage → evidence → API → outro) for
"attach a demo, ≤3 min" contexts. The 59s `FindAnythingDemo` is unchanged.

- Timing/copy: `src/walkthrough-config.ts` · scenes: `src/walkthrough-scenes.tsx`
- Storyboard: `WALKTHROUGH-STORYBOARD.md` · subtitles: `out/find-anything-walkthrough.srt`
- Audio stems: `npm run audio:walkthrough` (original, synthesized)
- Render: `npm run render:walkthrough` / `render:walkthrough:silent` / `render:walkthrough:preview` / `thumbnail:walkthrough`
