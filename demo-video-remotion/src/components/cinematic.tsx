import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { theme } from "../theme";

/** Deterministic pseudo-random in [0,1) from an integer seed (no Math.random,
 *  so frames are stable across the render). */
const rand = (n: number) => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/** Persistent atmospheric background that plays continuously UNDER every scene,
 *  so camera drift and particles bridge the cuts — the filmic through-line. */
export const CinematicBackground: React.FC = () => {
  const frame = useCurrentFrame();
  const { durationInFrames, width, height } = useVideoConfig();
  const p = frame / durationInFrames;

  // A large lime glow that slowly orbits the frame.
  const gx = 50 + 26 * Math.sin(p * Math.PI * 2 * 0.6 + 0.4);
  const gy = 26 + 20 * Math.cos(p * Math.PI * 2 * 0.5);
  // A cooler secondary glow drifting the other way.
  const bx = 30 + 22 * Math.cos(p * Math.PI * 2 * 0.4 + 1.2);
  const by = 78 + 14 * Math.sin(p * Math.PI * 2 * 0.45);

  const N = 46;
  return (
    <AbsoluteFill style={{ background: theme.bg }}>
      {/* base gradient wash */}
      <AbsoluteFill
        style={{
          background: `radial-gradient(60% 60% at ${gx}% ${gy}%, ${theme.lime}14 0%, transparent 55%),
                       radial-gradient(55% 55% at ${bx}% ${by}%, #6fd6c81a 0%, transparent 60%),
                       radial-gradient(120% 120% at 50% 30%, ${theme.bg2} 0%, ${theme.bg} 60%)`,
        }}
      />
      {/* drifting particles */}
      <AbsoluteFill>
        {Array.from({ length: N }).map((_, i) => {
          const seedX = rand(i * 3 + 1);
          const speed = 0.15 + rand(i * 3 + 2) * 0.5;
          const size = 1.5 + rand(i * 3 + 3) * 3.5;
          const yBase = rand(i * 7 + 5);
          const y = (yBase - ((frame / durationInFrames) * speed)) % 1;
          const yy = (y + 1) % 1;
          const x = (seedX + 0.02 * Math.sin(frame / 60 + i)) % 1;
          const twinkle = 0.25 + 0.55 * (0.5 + 0.5 * Math.sin(frame / 22 + i * 1.7));
          const lime = i % 4 === 0;
          return (
            <div
              key={i}
              style={{
                position: "absolute",
                left: `${x * 100}%`,
                top: `${yy * 100}%`,
                width: size,
                height: size,
                borderRadius: "50%",
                background: lime ? theme.lime : "#dfe7d6",
                opacity: (lime ? 0.5 : 0.28) * twinkle,
                filter: lime ? `drop-shadow(0 0 6px ${theme.lime})` : "none",
              }}
            />
          );
        })}
      </AbsoluteFill>
      {/* slow diagonal sheen */}
      <AbsoluteFill
        style={{
          background: `linear-gradient(115deg, transparent 40%, ${theme.lime}0c 50%, transparent 60%)`,
          transform: `translateX(${interpolate(Math.sin(p * Math.PI * 2), [-1, 1], [-width * 0.3, width * 0.3])}px)`,
          mixBlendMode: "screen",
        }}
      />
      {/* vignette */}
      <AbsoluteFill
        style={{
          boxShadow: `inset 0 0 ${height * 0.5}px ${height * 0.18}px rgba(0,0,0,0.65)`,
          background: "radial-gradient(120% 120% at 50% 50%, transparent 55%, rgba(0,0,0,0.5) 100%)",
        }}
      />
      <Grain />
    </AbsoluteFill>
  );
};

/** Cheap film grain: a tiled fractal-noise data URI, gently jittered. */
export const Grain: React.FC = () => {
  const frame = useCurrentFrame();
  const noise =
    "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E";
  const jx = (frame * 7) % 160;
  const jy = (frame * 11) % 160;
  return (
    <AbsoluteFill
      style={{
        backgroundImage: `url("${noise}")`,
        backgroundPosition: `${jx}px ${jy}px`,
        opacity: 0.05,
        mixBlendMode: "overlay",
        pointerEvents: "none",
      }}
    />
  );
};

/** Virtual camera: a slow push-in + drift over the life of a scene, plus a soft
 *  focus-dissolve on entry and exit. Gives every scene continuous motion. */
export const Camera: React.FC<{
  duration: number;
  children: React.ReactNode;
  from?: number; // start scale
  drift?: [number, number]; // px drift over the scene
  fade?: number; // transition frames
}> = ({ duration, children, from = 1.08, drift = [0, -18], fade = 16 }) => {
  const frame = useCurrentFrame();
  const t = Math.min(1, Math.max(0, frame / duration));
  const scale = interpolate(easeOut(t), [0, 1], [from, 1.0]);
  const dx = interpolate(easeInOut(t), [0, 1], [0, drift[0]]);
  const dy = interpolate(easeInOut(t), [0, 1], [0, drift[1]]);

  const opacity = interpolate(frame, [0, fade, duration - fade, duration], [0, 1, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const blur = interpolate(frame, [0, fade, duration - fade, duration], [14, 0, 0, 14], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const enterScale = interpolate(frame, [0, fade, duration - fade, duration], [1.04, 1, 1, 0.99], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return (
    <AbsoluteFill style={{ opacity, filter: `blur(${blur}px)` }}>
      <AbsoluteFill style={{ transform: `scale(${scale * enterScale}) translate(${dx}px, ${dy}px)`, transformOrigin: "50% 46%" }}>
        {children}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

/** Kinetic headline — each word rises + unblurs, staggered. */
export const Words: React.FC<{
  text: string;
  size?: number;
  delay?: number;
  color?: string;
  stagger?: number;
  style?: React.CSSProperties;
}> = ({ text, size = 92, delay = 0, color = theme.ink, stagger = 4, style }) => {
  const frame = useCurrentFrame();
  const words = text.split(" ");
  return (
    <div style={{ fontSize: size, lineHeight: 1.02, letterSpacing: -size * 0.03, fontWeight: 800, color, display: "flex", flexWrap: "wrap", gap: `0 ${size * 0.24}px`, ...style }}>
      {words.map((w, i) => {
        const local = frame - delay - i * stagger;
        const t = Math.min(1, Math.max(0, local / 14));
        const e = easeOut(t);
        return (
          <span
            key={i}
            style={{
              display: "inline-block",
              opacity: e,
              transform: `translateY(${(1 - e) * size * 0.5}px)`,
              filter: `blur(${(1 - e) * 14}px)`,
            }}
          >
            {w}
          </span>
        );
      })}
    </div>
  );
};
