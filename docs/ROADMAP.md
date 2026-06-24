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

## v0.4.1 — Context View & webfetch 增强 & compact 优化 ✅

### Context View 面板

- [x] Context View 面板（spec 见 `docs/spec-context-view.md`）
- [x] UsageBadge 可点击，切换 AI 聊天 ↔ 上下文视图
- [x] Section 1：统计信息 — token 使用量 / 工具列表 / 费用
- [x] Section 2：上下文占比 — 堆叠条形图（4 色段 system/user/assistant/tool）+ 图例，estimateTokens 分类累加 + contextTokens 校准
- [x] Section 3：原始消息 — contextMap 中的消息，`<details>/<summary>` 折叠/展开，显示 role + id 前 8 位 + toolName/toolCalls
- [x] header 标题随视图切换（`AI 助手` ↔ `上下文`），上下文视图时隐藏输入框
- [x] 文件变更：`AISidebar.tsx`（showContext state）、新建 `ContextView.tsx`、`AISidebar.css`

### webfetch 增强

- [x] webfetch format 参数（`markdown` / `text` / `html`，LLM 自选，默认 markdown）
- [x] markdown 模式：strip noise → strip class/style → html2md（Rust 端 htmd crate）
- [x] text 模式：strip noise → strip class/style → strip all tags → 纯文本
- [x] html 模式：仅 strip script/style → 返回 HTML（保留 class/id/结构）
- [x] 块级噪音剔除新增：nav/footer/aside/header/button/form/iframe/object/embed
- [x] class/style 属性剥离（markdown/text 模式，regex 方式）
- [x] 自动图片检测（MIME 为 image → base64 `data:{mime};base64,{data}` 返回，跳过 HTML 解析）
- [x] User-Agent 伪装（Chrome on Windows）+ Accept 头根据 format 设置优先级
- [x] Cloudflare 403 重试（检测 `cf-mitigated: challenge` 头，用真实 UA 重试）
- [x] 文件变更：`lib.rs`、`Cargo.toml`（加 htmd + base64）、`tools.ts`、`contextBuilder.ts`

### compact 优化

- [x] Tail 保留：compact 后 contextMap 结构改为 `[summary pair] + [最近 2 轮完整对话] + [新消息]`
- [x] Tool output 裁剪：compact 前，用 promptTokens 差值按轮累加，超出 `contextTokens * 0.15` 的轮次，tool output 替换为 `[Tool result cleared]`；可裁剪内容 < `contextTokens * 0.1` 时不执行
- [x] 结构化摘要：compact 时用 `<previous-summary>` 标签包裹历史摘要，LLM 显式识别并增量更新
- [x] 文件变更：`AISidebar.tsx`（doCompact 实现 tail + pruning + structured summary）

---

## v0.4.2 — Settings Tab & 代理支持 ✅

### Settings Tab（全局设置面板）

- [x] TitleBar 右侧添加 ⚙️ 齿轮按钮，点击打开 Settings Tab
- [x] TabBar 中显示特殊 Settings Tab（齿轮图标 + "设置"，带 × 关闭）
- [x] Settings Tab 与文件 Tab 可共存，点击文件 Tab 切回编辑器
- [x] 左侧导航 + 右侧内容布局，max-width 720px 居中
- [x] 导航项顺序：🎨 外观 → 🤖 AI → 🌐 代理 → ℹ️ 关于
- [x] 默认进入显示「外观」

### 外观 section

- [x] 应用主题切换（系统/浅色/深色）
- [x] 编辑器主题选择（下拉）
- [x] 自动保存开关
- [x] 显示状态栏开关
- [x] 汉堡菜单中移除外观/自动保存/状态栏快捷项，统一到 Settings Tab

### AI section

- [x] 从 AIConfigModal 迁移 AI 配置到 Settings Tab 的 AI section
- [x] 模式切换、服务商、Endpoint、Token、Model、测试连接
- [x] 移除 AI 侧栏头部的齿轮按钮

### 代理 section

- [x] 代理地址输入框（下拉选 None/HTTP/HTTPS/SOCKS5 + 地址输入 + 保存，一行布局）
- [x] 保存按钮 + 校验（URL 为空/格式不对 → 错误提示）
- [x] 保存后 toast 提示：代理变更需重启生效
- [x] 去掉 proxyEnabled 开关，代理启用由 proxyUrl 是否为空决定
- [x] Rust: reqwest 添加 socks feature
- [x] Rust: ProxyState managed state
- [x] Rust: `set_proxy` command 更新 managed state（validate_proxy_url 校验 + warn 日志）
- [x] Rust: SettingsJson 用 `#[serde(rename = "proxyUrl")]` 修复 camelCase 反序列化
- [x] Rust: `webfetch` 命令读取 ProxyState + 环境变量 fallback（HTTPS_PROXY / HTTP_PROXY / ALL_PROXY）
- [x] Rust: 手动创建主窗口（tauri.conf.json windows 改空数组），setup() 中读 settings 设 proxy_url
- [x] Rust: export_pdf 的 WebviewWindowBuilder 也设代理
- [x] 前端: updater.ts 传 proxy 参数给 `check()`
- [x] 前端: initSession 中调用 `invoke("set_proxy")` 同步 Rust ProxyState

### 关于 section

- [x] 从 AboutDialog 迁移到 Settings Tab 的关于 section
- [x] MoFlow 图标 + 版本号 + 版权 + 检查更新按钮
- [x] 删除 AboutDialog 组件
- [x] 汉堡菜单中「关于 MoFlow」替换为「设置」

### 聊天消息持久化重构

- [x] 删除 `flushAssistantMessage`/`appendToLastMessage`/`addToolCallsToLastMessage`/`addReasoningContentToLastMessage`
- [x] 新增 `streamingContentMap` — 流式内容存临时变量，不进 messagesMap
- [x] assistant 消息只在内容完整时 `addMessage` + `appendMessage`（一次性写入）
- [x] 渲染：streamingContent 作为虚拟消息（带流式光标），不在 messagesMap 里
- [x] `cleanupIncompleteToolCalls` — 为缺失 tool result 的 toolCall 补 "Tool call interrupted"
- [x] `loadChatHistory` 加载后调 `cleanupIncompleteToolCalls` 修复磁盘不完整数据
- [x] `stopGeneration` 不再设 `isStreaming=false`，由 finally 块控制

### webfetch 取消支持

- [x] Rust: `CancelState`（`Mutex<CancellationToken>`）managed state
- [x] Rust: `cancel_requests` command — cancel 当前 token + 重置新 token
- [x] Rust: `webfetch` 用 `tokio::select!` 同时等 HTTP 响应和取消信号
- [x] 前端: handleStop 调用 `invoke("cancel_requests")`
- [x] Cargo.toml: 加 tokio-util + tokio 依赖

### 清理

- [x] 删除未使用的 AIConfigModal.tsx、AboutDialog.tsx
- [x] 清理 AISidebar.css 中 `.moflow-ai-config-btn` CSS
- [x] 删除 updateStore 中未使用的 `aboutVisible`/`setAboutVisible`

---

## v0.4.3 — 代码质量全面清理 ✅

### 删除冗余代码

- [x] 删除未调用的 `confirmUnsaved()` 函数
- [x] 删除 `completionTokensMap`（被维护但无组件读取）
- [x] 删除 `getMessages()`/`getStreamingContent()`/`clearContext()`（仅测试用）
- [x] 删除 `aiConfigStore`（`themeStore.aiConfig` 的冗余副本），所有引用改为直接使用 `themeStore`
- [x] 删除 Vite 脚手架残留 `react.svg`/`vite.svg`
- [x] 删除 7 个冗余 Milkdown 依赖 + `@testing-library/react`
- [x] 删除 `vite.config.ts` 中的 Vue.js `define` 指令
- [x] 删除 Rust 依赖 `scraper`/`bytes` + `Win32_Graphics_Gdi` feature
- [x] `println!` → `log::` 宏（13 处）
- [x] 修复 ROADMAP v0.4.1 缺 ✅

### 修 Bug

- [x] 修复 `useState(() => sideEffect)` → `useEffect`（AboutSection）
- [x] 修复 Prism CSS 双主题导入冲突（删除 prism.css，保留 prism-tomorrow.css）
- [x] 修复 compact 失败时部分内容被存为 context summary
- [x] 修复未识别 `/` 命令静默丢弃 → 显示错误提示
- [x] 修复 Rust UTF-8 切片 panic（`text[..N]` → `String::truncate`）

### 性能优化

