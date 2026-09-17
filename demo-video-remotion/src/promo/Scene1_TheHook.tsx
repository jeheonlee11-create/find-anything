/**
 * Scene 1 · 0–8s · The Hook.
 * Kinetic question over a slow-tilting 3D field where the two conflicting
 * pricing cards float with red/amber warning badges orbiting them.
 */
import React from "react";
import {
  AbsoluteFill,
  Easing,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { P, PROMO_COPY } from "./promo-config";
import { Backdrop, EXPO_OUT, GlassCard, KineticLine, Stage, useCamera } from "./rig";
import { beat, CUES } from "./audio";

const WarningBadge: React.FC<{
  label: string;
  color: string;
  x: number;
  y: number;
  z: number;
  delay: number;
}> = ({ label, color, x, y, z, delay }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: frame - delay, fps, config: { damping: 13, stiffness: 120 } });
  const bob = Math.sin((frame - delay) / 26) * 9;
  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y + bob,
        transform: `translateZ(${z}px) scale(${s})`,
        opacity: Math.min(1, s * 1.3),
        display: "flex",
        alignItems: "center",
        gap: 9,
        padding: "10px 14px",
        borderRadius: 99,
        background: `${color}1c`,
        border: `1px solid ${color}66`,
        color,
        fontFamily: P.mono,
        fontSize: 15,
        letterSpacing: "0.12em",
        boxShadow: `0 0 44px ${color}2e`,
      }}
    >
      <svg width={15} height={15} viewBox="0 0 24 24" fill="none">
        <path d="M12 3L22 20H2L12 3z" stroke={color} strokeWidth={2} strokeLinejoin="round" />
        <path d="M12 10v5M12 17.6v.4" stroke={color} strokeWidth={2} strokeLinecap="round" />
      </svg>
      {label}
    </div>
  );
};

const PriceCard: React.FC<{
  file: string;
  tag: string;
  price: string;
  accent: string;
  x: number;
  y: number;
  z: number;
  rotY: number;
  delay: number;
}> = ({ file, tag, price, accent, x, y, z, rotY, delay }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: frame - delay, fps, config: { damping: 15, stiffness: 90, mass: 0.9 } });
  const bob = Math.sin((frame - delay) / 34) * 12;
  return (
    <GlassCard
      glow={`${accent}22`}
      style={{
        position: "absolute",
        left: x,
        top: y + bob,
        width: 430,
        padding: "26px 30px",
        transform: `translateZ(${z}px) rotateY(${rotY}deg) translateY(${(1 - s) * 140}px)`,
        opacity: Math.min(1, s * 1.25),
        transformStyle: "preserve-3d",
      }}
    >
      <div style={{ fontFamily: P.mono, fontSize: 13, letterSpacing: "0.14em", color: accent, marginBottom: 14 }}>
        {tag}
      </div>
      <div style={{ fontFamily: P.sans, fontSize: 25, fontWeight: 700, color: P.ink, marginBottom: 10 }}>{file}</div>
      <div style={{ fontFamily: P.mono, fontSize: 40, fontWeight: 700, color: P.ink }}>{price}</div>
    </GlassCard>
  );
};

export const Scene1_TheHook: React.FC = () => {
  const frame = useCurrentFrame();
  const camera = useCamera([
    { at: 0, rotX: 10, rotY: -7, zoom: 1.14, x: 0, y: 20 },
    { at: beat(8), rotX: 5, rotY: -2.5, zoom: 1.04, x: 0, y: 0 },
    { at: 239, rotX: 4, rotY: -1.5, zoom: 1.0, x: 0, y: 0 },
  ]);
  const questionIn = interpolate(frame, [CUES.textTicks[2], CUES.textTicks[2] + 24], [0, 1], {
    easing: EXPO_OUT,
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const conflictPulse = 0.5 + Math.sin(frame / 9) * 0.5;
  return (
    <AbsoluteFill>
      <Backdrop accent={P.violet} />
      <Stage camera={camera}>
        {/* Floating conflict field, behind the type plane. */}
        <PriceCard {...PROMO_COPY.draft} accent={P.amber} x={190} y={560} z={-260} rotY={9} delay={beat(4)} />
        <PriceCard {...PROMO_COPY.final} accent={P.ink} x={1310} y={540} z={-180} rotY={-9} delay={beat(5)} />
        <div
          style={{
            position: "absolute",
            left: 918,
            top: 640,
            transform: "translateZ(-120px)",
            fontFamily: P.mono,
            fontSize: 64,
            color: P.red,
            opacity: 0.35 + conflictPulse * 0.55,
            textShadow: `0 0 40px ${P.red}80`,
          }}
        >
          ≠
        </div>
        <WarningBadge label="CONFLICT" color={P.red} x={790} y={470} z={40} delay={beat(7)} />
        <WarningBadge label="2 SOURCES DISAGREE" color={P.amber} x={1210} y={880} z={90} delay={beat(8)} />
        <WarningBadge label="UNRESOLVED" color={P.red} x={330} y={860} z={140} delay={beat(9)} />

        {/* Kinetic hook copy on the front plane. */}
        <AbsoluteFill style={{ transform: "translateZ(220px)", justifyContent: "flex-start", alignItems: "center" }}>
          <div style={{ marginTop: 128, width: 1500 }}>
            <KineticLine
              text={PROMO_COPY.hookA}
              delay={CUES.textTicks[0]}
              style={{ fontFamily: P.sans, fontSize: 74, fontWeight: 800, letterSpacing: "-0.03em", color: P.muted }}
            />
            <KineticLine
              text={PROMO_COPY.hookB}
              delay={CUES.textTicks[1]}
              style={{ fontFamily: P.sans, fontSize: 108, fontWeight: 800, letterSpacing: "-0.045em", color: P.ink, marginTop: 6 }}
            />
            <div
              style={{
                opacity: questionIn,
                transform: `translateY(${(1 - questionIn) * 36}px)`,
                textAlign: "center",
                marginTop: 34,
                fontFamily: P.sans,
                fontSize: 52,
                fontWeight: 700,
                letterSpacing: "-0.02em",
                background: `linear-gradient(100deg, ${P.violet}, ${P.cyan})`,
                WebkitBackgroundClip: "text",
                backgroundClip: "text",
                color: "transparent",
              }}
            >
              {PROMO_COPY.hookC}
            </div>
          </div>
        </AbsoluteFill>
      </Stage>

      {/* Scene exit: dip to black for the reveal cut. */}
      <AbsoluteFill
        style={{
          background: "#000",
          opacity: interpolate(frame, [226, 240], [0, 1], {
            easing: Easing.in(Easing.quad),
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      />
    </AbsoluteFill>
  );
};
