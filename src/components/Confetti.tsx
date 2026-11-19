"use client";

import { useMemo } from "react";
import { motion } from "motion/react";

const COLORS = ["#58cc02", "#1cb0f6", "#fbbf24", "#fb7185", "#a78bfa"];

/** One-shot confetti burst from the centre of its (relatively positioned) parent. */
export function Confetti({ count = 28 }: { count?: number }) {
  const pieces = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => {
        const angle = (Math.PI * 2 * i) / count + Math.random() * 0.4;
        const dist = 90 + Math.random() * 130;
        return {
          id: i,
          x: Math.cos(angle) * dist,
          y: Math.sin(angle) * dist - 60,
          rotate: Math.random() * 540 - 270,
          color: COLORS[i % COLORS.length],
          w: 6 + Math.random() * 5,
          round: i % 3 === 0,
        };
      }),
    [count],
  );
  return (
    <div className="pointer-events-none absolute inset-0 z-10 overflow-visible" aria-hidden>
      <div className="absolute top-1/3 left-1/2">
        {pieces.map((p) => (
          <motion.span
            key={p.id}
            className="absolute block"
            style={{ width: p.w, height: p.w * (p.round ? 1 : 0.5), background: p.color, borderRadius: p.round ? 999 : 2 }}
            initial={{ x: 0, y: 0, opacity: 1, rotate: 0, scale: 0.6 }}
            animate={{ x: p.x, y: [0, p.y, p.y + 180], opacity: [1, 1, 0], rotate: p.rotate, scale: 1 }}
            transition={{ duration: 1.3, ease: "easeOut", times: [0, 0.45, 1] }}
          />
        ))}
      </div>
    </div>
  );
}