- [x] AISidebar 选择器用 `useShallow` 合并，减少无关 tab 变化触发的重渲染
- [x] `scrollIntoView` 加 50ms throttle，避免 streaming 时频繁调用
- [x] `remarkPlugins`/`rehypePlugins` 提升为模块常量，避免 ReactMarkdown 全量重解析
- [x] ContextView 重计算加 `useMemo`（`buildSystemPrompt`/`estimateTokens` 等）
- [x] Editor 双 `files.find()` 合并为单选择器
- [x] Rust: 23 个 Regex 用 `LazyLock` 缓存，避免每次 webfetch 重新编译
- [x] Rust: `export_pdf` 的 `mpsc::recv()` 改用 `spawn_blocking` 避免阻塞 async runtime
- [x] Rust: `allow_paths` 改同步 fn（无 `.await` 不需 async）

### 代码重构

- [x] 提取 `src/lib/i18n.ts`（16 个文件重复的 `t(zh, en)` → 统一导入）
- [x] 合并 `buildOutline`/`toolOutline` 重复逻辑（`tools.ts` 改用 `contextBuilder.buildOutline`）
- [x] Rust: `read_proxy_from_settings` 用 `let-else` 简化
- [x] Rust: `get_cancel_token` 辅助函数减少重复代码
- [x] Rust: `strip_patterns` 通用函数消除 `strip_*` 函数间重复

### Tab 切换性能优化

- [x] Lazy-tab 架构 — 每个 tab 持有独立 MilkdownWrapper 实例，切换 tab 用 CSS visibility 而非 replaceAll()
- [x] 移除 ErrorBoundary `resetKeys={[activeFileId]}`，防止 tab 切换时完整编辑器重挂载
- [x] 移除 App.tsx `activeContent` 选择器（每次按键触发 App 重渲染），auto-save 改用 `activeFileId` + `isModified` 触发
- [x] Per-tab `getEditorHTMLMap`（Map<string, () => string>）替代单一 `getEditorHTML` 字段
- [x] Per-tab `editorViewMap`（Map<string, EditorView>）替代单一 `editorView` 字段
- [x] MilkdownWrapper 用 `memo` + `useShallow` 防止级联重渲染
- [x] 切换 tab 时保留滚动位置、光标位置、undo 历史

---

## v0.5.0 — 增强功能 I ✅

### 启动速度优化

- [x] 分析启动瓶颈（基于 `__startupMark` 数据），优化慢路径
  → Rust preload（`setup()` 阶段读取 settings/session/文件内容，`get_startup_data` 8ms vs 旧路径 ~130ms 串行 IPC）
  → persistSession fire-and-forget（移除 `await`，-522ms）
  → 移除 `requestAnimationFrame` 延迟（rAF 在隐藏 WebView2 窗口上延迟 -398ms）
  → `active_path` 修复：`preload_startup_data` 正确匹配 `activeTabId` 对应的文件路径
- [x] 延迟加载非关键模块（AI 侧栏、聊天历史等）
  → Chat 懒加载（仅加载活跃 tab 的聊天，其他 tab 切换时加载；`chatLoadedMap` 追踪加载状态）
  → AISidebar 已是 `React.lazy()` 动态导入
  → `sessionInitialized` 守卫防止 TabBar/Editor 在 session 加载前渲染空状态闪烁
  → 未加载 chat 时 AISidebar 显示加载 spinner
  → `contentLoaded: false` fallback：Rust preload 读取文件失败时调 `loadTabContent`
- [x] 减少首屏渲染阻塞
  → CodeMirror 语言 144→22（自定义 `cmLanguages` + Vite alias stub `@codemirror/language-data`）
  → Prism 语言 106→37（`rehypePrismCommon` 替代 `rehypePrismPlus` 默认导出）
  → KaTeX 字体只保留 woff2（Vite 插件 `dropKatexRedundantFonts` 删除 ttf/woff，-798KB）
  → `openFile`/`loadFileByPath` 先建 tab 再异步加载内容（消除打开文件时的等待）
  → 生产构建：746ms → 266ms（-65%），JS bundle -543KB（3523KB → 2979KB），字体 -798KB

### Context Panel 原始消息展示美化

- [x] 原始消息渲染优化（区分 role 样式：左侧色条 + badge 标签 + role 背景色；tool 消息等宽代码区；assistant toolCalls 改为 ToolCallChip 列表替代 JSON；reasoningContent 子折叠区；compact summary 独立色标）
- [x] 长消息折叠/展开交互改进（箭头 hover 显示、展开时旋转；tool 代码区 max-height: 240px + 隐藏滚动条；不同 role 间 6px 间距）

### 聊天框滚动优化

- [x] 快速输出时按住滚动条无法拉上去（auto-scroll 与用户滚动冲突）— `isAtBottomRef` 追踪贴底状态，仅贴底时 auto-scroll
- [x] 手动上拉后出现抖动（scroll 事件竞争）— 流式输出用 `behavior: "instant"` 替代 `"smooth"`；用户上拉后显示半透明「回到底部」浮动按钮

### Selector Toolbar 文字美化

- [x] 浮动工具栏增加「润色」按钮，一键润色选中文字（自动触发默认润色请求）
- [x] 支持补充指令输入（如「更正式」「更简洁」），输入后重新发送带指令的请求；「应用替换」按钮将结果写回编辑器选区

### AI 改写交互重构（Doubao-style）

- [x] 工具栏按钮更名「AI 改写」/「AI Rewrite」
- [x] 去掉面板中原文展示和结果预览，AI 完成后自动替换并关闭面板（Ctrl+Z 可撤销）
- [x] 输入框（多行自动增高，最少 2 行）+ 发送按钮在右下角
- [x] 预设按钮行：润色 / 扩写 / 缩写 / 更改语气
- [x] 更改语气子菜单：更专业 / 更学术 / 更正式 / 更轻松 / 更有文采 / 更有网感
- [x] 输入框有内容时隐藏预设按钮
- [x] RewritePanel 独立子组件 + rewriteKey 强制重新挂载，解决状态残留问题
- [x] 面板 overflow: visible，语气菜单向下展开不被裁切
- [x] 错误态显示错误信息 + 预设按钮可重试

### AI Sidebar 输入框优化

- [x] 输入框至少 2 行，多行自动增高，无滚动条
- [x] 发送按钮移至输入框右下角（position: absolute）
- [x] 流式输出时发送图标变停止图标（同一位置切换），点击停止生成
- [x] 流式输出自动滚动修复：`requestAnimationFrame` + `scrollTop = scrollHeight` 替代被反复取消的 setTimeout

---

## v0.6.0 — 增强功能 II ✅

### Mermaid 图表渲染

- [x] Milkdown 插件支持 Mermaid 语法（基于 codeBlockConfig.renderPreview hook，复用 CodeMirror 编辑 + 预览切换）
- [x] 实时预览流程图、时序图等（mermaid v11，懒加载 + 异步渲染 + 错误回退）
- [x] 深色/浅色主题适配（根据 data-editor-theme 自动选择 mermaid theme）
- [x] 导出 HTML 包含 Mermaid SVG 渲染结果

### 大纲侧栏

- [x] 基于标题层级的 TOC 树（`buildOutlineTree` 返回嵌套结构，递归渲染）
- [x] 点击跳转到对应位置（`wrapper.scrollTo()` 手动滚动 + `coordsAtPos` 定位）
- [x] 活跃标题高亮追踪（scroll 监听 + `coordsAtPos` 比对，监听 `.moflow-editor-wrapper` 滚动）
- [x] 可折叠/展开子树
- [x] 左侧面板布局（`[OutlineSidebar | Editor | AISidebar]` 三栏）
- [x] 可拖拽调整宽度（180–360px，默认 240px）
- [x] F7 快捷键切换 + TitleBar 大纲按钮

---

## v0.6.5 — 样式统一 ✅

### CSS → Tailwind 迁移

- [x] @theme 注册（71 个 CSS 变量映射到 Tailwind 命名空间，支持 `bg-ui-bg`/`text-moflow-text` 等工具类）
- [x] 主题变量整理（CSS custom properties → Tailwind @theme，`--ui-*`/`--moflow-*`/`--moflow-ctx-*` 全部注册）
- [x] 全局样式审计，消除重复/冗余规则（删除与 Preflight 重复的全局 reset、--moflow-ctx-* 移入 index.css、--ui-font-body 补充定义）
- [x] 简单组件 CSS → Tailwind（ConfirmCloseDialog、TitleBar、HamburgerMenu、UpdateDialog、TabBar、SearchBar、OutlineSidebar、StatusBar — 8 个 CSS 文件删除）
- [x] 中等复杂组件迁移（SlashCommandMenu、SelectionAIPanel、SettingsPanel — 3 个 CSS 文件删除）
- [x] 复杂组件部分迁移（AISidebar 移除 ~446 行冗余 CSS：config modal 死代码、重复规则、ctx 变量定义）
- [x] Editor.css 保留（ProseMirror/Crepe/CodeMirror DOM 覆盖，无法用 Tailwind 替代）
- [x] MessageContent.css 保留（Markdown 元素选择器，无法用 Tailwind 替代）
- [x] 动画统一管理（15 个 @keyframes 移入 index.css，注册 @theme animate-* 工具类）
- [x] 自定义 shadow 注册（shadow-dialog/shadow-menu/shadow-toast/shadow-search）

