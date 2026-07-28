import React from "react";
import { interpolate, useCurrentFrame } from "remotion";
import { theme } from "./theme";
import { WT_COPY, WT_SCENES } from "./walkthrough-config";
import { BigText, Cursor, DocCard, Frame, Kicker, Pill, Rise } from "./components/ui";
import { Words } from "./components/cinematic";

/* ---------- shared walkthrough furniture ---------- */

/** Large readable caption card pinned to the bottom — works without narration. */
const Caption: React.FC<{ text: string; delay?: number }> = ({ text, delay = 8 }) => (
  <div style={{ position: "absolute", left: 0, right: 0, bottom: 64, display: "flex", justifyContent: "center", zIndex: 40 }}>
    <Rise delay={delay} y={26}>
      <div
        style={{
          maxWidth: 1360,
          padding: "22px 38px",
          borderRadius: 16,
          border: `1px solid ${theme.line2}`,
          background: "rgba(16,19,15,0.88)",
          fontSize: 33,
          lineHeight: 1.45,
          color: theme.ink,
          textAlign: "center",
          boxShadow: "0 24px 70px rgba(0,0,0,.55)",
        }}
      >
        {text}
      </div>
    </Rise>
  </div>
);

/** Step eyebrow, top-left. */
const StepTag: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div style={{ position: "absolute", top: 64, left: 96 }}>
    <Kicker>{children}</Kicker>
  </div>
);

/** Mock app window with browser chrome. */
const AppWindow: React.FC<{ url: string; children: React.ReactNode; delay?: number; height?: number }> = ({
  url,
  children,
  delay = 4,
  height = 640,
}) => (
  <Rise delay={delay} y={70}>
    <div
      style={{
        width: 1440,
        borderRadius: 22,
        border: `2px solid ${theme.line2}`,
        background: theme.panel,
        overflow: "hidden",
        boxShadow: "0 50px 140px rgba(0,0,0,.6)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 14,
          padding: "18px 26px",
          borderBottom: `1px solid ${theme.line}`,
          background: theme.bg2,
        }}
      >
        <span style={{ width: 16, height: 16, borderRadius: 99, background: theme.danger, opacity: 0.9 }} />
        <span style={{ width: 16, height: 16, borderRadius: 99, background: theme.amber, opacity: 0.9 }} />
        <span style={{ width: 16, height: 16, borderRadius: 99, background: theme.lime, opacity: 0.9 }} />
        <div
          style={{
            marginLeft: 22,
            flex: 1,
            fontFamily: theme.mono,
            fontSize: 24,
            color: theme.muted,
            border: `1px solid ${theme.line}`,
            borderRadius: 10,
            padding: "10px 20px",
            background: theme.bg,
            display: "flex",
            alignItems: "center",
            gap: 12,
          }}
        >
          <LockTiny /> {url}
        </div>
      </div>
      <div style={{ height, position: "relative", padding: 48 }}>{children}</div>
    </div>
  </Rise>
);

const LockTiny: React.FC = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
    <path d="M7 10V8a5 5 0 1 1 10 0v2M6 10h12v10H6z" stroke={theme.lime} strokeWidth="1.8" />
  </svg>
);

const Tick: React.FC<{ on?: boolean }> = ({ on = true }) => (
  <span
    style={{
      width: 34,
      height: 34,
      borderRadius: "50%",
      display: "grid",
      placeItems: "center",
      fontSize: 20,
      fontWeight: 800,
      background: on ? theme.lime : "transparent",
      border: on ? "none" : `2px solid ${theme.line2}`,
      color: on ? theme.bg : theme.faint,
    }}
  >
    {on ? "✓" : ""}
  </span>
);

/* ---------- scenes ---------- */

export const WtTitle: React.FC = () => (
  <Frame>
    <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", gap: 34, textAlign: "center" }}>
      <Kicker>{WT_COPY.title.kicker}</Kicker>
      <Words text={WT_COPY.title.line} size={124} delay={10} style={{ justifyContent: "center", maxWidth: 1500 }} />
      <Rise delay={34} y={24}>
        <div style={{ fontSize: 40, color: theme.muted }}>{WT_COPY.title.sub}</div>
      </Rise>
    </div>
  </Frame>
);

