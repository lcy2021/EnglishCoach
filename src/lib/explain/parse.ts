export interface ExplainNote {
  text: string;
  gloss: string;
  sentence: string;
}

export interface ExplainPayload {
  zh: string;
  phrases: ExplainNote[];
  words: ExplainNote[];
}

const NOTE_CAP = 4;

function asNote(value: unknown): ExplainNote | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const text = typeof row.text === "string" ? row.text.trim() : "";
  const gloss = typeof row.gloss === "string" ? row.gloss.trim() : "";
  if (!text || !gloss) return null;
  const sentence = typeof row.sentence === "string" ? row.sentence.trim() : "";
  return { text, gloss, sentence };
}

/**
 * Pull a fluent Chinese rendering and a few notes out of a model reply.
 * Throws when the reply has no usable Chinese sentence.
 */
export function parseExplainPayload(raw: string): ExplainPayload {
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("讲解没有返回可用的内容");
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonMatch[0]);
  } catch {
    throw new Error("讲解没有返回可用的内容");
  }
  if (!parsed || typeof parsed !== "object") {
    throw new Error("讲解没有返回可用的内容");
  }
  const body = parsed as Record<string, unknown>;
  const zh = typeof body.zh === "string" ? body.zh.trim() : "";
  if (!zh) throw new Error("讲解没有写出中文");
  const phrases = Array.isArray(body.phrases)
    ? body.phrases
        .map(asNote)
        .filter((item): item is ExplainNote => item !== null)
        .slice(0, NOTE_CAP)
    : [];
  const words = Array.isArray(body.words)
    ? body.words
        .map(asNote)
        .filter((item): item is ExplainNote => item !== null)
        .slice(0, NOTE_CAP)
    : [];
  return { zh, phrases, words };
}
