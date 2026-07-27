import React from "react";
import { interpolate, useCurrentFrame, useVideoConfig, spring } from "remotion";
import { theme } from "./theme";
import { COPY } from "./config";
import { Frame, Kicker, BigText, Rise, Pill, DocCard, Cursor, BrandMark } from "./components/ui";

const center: React.CSSProperties = {
  position: "absolute",
  inset: 0,
  display: "flex",
  flexDirection: "column",
  justifyContent: "center",
  padding: "0 140px",
};

/* 1 — Hook: the agent asks, finds two disagreeing documents */
export const Hook: React.FC = () => {
  const c = COPY.hook;
  return (
    <Frame>
      <div style={center}>
        <Kicker delay={4}>{c.kicker}</Kicker>
        <BigText delay={12} size={92} style={{ marginTop: 40, maxWidth: 1500 }}>
          {c.line}
        </BigText>
        <Rise delay={40} y={24}>
          <div style={{ marginTop: 44, fontSize: 40, color: theme.muted }}>{c.sub}</div>
        </Rise>
        <Rise delay={70} y={20}>
          <div style={{ marginTop: 54, display: "flex", gap: 20 }}>
            <MiniDoc name="Pricing Draft.pdf" tone={theme.amber} />
            <MiniDoc name="Pricing Final.pdf" tone={theme.lime} />
          </div>
        </Rise>
      </div>
      <Cursor path={[{ frame: 0, x: 1500, y: 300 }, { frame: 70, x: 760, y: 720 }, { frame: 120, x: 1040, y: 720 }]} />
      <BrandMark />
    </Frame>
  );
};

const MiniDoc: React.FC<{ name: string; tone: string }> = ({ name, tone }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 14, border: `1px solid ${theme.line2}`, borderLeft: `4px solid ${tone}`, borderRadius: 12, padding: "18px 24px", background: theme.panel, fontFamily: theme.mono, fontSize: 28 }}>
    <span style={{ color: tone }}>▤</span> {name}
  </div>
);

/* 2 — Draft document */
export const Draft: React.FC = () => {
  const c = COPY.draft;
  return (
    <Frame>
      <div style={{ ...center, alignItems: "center", flexDirection: "row", gap: 90, justifyContent: "center" }}>
        <DocCard file={c.file} tag={c.tag} annual={c.annual} impl={c.impl} variant="draft" delay={8} badge="kept · not authoritative" />
        <div style={{ maxWidth: 520 }}>
          <Kicker delay={0}>DOCUMENT 1 OF 2</Kicker>
          <BigText delay={20} size={68} style={{ marginTop: 28 }}>{c.caption}</BigText>
          <Rise delay={46}>
            <div style={{ marginTop: 26, fontSize: 34, color: theme.muted, fontFamily: theme.mono }}>{c.annual}<br />{c.impl}</div>
          </Rise>
        </div>
      </div>
      <BrandMark />
    </Frame>
  );
};

/* 3 — Final document */
export const Final: React.FC = () => {
  const c = COPY.final;
  return (
    <Frame>
      <div style={{ ...center, alignItems: "center", flexDirection: "row", gap: 90, justifyContent: "center" }}>
        <div style={{ maxWidth: 520, textAlign: "right" }}>
          <Kicker delay={0}>DOCUMENT 2 OF 2</Kicker>
          <BigText delay={20} size={68} style={{ marginTop: 28 }}>{c.caption}</BigText>
          <Rise delay={46}>
            <div style={{ marginTop: 26, fontSize: 34, color: theme.lime, fontFamily: theme.mono }}>{c.annual}<br />{c.impl}</div>
          </Rise>
        </div>
        <DocCard file={c.file} tag={c.tag} annual={c.annual} impl={c.impl} variant="final" delay={8} badge="✓ approved · authoritative" />
      </div>
      <BrandMark />
    </Frame>
  );
};

/* 4 — Both stay visible; conflict reported */
export const BothVisible: React.FC = () => {
  const c = COPY.bothVisible;
  const frame = useCurrentFrame();
  const pulse = 0.5 + 0.5 * Math.sin(frame / 8);
  return (
    <Frame>
      <div style={{ position: "absolute", top: 90, left: 0, right: 0, textAlign: "center" }}>
        <Kicker delay={2}>CONFLICT DETECTED</Kicker>
        <BigText delay={12} size={84} style={{ marginTop: 24 }}>{c.title}</BigText>
      </div>
      <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", gap: 40, marginTop: 60 }}>
        <DocCard file={COPY.draft.file} tag={COPY.draft.tag} annual={COPY.draft.annual} impl={COPY.draft.impl} variant="draft" delay={20} dim badge="rank 2" />
        <Rise delay={40} y={0}>
          <div style={{ fontFamily: theme.mono, fontSize: 30, color: theme.danger, border: `2px solid ${theme.danger}`, borderRadius: 999, padding: "18px 14px", opacity: 0.6 + 0.4 * pulse, writingMode: "vertical-rl" }}>conflict</div>
        </Rise>
        <DocCard file={COPY.final.file} tag={COPY.final.tag} annual={COPY.final.annual} impl={COPY.final.impl} variant="final" delay={30} badge="rank 1" />
      </div>
      <div style={{ position: "absolute", bottom: 96, left: 0, right: 0, textAlign: "center" }}>
        <Rise delay={70}>
          <div style={{ fontSize: 36, color: theme.muted, maxWidth: 1300, margin: "0 auto" }}>{c.sub}</div>
        </Rise>
      </div>
    </Frame>
  );
};

