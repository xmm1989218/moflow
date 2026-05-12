# Changelog

## v0.8.0 (2026-05-12)

### New Features

- **Lightweight i18n system** — Self-built i18n with no external dependencies, supporting 4 languages with runtime switching
  - `I18nProvider` + `useT()` hook for React reactivity; `t()` / `isZh()` / `getLocale()` for non-React code
  - 4 locale files: `zh.ts` (简体中文), `en.ts` (English), `ja.ts` (日本語), `ko.ts` (한국어) — ~318 keys each
  - Migrated all 157 `t()` call sites, 20 `des()` call sites, and 7 data-driven translation structures from `t("zh", "en")` pattern to `t("key")` pattern
  - Language setting persisted in settings; language dropdown in Settings → Appearance (系统默认 / 简体中文 / English / 日本語 / 한국어)
  - Language switch takes effect immediately without restart
  - `useT()` hook uses `useSyncExternalStore` to trigger re-render on language change
  - `toolbarTooltipMap` → `getToolbarTooltipMap()`, tool definitions → factory functions — all module-level `t()` calls converted to lazy evaluation
  - README translations: `README.ja.md`, `README.ko.md`

- **Accessibility (a11y) improvements** — WAI-ARIA patterns, keyboard navigation, and focus management across all components
  - **ConfirmCloseDialog**: `role="dialog"`, `aria-modal`, focus trap (Tab/Shift+Tab cycle), auto-focus on open, focus restore on close
  - **UpdateDialog**: `role="status"` / `role="alert"`, `aria-live="polite"`, Escape to dismiss "available" state
  - **TabBar**: WAI-ARIA Tabs pattern (`role="tablist"`, `role="tab"`, `aria-selected`), roving tabIndex, Arrow/Home/End keyboard nav
  - **HamburgerMenu**: `role="menu"`, `role="menuitem"`, Arrow Up/Down nav, Enter/Space select, Escape close, focus management
  - **FileTree**: `role="tree"`, `role="treeitem"`, `aria-expanded`, Arrow/Enter keyboard nav; context menu `role="menu"`/`role="menuitem"` with keyboard nav
  - **OutlineSidebar**: `role="tree"`, `role="treeitem"`, keyboard navigation
  - **AISidebar**: `role="log"`, `aria-live="polite"` on messages, `aria-expanded` on details, `aria-label` on scroll button
  - **TitleBar/StatusBar**: `aria-label` on all icon-only buttons, `aria-pressed` on toggles
  - **SettingsPanel**: `aria-pressed` on toggles, `htmlFor`/`id` on labels, `aria-label` on nav
  - **Global `:focus-visible`** ring using `--ui-accent` CSS variable

### Bug Fixes

- **Language switch not working** — `initLang()` in `core.ts` used `currentLang === "en"` as init check, which conflicted with user selecting English (would override back to `detectLanguage()`). Fixed by using `null` initial value with `ensureLang()` that only initializes once
- **Components not re-rendering on language change** — `t()` from `core.ts` is a module-level function with no React reactivity. Added `useT()` hook with `useSyncExternalStore` to subscribe to language changes
- **Module-level `t()` calls evaluated once** — `toolbarTooltipMap`, tool definitions, and `sections` array were evaluated at module init. Converted to factory functions / moved inside components

## v0.7.5 (2026-05-12)

### New Features

- **Source mode with CodeMirror 6** — Replaced textarea with CM6 full-doc editor providing markdown syntax highlighting, theme following WYSIWYG via CSS variables, no line numbers, wrapper-based scrollbar
- **Shared undo history** — Milkdown stays mounted (CSS hidden) instead of being destroyed on mode switch; CM6 history disabled, Ctrl+Z/Y routed to ProseMirror as the sole undo/redo engine; undo/redo writeback syncs CM6 via `skipHistoryRef`
- **Undo/Redo menu items** — Added Undo (Ctrl+Z) and Redo (Ctrl+Y) to HamburgerMenu; `editorActionMap` in tabStore for editor action encapsulation
- **`replaceAllNoHistory`** — Non-user edits (initial load, tab switch, undo/redo writeback) use `setMeta('addToHistory', false)` to avoid creating undo steps
- **Cursor & scroll preservation** — Save/restore ProseMirror selection and scrollTop on mode switch; skip cursor restore if content changed in source mode
- **Search highlights preserved** — editorView no longer destroyed, search decorations persist across mode switches

