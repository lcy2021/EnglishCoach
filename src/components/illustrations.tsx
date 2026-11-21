import { cn } from "@/lib/utils";

function Sparkle({ x, y, size = 8, delay = 0, color = "#fbbf24" }: { x: number; y: number; size?: number; delay?: number; color?: string }) {
  return (
    <path
      className="sparkle"
      style={{ animationDelay: `${delay}s` }}
      transform={`translate(${x} ${y})`}
      d={`M0 ${-size} Q0 0 ${size} 0 Q0 0 0 ${size} Q0 0 ${-size} 0 Q0 0 0 ${-size}Z`}
      fill={color}
    />
  );
}

/** Friendly owl mascot. Floats, blinks and twinkles. */
export function Mascot({
  className,
  mood = "happy",
  float = true,
}: {
  className?: string;
  mood?: "happy" | "cheer" | "think";
  float?: boolean;
}) {
  const dark = "oklch(0.52 0.17 142)";
  const main = "oklch(0.72 0.2 142)";
  // Think pupils start centered (slightly up); SMIL slides them with the lean.
  const look = mood === "think" ? { x: 0, y: -3 } : { x: 0, y: 1 };
  return (
    <svg viewBox="0 0 120 130" className={cn("overflow-visible", className)} role="img" aria-label="English Coach 吉祥物">
      <ellipse className="mascot-shadow" cx="60" cy="122" rx="30" ry="5" fill="#1f2937" />
      <g className={float ? "mascot-float" : undefined}>
        {/* Slight lean while thinking — SMIL so the motion always plays in SVG. */}
        <g>
          {mood === "think" ? (
            <animateTransform
              attributeName="transform"
              type="rotate"
              values="-10 60 112;10 60 112;-10 60 112"
              keyTimes="0;0.5;1"
              dur="1.6s"
              repeatCount="indefinite"
              calcMode="spline"
              keySplines="0.4 0 0.2 1;0.4 0 0.2 1"
            />
          ) : null}
          {/* ear tufts */}
          <path d="M32 36 L27 14 L50 28 Z" fill={dark} stroke={dark} strokeWidth="6" strokeLinejoin="round" />
          <path d="M88 36 L93 14 L70 28 Z" fill={dark} stroke={dark} strokeWidth="6" strokeLinejoin="round" />
          {/* wings */}
          <g className={mood === "cheer" ? "wing-wave-l" : undefined} style={{ transformBox: "fill-box", transformOrigin: "80% 20%" }}>
            <ellipse cx="20" cy="74" rx="9" ry="19" fill={dark} transform={mood === "cheer" ? "rotate(-40 20 66)" : "rotate(12 20 74)"} />
          </g>
          <g className={mood === "cheer" ? "wing-wave-r" : undefined} style={{ transformBox: "fill-box", transformOrigin: "20% 20%" }}>
            <ellipse cx="100" cy="74" rx="9" ry="19" fill={dark} transform={mood === "cheer" ? "rotate(40 100 66)" : "rotate(-12 100 74)"} />
          </g>
          {/* body */}
          <ellipse cx="60" cy="74" rx="40" ry="42" fill={dark} />
          <ellipse cx="60" cy="69" rx="40" ry="42" fill={main} />
          {/* belly */}
          <ellipse cx="60" cy="90" rx="23" ry="20" fill="#f0fdf4" />
          <path d="M50 84 q4 4 8 0 M62 84 q4 4 8 0 M56 94 q4 4 8 0" fill="none" stroke={main} strokeWidth="2.2" strokeLinecap="round" opacity="0.55" />
          {/* eyes */}
          <circle cx="43" cy="55" r="14" fill="#fff" />
          <circle cx="77" cy="55" r="14" fill="#fff" />
          {mood === "cheer" ? (
            <g fill="none" stroke="#1f2937" strokeWidth="3.5" strokeLinecap="round">
              <path d="M36 57 Q43 48 50 57" />
              <path d="M70 57 Q77 48 84 57" />
            </g>
          ) : (
            <g className={mood === "think" ? "mascot-eye-think" : "mascot-eye"}>
              <circle cx={43 + look.x} cy={56 + look.y} r="6.5" fill="#1f2937" />
              <circle cx={77 + look.x} cy={56 + look.y} r="6.5" fill="#1f2937" />
              <circle cx={45 + look.x} cy={53.5 + look.y} r="2.2" fill="#fff" />
              <circle cx={79 + look.x} cy={53.5 + look.y} r="2.2" fill="#fff" />
              {mood === "think" ? (
                <animateTransform
                  attributeName="transform"
                  type="translate"
                  values="-5 0;5 0;-5 0"
                  keyTimes="0;0.5;1"
                  dur="1.6s"
                  repeatCount="indefinite"
                  calcMode="spline"
                  keySplines="0.4 0 0.2 1;0.4 0 0.2 1"
                />
              ) : null}
            </g>
          )}
          {/* beak + cheeks */}
          <path d="M54 66 Q60 63 66 66 L60 77 Z" fill="#fbbf24" stroke="#fbbf24" strokeWidth="3" strokeLinejoin="round" />
          {mood === "cheer" ? <path d="M55 77 Q60 84 65 77 Z" fill="#fb7185" /> : null}
          <circle cx="28" cy="70" r="5" fill="#fda4af" opacity="0.8" />
          <circle cx="92" cy="70" r="5" fill="#fda4af" opacity="0.8" />
          {/* feet */}
          <g fill="none" stroke="#f59e0b" strokeWidth="3.5" strokeLinecap="round">
            <path d="M46 112 v-2 M42 112 h8 M74 112 v-2 M70 112 h8" />
          </g>
        </g>
      </g>
      <Sparkle x={106} y={38} size={8} />
      <Sparkle x={10} y={56} size={6} delay={0.8} color="#38bdf8" />
      <Sparkle x={108} y={86} size={5} delay={1.5} color="#fb7185" />
    </svg>
  );
}

