# Find Anything — Walkthrough video storyboard

Composition: `FindAnythingWalkthrough` · 1920×1080 · 30fps · 4,650 frames = **2:35**
Fits "3 minutes / 100 MB" demo-attachment limits. The 59s brand demo
(`FindAnythingDemo`) is untouched; this is a separate, more literal
product walkthrough. All data synthetic (fictional Acme AI).

| # | Scene | Time | Frames | What's on screen |
|---|-------|------|--------|------------------|
| 1 | title | 0:00–0:06 | 0–180 | "How Find Anything works" + kicker |
| 2 | connect | 0:06–0:22 | 180–660 | App window; cursor clicks **Connect Google Drive** (click at ~0:12.3); "connected" check + read-only/permission/revocable pills |
| 3 | indexing | 0:22–0:42 | 660–1260 | Stage list (connecting → verifying → discovering → discovery complete 1,294 → indexing X of Y); discovered counter 0→1,294 (0:24–0:30); processed counter + progress bar 0→1,294 (0:32–0:39); "close this tab" note |
| 4 | ask | 0:42–0:57 | 1260–1710 | Search box; query types character-by-character (0:44–0:50); submit at 0:52; "searching 7 permitted sources" |
| 5 | conflict | 0:57–1:17 | 1710–2310 | Draft ($95k/$20k, KEPT) vs Final ($120k/$25k, RANKS HIGHER) doc cards; CONFLICT DETECTED banner |
| 6 | ranking | 1:17–1:33 | 2310–2790 | Winner card RANK 1 · AUTHORITATIVE + three reasons (newer / approved / marked authoritative) |
| 7 | coverage | 1:33–1:51 | 2790–3330 | Source list ticks through 7 SEARCHED (1:34.5–1:40); Finance — Model.xlsx RESTRICTED row (1:40.4); 7/8 tally |
| 8 | evidence | 1:51–2:11 | 3330–3930 | Governing answer card; confidence bar fills to Medium (1:53–1:56); trace steps 1–3; Trace/Replay/Receipt/Diff pills |
| 9 | api | 2:11–2:23 | 3930–4290 | POST /v1/retrieve response JSON typed line-by-line |
| 10 | outro | 2:23–2:35 | 4290–4650 | Logo + "Trusted knowledge for AI agents." + boundaries footnote (12s hold) |

## Audio (original, synthesized — see AUDIO-LICENSE.md)
- `public/audio/walkthrough-music.wav` — Am–F–C–G pad, 155s, fade in/out.
- `public/audio/walkthrough-effects.wav` — scene whooshes; connect click+chime
  (0:12.3/0:12.6); indexing progress ticks (0:32–0:39) + completion chime (0:39.4);
  typing ticks (0:44.3–0:50.3) + submit (0:52); conflict boom (0:58.8); ranking
  boom+chime (1:17/1:18.4); coverage tally ticks (1:34.5+) + low excluded thunk
  (1:40.4); tool-pill ticks (1:55+); API line ticks (2:12.3+); riser (2:21) +
  outro boom/chime (2:23/2:23.5).
- Generator: `npm run audio:walkthrough` (deterministic; no samples).

## Copy & timing
Single source of truth: `src/walkthrough-config.ts` (`WT_SCENES` for durations,
`WT_COPY` for every on-screen string). Retime or reword there only.

## Render commands
```bash
cd demo-video-remotion
npm run audio:walkthrough           # regenerate stems if config timing changes
npm run render:walkthrough          # out/find-anything-walkthrough-1080p.mp4
npm run render:walkthrough:silent   # silent version (captions carry the story)
npm run render:walkthrough:preview  # half-res preview
npm run thumbnail:walkthrough       # out/walkthrough-thumbnail.png
```

Subtitles: `out/find-anything-walkthrough.srt` (17 cues, mirrors captions).

## Claims discipline
Read-only scope, permission-aware, revocable; DB-backed progress; both
conflicting values preserved; ranking explained not asserted; excluded source
acknowledged without content; Google Drive available today, other connectors
planned; synthetic data; "not legal or financial advice" in the outro.