### Bug Fixes

- **Production build crash "g is not a function"** — Removed stale Vue.js `define` directives from vite.config.ts; added `await import("react/jsx-runtime")` Rolldown CJS interop workaround
- **Window not showing in production** — Moved `getCurrentWindow().show()` before init; added 5s Rust fallback thread
- **Removed ineffective dynamic imports** — Cleaned up cmLanguages (CSS/HTML/JS/JSX/TS/Markdown already statically imported by lang-markdown/lang-html)

## v0.7.0 (2026-05-12)

### New Features

- **Workspace & File Tree** — Open a folder as workspace with a browsable file tree in the left panel
  - `workspaceRoot` persisted in session; auto-restore on restart
  - OutlineSidebar dual-tab header (📁 Files / 📑 Outline), shared resize handle
  - FileTree: lazy-load directories, click to expand folders and open `.md`/`.txt` files
  - File icons: 📁 folder / 📝 md·txt / 🖼️ image / 📄 other; active file highlight
  - Right-click context menu: New File, New Folder, Rename, Delete
  - New File: inline input → `writeFile` → `allow_paths` → refresh tree → auto-open
  - New Folder: inline input → `mkdir` recursive → refresh tree
  - Rename: inline edit → `rename` → update tab filePath/fileName if open
  - Delete: confirm dialog → `remove` recursive → close tab if open
  - `closeWorkspace` only closes workspace-related tabs, preserves other tabs; returns `false` if user cancels unsaved dialog
  - Opening a new directory auto-closes current workspace first (with unsaved confirm)
  - HamburgerMenu "Open Folder" / "打开目录" menu item

- **Workspace-aware AI tools** — 8 tools with workspace mode providing project-level file exploration
  - `outline()`, `read_lines()`, `read_section()` — document-level tools (always available)
  - `grep()`, `find()`, `glob()`, `ls()`, `read_file()` — workspace-level tools (workspace mode only)
  - `webfetch()` — network tool (always available)
  - `isPathAllowed(path, workspaceRoot)` security boundary for all file-reading tools
  - `getToolDefinitions(needsDocTools, workspaceRoot)` combines tools by mode
  - Tool descriptions use `des(zh, en)` i18n based on `navigator.language`
  - grep/find/glob: exclude `.git`/`node_modules`/`assets`/`.`-prefixed, maxDepth=3

- **Chat key dual-mode** — workspace vs single-file chat lifecycle
  - Workspace: `chatKey = "dir:" + normalized path` — one chat per workspace, survives tab switch/close
  - Single-file: `chatKey = tabId` — deleted on tab close
  - `safeFileName(chatKey)` replaces `[:/\\]` with `_` for JSONL filenames
  - Workspace chat lifecycle: close tab → don't delete; close workspace → delete; switch workspace → delete old
  - `closeWorkspace` deletes workspace chat JSONL on success

- **Image management** — Paste images auto-saved to document's `./assets/` directory
  - `imageManager.ts` — `saveImageToFile()` saves to `{docDir}/assets/`, returns `./assets/{filename}`
  - `resolveImagePath()` resolves relative paths to absolute → `convertFileSrc()` for display
  - `proxyDomURL`: Markdown `./assets/xxx.png` → DOM `https://asset.localhost/...`
  - Paste detection: `clipboardData.items` image type → auto-upload
  - Unsaved document paste: toast "Please save the document first"
  - HTML export: asset URLs → file paths → base64 embedding
  - Remote images: CSP blocks `https://` img-src, paste remote URL shows "not supported" toast

- **Empty startup page** — When no file is open, shows keyboard shortcuts instead of placeholder
  - Workspace empty page shows directory name + "AI assistant available"
  - No-workspace page shows shortcut hints

- **Shortcuts registry** — Centralized in `src/lib/shortcuts.ts`
  - 15 shortcuts with `getShortcutDisplay()`/`getShortcutLabel()`
  - Platform-aware display (Ctrl vs ⌘)
  - HamburgerMenu and empty page use `getShortcutDisplay`

- **System prompt workspace mode** — `buildSystemPrompt` adapts to workspace vs single-file
  - Workspace mode: filename label + "may switch files" note + all 8 tools
  - No-workspace mode: document tools only + webfetch
  - `workspaceRoot` and `activeFileName` as explicit params

### Improvements