---

## v0.7.0 — 文档管理 & 多文件上下文 ✅

### 文件管理

- [x] 权限扩展：`fs:allow-read-dir`, `fs:allow-stat`, `fs:allow-rename`, `fs:allow-copy-file`
- [x] `tabStore` 增加 `workspaceRoot: string | null`
- [x] `sessionStore` 持久化 `workspaceRoot`
- [x] Rust `preload_startup_data` 读取 `workspaceRoot`
- [x] HamburgerMenu 增加 "打开目录" / "Open Folder" 菜单项
- [x] 打开目录：`open({ directory: true })` → 设置 `workspaceRoot` → `allow_paths` → 自动切换到 Files tab
- [x] `themeStore` 增加 `leftPanelTab: "files" | "outline"`，默认 `"outline"`
- [x] OutlineSidebar 顶部 header 改为双 tab 按钮（📁 Files / 📑 Outline），共享宽度 + resize handle
- [x] FileTree 组件（懒加载树，点击文件夹 `readDir()` 展开子项）
- [x] 文件树显示规则：所有子文件夹 + 所有文件；仅 `.md` / `.markdown` / `.txt` 可点击打开；其他文件灰显不可点击
- [x] 文件图标：📁 文件夹 / 📝 md·txt / 🖼️ 图片 / 📄 其他
- [x] 当前活跃文件高亮（对比 `tabStore.files[].filePath`）
- [x] 右键菜单：New File / New Folder / Rename / Delete
- [x] New File：内联输入 → `writeFile` → `allow_paths` → 刷新目录 → 自动打开
- [x] New Folder：内联输入 → `mkdir` recursive → 刷新
- [x] Rename：内联编辑 → `rename` → 更新 tab filePath/fileName（如正在编辑）
- [x] Delete：确认对话框 → `remove` recursive → 关闭 tab（如正在编辑）

### 图片上传和管理

- [x] Crepe ImageBlock 配置 `onUpload(file: File): Promise<string>` + `proxyDomURL(url: string): string`
- [x] `imageManager.ts` — `saveImageToFile(tabFilePath, data, ext)` → 保存到 `{docDir}/assets/` → 返回 `"./assets/{filename}"`
- [x] `imageManager.ts` — `resolveImagePath(src, docFilePath)` → 相对路径解析为绝对路径 → `convertFileSrc(absPath)`
- [x] `proxyDomURL`：markdown 中的 `./assets/xxx.png` → DOM 中显示为 `https://asset.localhost/...`
- [x] Paste 图片：editor paste 事件检测 `clipboardData.items` image 类型 → 触发上传
- [x] 未保存文档插入图片：toast 提示 "请先保存文档再插入图片"
- [x] 导出 HTML：图片 asset URL 转回文件路径 → base64 内嵌
- [x] 远程图片：CSP 不允许 `https://` img-src，粘贴远程 URL 时提示不支持

---

## v0.7.5 — 编辑器优化 ✅

### 代码模式与所见即所得模式共享 undo history

- [x] Milkdown 始终挂载（CSS `visibility:hidden` 替代条件渲染，避免 `editor.destroy()` 销毁 undo 栈）
- [x] SourceModeEditor 升级为 CodeMirror 6（markdown 语法高亮、深色/浅色主题适配，主题跟随编辑器 CSS 变量）
- [x] Debounce 500ms 同步机制（CM6 onChange → debounce → `setContent` → `replaceAll(content, false)` 保留 undo history）
- [x] 反馈循环防护（source 模式下 `markdownUpdated` listener 跳过 store 写入；CM6 `syncingRef` 防止外部更新触发回调）
- [x] 光标位置保留（切到 source 前保存 ProseMirror selection，切回 WYSIWYG 后 `TextSelection.near` 恢复；source 模式有编辑时不恢复旧光标，避免 undo 位置跳动）
- [x] 滚动位置保留（切到 source 前保存 `scrollTop`，切回后恢复）
- [x] 搜索高亮保留（`editorView` 不再被销毁，搜索装饰自然保留）
- [x] `replaceAllNoHistory`（初始加载/tab 切换用 `setMeta('addToHistory', false)` 事务不进 undo 栈，防止 Ctrl+Z 回退到空白文档）
- [x] Undo/Redo 统一（禁用 CM6 history，Ctrl+Z/Y 路由到 ProseMirror undo/redo；source 模式 undo 后 `getMarkdown()` 回写 store 同步 CM6）
- [x] Source mode 主题跟随 WYSIWYG（CSS 变量控制背景/文字/光标/选中色 + 语法高亮 token 颜色）
- [x] Source mode 滚动条位置对齐 WYSIWYG（CM6 `overflow: visible`，外层 wrapper 滚动）
- [x] Source mode 去掉行号（`.cm-gutters { display: none }`）
- [x] Editor.css 更新（删除 `.moflow-source-textarea` 旧样式，新增 `.moflow-milkdown-hidden` + CM6 全文档编辑器主题样式）

### Undo/Redo 菜单项

- [x] 快捷键注册（`shortcuts.ts` 新增 undo Ctrl+Z / redo Ctrl+Y）
- [x] `editorActionMap`（`tabStore` 新增 Map，`setEditorActions` 注册 undo/redo action，遵循 `getEditorHTMLMap` 模式）
- [x] Editor `listener.mounted` 注册 undo/redo（`undoCommand`/`redoCommand` from `@milkdown/plugin-history`），卸载时清理
- [x] HamburgerMenu 新增 Undo/Redo 菜单项（Save 和 Find 之间，快捷键显示）

### 构建修复

- [x] 删除 `vite.config.ts` 残留 Vue.js `define` 指令（导致 Rolldown CJS interop 对 `react/jsx-runtime` 处理出错，`g is not a function`）
- [x] `await import("react/jsx-runtime")` Rolldown CJS interop workaround（强制 jsx-runtime 打进主 chunk）
- [x] 删除 `cmLanguages` 中无效动态导入（CSS/HTML/JS/JSX/TS/Markdown，已被 `lang-markdown`/`lang-html` 静态依赖）
- [x] 窗口显示修复（`getCurrentWindow().show()` 提前到 `initFromStartupData()` 之前；Rust 5 秒 fallback 线程）

---

## v0.8.0 ✅ — i18n & 无障碍

### i18n 轻量方案

**基础设施**

- [x] 新建 `src/i18n/index.tsx` — `I18nProvider` 组件 + `useI18n()` hook + `getLocale()` 非 React 函数
- [x] `I18nProvider` 读取 `themeStore.language`，提供 `locale` 对象和 `t(key)` 函数
- [x] `useI18n()` 返回 `{ t, locale }`，`t("key")` 查 locale 表，key 不存在时 fallback 到 en
- [x] `getLocale()` 非 React 函数供 `tools.ts`/`contextBuilder.ts`/`llmClient.ts` 使用
- [x] `isZh()` 改为函数：基于当前 locale 判断

**翻译文件**

- [x] 新建 `src/i18n/locales/zh.ts` — 提取所有中文字符串，~155 key
- [x] 新建 `src/i18n/locales/en.ts` — 提取所有英文字符串
- [x] 新建 `src/i18n/locales/ja.ts` — AI 生成日语翻译
- [x] 新建 `src/i18n/locales/ko.ts` — AI 生成韩语翻译
- [x] key 结构：点分路径，如 `"common.confirm"`, `"menu.newFile"`, `"ai.send"`

**迁移（157 处 t() + 20 处 des() + 7 个数据驱动结构）**

