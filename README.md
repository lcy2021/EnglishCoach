# English Coach

> 读真实的英文文章，边读边练：悬停查词、段落讲解、AI 出题、错题复习。一个会“动手”的 AI 教练，和页面共享同一个工作区。

自用的英语阅读练习工作台，基于 Next.js + LangChain.js，数据全部存在本地 SQLite。

## 演示

[▶ 观看演示视频](docs/demo.mp4)

## 特性

- **拉文即读**：粘贴 URL，或直接对教练说“帮我找一篇关于 xxx 的文章”。用 Scrapling 抓取整页，失败时回退到 Mozilla Readability，并保留各段正文。
- **离线悬停查词**：基于 [ECDICT](https://github.com/skywind3000/ECDICT)，不调用大模型；支持 `in spite of`、`look up` 等多词短语的整段高亮，卡片含音标、词性与中文释义。
- **段落讲解**：选中段落点 **看讲解**，模型给出通顺中文并列出短语 / 生词；也可 **自己译**，保存后让教练检查。
- **AI 出题**：按标签（生活用语、初中、四级……或自建）和难度生成中文句，英文按词留空，提交后逐词批改。
- **错题本与生词本**：错题可跳回原文段落；生词本使用间隔重复（Leitner 阶梯）复习。
- **学习总览**：每日目标、成就、周对比与用量统计。
- **教练能控页面**：聊天与页面共享状态，Agent 通过 LangChain 工具拉文、切换视图、选段、讲解、检查译文、打开错题、联网搜索等。UI 按钮与工具共用同一套后端能力。

## 快速开始

需要 Node.js 18+（`better-sqlite3` 为原生模块，不支持 Edge 运行时）。可选：Python 3（用于 Scrapling）。

```bash
cd english-coach
npm install
npm run dev
```

打开 [http://localhost:3010](http://localhost:3010)。

首次启动会自动执行 `scripts/ensure-setup.mjs`：

1. 缺少 `.env.local` 时从 `.env.example` 复制 —— **请填入你的 `LLM_API_KEY`**
2. 缺少词典时下载 ECDICT 到 `data/stardict.db`（可能要几分钟）
3. 本机有 Python 且未安装 Scrapling 时，按 `requirements.txt` 安装

已存在的资源会被跳过。

### 配置

编辑 `.env.local`，任意 OpenAI 兼容端点均可：

```ini
LLM_API_KEY=sk-...
LLM_BASE_URL=https://api.openai.com/v1
LLM_MODEL=gpt-4o-mini

# 可选
# DATABASE_PATH=   # SQLite 路径，默认 ./data/english-coach.sqlite
# ECDICT_PATH=     # 词典路径，默认 ./data/stardict.db
```

| 环境变量 | 作用 |
| --- | --- |
| `SKIP_SETUP=1` | 整体跳过启动前的自动准备 |
| `SKIP_DICT=1` / `SKIP_SCRAPLING=1` | 分别跳过词典 / Scrapling |
| `PYTHON` | `python` 不在 `PATH` 时指定解释器 |

也可手动执行 `npm run setup`、`npm run dict:fetch`。pip 下载卡住时可换 PyPI 镜像重试。

## 使用流程

1. **拉文**：粘贴 URL 点拉取，或让教练在聊天里找一篇。
2. **阅读**：悬停单词查释义；选中段落点 **看讲解**，或点 **本篇讲解** 处理全文。
3. **翻译**：用 **自己译** 写下译文并保存，让教练检查。
4. **出题**：进入 **AI出题**，选标签与难度，填空并获得逐词批改。
5. **复习**：在 **复习**（错题本）和 **生词本** 中回顾。

## 技术栈

| 层 | 选型 |
| --- | --- |
| 框架 | Next.js 15（App Router）、React 19、TypeScript、Tailwind CSS |
| Agent | LangChain.js / LangGraph、`@langchain/openai` |
| 聊天 UI | [assistant-ui](https://www.assistant-ui.com/)，SSE 流式回复 |
| 存储 | SQLite（`better-sqlite3`） |
| 抓取 | Scrapling（Python），回退 Mozilla Readability + jsdom |
| 词典 | ECDICT（离线） |
| 状态 | Zustand |

## 项目结构

```
src/app/            页面与 API 路由
src/components/     工作室 UI
src/lib/agent/      LangChain 提示词、工具、运行循环
src/lib/db/         SQLite 访问与统计
src/lib/drill/      中译英按词填空出题
src/lib/explain/    段落讲解
src/lib/glossary/   ECDICT 查询与短语匹配
src/lib/fetch/      Scrapling 拉文，Readability 兜底
src/lib/vocab/      生词本间隔重复
src/lib/store/      客户端工作区状态
scripts/            ensure-setup.mjs、scrapling_fetch.py 等
```

## 开发

```bash
npm run dev      # 开发服务器（端口 3010）
npm run build    # 生产构建
npm start        # 生产运行
npm test         # 单元测试
npm run lint     # 合并前请先通过
```

约定：UI 按钮与 LangChain 工具尽量共用后端能力；界面文案使用中文；背单词不是主循环，阅读才是。

路线图见 [Plan.md](./Plan.md)。

## 已知限制

- 需要浏览器挑战的网站（强反爬）仍可能拉取失败。
- 教练的联网搜索依赖 Azure OpenAI Responses API 的托管搜索。

## 许可

[MIT](./LICENSE)
