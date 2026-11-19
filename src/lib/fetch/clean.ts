/**
 * Strip web-page furniture (breadcrumbs, share buttons, contact blocks, footers) from
 * extracted paragraphs. Conservative on purpose: short lines in the middle of an article
 * are usually headings and stay. Pure, so it can be tested without a page.
 */

export interface CleanResult {
  paragraphs: string[];
  removed: string[];
}

const MONTHS =
  "(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)";

/** Whole-line boilerplate, matched against the trimmed, lower-cased line. */
const BOILERPLATE = new RegExp(
  "^(?:" +
    [
      "breadcrumbs?",
      "skip to (?:main )?content",
      "skip to navigation",
      "(?:share|print|email|tweet|save|bookmark|comment|comments|like)(?: this)?(?: (?:article|story|page|post))?",
      "(?:share|follow) (?:on|us on) \\w+",
      "(?:facebook|twitter|linkedin|instagram|youtube|reddit|whatsapp|pinterest|x)",
      "(?:subscribe|sign up|sign in|log in|login|register)(?: (?:now|today|to our newsletter|for our newsletter))?",
      "(?:related|more|recommended|popular|trending|latest|top) (?:articles?|stories|posts|news|reading|videos|topics)",
      "you might also like|you may also like|read next|read more|learn more|see more|view all|back to top",
      "advertisement|sponsored|ad",
      "menu|search|home|close|next|previous|toggle navigation",
      "(?:press|media) (?:inquiries|contact|contacts|office)",
      "newsletter|privacy policy|terms of (?:use|service)|cookie(?:s| policy| settings)?|accept (?:all )?cookies",
      "(?:all )?rights reserved\\.?",
      "previous(?: image)?(?: next(?: image)?)?|next image|next slide|previous slide",
    ].join("|") +
    ")[.:!]?$",
  "i",
);

const FOOTER_HINT =
  /©|\bcopyright\b|all rights reserved|privacy policy|terms of (?:use|service)|\bnewsletter\b|\bsubscribe\b|\bfollow us\b|\bshare (?:this|on)\b|\bsign up\b/i;

/** "Label:" lines that open a small metadata block (dates, contacts, tags). */
const META_LABEL = new RegExp(
  "^(?:publication date|published|posted|updated|last updated|date|press contact|media contact|contact|contacts|email|e-mail|phone|tel|telephone|fax|tags?|categories|category|topics?|filed under|author|authors|source|credit|photo|image credit)\\s*:?$",
  "i",
);

const DATE_ONLY = new RegExp(
  `^(?:${MONTHS}\\.?\\s+\\d{1,2}(?:st|nd|rd|th)?,?\\s+\\d{4}|\\d{1,2}\\s+${MONTHS}\\.?\\s+\\d{4}|\\d{4}[-/.]\\d{1,2}[-/.]\\d{1,2}|\\d{1,2}[-/.]\\d{1,2}[-/.]\\d{4})$`,
  "i",
);

/** Where the article ends and the page's "related stories / share / tags" area begins. */
const FOOTER_MARKER = new RegExp(
  "^(?:share (?:this|on)\\b.*|related (?:links?|articles?|stories|news|content|topics|posts|reading)|more (?:from|stories|news|on)\\b.*|you (?:might|may) also like|read next|recommended(?: for you)?|latest news|comments?|about the author|newsletter)[.:]?$",
  "i",
);

/** Photo and image credits sitting between paragraphs. */
const CREDIT = /^(?:(?:image|photo|picture|illustration|graphic|video)\s+)?(?:courtesy of|credits?:|photo by|image by|photograph by|photos? credit)\b/i;

const EMAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/;
const PHONE = /(?:\+?\d[\d\s().-]{7,}\d)/;

function words(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

function letters(text: string): number {
  return (text.match(/\p{L}/gu) ?? []).length;
}

function norm(text: string): string {
  return text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

/** A real body paragraph: enough words to be prose, not a label. */
function isSubstantial(text: string): boolean {
  return words(text) >= 12 && text.length >= 70;
}

function isShortFragment(text: string): boolean {
  return words(text) <= 5 && text.length <= 50;
}

function looksLikeContactOrDate(text: string): boolean {
  if (DATE_ONLY.test(text)) return true;
  if (text.length <= 90 && (EMAIL.test(text) || (PHONE.test(text) && letters(text) <= 20))) return true;
  return false;
}

export function cleanParagraphs(input: string[], title = ""): CleanResult {
  const removed: string[] = [];
  const drop = (text: string) => {
    removed.push(text);
  };
  const titleKey = norm(title);

  // Pass 1: line-level furniture.
  const stage1: string[] = [];
  let metaMode = false;
  input.forEach((raw, index) => {
    const text = raw.replace(/\s+/g, " ").trim();
    if (!text) return;

    if (letters(text) === 0) return drop(text); // separators, bare numbers
    if (titleKey && index < 6 && norm(text) === titleKey) return drop(text); // the page title again
    if (BOILERPLATE.test(text)) return drop(text);
    if (CREDIT.test(text) && words(text) <= 18) return drop(text);
    if (META_LABEL.test(text) || (text.endsWith(":") && words(text) <= 3 && text.length <= 30)) {
      metaMode = true;
      return drop(text);
    }
    if (looksLikeContactOrDate(text)) return drop(text);
    if (metaMode) {
      if (isShortFragment(text)) return drop(text); // the value lines under a label
      metaMode = false;
    }
    stage1.push(text);
  });

  // Pass 2a: cut the "share / related stories / tags" area once real prose has ended.
  for (let i = 0; i < stage1.length; i += 1) {
    if (words(stage1[i]) > 8 || !FOOTER_MARKER.test(stage1[i])) continue;
    const before = stage1.slice(0, i).filter(isSubstantial).length;
    const after = stage1.slice(i + 1).filter(isSubstantial).length;
    if (before >= 3 && after <= 4) {
      stage1.splice(i).forEach(drop);
      break;
    }
  }

  // Pass 2b: header junk before the body and footer junk after it.
  const firstBody = stage1.findIndex(isSubstantial);
  let lastBody = -1;
  for (let i = stage1.length - 1; i >= 0; i -= 1) {
    if (isSubstantial(stage1[i])) {
      lastBody = i;
      break;
    }
  }

  const keep = stage1.map(() => true);
  if (firstBody > 0 && firstBody <= 15) {
    for (let i = 0; i < firstBody; i += 1) {
      // Keep a lone standfirst or heading directly above the body; drop the stack of fragments before it.
      if (isShortFragment(stage1[i]) || FOOTER_HINT.test(stage1[i])) keep[i] = false;
    }
  }
  if (lastBody >= 0) {
    for (let i = lastBody + 1; i < stage1.length; i += 1) {
      if (isShortFragment(stage1[i]) || FOOTER_HINT.test(stage1[i])) keep[i] = false;
    }
  }

  const cleaned: string[] = [];
  const seen = new Set<string>();
  stage1.forEach((text, i) => {
    if (!keep[i]) return drop(text);
    const key = norm(text);
    if (key && seen.has(key) && !isSubstantial(text)) return drop(text); // repeated short line
    seen.add(key);
    cleaned.push(text);
  });

  // Never hand back an empty article because the heuristics were too keen.
  if (cleaned.length === 0) {
    return { paragraphs: input.map((p) => p.replace(/\s+/g, " ").trim()).filter(Boolean), removed: [] };
  }
  return { paragraphs: cleaned, removed };
}