- [x] `App.tsx` — 包裹 `I18nProvider`，替换 `t()` 调用（2 处）
- [x] `SettingsPanel.tsx` — 替换 `t()`（28 处）+ `isZh`（1 处 provider label）
- [x] `AISidebar.tsx` — 替换 `t()`（28 处）+ `isZh`（2 处 compact prompt）
- [x] `SelectionAIPanel.tsx` — 替换 `t()`（20 处）+ `isZh`（6 处 preset/tone/language label）
- [x] `HamburgerMenu.tsx` — 替换 `t()`（14 处）
- [x] `SearchBar.tsx` — 替换 `t()`（12 处）
- [x] `llmClient.ts` — 替换 `t()`（10 处）+ Mock 中文关键词检测改 i18n key
- [x] `ContextView.tsx` — 替换 `t()`（8 处）
- [x] `FileTree.tsx` — 替换 `t()`（8 处）
- [x] `UpdateDialog.tsx` — 替换 `t()`（7 处）
- [x] `ErrorBoundary.tsx` — 替换 `t()`（5 处）
- [x] `ConfirmCloseDialog.tsx` — 替换 `t()`（4 处）
- [x] `TabBar.tsx` — 替换 `t()`（4 处）
- [x] `OutlineSidebar.tsx` — 替换 `t()`（3 处）
- [x] `tools.ts` — 替换 `des()`（~20 处）+ `t()`（1 处）+ `isZh`（~25 处 inline）
- [x] `contextBuilder.ts` — 替换 `isZh`（5 处 inline）
- [x] `shortcuts.ts` — 替换 `label: { zh, en }`（17 项）→ i18n key
- [x] `toolbarTooltip.ts` — 替换 inline `isZh ? zh : en`（10 处）→ i18n key
- [x] `Editor.tsx` — 替换 `SLASH_MD_MAP` zh key（16 项）+ `isZh`（1 处）
- [x] `SlashCommandMenu.tsx` — 替换 `descZh/descEn`（3 项）+ `isZh`（3 处）
- [x] `aiSelectionStore.ts` — 替换 `label/labelEn`（10 项）
- [x] `modelPricing.json` — 替换 `label/labelZh`（7 项 provider）
- [x] `tabStore.ts` — 替换 `t()`（1 处，动态 import）
- [x] 修复 SettingsPanel 5 处硬编码英文（"Mock", "API Endpoint", "API Token", "Model", "None"）

**语言切换**

- [x] `themeStore` 新增 `language: string`（默认 `"system"`，可选 `"zh"/"en"/"ja"/"ko"`）
- [x] `settings.ts` 持久化 `language` 字段
- [x] SettingsPanel「外观」新增 Language 下拉选择（系统默认 / 简体中文 / English / 日本語 / 한국어）
- [x] 语言切换后立即生效，无需重启

**README 多语言**

- [x] 新建 `README.ja.md`（AI 生成日语版，后续社区校正）
- [x] 新建 `README.ko.md`（AI 生成韩语版，后续社区校正）
- [x] `README.md` 语言行改为：中文 | English | 日本語 | 한국어
- [x] `README.zh-CN.md` 语言行改为：中文 | English | 日本語 | 한국어

**清理**

- [x] 删除 `src/lib/i18n.ts`
- [x] 删除所有 `import { t, isZh } from "../../lib/i18n"` 和 `import { t } from "./i18n"`

### 无障碍（a11y）

**Dialog 无障碍（最高优先级）**

- [x] ConfirmCloseDialog：添加 `role="dialog"`, `aria-modal="true"`, `aria-labelledby`
- [x] ConfirmCloseDialog：实现焦点捕获（Tab/Shift+Tab 循环在 dialog 内）
- [x] ConfirmCloseDialog：打开时自动聚焦主操作按钮
- [x] ConfirmCloseDialog：关闭时恢复焦点到触发元素
- [x] UpdateDialog：添加 `role="status"` / `aria-live="polite"`
- [x] UpdateDialog："更新可用"状态支持 Escape 关闭

**TabBar 键盘导航**

- [x] 容器添加 `role="tablist"`, `aria-label`
- [x] 每个 tab 添加 `role="tab"`, `tabIndex`, `aria-selected`
- [x] Arrow Left/Right 切换 tab，Home/End 跳首尾
- [x] 关闭按钮添加 `aria-label`

**aria-label 批量添加（~30+ 图标按钮）**

- [x] TitleBar：最小化/最大化/关闭/菜单/大纲/AI/设置（7 个）
- [x] TabBar：关闭按钮
- [x] SearchBar：上/下/关闭按钮
- [x] StatusBar：模式切换按钮
- [x] AISidebar：滚到底部按钮
- [x] 其他 icon-only 按钮

**全局焦点指示器**

- [x] `index.css` 添加 `focus-visible` 环形样式，跟随主题 CSS 变量
- [x] 所有交互元素 `:focus-visible` 有视觉反馈

**HamburgerMenu 键盘导航**

- [x] 添加 `role="menu"`, `role="menuitem"`
- [x] Arrow Up/Down 导航，Enter/Space 选择
- [x] 子菜单 Arrow Right 展开，Escape 关闭
- [x] 打开时焦点移到第一个菜单项，关闭时恢复

**SettingsPanel 无障碍**

- [x] 切换按钮添加 `aria-pressed`
- [x] `<label>` 添加 `htmlFor` 关联
- [x] 导航区添加 `aria-label`

**FileTree & OutlineSidebar 键盘导航**

- [x] 添加 `role="tree"`, `role="treeitem"`, `aria-expanded`
- [x] Arrow Up/Down 移动焦点，Arrow Right 展开，Arrow Left 折叠
- [x] Enter 打开文件 / 跳转标题
- [x] 实现漫游 TabIndex 模式

**AI 侧栏 & 右键菜单**

- [x] 聊天消息区添加 `role="log"`, `aria-live="polite"`
- [x] Tool result `<details>` 添加 `aria-expanded`
- [x] FileTree 右键菜单添加 `role="menu"`, `role="menuitem"`
- [x] 右键菜单 Arrow 键导航，Escape 关闭

---

## v0.8.5 — 权限系统 ✅

- [x] 权限模块（通配符匹配 + 三级存储 + 求值逻辑 + edit 预留）
- [x] 内置 tool 外部路径访问：硬拒绝 → ask 内联确认条
- [x] `executeTool` 签名改造（新增 `onPermission` 回调）
- [x] 内联确认条 UI 组件（输入框上方，允许/始终允许/拒绝）
- [x] session 规则管理（按 chatKey 隔离，始终允许写入，同模式级联自动通过）

---

## v0.9.0 — Skill 系统 ✅

### Skill 定义规范

- [x] Skill 目录结构（SKILL.md + scripts/）
- [x] SKILL.md frontmatter 解析（name/description/version）
- [x] Skill 存放路径：{appDataDir}/skills/\<name\>/
- [x] 三层渐进加载（Discovery → Activation → Execution）

### Skill 运行时

- [x] Skill 发现：启动时扫描 skills/ 目录，读取所有 SKILL.md 的 name + description
- [x] `skill` tool 注册：description 中动态注入可用 skill 列表，AI 调用 skill({name}) 加载 SKILL.md body
- [x] `run_skill_script` tool：执行已激活 Skill 的 scripts/ 下 .ts/.js 脚本（via bun），Rust 侧子进程执行 + 环境变量继承 + 30s 超时 + 路径安全校验
- [x] getToolDefinitions 改造：按需追加 skill tool + run_skill_script tool
- [x] Skill 激活状态管理（按 tab 隔离，shouldAddRunSkillScriptTool 判断）

### 环境变量配置

- [x] Settings Panel 新增「环境变量」导航项，支持 KV 对增删改（name + value）
- [x] 自动持久化环境变量到 settings.json（add/remove/change 即时保存）
- [x] Skill 脚本执行时自动继承环境变量（resolveEnvVars 替换 ${VAR_NAME}）

### Skill 管理界面

- [x] Settings Panel 新增「Skill」导航项（Available 远程 + Installed 本地分区）
- [x] Skill Store 浏览/安装/更新/卸载（GitHub monorepo 作为 skill 源）
- [x] 安装确认对话框 + 错误提示（showAlertDialog）
- [x] bun 可用性检测（hasDeps 技能安装前检查）
- [x] 原子替换安装（rename old→.old, tmp→target, rollback on failure）
- [x] Rust 侧远程请求（fetch_skill_registry 复用 reqwest + ProxyState）

---

## v0.9.1 — 提示词 & Skill 优化 ✅

### 提示词优化

- [x] 文档内容分隔符从 `---` 改为 XML 标签（`<document_content>` / `<document_structure>`），解决 LLM 混淆文件名与内容标题
- [x] `<available_env_vars>` 加 `<current_value>`，LLM 不再需要 webfetch 查询环境变量实际值
- [x] `buildSystemPrompt` 参数 `activeFileName` → `activeFilePath`，传递完整路径而非仅文件名
- [x] 删除冗余引述（"The user is editing..." / "Please answer..."），`<document_content>` 标签本身已说明
- [x] SKILL_INSTRUCTION 更新（"MoFlow resolves these before execution — you do NOT need to know their actual values"）

### Skill 优化

- [x] `toolSkill` 返回内容删除冗余 `Available environment variables` 段落（已在 system prompt `<available_env_vars>` 中提供）
- [x] 强化 STOP 指令：`[Script executed successfully...]` → `[SUCCESS — Do NOT call run_skill_script again. Report this output to the user now.]`
- [x] 移除 debug `console.info` 日志（contextBuilder 3处、tools 5处、AISidebar 6处、skillManager 4处、skillStore 2处）

---

## v0.9.2 — AI prompt 英文硬编码 ✅

