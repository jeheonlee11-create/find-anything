/**
 * Scene 3 · 22–35s · Resolution & Evidence.
 * The approved document locks in green, the deterministic receipt surfaces,
 * the 7/8 coverage meter fills, and the restricted file is isolated — sealed,
 * never leaked.
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
import { Backdrop, EXPO_OUT, GlassCard, KineticLine, Stage, useCamera } from "./rig";
import { beat, CUES } from "./audio";

const CoverageMeter: React.FC<{ delay: number }> = ({ delay }) => {
  const frame = useCurrentFrame();
  const { searched, known, label } = PROMO_COPY.coverage;
  const fill = interpolate(frame, [delay, delay + 55], [0, searched / known], {
    easing: EXPO_OUT,
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
        <span style={{ fontFamily: P.mono, fontSize: 14, letterSpacing: "0.14em", color: P.muted }}>COVERAGE</span>
        <span style={{ fontFamily: P.mono, fontSize: 15, color: P.ink }}>
          {Math.round(fill * known)}/{known} {label}
        </span>
      </div>
      <div style={{ height: 12, borderRadius: 99, background: "rgba(255,255,255,0.07)", overflow: "hidden", display: "flex" }}>
        <div
          style={{
            width: `${fill * 100}%`,
            background: `linear-gradient(90deg, ${P.green}, ${P.cyan})`,
            boxShadow: `0 0 24px ${P.green}66`,
          }}
        />
      </div>
      <div style={{ marginTop: 9, fontFamily: P.mono, fontSize: 12.5, color: P.amber, letterSpacing: "0.08em" }}>
        1 restricted source excluded · contents never read
      </div>
    </div>
  );
};

export const Scene3_TheResolution: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const camera = useCamera([
    { at: 0, rotX: 0, rotY: 0, zoom: 1.16, x: 0, y: 70 },
    { at: beat(6), rotX: 6, rotY: 4, zoom: 0.98, x: 0, y: 0 },
    { at: 389, rotX: 4, rotY: 2, zoom: 1.0, x: 0, y: 0 },
  ]);
  const winnerLock = spring({ frame: frame - (CUES.successChime - 660), fps, config: { damping: 14, stiffness: 150 } });
  const receiptIn = spring({ frame: frame - beat(8), fps, config: { damping: 17, stiffness: 80 } });
  const vaultIn = spring({ frame: frame - beat(14), fps, config: { damping: 15, stiffness: 100 } });
  return (
    <AbsoluteFill>
      <Backdrop accent={P.cyan} />
      <Stage camera={camera} perspective={1900}>
        <AbsoluteFill style={{ alignItems: "center" }}>
          <KineticLine
            text={PROMO_COPY.resolutionTitle}
            delay={4}
            style={{ marginTop: 84, fontFamily: P.sans, fontSize: 72, fontWeight: 800, letterSpacing: "-0.035em", color: P.ink }}
          />
        </AbsoluteFill>

        {/* Winner card, locked green. */}
        <GlassCard
          glow={`${P.green}2e`}
          style={{
            position: "absolute",
            left: 260,
            top: 320,
            width: 620,
            padding: "26px 30px",
            border: `1px solid ${P.green}88`,
            transform: `translateZ(90px) translateY(${(1 - winnerLock) * 90}px)`,
            opacity: winnerLock,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
            <div
              style={{
                width: 26,
                height: 26,
                borderRadius: "50%",
                background: `${P.green}22`,
                border: `1.6px solid ${P.green}`,
                display: "grid",
                placeItems: "center",
                transform: `scale(${winnerLock})`,
              }}
            >
              <svg width={13} height={13} viewBox="0 0 24 24" fill="none">
                <path d="M4 12.5l5.2 5L20 6.8" stroke={P.green} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <span style={{ fontFamily: P.mono, fontSize: 13.5, letterSpacing: "0.14em", color: P.green }}>
              APPROVED · GOVERNS THIS ANSWER
            </span>
          </div>
          <div style={{ fontFamily: P.sans, fontSize: 30, fontWeight: 750, color: P.ink }}>{PROMO_COPY.final.file}</div>
          <div style={{ fontFamily: P.mono, fontSize: 44, fontWeight: 700, color: P.ink, marginTop: 12 }}>
            {PROMO_COPY.final.price}
          </div>
        </GlassCard>

        {/* Deterministic receipt. */}
        <GlassCard
          style={{
            position: "absolute",
            left: 1000,
            top: 300,
            width: 660,
            padding: "24px 28px",
            transform: `translateZ(40px) translateY(${(1 - receiptIn) * 120}px)`,
            opacity: receiptIn,
          }}
        >
          <div style={{ fontFamily: P.mono, fontSize: 13.5, letterSpacing: "0.16em", color: P.cyan, marginBottom: 16 }}>
            {PROMO_COPY.receipt.title.toUpperCase()}
          </div>
          <div style={{ display: "grid", gap: 12 }}>
            {PROMO_COPY.receipt.rows.map(([k, v], i) => {
              const rowIn = spring({ frame: frame - beat(9) - i * Math.round(beat(1)), fps, config: { damping: 18, stiffness: 130 } });
              return (
                <div
                  key={k}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "128px 1fr",
                    gap: 14,
                    padding: "13px 15px",
                    borderRadius: 10,
                    background: "rgba(255,255,255,0.03)",
                    border: `1px solid ${P.glassBorderSoft}`,
                    opacity: rowIn,
                    transform: `translateX(${(1 - rowIn) * 40}px)`,
                  }}
                >
                  <span style={{ fontFamily: P.mono, fontSize: 12.5, letterSpacing: "0.12em", color: P.muted }}>
                    {k.toUpperCase()}
                  </span>
                  <span style={{ fontFamily: P.sans, fontSize: 16.5, color: P.ink, lineHeight: 1.45 }}>{v}</span>
                </div>
              );
            })}
          </div>
          <div style={{ marginTop: 20 }}>
            <CoverageMeter delay={beat(13)} />
          </div>
        </GlassCard>

        {/* The restricted file: isolated, sealed, unread. */}
        <GlassCard
          glow={`${P.red}1e`}
          style={{
            position: "absolute",
            left: 300,
            top: 700,
            width: 540,
            padding: "20px 24px",
            border: `1px dashed ${P.red}66`,
            transform: `translateZ(10px) scale(${0.9 + vaultIn * 0.1})`,
            opacity: vaultIn * 0.96,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <svg width={26} height={26} viewBox="0 0 24 24" fill="none">
              <rect x="4" y="10" width="16" height="10" rx="2.4" stroke={P.red} strokeWidth={2} />
              <path d="M8 10V7.4A4 4 0 0 1 16 7.4V10" stroke={P.red} strokeWidth={2} />
            </svg>
            <div>
              <div style={{ fontFamily: P.sans, fontSize: 20, fontWeight: 650, color: P.ink }}>Finance — Model.xlsx</div>
              <div style={{ fontFamily: P.mono, fontSize: 12.5, letterSpacing: "0.12em", color: P.red, marginTop: 5 }}>
                RESTRICTED · EXCLUDED · NEVER LEAKED
              </div>
            </div>
          </div>
        </GlassCard>
      </Stage>
    </AbsoluteFill>
  );
};
