"use client";

import { Check } from "lucide-react";
import { goalProgress } from "@/lib/goals";
import { cn } from "@/lib/utils";

/** Circular progress toward today's goal; turns into a check mark once reached. */
export function GoalRing({
  done,
  goal,
  size = 56,
  stroke = 6,
  className,
}: {
  done: number;
  goal: number;
  size?: number;
  stroke?: number;
  className?: string;
}) {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = goalProgress(done, goal);
  const reached = done >= goal;
  return (
    <span
      className={cn("relative inline-flex shrink-0 items-center justify-center", className)}
      style={{ width: size, height: size }}
      role="img"
      aria-label={`今日目标 ${Math.min(done, goal)}/${goal}`}
    >
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" strokeWidth={stroke} className="stroke-muted" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - progress)}
          className="stroke-primary transition-[stroke-dashoffset] duration-500 ease-out"
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-sm font-bold tabular-nums">
        {reached ? <Check className="size-5 text-primary" aria-hidden /> : `${done}/${goal}`}
      </span>
    </span>
  );
}
