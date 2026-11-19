import { getChatModel } from "@/lib/agent/model";
import { listDrills } from "@/lib/db";
import {
  gradeLocally,
  gradeSummary,
  mergeGrades,
  parseDrillGrade,
  drillLevelSpec,
  parseDrillPrompt,
  type DrillPrompt,
  type SlotGrade,
} from "./parse";

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

const DRILL_SYSTEM =
  'You set one translation item for a Chinese learner of English. Reply ONLY JSON: {"zh":string,"words":string[],"end":"."|"?"|"!","phrases":[{"text":string,"gloss":string}],"vocab":[{"text":string,"gloss":string}]}. zh is one natural Chinese sentence matching the given tags and topic. words is its English translation in order, with no punctuation inside a token. Keep apostrophes and hyphens. Match the requested difficulty and word count. If a tag names an exam or school level (初中, 高中, 四级, 六级, 考研), keep vocabulary and sentence shape in that range. If a tag is a domain or scene (生活用语, 职场, 科技), set the content there. end is the closing mark. phrases: 1-3 useful multi-word chunks from the English sentence with short Chinese glosses. vocab: 2-5 worthwhile single words (not a/an/the/be/do/have/to/of/in/on/for) with short Chinese glosses. Do not write the English sentence anywhere except words / phrases / vocab.';

/** Ask the model for one Chinese sentence from the tags and difficulty the learner chose. */
export async function createDrill(
  tags: string[],
  difficulty: string,
  extraTopic = "",
): Promise<DrillPrompt> {
  const label = tags.map((tag) => tag.trim()).filter(Boolean).slice(0, 8).join("、");
  const topic = extraTopic.trim().slice(0, 80);
  const focus = [label, topic].filter(Boolean).join("；") || "生活用语";
  const spec = drillLevelSpec(difficulty);
  // Every call is stateless, so without help the model keeps returning the same sentence for the same tags.
  // Show it what was asked recently, and push it toward a different situation each time.
  const recent = listDrills(15).map((item) => item.zh);
  const avoid = recent.length
    ? `\nDo NOT repeat or paraphrase these earlier sentences:\n${recent.map((zh) => `- ${zh}`).join("\n")}`
    : "";
  const angles = ["a conversation between two people", "a short request or question", "something that just happened", "a plan for tomorrow", "an opinion or feeling", "an instruction or reminder", "a complaint or apology", "a piece of news"];
  const angle = `\nThis time write ${angles[Math.floor(Math.random() * angles.length)]}.`;
  const model = getChatModel(false, "drill-create", 0.9);
  let lastError: Error | null = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const raw = await model.invoke([
        { role: "system", content: DRILL_SYSTEM },
        {
          role: "user",
          content:
            attempt === 0
              ? `Tags and topic: ${focus}\nDifficulty: ${spec.level}. ${spec.note}\nEnglish words: ${spec.min} to ${spec.max}.${angle}${avoid}`
              : `Tags and topic: ${focus}\nDifficulty: ${spec.level}. ${spec.note}\nThe previous reply did not contain ${spec.min} to ${spec.max} English words. Reply again with ${spec.min} to ${spec.max} words.${angle}${avoid}`,
        },
      ]);
      return parseDrillPrompt(textOf(raw.content));
    } catch (error) {
      lastError = error instanceof Error ? error : new Error("出题失败");
    }
  }
  throw lastError ?? new Error("出题失败");
}

/** Compare the filled blanks with the reference, then let the model accept a real synonym. */
export async function gradeDrill(
  prompt: DrillPrompt,
  attempt: string[],
): Promise<{ slots: SlotGrade[]; summary: string }> {
  const local = gradeLocally(prompt.words, attempt);
  if (local.every((slot) => slot.status === "correct")) {
    return { slots: local, summary: gradeSummary(local, "") };
  }

  try {
    const model = getChatModel(false, "drill-grade");
    const raw = await model.invoke([
      {
        role: "system",
        content:
          'Grade one blank per reference word, in order. Reply ONLY JSON: {"slots":[{"status":"correct"|"close"|"wrong"}],"summary":string}. slots length must match the reference. correct means the same word, ignoring case. close means a natural synonym or inflection that still translates this Chinese sentence in this position. wrong means missing or a different meaning. summary is one short Chinese sentence about what to fix.',
      },
      {
        role: "user",
        content: JSON.stringify({
          zh: prompt.zh,
          words: prompt.words,
          attempt: prompt.words.map((_, index) => attempt[index] ?? ""),
        }),
      },
    ]);
    const parsed = parseDrillGrade(textOf(raw.content), prompt.words);
    const slots = mergeGrades(local, parsed?.slots ?? null);
    return { slots, summary: gradeSummary(slots, parsed?.summary ?? "") };
  } catch {
    return { slots: local, summary: gradeSummary(local, "") };
  }
}