export const WtConnect: React.FC = () => {
  const frame = useCurrentFrame();
  const c = WT_COPY.connect;
  const clicked = frame >= 190;
  return (
    <Frame>
      <StepTag>{c.step}</StepTag>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 40, paddingBottom: 120 }}>
        <BigText size={78} delay={8}>{c.title}</BigText>
        <AppWindow url={c.url} delay={20} height={520}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 44 }}>
            {!clicked ? (
              <Rise delay={30}>
                <div
                  style={{
                    padding: "26px 52px",
                    borderRadius: 14,
                    background: theme.lime,
                    color: theme.bg,
                    fontSize: 38,
                    fontWeight: 800,
                    transform: frame > 182 && frame < 198 ? "scale(0.96)" : "scale(1)",
                  }}
                >
                  {c.button}
                </div>
              </Rise>
            ) : (
              <>
                <Rise delay={0} y={26}>
                  <div style={{ display: "flex", alignItems: "center", gap: 20, fontSize: 42, fontWeight: 700 }}>
                    <Tick /> Google Drive connected
                  </div>
                </Rise>
                <div style={{ display: "flex", gap: 18 }}>
                  {c.checks.map((k, i) => (
                    <Pill key={k} delay={14 + i * 10} active>
                      {k}
                    </Pill>
                  ))}
                </div>
              </>
            )}
          </div>
          <Cursor
            path={[
              { frame: 60, x: 320, y: 480 },
              { frame: 150, x: 700, y: 300 },
              { frame: 185, x: 718, y: 288 },
            ]}
            click={[190]}
          />
        </AppWindow>
      </div>
      <Caption text={c.caption} delay={26} />
    </Frame>
  );
};

export const WtIndexing: React.FC = () => {
  const frame = useCurrentFrame();
  const c = WT_COPY.indexing;
  /* Honest phases: discovery counts up first; extraction only after. */
  const discovered = Math.floor(
    interpolate(frame, [70, 240], [0, c.discovered], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
  );
  const processed = Math.floor(
    interpolate(frame, [300, 520], [0, c.discovered], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
  );
  const stageIdx = frame < 60 ? 0 : frame < 110 ? 1 : frame < 250 ? 2 : frame < 300 ? 3 : 4;
  const done = processed >= c.discovered;
  return (
    <Frame>
      <StepTag>{c.step}</StepTag>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 40, paddingBottom: 120 }}>
        <BigText size={78} delay={8}>{c.title}</BigText>
        <AppWindow url={c.url} delay={20} height={560}>
          <div style={{ display: "flex", gap: 64, height: "100%" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 26, justifyContent: "center", minWidth: 640 }}>
              {c.stages.map((s, i) => (
                <div key={s} style={{ display: "flex", alignItems: "center", gap: 20, fontSize: 31, color: i <= stageIdx ? theme.ink : theme.faint, fontFamily: i >= 3 ? theme.mono : theme.sans }}>
                  <Tick on={i < stageIdx || (i === stageIdx && done)} />
                  {i === 4 ? `Indexing ${processed.toLocaleString()} of ${c.discovered.toLocaleString()} files` : i === 3 ? (stageIdx >= 3 ? s : "Discovery in progress…") : s}
                </div>
              ))}
            </div>
            <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", gap: 30 }}>
              <div style={{ fontFamily: theme.mono, fontSize: 26, color: theme.faint, letterSpacing: 2 }}>DISCOVERED</div>
              <div style={{ fontFamily: theme.mono, fontSize: 96, fontWeight: 700, color: theme.lime, fontVariantNumeric: "tabular-nums" }}>
                {discovered.toLocaleString()}
              </div>
              <div style={{ height: 18, borderRadius: 99, background: theme.line, overflow: "hidden" }}>
                <div
                  style={{
                    height: "100%",
                    width: `${(processed / c.discovered) * 100}%`,
                    background: `linear-gradient(90deg, ${theme.limeDim}, ${theme.lime})`,
                    borderRadius: 99,
                  }}
                />
              </div>
              <div style={{ fontFamily: theme.mono, fontSize: 26, color: theme.muted }}>
                {done ? "Complete — every file accounted for" : `${(c.discovered - processed).toLocaleString()} remaining`}
              </div>
              <Rise delay={330} y={16}>
                <div style={{ display: "inline-flex", alignItems: "center", gap: 14, border: `1px solid ${theme.line2}`, borderRadius: 12, padding: "14px 22px", fontSize: 26, color: theme.muted, alignSelf: "flex-start" }}>
                  <LockTiny /> {c.note}
                </div>
              </Rise>
            </div>
          </div>
        </AppWindow>
      </div>
      <Caption text={c.caption} delay={26} />
    </Frame>
  );
};

