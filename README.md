# English Coach

自用英语阅读练习工作台。粘贴 URL 或与 Agent 对话拉取并整理文章，再通过段落讲解、自己译或 AI 出题练习。聊天与页面共享同一工作区，Agent 可通过 LangChain 工具控制页面内容。

## 技术栈

- Next.js 15（App Router）+ TypeScript + Tailwind CSS
- LangChain.js（`@langchain/openai`、工具、Agent 循环）
- SQLite（`better-sqlite3`）
- Scrapling（Python）整页抓取，失败时回退到 Mozilla Readability
- jsdom
- Zustand 工作区状态
- ECDICT（`stardict.db`）离线悬停释义，支持多词短语

## 安装与配置

```bash
cd english-coach
npm install
npm run dev
```

`npm run dev` / `npm start` 会先执行 `scripts/ensure-setup.mjs`（`predev` / `prestart`）。该脚本会：

- 若缺少 `.env.local`，从 `.env.example` 复制（之后请填写 `LLM_API_KEY`）
- 若缺少词典，下载 [ECDICT](https://github.com/skywind3000/ECDICT) 到 `data/stardict.db`（等同 `npm run dict:fetch`）
- 若本机有 Python 且未安装 Scrapling，则按 `requirements.txt` 安装 [Scrapling](https://scrapling.readthedocs.io/)

已存在的资源会跳过。可用 `SKIP_SETUP=1` 整体跳过，或用 `SKIP_DICT=1` / `SKIP_SCRAPLING=1` 部分跳过。也可单独执行 `npm run setup`。

拉文会运行 `scripts/scrapling_fetch.py`，保留各段正文（含短行、以及用 `<br>` 分段的页面）。若缺少 Python 或 Scrapling，则回退为一次 HTTP 请求 + Mozilla Readability。若 `python` 不在 `PATH` 上，请设置 `PYTHON`。pip 下载卡住时可换 PyPI 镜像重试。

悬停查词不调用大模型。词典路径可用 `ECDICT_PATH` 覆盖。

编辑 `.env.local`：

```
LLM_API_KEY=...
LLM_BASE_URL=https://api.openai.com/v1
LLM_MODEL=gpt-4o-mini
```

## 使用方式

```bash
npm run dev
```

打开 [http://localhost:3010](http://localhost:3010)。首次启动若需下载 ECDICT，可能要几分钟。

典型流程：

1. 粘贴 URL 后点拉取，或让教练在聊天里拉一篇文章。
2. 悬停单词：若落在词典短语内（如 `in spite of`、`look up`、`a lot of`），会整段高亮；网页搭配如 `to check`、`the model` 仍按单词处理。卡片显示词头、音标、词性与中文释义。悬停不走模型。
3. 选中段落点 **看讲解**：模型在该段下写出通顺中文，并附若干短语/生词。其它段落保持原样。**本篇讲解** 对全文同理。**自己译** 用于保存并检查你的译文。
4. 打开 **AI出题**：可多选标签（生活用语、初中、四级等）或自建标签，再选难度（入门、进阶、较难）。模型给出中文句子，按英文词位留空；提交后逐词批改，错词下方给出参考。题目写入 SQLite，表单下方可再打开。
5. 在 **复习**（错题本）中回顾错题。

## 项目结构

```
src/app/            # 页面与 API 路由
src/components/     # 工作室 UI
src/lib/agent/      # LangChain 提示词、工具、运行循环
src/lib/db/         # SQLite 访问
src/lib/drill/      # 中译英按词填空出题
src/lib/explain/    # 段落讲解（聊天模型）
src/lib/glossary/   # ECDICT 查询与短语匹配
src/lib/fetch/      # Scrapling 拉文，Readability 兜底
scripts/            # scrapling_fetch.py、ensure-setup.mjs 等
src/lib/store/      # 客户端工作区状态
```

## 开发约定

- UI 按钮与 LangChain 工具尽量共用同一套后端能力。
- 不以背单词 / SRS 作为主循环。
- 有实质改动合并前先跑 `npm run lint`。
- 终端用户界面文案可用中文。

## 更新记录

### 0.1.0

- 工作室骨架：URL/粘贴拉文、阅读区、悬停释义 API
- 悬停释义读本地 ECDICT，按指针附近最长短语匹配
- 段落 **看讲解** 由聊天模型生成通顺中文；悬停保持离线
- **AI出题** 按学习者选择的方向生成中文句，再按英文词逐词批改
- LangChain 教练 MVP 工具（拉文、讲解、译文检查、错题本跳转）
- `web_search` 走 Azure OpenAI Responses API 托管联网搜索，教练可再拉取引用文章
- 教练聊天使用 [assistant-ui](https://www.assistant-ui.com/)，SSE 流式回复
- 文章库与错题本页面
- 数据落在 `data/` 下的 SQLite
