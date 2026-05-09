# Changelog

## v0.5.0 (2026-05-10)

### New Features

- **AI Rewrite (Doubao-style interaction)** — Toolbar button renamed to "AI 改写" / "AI Rewrite"
  - No original text display or result preview in panel — AI result auto-replaces selection and closes panel (Ctrl+Z to undo)
  - Multi-line auto-growing input (min 2 rows) with send button in bottom-right corner
  - Preset buttons: Polish / Expand / Shorten / Change Tone
  - Tone submenu: More professional / More academic / More formal / More casual / More literary / More internet-savvy
  - Preset buttons hidden when input has content; error state shows retry presets
  - `RewritePanel` as independent sub-component + `rewriteKey` in store for forced remount on each trigger, eliminating state leakage

- **AI Sidebar input redesign**
  - Input area minimum 2 rows, auto-growing, no scrollbar
  - Send button moved inside input (position: absolute, bottom-right)
  - During streaming: send icon transforms to stop icon (same position, click to stop)

- **Startup optimization** — Rust preload (`get_startup_data` 8ms vs ~130ms serial IPC), persistSession fire-and-forget (-522ms), remove rAF delay (-398ms), lazy chat loading per tab
- **Context Panel beautification** — Role-differentiated message rows with left color bar + role badge; tool messages as code blocks; ToolCallChip list for assistant; reasoning sub-details; compact summary highlight
- **Chat scroll optimization** — `isAtBottomRef` for sticky auto-scroll; scroll-to-bottom floating button; instant scroll during streaming, smooth for new messages; per-tab scroll position preservation

### Bug Fixes

- Fixed streaming auto-scroll never executing — `setTimeout(50ms)` was constantly cancelled by rapid `streamingContent` updates; replaced with `requestAnimationFrame` + `scrollTop = scrollHeight`
- Fixed tone menu clipped by panel — changed `overflow: hidden` to `overflow: visible` on panel; tone menu opens downward
- Fixed tone menu not closing after dismiss-and-reopen — `rewriteKey` increment forces `RewritePanel` remount, resetting all local state
- Fixed rewrite input persisting after dismiss — `RewritePanel` sub-component with `key={rewriteKey}` ensures clean state on each trigger

## v0.4.3 (2026-05-08)

### New Features

- **Instant tab switching** — Lazy-tab architecture: each tab gets its own persistent Milkdown editor instance; switching tabs toggles CSS visibility instead of destroying and recreating the editor (tab switch reduced from ~4s to near-instant)
  - Per-tab `getEditorHTMLMap` and `editorViewMap` for multi-editor support
  - Scroll position, cursor position, and undo history preserved per tab

### Bug Fixes

- Fixed `useState(() => sideEffect)` in AboutSection — replaced with `useEffect` to avoid running side effects during render
- Fixed Prism CSS double-theme conflict — removed `prism.css`, kept only `prism-tomorrow.css` for consistent dark theme
- Fixed compact failure saving partial content to `contextMap` — now discards incomplete results
- Fixed unrecognized `/` slash commands silently discarded — now shows an error message
- Fixed Rust UTF-8 slice panic — `text[..N]` replaced with `String::truncate` for safe truncation
- Fixed `activeContent` selector causing App re-render on every keystroke — auto-save now triggered by `activeFileId` + `isModified` only
- Fixed `ErrorBoundary resetKeys={[activeFileId]}` causing full editor remount on tab switch — removed `resetKeys`

### Improvements

- **Deleted redundant code**: `aiConfigStore` (5 files migrated to `themeStore`), `completionTokensMap`, `getMessages()`/`getStreamingContent()`/`clearContext()`, Vite boilerplate SVGs, 7 unused Milkdown dependencies + `@testing-library/react`, Rust deps `scraper`/`bytes`/`Win32_Graphics_Gdi`, `println!` → `log::` (13 places)
- **Frontend performance**: AISidebar 13 selectors merged with `useShallow`, `scrollIntoView` throttled to 50ms, `remarkPlugins`/`rehypePlugins` hoisted to module constants, ContextView heavy computations wrapped in `useMemo`, Editor selectors use `useShallow`
- **Rust performance**: 23 Regex compiled with `LazyLock`, `export_pdf` `mpsc::recv()` moved to `spawn_blocking`, `allow_paths` changed to sync fn
- **Code refactoring**: extracted `src/lib/i18n.ts` (16 files updated), merged `buildOutline`/`toolOutline` duplication, Rust `read_proxy_from_settings` simplified with `let-else`, `get_cancel_token` helper, `strip_patterns` generic helper
- Restored Vue feature flags in `vite.config.ts` — `@milkdown/crepe` depends on Vue at runtime

## v0.4.2 (2026-05-08)

### New Features

