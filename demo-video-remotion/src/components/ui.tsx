import React from "react";
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { theme } from "../theme";

/** Scene content wrapper. Transparent so the persistent CinematicBackground
 *  shows through and bridges the cuts. */
export const Frame: React.FC<{ children: React.ReactNode; tint?: string }> = ({
  children,
}) => (
  <div
    style={{
      position: "absolute",
      inset: 0,
      background: "transparent",
      fontFamily: theme.sans,
      color: theme.ink,
      overflow: "hidden",
    }}
  >
    {children}
  </div>
);

/** Rises + fades in with spring, staggered by `delay` frames; optional blur-in. */
export const Rise: React.FC<{
  children: React.ReactNode;
  delay?: number;
  y?: number;
  blur?: number;
  style?: React.CSSProperties;
}> = ({ children, delay = 0, y = 40, blur = 0, style }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: frame - delay, fps, config: { damping: 200, mass: 0.7 } });
  return (
    <div
      style={{
        ...style,
        opacity: s,
        transform: `translateY(${interpolate(s, [0, 1], [y, 0])}px)`,
        filter: blur ? `blur(${interpolate(s, [0, 1], [blur, 0])}px)` : undefined,
      }}
    >
      {children}
    </div>
  );
};

export const Kicker: React.FC<{ children: React.ReactNode; delay?: number }> = ({
  children,
  delay = 0,
}) => (
  <Rise delay={delay} y={16}>
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 16,
        fontFamily: theme.mono,
        fontSize: 26,
        letterSpacing: 6,
        textTransform: "uppercase",
        color: theme.lime,
      }}
    >
      <span style={{ width: 44, height: 2, background: theme.lime }} />
      {children}
    </div>
  </Rise>
);

export const BigText: React.FC<{
  children: React.ReactNode;
  size?: number;
  delay?: number;
  color?: string;
  style?: React.CSSProperties;
}> = ({ children, size = 96, delay = 0, color = theme.ink, style }) => (
  <Rise delay={delay} blur={18} y={28}>
    <div
      style={{
        fontSize: size,
        lineHeight: 1.02,
        letterSpacing: -size * 0.03,
        fontWeight: 800,
        color,
        textShadow: `0 2px 40px rgba(0,0,0,0.35)`,
        ...style,
      }}
    >
      {children}
    </div>
  </Rise>
);