- [x] 工具描述（`ai.tool.*.desc` / `ai.tool.*.param.*`）从 i18n `t()` 改为英文硬编码（LLM prompt 不需要多语言）
- [x] 工具错误消息（`ai.tool.error.*`）从 i18n `t()` 改为英文硬编码（tool result 只给 LLM 看）
- [x] `skill` tool 和 `run_skill_script` tool 描述补齐英文（之前 en.ts 缺失 key 导致 fallback 失效）
- [x] `tools.ts` 移除 `import { t } from "../i18n/core"`（不再有 i18n 依赖）
- [x] 4 个 locale 文件各删除约 45 个 `ai.tool.*` / `ai.tool.error.*` key（保留 `ai.toolStatus.*` UI 可见键）

---

## v0.9.3 — Write/Edit Tool & Skill 调用优化 ✅

### Write Tool（文件写入能力）

- [x] `makeWriteTool()` — tool 定义（path + content 参数，支持绝对路径和相对路径）
- [x] `toolWrite()` — 执行逻辑：路径解析（workspace > activeFile dir > 绝对路径）、`edit` 权限检查、`allowFsScope`、`writeFile`、自动创建父目录、已打开 tab 同步内容
- [x] `executeTool` 新增 `case "write"` 分支
- [x] `getToolDefinitions` 增加 `activeFilePath` 参数，无 workspace 但有 activeFilePath 时也返回 write tool
- [x] `WS_FILE_TOOLS` / `DOC_FILE_TOOLS` 追加 write tool 说明行
- [x] 无 workspace + 短文档 prompt 分支追加 write tool 说明
- [x] `AISidebar.tsx` / `ContextView.tsx` 传入 `activeFilePath` 参数

### Edit Tool（文件局部编辑）

- [x] `makeEditTool()` — tool 定义（path + old_string + new_string + replace_all 参数）
- [x] `toolEdit()` — 精确匹配 + 行尾空格模糊匹配；多处匹配提示 replace_all；无匹配返回上下文片段
- [x] `resolvePathAndCheckWritePermission()` — 提取 write/edit 共享路径解析+权限检查逻辑
- [x] `syncTabContent()` — 提取 write/edit 共享 tab 同步逻辑
- [x] `executeTool` 新增 `case "edit"` 分支
- [x] `getToolDefinitions` 追加 edit tool
- [x] `WS_FILE_TOOLS` / `DOC_FILE_TOOLS` 追加 edit tool 说明行

### Skill 调用 Prompt 优化

- [x] `<available_skills>` XML 紧凑化（行内属性）
- [x] `<available_env_vars>` 精简（行内属性，保留 desc）

### Tool 显示与命名统一

- [x] 工具名重命名：`read_section` → `readSection`、`run_skill_script` → `runSkillScript`、`external_path` → `externalPath`（8 文件 ~35 处）
- [x] `formatToolArgs` 为 `read`/`readSection`/`grep`/`outline` 加结构化参数显示（path 在前无前缀，其余 `key=val`）
- [x] Prompt 中 `read_lines` → `read` 统一
- [x] i18n key 命名统一（工具名全驼峰，`formatToolArgs` 自然对齐）

### Tool 轮次配置化

- [x] `MAX_TOOL_ROUNDS` 从硬编码 10 → store 可配置 `maxToolRounds`（默认 20，Settings AI 面板可调 1-50）
- [x] AISection 改为 draft + Save 模式（不再即时保存）
- [x] maxToolRounds 输入框去掉上下箭头（`type="text"` + `inputMode="numeric"`）

### UI 修复

- [x] 错误状态工具结果改为 `<details>` 可折叠（GenericToolResult、EditToolResult、ReadToolGroup）
- [x] `permission.ts evaluate()` 加 `if (!rules) return "ask"` 防御 undefined 崩溃
- [x] ContextView 工具调用参数不再截断（去 30 字符限制）

### Tool 结果精简

- [x] `toolWrite` 返回 `"File written successfully."`（去掉路径/预览/字符数/`---`）
- [x] `toolEdit` 返回 `"Edit applied successfully."` 或 `"... (N replacements)"`（去掉路径/diff/`---`）
- [x] `EditToolResult` 重构：从 `item.info.args` 构建 diff 显示，不再解析 `msg.content` 的 `---` 分隔符

### Skill 调用重构

- [x] `runSkillScript` script 参数改为 `skillName/scriptName` 格式（如 `markdown-to-ppt/convert.js`），移除暴力遍历 fallback
- [x] `toolSkill` 返回脚本名加 skill 前缀（`- markdown-to-ppt/convert.js` 替代 `- convert.js`）
- [x] `runSkillScript` tool description 更新为新格式说明
- [x] `executeSkillScript` 新增 `cwd` 参数，默认 activeFile 目录（回退 workspaceRoot）
- [x] Rust `execute_script` 新增 `cwd: Option<String>` 参数

---

## v0.9.5 — AI 提示词优化 ✅

- [x] Selection AI translate 去掉全量文档（空 system prompt，不发 docContent）
- [x] translate 提示词补齐 Markdown 格式保留（Rules 条目化 + XML 标签）
- [x] 翻译面板去掉原文展示，只显示翻译结果
- [x] Selection AI explain/rewrite 保留全量文档
- [x] 选中文字序列化为 Markdown（getSelectionMarkdown + serializerCtx），替代 textBetween 纯文本
- [x] AI 消息列表圆点显示修复（MessageContent.css list-style-type）
- [x] Toolbar 拖选隐藏（data-selecting + mousedown/mouseup + setTimeout 50ms）
- [x] API Token 输入框改为 type="password"
- [x] Markdown 语法块精简（~550 chars → ~200 chars）
- [x] 工具说明去重（system prompt 不再重复 tools 参数中的描述）
- [x] Claude max_tokens 动态计算（替代硬编码 4096）
- [x] Token 估算改进（fallback 模式包含 tool_calls/reasoningContent）

---

## v0.9.6 — 交互式问答 ✅

### `question` Tool

- [x] `makeQuestionTool()` — tool 定义（`questions[]` 数组，每项含 `question` + `options[{label, description?}]` + `multiple?`）
- [x] `QuestionItem` / `QuestionOption` 类型导出
- [x] `getToolDefinitions` 始终注册 question tool
- [x] Tool description 包含使用时机指引（有选项时用，讨论时直接在文本中问）

### AISidebar Tool Loop 拦截

- [x] `tc.name === "question"` 时暂停 tool loop，通过 Promise 阻塞等用户回答
- [x] `pendingQuestion` state + `resolveQuestionRef`（同 PermissionBar 模式）
- [x] 用户回答后返回结构化答案（`Q: question → answer` 格式），写入 tool message
- [x] question tool 不算 maxToolRounds 轮次
- [x] finally 块清理 pendingQuestion + resolveQuestionRef
- [x] `formatToolArgs` question case：显示所有 question 文本
- [x] `ToolCallStatus` question case

### QuestionBar 组件（向导式流程表单）

- [x] `QuestionBar.tsx` — 向导式多问题表单，一次显示一个问题
- [x] 顶部进度指示器（`1 / N`）
- [x] 单选：radio 按钮，点击选中（不自动提交）
- [x] 多选：checkbox 按钮，toggle 选择
- [x] 自定义输入："其他"选项 + 文本输入框
- [x] "其他"与普通选项互斥（点"其他"清除已选，点普通选项取消"其他"高亮）
- [x] 非最后一步：右侧**继续**按钮
- [x] 最后一步：右侧**确认**按钮
- [x] 非第一步：确认按钮左边**返回**按钮（保留之前选择）
- [x] 按钮右对齐（`justify-content: flex-end`）
- [x] 输入框上方渲染（与 PermissionBar 同位置，互斥）
- [x] pendingQuestion 时禁用输入框

### CSS

- [x] `.moflow-ai-question-bar` 相关样式（复用 PermissionBar 视觉风格）
- [x] Radio/checkbox 自定义样式（`--moflow-accent` 配色）
- [x] 进度指示器、返回/继续/确认按钮样式

### System Prompt

- [x] 删除矛盾指令 "Follow user instructions directly without questioning their intent"
- [x] 合并 clarify + plan 为 "First principle: Understand before you act"
- [x] 明确指定 non-trivial 任务必须先用 question tool 问清楚再执行
- [x] 区分 trivial（直接做）vs non-trivial（先问）

### i18n

- [x] 4 个 locale 文件新增 `question.*`（customAnswer, customPlaceholder, submit, confirm, next, back）和 `ai.toolLabel.question` 键

---

## v1.0.0 — 正式版 & AI 模式 ✅

### Skill 市场

- [x] Skill 市场浏览界面（Available + Installed 分区）
- [x] 一键安装（从 GitHub monorepo 下载 skill 到本地）
- [x] Skill 版本管理与更新
- [x] GitHub 仓库作为 skill 源（moflow-skills monorepo）
- [x] 远程 registry 增加 `category` / `tags` 字段（moflow-skills 项目）

### Skill 搜索与分类

