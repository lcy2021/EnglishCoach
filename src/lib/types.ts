export type ViewLens = "read" | "explain" | "translate";

export type ExtractionStatus = "unset" | "known" | "unclear";

export interface Paragraph {
  index: number;
  text: string;
  zh?: string | null;
}

export interface Article {
  id: string;
  url: string | null;
  title: string;
  createdAt: string;
  updatedAt: string;
  paragraphs: Paragraph[];
}

export interface Extraction {
  id: string;
  articleId: string;
  kind: "phrase" | "word";
  text: string;
  gloss: string;
  sentence: string;
  paragraphIndex: number | null;
  status: ExtractionStatus;
}

export interface TranslationDraft {
  articleId: string;
  paragraphIndex: number;
  draftZh: string;
  lastCheckJson: string | null;
  updatedAt: string;
}

export interface WrongBookItem {
  id: string;
  articleId: string;
  paragraphIndex: number | null;
  mode: string;
  snippet: string;
  userAnswer: string | null;
  expectedOrHint: string | null;
  note: string | null;
  createdAt: string;
  resolvedAt: string | null;
}

export type AppRoute =
  | "practice"
  | "drill"
  | "wrong-book"
  | "library"
  | "drill-bank"
  | "vocab"
  | "stats"
  | "settings";

/** One-shot instruction for the open page. The shell applies it, then clears it. */
export interface PageCommand {
  id: string;
  route?: AppRoute;
  /** Open this saved drill once the drill page is showing. */
  drillId?: string;
  vocab?: {
    tab?: "review" | "all";
    query?: string;
    startReview?: boolean;
  };
  /** 0 is all-time. Otherwise 7, 14, or 30. */
  statsDays?: number;
  settings?: {
    goal?: number;
    level?: number;
    highlight?: boolean;
    accent?: "en-US" | "en-GB";
    rate?: number;
    autoPlay?: boolean;
  };
  refresh?: Array<"library" | "drill-bank" | "vocab" | "wrong-book" | "drill" | "stats">;
}

export interface WorkspacePatch {
  article?: Article | null;
  selectedParagraphIndex?: number | null;
  viewLens?: ViewLens;
  translateOpen?: boolean;
  explainExtractions?: Extraction[];
  route?: AppRoute;
  focusWrongItemId?: string | null;
  translationFeedback?: string | null;
  /** Generated content to throw into the page: `target` is a `data-deliver` key, `text` the generated field. */
  deliver?: { target: string; text: string };
  statusMessage?: string | null;
  pageCommand?: PageCommand | null;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
}
