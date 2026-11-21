/** Longest-match ECDICT lookup over a token window. Pure so it can be tested without the database. */

export const MAX_PHRASE_WORDS = 6;
const GLOSS_LINE_LIMIT = 4;
/** Hover / define cards list every sense the dictionary has. */
const DEFINE_SENSE_LIMIT = 24;

export interface DictEntry {
  word: string;
  phonetic: string;
  translation: string;
  pos: string;
  exchange: string;
  collins: number;
  oxford: number;
  tag: string;
  frq: number;
}

export interface GlossSense {
  pos: string;
  text: string;
}

/** One labeled inflection from ECDICT `exchange` (e.g. 过去式 / went). */
export interface WordForm {
  label: string;
  text: string;
}

/** ECDICT lemma exchange codes → Chinese labels for learners. */
const EXCHANGE_FORM_LABELS: Record<string, string> = {
  p: "过去式",
  d: "过去分词",
  i: "现在分词",
  "3": "第三人称单数",
  s: "复数",
  r: "比较级",
  t: "最高级",
};

/**
 * Parse a lemma's ECDICT `exchange` into labeled variants.
 * Example: `p:went/d:gone/i:going/3:goes` → 过去式 went, …
 * Inflected rows that only have `0:lemma/1:p` yield nothing; look up the lemma first.
 */
