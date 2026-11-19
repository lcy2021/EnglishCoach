# English Coach

Personal English reading workbench. Paste a URL or chat with an agent to fetch and organize an article, then practice by translating paragraphs or generating bilingual explanations with phrase/word notes. Chat and UI share one workspace — the agent can control page content via LangChain tools.

## Tech Stack

- Next.js 15 (App Router) + TypeScript + Tailwind CSS
- LangChain.js (`@langchain/openai`, tools, agent loop)
- SQLite (`better-sqlite3`)
- Scrapling (Python) for full-page fetch, with Mozilla Readability as a fallback
- jsdom
- Zustand workspace store
- ECDICT (`stardict.db`) for offline hover glosses, including multi-word phrases

## Installation & Setup

```bash
cd english-coach
npm install
python -m pip install -r requirements.txt
cp .env.example .env.local
npm run dict:fetch
```

`requirements.txt` installs [Scrapling](https://scrapling.readthedocs.io/) with its fetcher extra. Fetching a URL runs `scripts/scrapling_fetch.py`, which keeps every text block, including short lines and pages that separate paragraphs with `<br>`. If Python or Scrapling is missing, the app falls back to a single HTTP fetch plus Mozilla Readability. Set `PYTHON` when `python` is not on `PATH`. If the pip download stalls, retry with a PyPI mirror.

`dict:fetch` downloads the MIT-licensed [ECDICT](https://github.com/skywind3000/ECDICT) SQLite release into `data/stardict.db` (gitignored). Hover lookup never calls the LLM. Set `ECDICT_PATH` if the database lives somewhere else.

Edit `.env.local`:

```
LLM_API_KEY=...
LLM_BASE_URL=https://api.openai.com/v1
LLM_MODEL=gpt-4o-mini
```

## Usage / How to Run

```bash
npm run dev
```

Open [http://localhost:3010](http://localhost:3010).

Typical flow:

1. Paste a URL and click Fetch, or tell the coach to pull a link.
2. Hover a word. If it sits inside a real dictionary phrase (`in spite of`, `look up`, `a lot of`), the whole phrase is highlighted. Web bigrams such as `to check` or `the model` stay separate words. The card shows the headword, phonetic, part of speech, and Chinese gloss. Hover never calls the model.
3. Select a paragraph and click **看讲解**. The model writes a fluent Chinese rendering under that paragraph, plus a few phrases and words. Other paragraphs stay as they were. **本篇讲解** does the same for the whole article. **自己译** is the user's own draft.
4. Open **AI出题**. Multi-select tags such as 生活用语, 初中, 四级, or add your own. Pick a difficulty (入门, 进阶, 较难). The model writes a Chinese sentence and lays down one underline per English word. Submit to mark each word and see the reference under the misses. Generated items are stored in SQLite and listed under the form.
5. Review mistakes under **复习** (wrong book).

## Project Structure

```
src/app/            # pages + API routes
src/components/     # workbench UI
src/lib/agent/      # LangChain prompts, tools, run loop
src/lib/db/         # SQLite access
src/lib/drill/      # Chinese-to-English word-blank items
src/lib/explain/    # paragraph translation via the chat model
src/lib/glossary/   # ECDICT lookup and phrase matching
src/lib/fetch/      # Scrapling fetch, with Readability fallback
scripts/            # scrapling_fetch.py
src/lib/store/      # client workspace state
```

## Contribution / Development Guide

- Prefer shared services behind both UI buttons and LangChain tools.
- Do not add flashcard/SRS as the primary loop.
- `npm run lint` before merging meaningful changes.
- Keep developer docs in English; end-user UI copy may be Chinese.

## Changelog / Progress

### 0.1.0

- Scaffold workbench: fetch URL/paste, reader, hover gloss API
- Hover glosses read the local ECDICT database and match the longest phrase around the pointer
- Paragraph **看讲解** calls the chat model for a fluent Chinese rendering; hover stays offline
- **AI出题** writes a Chinese sentence from an industry the learner picks, then grades the English word by word
- LangChain coach with MVP tools (fetch, explain, translate check, wrong-book nav)
- `web_search` tool calls the Azure OpenAI Responses API hosted web search, then the coach can fetch a cited article
- Coach chat uses [assistant-ui](https://www.assistant-ui.com/) and streams replies over SSE
- Article library + wrong-book pages
- SQLite persistence under `data/`
