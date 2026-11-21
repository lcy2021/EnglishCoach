import {
  formatPhonetic,
  formsFromExchange,
  lemmaFromExchange,
  parseSenses,
  posLabel,
  type DictEntry,
  type DictLookup,
  type GlossSense,
  type WordForm,
} from "./match.ts";

export interface LexLike {
  kind: "phrase" | "word";
  text: string;
  gloss: string;
  pos?: string;
  phonetic?: string;
  forms?: WordForm[];
}

export interface WordMorphology {
  /** All distinct POS labels, joined with " · ". */
  pos: string;
  phonetic: string;
  forms: WordForm[];
  senses: GlossSense[];
}

function uniquePos(senses: GlossSense[], fallback: string): string {
  const labels = [...new Set(senses.map((sense) => sense.pos.trim()).filter(Boolean))];
  if (labels.length > 0) return labels.join(" · ");
  return fallback;
}

function morphologyFromEntries(
  surface: DictEntry | undefined,
  lemma: DictEntry | undefined,
  phrase: boolean,
): WordMorphology {
  const primary = surface ?? lemma;
  if (!primary) {
    return { pos: phrase ? "短语" : "", phonetic: "", forms: [], senses: [] };
  }
  const senses = parseSenses(primary.translation, primary.pos, primary.exchange, phrase);
  const fallback =
    posLabel(primary.pos, primary.exchange, phrase) || (phrase ? "短语" : "");
  const pos = uniquePos(senses, fallback);
  const phonetic = formatPhonetic(surface?.phonetic || lemma?.phonetic || "");
  // Full paradigms live on the lemma row; inflected rows only point back with 0:/1:.
  const paradigmSource = lemma ?? (lemmaFromExchange(primary.exchange) ? undefined : primary);
  const forms = formsFromExchange(paradigmSource?.exchange ?? "");
  return { pos, phonetic, forms, senses };
}

function resolveEntries(text: string, lookup: DictLookup): {
  surface: DictEntry | undefined;
  lemma: DictEntry | undefined;
} {
  const key = text.trim().toLowerCase();
  if (!key) return { surface: undefined, lemma: undefined };
  const first = lookup([key]);
  const surface = first.get(key);
  const lemmaName = surface ? lemmaFromExchange(surface.exchange) : null;
  let lemma: DictEntry | undefined;
  if (lemmaName && lemmaName !== key) {
    lemma = lookup([lemmaName]).get(lemmaName);
  } else if (surface && !lemmaName) {
    lemma = surface;
  }
  return { surface, lemma };
}

/** Resolve POS / phonetic / tense variants from ECDICT only (no guessed forms). */
export function lookupMorphology(text: string, lookup: DictLookup, phrase = false): WordMorphology {
  const key = text.trim().toLowerCase();
  if (!key) return { pos: phrase ? "短语" : "", phonetic: "", forms: [], senses: [] };
  const { surface, lemma } = resolveEntries(key, lookup);
  return morphologyFromEntries(surface, lemma, phrase);
}

/** Fill missing POS / phonetic / forms on drill lex from the dictionary. */
export function enrichDrillLex<T extends LexLike>(lex: T[], lookup: DictLookup): T[] {
  if (lex.length === 0) return lex;
  const keys = [...new Set(lex.map((item) => item.text.trim().toLowerCase()).filter(Boolean))];
  const surfaceMap = lookup(keys);
  const lemmaKeys = [
    ...new Set(
      [...surfaceMap.values()]
        .map((entry) => lemmaFromExchange(entry.exchange))
        .filter((name): name is string => Boolean(name)),
    ),
  ].filter((name) => !surfaceMap.has(name));
  const lemmaMap = lemmaKeys.length > 0 ? lookup(lemmaKeys) : new Map<string, DictEntry>();

  return lex.map((item) => {
    const key = item.text.trim().toLowerCase();
    const surface = surfaceMap.get(key);
    const lemmaName = surface ? lemmaFromExchange(surface.exchange) : null;
    const lemma = lemmaName ? lemmaMap.get(lemmaName) ?? surfaceMap.get(lemmaName) : surface;
    const morph = morphologyFromEntries(surface, lemma, item.kind === "phrase");
    return {
      ...item,
      pos: item.pos || morph.pos || undefined,
      phonetic: item.phonetic || morph.phonetic || undefined,
      forms: item.forms && item.forms.length > 0 ? item.forms : morph.forms.length > 0 ? morph.forms : undefined,
    };
  });
}

export type VocabMorphologyFields = {
  pos: string;
  forms: WordForm[];
  phonetic: string;
  senses: GlossSense[];
};

/** Attach POS / forms / senses for word-book cards from ECDICT only. */
export function enrichVocabMorphology<T extends { text: string; phonetic?: string; pos?: string; forms?: WordForm[] }>(
  words: T[],
  lookup: DictLookup,
): Array<T & VocabMorphologyFields> {
  if (words.length === 0) return [];
  const keys = [...new Set(words.map((word) => word.text.trim().toLowerCase()).filter(Boolean))];
  const surfaceMap = lookup(keys);
  const lemmaKeys = [
    ...new Set(
      [...surfaceMap.values()]
        .map((entry) => lemmaFromExchange(entry.exchange))
        .filter((name): name is string => Boolean(name)),
    ),
  ].filter((name) => !surfaceMap.has(name));
  const lemmaMap = lemmaKeys.length > 0 ? lookup(lemmaKeys) : new Map<string, DictEntry>();

  return words.map((word) => {
    const key = word.text.trim().toLowerCase();
    const surface = surfaceMap.get(key);
    const lemmaName = surface ? lemmaFromExchange(surface.exchange) : null;
    const lemma = lemmaName ? lemmaMap.get(lemmaName) ?? surfaceMap.get(lemmaName) : surface;
    const phrase = key.includes(" ");
    const morph = morphologyFromEntries(surface, lemma, phrase);
    const phonetic = (word.phonetic ?? "").trim() || morph.phonetic;
    const pos = morph.pos || word.pos || "";
    const forms = morph.forms.length > 0 ? morph.forms : word.forms ?? [];
    return { ...word, phonetic, pos, forms, senses: morph.senses };
  });
}
