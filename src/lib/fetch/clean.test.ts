import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { cleanParagraphs } from "./clean.ts";

const BODY_1 =
  "Brain cells take in many signals through thousands of circuit connections. A new study discerns the rules that turn inputs into a functional arrangement for neurons that process vision.";
const BODY_2 =
  "The researchers recorded from hundreds of neurons while animals watched moving patterns, and they found that a simple weighting rule explained most of the activity they saw.";

const MIT = [
  "Breadcrumb",
  "MIT News",
  "The rules neurons follow to make sense of what we see",
  BODY_1,
  "David Orenstein | The Picower Institute for Learning and Memory",
  "Publication Date:",
  "May 21, 2026",
  "Press Inquiries",
  "Press Contact:",
  "David",
  "Orenstein",
  "Email: davidjo@mit.edu",
  "Phone: 617-324-2079",
  BODY_2,
  "Share this article",
  "© 2026 Massachusetts Institute of Technology",
];

describe("cleanParagraphs: page footers and captions", () => {
  const BODY_3 =
    "In all, they tracked eleven neurons that responded to the visual input and eleven others that seemingly ignored it, which gave the team a clean comparison.";

  it("cuts the share / related-links area and everything after it", () => {
    const { paragraphs } = cleanParagraphs(
      [
        BODY_1,
        BODY_2,
        BODY_3,
        "Share this news article on:",
        'Paper: "Functional organization of dendritic spines in mouse visual cortex layer 2/3 neurons"',
        "Related Links",
        "Sur Lab",
        "Neuroscience",
        "Prefrontal cortex reaches back into the brain to shape how other regions function",
      ],
      "T",
    );
    assert.deepEqual(paragraphs, [BODY_1, BODY_2, BODY_3]);
  });

  it("drops image credits and carousel buttons between paragraphs", () => {
    const { paragraphs } = cleanParagraphs(
      [BODY_1, "Image courtesy of the Sur Lab/Picower Institute.", "Previous image Next image", BODY_2],
      "T",
    );
    assert.deepEqual(paragraphs, [BODY_1, BODY_2]);
  });

  it("does not cut an article that merely mentions related work in the middle", () => {
    const { paragraphs } = cleanParagraphs([BODY_1, "Related Links", BODY_2, BODY_3], "T");
    assert.ok(paragraphs.includes(BODY_3));
  });
});

describe("cleanParagraphs", () => {
  it("removes breadcrumbs, the repeated title, contact blocks and footers", () => {
    const { paragraphs } = cleanParagraphs(MIT, "The rules neurons follow to make sense of what we see");
    assert.deepEqual(paragraphs, [
      BODY_1,
      "David Orenstein | The Picower Institute for Learning and Memory",
      BODY_2,
    ]);
  });

  it("reports what it removed", () => {
    const { removed } = cleanParagraphs(MIT, "The rules neurons follow to make sense of what we see");
    assert.ok(removed.includes("Breadcrumb"));
    assert.ok(removed.includes("Press Contact:"));
    assert.ok(removed.includes("Email: davidjo@mit.edu"));
  });

  it("keeps short headings in the middle of the article", () => {
    const { paragraphs } = cleanParagraphs([BODY_1, "How the study worked", BODY_2], "Other title");
    assert.deepEqual(paragraphs, [BODY_1, "How the study worked", BODY_2]);
  });

  it("keeps a closing line that is a real sentence", () => {
    const { paragraphs } = cleanParagraphs([BODY_1, BODY_2, "Thanks for reading along with us today."], "T");
    assert.equal(paragraphs.at(-1), "Thanks for reading along with us today.");
  });

  it("never returns an empty article", () => {
    const { paragraphs } = cleanParagraphs(["Menu", "Home"], "T");
    assert.deepEqual(paragraphs, ["Menu", "Home"]);
  });

  it("drops a bare date line but not a sentence that mentions a date", () => {
    const sentence = "The experiment began on May 21, 2026 and continued for six weeks under the same conditions.";
    const { paragraphs } = cleanParagraphs([BODY_1, "May 21, 2026", sentence], "T");
    assert.deepEqual(paragraphs, [BODY_1, sentence]);
  });
});
