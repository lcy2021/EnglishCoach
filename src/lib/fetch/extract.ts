import { spawn } from "node:child_process";
import path from "node:path";
import { Readability } from "@mozilla/readability";
import { JSDOM } from "jsdom";
import { aiSelectBody } from "@/lib/fetch/ai-tidy";
import { cleanParagraphs } from "@/lib/fetch/clean";

export interface ExtractedArticle {
  title: string;
  url: string | null;
  paragraphs: string[];
  textContent: string;
  /** Lines of page furniture dropped by the cleaner. */
  removed?: number;
}

function splitParagraphs(text: string): string[] {
  return text
    .split(/\n+/)
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter((p) => p.length > 0);
}

export function extractFromHtml(
  html: string,
  url?: string | null,
): ExtractedArticle {
  const dom = new JSDOM(html, { url: url ?? undefined });
  const reader = new Readability(dom.window.document);
  const parsed = reader.parse();

  if (!parsed) {
    const bodyText = dom.window.document.body?.textContent ?? "";
    const paragraphs = splitParagraphs(bodyText);
    if (paragraphs.length === 0) {
      throw new Error("Could not extract readable content from the page.");
    }
    return {
      title: dom.window.document.title || "Untitled",
      url: url ?? null,
      paragraphs,
      textContent: paragraphs.join("\n\n"),
    };
  }

  const contentDom = new JSDOM(`<body>${parsed.content}</body>`);
  const nodes = Array.from(
    contentDom.window.document.body.querySelectorAll(
      "p, li, h1, h2, h3, h4, h5, h6, blockquote, pre, figcaption",
    ),
  );
  let paragraphs = nodes
    .map((n) => (n.textContent ?? "").replace(/\s+/g, " ").trim())
    .filter((t) => t.length > 1);

  if (paragraphs.length === 0) {
    paragraphs = splitParagraphs(parsed.textContent ?? "");
  }

  if (paragraphs.length === 0) {
    throw new Error("Extracted article had no paragraphs.");
  }

  return {
    title: parsed.title || "Untitled",
    url: url ?? null,
    paragraphs,
    textContent: paragraphs.join("\n\n"),
  };
}

const SCRAPLING_SCRIPT = path.join(process.cwd(), "scripts", "scrapling_fetch.py");

function fetchWithReadability(url: string): Promise<ExtractedArticle> {
  return fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (compatible; EnglishCoach/0.1; +https://localhost)",
      Accept: "text/html,application/xhtml+xml",
    },
    redirect: "follow",
  }).then(async (response) => {
    if (!response.ok) {
      throw new Error(`Fetch failed (${response.status}) for ${url}`);
    }
    return extractFromHtml(await response.text(), url);
  });
}

/** Pull the full document with Scrapling. Readability is only the backup. */
function fetchWithScrapling(url: string): Promise<ExtractedArticle> {
  return new Promise((resolve, reject) => {
    const python = process.env.PYTHON || "python";
    const child = spawn(python, [SCRAPLING_SCRIPT, url], {
      cwd: process.cwd(),
      windowsHide: true,
      env: { ...process.env, PYTHONIOENCODING: "utf-8" },
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error("Scrapling 抓取超时"));
    }, 50_000);
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(stderr.trim() || `Scrapling 退出码 ${code}`));
        return;
      }
      try {
        const parsed = JSON.parse(stdout) as { title?: string; paragraphs?: unknown };
        const paragraphs = Array.isArray(parsed.paragraphs)
          ? parsed.paragraphs.filter((item): item is string => typeof item === "string" && item.trim().length > 1)
          : [];
        if (paragraphs.length === 0) {
          reject(new Error("Extracted article had no paragraphs."));
          return;
        }
        resolve({
          title: parsed.title?.trim() || "Untitled",
          url,
          paragraphs,
          textContent: paragraphs.join("\n\n"),
        });
      } catch (error) {
        reject(error instanceof Error ? error : new Error("Scrapling 没有返回正文"));
      }
    });
  });
}

/**
 * Drop menus, share buttons, related links and footers from a fetched page.
 * Cheap rules run first; then the model picks the real article blocks from what is left.
 * If the model is off or answers badly, the rule-based result stands.
 */
async function tidy(
  article: ExtractedArticle,
  onProgress?: (text: string) => void,
): Promise<ExtractedArticle> {
  const ruled = cleanParagraphs(article.paragraphs, article.title);
  onProgress?.(`正在梳理正文（${ruled.paragraphs.length} 块）`);
  const ai = await aiSelectBody(article.title, ruled.paragraphs);
  const paragraphs = ai?.paragraphs ?? ruled.paragraphs;
  const removed = article.paragraphs.length - paragraphs.length;
  return { ...article, paragraphs, textContent: paragraphs.join("\n\n"), removed };
}

export async function fetchAndExtract(
  url: string,
  onProgress?: (text: string) => void,
): Promise<ExtractedArticle> {
  const parsed = new URL(url);
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("只能拉取 http 或 https 链接");
  }
  try {
    onProgress?.(`正在抓取 ${parsed.hostname}`);
    return await tidy(await fetchWithScrapling(url), onProgress);
  } catch (scraplingError) {
    try {
      onProgress?.("换个方式再抓一次");
      return await tidy(await fetchWithReadability(url), onProgress);
    } catch {
      throw scraplingError instanceof Error ? scraplingError : new Error("拉取失败");
    }
  }
}

export function organizePlainText(
  text: string,
  title = "Pasted text",
): ExtractedArticle {
  const paragraphs = splitParagraphs(text);
  if (paragraphs.length === 0) {
    throw new Error("No paragraphs found in pasted text.");
  }
  return {
    title,
    url: null,
    paragraphs,
    textContent: paragraphs.join("\n\n"),
  };
}
