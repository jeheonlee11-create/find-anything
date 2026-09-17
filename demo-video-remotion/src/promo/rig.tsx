/**
 * Motion utilities for the promo: the virtual camera rig, the Bézier cursor,
 * glassmorphic cards, kinetic type, and the ambient backdrop.
 *
 * Conventions:
 * - The STAGE owns `perspective`; the WORLD receives inverse camera transforms.
 * - Every eased value is either a Remotion `spring()` (physical moves) or a
 *   `Easing.bezier(0.16, 1, 0.3, 1)` interpolation (expo-out, editorial moves).
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
import { P } from "./promo-config";

export const EXPO_OUT = Easing.bezier(0.16, 1, 0.3, 1);
export const SOFT = Easing.bezier(0.4, 0, 0.2, 1);

/* ------------------------------------------------------------------ camera */

export interface CameraShot {
  /** Frame (scene-local) at which this shot's pose is fully reached. */
  at: number;
  rotX: number;
  rotY: number;
  zoom: number;
  x: number;
  y: number;
}

/**
 * Interpolates a camera pose through an ordered list of shots with expo-out
 * easing per segment, then springs the final 15% for a physical settle.
 */
export function useCamera(shots: CameraShot[]) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const ats = shots.map((s) => s.at);
  const pose = (key: "rotX" | "rotY" | "zoom" | "x" | "y") =>
    interpolate(frame, ats, shots.map((s) => s[key]), {
      easing: EXPO_OUT,
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    });
  // A gentle, always-on breathing drift so holds never feel frozen.
  const drift = spring({ frame, fps, config: { damping: 200 } });
  const breathe = Math.sin(frame / 47) * 0.35 * drift;
  return {
    rotX: pose("rotX") + breathe * 0.4,
    rotY: pose("rotY") + Math.cos(frame / 61) * 0.3 * drift,
    zoom: pose("zoom"),
    x: pose("x"),
    y: pose("y"),
  };
}

export const Stage: React.FC<{
  camera: ReturnType<typeof useCamera>;
  children: React.ReactNode;
  perspective?: number;
}> = ({ camera, children, perspective = 1600 }) => (
  <AbsoluteFill style={{ perspective, perspectiveOrigin: "50% 42%" }}>
    <AbsoluteFill
      style={{
        transformStyle: "preserve-3d",
        transform: `translate3d(${camera.x}px, ${camera.y}px, 0) scale3d(${camera.zoom}, ${camera.zoom}, 1) rotateX(${camera.rotX}deg) rotateY(${camera.rotY}deg)`,
      }}
    >
      {children}
    </AbsoluteFill>
  </AbsoluteFill>
);

/* ------------------------------------------------------------------ cursor */

type Pt = { x: number; y: number };
const cubic = (a: Pt, b: Pt, c: Pt, d: Pt, t: number): Pt => {
  const u = 1 - t;
  return {
    x: u * u * u * a.x + 3 * u * u * t * b.x + 3 * u * t * t * c.x + t * t * t * d.x,
    y: u * u * u * a.y + 3 * u * u * t * b.y + 3 * u * t * t * c.y + t * t * t * d.y,
  };
};

export interface CursorLeg {
  /** Scene-local frame range of this glide. */
  from: number;
  to: number;
  start: Pt;
  end: Pt;
  /** Control points bow the path; defaults produce a confident human arc. */
  c1?: Pt;
  c2?: Pt;
  /** Frame (scene-local) of a click at the leg's end, if any. */
  clickAt?: number;
}

export function cursorPosition(frame: number, legs: CursorLeg[]): Pt {
  let last = legs[0]?.start ?? { x: 0, y: 0 };
  for (const leg of legs) {
    if (frame < leg.from) return last;
    const t = interpolate(frame, [leg.from, leg.to], [0, 1], {
      easing: SOFT,
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    });
    const c1 = leg.c1 ?? { x: leg.start.x + (leg.end.x - leg.start.x) * 0.2, y: leg.start.y - 90 };
    const c2 = leg.c2 ?? { x: leg.start.x + (leg.end.x - leg.start.x) * 0.8, y: leg.end.y + 60 };
    const p = cubic(leg.start, c1, c2, leg.end, t);
    if (frame <= leg.to) return p;
    last = leg.end;
  }
  return last;
}

