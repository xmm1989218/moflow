# MoFlow Roadmap

## v0.3.6 — Bug 修复 & 质量提升 ✅

### Bug 修复

- [x] SelectionAI "Ask" cost 计算修复（`calculateCost()` + `getContext()`）
- [x] OpenAI/Claude fallback usage 估算修复（`fullResponse` 累积 + `estimateTokens` 兜底）
- [x] Auto-compact 丢消息修复（compact 完成后自动发送用户输入）
- [x] Untitled draft 竞态条件修复（`clearTimeout` + `untitledTimers.delete`）
- [x] React ErrorBoundary（全局 + 编辑器级，带 resetKeys）

### 质量提升

- [x] i18n 统一（11 处硬编码中文改用 `t()`）
- [x] 测试框架搭建（Vitest + RTL + jsdom，12 tests passing）
- [x] 核心模块测试覆盖（modelInfo 8 tests，toolbarTooltip 4 tests）
- [x] appStore 三方拆分（tabStore + sessionStore + themeStore，appStore 仅保留 closeDialog + re-exports）
- [x] Toolbar 空组件清理

### 新增功能

- [x] Toolbar tooltip（内置按钮 + 自定义 AI 按钮均支持，JS 事件委托 + position:fixed 避免 overflow:hidden 裁剪）
- [x] F8 快捷键切换 AI 侧栏（TitleBar tooltip 显示快捷键提示）
- [x] Release 脚本重写（7 步流程，lint+build+test+cargo check 先于 commit，失败回滚版本文件）
- [x] Release CI workflow（增加 lint+build+test+cargo check 步骤）
- [x] AI config 测试连接日志（catch + no-content 均有 console.error）
- [x] navigator 安全访问（`toolbarTooltip.ts` 兼容测试环境）

---

## v0.3.7 — 查找替换 & SelectionAI 追问 ✅

### 查找替换

- [x] `Ctrl+F` / `Ctrl+H` 弹出搜索框
- [x] 支持正则匹配、大小写敏感
- [x] 全部替换

### SelectionAI 追问功能

- [x] 翻译/解释结果面板底部增加输入框，支持连续追问
- [x] 追问上下文同步到 AI 聊天侧栏

---

## v0.4.0 — Phase 2: Tool-Calling ✅

Enable the AI to actively explore the document instead of relying on truncated context.

### Design Decisions

- Tool execution: **frontend JS** (reads docContent in memory, no IPC needed)
- Mock client: **no tool-calling simulation** (Mock mode sends no tools, stays simple)
- Persistence: **full** — toolCalls + tool messages + reasoningContent saved to JSONL
- API format: **unified internal format**, each client converts to its own API format
- Context budget: tool messages count toward contextTokens; when tools sent, doc ratio drops from 65% to 50% (more room for tool interaction)
- Tool result cap: 6144 chars per result (truncated if exceeded)

### Type & Data Structure

- [x] `src/lib/types.ts` — New shared types: `ToolCall`, `ToolDefinition`
- [x] `llmClient.ts` — Extend `ChatMessage` (add `"tool"` role, `tool_calls`, `tool_call_id`, `name`, `reasoningContent`), `ChatResult` (add `toolCalls`, `finishReason`, `reasoningContent`), `LLMClient.chat()` (add `options.tools`)
- [x] `chatStore.ts` — Extend `Message` (add `"tool"` role, `toolCalls`, `toolCallId`, `toolName`, `reasoningContent`), add `addReasoningContentToLastMessage` action
- [x] `chatPersistence.ts` — Deserialize new fields (backwards compatible, missing → undefined)

### Tool Definitions & Execution (`src/lib/tools.ts` — new file)

- [x] `outline()` — Return heading tree with hierarchy + line ranges (e.g. `2. Methods (L24-89)`)
- [x] `grep(pattern)` — Search with regex, return matching lines + line numbers (max 50)
- [x] `read_lines(start, end)` — Read line range, 1-indexed, max 200 lines, auto-clamp
- [x] `read_section(heading)` — Read content under heading until same/higher level heading
- [x] `webfetch(url)` — Rust backend via reqwest (http/https only, 30s timeout, 3 calls per request limit, HTML noise stripping)
- [x] `executeTool(name, args, docContent, signal)` — Async route to tool, truncate result to 6144 chars
- [x] `docToolDefinitions` — Export JSON Schema definitions for 4 document tools
- [x] `networkToolDefinitions` — Export JSON Schema definitions for webfetch
- [x] B-layer strategy: doc tools sent only when document truncated; network tools (webfetch) always sent