- [x] Settings Skill 面板搜索框（关键词匹配 name + description + tags）
- [x] 分类筛选栏（全部 / writing / coding / data / productivity / media）
- [x] 搜索结果高亮匹配词

### UI 修复

- [x] 外观 toggle 背景色冲突修复（`bg-ui-input-bg` 与 `bg-ui-accent` 互斥）
- [x] 暗色模式 accent 蓝色加深（`#89b4fa` → `#6aa0f7`）

### AI 模式

- [x] Plan 模式（edit + runSkillScript → deny，AI 只分析不改文档；system prompt 声明 Plan 模式限制 + 权限硬拦截双保险）
- [x] Build 模式（默认模式，edit + runSkillScript → ask，保留全部能力）
- [x] AISidebar header 模式切换按钮（Plan / Build，session 级别）
- [x] Tab 键快捷切换 Plan/Build 模式（仅 AISidebar 内生效）

### 快捷键自定义

- [x] Settings 新增 Shortcuts section（列表显示所有快捷键，点击某项可重新绑定按键）
- [x] 快捷键绑定 UI（按下新组合键捕获，支持 Ctrl/Shift/Alt + 字母/数字/F键）
- [x] `settings.ts` 持久化自定义快捷键映射（`shortcutOverrides: Record<string, ShortcutDef>`）
- [x] `shortcuts.ts` 加载自定义覆盖（`getShortcut(id)` 合并 override）
- [x] App.tsx 键盘事件监听读取覆盖后的快捷键定义（动态匹配取代硬编码 if-else）
- [x] Reset 某项快捷键 / Reset All 恢复默认
- [x] 快捷键冲突检测（新组合键已被占用则提示拒绝）

### 小修复

- [x] HamburgerMenu 导出子菜单去掉 `?` 指示符

---

## v1.1.0 — 跨平台支持 ✅

### Design Decisions

- **PDF 导出**：Windows 用 Rust WebView2 PrintToPdf（已验证正常），macOS/Linux 用前端 JS 回退（jspdf + html2canvas，iframe srcdoc 隔离样式）
- **macOS 标题栏**：Tauri `titleBarStyle: "overlay"` + `decorations: true`，保留原生交通灯按钮 + 自定义标题栏内容
- **Linux 打包**：AppImage + deb
- **macOS 最低版本**：10.15（Catalina）
- **macOS 代理**：WKWebView 遵循系统代理设置，无需窗口级 proxy 配置

### Rust Backend 跨平台适配

- [x] `export_pdf` 双轨方案：Windows 调 Rust `export_pdf`（WebView2 PrintToPdf），macOS/Linux 调 `exportPdfFrontend`（iframe srcdoc + html2canvas + jspdf）
- [x] WebView2 `proxy_url()` builder 调用加 `#[cfg(target_os = "windows")]` 守卫（主窗口 + PDF 窗口）
- [x] macOS 窗口创建：用 `titleBarStyle: "overlay"` + `decorations: true` 替代 `decorations(false)`
- [x] `CHROME_UA` 改为平台感知（`#[cfg]` 选择 Windows/macOS/Linux UA 字符串）
- [x] macOS 代理：`proxy_url()` 在 macOS 上跳过，webfetch/reqwest 仍通过 ProxyState + 环境变量生效

### Tauri Config 跨平台

- [x] `bundle.targets` 添加 `"dmg"`, `"deb"`, `"appimage"`
- [x] 添加 `"macOS"` section：`minimumSystemVersion: "10.15"`
- [x] 添加 `"linux"` section：deb depends（`libwebkit2gtk-4.1-0`, `libgtk-3-0` 等 Tauri v2 运行时依赖）
- [x] Updater 配置添加 macOS/Linux 段（macOS installMode 已添加，Linux 无需特殊配置；更新机制需实机验证）

### 前端 PDF 导出重写（跨平台）

- [x] 引入 `jspdf` + `html2canvas` 作为 macOS/Linux PDF 生成方案
- [x] 实现 `exportPdfFrontend(html, outputPath)` — iframe srcdoc 隔离样式 → html2canvas → canvas 切片分页 → jspdf → Tauri writeFile
- [x] `fileOps.ts` PDF 导出：platform 检测，Windows → Rust `export_pdf`，macOS/Linux → `exportPdfFrontend`
- [x] 导出进度提示适配 — 失败时 showAlertDialog 提示
- [x] Windows PDF 渲射质量：已回退 Rust WebView2 方案，无需对比

### macOS 标题栏适配

- [x] 窗口创建逻辑：macOS 用 `titleBarStyle: "overlay"` + `decorations: true`，Windows/Linux 保持 `decorations: false`
- [x] TitleBar 组件：macOS 隐藏自定义最小化/最大化/关闭按钮（原生交通灯已提供）
- [x] TitleBar 组件：macOS 左侧预留交通灯宽度（约 78px padding-left），右侧按钮不变
- [x] 拖拽区域适配：overlay 模式下交通灯区域不可拖拽，内容区域可拖拽（需 macOS 实机验证拖拽行为）

### 前端跨平台修复

- [x] `Editor.tsx`：`e.ctrlKey` → `e.ctrlKey || e.metaKey`（拦截 macOS Cmd+S）
- [x] `shortcuts.ts`：`isMac` 检测增加 `navigator.userAgentData?.platform` fallback
- [x] `tauri-plugin-os` 注册（Rust 端 + capabilities 权限）
- [x] i18n：代理重启提示消息确认所有平台适用（当前消息无需改动）
- [x] `App.tsx` 快捷键系统：确认 `e.ctrlKey || e.metaKey` 全覆盖（已确认无遗漏）
- [x] `shortcuts.test.ts`：`formatShortcutDisplay` 测试改为跨平台兼容（Ctrl+S / ⌘S）

### CI Workflow 多平台构建

- [x] `.github/workflows/ci.yml` — 多平台 lint + tsc + test + cargo check（Windows/macOS/Linux 三平台）
- [x] `.github/workflows/release.yml` matrix 添加 `macos-latest` 和 `ubuntu-latest`
- [x] `ubuntu-latest` runner 安装 Tauri Linux 依赖（`libwebkit2gtk-4.1-dev` 等）
- [x] Release notes 提取步骤确认 `pwsh` 在所有 runner 可用（GitHub Actions 已预装）
- [x] 上传产物：Windows `.exe` + macOS `.dmg` + Linux `.AppImage` + `.deb`

### 测试 & 验证

- [x] macOS 构建通过 — CI `macos-latest` ✓ (lint + tsc + test + cargo check)
- [x] Linux 构建通过 — CI `ubuntu-latest` ✓ (lint + tsc + test + cargo check)
- [x] macOS 功能验证：标题栏交通灯、快捷键 Cmd 替代 Ctrl、PDF 导出、代理 — CI 通过，需实机验证
- [x] Linux 功能验证：窗口装饰、PDF 导出、代理 — CI 通过，需实机验证
- [x] Windows 回归测试：PDF 导出正常，本地 185 tests pass，lint/tsc/cargo check 全过

### README & 文档

- [x] README 添加跨平台说明：macOS/Linux 支持为社区构建版，开发者无 Mac/Linux 机器进行实机测试，如有问题欢迎反馈（附 GitHub issue 链接）
- [x] README 下载/安装区分平台说明（Windows 完整测试 / macOS·Linux 社区测试版）

---

## v1.2.0 ✅ — Agent 调用能力

### Design Decisions

- **执行模型**：子代理运行完整 chat loop（多轮 tool calling），与主代理相同的 while 循环模式
- **子代理类型**：explore（只读代码探索）+ general（通用多步任务）
- **并发模型**：顺序执行（主代理每轮最多启动一个子代理），并发执行留到后续版本
- **UI 交互**：主聊天显示摘要卡片，点击进入子代理详情视图（完整消息列表），"← 回到主对话"返回
- **持久化**：仅 Task tool 最终结果写入主对话 JSONL；子代理中间消息纯内存；trace 记录 span
- **Model**：子代理使用与主代理相同的 model 和 client
- **Context**：子代理不继承父级对话历史，仅收到 prompt + workspace info + docContent
- **权限**：继承父级 sessionRules + onPermission callback；Plan 模式 deny 规则级联传递
- **Token 计费**：子代理 usage 累加到父级 chatStore.recordUsage()
- **Abort**：直接传递父级 AbortSignal
- **轮次限制**：子代理独立计数（explore: 10, general: 15）；Task tool 不计主代理 maxToolRounds

### Type & Data Structure

- [x] `src/lib/types.ts` — 新增 `SubAgentResult`（content, toolCalls, totalRounds, usage）、`SubAgentExecution`（taskId, description, subagentType, messages, totalRounds, usage, status）、`ToolCallSummary`（name, argsBrief, round）

### Tracer 扩展

- [x] `src/lib/tracer.ts` — `ActiveSpan.type` 扩展 `"subagent"`；子代理操作通过父级 tracer 创建 span

