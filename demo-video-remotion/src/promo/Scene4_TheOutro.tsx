/**
 * Scene 4 · 35–45s · The Outro.
 * Smooth zoom-out from the evidence world to a centered hero card: logo,
 * tagline, CTA — and the project's honesty footnote.
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
import { Backdrop, GlassCard, Stage, useCamera } from "./rig";

export const Scene4_TheOutro: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const camera = useCamera([
    { at: 0, rotX: 8, rotY: -5, zoom: 1.3, x: 0, y: -40 },
    { at: 90, rotX: 0, rotY: 0, zoom: 1.0, x: 0, y: 0 },
    { at: 299, rotX: 0, rotY: 0, zoom: 1.02, x: 0, y: 0 },
  ]);
  const heroIn = spring({ frame: frame - 30, fps, config: { damping: 16, stiffness: 70, mass: 1.1 } });
  const ctaIn = spring({ frame: frame - 96, fps, config: { damping: 13, stiffness: 130 } });
  const ring = interpolate(frame, [30, 240], [0, 360], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <AbsoluteFill>
      <Backdrop accent={P.violet} />
      <Stage camera={camera}>
        {/* Slow halo behind the hero card. */}
        <div
          style={{
            position: "absolute",
            left: 960 - 430,
            top: 540 - 430,
            width: 860,
            height: 860,
            borderRadius: "50%",
            border: `1px solid ${P.glassBorderSoft}`,
            transform: `translateZ(-160px) rotate(${ring}deg)`,
            background: `conic-gradient(from 0deg, transparent 0deg, ${P.violet}26 40deg, transparent 90deg)`,
            filter: "blur(1px)",
            opacity: heroIn,
          }}
        />
        <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
          <GlassCard
            glow={`${P.violet}30`}
            style={{
              width: 880,
              padding: "64px 72px",
              textAlign: "center",
              transform: `translateZ(120px) translateY(${(1 - heroIn) * 140}px) scale(${0.94 + heroIn * 0.06})`,
              opacity: heroIn,
            }}
          >
            <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 18, marginBottom: 28 }}>
              <div
                style={{
                  width: 58,
                  height: 58,
                  borderRadius: 14,
                  background: P.ink,
                  color: "#0b0d1a",
                  display: "grid",
                  placeItems: "center",
                  fontFamily: P.sans,
                  fontWeight: 800,
                  fontSize: 30,
                  boxShadow: `0 0 60px ${P.violet}55`,
                }}
              >
                F
              </div>
              <span style={{ fontFamily: P.sans, fontSize: 46, fontWeight: 800, letterSpacing: "-0.03em", color: P.ink }}>
                Find Anything
              </span>
            </div>
            <div
              style={{
                fontFamily: P.sans,
                fontSize: 27,
                fontWeight: 600,
                lineHeight: 1.4,
                color: P.muted,
                marginBottom: 40,
              }}
            >
              {PROMO_COPY.outroTagline}
            </div>
            <div
              style={{
                display: "inline-block",
                fontFamily: P.mono,
                fontSize: 19,
                letterSpacing: "0.12em",
                fontWeight: 700,
                color: "#0b0d1a",
                background: P.ink,
                borderRadius: 10,
                padding: "18px 30px",
                opacity: ctaIn,
                transform: `translateY(${(1 - ctaIn) * 30}px)`,
                boxShadow: `0 0 70px ${P.cyan}3a`,
              }}
            >
              {PROMO_COPY.outroCta} →
            </div>
          </GlassCard>
        </AbsoluteFill>
      </Stage>
      <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "center", pointerEvents: "none" }}>
        <div
          style={{
            marginBottom: 40,
            fontFamily: P.mono,
            fontSize: 13,
            letterSpacing: "0.14em",
            color: P.faint,
            opacity: interpolate(frame, [120, 150], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
          }}
        >
          {PROMO_COPY.footnote.toUpperCase()}
        </div>
      </AbsoluteFill>
      {/* Final fade to black. */}
      <AbsoluteFill
        style={{
          background: "#000",
          opacity: interpolate(frame, [278, 300], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
        }}
      />
    </AbsoluteFill>
  );
};
