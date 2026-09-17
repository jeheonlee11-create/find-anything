/**
 * Scene 2 · 8–22s · The Isometric Reveal.
 * A glowing workspace window tilts into frame in 2.5D, the camera swoops from
 * an angled overview down to a flat close-up, and an animated cursor glides in
 * on a Bézier arc to click "Trace & Compare".
 */
import React from "react";
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { P, PROMO_COPY } from "./promo-config";
import {
  Backdrop,
  Cursor,
  EXPO_OUT,
  GlassCard,
  Stage,
  useCamera,
  useClickBounce,
} from "./rig";
import { beat, CUES } from "./audio";

/** Scene-local frame of the cursor's click (global cue frame 510). */
export const TRACE_CLICK_AT = CUES.uiClick - 240;

const Row: React.FC<{
  file: string;
  meta: string;
  price: string;
  accent: string;
  delay: number;
}> = ({ file, meta, price, accent, delay }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: frame - delay, fps, config: { damping: 18, stiffness: 120 } });
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "22px 1fr auto",
        gap: 16,
        alignItems: "center",
        padding: "17px 20px",
        borderRadius: 12,
        border: `1px solid ${P.glassBorderSoft}`,
        background: "rgba(255,255,255,0.028)",
        opacity: s,
        transform: `translateX(${(1 - s) * 46}px)`,
      }}
    >
      <div style={{ width: 10, height: 10, borderRadius: 3, background: accent, boxShadow: `0 0 16px ${accent}` }} />
      <div>
        <div style={{ fontFamily: P.sans, fontSize: 21, fontWeight: 650, color: P.ink }}>{file}</div>
        <div style={{ fontFamily: P.mono, fontSize: 12.5, letterSpacing: "0.1em", color: P.muted, marginTop: 5 }}>{meta}</div>
      </div>
      <div style={{ fontFamily: P.mono, fontSize: 21, color: P.ink }}>{price}</div>
    </div>
  );
};

