import type { ViewLens, WorkspacePatch } from "@/lib/types";

export interface AgentSessionContext {
  articleId: string | null;
  selectedParagraphIndex: number | null;
  viewLens: ViewLens;
  translateOpen: boolean;
  patches: WorkspacePatch[];
}

export function createAgentSessionContext(
  partial?: Partial<Omit<AgentSessionContext, "patches">>,
): AgentSessionContext {
  return {
    articleId: partial?.articleId ?? null,
    selectedParagraphIndex: partial?.selectedParagraphIndex ?? null,
    viewLens: partial?.viewLens ?? "read",
    translateOpen: partial?.translateOpen ?? false,
    patches: [],
  };
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
}