- Settings Tab — unified settings panel with monochrome SVG nav icons, Windows Terminal-inspired layout
  - Appearance: app theme (system/light/dark), editor theme, auto-save toggle, status bar toggle
  - AI: mode/provider/endpoint/token/model selection + test connection (migrated from AIConfigModal)
  - Proxy: dropdown (None/HTTP/HTTPS/SOCKS5) + address input + save, all on one row
  - About: MoFlow icon, version, copyright, check for updates
- Proxy support — HTTP/HTTPS/SOCKS5 proxy for AI requests and web content fetching
  - WebView2 proxy set at window creation via `proxy_url()` (requires restart)
  - `webfetch` and `export_pdf` read proxy from `ProxyState` managed state (immediate effect)
  - `updater.ts` passes proxy to `check()` for update checks
  - Environment variable fallback: `HTTPS_PROXY` / `HTTP_PROXY` / `ALL_PROXY`
- webfetch cancellation — `CancelState` + `CancellationToken` + `tokio::select!` for millisecond-level abort when user stops generation

### Bug Fixes

- Fixed proxy not working — Rust `SettingsJson` used snake_case (`proxy_enabled`/`proxy_url`) but `settings.json` stores camelCase (`proxyEnabled`/`proxyUrl`); added `#[serde(rename = "proxyUrl")]`
- Fixed proxy not syncing on startup — `initSession` now calls `invoke("set_proxy")` to sync Rust `ProxyState`
- Fixed duplicate React key error — root cause: `flushAssistantMessage` could write the same message ID to JSONL twice when user aborted during tool execution; eliminated by removing flush entirely
- Fixed incomplete context causing API 400 errors — assistant messages with `toolCalls` but missing tool results now get "Tool call interrupted" error results appended via `cleanupIncompleteToolCalls`
- Fixed stop button not truly stopping — `stopGeneration` no longer sets `isStreaming=false`; only the `finally` block does after async code completes, preventing users from sending new messages before the old request finishes
- Fixed webfetch taking up to 30s to cancel — `tokio::select!` drops the reqwest future immediately on cancel

### Improvements

- Chat persistence refactor — removed `flushAssistantMessage`, `appendToLastMessage`, `addToolCallsToLastMessage`, `addReasoningContentToLastMessage`; assistant messages now use `streamingContentMap` during streaming and are only added to `messagesMap` + JSONL when content is complete (one-shot `addMessage` + `appendMessage`)
- Removed `proxyEnabled` — proxy is now determined solely by `proxyUrl` being non-empty; `validate_proxy_url` logs warnings for invalid URLs
- `loadChatHistory` now calls `cleanupIncompleteToolCalls` after loading to fix incomplete data on disk (e.g. from crashes)
- Streaming cursor only shown on virtual `streamingContent` message, not on `messagesMap` entries
- Deleted unused `AIConfigModal.tsx`, `AboutDialog.tsx`, `.moflow-ai-config-btn` CSS, `aboutVisible` from `updateStore`

### Dependencies

- Added `tokio-util` (Rust) with `rt` feature for `CancellationToken`
- Added `tokio` (Rust) with `macros` feature for `tokio::select!`

## v0.4.1 (2026-05-07)

### New Features

- Context View panel — click UsageBadge to toggle between AI chat and context inspection
  - Statistics: token usage, tool list, cost
  - Context Breakdown: stacked bar chart with 4 color segments (system/user/assistant/tool) + legend
  - Raw Messages: collapsible `<details>` view of contextMap messages (role, id, toolName, toolCalls)
- webfetch enhancement — 3 format modes (markdown/text/html), LLM selects format via `format` parameter
  - Markdown mode: strip noise → strip class/style → html2md (Rust `htmd` crate)
  - Text mode: strip noise → strip class/style → strip all tags → plain text
  - HTML mode: strip script/style only → return HTML (preserves class/id/structure)
  - Block-level noise removal: nav/footer/aside/header/button/form/iframe/object/embed
  - Class/style attribute stripping (markdown/text modes, regex-based)
  - Auto image detection — MIME image → base64 `data:{mime};base64,{data}` returned, skip HTML parsing
  - Chrome UA spoofing + Accept header based on format priority
  - Cloudflare 403 retry — detect `cf-mitigated: challenge` header, retry with real UA

### Improvements

- Compact optimization — tail retention (last 2 user turns kept intact), tool output pruning, structured summary with `<previous-summary>` incremental update
  - `isCompactSummary` flag on Message to identify compact summary messages (replaces string matching)
  - `getContext()` rebuild logic: find last `/compact`, count N user turns backwards as tail, combine with messages after `/compact`
  - No tail copies written to JSONL — tail already exists in messagesMap; compact directly sets contextMap
- webfetch body limit increased from 100KB to 5MB (Rust), tool result cap from 6KB to 30KB (frontend)
- ContextView reactivity fix — Zustand selector replaces `getState()` for proper re-render on contextMap changes

### Dependencies

- Added `htmd` (Rust, Apache-2.0) for HTML to Markdown conversion
- Added `base64` (Rust) for image MIME → base64 encoding

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