export const Pill: React.FC<{
  children: React.ReactNode;
  delay?: number;
  active?: boolean;
}> = ({ children, delay = 0, active = false }) => (
  <Rise delay={delay} y={18}>
    <div
      style={{
        fontFamily: theme.mono,
        fontSize: 24,
        padding: "12px 20px",
        borderRadius: 999,
        border: `1px solid ${active ? theme.lime : theme.line2}`,
        color: active ? theme.lime : theme.muted,
        background: active ? theme.accentSoft : "transparent",
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </div>
  </Rise>
);

/** A moving cursor that eases between waypoints keyed to frames. */
export const Cursor: React.FC<{
  path: { frame: number; x: number; y: number }[];
  click?: number[];
}> = ({ path, click = [] }) => {
  const frame = useCurrentFrame();
  const xs = path.map((p) => p.x);
  const ys = path.map((p) => p.y);
  const frames = path.map((p) => p.frame);
  const x = interpolate(frame, frames, xs, {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: (t) => t * t * (3 - 2 * t),
  });
  const y = interpolate(frame, frames, ys, {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: (t) => t * t * (3 - 2 * t),
  });
  const near = click.find((c) => Math.abs(frame - c) < 8);
  const clickScale = near ? interpolate(Math.abs(frame - near), [0, 8], [0.7, 1]) : 1;
  return (
    <div style={{ position: "absolute", left: x, top: y, zIndex: 50 }}>
      {near && (
        <div
          style={{
            position: "absolute",
            left: -18,
            top: -18,
            width: 36,
            height: 36,
            borderRadius: "50%",
            border: `2px solid ${theme.lime}`,
            opacity: interpolate(Math.abs(frame - near), [0, 8], [0.9, 0]),
            transform: `scale(${interpolate(Math.abs(frame - near), [0, 8], [1.6, 0.4])})`,
          }}
        />
      )}
      <svg width="34" height="34" viewBox="0 0 24 24" style={{ transform: `scale(${clickScale})`, filter: "drop-shadow(0 2px 6px rgba(0,0,0,.6))" }}>
        <path d="M4 2l6 15 2.2-5.6L18 9.2z" fill={theme.ink} stroke={theme.bg} strokeWidth="1.4" />
      </svg>
    </div>
  );
};

/** Progress dots showing where we are in the story (1-indexed). */
export const StoryDots: React.FC<{ total: number; active: number }> = ({ total, active }) => (
  <div style={{ position: "absolute", bottom: 54, left: 96, display: "flex", gap: 12 }}>
    {Array.from({ length: total }).map((_, i) => (
      <div
        key={i}
        style={{
          width: i === active ? 34 : 10,
          height: 10,
          borderRadius: 999,
          background: i === active ? theme.lime : theme.line2,
          transition: "all .3s",
        }}
      />
    ))}
  </div>
);

/** Bottom-left brand lockup shown throughout. */
export const BrandMark: React.FC = () => (
  <div style={{ position: "absolute", bottom: 48, right: 96, display: "flex", alignItems: "center", gap: 14, opacity: 0.9 }}>
    <div style={{ width: 40, height: 40, borderRadius: 10, background: theme.lime, color: theme.bg, display: "grid", placeItems: "center", fontFamily: theme.mono, fontWeight: 800, fontSize: 24 }}>F</div>
    <span style={{ fontWeight: 700, fontSize: 26, letterSpacing: -0.4 }}>Find Anything</span>
  </div>
);

/** A document card used by the Draft/Final scenes. */
export const DocCard: React.FC<{
  file: string;
  tag: string;
  annual: string;
  impl: string;
  variant: "draft" | "final";
  delay?: number;
  dim?: boolean;
  badge?: string;
}> = ({ file, tag, annual, impl, variant, delay = 0, dim = false, badge }) => {
  const isFinal = variant === "final";
  const border = isFinal ? theme.lime : theme.amber;
  return (
    <Rise delay={delay} y={60}>
      <div
        style={{
          width: 720,
          border: `2px solid ${isFinal ? theme.lime : "#8a7136"}`,
          background: isFinal ? theme.accentSoft : theme.panel,
          borderRadius: 22,
          padding: 44,
          opacity: dim ? 0.85 : 1,
          boxShadow: isFinal ? `0 30px 90px ${theme.bg}` : "none",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", fontFamily: theme.mono, fontSize: 24, color: border, letterSpacing: 1 }}>
          <span>{tag}</span>
          <span style={{ color: theme.faint }}>{isFinal ? "RANK 1" : "RANK 2"}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 16, margin: "30px 0 34px" }}>
          <FileGlyph color={border} />
          <span style={{ fontFamily: theme.mono, fontSize: 34, color: theme.ink }}>{file}</span>
        </div>
        <div style={{ display: "flex", gap: 56 }}>
          <Figure label="ANNUAL" value={annual.split(" / ")[0]} accent={isFinal} />
          <Figure label="IMPLEMENTATION" value={impl.split(" ")[0]} accent={isFinal} />
        </div>
        {badge && (
          <div
            style={{
              marginTop: 34,
              display: "inline-flex",
              padding: "12px 20px",
              borderRadius: 999,
              fontFamily: theme.mono,
              fontSize: 24,
              background: isFinal ? theme.lime : "transparent",
              color: isFinal ? theme.bg : theme.amber,
              border: isFinal ? "none" : `1px solid #8a7136`,
            }}
          >
            {badge}
          </div>
        )}
      </div>
    </Rise>
  );
};

const Figure: React.FC<{ label: string; value: string; accent: boolean }> = ({ label, value, accent }) => (
  <div>
    <div style={{ fontFamily: theme.mono, fontSize: 22, color: theme.faint, letterSpacing: 1 }}>{label}</div>
    <div style={{ fontFamily: theme.mono, fontSize: 52, fontWeight: 700, letterSpacing: -1, color: accent ? theme.lime : theme.ink }}>{value}</div>
  </div>
);

const FileGlyph: React.FC<{ color: string }> = ({ color }) => (
  <svg width="40" height="40" viewBox="0 0 24 24" fill="none">
    <path d="M6 2h8l4 4v16H6z" stroke={color} strokeWidth="1.6" />
    <path d="M14 2v4h4" stroke={color} strokeWidth="1.6" />
  </svg>
);
