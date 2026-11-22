"use client";

import {
  BookMarked,
  BookOpen,
  ChevronDown,
  FileText,
  LayoutDashboard,
  Library,
  ListChecks,
  PanelRightOpen,
  RotateCcw,
  Settings,
  SpellCheck,
} from "lucide-react";
import { motion, MotionConfig } from "motion/react";
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { usePathname } from "next/navigation";
import { useRouter } from "nextjs-toploader/app";
import { useWorkspace, type AppRoute } from "@/lib/store/workspace";
import { pathFromRoute, routeFromPath } from "@/lib/route-path";
import { GoalRing } from "@/components/GoalRing";
import { useGoal } from "@/lib/store/goal";
import { OwlPet, pokeOwl } from "@/components/OwlPet";
import { TextThrow } from "@/components/TextThrow";
import { Mascot } from "@/components/illustrations";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatCount } from "@/components/charts";
import { cn } from "@/lib/utils";
import { ChatPanel } from "@/components/ChatPanel";
import { ReaderView } from "@/components/ReaderView";
import { WrongBookView } from "@/components/WrongBookView";
import { LibraryView } from "@/components/LibraryView";
import { DrillBankView } from "@/components/DrillBankView";
import { SettingsView } from "@/components/SettingsView";
import { VocabView } from "@/components/VocabView";
import { useToday } from "@/lib/store/today";
import { useVocab } from "@/lib/store/vocab";
import { useLevel } from "@/lib/store/level";
import { useSpeech, type Accent } from "@/lib/speech";
import { StatsView } from "@/components/StatsView";
import { DrillView } from "@/components/DrillView";

const BANK_ROUTES = ["library", "drill-bank"] as const satisfies readonly AppRoute[];

const COACH_WIDTH_KEY = "english-coach:coach-width";
const COACH_WIDTH_DEFAULT = 420;
const COACH_WIDTH_MIN = 280;
const COACH_WIDTH_MAX = 720;

function clampCoachWidth(width: number, viewport = typeof window !== "undefined" ? window.innerWidth : 1280) {
  const max = Math.min(COACH_WIDTH_MAX, Math.max(COACH_WIDTH_MIN, Math.floor(viewport * 0.55)));
  return Math.min(max, Math.max(COACH_WIDTH_MIN, Math.round(width)));
}

type NavLeaf = { kind: "leaf"; route: AppRoute; label: string; Icon: typeof BookOpen };
type NavGroup = {
  kind: "group";
  id: string;
  label: string;
  Icon: typeof BookOpen;
  children: ReadonlyArray<{ route: AppRoute; label: string; Icon: typeof BookOpen }>;
};
type NavItem = NavLeaf | NavGroup;

const NAV: ReadonlyArray<NavItem> = [
  { kind: "leaf", route: "practice", label: "文章阅读", Icon: BookOpen },
  { kind: "leaf", route: "drill", label: "AI出题", Icon: SpellCheck },
  { kind: "leaf", route: "vocab", label: "生词本", Icon: BookMarked },
  { kind: "leaf", route: "wrong-book", label: "复习", Icon: RotateCcw },
  {
    kind: "group",
    id: "bank",
    label: "资产",
    Icon: Library,
    children: [
      { route: "library", label: "文章", Icon: FileText },
      { route: "drill-bank", label: "题目", Icon: ListChecks },
    ],
  },
  { kind: "leaf", route: "stats", label: "总览", Icon: LayoutDashboard },
  { kind: "leaf", route: "settings", label: "设置", Icon: Settings },
];

/** Small "today" card at the bottom of the sidebar: questions done + tokens spent. */
function TodayCard() {
  const drills = useToday((s) => s.drills);
  const tokens = useToday((s) => s.tokens);
  const ready = useToday((s) => s.ready);
  const setRoute = useWorkspace((s) => s.setRoute);
  const goal = useGoal((s) => s.goal);
  const lastDrills = useRef<number | null>(null);

  // Celebrate the moment today's goal is reached, not on every page load afterwards.
  useEffect(() => {
    if (!ready) return;
    const before = lastDrills.current;
    lastDrills.current = drills;
    if (before !== null && before < goal && drills >= goal) {
      pokeOwl("cheer", `今日目标达成!${goal} 题完成,太棒了`);
    }
  }, [ready, drills, goal]);

  if (!ready) return null;
  return (
    <button
      type="button"
      onClick={() => setRoute("stats")}
      className="mt-auto flex items-center gap-3 rounded-2xl border bg-card px-3.5 py-3 text-left transition-colors hover:bg-muted"
    >
      <GoalRing done={drills} goal={goal} size={44} stroke={5} />
      <span className="min-w-0">
        <span className="block text-xs font-semibold text-muted-foreground">
          {drills >= goal ? "今日目标达成" : `今日目标 ${goal} 题`}
        </span>
        <span className="mt-0.5 block text-sm font-bold">{drills} 题</span>
        <span className="block text-xs text-muted-foreground">{formatCount(tokens)} tokens</span>
      </span>
    </button>
  );
}

