# Changelog

## v0.4.0 (2026-05-07)

### New Features

- Tool-calling support — AI can now actively explore documents using tools instead of relying on truncated context
  - `outline()` — Get document heading tree with hierarchy and line ranges
  - `grep(pattern)` — Search document with regex, return matching lines with line numbers
  - `read_lines(start, end)` — Read a range of lines from the document
  - `read_section(heading)` — Read content under a specific heading
  - `webfetch(url)` — Fetch web page content via Rust backend (reqwest, no CORS issues)
- Reasoning content (thinking mode) — Store and pass back `reasoning_content` for DeepSeek v4 thinking mode; fixes 400 error when DeepSeek requires reasoning_content to be echoed back
- HTML noise stripping — webfetch automatically removes `<script>`, `<style>`, `<noscript>`, `<svg>`, `<link>`, HTML comments, and `<head>` blocks from fetched pages; Content-Type detection + content sniffing for reliable HTML identification
- Startup performance monitoring — Milestone markers logged to devtools console and Rust terminal (`rust-setup`, `react-mount`, `session-loaded`, `chat-loaded`, `editor-ready`, `window-shown`)
- Links in AI messages now open in system browser (tauri-plugin-opener)

### Bug Fixes

- Fixed DeepSeek v4 400 error "content or tool_calls must be set" — assistant messages with empty content now use `""` instead of `null` when no tool_calls present
- Fixed webfetch CORS failures — migrated from frontend `fetch()` to Rust reqwest backend (native HTTP, no CORS restrictions)
- Fixed `loadChatHistory` not restoring `contextTokens` — now calls `getContext()` after loading to restore context usage badge
- Fixed rehype-prism-plus crash on unknown language codes (e.g. `y`) — added `ignoreMissing: true`
- Fixed `convertToOpenAIMessages` not passing back `reasoning_content` for DeepSeek thinking mode

### Improvements

- LLM default timeout increased from 30s to 60s; webfetch timeout set to 30s
- Tool result cap increased from 3000 to 6144 chars (6KB)
- AI sidebar max width increased from 600px to 720px
- AI assistant messages no longer have max-width constraint (user messages keep 90% bubble width)
- Tool calls phase no longer displayed separately (spinner during execution, collapsible result after completion)
- Tool args display uses CSS `text-overflow: ellipsis` for adaptive truncation instead of fixed 50-char JS truncation
- B-layer tool strategy: document tools sent only when document is truncated; network tools (webfetch) always available
- Input auto-focuses after streaming ends
- Debug logging cleaned up (removed request body dump, reasoning_content delta, result summary)

### Dependencies

- Added `reqwest` (Rust) for native HTTP requests
- Added `regex` (Rust) for HTML noise stripping
- Added `tauri-plugin-opener` for opening URLs in system browser
- Added `@tauri-apps/plugin-opener` (JS)

## v0.3.7 (2026-05-06)

### New Features

- Find & Replace — press `Ctrl+F` to search, `Ctrl+H` to search and replace; supports regex, case-sensitive matching, replace current / replace all
- SelectionAI Follow-up — after explain/translate results appear, a follow-up input box is shown at the bottom of the panel; submitting a follow-up syncs the context (selected text + initial result + question) to the AI sidebar for continued conversation

### Bug Fixes

- Fixed SelectionAI "Ask" flow missing JSONL persistence — user messages and assistant responses from the "Ask" action are now properly persisted via `appendMessage` and `flushAssistantMessage`
- Fixed SelectionAI "Ask" flow not supporting abort — `setAbortController` is now called so the sidebar's "Stop Generation" button works for selection-initiated requests

### Improvements

- Added `prosemirror-search` plugin integration via Milkdown `$prose` wrapper
- Added `searchStore` for search state management with ProseMirror bridge (setQuery, findNext/Prev, replaceCurrent/All)
- Added `SearchBar` UI component positioned at editor top-right with debounce search and keyboard navigation
- Added search highlight styles for matched and currently selected matches
- Added Find and Replace items to HamburgerMenu with shortcut labels
- Added `lastResult` to `aiSelectionStore` for follow-up context preservation
- Added 20 unit tests (aiSelectionStore: 8, searchStore: 12)
- Added `.gitattributes` to enforce LF line endings across all platforms
- Updated `AGENTS.md` verification steps to include `tsc -b`

## v0.3.6 (2026-05-06)

### Bug Fixes

- Fixed SelectionAI "Ask" cost calculation — now uses `calculateCost()` instead of hardcoded `cost: 0`, and `getContext()` instead of raw message slicing
- Fixed OpenAI/Claude fallback usage estimation — `fullResponse` is now accumulated during streaming so `estimateTokens()` works when the `usage` block is missing
- Fixed auto-compact losing user messages — user input is now automatically sent after compact completes instead of being discarded
- Fixed untitled draft race condition — `clearTimeout` and `untitledTimers.delete` are now called in `closeTab` to prevent stale timer callbacks

### Improvements

- Added React ErrorBoundary at both global (`main.tsx`) and editor (`App.tsx`) levels with `resetKeys` support to prevent editor crashes from white-screening the entire app
- Unified i18n — 11 hardcoded Chinese strings across ConfirmCloseDialog, TabBar, App, and SelectionAIPanel now use the `t()` function
- Split `appStore` into `tabStore`, `sessionStore`, and `themeStore` — the original `appStore` now only retains closeDialog state and re-exports for backward compatibility
- Added test framework (Vitest + React Testing Library + jsdom) with 12 passing tests covering `modelInfo` and `toolbarTooltip`
- Added toolbar tooltips for all built-in formatting buttons and custom AI buttons — uses JS event delegation with `position:fixed` tooltip to bypass Crepe's `overflow:hidden`
- Added F8 keyboard shortcut to toggle AI sidebar, with shortcut hint shown in TitleBar tooltip
- Rewrote release script with 7-step flow — lint, build, test, and cargo check run before commit; version files are rolled back on failure
- Added pre-release checks (lint, build, test, cargo check) to GitHub Actions release workflow
- Added error logging for AI config test connection — both catch and empty-response cases now log via `console.error`
- Added `navigator` safety check in `toolbarTooltip.ts` for test environment compatibility

### New Features

- Toolbar tooltips — hover any toolbar button to see its name (built-in: Bold, Italic, Strikethrough, Inline Code, Math, Link; custom: Highlight, AI Explain, AI Translate, AI Ask)
- F8 shortcut — press F8 to toggle the AI assistant sidebar from anywhere in the editor
