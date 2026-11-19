"use client";

import { create } from "zustand";

export type Accent = "en-US" | "en-GB";

const KEY = "english-coach:speech";

interface SpeechPrefs {
  accent: Accent;
  rate: number;
  /** Read the word aloud when a review card appears. */
  autoPlay: boolean;
  hydrate: () => void;
  set: (patch: Partial<Pick<SpeechPrefs, "accent" | "rate" | "autoPlay">>) => void;
}

export const useSpeech = create<SpeechPrefs>((set, get) => ({
  accent: "en-US",
  rate: 0.9,
  autoPlay: false,
  hydrate: () => {
    try {
      const saved = JSON.parse(localStorage.getItem(KEY) ?? "null") as Partial<SpeechPrefs> | null;
      if (!saved) return;
      set({
        accent: saved.accent === "en-GB" ? "en-GB" : "en-US",
        rate: typeof saved.rate === "number" ? Math.min(1.2, Math.max(0.6, saved.rate)) : 0.9,
        autoPlay: saved.autoPlay === true,
      });
    } catch {
      /* keep defaults */
    }
  },
  set: (patch) => {
    set(patch);
    const { accent, rate, autoPlay } = get();
    try {
      localStorage.setItem(KEY, JSON.stringify({ accent, rate, autoPlay }));
    } catch {
      /* storage unavailable */
    }
  },
}));

export function speechSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

/** Best installed voice for the accent: prefer natural/online voices, fall back to any match. */
function pickVoice(accent: Accent): SpeechSynthesisVoice | undefined {
  const voices = window.speechSynthesis.getVoices().filter((v) => v.lang.replace("_", "-") === accent);
  return voices.find((v) => /natural|online/i.test(v.name)) ?? voices[0];
}

export interface SpeakOptions {
  rate?: number;
  onEnd?: () => void;
}

/** Read text aloud with the user's accent and speed, cutting off anything already playing. */
export function speak(text: string, options: SpeakOptions = {}): boolean {
  if (!speechSupported() || !text.trim()) return false;
  const { accent, rate } = useSpeech.getState();
  const synth = window.speechSynthesis;
  synth.cancel();
  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = accent;
  const voice = pickVoice(accent);
  if (voice) utter.voice = voice;
  utter.rate = options.rate ?? rate;
  if (options.onEnd) {
    utter.onend = options.onEnd;
    utter.onerror = options.onEnd;
  }
  synth.speak(utter);
  return true;
}

export function stopSpeaking() {
  if (speechSupported()) window.speechSynthesis.cancel();
}