function NavButton({
  route,
  label,
  Icon,
  active,
  nested,
  badge,
  onClick,
}: {
  route: AppRoute;
  label: string;
  Icon: typeof BookOpen;
  active: boolean;
  nested?: boolean;
  badge?: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-current={active ? "page" : undefined}
      onClick={onClick}
      className={cn(
        "group relative flex items-center gap-3 rounded-xl border-2 border-transparent text-left text-sm font-semibold whitespace-nowrap transition-colors",
        nested ? "px-3 py-2" : "px-3 py-2.5",
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
      <motion.span className="relative flex items-center gap-3" whileHover={{ x: 3 }} whileTap={{ scale: 0.96 }}>
        <Icon
          className={cn(
            "shrink-0 transition-transform group-hover:scale-110",
            nested ? "size-4" : "size-5",
            active && "text-primary",
          )}
          strokeWidth={2}
          aria-hidden
        />
        {label}
        {route === "vocab" && badge && badge > 0 ? (
          <span className="ml-1 rounded-full bg-primary px-1.5 py-0.5 text-[11px] leading-none font-bold text-primary-foreground">
            {badge}
          </span>
        ) : null}
      </motion.span>
    </button>
  );
}

export function AppShell() {
  const pathname = usePathname();
  const router = useRouter();
  // nextjs-toploader/app rebuilds the router object every render; keep a stable ref for effects.
  const routerRef = useRef(router);
  routerRef.current = router;
  const route = routeFromPath(pathname);
  const storeRoute = useWorkspace((s) => s.route);
  const chatOpen = useWorkspace((s) => s.chatOpen);
  const setRoute = useWorkspace((s) => s.setRoute);
  const routeFromUrl = useRef(false);

  // The address is the page. Refresh and the back button read it; clicks and the coach write it.
  useLayoutEffect(() => {
    const canonical = pathFromRoute(route);
    if (canonical !== pathname) {
      routerRef.current.replace(canonical);
      return;
    }
    if (useWorkspace.getState().route !== route) {
      routeFromUrl.current = true;
      useWorkspace.setState({ route });
    }
  }, [pathname, route]);

  useEffect(() => {
    if (routeFromUrl.current) {
      routeFromUrl.current = false;
      return;
    }
    const path = pathFromRoute(storeRoute);
    if (path !== pathname) routerRef.current.push(path);
  }, [storeRoute, pathname]);
  const setChatOpen = useWorkspace((s) => s.setChatOpen);
  const dueWords = useVocab((s) => s.due);
  const bankActive = (BANK_ROUTES as readonly string[]).includes(route);
  const [bankOpen, setBankOpen] = useState(bankActive);
  const [coachWidth, setCoachWidth] = useState(COACH_WIDTH_DEFAULT);
  const [resizingCoach, setResizingCoach] = useState(false);
  const coachWidthRef = useRef(coachWidth);
  coachWidthRef.current = coachWidth;

  useEffect(() => {
    try {
      const saved = Number(localStorage.getItem(COACH_WIDTH_KEY));
      if (Number.isFinite(saved) && saved > 0) {
        setCoachWidth(clampCoachWidth(saved));
      }
    } catch {
      /* storage unavailable */
    }
  }, []);

  useEffect(() => {
    if (!resizingCoach) return;
    const onMove = (event: PointerEvent) => {
      setCoachWidth(clampCoachWidth(window.innerWidth - event.clientX));
    };
    const onUp = () => {
      setResizingCoach(false);
      try {
        localStorage.setItem(COACH_WIDTH_KEY, String(coachWidthRef.current));
      } catch {
        /* storage unavailable */
      }
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [resizingCoach]);

  useEffect(() => {
    if (bankActive) setBankOpen(true);
  }, [bankActive]);

  useEffect(() => {
    useLevel.getState().hydrate();
    useSpeech.getState().hydrate();
    useGoal.getState().hydrate();
  }, []);

  const pageCommand = useWorkspace((s) => s.pageCommand);
  useEffect(() => {
    if (!pageCommand) return;
    const settings = pageCommand.settings;
    if (settings) {
      if (settings.goal !== undefined) useGoal.getState().setGoal(settings.goal);
      if (settings.level !== undefined) useLevel.getState().setLevel(settings.level);
      if (settings.highlight !== undefined) useLevel.getState().setHighlight(settings.highlight);
      const speech: { accent?: Accent; rate?: number; autoPlay?: boolean } = {};
      if (settings.accent) speech.accent = settings.accent;
      if (settings.rate !== undefined) speech.rate = settings.rate;
      if (settings.autoPlay !== undefined) speech.autoPlay = settings.autoPlay;
      if (Object.keys(speech).length > 0) useSpeech.getState().set(speech);
    }
    const commandId = pageCommand.id;
    // Views mount from the URL. Keep the command until pathname matches so drillId
    // survives router.push; drop it if the user navigates somewhere else instead.
    if (route !== pageCommand.route) {
      if (storeRoute !== pageCommand.route) {
        useWorkspace.setState({ pageCommand: null });
      }
      return;
    }
    const timer = window.setTimeout(() => {
      if (useWorkspace.getState().pageCommand?.id === commandId) {
        useWorkspace.setState({ pageCommand: null });
      }
    }, 50);
    return () => window.clearTimeout(timer);
  }, [pageCommand, route, storeRoute]);

  return (
    <MotionConfig reducedMotion="user">
    <div
      className={cn("app", chatOpen && "chat-open", resizingCoach && "is-resizing-coach")}
      style={chatOpen ? ({ "--coach-w": `${coachWidth}px` } as CSSProperties) : undefined}
    >
      <aside className="rail !border-sidebar-border !bg-sidebar !px-4">
        <div className="flex items-center gap-2.5 px-2 pb-6">
          <div aria-hidden className="logo-tile size-10 overflow-visible">
            <Mascot className="w-full" float={false} />
          </div>
          <span className="text-lg font-bold tracking-tight text-foreground">English Coach</span>
        </div>
        <nav className="rail-nav flex flex-col gap-1.5">
          {NAV.map((item) => {
            if (item.kind === "leaf") {
              return (
                <NavButton
                  key={item.route}
                  route={item.route}
                  label={item.label}
                  Icon={item.Icon}
                  active={route === item.route}
                  badge={dueWords}
                  onClick={() => setRoute(item.route)}
                />
              );
            }
            const GroupIcon = item.Icon;
            return (
              <div key={item.id} className="rail-group">
                <button
                  type="button"
                  aria-expanded={bankOpen}
                  onClick={() => {
                    if (!bankOpen) {
                      setBankOpen(true);
                      if (!bankActive) setRoute("library");
                      return;
                    }
                    setBankOpen(false);
                  }}
                  className={cn(
                    "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold whitespace-nowrap transition-colors",
                    bankActive
                      ? "text-foreground"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  <GroupIcon
                    className={cn("size-5 shrink-0", bankActive && "text-primary")}
                    strokeWidth={2}
                    aria-hidden
                  />
                  <span>{item.label}</span>
                  <ChevronDown
                    className={cn("size-4 transition-transform", bankOpen && "rotate-180")}
                    aria-hidden
                  />
                </button>
                {bankOpen ? (
                  <div className="rail-group__kids">
                    {item.children.map((child) => (
                      <NavButton
                        key={child.route}
                        route={child.route}
                        label={child.label}
                        Icon={child.Icon}
                        active={route === child.route}
                        nested
                        onClick={() => setRoute(child.route)}
                      />
                    ))}
                  </div>
                ) : null}
              </div>
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
            {route === "drill-bank" ? <DrillBankView /> : null}
            {route === "stats" ? <StatsView /> : null}
            {route === "settings" ? <SettingsView /> : null}
          </div>
        </main>
        <OwlPet />
        <TextThrow />
      </div>

      {chatOpen ? (
        <aside className="coach !border-sidebar-border !bg-sidebar">
          <button
            type="button"
            aria-label="调整教练窗口宽度"
            className="coach-resize"
            data-active={resizingCoach ? "" : undefined}
            onPointerDown={(event) => {
              event.preventDefault();
              setResizingCoach(true);
            }}
          />
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
