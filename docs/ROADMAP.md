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

### Tool Definitions

- [ ] `grep(pattern: string)` — Search the document with regex, return matching lines with line numbers
- [ ] `read_lines(start: number, end: number)` — Read a range of lines from the document by line number
- [ ] `read_section(heading: string)` — Read content under a specific heading (until next heading of same or higher level)

### LLM Client Changes

- [ ] Add `tools` parameter to `client.chat()` call
- [ ] Parse model's `tool_call` response (OpenAI/Claude format)
- [ ] Implement tool execution loop: model returns tool_call → execute tool → feed result back as `tool` role message → model continues
- [ ] Stream final text reply only (not intermediate tool calls)

### System Prompt Changes

- [ ] When document is truncated, inform model about available tools
- [ ] Include document structure (headings) so model knows what sections exist
- [ ] Remove static truncation hint, replace with tool-aware instructions

### UI Changes

- [ ] Show tool-call activity in chat (e.g. "Searching document..." / "Reading section: Introduction...")
- [ ] Display tool results in a collapsible block
- [ ] Allow cancellation during tool execution loop

### Error Handling

- [ ] Handle invalid tool calls gracefully (unknown tool, bad parameters)
- [ ] Limit tool call rounds (e.g. max 10 iterations) to prevent infinite loops
- [ ] Timeout for individual tool execution

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
