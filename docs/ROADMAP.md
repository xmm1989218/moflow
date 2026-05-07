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

## v0.4.1 — Context View & webfetch 增强 & compact 优化

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

## v0.5.0 — 增强功能 I

### 启动速度优化

- [ ] 分析启动瓶颈（基于 `__startupMark` 数据），优化慢路径
- [ ] 延迟加载非关键模块（AI 侧栏、聊天历史等）
- [ ] 减少首屏渲染阻塞

### Context Panel 原始消息展示美化

- [ ] 原始消息渲染优化（区分 role 样式、代码块高亮、tool 消息格式化）
- [ ] 长消息折叠/展开交互改进

### 聊天框滚动优化

- [ ] 快速输出时按住滚动条无法拉上去（auto-scroll 与用户滚动冲突）
- [ ] 手动上拉后出现抖动（scroll 事件竞争）

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

### 无障碍（a11y）

- [ ] 键盘导航完善
- [ ] 屏幕阅读器支持

### 插件系统

- [ ] 可扩展插件 API 架构设计（视情况可能延后到 v1.x）

---

## v1.x — 后续迭代（按需）

- [ ] 优化提示词，让输出更加精简且关键
- [ ] 增加环境变量配置，方便 skill 等使用
- [ ] 对话导出（Markdown / JSON）
- [ ] 聊天历史搜索
- [ ] 自定义 system prompt 模板
- [ ] 多文件上下文（引用其他打开的文档）
- [ ] Vim keybindings 模式
- [ ] 图片上传和管理
- [ ] 窗口白边修复（Windows `shadow: true` 导致 1px 白边）
- [ ] 打开目录（文件夹树浏览，快速打开目录下的文件）

### webfetch 增强（已移至 v0.4.1）

- [x] nav/footer/aside/header/button/form 整块删除 → v0.4.1 markdown/text 模式 strip_noise
- [x] class/style 属性剥离 → v0.4.1 markdown/text 模式 strip_class_style
- [x] scraper 结构化提取 → v0.4.1 markdown 模式（html2md crate）
- [x] webfetch raw 参数 → v0.4.1 html 模式（最小剔除，保留结构和属性）

### Skill 市场与 Skill 管理

- [ ] Skill 定义规范（名称、描述、图标、system prompt 模板、工具权限声明）
- [ ] Skill 管理界面（安装、卸载、启用/禁用、配置）
- [ ] Skill 市场（浏览、搜索、一键安装；支持本地 skill + 远程仓库）
- [ ] Skill 运行时（加载 skill 的 system prompt + 工具集，按 skill 限定可用工具范围）
- [ ] Skill 对话模式（选择 skill 后进入专属对话，独立上下文）
- [ ] 内置 skill 示例（翻译助手、代码审查、文档润色等）
- [ ] 社区 skill 分享（GitHub 仓库作为 skill 源，约定目录结构）
