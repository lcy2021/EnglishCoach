"use client";

import { create } from "zustand";
import type {
  Article,
  ChatMessage,
  Extraction,
  ViewLens,
  WorkspacePatch,
} from "@/lib/types";

export type AppRoute = "practice" | "drill" | "wrong-book" | "library" | "vocab" | "stats" | "settings";

interface WorkspaceState {
  route: AppRoute;
  article: Article | null;
  selectedParagraphIndex: number | null;
  viewLens: ViewLens;
  translateOpen: boolean;
  translateDraft: string;
  explainExtractions: Extraction[];
  translationFeedback: string | null;
  statusMessage: string | null;
  chatOpen: boolean;
  messages: ChatMessage[];
  busy: boolean;
  setRoute: (route: AppRoute) => void;
  setChatOpen: (open: boolean) => void;
  setSelectedParagraph: (index: number | null) => void;
  setViewLens: (lens: ViewLens) => void;
  setTranslateOpen: (open: boolean) => void;
  setTranslateDraft: (draft: string) => void;
  setBusy: (busy: boolean) => void;
  applyPatch: (patch: WorkspacePatch) => void;
  addMessage: (message: ChatMessage) => void;
  appendToMessage: (id: string, text: string) => void;
  clearMessages: () => void;
  loadArticle: (article: Article) => void;
}

export const useWorkspace = create<WorkspaceState>((set) => ({
  route: "practice",
  article: null,
  selectedParagraphIndex: null,
  viewLens: "read",
  translateOpen: false,
  translateDraft: "",
  explainExtractions: [],
  translationFeedback: null,
  statusMessage: null,
  chatOpen: true,
  messages: [],
  busy: false,
  setRoute: (route) => set({ route }),
  setChatOpen: (chatOpen) => set({ chatOpen }),
  setSelectedParagraph: (selectedParagraphIndex) =>
    set({ selectedParagraphIndex }),
  setViewLens: (viewLens) => set({ viewLens }),
  setTranslateOpen: (translateOpen) => set({ translateOpen }),
  setTranslateDraft: (translateDraft) => set({ translateDraft }),
  setBusy: (busy) => set({ busy }),
  applyPatch: (patch) =>
    set((state) => ({
      route: patch.route ?? state.route,
      article:
        patch.article === undefined ? state.article : patch.article,
      selectedParagraphIndex:
        patch.selectedParagraphIndex === undefined
          ? state.selectedParagraphIndex
          : patch.selectedParagraphIndex,
      viewLens: patch.viewLens ?? state.viewLens,
      translateOpen:
        patch.translateOpen === undefined
          ? state.translateOpen
          : patch.translateOpen,
      explainExtractions:
        patch.explainExtractions ?? state.explainExtractions,
      translationFeedback:
        patch.translationFeedback === undefined
          ? state.translationFeedback
          : patch.translationFeedback,
      statusMessage:
        patch.statusMessage === undefined
          ? state.statusMessage
          : patch.statusMessage,
    })),
  addMessage: (message) =>
    set((state) => ({ messages: [...state.messages, message] })),
  appendToMessage: (id, text) =>
    set((state) => ({
      messages: state.messages.map((message) =>
        message.id === id
          ? { ...message, content: message.content + text }
          : message,
      ),
    })),
  clearMessages: () => set({ messages: [] }),
  loadArticle: (article) =>
    set({
      article,
      route: "practice",
      selectedParagraphIndex: 0,
      viewLens: "read",
      translateOpen: false,
      explainExtractions: [],
      translationFeedback: null,
    }),
}));