export const WtAsk: React.FC = () => {
  const frame = useCurrentFrame();
  const c = WT_COPY.ask;
  const typed = c.query.slice(0, Math.floor(interpolate(frame, [70, 250], [0, c.query.length], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })));
  const submitted = frame >= 300;
  return (
    <Frame>
      <StepTag>{c.step}</StepTag>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 40, paddingBottom: 120 }}>
        <BigText size={78} delay={8}>{c.title}</BigText>
        <AppWindow url={c.url} delay={18} height={420}>
          <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", height: "100%", gap: 34 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 22,
                border: `2px solid ${submitted ? theme.lime : theme.line2}`,
                borderRadius: 16,
                padding: "26px 32px",
                background: theme.bg,
              }}
            >
              <SearchGlyph />
              <span style={{ fontFamily: theme.mono, fontSize: 36, color: theme.ink }}>
                {typed}
                <span style={{ opacity: frame % 24 < 12 && !submitted ? 1 : 0, color: theme.lime }}>▍</span>
              </span>
            </div>
            {submitted && (
              <Rise delay={0} y={18}>
                <div style={{ display: "flex", alignItems: "center", gap: 16, fontFamily: theme.mono, fontSize: 27, color: theme.muted }}>
                  <span style={{ width: 14, height: 14, borderRadius: 99, background: theme.lime }} />
                  Searching 7 permitted sources…
                </div>
              </Rise>
            )}
          </div>
        </AppWindow>
      </div>
      <Caption text={c.caption} delay={24} />
    </Frame>
  );
};

export const WtConflict: React.FC = () => {
  const c = WT_COPY.conflict;
  return (
    <Frame>
      <StepTag>{c.step}</StepTag>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 44, paddingBottom: 110 }}>
        <BigText size={72} delay={6}>{c.title}</BigText>
        <div style={{ display: "flex", gap: 44, transform: "scale(0.92)" }}>
          <DocCard file={c.draft.file} tag={c.draft.tag} annual={c.draft.annual} impl={c.draft.impl} variant="draft" delay={16} dim badge="KEPT · NOT AUTHORITATIVE" />
          <DocCard file={c.final.file} tag={c.final.tag} annual={c.final.annual} impl={c.final.impl} variant="final" delay={28} badge="✓ RANKS HIGHER" />
        </div>
        <Rise delay={52} y={20}>
          <div style={{ fontFamily: theme.mono, fontSize: 27, letterSpacing: 1, color: theme.amber, border: `1px solid #8a7136`, background: theme.amberSoft, borderRadius: 999, padding: "16px 34px" }}>
            {c.banner}
          </div>
        </Rise>
      </div>
      <Caption text={c.caption} delay={40} />
    </Frame>
  );
};

export const WtRanking: React.FC = () => {
  const c = WT_COPY.ranking;
  return (
    <Frame>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 48, paddingBottom: 110 }}>
        <BigText size={76} delay={6}>{c.title}</BigText>
        <Rise delay={20} y={30}>
          <div style={{ display: "flex", alignItems: "center", gap: 22, border: `2px solid ${theme.lime}`, background: theme.accentSoft, borderRadius: 18, padding: "26px 44px" }}>
            <span style={{ fontFamily: theme.mono, fontSize: 36, color: theme.ink }}>{c.winner}</span>
            <span style={{ fontFamily: theme.mono, fontSize: 24, color: theme.lime, letterSpacing: 2 }}>RANK 1 · AUTHORITATIVE</span>
          </div>
        </Rise>
        <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
          {c.reasons.map((r, i) => (
            <Rise key={r} delay={40 + i * 14} y={24}>
              <div style={{ display: "flex", alignItems: "center", gap: 22, fontSize: 38 }}>
                <Tick /> {r}
              </div>
            </Rise>
          ))}
        </div>
      </div>
      <Caption text={c.caption} delay={64} />
    </Frame>
  );
};