### LLM Client Changes

- [x] `OpenAICompatibleClient` — Add `tools` to request body, parse `delta.tool_calls` + `delta.reasoning_content` + `finish_reason: "tool_calls"`, convert internal messages → OpenAI format, 60s default timeout
- [x] `ClaudeCompatibleClient` — Add `tools` in Claude format, parse `content_block_start(tool_use)` + `input_json_delta` + `stop_reason: "tool_use"`, convert internal messages → Claude format (tool_use content blocks + tool_result user messages), 60s default timeout
- [x] `MockClient` — No changes (signature adapts to new interface but ignores tools)
- [x] `convertToOpenAIMessages` — Handle empty content (no tool_calls → `""`, has tool_calls → `null`), pass back `reasoning_content`

### System Prompt Changes

- [x] `buildSystemPrompt` returns `{ prompt, needsDocTools }` instead of string
- [x] New param `needsDocTools: boolean` — when true, doc ratio = 50% (else 65%)
- [x] When document truncated: replace truncation hint with all tools instruction (doc tools + webfetch)
- [x] When document not truncated or empty: existing behavior + webfetch instruction appended

### Chat Flow — Tool Execution Loop

- [x] `chatStore` — New actions: `addToolCallsToLastMessage`, `addReasoningContentToLastMessage`; modify `getContext` to include `tool` messages; modify `addMessage` to add `tool` + `assistant` messages to contextMap
- [x] `AISidebar handleSend` — Loop: `client.chat(tools)` → if `tool_calls`, execute tools → feed results back → repeat; max 10 rounds; only final text streamed via onChunk
- [x] Each round's promptTokens accumulated via recordUsage → UsageBadge reflects real cost
- [x] Cancellation: check `signal.aborted` before each tool execution and each loop iteration
- [x] `loadChatHistory` — Call `getContext()` after loading to restore contextTokens

### UI Changes

- [x] `toolCallStatus` state — show spinner + description during tool execution (e.g. "正在搜索: Introduction")
- [x] Tool messages → collapsible block: collapsed shows `▶ toolName(args)`, expanded shows `<pre>` content
- [x] Tool args display — CSS `text-overflow: ellipsis` adaptive truncation (replaces fixed 50-char JS truncation)
- [x] ToolCallsSummary removed — tool calls phase not displayed (spinner during execution, ToolResultBlock after completion)
- [x] AI assistant messages — no max-width limit (user messages keep 90% bubble width)
- [x] AI sidebar max width 720px (was 600px)
- [x] Input auto-focus after streaming ends
- [x] Links in AI messages open in system browser (tauri-plugin-opener)
- [x] rehype-prism-plus `ignoreMissing: true` — skip unknown language instead of crash

### Rust Backend

- [x] `webfetch` command — reqwest with 30s timeout, 100KB body truncation, http/https validation
- [x] `strip_html_noise` — Regex removal of script/style/noscript/svg/link/comments/head
- [x] `is_html_content` + `looks_like_html` — Content-Type detection + content sniffing fallback
- [x] `println!` log — HTML stripped size comparison (original → cleaned, % removed)
- [x] `tauri-plugin-opener` — Open URLs in system browser

### Startup Performance Monitoring

- [x] `window.__startupMark(label)` — Global helper to log startup milestones with `performance.now()`
- [x] Rust `rust-setup` — Time from app start to setup callback
- [x] Frontend `react-mount` — React first mount
- [x] Frontend `session-loaded` — Session restore + path permissions
- [x] Frontend `chat-loaded` — Chat history loading
- [x] Frontend `editor-ready` — Milkdown editor initialized
- [x] Frontend `window-shown` — Window first visible

### Reasoning Content (DeepSeek Thinking Mode)

- [x] `ChatMessage.reasoningContent` — Store and pass back to API (DeepSeek v4 requires it)
- [x] `ChatResult.reasoningContent` — Accumulate `delta.reasoning_content` from SSE stream
- [x] `Message.reasoningContent` — Persist in chatStore + JSONL
- [x] `addReasoningContentToLastMessage` — Sync to messagesMap + contextMap
- [x] `convertToOpenAIMessages` — Pass `reasoning_content` field for assistant messages
- [x] Strategy: API returns reasoning_content → store + pass back; no reasoning_content → don't include (mirror)

