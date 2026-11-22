import { getChatModel } from "@/lib/agent/model";
import { drillLevelSpec, type DrillLevel } from "@/lib/drill/parse";

export interface ConverseTurn {
  role: "assistant" | "user";
  en: string;
  zh?: string;
  /** Chinese note about the learner's English (grammar / meaning / tone). */
  feedback?: string;
  /** How a native speaker would say the same idea. */
  native?: string;
}

export interface ConverseReply {
  en: string;
  zh: string;
  feedback: string;
  native: string;
}

function textOf(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((part) => {
      if (typeof part === "string") return part;
      if (
        part &&
        typeof part === "object" &&
        "text" in part &&
        typeof (part as { text: unknown }).text === "string"
      ) {
        return (part as { text: string }).text;
      }
      return "";
    })
    .join("");
}

function focusFrom(tags: string[], topic: string): string {
  const label = tags.map((tag) => tag.trim()).filter(Boolean).slice(0, 8).join("、");
  const extra = topic.trim().slice(0, 80);
  return [label, extra].filter(Boolean).join("；") || "生活用语";
}

function parseReply(raw: string): ConverseReply {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("对话回复格式不对");
  const data = JSON.parse(match[0]) as {
    en?: unknown;
    zh?: unknown;
    feedback?: unknown;
    tip?: unknown;
    native?: unknown;
  };
  const en = typeof data.en === "string" ? data.en.trim() : "";
  const zh = typeof data.zh === "string" ? data.zh.trim() : "";
  const feedback =
    typeof data.feedback === "string"
      ? data.feedback.trim()
      : typeof data.tip === "string"
        ? data.tip.trim()
        : "";
  const native = typeof data.native === "string" ? data.native.trim() : "";
  if (!en || !zh) throw new Error("对话回复不完整");
  const one = en.replace(/\s+/g, " ").trim();
  let nativeLine = native.replace(/\s+/g, " ").trim();
  // Model sometimes dumps its own next turn into native; drop that copy.
  if (nativeLine && nativeLine.toLowerCase() === one.toLowerCase()) {
    nativeLine = "";
  }
  return { en: one, zh, feedback, native: nativeLine };
}

function levelNote(level: DrillLevel): string {
  if (level === "入门") {
    return "Use very common words and one short clause (about 5–10 words).";
  }
  if (level === "较难") {
    return "Use richer wording and a slightly longer natural sentence (about 12–20 words).";
  }
  return "Use natural everyday English in one clear sentence (about 8–14 words).";
}

const SYSTEM = `You are the LEAD speaker in a spoken English practice chat with a Chinese learner (free replies, not fill-in blanks). You steer the scene; the learner answers you. Talk like a real person, not a quiz host or a polite chatbot that only mirrors greetings.
Reply ONLY JSON: {"en":string,"zh":string,"feedback":string,"native":string}.
Rules:
- en: exactly ONE English sentence for YOUR spoken turn. No second sentence. It must move the dialogue forward and usually end with a soft question or a clear invitation to reply (so the learner has something to say next).
- zh: a short Chinese gloss of that English sentence.
- feedback: 1–2 short Chinese sentences about ONLY the learner's latest reply (the current line). Point out what works / what sounds off in that line alone. Do NOT review, quote, or accumulate notes about earlier turns. Do NOT summarize the whole chat. Use "" only when starting (no learner reply yet).
- native: rewrite ONLY that same latest learner reply as one natural native English sentence with the same meaning. Never copy your own en. Never put your next turn into native. Never merge earlier learner lines into native. If their English is already natural, lightly polish it. Use "" only when starting.
- You are AI-led: after any greeting or small talk, YOU pull the chat toward the tags/topic with a natural bridge. Do not leave the conversation stranded on "I'm fine too / taking it easy / nice to meet you."
- Forbidden dead-end lines: closed status updates with no ask (e.g. "I'm doing well too, thanks—just taking it easy for now."), pure acknowledgements ("Okay.", "Got it.", "Same here."), or ending after the greeting round.
- Tags/topic are the destination. Ease in over a few turns — no sudden "What do you think about X?" or "Today's topic is …" — but do not stay in empty small talk for long.
- If a tag names an exam or school level (初中, 高中, 四级, 六级, 考研), keep YOUR vocabulary in that range; still coach the learner honestly.
- Match the difficulty note.
- Never put Chinese inside en or native. Never put English inside zh or feedback except necessary quotes of the learner's words.`;

const OPENING_STYLE = `Opening style (sound human, still AI-led):
- First line: a light greeting PLUS a tiny easy ask a friend/colleague might use (how their day is, if they have a minute, something concrete in the moment).
- Do NOT open with a broad category interview question (bad: "What do you think about technology / travel / finance?" / "Tell me about your job.").
- The opener must invite a reply; never a closed statement.`;

/** Open a tagged scene with one English sentence from the AI. */
export async function startConverse(
  tags: string[],
  difficulty: string,
  topic = "",
): Promise<ConverseReply> {
  const focus = focusFrom(tags, topic);
  const spec = drillLevelSpec(difficulty);
  const model = getChatModel(false, "converse", 0.85);
  const raw = await model.invoke([
    { role: "system", content: SYSTEM },
    {
      role: "user",
      content: `Start a spoken dialogue.\nScene destination (steer here gradually): ${focus}\nDifficulty: ${spec.level}. ${levelNote(spec.level)}\n${OPENING_STYLE}\nYou speak first. feedback and native must both be "".`,
    },
  ]);
  return parseReply(textOf(raw.content));
}

/** Continue: learner wrote free English; AI coaches then answers with one sentence. */
export async function continueConverse(
  tags: string[],
  difficulty: string,
  topic: string,
  history: ConverseTurn[],
  userEn: string,
): Promise<ConverseReply> {
  const focus = focusFrom(tags, topic);
  const spec = drillLevelSpec(difficulty);
  const line = userEn.trim().replace(/\s+/g, " ");
  if (!line) throw new Error("先写一句英文再发送");
  const exchangeCount = history.filter((turn) => turn.role === "user").length + 1;
  const transcript = [...history, { role: "user" as const, en: line }]
    .slice(-12)
    .map((turn) => `${turn.role === "assistant" ? "AI" : "Learner"}: ${turn.en}`)
    .join("\n");
  const pacing =
    exchangeCount === 1
      ? `After this greeting/small-talk reply: briefly acknowledge, then YOU lead with a concrete bridge into "${focus}" (still one sentence, end with an easy ask). Bad: only answering "I'm fine too / taking it easy" and stopping.`
      : exchangeCount === 2
        ? `Keep leading into "${focus}" with a natural next step or follow-up ask. Do not restart empty greetings.`
        : `Stay inside the "${focus}" scene. Ask or invite the next concrete detail; keep leading.`;
  const model = getChatModel(false, "converse", 0.7);
  const raw = await model.invoke([
    { role: "system", content: SYSTEM },
    {
      role: "user",
      content: `Continue the dialogue. YOU lead.\nScene destination: ${focus}\nDifficulty: ${spec.level}. ${levelNote(spec.level)}\nLearner replies so far (including this one): ${exchangeCount}.\n${pacing}\nTranscript (context only — do not coach older lines):\n${transcript}\nCurrent learner line to coach (ONLY this): "${line}"\n1) feedback = short Chinese notes on that current line alone; do not mention earlier replies.\n2) native = native rephrase of that current line alone (must differ from your en; must not include older lines).\n3) en + zh = your next spoken turn: react briefly AND drive the scene forward with an ask or clear invitation to reply.\nAlways fill feedback and native for this step.`,
    },
  ]);
  return parseReply(textOf(raw.content));
}
