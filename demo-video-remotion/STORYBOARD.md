# Find Anything demo — timestamped storyboard

- **Resolution:** 1920×1080 · **Aspect:** 16:9 · **FPS:** 30 · **Length:** 59.0s (1770 frames)
- **Data:** synthetic "Acme AI" only. No real names, emails, paths, tokens, workspace IDs, queries, or contents.
- **Timing & copy** are all driven from `src/config.ts` (`SCENES` + `COPY`) — edit there to re-time or re-word.

| # | Scene | Frames | Time | On-screen copy | Motion |
|---|-------|--------|------|----------------|--------|
| 1 | Hook | 0–210 | 00:00–00:07 | Kicker "AN AI AGENT ASKS" → "What is Acme AI's current enterprise price?" → "finds two documents. They disagree." + two mini-doc chips | Kicker/heading rise; cursor eases to the two doc chips |
| 2 | Draft | 210–420 | 00:07–00:14 | `Pricing Draft.pdf` card — $95,000/yr, $20,000 impl — "kept · not authoritative" · "One document is an early draft." | Card springs up from left; figures settle |
| 3 | Final | 420–630 | 00:14–00:21 | `Pricing Final.pdf` card — $120,000/yr, $25,000 impl — "✓ approved · authoritative" · "The other is the approved final." | Card springs up from right (lime) |
| 4 | Both visible | 630–810 | 00:21–00:27 | "Both stay visible." + both cards + vertical "conflict" marker + "Nothing is hidden. The contradiction is reported…" | Cards slide in; conflict marker pulses |
| 5 | Ranking | 810–1050 | 00:27–00:35 | "One source governs." + 3 checks: Newer / Approved / Explicitly authoritative + "Pricing Final.pdf governs" | Reasons stagger in; winner badge pops |
| 6 | Excluded | 1050–1230 | 00:35–00:41 | "One source can't be read." + `Finance — Model.xlsx` (RESTRICTED · out of scope) "excluded" + "contents are never exposed." | Lock row rises; amber accents |
| 7 | Coverage | 1230–1410 | 00:41–00:47 | "Coverage is accounted for." + `7 / 8` + 8 tiles (7 ✓ lime, 1 ✕ amber) + "8 known · 7 searched · 1 excluded" | Big number rises; tiles pop one-by-one |
| 8 | Evidence | 1410–1650 | 00:47–00:55 | "Every answer carries its evidence." + answer `$120,000/yr + $25,000` [1][2] + confidence bar (Medium) + 8 pills: Citations, Source links, Confidence, Coverage, Trace, Replay, Receipt, Diff | Answer card rises; confidence bar fills; pills stagger |
| 9 | Outro | 1650–1770 | 00:55–00:59 | Logo "Find Anything" + "Trusted knowledge for AI agents." + footnote (evidence not advice; synthetic demo) | Logo scales in with soft glow; tagline + footnote rise; held to end |

**Transitions:** 14-frame fade-through-background at each scene boundary (`TRANSITION` in `config.ts`).

**Thumbnail:** frame 760 (scene 4, "Both stay visible") → `out/thumbnail.png`.

**Contradiction is preserved throughout** — the draft's $95,000/$20,000 stays on screen alongside the final's $120,000/$25,000; the video never claims which number is objectively "true", only which source is authoritative.