### Error Handling

- [x] Unknown tool → return `"Unknown tool: {name}"` as tool result
- [x] Invalid arguments / regex → return descriptive error message
- [x] read_lines out of range → auto-clamp
- [x] read_section not found → return available headings list
- [x] Max 10 rounds → append hint to assistant, stop loop
- [x] Tool result too long → truncate to 6144 chars
- [x] `TimeoutError` class — distinguish timeout from user abort
- [x] webfetch CORS → migrated to Rust backend (no CORS in native HTTP)

---

## v0.4.1 — Context View

- [ ] Context View 面板（spec 见 `docs/spec-context-view.md`）
- [ ] 展示当前 contextMap 中的消息列表
- [ ] 显示每条消息的 token 估算
- [ ] 显示 contextTokens / maxContext 使用率

---

## v0.5.0 — 增强功能 I

### Selector Toolbar 文字美化

- [ ] 浮动工具栏增加「美化/润色」按钮，一键润色选中文字
- [ ] 支持补充指令输入（如「更正式」「更简洁」），结果替换选中文字

### AI 回复插入文档

- [ ] 聊天消息增加「插入」按钮
- [ ] 将回复内容插入编辑器当前光标处

---

## v0.6.0 — 增强功能 II

### Mermaid 图表渲染

- [ ] Milkdown 插件支持 Mermaid 语法
- [ ] 实时预览流程图、时序图等

### 大纲侧栏

- [ ] 基于标题层级的 TOC 树
- [ ] 点击跳转到对应位置

---

## v0.6.5 — 样式统一

### CSS → Tailwind 迁移

- [ ] Editor.css 中的自定义样式迁移到 Tailwind 类
- [ ] 主题变量整理（CSS custom properties → Tailwind theme config）
- [ ] 全局样式审计，消除重复/冗余规则

---

## v0.7.0 — 跨平台支持

### macOS 适配

- [ ] PDF 导出改用 WKWebView
- [ ] 窗口装饰适配
- [ ] 菜单栏集成

### Linux 适配

- [ ] AppImage / deb 打包
- [ ] WebKitGTK 适配测试

---

## v1.0.0 — 正式版

### i18n 正式方案

- [ ] 迁移到 react-i18next
- [ ] 运行时语言切换
- [ ] 支持更多语言（日语、韩语等）

### 性能优化

- [ ] 大文件编辑性能
- [ ] 内存占用优化
- [ ] 启动速度优化

### 无障碍（a11y）

- [ ] 键盘导航完善
- [ ] 屏幕阅读器支持

### 插件系统

- [ ] 可扩展插件 API 架构设计（视情况可能延后到 v1.x）

---

## v1.x — 后续迭代（按需）

- [ ] 对话导出（Markdown / JSON）
- [ ] 聊天历史搜索
- [ ] 自定义 system prompt 模板
- [ ] 多文件上下文（引用其他打开的文档）
- [ ] Vim keybindings 模式
- [ ] 图片上传和管理
- [ ] 窗口白边修复（Windows `shadow: true` 导致 1px 白边）
- [ ] 打开目录（文件夹树浏览，快速打开目录下的文件）

### webfetch 增强

- [ ] nav/footer/aside/header/button/form 整块删除（HTML 噪声剔除第二阶段）
- [ ] class/style 属性剥离（需引入 scraper，避免正则误删代码示例中的属性）
- [ ] scraper 结构化提取（h1→#、a→text(url)、表格等，输出 Markdown）
- [ ] webfetch raw 参数（默认提取文本，raw=true 返回原始 HTML，保留排版相关信息）

### Skill 市场与 Skill 管理

- [ ] Skill 定义规范（名称、描述、图标、system prompt 模板、工具权限声明）
- [ ] Skill 管理界面（安装、卸载、启用/禁用、配置）
- [ ] Skill 市场（浏览、搜索、一键安装；支持本地 skill + 远程仓库）
- [ ] Skill 运行时（加载 skill 的 system prompt + 工具集，按 skill 限定可用工具范围）
- [ ] Skill 对话模式（选择 skill 后进入专属对话，独立上下文）
- [ ] 内置 skill 示例（翻译助手、代码审查、文档润色等）
- [ ] 社区 skill 分享（GitHub 仓库作为 skill 源，约定目录结构）