export const WtCoverage: React.FC = () => {
  const frame = useCurrentFrame();
  const c = WT_COPY.coverage;
  const searchedShown = Math.floor(interpolate(frame, [40, 200], [0, c.sources.length], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }));
  return (
    <Frame>
      <StepTag>{c.step}</StepTag>
      <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", gap: 90, paddingBottom: 110 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 12, width: 780 }}>
          {c.sources.map((s, i) => (
            <div key={s} style={{ display: "flex", alignItems: "center", gap: 18, border: `1px solid ${theme.line}`, borderRadius: 12, padding: "13px 22px", background: theme.panel, opacity: i < searchedShown ? 1 : 0.25 }}>
              <Tick on={i < searchedShown} />
              <span style={{ fontSize: 27, flex: 1 }}>{s}</span>
              <span style={{ fontFamily: theme.mono, fontSize: 19, color: theme.lime, letterSpacing: 1 }}>SEARCHED</span>
            </div>
          ))}
          <Rise delay={220} y={20}>
            <div style={{ display: "flex", alignItems: "center", gap: 18, border: `2px solid #8a7136`, borderRadius: 12, padding: "13px 22px", background: theme.amberSoft }}>
              <span style={{ width: 34, height: 34, borderRadius: "50%", display: "grid", placeItems: "center", background: theme.amber, color: "#3a2c00", fontWeight: 800, fontSize: 20 }}>!</span>
              <span style={{ fontSize: 27, flex: 1 }}>{c.excludedFile}</span>
              <span style={{ fontFamily: theme.mono, fontSize: 19, color: theme.amber, letterSpacing: 1 }}>{c.excludedTag}</span>
            </div>
          </Rise>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <BigText size={72} delay={10} style={{ maxWidth: 640 }}>{c.title}</BigText>
          <Rise delay={40} y={22}>
            <div style={{ fontFamily: theme.mono, fontSize: 108, fontWeight: 700, color: theme.lime }}>
              {Math.min(searchedShown, c.searched)}<span style={{ color: theme.faint }}> / {c.known}</span>
            </div>
          </Rise>
          <Rise delay={54} y={18}>
            <div style={{ fontSize: 30, color: theme.muted, maxWidth: 600 }}>sources searched · 1 excluded and accounted for</div>
          </Rise>
        </div>
      </div>
      <Caption text={c.caption} delay={240} />
    </Frame>
  );
};