/* 5 — Ranking rationale */
export const Ranking: React.FC = () => {
  const c = COPY.ranking;
  return (
    <Frame>
      <div style={{ ...center }}>
        <Kicker delay={2}>AUTHORITATIVE-SOURCE IDENTIFICATION</Kicker>
        <BigText delay={12} size={92} style={{ marginTop: 30 }}>{c.title}</BigText>
        <Rise delay={34}>
          <div style={{ marginTop: 26, fontSize: 38, color: theme.muted }}>{c.sub}</div>
        </Rise>
        <div style={{ marginTop: 50, display: "flex", flexDirection: "column", gap: 22 }}>
          {c.reasons.map((r, i) => (
            <Rise key={r} delay={60 + i * 24} y={30}>
              <div style={{ display: "flex", alignItems: "center", gap: 24, fontSize: 44 }}>
                <span style={{ width: 46, height: 46, borderRadius: "50%", background: theme.lime, color: theme.bg, display: "grid", placeItems: "center", fontWeight: 800, fontSize: 28 }}>✓</span>
                {r}
              </div>
            </Rise>
          ))}
        </div>
        <Rise delay={150} y={26}>
          <div style={{ marginTop: 48, display: "inline-flex", alignItems: "center", gap: 18, background: theme.accentSoft, border: `2px solid ${theme.lime}`, borderRadius: 16, padding: "20px 30px", fontFamily: theme.mono, fontSize: 34, color: theme.lime }}>
            ▲ {c.winner} governs
          </div>
        </Rise>
      </div>
      <BrandMark />
    </Frame>
  );
};

/* 6 — Excluded restricted source */
export const Excluded: React.FC = () => {
  const c = COPY.excluded;
  return (
    <Frame>
      <div style={{ ...center }}>
        <Kicker delay={2}>PERMISSION-SCOPED RETRIEVAL</Kicker>
        <BigText delay={12} size={90} style={{ marginTop: 30 }}>{c.title}</BigText>
        <Rise delay={40} y={40}>
          <div style={{ marginTop: 44, display: "flex", alignItems: "center", gap: 28, width: 1080, border: `2px solid ${theme.line2}`, borderLeft: `6px solid ${theme.amber}`, borderRadius: 18, padding: 34, background: theme.amberSoft }}>
            <LockGlyph />
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: theme.mono, fontSize: 38, color: theme.ink }}>{c.file}</div>
              <div style={{ fontFamily: theme.mono, fontSize: 26, color: theme.amber, marginTop: 8, letterSpacing: 1 }}>{c.tag}</div>
            </div>
            <div style={{ fontFamily: theme.mono, fontSize: 26, color: theme.amber, border: `1px solid ${theme.amber}`, borderRadius: 999, padding: "12px 22px" }}>excluded</div>
          </div>
        </Rise>
        <Rise delay={78}>
          <div style={{ marginTop: 40, fontSize: 38, color: theme.muted, maxWidth: 1200, lineHeight: 1.4 }}>{c.sub}</div>
        </Rise>
      </div>
      <BrandMark />
    </Frame>
  );
};

const LockGlyph: React.FC = () => (
  <svg width="56" height="56" viewBox="0 0 24 24" fill="none">
    <rect x="5" y="10" width="14" height="10" rx="2" stroke={theme.amber} strokeWidth="1.6" />
    <path d="M8 10V7a4 4 0 0 1 8 0v3" stroke={theme.amber} strokeWidth="1.6" />
  </svg>
);

