"use client";

import { useEffect, useState } from "react";
import { ArrowUpRight } from "lucide-react";
import { motion } from "motion/react";
import { EmptyIllustration } from "@/components/illustrations";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { BookLoader } from "@/components/ui/loader";
import { Pager } from "@/components/ui/pager";
import type { DrillListItem } from "@/lib/drill/parse";
import { useWorkspace } from "@/lib/store/workspace";

const PAGE_SIZE = 7;

function formatYmd(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso.slice(0, 10);
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
}

export function DrillBankView() {
  const [drills, setDrills] = useState<DrillListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [reloadKey, setReloadKey] = useState(0);
  const setRoute = useWorkspace((s) => s.setRoute);
  const applyPatch = useWorkspace((s) => s.applyPatch);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const res = await fetch(`/api/drill?page=${page}&pageSize=${PAGE_SIZE}`, { cache: "no-store" });
          const data = (await res.json()) as { drills?: DrillListItem[]; total?: number; page?: number };
          if (cancelled) return;
          setDrills(data.drills ?? []);
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
    if (!pageCommand?.refresh?.includes("drill-bank") && !pageCommand?.refresh?.includes("drill")) return;
    setReloadKey((key) => key + 1);
  }, [pageCommand]);

  function openDrill(id: string) {
    // Route first so DrillView is mounted before the one-shot pageCommand arrives.
    setRoute("drill");
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        applyPatch({
          pageCommand: { id: `open-${id}`, route: "drill", drillId: id },
          statusMessage: "已打开这道题",
        });
      });
    });
  }

  return (
    <section className="sheet space-y-6">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">题目</h1>
        <p className="mt-1 text-muted-foreground">做过的题都在这里，点开可以重做。</p>
      </header>
      {loading && drills.length === 0 ? (
        <BookLoader label="正在翻找你的题目" />
      ) : drills.length === 0 ? (
        <Empty className="rounded-2xl border-2 border-dashed">
          <EmptyHeader>
            <EmptyIllustration kind="library" className="w-32" />
            <EmptyTitle>还没有题目</EmptyTitle>
            <EmptyDescription>
              去 AI出题做几道，或让教练出题，完成后会出现在这里。
            </EmptyDescription>
          </EmptyHeader>
          <Button className="mt-2" onClick={() => setRoute("drill")}>
            去出题
          </Button>
        </Empty>
      ) : (
        <ul className={`grid grid-cols-[minmax(0,1fr)] gap-3 ${loading ? "opacity-60" : ""}`}>
          {drills.map((item, i) => (
            <motion.li
              key={item.id}
              className="min-w-0"
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              whileHover={{ y: -2 }}
              transition={{ type: "spring", stiffness: 320, damping: 26, delay: Math.min(i, 8) * 0.05 }}
            >
              <Card
                role="button"
                tabIndex={0}
                className="flex-row items-center justify-between gap-4 px-5 py-4 cursor-pointer transition-colors hover:bg-muted/40"
                onClick={() => openDrill(item.id)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    openDrill(item.id);
                  }
                }}
              >
                <div className="min-w-0">
                  <div className="truncate font-semibold">{item.zh}</div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                    <Badge variant="secondary">{item.industry}</Badge>
                    <Badge variant="outline">{item.difficulty}</Badge>
                    <Badge variant={item.graded ? "default" : "outline"}>
                      {item.graded ? "已批改" : "未交卷"}
                    </Badge>
                    <span>{formatYmd(item.createdAt)}</span>
                  </div>
                </div>
                <Button
                  className="shrink-0"
                  onClick={(event) => {
                    event.stopPropagation();
                    openDrill(item.id);
                  }}
                >
                  <ArrowUpRight aria-hidden />
                  打开
                </Button>
              </Card>
            </motion.li>
          ))}
        </ul>
      )}
      {total > 0 ? <Pager page={page} total={total} pageSize={PAGE_SIZE} onPageChange={setPage} /> : null}
    </section>
  );
}