export const WtEvidence: React.FC = () => {
  const frame = useCurrentFrame();
  const c = WT_COPY.evidence;
  const fill = interpolate(frame, [60, 150], [0, 62], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <Frame>
      <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", gap: 80, paddingBottom: 110 }}>
        <div style={{ width: 820, display: "flex", flexDirection: "column", gap: 26 }}>
          <BigText size={70} delay={6}>{c.title}</BigText>
          <Rise delay={22} y={26}>
            <div style={{ border: `2px solid ${theme.lime}`, background: theme.accentSoft, borderRadius: 18, padding: 34 }}>
              <div style={{ fontFamily: theme.mono, fontSize: 22, color: theme.faint, letterSpacing: 2 }}>GOVERNING ANSWER</div>
              <div style={{ fontFamily: theme.mono, fontSize: 42, fontWeight: 700, color: theme.ink, marginTop: 14 }}>{c.answer}</div>
              <div style={{ marginTop: 26 }}>
                <div style={{ height: 14, borderRadius: 99, background: theme.line, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${fill}%`, background: `linear-gradient(90deg, ${theme.amber}, ${theme.lime})`, borderRadius: 99 }} />
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontFamily: theme.mono, fontSize: 22, color: theme.muted, marginTop: 10 }}>
                  <span>confidence · {c.confidence}</span>
                  <span>{c.confidenceNote}</span>
                </div>
              </div>
            </div>
          </Rise>
          <div style={{ display: "flex", gap: 16 }}>
            {c.tools.map((t, i) => (
              <Pill key={t} delay={120 + i * 12} active>
                {t}
              </Pill>
            ))}
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 26 }}>
          {c.trace.map((t, i) => (
            <Rise key={t} delay={50 + i * 20} y={26}>
              <div style={{ display: "flex", gap: 22, alignItems: "center" }}>
                <span style={{ width: 52, height: 52, borderRadius: "50%", border: `2px solid ${theme.line2}`, display: "grid", placeItems: "center", fontFamily: theme.mono, fontSize: 26, color: theme.lime }}>{i + 1}</span>
                <span style={{ fontSize: 32, color: theme.ink, maxWidth: 560 }}>{t}</span>
              </div>
            </Rise>
          ))}
        </div>
      </div>
      <Caption text={c.caption} delay={160} />
    </Frame>
  );
};

export const WtApi: React.FC = () => {
  const frame = useCurrentFrame();
  const c = WT_COPY.api;
  const lines = Math.floor(interpolate(frame, [40, 200], [0, c.code.length], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }));
  return (
    <Frame>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 42, paddingBottom: 110 }}>
        <BigText size={74} delay={6}>{c.title}</BigText>
        <Rise delay={18} y={40}>
          <div style={{ width: 1180, borderRadius: 18, border: `2px solid ${theme.line2}`, background: theme.panel, overflow: "hidden", boxShadow: "0 40px 110px rgba(0,0,0,.55)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "16px 26px", borderBottom: `1px solid ${theme.line}`, fontFamily: theme.mono, fontSize: 24, color: theme.muted }}>
              <span style={{ width: 13, height: 13, borderRadius: 99, background: theme.lime }} /> POST /v1/retrieve
              <span style={{ marginLeft: "auto" }}>200 OK</span>
            </div>
            <div style={{ padding: 34, fontFamily: theme.mono, fontSize: 30, lineHeight: 1.75 }}>
              {c.code.slice(0, lines).map(([k, v, tail], i) => (
                <div key={i}>
                  <span style={{ color: theme.lime }}>{k}</span>
                  <span style={{ color: theme.amber }}>{v}</span>
                  <span style={{ color: theme.muted }}>{tail}</span>
                </div>
              ))}
              {lines < c.code.length && <span style={{ color: theme.lime }}>▍</span>}
            </div>
          </div>
        </Rise>
      </div>
      <Caption text={c.caption} delay={140} />
    </Frame>
  );
};

export const WtOutro: React.FC = () => {
  const c = WT_COPY.outro;
  return (
    <Frame>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 36, textAlign: "center" }}>
        <Rise delay={6} y={40}>
          <div style={{ width: 132, height: 132, borderRadius: 32, background: theme.lime, color: theme.bg, display: "grid", placeItems: "center", fontFamily: theme.mono, fontWeight: 800, fontSize: 78, boxShadow: `0 30px 120px rgba(200,255,69,.25)` }}>
            F
          </div>
        </Rise>
        <Words text={c.brand} size={128} delay={20} style={{ justifyContent: "center" }} />
        <Rise delay={44} y={22}>
          <div style={{ fontSize: 46, color: theme.lime, fontWeight: 600 }}>{c.tagline}</div>
        </Rise>
        <Rise delay={70} y={16}>
          <div style={{ fontFamily: theme.mono, fontSize: 23, color: theme.faint, maxWidth: 1100, lineHeight: 1.7 }}>{c.footnote}</div>
        </Rise>
      </div>
    </Frame>
  );
};

const SearchGlyph: React.FC = () => (
  <svg width="40" height="40" viewBox="0 0 24 24" fill="none">
    <circle cx="11" cy="11" r="7" stroke={theme.lime} strokeWidth="2" />
    <path d="M16.5 16.5L21 21" stroke={theme.lime} strokeWidth="2" strokeLinecap="round" />
  </svg>
);

export const WT_SCENE_COMPONENTS = {
  title: WtTitle,
  connect: WtConnect,
  indexing: WtIndexing,
  ask: WtAsk,
  conflict: WtConflict,
  ranking: WtRanking,
  coverage: WtCoverage,
  evidence: WtEvidence,
  api: WtApi,
  outro: WtOutro,
} as const;

/* Camera treatment per scene (mirrors the demo's per-scene drift). */
export const WT_CAMERA: Record<keyof typeof WT_SCENES, { from: number; drift: [number, number] }> = {
  title: { from: 1.1, drift: [0, -22] },
  connect: { from: 1.06, drift: [-10, -14] },
  indexing: { from: 1.05, drift: [8, -12] },
  ask: { from: 1.06, drift: [-8, -14] },
  conflict: { from: 1.07, drift: [0, -16] },
  ranking: { from: 1.06, drift: [10, -12] },
  coverage: { from: 1.05, drift: [-10, -12] },
  evidence: { from: 1.06, drift: [8, -14] },
  api: { from: 1.06, drift: [0, -14] },
  outro: { from: 1.12, drift: [0, -10] },
};