### 子代理执行引擎

- [x] `src/lib/subAgentRunner.ts`（新文件）— `runSubAgent(prompt, type, ctx, client, signal, tracer, onPermission, maxRounds)`
- [x] 构建 system prompt（简化版：不含 `<available_skills>` 等非必要内容，仅 workspace info + docContent + 子代理 prompt）
- [x] 内部维护独立 `Message[]`（纯内存，不进 chatStore）
- [x] `while(round <= maxRounds)` 循环（explore: 10, general: 15）
- [x] Plan 模式级联：父级 plan → 子代理强制加入 PLAN_DENY_RULES
- [x] explore 工具集：outline/read/readSection/grep/find/glob/ls/webfetch（8 个只读）
- [x] general 工具集：全部 13 工具（不含 question/skill，这两个仅主代理用）
- [x] 返回 `SubAgentResult`

---

## v1.2.1 ✅ — Prompt 精简 & Plan Mode 增强

### System Prompt 精简

- [x] 删除 `WEBFETCH_INSTRUCTION` 常量及所有引用（信息合并进 webfetch tool description）
- [x] 删除 `SUBAGENTS_INSTRUCTION` 常量及所有引用（信息合并进 task tool description）
- [x] webfetch tool description 添加 "Max 3 calls per request" 限制
- [x] webfetch format 参数 description 添加使用场景指引（markdown/text/html 各自适用场景）

### Plan Mode 增强（follow opencode）

- [x] 重写 `PLAN_MODE_INSTRUCTION`：增加 Responsibility（read/search/explore, delegate explore sub-agents, build plan, ask clarifying questions）+ Important（no file changes, priority override）
- [x] 新增 `BUILD_MODE_INSTRUCTION`（plan → build 模式切换时明确告知 LLM）

### Task Tool 定义与执行

- [x] `src/lib/tools.ts` — 新增 `makeTaskTool()`（description + prompt + subagent_type 参数）
- [x] `executeTool` 新增 `"task"` case：调用 `runSubAgent()`，生成 `<task_result>` XML 返回
- [x] 子代理 usage 累加到父级 `chatStore.recordUsage()`
- [x] Task tool 不计主代理 maxToolRounds 轮次

### System Prompt 调整

- [x] `src/lib/contextBuilder.ts` — `buildSystemPrompt` 加入 `<available_subagents>` XML 块

### Chat Store 扩展

- [x] `src/stores/chatStore.ts` — 新增 `activeSubAgentView: string | null`（taskId 或 null = 主对话）
- [x] 新增 `subAgentResultsMap: Record<string, SubAgentExecution>`（taskId → 完整执行数据）
- [x] 新增 actions：`setActiveSubAgentView`, `addSubAgentResult`, `clearSubAgentViews`

### AISidebar 集成

- [x] `src/components/AISidebar/AISidebar.tsx` — handleSend 中 `tc.name === "task"` 分支
- [x] 保存 `SubAgentExecution` 到 `subAgentResultsMap`
- [x] ToolCallStatus 显示 "Agent: {description}" + spinner
- [x] 视图切换：`activeSubAgentView` 控制渲染主对话 vs 子代理详情

### 子代理 UI 组件

- [x] `src/components/AISidebar/SubAgentView.tsx`（新文件）— 子代理详情视图
  - Header："← 回到主对话" + description + type badge
  - 内容：子代理完整消息列表（复用现有消息渲染组件）
  - 底部：无输入框
- [x] `src/components/AISidebar/SubAgentCard.tsx`（新文件）— 主聊天中的摘要卡片
  - 类型图标 + description + rounds + 摘要文本
  - onClick → `setActiveSubAgentView(taskId)`

### i18n

- [x] 4 个 locale 文件新增 task 相关 key（ai.toolLabel.task, ai.task.backToMain, ai.task.explore, ai.task.general, ai.toolStatus.task 等）

### CSS

- [x] `AISidebar.css` — 子代理卡片样式 + 详情视图样式

---

## v1.3.0 — 消息撤销 ✅

### Design Decisions

- **撤销粒度**：按轮撤销（一次撤销一整轮：user + assistant + tool 消息），线性截断，无分支
- **快照系统**：基于 git2-rs（libgit2），每 session 一个独立 git repo，每轮对话开始前 commit
- **文件回滚**：撤销时 git checkout 恢复文件到上一轮 commit 状态（统一方案，不用全量快照）
- **撤销前存档**：撤销操作前先 commit 当前状态（含手动编辑），保证可反悔
- **手动编辑冲突**：不检测不警告，撤销前存档保证可反悔（与 opencode 一致）
- **外部文件**：workspace 外的文件变更不保证回滚，权限确认时提示用户
- **compact 跨越**：原始消息在 messagesMap 中保留不删除，撤销可跨越 compact 边界
- **JSONL 处理**：撤销时重写 messages.jsonl，只保留截断点之前的行
- **git2-rs 依赖**：vendored-libgit2 静态链接，+2-4 MB 包体积，用户无需安装 git

### Git Snapshot 快照系统（Rust 后端）

- [x] Cargo.toml 添加 `git2` 依赖（vendored-libgit2，default-features = false，不开 https）
- [x] `snapshot_init` 命令 — 在 `{appDataDir}/chats/{safeFileName}/snapshots/` 初始化 bare git repo
- [x] `snapshot_commit` 命令 — 构建 git tree + commit，返回 commit hash（支持 workspace 全目录或指定文件列表）
- [x] `snapshot_checkout_files` 命令 — 恢复指定文件到指定 commit 状态
- [x] `snapshot_restore` 命令 — 恢复整个 worktree 到指定 commit 状态（含删除多余文件）
- [x] `snapshot_log` 命令 — 返回 commit 列表（hash + message + timestamp）
- [x] `snapshot_destroy` 命令 — 删除 snapshot repo 目录 + 清理状态
- [x] Snapshot 状态管理 — `HashMap<String, SnapshotInfo>` 存储 workspace 路径和文件列表（按需 open_repo，非缓存 Repository）
- [x] 跨平台路径修复 — `path_to_posix()` / `split_path_parts()` 替代 `to_string_lossy().split('/')`

### chatStore 撤销逻辑

- [x] `undoFromMessage` action — 按 messageId 截断消息（支持撤销任意用户消息，不限于最后一轮），返回截断点前用户消息数（-1 表示未找到）
- [x] 找到截断边界：按 messageId 找到 cutIdx，保留 cutIdx 之前的消息
- [x] 截断后调用 `getContext()` 重建 contextMap（可能跨越 compact，自然恢复原始消息）
- [x] 截断后清空该 tab 的 subAgentResults
- [x] 调用 Rust `snapshot_restore` 恢复文件到对应 commit 状态
- [x] 调用 `rewriteChat` 重写 JSONL
- [x] 刷新编辑器已打开文件的内容（loadTabContent，posix 路径匹配）

### chatPersistence JSONL 重写

- [x] `rewriteChat(chatKey, messageCount)` — 重写 messages.jsonl，只保留前 N 条消息
- [x] 先写入 `.repair` 临时文件，成功后 rename 替换原文件（原子操作，避免损坏）

### 前端 Snapshot 集成

- [x] 每轮对话开始前（handleSend 开头）调用 `snapshot_commit` 保存当前状态（commit message: `round-N`）
- [x] Tab 初始化时调用 `snapshot_init` 设置快照 repo（workspace 模式传 workspace 路径，单文件模式传文件列表）
- [x] 每条用户消息旁显示撤销按钮，触发 `undoFromMessage` + `snapshot_restore`

### 撤销前存档（反悔机制）

- [x] 撤销操作前先调用 `snapshot_commit` 保存当前状态（含手动编辑）— undoManager `commit(chatKey, msgId)` 生成 `"post:" + msgId` archive commit
- [x] 存档 commit hash 记录到 `chatStore.undoArchiveMap` — `UndoArchive { hash, messageId, content }`，单 slot per chatKey
- [x] "恢复到撤销前"按钮 — undoManager `restore(chatKey)` → `snapshotRestore(archiveHash)` + `restoreFromUndoBackup` + 重建消息

### 外部文件权限提示

- [x] `PermissionBar` 外部路径确认时增加提示：「外部文件修改无法通过撤销回滚」

### UI

- [x] AISidebar 消息列表中每条 user 消息旁显示撤销图标按钮
- [x] 撤销视觉反馈 — 消息消失 + undo-restore-bar 提示条已提供充分反馈，无需额外 toast
- [x] "恢复到撤销前"入口（undo-restore-bar 提示条，warn 配色白色字体）

### i18n

- [x] 4 个 locale 文件新增撤销相关 key（ai.undo, ai.undoConfirm, ai.undoExternalWarning, ai.undoRestore, ai.undoRestoreBtn）

### 测试