/**
 * Thinking owl loader — same mascot as the pet, eyes up + rising thought bubbles.
 * Replaces the old three-dot typing indicator in the coach panel.
 */
export function OwlThinking({
  className,
  size = "sm",
}: {
  className?: string;
  size?: "sm" | "md" | "lg";
}) {
  const width = size === "lg" ? "w-28" : size === "md" ? "w-16" : "w-10";
  return (
    <span className={cn("owl-thinking owl-thinking--live", className)} aria-hidden>
      <Mascot className={width} mood="think" float />
      <span className="owl-thinking__bubbles">
        <i />
        <i />
        <i className="owl-thinking__q">?</i>
      </span>
    </span>
  );
}

/** Compact owl face for the logo tile / avatars. Inherits currentColor for the body cutout. */
export function OwlMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <path d="M5 14 L4 5 L12 9 Z M27 14 L28 5 L20 9 Z" fill="#fff" opacity="0.85" />
      <rect x="4" y="7" width="24" height="21" rx="10" fill="#fff" />
      <circle cx="11.5" cy="16" r="4.6" fill="oklch(0.72 0.2 142)" opacity="0.25" />
      <circle cx="20.5" cy="16" r="4.6" fill="oklch(0.72 0.2 142)" opacity="0.25" />
      <circle cx="11.5" cy="16" r="2.6" fill="#1f2937" />
      <circle cx="20.5" cy="16" r="2.6" fill="#1f2937" />
      <circle cx="12.3" cy="15.2" r="0.9" fill="#fff" />
      <circle cx="21.3" cy="15.2" r="0.9" fill="#fff" />
      <path d="M13.5 20.5 Q16 19.3 18.5 20.5 L16 24.5 Z" fill="#fbbf24" stroke="#fbbf24" strokeWidth="1" strokeLinejoin="round" />
    </svg>
  );
}

/** Small themed illustrations for empty states. */
export function EmptyIllustration({ kind, className }: { kind: "library" | "trophy"; className?: string }) {
  if (kind === "library") {
    return (
      <svg viewBox="0 0 120 100" className={cn("overflow-visible", className)} aria-hidden>
        <g className="mascot-float">
          <rect x="18" y="40" width="20" height="46" rx="5" fill="#38bdf8" />
          <rect x="42" y="28" width="22" height="58" rx="5" fill="oklch(0.72 0.2 142)" />
          <rect x="68" y="44" width="18" height="42" rx="5" fill="#fbbf24" />
          <g transform="rotate(14 100 70)">
            <rect x="90" y="46" width="18" height="40" rx="5" fill="#fb7185" />
          </g>
          <rect x="10" y="86" width="100" height="6" rx="3" fill="#cbd5e1" />
          <path d="M24 52 h8 M24 60 h8" stroke="#fff" strokeWidth="2" strokeLinecap="round" opacity="0.7" />
          <path d="M48 40 h10 M48 48 h10" stroke="#fff" strokeWidth="2" strokeLinecap="round" opacity="0.7" />
        </g>
        <Sparkle x={104} y={22} size={7} />
        <Sparkle x={14} y={26} size={5} delay={1} color="#38bdf8" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 120 110" className={cn("overflow-visible", className)} aria-hidden>
      <g className="mascot-float">
        <path d="M36 22 H84 V50 a24 24 0 0 1 -48 0 Z" fill="#fbbf24" />
        <path d="M36 28 H22 q0 22 18 24 M84 28 H98 q0 22 -18 24" fill="none" stroke="#f59e0b" strokeWidth="5" strokeLinecap="round" />
        <rect x="54" y="74" width="12" height="14" fill="#f59e0b" />
        <rect x="40" y="88" width="40" height="10" rx="4" fill="#d97706" />
        <path d="M60 32 l4 9 10 1 -8 7 3 10 -9 -6 -9 6 3 -10 -8 -7 10 -1 Z" fill="#fff" opacity="0.9" />
      </g>
      <Sparkle x={104} y={24} size={8} />
      <Sparkle x={12} y={40} size={6} delay={0.7} color="#38bdf8" />
      <Sparkle x={96} y={86} size={5} delay={1.4} color="#fb7185" />
    </svg>
  );
}
