interface Citation {
  url: string;
  title: string;
}

interface SearchResult {
  answer: string;
  citations: Citation[];
}

function baseUrl(): string {
  return (process.env.LLM_BASE_URL || "https://api.openai.com/v1").replace(
    /\/$/,
    "",
  );
}

function extractCitations(payload: unknown): Citation[] {
  const seen = new Set<string>();
  const citations: Citation[] = [];
  const output = (payload as { output?: unknown[] })?.output ?? [];
  for (const item of output) {
    const content = (item as { content?: unknown[] }).content ?? [];
    for (const part of content) {
      const annotations =
        (part as { annotations?: Array<Record<string, string>> }).annotations ??
        [];
      for (const note of annotations) {
        const url = note.url;
        if (!url || seen.has(url)) continue;
        seen.add(url);
        citations.push({ url, title: note.title || url });
      }
    }
  }
  return citations;
}

function extractAnswer(payload: unknown): string {
  const direct = (payload as { output_text?: string }).output_text;
  if (direct?.trim()) return direct.trim();
  const output = (payload as { output?: unknown[] }).output ?? [];
  const chunks: string[] = [];
  for (const item of output) {
    const content = (item as { content?: Array<{ text?: string }> }).content;
    for (const part of content ?? []) {
      if (part.text) chunks.push(part.text);
    }
  }
  return chunks.join("\n").trim();
}

/**
 * Calls Azure OpenAI / OpenAI Responses API with the hosted web_search tool.
 * Uses the same LLM_API_KEY, LLM_BASE_URL, and LLM_MODEL as chat.
 */
export async function searchWeb(query: string): Promise<SearchResult> {
  const apiKey = process.env.LLM_API_KEY;
  if (!apiKey) {
    throw new Error("LLM_API_KEY is not set.");
  }
  const response = await fetch(`${baseUrl()}/responses`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      "api-key": apiKey,
    },
    body: JSON.stringify({
      model: process.env.LLM_MODEL || "gpt-4o-mini",
      tools: [{ type: "web_search" }],
      input: query,
    }),
    signal: AbortSignal.timeout(90_000),
  });
  const payload = (await response.json()) as {
    error?: { message?: string };
    output_text?: string;
  };
  if (!response.ok) {
    throw new Error(
      payload.error?.message || `Web search failed (${response.status})`,
    );
  }
  return {
    answer: extractAnswer(payload),
    citations: extractCitations(payload),
  };
}
