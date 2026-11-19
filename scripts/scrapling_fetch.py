"""Fetch one page with Scrapling and print the full document as JSON.

The previous reader kept only long paragraphs from Mozilla Readability, so
short lines and later sections disappeared. This keeps every text block in the
richest container on the page (article, main, or body).
"""

from __future__ import annotations

import json
import re
import sys
from html import unescape

from scrapling.fetchers import Fetcher

CONTAINER_SELECTORS = (
    "article",
    "main",
    "[role=main]",
    ".post-content",
    ".entry-content",
    ".article-body",
    "#mw-content-text",
    "body",
)


def clean(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()


def paragraphs_from_html(html: str) -> list[str]:
    """Turn page HTML into paragraphs, including pages that separate lines with <br>."""
    without_chrome = re.sub(
        r"(?i)<(?:script|style|noscript|svg|nav|footer|header|aside|form)\b[^>]*>.*?</(?:script|style|noscript|svg|nav|footer|header|aside|form)>",
        " ",
        html,
        flags=re.S,
    )
    with_breaks = re.sub(r"(?i)<br\s*/?>", "\n", without_chrome)
    with_blocks = re.sub(
        r"(?i)</(?:p|div|li|h[1-6]|blockquote|pre|tr|figcaption|section|article|td)>",
        "\n\n",
        with_breaks,
    )
    text = unescape(re.sub(r"<[^>]+>", "", with_blocks))
    paragraphs: list[str] = []
    seen: set[str] = set()
    for chunk in re.split(r"\n\s*\n", text):
        line = clean(chunk)
        if len(line) < 2 or line in seen:
            continue
        seen.add(line)
        paragraphs.append(line)
    return paragraphs


def densest_block(html: str) -> list[str]:
    """Fallback for pages with no recognisable article container.

    Score every div/section/article by the prose in its own <p> children and keep the
    winner. Menus and footers are lists of links, so they score near zero.
    """
    try:
        from lxml import html as lxml_html

        root = lxml_html.fromstring(html)
    except Exception:
        return []
    best_node = None
    best_score = 0
    for node in root.iter("div", "section", "article", "main"):
        score = 0
        for child in node:
            if child.tag == "p":
                text = clean(child.text_content())
                if len(text) >= 40:
                    score += len(text)
        if score > best_score:
            best_score = score
            best_node = node
    if best_node is None or best_score < 400:
        return []
    return paragraphs_from_html(lxml_html.tostring(best_node, encoding="unicode"))


def choose_paragraphs(page) -> list[str]:
    body: list[str] = []
    best: list[str] = []
    best_score = 0
    for selector in CONTAINER_SELECTORS:
        nodes = page.css(selector)
        if not nodes:
            continue
        html = str(getattr(nodes[0], "html_content", "") or "")
        if not html:
            continue
        paragraphs = paragraphs_from_html(html)
        score = sum(len(item) for item in paragraphs)
        if selector == "body":
            body = paragraphs
            continue
        if score > best_score:
            best_score = score
            best = paragraphs
    # A real article container beats the whole page, which still carries menus.
    if best_score >= 800:
        return best
    dense = densest_block(str(getattr(page, "html_content", "") or ""))
    if dense:
        return dense
    return body or best


def title_of(page, paragraphs: list[str]) -> str:
    for selector in (
        "h1::text",
        "meta[property='og:title']::attr(content)",
        "title::text",
    ):
        value = page.css(selector).get()
        if not value:
            continue
        text = clean(str(value))
        if text:
            return text
    return paragraphs[0][:80] if paragraphs else "Untitled"


def main() -> None:
    if len(sys.argv) != 2:
        print("usage: scrapling_fetch.py <url>", file=sys.stderr)
        sys.exit(2)
    url = sys.argv[1]
    try:
        page = Fetcher.get(url, impersonate="chrome", stealthy_headers=True, timeout=40)
    except Exception as error:
        print(f"Fetch failed for {url}: {error}", file=sys.stderr)
        sys.exit(1)
    status = int(getattr(page, "status", 200) or 200)
    if status >= 400:
        print(f"Fetch failed ({status}) for {url}", file=sys.stderr)
        sys.exit(1)
    paragraphs = choose_paragraphs(page)
    if not paragraphs:
        print("Extracted article had no paragraphs.", file=sys.stderr)
        sys.exit(1)
    sys.stdout.reconfigure(encoding="utf-8")
    json.dump(
        {"title": title_of(page, paragraphs), "url": url, "paragraphs": paragraphs},
        sys.stdout,
        ensure_ascii=False,
    )


if __name__ == "__main__":
    main()