export const Scene2_TheReveal: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // The swoop: angled isometric overview → head-on flat close-up.
  const camera = useCamera([
    { at: 0, rotX: 34, rotY: -18, zoom: 0.78, x: 60, y: -30 },
    { at: beat(8), rotX: 22, rotY: -11, zoom: 0.92, x: 30, y: -6 },
    { at: beat(15), rotX: 0, rotY: 0, zoom: 1.18, x: 0, y: 96 },
    { at: 419, rotX: 0, rotY: 0, zoom: 1.2, x: 0, y: 100 },
  ]);

  const windowIn = spring({ frame, fps, config: { damping: 17, stiffness: 60, mass: 1.1 } });
  const bounce = useClickBounce(TRACE_CLICK_AT);
  const buttonHot = frame >= TRACE_CLICK_AT;
  const scanline = interpolate(frame, [40, 200], [0, 1], {
    easing: EXPO_OUT,
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill>
      <Backdrop accent={P.violetDeep} />
      <AbsoluteFill
        style={{
          opacity: interpolate(frame, [0, 12], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
        }}
      >
        <Stage camera={camera} perspective={1900}>
          {/* Floor glow the window rises from. */}
          <div
            style={{
              position: "absolute",
              left: 360,
              top: 780,
              width: 1200,
              height: 260,
              transform: "rotateX(84deg) translateZ(-140px)",
              background: `radial-gradient(50% 50% at 50% 50%, ${P.violet}30, transparent 70%)`,
              filter: "blur(12px)",
            }}
          />

          {/* The workspace window. */}
          <div
            style={{
              position: "absolute",
              left: 420,
              top: 150,
              width: 1080,
              transformStyle: "preserve-3d",
              transform: `translateZ(${windowIn * 60}px) translateY(${(1 - windowIn) * 220}px) scale(${bounce})`,
              opacity: windowIn,
            }}
          >
            <GlassCard glow={`${P.violet}30`} style={{ overflow: "hidden" }}>
              {/* Title bar */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "16px 22px",
                  borderBottom: `1px solid ${P.glassBorderSoft}`,
                  background: "rgba(255,255,255,0.03)",
                }}
              >
                {[P.red, P.amber, P.green].map((c) => (
                  <div key={c} style={{ width: 11, height: 11, borderRadius: "50%", background: `${c}cc` }} />
                ))}
                <div style={{ marginLeft: 12, fontFamily: P.mono, fontSize: 13.5, letterSpacing: "0.1em", color: P.muted }}>
                  {PROMO_COPY.workspaceTitle}
                </div>
                <div
                  style={{
                    marginLeft: "auto",
                    fontFamily: P.mono,
                    fontSize: 11.5,
                    letterSpacing: "0.14em",
                    color: P.green,
                    border: `1px solid ${P.green}55`,
                    borderRadius: 99,
                    padding: "5px 10px",
                  }}
                >
                  DETERMINISTIC
                </div>
              </div>

              {/* Body */}
              <div style={{ padding: "24px 26px 28px", display: "grid", gap: 12 }}>
                <div style={{ fontFamily: P.mono, fontSize: 13, letterSpacing: "0.14em", color: P.muted }}>
                  QUERY · “current enterprise price”
                </div>
                <Row file={PROMO_COPY.final.file} meta={PROMO_COPY.final.tag} price={PROMO_COPY.final.price} accent={P.green} delay={beat(6)} />
                <Row file={PROMO_COPY.draft.file} meta={PROMO_COPY.draft.tag} price={PROMO_COPY.draft.price} accent={P.amber} delay={beat(7)} />
                <Row file="Finance — Model.xlsx" meta="RESTRICTED · NOT READ" price="—" accent={P.red} delay={beat(8)} />

                {/* Action row */}
                <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 8 }}>
                  <div
                    style={{
                      fontFamily: P.mono,
                      fontSize: 15.5,
                      letterSpacing: "0.1em",
                      fontWeight: 700,
                      color: buttonHot ? "#0b0d1a" : P.ink,
                      background: buttonHot ? P.ink : "rgba(255,255,255,0.07)",
                      border: `1px solid ${buttonHot ? P.ink : P.glassBorder}`,
                      borderRadius: 9,
                      padding: "14px 20px",
                      boxShadow: buttonHot ? `0 0 46px ${P.cyan}44` : "none",
                    }}
                  >
                    {PROMO_COPY.traceButton} →
                  </div>
                </div>
              </div>

              {/* Scan shimmer sweeping the window once as it settles. */}
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  background: `linear-gradient(105deg, transparent 0%, rgba(255,255,255,0.07) 46%, transparent 60%)`,
                  transform: `translateX(${interpolate(scanline, [0, 1], [-1200, 1300])}px)`,
                  pointerEvents: "none",
                }}
              />
            </GlassCard>
          </div>
        </Stage>
      </AbsoluteFill>

      {/* Cursor lives in screen space, above the stage. */}
      <Cursor
        legs={[
          // The button lives inside the 3D stage; these are its SCREEN
          // coordinates under the settled close-up pose (zoom 1.2, y+100).
          {
            from: CUES.uiGlideStart - 240,
            to: TRACE_CLICK_AT - 8,
            start: { x: 1800, y: 1030 },
            end: { x: 1452, y: 668 },
            c1: { x: 1640, y: 1000 },
            c2: { x: 1520, y: 720 },
          },
          { from: TRACE_CLICK_AT - 8, to: TRACE_CLICK_AT, start: { x: 1452, y: 668 }, end: { x: 1441, y: 655 }, clickAt: TRACE_CLICK_AT },
        ]}
      />

      {/* Section caption. */}
      <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "center", pointerEvents: "none" }}>
        <div
          style={{
            marginBottom: 56,
            fontFamily: P.mono,
            fontSize: 16,
            letterSpacing: "0.22em",
            color: P.muted,
            opacity: interpolate(frame, [beat(10), beat(12), 380, 405], [0, 1, 1, 0], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
          }}
        >
          ONE WORKSPACE · EVERY SOURCE ACCOUNTED FOR
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
