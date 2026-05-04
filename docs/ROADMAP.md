# MoFlow Roadmap

## Phase 1 — Current (v0.x)

Core editor and AI chat functionality.

### Editor

- [x] Frameless window with custom title bar
- [x] Multi-tab with auto-save and stable tabId (`session.json`)
- [x] Rich Markdown: GFM, KaTeX math, Prism code highlighting
- [x] Light/dark theme with dynamic CSS generation
- [x] HTML and PDF export
- [x] Status bar (word count, cursor position, file info)
- [x] Toolbar and block handle
- [x] Dynamic FS scope (`allow_paths` Rust command)

### AI Chat

- [x] AI sidebar with multi-provider support (OpenAI, Claude, Mock)
- [x] Chat history persisted as JSONL per tab (`{appDataDir}/chat/{tabId}.jsonl`)
- [x] Context management: `contextMap` separate from `messagesMap`
- [x] `/compact` command: summarize conversation history, reset context
- [x] Auto-compact: triggers when `contextTokens > maxContext * 0.8`
- [x] Dynamic `buildSystemPrompt` using model's actual `maxContext` (65% doc, 35% conversation)
- [x] Usage badge: context tokens, usage %, cumulative total tokens, cumulative cost
- [x] Damaged JSONL repair: best-effort read, rename-based file replacement
- [x] Selection AI panel (translate, polish, explain, custom prompt)
- [x] Slash command menu (`/compact`, `/new`)

### i18n

- [x] Simple `t(zh, en)` per-file based on `navigator.language`

---

## Phase 2 — Tool-Calling & Document Exploration

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

## Phase 3 — Enhanced Features (Planned)

Longer-term improvements and polish.

### Chat Enhancements

- [ ] Chat history search
- [ ] Multi-file context (reference other open documents)
- [ ] Conversation export (Markdown, JSON)
- [ ] Custom system prompt templates

### Editor Enhancements

- [ ] Image upload and management
- [ ] Outline / table of contents sidebar
- [ ] Find and replace
- [ ] Vim keybindings mode
- [ ] Mermaid diagram rendering

### Platform

- [ ] macOS support (WebKit2GTK → WebKit, icon adaptation)
- [ ] Linux support
- [ ] Auto-update mechanism
- [ ] Plugin system architecture

### i18n Proper

- [ ] Migrate from `t(zh, en)` to proper i18n library (e.g. react-i18next)
- [ ] Extract all strings to locale files
- [ ] Runtime language switching
- [ ] Support more languages (Japanese, Korean, etc.)