- `tabStore` — `getChatKey()`, `closeWorkspace()`, workspace-aware `closeTab`/`switchTab`/`setWorkspaceRoot`
- `restoreSession` no longer returns null when tabs empty — preserves `workspaceRoot`
- `App.tsx` — startup loads chat via `getChatKey()`, adds `workspaceRoot` to `allow_paths`
- `AISidebar.tsx` — ~30 chat key references changed from `activeFileId` to `chatKey`
- `fileOps.ts` — `openFolder` auto-closes workspace; `closeLastTab` no longer destroys window; `Ctrl+Shift+O` for open folder
- `chatPersistence.ts` — all params renamed `tabId` → `chatKey`; `safeFileName` for chat key normalization
- `contextBuilder.ts` — `buildSystemPrompt` with `workspaceRoot?` and `activeFileName?` params
- 134 tests across 12 files (chatPersistence, tabStore, contextBuilder, shortcuts, tools, chatStore, etc.)

### Removed

- `attachedFiles` / `FileMentionMenu` system — replaced by workspace-aware tools (AI explores files via grep/find/glob/ls/read instead of manual @-mention)
- `aiConfigStore` — all references migrated to `themeStore`

## v0.6.5 (2026-05-11)

### Improvements

- **CSS → Tailwind migration** — Migrated 11 component CSS files to Tailwind utility classes, reducing CSS from ~3751 lines (14 files) to ~1858 lines (4 files, -51%)
  - Added `@theme` block in `index.css` mapping 71 CSS custom properties to Tailwind namespace (`bg-ui-bg`, `text-moflow-text`, etc.)
  - Deleted 11 CSS files: ConfirmCloseDialog, TitleBar, HamburgerMenu, UpdateDialog, TabBar, SearchBar, OutlineSidebar, StatusBar, SlashCommandMenu, SelectionAIPanel, SettingsPanel
  - Trimmed AISidebar.css from 1037 → 591 lines (removed config modal dead code, duplicate rules, ctx variable definitions)
  - Consolidated 15 `@keyframes` + 4 `shadow-*` tokens into `index.css` `@theme` registration
  - Global cleanup: removed duplicate Preflight reset, moved `--moflow-ctx-*` to `index.css`, added `--ui-font-body` definition
  - Retained `Editor.css` (ProseMirror/Crepe/CodeMirror DOM overrides) and `MessageContent.css` (Markdown element selectors) — these cannot be replaced by Tailwind

### Bug Fixes

- Fixed ContextView infinite re-render — `?? []` in selector created new array reference every call; replaced with module-level `EMPTY_MESSAGES` constant

## v0.6.0 (2026-05-10)

### New Features

- **Outline Sidebar** — Left-side panel showing document heading tree
  - Recursive tree rendering with collapsible/expandable children
  - Click heading to scroll to position in editor
  - Active heading tracking — highlights current heading based on scroll position
  - Resizable width (180–360px, default 240px) with drag handle
  - F7 keyboard shortcut + TitleBar toggle button
  - Empty state when no headings found

- **Mermaid Diagram Rendering** — Inline rendering of Mermaid diagrams in code blocks
  - Flowcharts, sequence diagrams, class diagrams, Gantt charts, pie charts, state diagrams, etc.
  - Renders as SVG preview below code editor (using `codeBlockConfig.renderPreview` hook, same pattern as LaTeX)
  - Lazy-loaded mermaid v11 with async rendering and error fallback
  - Dark/light theme auto-detection based on editor theme
  - HTML export includes Mermaid SVG

### Bug Fixes

- Fixed closing active tab not loading content for the new active tab — `closeTab` now triggers `loadTabContent` and `loadChatHistory` for the replacement tab
- Fixed block handle (add/drag button) overlapping with Outline sidebar — repositioned handle inside ProseMirror left padding area, right-aligned next to content
- Fixed block handle appearing above TitleBar for blocks scrolled out of editor viewport — Floating UI middleware `clampToEditor` hides handle when outside visible area
- Fixed outline jump not working — scroll container corrected from `.milkdown` to `.moflow-editor-wrapper`, manual `wrapper.scrollTo()` replaces ProseMirror `scrollIntoView()`
- Fixed outline heading match failure — fuzzy matching with `startsWith` for headings containing inline marks
- Fixed test-markdown-spec.md rendering broken from section 2.6 onward — `~~~tilde fence also works~~~` parsed as unclosed tilde fence, reformatted to proper fenced code block

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
