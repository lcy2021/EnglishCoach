import { NextResponse } from "next/server";
import { addVocab, deleteVocab, dueVocab, listVocabPage, reviewVocab, vocabCounts, vocabSummary } from "@/lib/db/vocab";
import { readPage } from "@/lib/db/page";
import { ecdictReady, lookupEntries } from "@/lib/glossary/ecdict";
import { enrichVocabMorphology } from "@/lib/glossary/morphology";
import type { Rating, VocabWord } from "@/lib/vocab/srs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RATINGS: readonly Rating[] = ["again", "hard", "good"];

function withMorphology(words: VocabWord[]): VocabWord[] {
  if (!ecdictReady() || words.length === 0) return words;
  try {
    return enrichVocabMorphology(words, lookupEntries).map((enriched) => ({
      ...enriched,
      phonetic: enriched.phonetic || "",
      pos: enriched.pos || undefined,
      forms: enriched.forms?.length ? enriched.forms : undefined,
      senses: enriched.senses?.length ? enriched.senses : undefined,
    }));
  } catch {
    return words;
  }
}

/** Persist dictionary morphology when the client did not send it. */
function fillMorphology(input: {
  text: string;
  gloss?: string;
  phonetic?: string;
  sentence?: string;
  pos?: string;
  forms?: Array<{ label: string; text: string }>;
  articleId?: string | null;
  source?: string;
}) {
  if (!ecdictReady()) return input;
  try {
    const morph = enrichVocabMorphology(
      [{ text: input.text, phonetic: input.phonetic ?? "", pos: input.pos, forms: input.forms }],
      lookupEntries,
    )[0];
    if (!morph) return input;
    return {
      ...input,
      phonetic: (input.phonetic ?? "").trim() || morph.phonetic,
      pos: morph.pos || input.pos,
      forms: morph.forms.length > 0 ? morph.forms : input.forms,
    };
  } catch {
    return input;
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const view = searchParams.get("view") ?? "summary";
  if (view === "due") {
    const limit = Math.min(Number(searchParams.get("limit") ?? 20) || 20, 100);
    return NextResponse.json({ words: withMorphology(dueVocab(limit)), summary: vocabSummary() });
  }
  if (view === "all") {
    const result = listVocabPage(
      searchParams.get("q") ?? "",
      readPage(searchParams.get("page"), 1),
      readPage(searchParams.get("pageSize"), 10),
    );
    return NextResponse.json({
      words: withMorphology(result.items),
      total: result.total,
      page: result.page,
      pageSize: result.pageSize,
      summary: vocabCounts(),
    });
  }
  return NextResponse.json(vocabSummary());
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      action?: string;
      id?: string;
      rating?: string;
      text?: string;
      gloss?: string;
      phonetic?: string;
      sentence?: string;
      pos?: string;
      forms?: Array<{ label: string; text: string }>;
      articleId?: string | null;
      source?: string;
    };
    if (body.action === "add") {
      const filled = fillMorphology({
        text: body.text ?? "",
        gloss: body.gloss,
        phonetic: body.phonetic,
        sentence: body.sentence,
        pos: body.pos,
        forms: body.forms,
        articleId: body.articleId,
        source: body.source,
      });
      const word = addVocab(filled);
      return NextResponse.json({ word: withMorphology([word])[0], summary: vocabSummary() });
    }
    if (body.action === "review") {
      if (!body.id || !RATINGS.includes(body.rating as Rating)) {
        return NextResponse.json({ error: "参数不对" }, { status: 400 });
      }
      const word = reviewVocab(body.id, body.rating as Rating);
      return NextResponse.json({ word: withMorphology([word])[0], summary: vocabSummary() });
    }
    return NextResponse.json({ error: "未知操作" }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "出错了" }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "缺少 id" }, { status: 400 });
  deleteVocab(id);
  return NextResponse.json({ ok: true, summary: vocabSummary() });
}
