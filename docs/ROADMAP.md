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

## v0.4.0 — Phase 2: Tool-Calling

Enable the AI to actively explore the document instead of relying on truncated context.

### Design Decisions

- Tool execution: **frontend JS** (reads docContent in memory, no IPC needed)
- Mock client: **no tool-calling simulation** (Mock mode sends no tools, stays simple)
- Persistence: **full** — toolCalls + tool messages saved to JSONL
- API format: **unified internal format**, each client converts to its own API format
- Context budget: tool messages count toward contextTokens; when tools sent, doc ratio drops from 65% to 50% (more room for tool interaction)
- Tool result cap: 3000 chars per result (truncated if exceeded)

### Type & Data Structure

- [ ] `src/lib/types.ts` — New shared types: `ToolCall`, `ToolDefinition`
- [ ] `llmClient.ts` — Extend `ChatMessage` (add `"tool"` role, `tool_calls`, `tool_call_id`, `name`), `ChatResult` (add `toolCalls`, `finishReason`), `LLMClient.chat()` (add `options.tools`)
- [ ] `chatStore.ts` — Extend `Message` (add `"tool"` role, `toolCalls`, `toolCallId`, `toolName`)
- [ ] `chatPersistence.ts` — Deserialize new fields (backwards compatible, missing → undefined)

### Tool Definitions & Execution (`src/lib/tools.ts` — new file)

- [ ] `outline()` — Return heading tree with hierarchy + line ranges (e.g. `2. Methods (L24-89)`)
- [ ] `grep(pattern)` — Search with regex, return matching lines + line numbers (max 50)
- [ ] `read_lines(start, end)` — Read line range, 1-indexed, max 200 lines, auto-clamp
- [ ] `read_section(heading)` — Read content under heading until same/higher level heading
- [ ] `executeTool(name, args, docContent)` — Route to tool, truncate result to 3000 chars
- [ ] `toolDefinitions` — Export JSON Schema definitions for all 4 tools

### LLM Client Changes

- [ ] `OpenAICompatibleClient` — Add `tools` to request body, parse `delta.tool_calls` + `finish_reason: "tool_calls"`, convert internal messages → OpenAI format
- [ ] `ClaudeCompatibleClient` — Add `tools` in Claude format, parse `content_block_start(tool_use)` + `input_json_delta` + `stop_reason: "tool_use"`, convert internal messages → Claude format (tool_use content blocks + tool_result user messages)
- [ ] `MockClient` — No changes (signature adapts to new interface but ignores tools)

### System Prompt Changes

- [ ] `buildSystemPrompt` returns `{ prompt, docIncluded }` instead of string
- [ ] New param `toolsAvailable: boolean` — when true, doc ratio = 50% (else 65%)
- [ ] When document truncated: replace truncation hint with tool-aware instructions + outline output (with line ranges)
- [ ] When document not truncated or empty: existing behavior, no tools mentioned

### Chat Flow — Tool Execution Loop

- [ ] `chatStore` — New actions: `addToolCallsToLastMessage`, `addToolMessage`; modify `getContext` to include `tool` messages; modify `addMessage` to add `tool` messages to contextMap
- [ ] `AISidebar handleSend` — Loop: `client.chat(tools)` → if `tool_calls`, execute tools → feed results back → repeat; max 10 rounds; only final text streamed via onChunk
- [ ] Each round's promptTokens accumulated via recordUsage → UsageBadge reflects real cost
- [ ] Cancellation: check `signal.aborted` before each tool execution and each loop iteration

### UI Changes

- [ ] `toolCallStatus` state — show spinner + description during tool execution (e.g. "🔍 正在搜索: Introduction")
- [ ] Assistant with empty content + toolCalls → render only `🔧 使用了 outline, read_section` summary line (no bubble)
- [ ] Assistant with content + toolCalls → markdown content + `🔧 使用了 ...` at bottom
- [ ] Tool messages → collapsible block: collapsed shows `▶ toolName(args) → N 行结果`, expanded shows `<pre>` content
- [ ] AISidebar.css — styles for tool-status, tool-result, tool-calls-summary

### Error Handling

- [ ] Unknown tool → return `"Unknown tool: {name}"` as tool result
- [ ] Invalid arguments / regex → return descriptive error message
- [ ] read_lines out of range → auto-clamp
- [ ] read_section not found → return available headings list
- [ ] Max 10 rounds → append hint to assistant, stop loop
- [ ] Tool result too long → truncate to 3000 chars

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

### Skill 市场与 Skill 管理

- [ ] Skill 定义规范（名称、描述、图标、system prompt 模板、工具权限声明）
- [ ] Skill 管理界面（安装、卸载、启用/禁用、配置）
- [ ] Skill 市场（浏览、搜索、一键安装；支持本地 skill + 远程仓库）
- [ ] Skill 运行时（加载 skill 的 system prompt + 工具集，按 skill 限定可用工具范围）
- [ ] Skill 对话模式（选择 skill 后进入专属对话，独立上下文）
- [ ] 内置 skill 示例（翻译助手、代码审查、文档润色等）
- [ ] 社区 skill 分享（GitHub 仓库作为 skill 源，约定目录结构）
