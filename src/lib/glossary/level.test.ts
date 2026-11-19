import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { analyzeParagraphs, bandOf, entryRank, extractOccurrences } from "./level.ts";
import type { DictEntry, DictLookup } from "./match.ts";

function entry(partial: Partial<DictEntry> & Pick<DictEntry, "word">): DictEntry {
  return {
    phonetic: "",
    translation: "n. 测试",
    pos: "",
    exchange: "",
    collins: 0,
    oxford: 0,
    tag: "",
    frq: 0,
    ...partial,
  };
}

function dict(rows: DictEntry[]): DictLookup {
  const map = new Map(rows.map((row) => [row.word.toLowerCase(), row]));
  return (phrases) => {
    const result = new Map<string, DictEntry>();
    for (const phrase of phrases) {
      const hit = map.get(phrase.toLowerCase());
      if (hit) result.set(phrase.toLowerCase(), hit);
    }
    return result;
  };
}

const lookup = dict([
  entry({ word: "the", tag: "zk gk", frq: 1 }),
  entry({ word: "brain", tag: "zk gk cet4 ky toefl" }),
  entry({ word: "neuron", tag: "cet6 toefl", frq: 10575 }),
  entry({ word: "neurons", exchange: "0:neuron/1:s" }),
  entry({ word: "discern", tag: "cet6 ky toefl ielts gre" }),
  entry({ word: "cells", exchange: "0:cell/1:s" }),
  entry({ word: "cell", tag: "gk cet4" }),
  entry({ word: "sparkle", frq: 12000 }),
]);

describe("entryRank", () => {
  it("uses the lowest exam level that lists the word", () => {
    assert.equal(entryRank(entry({ word: "brain", tag: "zk gk cet4 ky toefl" })), 1);
    assert.equal(entryRank(entry({ word: "neuron", tag: "cet6 toefl" })), 4);
  });

  it("falls back to frequency when there is no exam tag, and to 8 when unknown", () => {
    assert.equal(entryRank(entry({ word: "sparkle", frq: 12000 })), 5);
    assert.equal(entryRank(entry({ word: "zzz" })), 8);
  });
});

describe("extractOccurrences", () => {
  it("skips names in mid-sentence and acronyms but keeps sentence-initial words", () => {
    const words = extractOccurrences(["The study by David Orenstein at MIT is good. Brain cells."]).map((o) => o.form);
    assert.ok(words.includes("the"));
    assert.ok(words.includes("brain"));
    assert.ok(!words.includes("david"));
    assert.ok(!words.includes("orenstein"));
    assert.ok(!words.includes("mit"));
  });

  it("keeps the stem of a contraction", () => {
    const words = extractOccurrences(["it doesn't matter"]).map((o) => o.form);
    assert.ok(words.includes("doesn"));
  });
});

describe("analyzeParagraphs", () => {
  it("resolves inflections through their lemma and reports coverage", () => {
    const result = analyzeParagraphs(["The brain cells discern neurons."], 3, lookup);
    assert.equal(result.totalWords, 5);
    assert.equal(result.knownWords, 3);
    assert.ok(result.coverage < 0.7);
    const lemmas = result.hard.map((w) => w.lemma).sort();
    assert.deepEqual(lemmas, ["discern", "neuron"]);
    assert.ok(result.hardForms.includes("neurons"));
  });

  it("treats everything as known when the learner's level is high enough", () => {
    const result = analyzeParagraphs(["The brain cells discern neurons."], 7, lookup);
    assert.equal(result.hard.length, 0);
    assert.equal(result.coverage, 1);
    assert.equal(result.band, "easy");
  });

  it("an unknown lowercase word counts as hard", () => {
    const result = analyzeParagraphs(["the flibbertigibbet"], 5, lookup);
    assert.equal(result.hard[0]?.lemma, "flibbertigibbet");
  });
});

describe("bandOf", () => {
  it("maps coverage to a reading band", () => {
    assert.equal(bandOf(0.99), "easy");
    assert.equal(bandOf(0.96), "fit");
    assert.equal(bandOf(0.92), "stretch");
    assert.equal(bandOf(0.8), "hard");
  });
});
