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

## v0.7.5 — 编辑器优化

- [ ] 代码模式与所见即所得模式共享 undo history（当前切代码模式时 Milkdown 实例被销毁，undo history 丢失；需改为 CSS 隐藏 + 实时 `replaceAll(content, false)` 同步）

---

## v0.8.0 — i18n & 无障碍

### i18n 正式方案

- [ ] 迁移到 react-i18next
- [ ] 运行时语言切换
- [ ] 支持更多语言（日语、韩语等）

### 无障碍（a11y）

- [ ] 键盘导航完善
- [ ] 屏幕阅读器支持

---

## v0.9.0 — 性能优化

- [ ] 大文件编辑性能
- [ ] 内存占用优化
- [ ] 优化 AI 提示词，让输出更加精简且关键
- [ ] 环境变量配置（方便 skill 等使用）

---

## v1.0.0 — 正式版（插件 & Skill 系统）

### 插件系统

- [ ] 可扩展插件 API 架构设计
- [ ] 自定义 system prompt 模板

### Skill 市场与 Skill 管理

- [ ] Skill 定义规范（名称、描述、图标、system prompt 模板、工具权限声明）
- [ ] Skill 管理界面（安装、卸载、启用/禁用、配置）
- [ ] Skill 市场（浏览、搜索、一键安装；支持本地 skill + 远程仓库）
- [ ] Skill 运行时（加载 skill 的 system prompt + 工具集，按 skill 限定可用工具范围）
- [ ] Skill 对话模式（选择 skill 后进入专属对话，独立上下文）
- [ ] 内置 skill 示例（翻译助手、代码审查、文档润色等）
- [ ] 社区 skill 分享（GitHub 仓库作为 skill 源，约定目录结构）

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

### 修复

- [ ] 窗口白边修复（Windows `shadow: true` 导致 1px 白边）

### webfetch 增强（已移至 v0.4.1）

- [x] nav/footer/aside/header/button/form 整块删除 → v0.4.1 markdown/text 模式 strip_noise
- [x] class/style 属性剥离 → v0.4.1 markdown/text 模式 strip_class_style
- [x] scraper 结构化提取 → v0.4.1 markdown 模式（html2md crate）
- [x] webfetch raw 参数 → v0.4.1 html 模式（最小剔除，保留结构和属性）
