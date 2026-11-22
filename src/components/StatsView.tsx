"use client";

import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { motion } from "motion/react";
import { GoalRing } from "@/components/GoalRing";
import { GOAL_CHOICES, weekCompare } from "@/lib/goals";
import { useGoal } from "@/lib/store/goal";
import {
  CHART_COLORS,
  ChartCard,
  DataTable,
  LegendKey,
  RankedBars,
  StackedColumns,
} from "@/components/charts";
import { cn } from "@/lib/utils";
import { useToday } from "@/lib/store/today";
import { useWorkspace } from "@/lib/store/workspace";
import { BookLoader } from "@/components/ui/loader";

export interface StatsPayload {
  days: DayPoint[];
  today: DayPoint;
  window: { input: number; output: number; calls: number; drills: number; perfect: number };
  allTime: { drills: number; tokens: number };
  streakDays: number;
  bySource: Array<{ source: string; tokens: number; calls: number }>;
}
interface DayPoint {
  date: string;
  input: number;
  output: number;
  calls: number;
  drills: number;
  perfect: number;
}

const RANGES = [
  { days: 7, label: "近 7 天" },
  { days: 14, label: "近 14 天" },
  { days: 30, label: "近 30 天" },
  { days: 0, label: "全部" },
] as const;

const SOURCE_LABEL: Record<string, string> = {
  chat: "教练对话",
  "drill-create": "AI 出题",
  "drill-grade": "出题批改",
  converse: "对话模式",
  "check-translation": "翻译批改",
  "generate-explain": "整篇讲解",
  "paragraph-explain": "段落讲解",
  "explain-selection": "选句讲解",
  "fetch-clean": "Web搜索清理",
  other: "其他",
};

function shortDate(key: string): string {
  const [, m, d] = key.split("-");
  return `${Number(m)}/${Number(d)}`;
}
function longDate(key: string): string {
  const [, m, d] = key.split("-");
  return `${Number(m)}月${Number(d)}日`;
}

function Tile({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="rounded-2xl border bg-card px-4 py-3.5 shadow-xs">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold tracking-tight">{value}</p>
      {note ? <p className="mt-0.5 text-xs text-muted-foreground">{note}</p> : null}
    </div>
  );
}

function Delta({ now, before, unit = "" }: { now: number | null; before: number | null; unit?: string }) {
  if (now === null || before === null) return <span className="text-muted-foreground">上周没有数据</span>;
  const diff = now - before;
  if (diff === 0) return <span className="text-muted-foreground">和上周持平</span>;
  return (
    <span className={diff > 0 ? "text-primary" : "text-muted-foreground"}>
      {diff > 0 ? "比上周多 " : "比上周少 "}
      {Math.abs(diff)}
      {unit}
    </span>
  );
}

