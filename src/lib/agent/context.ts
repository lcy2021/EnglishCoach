import type { AppRoute, ViewLens, WorkspacePatch } from "@/lib/types";

export interface AgentSessionContext {
  articleId: string | null;
  selectedParagraphIndex: number | null;
  viewLens: ViewLens;
  translateOpen: boolean;
  route: AppRoute;
  patches: WorkspacePatch[];
  /** Set by the stream runner; lets a long tool say what it is doing right now. */
  progress?: (text: string) => void;
}

export function createAgentSessionContext(
  partial?: Partial<Omit<AgentSessionContext, "patches">>,
): AgentSessionContext {
  return {
    articleId: partial?.articleId ?? null,
    selectedParagraphIndex: partial?.selectedParagraphIndex ?? null,
    viewLens: partial?.viewLens ?? "read",
    translateOpen: partial?.translateOpen ?? false,
    route: partial?.route ?? "practice",
    patches: [],
  };
}

export function reportProgress(ctx: AgentSessionContext, text: string): void {
  ctx.progress?.(text);
}

export function pushPatch(
  ctx: AgentSessionContext,
  patch: WorkspacePatch,
): void {
  ctx.patches.push(patch);
  if (patch.article) ctx.articleId = patch.article.id;
  if (patch.article === null) ctx.articleId = null;
  if (patch.selectedParagraphIndex !== undefined) {
    ctx.selectedParagraphIndex = patch.selectedParagraphIndex;
  }
  if (patch.viewLens) ctx.viewLens = patch.viewLens;
  if (patch.translateOpen !== undefined) ctx.translateOpen = patch.translateOpen;
  if (patch.route) ctx.route = patch.route;
}
