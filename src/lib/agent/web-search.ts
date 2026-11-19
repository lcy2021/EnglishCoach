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

/** Optional dedicated search API (https://tavily.com). Used first when TAVILY_API_KEY is set. */
async function searchWithTavily(query: string, apiKey: string): Promise<SearchResult> {
  const response = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ query, max_results: 8, search_depth: "basic", include_answer: false }),
    signal: AbortSignal.timeout(20_000),
  });
  const payload = (await response.json().catch(() => ({}))) as {
    detail?: { error?: string } | string;
    results?: Array<{ title?: string; url?: string; content?: string }>;
  };
  if (!response.ok) {
    const detail = typeof payload.detail === "string" ? payload.detail : payload.detail?.error;
    throw new Error(detail || `Tavily search failed (${response.status})`);
  }
  const results = (payload.results ?? []).filter((item) => item.url);
  if (results.length === 0) throw new Error("Tavily returned no results.");
  return {
    answer: results
      .map((item, i) => `${i + 1}. ${item.title || item.url}\n   ${item.url}\n   ${(item.content ?? "").slice(0, 240)}`)
      .join("\n"),
    citations: results.map((item) => ({ url: item.url as string, title: item.title || (item.url as string) })),
  };
}

/**
 * Searches the web. With TAVILY_API_KEY set it uses Tavily (fast, works with any LLM
 * provider); otherwise, or if Tavily fails, it uses the hosted web_search tool of the
 * OpenAI / Azure OpenAI Responses API with the same LLM_API_KEY, LLM_BASE_URL and LLM_MODEL as chat.
 */
export async function searchWeb(query: string): Promise<SearchResult> {
  const tavilyKey = process.env.TAVILY_API_KEY?.trim();
  if (tavilyKey) {
    try {
      return await searchWithTavily(query, tavilyKey);
    } catch (error) {
      console.warn("[web_search] Tavily failed, falling back:", error instanceof Error ? error.message : error);
    }
  }
  return searchWithHostedTool(query);
}

async function searchWithHostedTool(query: string): Promise<SearchResult> {
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
