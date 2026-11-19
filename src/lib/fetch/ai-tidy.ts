import { getChatModel } from "@/lib/agent/model";
import { parseKeepIndexes } from "@/lib/fetch/keep-parse";

/** Longest slice of each paragraph shown to the model; enough to tell prose from a menu. */
const PREVIEW_CHARS = 140;
/** Pages with more blocks than this are trimmed from the tail before asking. */
const MAX_BLOCKS = 400;
const TIMEOUT_MS = 25_000;

function textOf(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((part) =>
      typeof part === "string"
        ? part
        : part && typeof part === "object" && typeof (part as { text?: unknown }).text === "string"
          ? (part as { text: string }).text
          : "",
    )
    .join("");
}

const SYSTEM_PROMPT = [
  "You clean text scraped from a web page so an English learner can read just the article.",
  "You get a title and a numbered list of text blocks (each cut to its first characters).",
  "Return the numbers of the blocks that belong to the article itself: the headline, standfirst/subtitle, body paragraphs, in-article subheadings, quotes, and captions of images that illustrate the story.",
  "Drop everything else: site menus and category lists, breadcrumbs, login/subscribe prompts, share buttons, bylines and publish dates, page numbers and 'Next' links, related or recommended stories, tags, comments, ads, footers, copyright and licence numbers, URLs and IDs.",
  "Never rewrite or reorder text; only choose blocks. When unsure about a block inside the body, keep it.",
  'The article is usually one or a few contiguous runs of blocks, so answer with inclusive ranges; a single block is [n,n].',
  'Reply ONLY JSON: {"ranges":[[from,to],...]}, for example {"ranges":[[12,30]]}.',
].join(" ");

/**
 * Ask the model which scraped blocks are the article. Returns the kept paragraphs,
 * or null if the model is unavailable or its answer looks wrong, so the caller can
 * fall back to the rule-based result.
 */
export async function aiSelectBody(
  title: string,
  paragraphs: string[],
): Promise<{ paragraphs: string[]; removed: number } | null> {
  if (!process.env.LLM_API_KEY || paragraphs.length < 3) return null;
  const considered = paragraphs.slice(0, MAX_BLOCKS);
  try {
    const model = getChatModel(false, "fetch-clean");
    const reply = await model.invoke(
      [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content:
            `Title: ${title}\n\n` +
            considered
              .map((p, i) => `[${i}] ${p.length > PREVIEW_CHARS ? `${p.slice(0, PREVIEW_CHARS)}…` : p}`)
              .join("\n"),
        },
      ],
      { signal: AbortSignal.timeout(TIMEOUT_MS) },
    );
    const keep = parseKeepIndexes(textOf(reply.content), considered.length);
    if (!keep) return null;
    const kept = keep.map((i) => considered[i]);
    // A near-empty answer means the model misread the task; trust the rules instead.
    const keptChars = kept.reduce((sum, p) => sum + p.length, 0);
    const totalChars = considered.reduce((sum, p) => sum + p.length, 0);
    if (kept.length < 2 || keptChars < totalChars * 0.2) return null;
    return { paragraphs: kept, removed: paragraphs.length - kept.length };
  } catch {
    return null;
  }
}
