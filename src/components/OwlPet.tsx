"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useMotionValue } from "motion/react";
import { Mascot } from "@/components/illustrations";
import { useVocab } from "@/lib/store/vocab";
import { useWorkspace, type AppRoute } from "@/lib/store/workspace";

const OWL_W = 80;
const OWL_H = 88;
const STORAGE_KEY = "english-coach:owl";
const POKE_LINES = ["Keep going!", "你真棒!", "Hoot hoot~", "每天进步一点点", "别忘了复习错题"];

type Mood = "happy" | "cheer" | "think";

/** Notify the pet from anywhere: pokeOwl("cheer") */
export function pokeOwl(mood: Mood, line?: string) {
  window.dispatchEvent(new CustomEvent("english-coach:owl", { detail: { mood, line } }));
}

function welcome(route: AppRoute, hasArticle: boolean): string {
  switch (route) {
    case "practice":
      return hasArticle ? "欢迎回来,点一段试试翻译吧" : "嗨!贴一篇英文文章开始吧";
    case "drill":
      return "来做几道题热热身吧!";
    case "wrong-book":
      return "复习错题,越练越牢~";
    case "library":
      return "选一篇文章继续读吧";
    case "drill-bank":
      return "做过的题都在这儿,点开重做吧";
    case "vocab": {
      const due = useVocab.getState().due;
      return due > 0 ? `有 ${due} 个词该复习啦` : "读文章时收藏的词都在这儿";
    }
    case "stats":
      return "看看你今天练了多少~";
    case "settings":
      return "在这里配置模型和词典";
  }
}

/** A little owl that greets you on every page. Drag it anywhere; it remembers its spot. */
export function OwlPet() {
  const boxRef = useRef<HTMLDivElement>(null);
  const size = useRef({ w: 600, h: 600 });
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const [ready, setReady] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [override, setOverride] = useState<Mood | null>(null);
  const [line, setLine] = useState<string | null>(null);
  const [side, setSide] = useState<"left" | "right">("right");
  const lineTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const route = useWorkspace((s) => s.route);
  const articleOpen = useRef(false);
  articleOpen.current = useWorkspace((s) => s.article !== null);

  const clamp = () => {
    const { w, h } = size.current;
    x.set(Math.min(Math.max(0, x.get()), Math.max(0, w - OWL_W)));
    y.set(Math.min(Math.max(0, y.get()), Math.max(0, h - OWL_H)));
  };

  const say = (text: string, ms = 3800) => {
    clearTimeout(lineTimer.current);
    setSide(x.get() > size.current.w / 2 ? "right" : "left");
    setLine(text);
    lineTimer.current = setTimeout(() => setLine(null), ms);
  };

  // Measure container, restore saved spot (default: bottom-right).
  useLayoutEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const measure = () => {
      size.current = { w: el.clientWidth, h: el.clientHeight };
      clamp();
    };
    measure();
    let saved: { x: number; y: number } | null = null;
    try {
      saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
    } catch {
      saved = null;
    }
    const { w, h } = size.current;
    x.set(saved ? saved.x : w - OWL_W - 24);
    y.set(saved ? saved.y : h - OWL_H - 24);
    clamp();
    setReady(true);
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Greet on every page change (and on first load).
  useEffect(() => {
    if (!ready) return;
    say(welcome(route, articleOpen.current));
    setOverride("cheer");
    const t = setTimeout(() => setOverride(null), 1800);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route, ready]);

  useEffect(() => () => clearTimeout(lineTimer.current), []);

  // React to events from the rest of the app (drill graded, generating, ...).
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ mood: Mood; line?: string }>).detail;
      const mood = detail?.mood;
      if (!mood) return;
      if (detail.line) say(detail.line, 4500);
      setOverride(mood);
      clearTimeout(timer);
      timer = setTimeout(() => setOverride(null), mood === "think" ? 60000 : 3500);
    };
    window.addEventListener("english-coach:owl", handler);
    return () => {
      window.removeEventListener("english-coach:owl", handler);
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const mood: Mood = dragging ? "cheer" : (override ?? "happy");

  return (
    <div ref={boxRef} className="pointer-events-none absolute inset-0 z-20">
      {ready ? (
        <motion.div
          drag
          dragConstraints={boxRef}
          dragElastic={0}
          dragMomentum={false}
          style={{ x, y, width: OWL_W }}
          className="pointer-events-auto absolute top-0 left-0 cursor-grab touch-none select-none active:cursor-grabbing"
          onDragStart={() => {
            setDragging(true);
            clearTimeout(lineTimer.current);
            setLine(null);
          }}
          onDragEnd={() => {
            setDragging(false);
            try {
              localStorage.setItem(STORAGE_KEY, JSON.stringify({ x: x.get(), y: y.get() }));
            } catch {
              /* storage unavailable */
            }
          }}
          onTap={() => say(POKE_LINES[Math.floor(Math.random() * POKE_LINES.length)], 2400)}
          whileHover={{ scale: 1.06 }}
          title="可以拖我到喜欢的位置"
        >
          <AnimatePresence>
            {line ? (
              <motion.div
                key={line}
                initial={{ opacity: 0, y: 6, scale: 0.9 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -4 }}
                className={`absolute -top-10 rounded-2xl border bg-card px-3 py-1.5 text-xs font-semibold whitespace-nowrap shadow-md ${
                  side === "right" ? "right-0" : "left-0"
                }`}
              >
                {line}
                <span
                  aria-hidden
                  className={`absolute -bottom-1 size-2 rotate-45 border-r border-b bg-card ${
                    side === "right" ? "right-8" : "left-8"
                  }`}
                />
              </motion.div>
            ) : null}
          </AnimatePresence>
          <motion.div
            animate={dragging ? { rotate: [-6, 6, -6] } : { rotate: 0 }}
            transition={dragging ? { duration: 0.45, repeat: Infinity, ease: "easeInOut" } : { duration: 0.2 }}
          >
            <Mascot className="w-full" mood={mood} float={!dragging} />
          </motion.div>
        </motion.div>
      ) : null}
    </div>
  );
}
