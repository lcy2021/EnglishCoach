"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Table2, BarChart3 } from "lucide-react";
import { cn } from "@/lib/utils";

/** Chart colors: categorical slots 1-2 and the de-emphasis gray of the validated reference palette. */
export const CHART_COLORS = {
  blue: "#2a78d6",
  orange: "#eb6834",
  aqua: "#1baf7a",
  other: "#c3c2b7",
  grid: "#e1e0d9",
  axis: "#c3c2b7",
  muted: "#898781",
  surface: "#fcfcfb",
} as const;

export function formatCount(n: number): string {
  if (n < 10000) return Math.round(n).toLocaleString("en-US");
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 100_000 ? 1 : 0).replace(/\.0$/, "")}K`;
  return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
}

function niceTicks(max: number): number[] {
  if (max <= 0) return [0, 1];
  const rough = max / 4;
  const pow = Math.pow(10, Math.floor(Math.log10(rough)));
  // Every series here is a whole-number count, so never put ticks between integers.
  const step = Math.max(1, [1, 2, 5, 10].map((m) => m * pow).find((s) => s >= rough) ?? pow * 10);
  const top = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let v = 0; v <= top + 1e-9; v += step) ticks.push(v);
  return ticks;
}

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(640);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(Math.max(280, el.clientWidth)));
    ro.observe(el);
    setWidth(Math.max(280, el.clientWidth));
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

/** Card chrome shared by charts: title, legend slot, and the table-view twin. */
export function ChartCard({
  title,
  subtitle,
  legend,
  table,
  children,
  dim,
}: {
  title: string;
  subtitle?: string;
  legend?: ReactNode;
  table: ReactNode;
  children: ReactNode;
  dim?: boolean;
}) {
  const [asTable, setAsTable] = useState(false);
  return (
    <figure className="rounded-2xl border bg-card p-5 shadow-xs">
      <figcaption className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-bold">{title}</h3>
          {subtitle ? <p className="mt-0.5 text-sm text-muted-foreground">{subtitle}</p> : null}
        </div>
        <button
          type="button"
          onClick={() => setAsTable((v) => !v)}
          aria-pressed={asTable}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-semibold text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          {asTable ? <BarChart3 className="size-3.5" aria-hidden /> : <Table2 className="size-3.5" aria-hidden />}
          {asTable ? "图表" : "表格"}
        </button>
      </figcaption>
      {legend && !asTable ? <div className="mb-2 flex flex-wrap items-center gap-4 text-sm">{legend}</div> : null}
      <div className={cn("transition-opacity duration-200", dim && "opacity-50")}>{asTable ? table : children}</div>
    </figure>
  );
}

export function LegendKey({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-foreground">
      <span aria-hidden className="size-2.5 rounded-[3px]" style={{ background: color }} />
      {label}
    </span>
  );
}

export interface StackSeries {
  name: string;
  color: string;
}
export interface StackDatum {
  /** Short x-axis label, e.g. 11/19. */
  label: string;
  /** Long label for the tooltip, e.g. 11月19日. */
  title: string;
  values: number[];
}

/** Stacked columns: <=24px, 4px rounded data end, square baseline, 2px surface gaps. */
export function StackedColumns({
  data,
  series,
  unit,
  height = 210,
  emptyHint,
}: {
  data: StackDatum[];
  series: StackSeries[];
  unit: string;
  height?: number;
  emptyHint?: string;
}) {
  const [wrapRef, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const m = { l: 44, r: 8, t: 8, b: 26 };
  const innerW = width - m.l - m.r;
  const innerH = height - m.t - m.b;
  const totals = data.map((d) => d.values.reduce((a, b) => a + b, 0));
  const ticks = niceTicks(Math.max(...totals, 0));
  const top = ticks[ticks.length - 1];
  const y = (v: number) => m.t + innerH - (v / top) * innerH;
  const band = innerW / Math.max(data.length, 1);
  const barW = Math.min(24, band * 0.62);
  const everyN = Math.ceil(data.length / Math.max(Math.floor(innerW / 54), 1));
  const empty = totals.every((t) => t === 0);

  return (
    <div ref={wrapRef} className="relative" onPointerLeave={() => setHover(null)}>
      <svg width={width} height={height} role="img" aria-label={`${series.map((s) => s.name).join("、")}的每日${unit}`}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={m.l} x2={width - m.r} y1={y(t)} y2={y(t)} stroke={t === 0 ? CHART_COLORS.axis : CHART_COLORS.grid} strokeWidth={1} />
            <text x={m.l - 8} y={y(t)} dy="0.32em" textAnchor="end" fontSize={11} fill={CHART_COLORS.muted}>
              {formatCount(t)}
            </text>
          </g>
        ))}
        {data.map((d, i) => {
          const cx = m.l + band * i + band / 2;
          const x0 = cx - barW / 2;
          let cum = 0;
          const live = d.values.map((v, k) => ({ v, k })).filter((s) => s.v > 0);
          return (
            <g key={d.title} opacity={hover === null || hover === i ? 1 : 0.55}>
              {live.map((s, order) => {
                const y1 = y(cum + s.v);
                const y0 = y(cum);
                cum += s.v;
                const isTop = order === live.length - 1;
                const h = Math.max(y0 - y1 - (order > 0 ? 2 : 0), 1);
                const r = isTop ? Math.min(4, h, barW / 2) : 0;
                const path = `M${x0},${y1 + h} V${y1 + r} Q${x0},${y1} ${x0 + r},${y1} H${x0 + barW - r} Q${x0 + barW},${y1} ${x0 + barW},${y1 + r} V${y1 + h} Z`;
                return <path key={s.k} d={path} fill={series[s.k].color} />;
              })}
              {(data.length - 1 - i) % everyN === 0 ? (
                <text x={cx} y={height - 8} textAnchor="middle" fontSize={11} fill={CHART_COLORS.muted}>
                  {d.label}
                </text>
              ) : null}
              {/* hit target: the whole band, taller than the mark */}
              <rect
                x={cx - band / 2}
                y={m.t}
                width={band}
                height={innerH + 4}
                fill="transparent"
                tabIndex={0}
                aria-label={`${d.title}:${d.values.map((v, k) => `${series[k].name} ${formatCount(v)}`).join(",")}`}
                onPointerEnter={() => setHover(i)}
                onFocus={() => setHover(i)}
                onBlur={() => setHover(null)}
                style={{ outline: "none" }}
              />
            </g>
          );
        })}
      </svg>
      {empty && emptyHint ? (
        <p className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 text-center text-sm text-muted-foreground">
          {emptyHint}
        </p>
      ) : null}
      {hover !== null ? (
        <div
          className="pointer-events-none absolute z-10 min-w-36 rounded-xl border bg-popover px-3 py-2 text-sm shadow-md"
          style={{
            left: Math.min(Math.max(m.l + band * hover + band / 2, 84), width - 84),
            top: 0,
            transform: "translate(-50%, -4px)",
          }}
        >
          <p className="mb-1 text-xs text-muted-foreground">{data[hover].title}</p>
          {series.map((s, k) => (
            <p key={s.name} className="flex items-center justify-between gap-4">
              <span className="inline-flex items-center gap-2 text-muted-foreground">
                <span aria-hidden className="h-0.5 w-3 rounded" style={{ background: s.color }} />
                {s.name}
              </span>
              <strong className="font-bold tabular-nums">{data[hover].values[k].toLocaleString("en-US")}</strong>
            </p>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export interface RankRow {
  label: string;
  value: number;
  detail: string;
}

/** Ranked horizontal bars, one hue, value at the tip. */
export function RankedBars({ rows, color = CHART_COLORS.blue }: { rows: RankRow[]; color?: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(...rows.map((r) => r.value), 1);
  const total = rows.reduce((a, r) => a + r.value, 0) || 1;
  return (
    <ul className="space-y-2.5" onPointerLeave={() => setHover(null)}>
      {rows.map((row, i) => (
        <li
          key={row.label}
          className="relative grid grid-cols-[6.5rem_minmax(0,1fr)] items-center gap-3"
          onPointerEnter={() => setHover(i)}
          onFocus={() => setHover(i)}
          onBlur={() => setHover(null)}
          tabIndex={0}
          aria-label={`${row.label}:${row.value.toLocaleString("en-US")} tokens,${row.detail}`}
        >
          <span className="truncate text-sm text-foreground">{row.label}</span>
          <span className="flex items-center gap-2">
            <span
              className="h-3 rounded-r-[4px] rounded-l-none transition-opacity"
              style={{
                width: `max(4px, calc((100% - 4.5rem) * ${row.value / max}))`,
                background: color,
                opacity: hover === null || hover === i ? 1 : 0.55,
              }}
            />
            <span className="text-sm font-semibold tabular-nums">{formatCount(row.value)}</span>
          </span>
          {hover === i ? (
            <span className="pointer-events-none absolute -top-9 left-28 z-10 rounded-xl border bg-popover px-3 py-1.5 text-xs whitespace-nowrap shadow-md">
              <strong className="font-bold tabular-nums">{row.value.toLocaleString("en-US")}</strong>
              <span className="ml-1.5 text-muted-foreground">
                tokens · 占 {Math.round((row.value / total) * 100)}% · {row.detail}
              </span>
            </span>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

/** Accessible twin of any chart. */
export function DataTable({ head, rows }: { head: string[]; rows: Array<Array<string | number>> }) {
  return (
    <div className="max-h-72 overflow-auto">
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-card text-left text-xs text-muted-foreground">
          <tr>
            {head.map((h, i) => (
              <th key={h} className={cn("px-2 py-1.5 font-semibold", i > 0 && "text-right")}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={String(r[0])} className="border-t">
              {r.map((cell, i) => (
                <td key={i} className={cn("px-2 py-1.5", i > 0 && "text-right tabular-nums")}>
                  {typeof cell === "number" ? cell.toLocaleString("en-US") : cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