/** This week against the last, from the trailing 14 days regardless of the chart range. */
function WeeklyReport({ days }: { days: DayPoint[] | null }) {
  if (!days) return null;
  const { thisWeek, lastWeek } = weekCompare(days);
  const rows: Array<{ label: string; value: string; note: React.ReactNode }> = [
    {
      label: "练习题数",
      value: `${thisWeek.drills} 题`,
      note: <Delta now={thisWeek.drills} before={lastWeek.drills} unit=" 题" />,
    },
    {
      label: "练习天数",
      value: `${thisWeek.activeDays} / 7 天`,
      note: <Delta now={thisWeek.activeDays} before={lastWeek.activeDays} unit=" 天" />,
    },
    {
      label: "全对率",
      value: thisWeek.perfectRate === null ? "—" : `${thisWeek.perfectRate}%`,
      note: <Delta now={thisWeek.perfectRate} before={lastWeek.perfectRate} unit="%" />,
    },
  ];
  return (
    <div className="rounded-2xl border bg-card p-4 shadow-xs">
      <h2 className="text-base font-semibold">本周周报</h2>
      <p className="text-sm text-muted-foreground">最近 7 天,和前 7 天比一比</p>
      {thisWeek.drills === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">这周还没有练习,今天做一题就开了个好头。</p>
      ) : (
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          {rows.map((row) => (
            <div key={row.label} className="rounded-xl bg-muted/60 px-3.5 py-3">
              <p className="text-xs text-muted-foreground">{row.label}</p>
              <p className="mt-0.5 text-xl font-semibold tracking-tight">{row.value}</p>
              <p className="mt-0.5 text-xs">{row.note}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function StatsView() {
  const goal = useGoal((s) => s.goal);
  const setGoal = useGoal((s) => s.setGoal);
  const [range, setRange] = useState<number>(14);
  const [stats, setStats] = useState<StatsPayload | null>(null);
  const [reportDays, setReportDays] = useState<DayPoint[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    // Defer so React strict mode does not send the request twice in dev.
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const res = await fetch(`/api/stats?days=${range}`, { cache: "no-store" });
          if (!res.ok) throw new Error("统计加载失败");
          const data = (await res.json()) as StatsPayload;
          if (cancelled) return;
          setStats(data);
          setError("");
          useToday.getState().setToday({
            drills: data.today.drills,
            tokens: data.today.input + data.today.output,
          });
          if (range === 14) setReportDays(data.days);
        } catch (caught) {
          if (!cancelled) setError(caught instanceof Error ? caught.message : "统计加载失败");
        } finally {
          if (!cancelled) setLoading(false);
        }
      })();
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [range]);

  // The weekly card needs 14 days. The default chart range is already 14, so reuse that response.
  useEffect(() => {
    if (range === 14 || reportDays) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const res = await fetch("/api/stats?days=14", { cache: "no-store" });
          if (!res.ok || cancelled) return;
          const data = (await res.json()) as StatsPayload;
          if (!cancelled) setReportDays(data.days);
        } catch {
          /* the card is optional */
        }
      })();
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [range, reportDays]);

  const pageCommand = useWorkspace((s) => s.pageCommand);
  useEffect(() => {
    const days = pageCommand?.statsDays;
    if (days === 0 || days === 7 || days === 14 || days === 30) setRange(days);
  }, [pageCommand]);

  const today = stats?.today;
  const accuracy = today && today.drills > 0 ? Math.round((today.perfect / today.drills) * 100) : null;
  const windowRate =
    stats && stats.window.drills > 0 ? Math.round((stats.window.perfect / stats.window.drills) * 100) : null;
  const hasTokens = (stats?.allTime.tokens ?? 0) > 0;

  return (
    <section className="sheet !max-w-[960px] space-y-5">
      <header className="space-y-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">学习总览</h1>
          <p className="mt-1 text-muted-foreground">今天练了多少、答得怎么样、模型花了多少 token。</p>
        </div>
        <div role="group" aria-label="时间范围" className="inline-flex rounded-xl border bg-card p-1">
          {RANGES.map((r) => {
            const on = r.days === range;
            return (
              <button
                key={r.days}
                type="button"
                aria-pressed={on}
                onClick={() => setRange(r.days)}
                className={cn(
                  "inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors",
                  on ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-muted",
                )}
              >
                {on ? <Check className="size-3.5" aria-hidden /> : null}
                {r.label}
              </button>
            );
          })}
        </div>
      </header>

      {error ? (
        <p className="rounded-xl bg-destructive/10 px-4 py-2.5 text-sm font-medium text-destructive">{error}</p>
      ) : null}

      {stats && today ? (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: "spring", stiffness: 300, damping: 28 }}
          className={cn("space-y-5 transition-opacity duration-200", loading && "opacity-60")}
        >
          <div className="grid gap-3 md:grid-cols-[1.25fr_1fr_1fr]">
            <div className="flex flex-col justify-between gap-4 rounded-2xl border-2 border-primary/30 bg-accent/60 px-5 py-4 md:row-span-2">
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm font-semibold text-accent-foreground">今日练习</p>
                <GoalRing done={today.drills} goal={goal} size={64} stroke={7} />
              </div>
              <div>
                <p className="text-[56px] leading-none font-bold tracking-tight text-foreground">
                  {today.drills}
                  <span className="ml-1.5 text-lg font-semibold text-muted-foreground">题</span>
                </p>
                <p className="mt-2 text-sm text-muted-foreground">
                  {today.drills === 0
                    ? "今天还没开始,去「AI出题」来一道吧"
                    : today.drills >= goal
                      ? `目标达成 · 全对 ${today.perfect} 题 · 正确率 ${accuracy}%`
                      : `还差 ${goal - today.drills} 题达成目标 · 全对 ${today.perfect} 题`}
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-1.5" role="group" aria-label="每日目标">
                  <span className="text-xs font-semibold text-muted-foreground">每日目标</span>
                  {GOAL_CHOICES.map((n) => (
                    <button
                      key={n}
                      type="button"
                      aria-pressed={goal === n}
                      onClick={() => setGoal(n)}
                      className={cn(
                        "rounded-lg border px-2 py-0.5 text-xs font-bold transition-colors",
                        goal === n
                          ? "border-primary bg-primary text-primary-foreground"
                          : "bg-card text-muted-foreground hover:bg-muted",
                      )}
                    >
                      {n} 题
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <Tile
              label={range === 0 ? "全部" : "今日 Token"}
              value={(range === 0 ? stats.window.input + stats.window.output : today.input + today.output).toLocaleString("en-US")}
              note={
                range === 0
                  ? `输入 ${stats.window.input.toLocaleString("en-US")} · 输出 ${stats.window.output.toLocaleString("en-US")}`
                  : `输入 ${today.input.toLocaleString("en-US")} · 输出 ${today.output.toLocaleString("en-US")}`
              }
            />
            <Tile label="连续练习" value={`${stats.streakDays} 天`} note={stats.streakDays > 0 ? "保持住!" : "今天做一题就开始计"} />
            <Tile
              label={range === 0 ? "累计题数" : `${range} 天题数`}
              value={`${stats.window.drills}`}
              note={windowRate === null ? "还没有数据" : `全对率 ${windowRate}%`}
            />
            {range === 0 ? (
              <Tile label="模型调用" value={stats.window.calls.toLocaleString("en-US")} note="全部记录" />
            ) : (
              <Tile
                label="累计题数"
                value={stats.allTime.drills.toLocaleString("en-US")}
                note={`${range} 天内调用模型 ${stats.window.calls} 次`}
              />
            )}
          </div>

          <WeeklyReport days={reportDays} />

          <ChartCard
            title="每日练习"
            subtitle={range === 0 ? "全部批改过的题" : `近 ${range} 天批改过的题`}
            dim={loading}
            legend={
              <>
                <LegendKey color={CHART_COLORS.aqua} label="全对" />
                <LegendKey color={CHART_COLORS.other} label="有错误" />
              </>
            }
            table={
              <DataTable
                head={["日期", "全对", "有错误", "合计"]}
                rows={stats.days.map((d) => [longDate(d.date), d.perfect, d.drills - d.perfect, d.drills])}
              />
            }
          >
            <StackedColumns
              unit="题数"
              series={[
                { name: "全对", color: CHART_COLORS.aqua },
                { name: "有错误", color: CHART_COLORS.other },
              ]}
              data={stats.days.map((d) => ({
                label: shortDate(d.date),
                title: longDate(d.date),
                values: [d.perfect, d.drills - d.perfect],
              }))}
              emptyHint="这段时间还没有批改过的题"
            />
          </ChartCard>

          <ChartCard
            title="Token 消耗"
            subtitle={
              hasTokens
                ? range === 0
                  ? `总共 ${(stats.window.input + stats.window.output).toLocaleString("en-US")} tokens`
                  : `近 ${range} 天共 ${(stats.window.input + stats.window.output).toLocaleString("en-US")} tokens`
                : "从现在起,每次调用模型都会记录"
            }
            dim={loading}
            legend={
              <>
                <LegendKey color={CHART_COLORS.blue} label="输入" />
                <LegendKey color={CHART_COLORS.orange} label="输出" />
              </>
            }
            table={
              <DataTable
                head={["日期", "输入", "输出", "合计", "调用次数"]}
                rows={stats.days.map((d) => [longDate(d.date), d.input, d.output, d.input + d.output, d.calls])}
              />
            }
          >
            <StackedColumns
              unit="token"
              series={[
                { name: "输入", color: CHART_COLORS.blue },
                { name: "输出", color: CHART_COLORS.orange },
              ]}
              data={stats.days.map((d) => ({
                label: shortDate(d.date),
                title: longDate(d.date),
                values: [d.input, d.output],
              }))}
              emptyHint="还没有 token 记录"
            />
          </ChartCard>

          <ChartCard
            title="Token 花在哪"
            subtitle={range === 0 ? "全部记录按功能统计,多的在上" : `近 ${range} 天按功能统计,多的在上`}
            dim={loading}
            table={
              <DataTable
                head={["功能", "Token", "调用次数"]}
                rows={stats.bySource.map((s) => [SOURCE_LABEL[s.source] ?? s.source, s.tokens, s.calls])}
              />
            }
          >
            {stats.bySource.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">还没有 token 记录</p>
            ) : (
              <RankedBars
                rows={stats.bySource.map((s) => ({
                  label: SOURCE_LABEL[s.source] ?? s.source,
                  value: s.tokens,
                  detail: `${s.calls} 次调用`,
                }))}
              />
            )}
          </ChartCard>
        </motion.div>
      ) : !error ? (
        <BookLoader label="正在统计学习数据" />
      ) : null}
    </section>
  );
}
