"use client";

import { useSyncExternalStore } from "react";
import { Database, GraduationCap, KeyRound, Volume2 } from "lucide-react";
import { LEVELS, useLevel } from "@/lib/store/level";
import { speak, speechSupported, useSpeech, type Accent } from "@/lib/speech";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const ENV_VARS: ReadonlyArray<readonly [string, string]> = [
  ["LLM_API_KEY", "模型密钥"],
  ["LLM_BASE_URL", "接口地址"],
  ["LLM_MODEL", "模型名称"],
  ["DATABASE_PATH", "可选：数据库路径"],
];

const ACCENTS: ReadonlyArray<{ value: Accent; label: string }> = [
  { value: "en-US", label: "美音" },
  { value: "en-GB", label: "英音" },
];

export function SettingsView() {
  const level = useLevel((s) => s.level);
  const setLevel = useLevel((s) => s.setLevel);
  const speech = useSpeech();
  const supported = useSyncExternalStore(
    () => () => {},
    speechSupported,
    () => true,
  );
  return (
    <section className="sheet space-y-6">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">设置</h1>
        <p className="mt-1 text-muted-foreground">模型与词典的本地配置。</p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <GraduationCap className="size-5 text-primary" aria-hidden />
            我的英语水平
          </CardTitle>
          <CardDescription>
            阅读时会按这个水平评估文章难度,并把超出水平的词用虚线标出来。
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2" role="group" aria-label="英语水平">
            {LEVELS.map((item) => (
              <button
                key={item.rank}
                type="button"
                aria-pressed={level === item.rank}
                onClick={() => setLevel(item.rank)}
                className={cn(
                  "rounded-2xl border-2 px-4 py-2 text-left transition-colors",
                  level === item.rank
                    ? "border-primary bg-accent text-accent-foreground"
                    : "border-border bg-card text-muted-foreground hover:bg-muted",
                )}
              >
                <span className="block text-sm font-bold">{item.label}</span>
                <span className="block text-xs">{item.hint}</span>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Volume2 className="size-5 text-primary" aria-hidden />
            发音
          </CardTitle>
          <CardDescription>
            用浏览器自带的语音朗读,不联网也能用。音质取决于系统里装的语音。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label="口音">
            {ACCENTS.map((item) => (
              <button
                key={item.value}
                type="button"
                aria-pressed={speech.accent === item.value}
                onClick={() => {
                  speech.set({ accent: item.value });
                  speak("pronunciation");
                }}
                className={cn(
                  "rounded-2xl border-2 px-4 py-2 text-sm font-bold transition-colors",
                  speech.accent === item.value
                    ? "border-primary bg-accent text-accent-foreground"
                    : "border-border bg-card text-muted-foreground hover:bg-muted",
                )}
              >
                {item.label}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-3 text-sm font-semibold">
            语速
            <input
              type="range"
              min={0.6}
              max={1.2}
              step={0.1}
              value={speech.rate}
              onChange={(e) => speech.set({ rate: Number(e.target.value) })}
              onPointerUp={() => speak("pronunciation")}
              className="w-48 accent-[var(--primary)]"
            />
            <span className="w-10 tabular-nums text-muted-foreground">{speech.rate.toFixed(1)}x</span>
          </label>
          <label className="flex items-center gap-2 text-sm font-semibold">
            <input
              type="checkbox"
              checked={speech.autoPlay}
              onChange={(e) => speech.set({ autoPlay: e.target.checked })}
              className="size-4 accent-[var(--primary)]"
            />
            复习生词时,翻到新卡片自动读单词
          </label>
          {supported ? null : <p className="text-sm text-destructive">当前浏览器不支持语音朗读。</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <KeyRound className="size-5 text-primary" aria-hidden />
            模型配置
          </CardTitle>
          <CardDescription>写在项目根目录的 .env.local：</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="grid gap-2">
            {ENV_VARS.map(([name, hint]) => (
              <li key={name} className="flex items-center justify-between gap-3 rounded-xl bg-muted px-3 py-2">
                <Badge variant="secondary" className="font-mono">
                  {name}
                </Badge>
                <span className="text-sm text-muted-foreground">{hint}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="size-5 text-chart-2" aria-hidden />
            悬停查词
          </CardTitle>
          <CardDescription>
            使用本地 ECDICT（data/stardict.db），不请求模型。文章难度评估、生词标注和悬停释义都用它，不消耗 token。
          </CardDescription>
        </CardHeader>
      </Card>
    </section>
  );
}
