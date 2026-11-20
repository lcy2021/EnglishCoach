/** Full English of the paragraph the reader currently has open. */
export function formatOpenParagraph(
  article: { title: string; paragraphs: Array<{ index: number; text: string }> } | null,
  selectedParagraphIndex: number | null,
): string {
  if (!article || selectedParagraphIndex === null) return "";
  const paragraph = article.paragraphs.find((item) => item.index === selectedParagraphIndex);
  if (!paragraph?.text) return "";
  return [
    "Current paragraph (already loaded; explain from this full text, do not call a tool just to read it):",
    `Title: ${article.title}`,
    `Paragraph ${paragraph.index + 1}:`,
    paragraph.text,
  ].join("\n");
}