- [x] Rust snapshot 工具函数测试（path_to_posix, split_path_parts, safe_file_name — 19 tests）
- [x] chatStore undoFromMessage 测试（未找到/第一条/截断/含 tool 消息/重建 context/跨 compact — 6 tests）
- [x] 前端跨平台路径工具测试（toPosix/posixDirname/posixBasename — 27 tests）

### 跨平台路径统一

- [x] `src/lib/pathUtils.ts` — toPosix / posixDirname / posixBasename 工具函数
- [x] 替换所有 inline `.replace(/\\/g, "/")` 为 `toPosix()` / `posixDirname()` / `posixBasename()`
- [x] 涉及文件：AISidebar / Editor / tabStore / tools / permission / skillManager

### 组件状态持久化

- [x] `pendingQuestion` / `resolveQuestionRef` 从 AISidebar useState/useRef 提升到 chatStore（按 chatKey 隔离）
- [x] `permissionRequest` / `resolvePermissionRef` 从 AISidebar useState/useRef 提升到 chatStore
- [x] `QuestionBar` 表单状态（step/answers/showCustom/customInputs）提升到 chatStore
- [x] 切换设置页再切回时 QuestionBar/PermissionBar 状态不丢失

### Plan 模式增强

- [x] `executeTool` 入口级 plan mode 检查 — write/edit/runSkillScript 在 plan 模式下直接返回明确错误消息
- [x] 权限 deny 消息区分 plan 模式 vs 普通权限拒绝

---

## v1.3.1 — Bug 修复

### 修复

- [x] Windows 执行 skill 脚本黑窗闪烁（`CREATE_NO_WINDOW` flag，macOS/Linux 无此问题）
- [x] `runSkillScript` 参数含引号路径双重引号导致路径错误（`parseArgs` 引号感知解析替代 `split(/\s+/)`）
- [x] 搜索跨 mark 边界单词匹配失败（`prosemirror-search` `textContent` 空格注入，`resolve.alias` shim 修复）
- [x] 搜索按 Enter 后高亮消失（`ProseMirror-active-search-match` 缺少 CSS 样式）
- [x] 搜索按 Enter 触发文档重建丢失 decoration（`markdownUpdated` 守卫，内容不变时跳过 `updateTabContent`）
- [x] 快捷键 `toLowerCase()` 崩溃（`shortcuts.ts` override `key` 为 undefined 时防御）
- [x] 设置页切换 tab 后 section 重置为外观（`settingsActiveSection` 持久化到 themeStore）
- [x] 环境变量页面不显示已保存的变量（去掉 `draft` useState，直接用 store `envVars`）
- [x] 环境变量 key 列宽度不足（`min-w-[120px]` → `min-w-[170px]`，容纳 `WECHAT_APPSECRET`）

### 测试

- [x] `parseArgs` 单元测试（13 cases：空字符串、引号路径、空格、未闭合引号、真实 skill 参数等）

---

## v1.3.5 — Toast & Prompt Caching ✅

### 通用 Toast 基础设施

- [x] `src/stores/toastStore.ts`（新文件）— Zustand store，队列 `toasts: Toast[]`（id/type/message/duration/createdAt），`addToast(type, message, duration?)` / `removeToast(id)`，队列上限 3 条
- [x] `src/lib/toast.ts`（新文件）— 便捷函数 `toast.success(msg)` / `toast.error(msg)` / `toast.info(msg, duration?)`，success 默认 3s，error 默认 5s，info 默认 3s
- [x] `src/components/ToastContainer/ToastContainer.tsx`（新文件）— 固定右下角堆叠排列，按 type 配色（success 绿 / error 红 / info 蓝灰），进度条动画，× 手动关闭
- [x] `App.tsx` 挂载 `<ToastContainer />`
- [x] 迁移 SettingsPanel AISection 局部 toast → `toast.success()`
- [x] 迁移 SettingsPanel ProxySection 局部 toast → `toast.success()` / `toast.error()`
- [x] 迁移 SkillsSection `showAlertDialog`（安装/卸载成功场景）→ `toast.success()`

### Prompt Caching 完整支持

- [x] `llmClient.ts` ClaudeCompatibleClient — 解析 `usage.cache_read_input_tokens` + `usage.cache_creation_input_tokens`，映射到 `ChatUsage.cachedTokens`
- [x] `ChatUsage` 新增 `cacheCreationTokens?: number`
- [x] `ClaudeCompatibleClient.chat()` — system prompt 最后一个 content block 加 `cache_control: {"type": "ephemeral"}`，仅 Claude（OpenAI 自动缓存无需手动标记）
- [x] `modelInfo.ts` `calculateCost()` 新增 `cachedTokens` 参数，固定比例折扣（OpenAI cached 50% off，Claude cache read 90% off，Claude cache creation +25%）
- [x] `chatStore.recordUsage()` / `recordStandaloneUsage()` 传入 `cachedTokens`，`subAgentRunner.ts` 传入 `cachedTokens`
- [x] UsageBadge 多行展示：Context / Cached（有缓存时显示节省 token 数 + 节省金额）/ Total / Cost，无缓存时隐藏 Cached 行
- [x] ContextView 缓存 token 行增加费用节省信息

---

## v1.3.7 — macOS Apple Silicon 支持 ✅

### Design Decisions

- **分架构构建**：macOS 分别构建 x86_64 和 aarch64 DMG（非 Universal Binary），用户按架构下载
- **macOS 最低版本**：10.15 → 11.0（Apple Silicon 最低要求 macOS 11 Big Sur）
- **自动升级**：`latest.json` 通过 `darwin-x86_64` / `darwin-aarch64` 区分架构，客户端自动匹配

### Tauri Config

- [x] `macOS.minimumSystemVersion`: `"10.15"` → `"11.0"`

### Release Workflow

- [x] `release.yml` macOS matrix 从 1 个改为 2 个：`macos-13`（Intel runner → x86_64 dmg）+ `macos-latest`（ARM runner → aarch64 dmg）
- [x] tauri-action 为两个 macOS 构建分别生成 dmg + sig，合并写入 `latest.json`（`darwin-x86_64` + `darwin-aarch64`）

### 版本号

- [x] `package.json` / `Cargo.toml` / `tauri.conf.json` 版本号 → `1.3.7`

---

## v1.3.8 — 默认 .md 文件关联 ✅

### OS 文件关联

- [x] `tauri.conf.json` bundle 添加 `fileAssociations`（`.md` → `text/markdown`）
- [x] Rust 启动参数解析 + `PendingFileState` + `get_pending_file` 命令
- [x] 前端启动时 invoke `get_pending_file` 并自动打开文件
- [x] 已有 `single-instance-file-open` 事件处理第二实例传参

---

## v1.4.0 — AI 增强 & 聊天框呈现

### AI 增强

- [ ] 对话导出（Markdown / JSON）
- [ ] 聊天历史搜索
- [ ] `runSkillScript` 硬停机制（`skillScriptExecuted` flag + 拦截逻辑 + 动态移除 tool schema）
- [ ] `runSkillScript` tool description 简化（行为约束移至 system prompt）
- [ ] `SKILL_INSTRUCTION` 拆分为 `SKILL_BASE` + `SKILL_SCRIPT`（按条件拼接）
- [ ] Tool result 截断重构：截断时完整内容写入临时文件，返回预览 + 提示 LLM 用 read/grep 按需读取（参考 opencode Truncate 机制，MAX_LINES=2000 / MAX_BYTES=50KB，截断不影响 UI 显示）

### 聊天框呈现

- [ ] Thinking/reasoning 折叠显示（chat 消息流中渲染 `reasoningContent`，`<details>` 折叠，仅限支持推理模式的模型）
- [ ] Tool result XML 渲染（`<file>` / `<grep>` / `<outline>` 等 XML 标签语法高亮 + 折叠行号区）

---

## v1.5.0 — Git 支持 & 后续迭代

### Git 支持

- [ ] AI git tool — 通用 tool，读操作（status/diff/log/show/branch）无权限，写操作（commit/push/pull/checkout/add/reset/stash）需 edit 权限，Rust 子进程 + 30s 超时
- [ ] OutlineSidebar 新增 Git tab（commit 输入框 + 变更文件列表 + push/pull/stash）
- [ ] 编辑器完整 git diff 高亮（新增绿/修改蓝/删除红虚拟行 + gutter 标记，ProseMirror Decoration API）

### 编辑器

- [ ] Vim keybindings 模式

### AI 模式

- [ ] 自定义模式（用户自定义权限预设）

### 修复

- [ ] 窗口白边修复（Windows `shadow: true` 导致 1px 白边）
- [ ] 文件被外部替换时 MoFlow 无感知（需监听文件变更事件，检测外部修改/替换并提示或自动刷新）
- [ ] 搜索跨 mark 边界的单词匹配失败（`prosemirror-search` `textContent` 在非文本子节点前后注入空格，Vite plugin patch 已修复）
