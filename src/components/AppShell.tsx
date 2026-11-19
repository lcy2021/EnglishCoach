"use client";

import { BookMarked, BookOpen, LayoutDashboard, Library, PanelRightOpen, RotateCcw, Settings, SpellCheck } from "lucide-react";
import { motion, MotionConfig } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { useWorkspace, type AppRoute } from "@/lib/store/workspace";
import { GoalRing } from "@/components/GoalRing";
import { useGoal } from "@/lib/store/goal";
import { OwlPet, pokeOwl } from "@/components/OwlPet";
import { OwlMark } from "@/components/illustrations";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatCount } from "@/components/charts";
import { cn } from "@/lib/utils";
import { ChatPanel } from "@/components/ChatPanel";
import { ReaderView } from "@/components/ReaderView";
import { WrongBookView } from "@/components/WrongBookView";
import { LibraryView } from "@/components/LibraryView";
import { SettingsView } from "@/components/SettingsView";
import { VocabView } from "@/components/VocabView";
import { useVocab } from "@/lib/store/vocab";
import { useLevel } from "@/lib/store/level";
import { useSpeech } from "@/lib/speech";
import { StatsView } from "@/components/StatsView";
import { DrillView } from "@/components/DrillView";

const NAV: ReadonlyArray<readonly [AppRoute, string, typeof BookOpen]> = [
  ["practice", "文章阅读", BookOpen],
  ["drill", "AI出题", SpellCheck],
  ["vocab", "生词本", BookMarked],
  ["wrong-book", "复习", RotateCcw],
  ["library", "文章库", Library],
  ["stats", "总览", LayoutDashboard],
  ["settings", "设置", Settings],
];

/** Small "today" card at the bottom of the sidebar: questions done + tokens spent. */
function TodayCard() {
  const route = useWorkspace((s) => s.route);
  const busy = useWorkspace((s) => s.busy);
  const [today, setToday] = useState<{ drills: number; tokens: number } | null>(null);
  const setRoute = useWorkspace((s) => s.setRoute);
  const goal = useGoal((s) => s.goal);
  const lastDrills = useRef<number | null>(null);

  // Celebrate the moment today's goal is reached, not on every page load afterwards.
  useEffect(() => {
    if (!today) return;
    const before = lastDrills.current;
    lastDrills.current = today.drills;
    if (before !== null && before < goal && today.drills >= goal) {
      pokeOwl("cheer", `今日目标达成!${goal} 题完成,太棒了`);
    }
  }, [today, goal]);

  useEffect(() => {
    let cancelled = false;
    // Refresh on page change and whenever the coach finishes a reply.
    if (busy) return;
    (async () => {
      try {
        const res = await fetch("/api/stats?days=1", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { today: { drills: number; input: number; output: number } };
        if (!cancelled) setToday({ drills: data.today.drills, tokens: data.today.input + data.today.output });
      } catch {
        /* the card is decorative; ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [route, busy]);

  if (!today) return null;
  return (
    <button
      type="button"
      onClick={() => setRoute("stats")}
      className="mt-auto flex items-center gap-3 rounded-2xl border bg-card px-3.5 py-3 text-left transition-colors hover:bg-muted"
    >
      <GoalRing done={today.drills} goal={goal} size={44} stroke={5} />
      <span className="min-w-0">
        <span className="block text-xs font-semibold text-muted-foreground">
          {today.drills >= goal ? "今日目标达成" : `今日目标 ${goal} 题`}
        </span>
        <span className="mt-0.5 block text-sm font-bold">{today.drills} 题</span>
        <span className="block text-xs text-muted-foreground">{formatCount(today.tokens)} tokens</span>
      </span>
    </button>
  );
}

export function AppShell() {
  const route = useWorkspace((s) => s.route);
  const chatOpen = useWorkspace((s) => s.chatOpen);
  const setRoute = useWorkspace((s) => s.setRoute);
  const setChatOpen = useWorkspace((s) => s.setChatOpen);
  const dueWords = useVocab((s) => s.due);
  const refreshVocab = useVocab((s) => s.refresh);

  useEffect(() => {
    useLevel.getState().hydrate();
    useSpeech.getState().hydrate();
    useGoal.getState().hydrate();
  }, []);

  useEffect(() => {
    void refreshVocab();
  }, [route, refreshVocab]);

  return (
    <MotionConfig reducedMotion="user">
    <div className={chatOpen ? "app chat-open" : "app"}>
      <aside className="rail !border-sidebar-border !bg-sidebar !px-4">
        <div className="flex items-center gap-2.5 px-2 pb-6">
          <div
            aria-hidden
            className="logo-tile grid size-10 place-items-center rounded-xl bg-primary text-primary-foreground shadow-md shadow-primary/30"
          >
            <OwlMark className="size-7" />
          </div>
          <span className="text-lg font-bold tracking-tight text-foreground">English Coach</span>
        </div>
        <nav className="flex flex-col gap-1.5">
          {NAV.map(([key, label, Icon]) => {
            const active = route === key;
            return (
              <button
                key={key}
                type="button"
                aria-current={active ? "page" : undefined}
                onClick={() => setRoute(key)}
                className={cn(
                  "group relative flex items-center gap-3 rounded-xl border-2 border-transparent px-3 py-2.5 text-left text-sm font-semibold whitespace-nowrap transition-colors",
                  active ? "text-accent-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                {active ? (
                  <motion.span
                    layoutId="nav-pill"
                    className="absolute inset-0 rounded-xl border-2 border-primary/40 bg-accent"
                    transition={{ type: "spring", stiffness: 420, damping: 34 }}
                  />
                ) : null}
                <motion.span
                  className="relative flex items-center gap-3"
                  whileHover={{ x: 3 }}
                  whileTap={{ scale: 0.96 }}
                >
                  <Icon
                    className={cn("size-5 shrink-0 transition-transform group-hover:scale-110", active && "text-primary")}
                    strokeWidth={2}
                    aria-hidden
                  />
                  {label}
                  {key === "vocab" && dueWords > 0 ? (
                    <span className="ml-1 rounded-full bg-primary px-1.5 py-0.5 text-[11px] leading-none font-bold text-primary-foreground">
                      {dueWords}
                    </span>
                  ) : null}
                </motion.span>
              </button>
            );
          })}
        </nav>
        <TodayCard />
      </aside>

      <div className="relative h-full min-h-0 min-w-0">
        <main className="stage">
          <div key={route} className="stage-view">
            {route === "practice" ? <ReaderView /> : null}
            {route === "drill" ? <DrillView /> : null}
            {route === "wrong-book" ? <WrongBookView /> : null}
            {route === "vocab" ? <VocabView /> : null}
            {route === "library" ? <LibraryView /> : null}
            {route === "stats" ? <StatsView /> : null}
            {route === "settings" ? <SettingsView /> : null}
          </div>
        </main>
        <OwlPet />
      </div>

      {chatOpen ? (
        <aside className="coach !border-sidebar-border !bg-sidebar">
          <ChatPanel />
        </aside>
      ) : (
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="secondary"
                size="icon"
                aria-label="打开教练"
                className="absolute top-4 right-4 z-10"
                onClick={() => setChatOpen(true)}
              />
            }
          >
            <PanelRightOpen aria-hidden />
          </TooltipTrigger>
          <TooltipContent side="left">打开教练</TooltipContent>
        </Tooltip>
      )}
    </div>
    </MotionConfig>
  );
}