export const Cursor: React.FC<{ legs: CursorLeg[] }> = ({ legs }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = cursorPosition(frame, legs);
  const appear = spring({ frame: frame - (legs[0]?.from ?? 0) + 8, fps, config: { damping: 200 } });
  const clicks = legs.filter((l) => l.clickAt !== undefined);
  return (
    <div style={{ position: "absolute", left: 0, top: 0, zIndex: 60, opacity: appear }}>
      {clicks.map((leg, i) => {
        const dt = frame - (leg.clickAt as number);
        if (dt < 0 || dt > 26) return null;
        const r = interpolate(dt, [0, 26], [10, 74], { easing: EXPO_OUT });
        const o = interpolate(dt, [0, 26], [0.65, 0]);
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: leg.end.x - r,
              top: leg.end.y - r,
              width: r * 2,
              height: r * 2,
              borderRadius: "50%",
              border: `2px solid ${P.ink}`,
              opacity: o,
            }}
          />
        );
      })}
      <svg
        width={34}
        height={34}
        viewBox="0 0 24 24"
        style={{
          position: "absolute",
          left: p.x,
          top: p.y,
          filter: "drop-shadow(0 4px 14px rgba(0,0,0,0.65))",
        }}
      >
        <path d="M5 3l14 8.5-6.2 1.4L9.5 19z" fill={P.ink} stroke="#0b0d1a" strokeWidth={1.4} />
      </svg>
    </div>
  );
};

/** Spring bounce applied to a card at a click frame (scale dip and recover). */
export function useClickBounce(clickAt: number) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  if (frame < clickAt) return 1;
  const s = spring({ frame: frame - clickAt, fps, config: { damping: 12, stiffness: 210, mass: 0.6 } });
  return 1 - 0.055 * (1 - s);
}

/* ------------------------------------------------------------------- glass */

export const GlassCard: React.FC<{
  style?: React.CSSProperties;
  glow?: string;
  children: React.ReactNode;
}> = ({ style, glow, children }) => (
  <div
    style={{
      background: P.glass,
      backdropFilter: "blur(24px)",
      WebkitBackdropFilter: "blur(24px)",
      border: `1px solid ${P.glassBorder}`,
      borderRadius: 18,
      boxShadow: `0 30px 80px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.09)${glow ? `, 0 0 90px ${glow}` : ""}`,
      ...style,
    }}
  >
    {children}
  </div>
);

/* ------------------------------------------------------------ kinetic type */

/** Word-by-word rise with spring overshoot; the promo's kinetic voice. */
export const KineticLine: React.FC<{
  text: string;
  delay: number;
  perWord?: number;
  style?: React.CSSProperties;
}> = ({ text, delay, perWord = 4, style }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: "0 0.28em", ...style }}>
      {text.split(" ").map((word, i) => {
        const s = spring({
          frame: frame - delay - i * perWord,
          fps,
          config: { damping: 16, stiffness: 130, mass: 0.7 },
        });
        return (
          <span
            key={i}
            style={{
              display: "inline-block",
              opacity: Math.min(1, s * 1.4),
              transform: `translateY(${(1 - s) * 68}px) scale(${0.94 + s * 0.06})`,
            }}
          >
            {word}
          </span>
        );
      })}
    </div>
  );
};

/* ---------------------------------------------------------------- backdrop */

const GRAIN =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='240' height='240'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/%3E%3C/filter%3E%3Crect width='240' height='240' filter='url(%23n)' opacity='0.5'/%3E%3C/svg%3E\")";

/** Deep slate ground, drifting violet/cyan glow orbs, grain, and vignette. */
export const Backdrop: React.FC<{ accent?: string }> = ({ accent = P.violet }) => {
  const frame = useCurrentFrame();
  const ox = Math.sin(frame / 90) * 60;
  const oy = Math.cos(frame / 110) * 40;
  return (
    <AbsoluteFill style={{ background: `radial-gradient(120% 90% at 50% 20%, ${P.bgDeep} 0%, ${P.bg} 62%, #050509 100%)` }}>
      <div
        style={{
          position: "absolute",
          left: `calc(18% + ${ox}px)`,
          top: `calc(8% + ${oy}px)`,
          width: 900,
          height: 900,
          borderRadius: "50%",
          background: `radial-gradient(circle, ${accent}33 0%, transparent 62%)`,
          filter: "blur(20px)",
        }}
      />
      <div
        style={{
          position: "absolute",
          right: `calc(8% + ${oy}px)`,
          bottom: `calc(2% + ${ox * 0.6}px)`,
          width: 760,
          height: 760,
          borderRadius: "50%",
          background: `radial-gradient(circle, ${P.cyan}1f 0%, transparent 60%)`,
          filter: "blur(24px)",
        }}
      />
      <AbsoluteFill style={{ backgroundImage: GRAIN, opacity: 0.05, mixBlendMode: "overlay" }} />
      <AbsoluteFill style={{ background: "radial-gradient(105% 85% at 50% 45%, transparent 58%, rgba(0,0,0,0.55) 100%)" }} />
    </AbsoluteFill>
  );
};
