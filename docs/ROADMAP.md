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

## v0.9.5 — AI 提示词优化

- [ ] Selection AI 去掉全量文档（explain/translate/rewrite 不再发送完整文档）
- [ ] Markdown 语法块精简（~550 chars → ~200 chars）
- [ ] 工具说明去重（system prompt 不再重复 tools 参数中的描述）
- [ ] Claude max_tokens 动态计算（替代硬编码 4096）
- [ ] Token 估算改进（fallback 模式包含 tool_calls/reasoningContent）
- [ ] translate 提示词补齐 Markdown 格式提示
- [ ] API Token 输入框改为 type="password"

---

## v1.0.0 — 正式版（Skill 市场增强）

### Skill 市场

- [x] Skill 市场浏览界面（Available + Installed 分区）
- [x] 一键安装（从 GitHub monorepo 下载 skill 到本地）
- [x] Skill 版本管理与更新
- [x] GitHub 仓库作为 skill 源（moflow-skills monorepo）
- [ ] Skill 搜索与分类
- [ ] 社区 skill 分享与提交

---

## v1.x — 跨平台 & 后续迭代

### 跨平台支持

- [ ] macOS 适配（PDF 导出改用 WKWebView、窗口装饰适配、菜单栏集成）
- [ ] Linux 适配（AppImage / deb 打包、WebKitGTK 适配测试）

### AI 增强

- [ ] AI 回复插入文档（聊天消息「插入」按钮，回复内容插入编辑器光标处）
- [ ] 对话导出（Markdown / JSON）
- [ ] 聊天历史搜索

### 编辑器

- [ ] Vim keybindings 模式

### AI 模式

- [ ] 只读模式（edit: deny，AI 只能分析不能改文档）
- [ ] 审查模式（execute: deny，AI 只能用内置 tool，不能执行脚本）
- [ ] 自定义模式（用户自定义权限预设）

### 修复

- [ ] 窗口白边修复（Windows `shadow: true` 导致 1px 白边）

### webfetch 增强（已移至 v0.4.1）

- [x] nav/footer/aside/header/button/form 整块删除 → v0.4.1 markdown/text 模式 strip_noise
- [x] class/style 属性剥离 → v0.4.1 markdown/text 模式 strip_class_style
- [x] scraper 结构化提取 → v0.4.1 markdown 模式（html2md crate）
- [x] webfetch raw 参数 → v0.4.1 html 模式（最小剔除，保留结构和属性）
