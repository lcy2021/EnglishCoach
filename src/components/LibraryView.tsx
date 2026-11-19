"use client";

import { useEffect, useState } from "react";
import { ArrowUpRight, Trash2 } from "lucide-react";
import { useWorkspace } from "@/lib/store/workspace";
import { motion } from "motion/react";
import { EmptyIllustration } from "@/components/illustrations";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { BookLoader } from "@/components/ui/loader";
import { Pager, pageSlice } from "@/components/ui/pager";

const PAGE_SIZE = 8;

interface ArticleListItem {
  id: string;
  url: string | null;
  title: string;
  updatedAt: string;
  paragraphCount: number;
}

function formatYmd(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso.slice(0, 10);
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
}

export function LibraryView() {
  const [articles, setArticles] = useState<ArticleListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [deleteTarget, setDeleteTarget] = useState<ArticleListItem | null>(null);
  const openArticleId = useWorkspace((s) => s.article?.id ?? null);
  const loadArticle = useWorkspace((s) => s.loadArticle);
  const setRoute = useWorkspace((s) => s.setRoute);
  const applyPatch = useWorkspace((s) => s.applyPatch);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/articles");
        const data = (await res.json()) as { articles: ArticleListItem[] };
        setArticles(data.articles ?? []);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const pageCommand = useWorkspace((s) => s.pageCommand);
  useEffect(() => {
    if (!pageCommand?.refresh?.includes("library")) return;
    void (async () => {
      const res = await fetch("/api/articles");
      const data = (await res.json()) as { articles: ArticleListItem[] };
      setArticles(data.articles ?? []);
      setLoading(false);
    })();
  }, [pageCommand]);

  async function openArticle(id: string) {
    const res = await fetch(`/api/articles?id=${id}`);
    const data = await res.json();
    if (!res.ok) {
      applyPatch({ statusMessage: data.error || "打开失败" });
      return;
    }
    loadArticle(data.article);
    setRoute("practice");
  }

  async function removeArticle(id: string) {
    const res = await fetch(`/api/articles?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    const data = (await res.json()) as { error?: string };
    if (!res.ok) {
      applyPatch({ statusMessage: data.error || "删除失败" });
      setDeleteTarget(null);
      return;
    }
    setArticles((current) => current.filter((item) => item.id !== id));
    setDeleteTarget(null);
    if (openArticleId === id) {
      applyPatch({
        article: null,
        selectedParagraphIndex: null,
        viewLens: "read",
        translateOpen: false,
        explainExtractions: [],
        translationFeedback: null,
      });
    }
  }

  return (
    <section className="sheet space-y-6">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">文章库</h1>
        <p className="mt-1 text-muted-foreground">练过的文章都留在这里，点开继续。</p>
      </header>
      {loading ? (
        <BookLoader label="正在翻找你的文章" />
      ) : articles.length === 0 ? (
        <Empty className="rounded-2xl border-2 border-dashed">
          <EmptyHeader>
            <EmptyIllustration kind="library" className="w-32" />
            <EmptyTitle>还没有文章</EmptyTitle>
            <EmptyDescription>回到文章阅读拉取，或让教练整理一篇。</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <ul className="grid grid-cols-[minmax(0,1fr)] gap-3">
          {pageSlice(articles, page, PAGE_SIZE).map((a, i) => (
            <motion.li
              key={a.id}
              className="min-w-0"
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              whileHover={{ y: -2 }}
              transition={{ type: "spring", stiffness: 320, damping: 26, delay: Math.min(i, 8) * 0.05 }}
            >
              <Card className="flex-row items-center justify-between gap-4 px-5 py-4">
                <div className="min-w-0">
                  <div className="truncate font-semibold">{a.title}</div>
                  <div className="mt-1.5 flex items-center gap-2 text-sm text-muted-foreground">
                    <Badge variant="secondary">{a.paragraphCount} 段</Badge>
                    <span>{formatYmd(a.updatedAt)}</span>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Button variant="ghost" onClick={() => setDeleteTarget(a)}>
                    <Trash2 aria-hidden />
                    删除
                  </Button>
                  <Button onClick={() => void openArticle(a.id)}>
                    <ArrowUpRight aria-hidden />
                    打开
                  </Button>
                </div>
              </Card>
            </motion.li>
          ))}
        </ul>
      )}
      {!loading ? <Pager page={page} total={articles.length} pageSize={PAGE_SIZE} onPageChange={setPage} /> : null}

      <AlertDialog open={deleteTarget !== null} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除这篇文章？</AlertDialogTitle>
            <AlertDialogDescription>「{deleteTarget?.title}」删除后无法恢复。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => deleteTarget && void removeArticle(deleteTarget.id)}
            >
              确认删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
