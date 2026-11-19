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

export interface WorkspacePatch {
  article?: Article | null;
  selectedParagraphIndex?: number | null;
  viewLens?: ViewLens;
  translateOpen?: boolean;
  explainExtractions?: Extraction[];
  route?: "practice" | "drill" | "wrong-book" | "library" | "settings";
  focusWrongItemId?: string | null;
  translationFeedback?: string | null;
  statusMessage?: string | null;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
}
