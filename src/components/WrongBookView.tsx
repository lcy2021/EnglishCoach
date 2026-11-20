"use client";

import { useEffect, useState } from "react";
import { Check, RotateCcw } from "lucide-react";
import { useWorkspace } from "@/lib/store/workspace";
import { motion } from "motion/react";
import { EmptyIllustration } from "@/components/illustrations";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { BookLoader } from "@/components/ui/loader";
import { Pager } from "@/components/ui/pager";
import type { WrongBookItem } from "@/lib/types";

const PAGE_SIZE = 6;

export function WrongBookView() {
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [reloadKey, setReloadKey] = useState(0);
  const [items, setItems] = useState<WrongBookItem[]>([]);
  const applyPatch = useWorkspace((s) => s.applyPatch);
  const setRoute = useWorkspace((s) => s.setRoute);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const res = await fetch(`/api/wrong-book?page=${page}&pageSize=${PAGE_SIZE}`, { cache: "no-store" });
          const data = (await res.json()) as { items: WrongBookItem[]; total: number; page: number };
          if (cancelled) return;
          setItems(data.items ?? []);
          setTotal(data.total ?? 0);
          if (data.page && data.page !== page) setPage(data.page);
        } finally {
          if (!cancelled) setLoading(false);
        }
      })();
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [page, reloadKey]);

  const pageCommand = useWorkspace((s) => s.pageCommand);
  useEffect(() => {
    if (!pageCommand?.refresh?.includes("wrong-book")) return;
    setReloadKey((key) => key + 1);
  }, [pageCommand]);

  async function practiceAgain(item: WrongBookItem) {
    const articleRes = await fetch(`/api/articles?id=${item.articleId}`);
    const articleData = await articleRes.json();
    if (!articleRes.ok) {
      applyPatch({ statusMessage: articleData.error || "文章不存在" });
      return;
    }
    applyPatch({
      article: articleData.article,
      selectedParagraphIndex: item.paragraphIndex,
      viewLens: item.mode === "explain" ? "explain" : "translate",
      translateOpen: item.mode === "translate",
      route: "practice",
      focusWrongItemId: item.id,
      statusMessage: "已回到错题段落",
    });
    setRoute("practice");
  }

  async function resolve(id: string) {
    await fetch("/api/wrong-book", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "resolve", id }),
    });
    setReloadKey((key) => key + 1);
  }

  return (
    <section className="sheet space-y-6">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">错题本</h1>
        <p className="mt-1 text-muted-foreground">翻译没过关、讲解里仍模糊的内容会回到这里。</p>
      </header>
      {loading && items.length === 0 ? (
        <BookLoader label="正在翻开错题本" />
      ) : items.length === 0 ? (
        <Empty className="rounded-2xl border-2 border-dashed">
          <EmptyHeader>
            <EmptyIllustration kind="trophy" className="w-32" />
            <EmptyTitle>太棒了</EmptyTitle>
            <EmptyDescription>暂无未解决错题。</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <ul className={`grid grid-cols-[minmax(0,1fr)] gap-3 ${loading ? "opacity-60" : ""}`}>
          {items.map((item, i) => (
            <motion.li
              key={item.id}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ type: "spring", stiffness: 320, damping: 26, delay: Math.min(i, 8) * 0.05 }}
            >
              <Card>
                <CardHeader className="flex-row items-center gap-2">
                  <Badge variant={item.mode === "explain" ? "secondary" : "default"}>{item.mode}</Badge>
                  <span className="text-sm text-muted-foreground">
                    {new Date(item.createdAt).toLocaleString()}
                  </span>
                </CardHeader>
                <CardContent className="space-y-2">
                  <p className="leading-relaxed">{item.snippet}</p>
                  {item.userAnswer ? (
                    <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
                      你的回答：{item.userAnswer}
                    </p>
                  ) : null}
                  {item.expectedOrHint ? (
                    <p className="rounded-lg bg-accent px-3 py-2 text-sm text-accent-foreground">
                      提示：{item.expectedOrHint}
                    </p>
                  ) : null}
                </CardContent>
                <CardFooter className="justify-end gap-2">
                  <Button variant="ghost" onClick={() => void resolve(item.id)}>
                    <Check aria-hidden />
                    已解决
                  </Button>
                  <Button onClick={() => void practiceAgain(item)}>
                    <RotateCcw aria-hidden />
                    再练一次
                  </Button>
                </CardFooter>
              </Card>
            </motion.li>
          ))}
        </ul>
      )}
      {total > 0 ? <Pager page={page} total={total} pageSize={PAGE_SIZE} onPageChange={setPage} /> : null}
    </section>
  );
}