/* 7 — Coverage accounting */
export const Coverage: React.FC = () => {
  const c = COPY.coverage;
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const grow = spring({ frame: frame - 30, fps, config: { damping: 200 } });
  return (
    <Frame>
      <div style={{ ...center }}>
        <Kicker delay={2}>COVERAGE ACCOUNTING</Kicker>
        <BigText delay={12} size={90} style={{ marginTop: 30 }}>{c.title}</BigText>
        <div style={{ marginTop: 56, display: "flex", alignItems: "center", gap: 50 }}>
          <Rise delay={26} y={30}>
            <div style={{ fontFamily: theme.mono, fontSize: 150, fontWeight: 800, letterSpacing: -4, color: theme.lime }}>
              {c.searched}<span style={{ color: theme.faint }}> / {c.known}</span>
            </div>
            <div style={{ fontFamily: theme.mono, fontSize: 28, color: theme.faint, letterSpacing: 2 }}>SOURCES SEARCHED</div>
          </Rise>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 16, width: 780 }}>
            {Array.from({ length: c.known }).map((_, i) => {
              const excluded = i === c.known - 1;
              const appear = interpolate(frame, [40 + i * 6, 52 + i * 6], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
              return (
                <div key={i} style={{ opacity: appear, transform: `scale(${appear})`, width: 150, height: 92, borderRadius: 12, border: `2px solid ${excluded ? theme.amber : theme.lime}`, background: excluded ? theme.amberSoft : theme.accentSoft, display: "grid", placeItems: "center", fontFamily: theme.mono, fontSize: 30, color: excluded ? theme.amber : theme.lime }}>
                  {excluded ? "✕ excl" : "✓"}
                </div>
              );
            })}
          </div>
        </div>
        <Rise delay={90}>
          <div style={{ marginTop: 50, fontSize: 38, color: theme.muted, opacity: grow }}>{c.sub}</div>
        </Rise>
      </div>
      <BrandMark />
    </Frame>
  );
};

/* 8 — Evidence: answer + all controls */
export const Evidence: React.FC = () => {
  const c = COPY.evidence;
  const frame = useCurrentFrame();
  const conf = interpolate(frame, [70, 120], [0, 0.62], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <Frame>
      <div style={{ ...center }}>
        <Kicker delay={2}>EVIDENCE YOU CAN AUDIT</Kicker>
        <BigText delay={12} size={78} style={{ marginTop: 26 }}>{c.title}</BigText>
        <Rise delay={30} y={40}>
          <div style={{ marginTop: 40, border: `1px solid ${theme.line2}`, background: theme.panel, borderRadius: 18, padding: "32px 40px", width: 1180 }}>
            <div style={{ fontFamily: theme.mono, fontSize: 26, color: theme.faint }}>ANSWER · with citations</div>
            <div style={{ fontSize: 56, fontWeight: 800, marginTop: 12, letterSpacing: -1 }}>
              {c.answer} <span style={{ color: theme.lime, fontFamily: theme.mono, fontSize: 28, verticalAlign: "super" }}>[1][2]</span>
            </div>
            <div style={{ marginTop: 26, height: 14, borderRadius: 999, background: theme.line, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${conf * 100}%`, background: `linear-gradient(90deg, ${theme.amber}, ${theme.lime})` }} />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontFamily: theme.mono, fontSize: 24, color: theme.muted, marginTop: 12 }}>
              <span>confidence · {c.confidence}</span>
              <span>{c.confidenceNote}</span>
            </div>
          </div>
        </Rise>
        <div style={{ marginTop: 40, display: "flex", flexWrap: "wrap", gap: 16, width: 1180 }}>
          {c.features.map((f, i) => (
            <Pill key={f} delay={95 + i * 10} active>{f}</Pill>
          ))}
        </div>
      </div>
      <BrandMark />
    </Frame>
  );
};

/* 9 — Outro logo lockup */
export const Outro: React.FC = () => {
  const c = COPY.outro;
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame, fps, config: { damping: 200, mass: 1 } });
  const glow = 0.5 + 0.5 * Math.sin(frame / 10);
  return (
    <Frame>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 30 }}>
        <div style={{ transform: `scale(${interpolate(s, [0, 1], [0.8, 1])})`, opacity: s, display: "flex", alignItems: "center", gap: 28 }}>
          <div style={{ width: 96, height: 96, borderRadius: 22, background: theme.lime, color: theme.bg, display: "grid", placeItems: "center", fontFamily: theme.mono, fontWeight: 800, fontSize: 60, boxShadow: `0 0 ${40 + glow * 40}px ${theme.lime}55` }}>F</div>
          <div style={{ fontSize: 100, fontWeight: 800, letterSpacing: -3 }}>{c.brand}</div>
        </div>
        <Rise delay={24}>
          <div style={{ fontSize: 48, color: theme.lime, letterSpacing: -0.5 }}>{c.tagline}</div>
        </Rise>
        <Rise delay={54}>
          <div style={{ fontFamily: theme.mono, fontSize: 24, color: theme.faint, marginTop: 30, textAlign: "center", maxWidth: 1100 }}>{c.footnote}</div>
        </Rise>
      </div>
    </Frame>
  );
};
