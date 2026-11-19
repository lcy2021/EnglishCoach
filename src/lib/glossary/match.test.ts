import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { collectParagraphGlosses, matchAt, type DictEntry, type DictLookup } from "./match.ts";

function entry(partial: Partial<DictEntry> & Pick<DictEntry, "word" | "translation">): DictEntry {
  return {
    phonetic: "",
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

describe("matchAt", () => {
  it("prefers the longest phrase that covers the hovered word", () => {
    const lookup = dict([
      entry({ word: "artificial", translation: "a. 人造的" }),
      entry({ word: "intelligence", translation: "n. 智力" }),
      entry({
        word: "artificial intelligence",
        translation: "n. 人工智能",
        collins: 1,
      }),
    ]);
    const hit = matchAt(["Artificial", "intelligence", "is", "changing"], 1, lookup);
    assert.equal(hit?.phrase, "artificial intelligence");
    assert.equal(hit?.start, 0);
    assert.equal(hit?.end, 1);
    assert.match(hit?.gloss ?? "", /人工智能/);
    assert.equal(hit?.senses[0]?.pos, "名词");
  });

  it("lemmatizes a phrasal verb and still covers the hovered particle", () => {
    const lookup = dict([
      entry({
        word: "looked",
        translation: "v. look 的过去式",
        exchange: "0:look/1:p",
      }),
      entry({ word: "up", translation: "adv. 向上" }),
      entry({ word: "look up", translation: "查阅" }),
    ]);
    const hit = matchAt(["She", "looked", "up", "the", "word"], 2, lookup);
    assert.equal(hit?.start, 1);
    assert.equal(hit?.end, 2);
    assert.match(hit?.gloss ?? "", /查阅/);
    assert.equal(hit?.senses[0]?.pos, "短语");
  });

  it("keeps a single word when the longer idiom is not in the window", () => {
    const lookup = dict([
      entry({ word: "in", translation: "prep. 在…里" }),
      entry({ word: "spite", translation: "n. 恶意" }),
      entry({ word: "in spite of", translation: "尽管" }),
    ]);
    const hit = matchAt(["in", "the", "room"], 0, lookup);
    assert.equal(hit?.phrase, "in");
    assert.equal(hit?.end, 0);
  });

  it("matches an idiom from a word in the middle", () => {
    const lookup = dict([
      entry({ word: "in", translation: "prep. 在…里" }),
      entry({ word: "spite", translation: "n. 恶意" }),
      entry({ word: "of", translation: "prep. …的" }),
      entry({ word: "in spite of", translation: "尽管" }),
    ]);
    const hit = matchAt(["in", "spite", "of", "the", "delay"], 1, lookup);
    assert.equal(hit?.phrase, "in spite of");
    assert.equal(hit?.start, 0);
    assert.equal(hit?.end, 2);
  });

  it("prefers the surface form over its lemma when both are the same length", () => {
    const lookup = dict([
      entry({ word: "went", translation: "v. go 的过去式", exchange: "0:go/1:p" }),
      entry({ word: "go", translation: "v. 去" }),
    ]);
    const hit = matchAt(["went"], 0, lookup);
    assert.equal(hit?.phrase, "went");
    assert.match(hit?.gloss ?? "", /过去式/);
  });

  it("strips edge punctuation before lookup", () => {
    const lookup = dict([entry({ word: "word", translation: "n. 单词", phonetic: "wɜːd" })]);
    const hit = matchAt(["word,"], 0, lookup);
    assert.equal(hit?.phrase, "word");
    assert.match(hit?.gloss ?? "", /单词/);
    assert.equal(hit?.phonetic, "/wɜːd/");
    assert.equal(hit?.senses[0]?.pos, "名词");
  });

  it("keeps verb and noun senses apart", () => {
    const lookup = dict([
      entry({
        word: "run",
        pos: "n:15/v:85",
        translation: "n. 跑\nvi. 奔跑\nvt. 经营\n[计] 运行",
      }),
    ]);
    const hit = matchAt(["run"], 0, lookup);
    assert.deepEqual(
      hit?.senses.map((sense) => sense.pos),
      ["名词", "不及物", "及物", "动词"],
    );
  });

  it("keeps phrases and content words, and skips closed-class words", () => {
    const lookup = dict([
      entry({ word: "a", translation: "art. 一个" }),
      entry({ word: "lot", translation: "n. 一批" }),
      entry({ word: "of", translation: "prep. 的" }),
      entry({ word: "a lot of", translation: "许多" }),
      entry({ word: "attention", translation: "n. 注意" }),
      entry({ word: "the", translation: "art. 这" }),
      entry({ word: "delay", translation: "n. 延误" }),
    ]);
    const notes = collectParagraphGlosses(
      ["a", "lot", "of", "attention", "the", "delay"],
      lookup,
    );
    assert.deepEqual(
      notes.map((note) => note.text),
      ["a lot of", "attention", "delay"],
    );
    assert.equal(notes[0]?.kind, "phrase");
    assert.equal(notes[1]?.pos, "名词");
  });

  it("does not glue a word to its neighbor through a web bigram", () => {
    const lookup = dict([
      entry({ word: "to", translation: "prep. 向" }),
      entry({ word: "check", translation: "v. 检查" }),
      entry({ word: "the", translation: "art. 这" }),
      entry({ word: "model", translation: "n. 模型" }),
      entry({ word: "to check", translation: "[网络] 检查；托运" }),
      entry({ word: "the model", translation: "[网络] 模型" }),
      entry({ word: "on", translation: "prep. 在…上" }),
      entry({ word: "tasks", translation: "n. 任务", exchange: "0:task/1:s" }),
      entry({ word: "on task", translation: "[网络] 正在执行任务" }),
    ]);
    assert.equal(matchAt(["to", "check", "the", "model"], 1, lookup)?.phrase, "check");
    assert.equal(matchAt(["to", "check", "the", "model"], 3, lookup)?.phrase, "model");
    const tasks = matchAt(["on", "tasks"], 1, lookup);
    assert.equal(tasks?.phrase, "tasks");
    assert.equal(tasks?.start, 1);
    assert.equal(tasks?.end, 1);
  });

  it("keeps a real phrasal verb and a quality prepositional phrase", () => {
    const lookup = dict([
      entry({ word: "look", translation: "v. 看" }),
      entry({ word: "up", translation: "adv. 向上" }),
      entry({ word: "look up", translation: "查阅" }),
      entry({ word: "because", translation: "conj. 因为" }),
      entry({ word: "of", translation: "prep. 的" }),
      entry({ word: "because of", translation: "因为", oxford: 1 }),
    ]);
    const looked = matchAt(["look", "up"], 0, lookup);
    assert.equal(looked?.phrase, "look up");
    assert.equal(looked?.end, 1);
    const because = matchAt(["because", "of", "that"], 1, lookup);
    assert.equal(because?.phrase, "because of");
    assert.equal(because?.end, 1);
  });

  it("labels an untagged idiom as a phrase", () => {
    const lookup = dict([entry({ word: "a lot of", translation: "许多的" })]);
    const hit = matchAt(["a", "lot", "of"], 1, lookup);
    assert.equal(hit?.senses[0]?.pos, "短语");
    assert.equal(hit?.senses[0]?.text, "许多的");
  });
});
