# Find Anything — marketing site (original)

A polished, self-contained marketing experience for Find Anything, built as
static HTML/CSS/JS so it runs anywhere and never touches the authenticated
application (`/app`, `/admin`, OAuth, workspace APIs, indexing).

## Positioning
**Trusted knowledge for AI agents.** Find Anything is a permission-aware
retrieval control layer: it shows agents what they found, what they missed,
where sources conflict, why one source ranked higher, and when retrieval should
not be trusted.

## Run locally
No build step. Serve the folder with any static server:

```bash
cd marketing-site
python3 -m http.server 8787 --bind 127.0.0.1
# open http://localhost:8787/index.html
```

## Pages
- `index.html` — hero, problem narrative, Acme AI conflict demo, coverage &
  permission demo, evidence & citation demo, capabilities, developer/API,
  security, connectors (Drive = Available, others = Planned), request-access CTA.
- `docs.html` — how it works, the retrieval response shape, coverage, conflicts,
  confidence, replay/receipts/diffs, boundaries.
- `privacy.html`, `security.html` — posture summaries.

## Design & accessibility
- Brand DNA carried from `app/marketing.css` (lime accent, paper, amber,
  monospace data labels, oversized tight display type) — original layout/copy.
- **Dark + light themes** with a persisted toggle; respects
  `prefers-color-scheme`.
- **Responsive** desktop → mobile (hamburger menu, no horizontal overflow at
  375px — verified `scrollWidth === clientWidth`).
- **WCAG AA** contrast verified for all text tokens (light `--faint` tuned to
  clear 4.5:1).
- **Keyboard**: skip link, visible focus rings, semantic landmarks.
- **Reduced motion**: all reveal/stagger animations collapse under
  `prefers-reduced-motion: reduce`; content is fully visible with JS disabled.
- Optimized loading: inline SVG favicon, no external fonts/scripts/images, CSS
  preloaded.

## Content discipline
- Every example uses **synthetic Acme AI** data. No real names, emails, file
  paths, tokens, workspace IDs, queries, or document contents appear anywhere.
- No claims of factual correctness, universal completeness, or unsupported
  integrations. Planned connectors are labeled Planned. Google Drive is
  described as built and working in private beta, pending Google
  restricted-scope verification — never as publicly available.
- The hero receipt animation is labeled **illustrative**.

## Access-request form

The form targets the application's real waitlist API
(`POST /api/beta/waitlist` — see `app/api/beta/waitlist/route.ts`) and only
claims success when the server returns its 202 confirmation. States covered:
inline validation, submitting (button disabled), server-confirmed success,
server error (400/413/429/503 messages), network error, and a same-session
duplicate guard (the API itself hides duplicates from the client by design).

Activation is one attribute — no secrets are involved:

```html
<meta name="fa-waitlist-endpoint" content="/api/beta/waitlist" />
```

- Serve the page from the application origin and use the relative path above, or
- set a full URL if the app origin explicitly allows cross-origin requests.

When the meta value is **empty** (static hosting with no backend), the form
does not pretend: a valid submission opens a prefilled **mailto** to
`hello@findanything.dev` and says exactly that.

## Verified during build
- Desktop (dark + light) and mobile 375px visually inspected via the browser.
- No console errors. No horizontal overflow. Theme toggle, mobile menu, scroll
  reveals, confidence bar, and form all functioning.
