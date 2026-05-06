# Changelog

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