export function formsFromExchange(exchange: string): WordForm[] {
  const forms: WordForm[] = [];
  const seen = new Set<string>();
  for (const part of exchange.split("/")) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const colon = trimmed.indexOf(":");
    if (colon <= 0) continue;
    const code = trimmed.slice(0, colon).toLowerCase();
    const text = trimmed.slice(colon + 1).trim();
    if (!text || code === "0" || code === "1") continue;
    const label = EXCHANGE_FORM_LABELS[code];
    if (!label) continue;
    const key = `${label}:${text.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    forms.push({ label, text });
  }
  return forms;
}

/** Best Chinese POS label from ECDICT `pos` / translation / exchange. */
export function posLabel(posField: string, exchange: string, phrase = false): string {
  return fallbackPos(posField, exchange, phrase);
}

export interface GlossMatch {
  phrase: string;
  gloss: string;
  phonetic: string;
  senses: GlossSense[];
  /** Inflection table from ECDICT `exchange` (dictionary only). */
  forms: WordForm[];
  /** Lemma when the hit is an inflected surface form. */
  lemma: string;
  start: number;
  end: number;
}

export interface ParagraphGloss {
  text: string;
  gloss: string;
  pos: string;
  kind: "phrase" | "word";
  start: number;
  end: number;
}

export type DictLookup = (phrases: string[]) => Map<string, DictEntry>;

/** Strip edge punctuation and lowercase. Keeps internal hyphens and apostrophes. */
export function normalizeToken(raw: string): string {
  return raw
    .replace(/[’]/g, "'")
    .replace(/^[^\p{L}\p{N}']+|[^\p{L}\p{N}']+$/gu, "")
    .toLowerCase();
}

/** ECDICT `exchange` uses `0:lemma` on inflected forms. */
export function lemmaFromExchange(exchange: string): string | null {
  const match = /(?:^|\/)0:([^/\s]+)/.exec(exchange);
  return match ? match[1].toLowerCase() : null;
}

const SENSE_TEXT_LIMIT = 96;

const TRANSLATION_PREFIXES: Array<[RegExp, string]> = [
  [/^vi\.\s*/i, "不及物"],
  [/^vt\.\s*/i, "及物"],
  [/^verb\.\s*/i, "动词"],
  [/^v\.\s*/i, "动词"],
  [/^adj\.\s*/i, "形容词"],
  [/^adv\.\s*/i, "副词"],
  [/^ad\.\s*/i, "副词"],
  [/^prep\.\s*/i, "介词"],
  [/^conj\.\s*/i, "连词"],
  [/^pron\.\s*/i, "代词"],
  [/^art\.\s*/i, "冠词"],
  [/^num\.\s*/i, "数词"],
  [/^interj\.\s*/i, "感叹词"],
  [/^int\.\s*/i, "感叹词"],
  [/^aux\.\s*/i, "助动词"],
  [/^abbr\.\s*/i, "缩写"],
  [/^n\.\s*/i, "名词"],
  [/^a\.\s*/i, "形容词"],
];

/** ECDICT `pos` codes. `a` is an article here; translation lines use `a.` for adjectives. */
const POS_CODES: Record<string, string> = {
  n: "名词",
  v: "动词",
  j: "形容词",
  r: "副词",
  i: "介词",
  c: "连词",
  p: "代词",
  a: "冠词",
  u: "感叹词",
  m: "数词",
  t: "小品词",
};

export function formatPhonetic(phonetic: string): string {
  const trimmed = phonetic.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("/") || trimmed.startsWith("[")) return trimmed;
  return `/${trimmed}/`;
}

/**
 * Split an ECDICT translation into labeled senses.
 * Prefixes in the Chinese text win; the `pos` column and inflection codes fill the gaps.
 */
export function parseSenses(
  translation: string,
  posField: string,
  exchange: string,
  phrase: boolean,
  limit: number = GLOSS_LINE_LIMIT,
): GlossSense[] {
  const fallback = fallbackPos(posField, exchange, phrase);
  const senses: GlossSense[] = [];

  for (const line of translation.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const domain = /^\[[^\]]+\]\s*(.*)$/.exec(trimmed);
    if (domain) {
      const text = clipSense(domain[1] ?? "");
      if (text) pushSense(senses, { pos: fallback, text });
      continue;
    }
    const tagged = splitTranslationPrefix(trimmed);
    if (tagged) {
      pushSense(senses, tagged);
      continue;
    }
    const text = clipSense(trimmed);
    if (text) pushSense(senses, { pos: fallback, text });
  }

  return senses.slice(0, Math.max(1, limit));
}

interface Candidate {
  phrase: string;
  start: number;
  end: number;
  lemmatized: boolean;
}

/**
 * Find the longest dictionary phrase that covers `index`.
 * Inflected phrases such as "looked up" fall back to the lemma phrase "look up".
 * Surface forms win ties against their lemma so "went" is not replaced by "go".
 */
export function matchAt(
  rawTokens: string[],
  index: number,
  lookup: DictLookup,
): GlossMatch | null {
  if (!Number.isInteger(index) || index < 0 || index >= rawTokens.length) {
    return null;
  }

  const tokens = rawTokens.map(normalizeToken);
  if (!tokens[index]) return null;

  const windowStart = Math.max(0, index - (MAX_PHRASE_WORDS - 1));
  const windowEnd = Math.min(tokens.length, index + MAX_PHRASE_WORDS);
  const singles = lookup([
    ...new Set(tokens.slice(windowStart, windowEnd).filter(Boolean)),
  ]);

  const lemmas = tokens.map((token) => {
    if (!token) return "";
    const lemma = lemmaFromExchange(singles.get(token)?.exchange ?? "");
    return lemma && lemma !== token ? lemma : token;
  });

  const candidates: Candidate[] = [];
  const seen = new Set<string>();
  const maxLength = Math.min(MAX_PHRASE_WORDS, tokens.length);
  for (let length = maxLength; length >= 1; length -= 1) {
    const startMin = Math.max(0, index - length + 1);
    const startMax = Math.min(index, tokens.length - length);
    for (let start = startMin; start <= startMax; start += 1) {
      const end = start + length - 1;
      const slice = tokens.slice(start, end + 1);
      if (slice.some((token) => !token)) continue;
      const raw = slice.join(" ");
      const lemmaPhrase = lemmas.slice(start, end + 1).join(" ");
      pushCandidate(candidates, seen, { phrase: raw, start, end, lemmatized: false });
      if (lemmaPhrase !== raw) {
        pushCandidate(candidates, seen, {
          phrase: lemmaPhrase,
          start,
          end,
          lemmatized: true,
        });
      }
    }
  }

  const found = lookup(candidates.map((candidate) => candidate.phrase));
  let best: (Candidate & {
    entry: DictEntry;
    gloss: string;
    phonetic: string;
    senses: GlossSense[];
  }) | null = null;

  for (const candidate of candidates) {
    const entry = found.get(candidate.phrase);
    if (!entry) continue;
    const resolved = resolveTranslation(entry, lookup);
    if (!resolved.translation.trim()) continue;
    const span = tokens.slice(candidate.start, candidate.end + 1);
    if (span.length > 1 && !acceptPhrase(entry, span)) continue;
    const senses = parseSenses(
      resolved.translation,
      resolved.pos,
      entry.exchange,
      candidate.end > candidate.start,
      DEFINE_SENSE_LIMIT,
    );
    const gloss = senses.map((sense) => sense.text).join("；");
    if (!gloss) continue;
    if (
      !best ||
      preferCandidate(
        candidate,
        entry,
        {
          phrase: best.phrase,
          start: best.start,
          end: best.end,
          lemmatized: best.lemmatized,
        },
        best.entry,
      )
    ) {
      best = {
        ...candidate,
        entry,
        gloss,
        phonetic: formatPhonetic(resolved.phonetic),
        senses,
      };
    }
  }

  if (!best) return null;
  const lemmaName = lemmaFromExchange(best.entry.exchange);
  const lemmaEntry = lemmaName ? lookup([lemmaName]).get(lemmaName) : undefined;
  const forms = formsFromExchange((lemmaEntry ?? best.entry).exchange);
  const phrase = best.entry.word || best.phrase;
  return {
    phrase,
    gloss: best.gloss,
    phonetic: best.phonetic,
    senses: best.senses,
    forms,
    lemma: lemmaEntry?.word || lemmaName || phrase,
    start: best.start,
    end: best.end,
  };
}

const PHRASAL_PARTICLES = new Set([
  "up", "down", "off", "out", "away", "back", "over", "on", "in",
  "through", "around", "along", "apart",
]);

const EXAM_TAG = /\b(zk|gk|cet4|cet6|ky|toefl|ielts|gre)\b/i;

/**
 * ECDICT contains a lot of web bigrams ("to check", "the model") that are not phrases.
 * Keep idioms, exam-tagged entries, and real phrasal verbs. Leave the rest as single words.
 */
function acceptPhrase(entry: DictEntry, span: string[]): boolean {
  if (grammarNote(entry.translation)) return false;
  const quality = entry.collins > 0 || entry.oxford > 0 || EXAM_TAG.test(entry.tag);
  if (webOnly(entry.translation) && !quality) return false;
  if (span.length !== 2) return true;
  const [first, second] = span;
  const closedEdge = CLOSED_CLASS.has(first ?? "") || CLOSED_CLASS.has(second ?? "");
  if (!closedEdge || quality) return true;
  return PHRASAL_PARTICLES.has(second ?? "") && !CLOSED_CLASS.has(first ?? "");
}

function webOnly(translation: string): boolean {
  const lines = translation.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  return lines.length > 0 && lines.every((line) => line.startsWith("[网络]"));
}

function grammarNote(translation: string): boolean {
  return /比较级|最高级|的过去式|的过去分词|的现在分词|的第三人称|的复数/.test(translation);
}

const CLOSED_CLASS = new Set([
  "a", "an", "the",
  "and", "or", "but", "if", "as", "of", "to", "in", "on", "at", "by", "for", "with", "from",
  "into", "over", "after", "before", "about", "than", "then", "so", "not", "no",
  "is", "are", "was", "were", "be", "been", "being", "am",
  "do", "does", "did", "done",
  "have", "has", "had",
  "it", "its", "he", "she", "they", "we", "you", "i", "me", "him", "her", "them", "us",
  "his", "their", "our", "your", "my",
  "this", "that", "these", "those",
  "there", "here", "when", "where", "what", "which", "who", "whom", "whose",
]);

const SKIP_POS = new Set(["冠词", "介词", "连词", "代词", "小品词", "感叹词"]);
const NOTE_LIMIT = 12;

/**
 * Walk a paragraph left to right and keep dictionary phrases plus content words.
 * Closed-class words stay out unless they belong to a longer phrase.
 */
export function collectParagraphGlosses(
  rawTokens: string[],
  lookup: DictLookup,
): ParagraphGloss[] {
  const notes: ParagraphGloss[] = [];
  const seen = new Set<number>();
  let index = 0;

  while (index < rawTokens.length) {
    const hit = matchAt(rawTokens, index, lookup);
    if (!hit) {
      index += 1;
      continue;
    }
    const phrase = hit.end > hit.start;
    const head = normalizeToken(rawTokens[hit.start] ?? "");
    const pos = hit.senses[0]?.pos ?? "";
    const worthKeeping = phrase || (!CLOSED_CLASS.has(head) && !SKIP_POS.has(pos));
    if (worthKeeping && hit.gloss && !seen.has(hit.start)) {
      seen.add(hit.start);
      notes.push({
        text: hit.phrase,
        gloss: hit.senses
          .slice(0, 2)
          .map((sense) => sense.text)
          .filter(Boolean)
          .join("；"),
        pos: pos || (phrase ? "短语" : ""),
        kind: phrase ? "phrase" : "word",
        start: hit.start,
        end: hit.end,
      });
    }
    index = Math.max(hit.end, index) + 1;
  }

  return [
    ...notes.filter((note) => note.kind === "phrase"),
    ...notes.filter((note) => note.kind === "word"),
  ].slice(0, NOTE_LIMIT);
}

function pushCandidate(list: Candidate[], seen: Set<string>, candidate: Candidate) {
  const key = `${candidate.start}:${candidate.end}:${candidate.phrase}`;
  if (seen.has(key)) return;
  seen.add(key);
  list.push(candidate);
}

function resolveTranslation(
  entry: DictEntry,
  lookup: DictLookup,
): { translation: string; phonetic: string; pos: string } {
  if (entry.translation.trim()) {
    return { translation: entry.translation, phonetic: entry.phonetic, pos: entry.pos };
  }
  const lemma = lemmaFromExchange(entry.exchange);
  if (!lemma) return { translation: "", phonetic: entry.phonetic, pos: entry.pos };
  const lemmaEntry = lookup([lemma]).get(lemma);
  if (!lemmaEntry?.translation.trim()) {
    return { translation: "", phonetic: entry.phonetic, pos: entry.pos };
  }
  return {
    translation: lemmaEntry.translation,
    phonetic: entry.phonetic || lemmaEntry.phonetic,
    pos: entry.pos || lemmaEntry.pos,
  };
}

function splitTranslationPrefix(line: string): GlossSense | null {
  for (const [pattern, pos] of TRANSLATION_PREFIXES) {
    const match = pattern.exec(line);
    if (!match) continue;
    const text = clipSense(line.slice(match[0].length));
    return text ? { pos, text } : null;
  }
  return null;
}

function fallbackPos(posField: string, exchange: string, phrase: boolean): string {
  const fromCode = dominantPos(posField);
  if (fromCode) return fromCode;
  const fromExchange = posFromExchange(exchange);
  if (fromExchange) return fromExchange;
  return phrase ? "短语" : "";
}

function dominantPos(posField: string): string {
  let label = "";
  let best = -1;
  for (const part of posField.split("/")) {
    const [code, scoreText] = part.split(":");
    const labelForCode = POS_CODES[code ?? ""];
    if (!labelForCode) continue;
    const score = Number(scoreText ?? 0);
    if (score >= best) {
      label = labelForCode;
      best = score;
    }
  }
  return label;
}

function posFromExchange(exchange: string): string {
  const kind = /(?:^|\/)1:([a-z0-9]+)/i.exec(exchange)?.[1] ?? "";
  if (/[pdi3]/i.test(kind)) return "动词";
  if (kind.includes("s")) return "名词";
  if (/[rt]/i.test(kind)) return "形容词";
  return "";
}

function pushSense(senses: GlossSense[], sense: GlossSense) {
  const previous = senses[senses.length - 1];
  if (previous && previous.pos === sense.pos) {
    previous.text = clipSense(`${previous.text}；${sense.text}`);
    return;
  }
  senses.push(sense);
}

function clipSense(text: string): string {
  const compact = text.replace(/\s+/g, " ").trim();
  if (compact.length <= SENSE_TEXT_LIMIT) return compact;
  return `${compact.slice(0, SENSE_TEXT_LIMIT)}…`;
}

function preferCandidate(
  candidate: Candidate,
  entry: DictEntry,
  best: Candidate,
  bestEntry: DictEntry,
): boolean {
  const length = candidate.end - candidate.start;
  const bestLength = best.end - best.start;
  if (length !== bestLength) return length > bestLength;
  if (candidate.lemmatized !== best.lemmatized) return !candidate.lemmatized;
  if (entry.collins !== bestEntry.collins) return entry.collins > bestEntry.collins;
  const frq = entry.frq > 0 ? entry.frq : Number.POSITIVE_INFINITY;
  const bestFrq = bestEntry.frq > 0 ? bestEntry.frq : Number.POSITIVE_INFINITY;
  return frq < bestFrq;
}
