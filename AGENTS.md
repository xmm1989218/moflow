# AGENTS.md

## Project Overview

MoFlow is a desktop Markdown editor built with Tauri v2 + React + TypeScript + Vite. It uses Milkdown as the editor engine and Tailwind CSS v4 for styling.

## Tech Stack

- **Frontend**: React 19, TypeScript 6, Vite 8, Tailwind CSS 4
- **Editor**: Milkdown 7 (with GFM, math, prism, listener plugins)
- **State**: Zustand
- **Backend**: Tauri 2 (Rust), WebView2 on Windows
- **Package Manager**: bun (frontend), cargo (backend)

## Commands

| Command | Description |
|---|---|
| `bun dev` | Start Vite dev server |
| `bun run build` | Type-check and build frontend |
| `bun run lint` | Run ESLint |
| `bun run tauri dev` | Start Tauri dev mode (frontend + backend) |
| `bun run tauri build` | Build production Tauri app |

**Always run after code changes:**
- `bun run lint` — ensure no lint errors
- `tsc -b` — ensure no TypeScript errors
- `cargo build` (in `src-tauri/`) — ensure Rust compiles

**After completing a ROADMAP task:**
- Check off the corresponding item in `docs/ROADMAP.md` (`- [ ]` → `- [x]`)
- Add ✅ to the version heading when all items in a version are done

## Project Structure

```
src/                    # Frontend (React + TypeScript)
  components/
    AISidebar/          # AI chat sidebar (doCompact, auto-compact, UsageBadge)
    ConfirmCloseDialog/ # Unsaved changes dialog
    Editor/             # Milkdown editor wrapper + SelectionAIPanel
    HamburgerMenu/      # Hamburger menu
    SettingsPanel/      # Settings tab (appearance, AI, proxy, about)
    StatusBar/          # Bottom status bar
    TabBar/             # Tab management (file tabs + settings tab)
    TitleBar/           # Custom frameless title bar (gear button)
    Toolbar/            # Formatting toolbar
  stores/
    appStore.ts         # Re-exports from tabStore, themeStore, etc.
    chatStore.ts        # AI chat state (streamingContentMap, contextMap, cleanupIncompleteToolCalls)
    aiConfigStore.ts    # AI provider/model config
    aiSelectionStore.ts # Selection AI panel state
    updateStore.ts      # Auto-update state
  lib/
    chatPersistence.ts  # JSONL chat history (append, load, repair corrupted)
    contextBuilder.ts   # System prompt builder (dynamic maxContext from model)
    modelInfo.ts        # Model pricing, maxContext, calculateCost, formatCost
    llmClient.ts        # OpenAI/Claude/Mock LLM clients (streaming)
    settings.ts         # App settings persistence (proxyUrl derived proxy state)
    exportHtml.ts       # HTML/PDF export logic
    fileOps.ts          # File read/write via Tauri FS plugin
    themeCSS.ts         # Dynamic theme CSS generation
    updater.ts          # Auto-update with proxy support
  App.tsx               # Root component
  main.tsx              # Entry point

src-tauri/              # Backend (Rust + Tauri)
  src/lib.rs            # Commands (toggle_devtools, export_pdf, allow_paths, webfetch, set_proxy, cancel_requests), ProxyState, CancelState, icon fix
  src/main.rs           # Entry point
  tauri.conf.json       # Tauri config (window: [] for manual creation, bundle, security)
  Cargo.toml            # Rust dependencies (reqwest+socks, tokio, tokio-util, htmd, url)
  icons/                # App icons (PNG, ICO, ICNS)
```

## Branching Convention

- Development branches for version releases must use `dev/v{version}` format (e.g. `dev/v0.4.0`), **never** `v{version}` — because release tags use `v{version}` format and same-name branches/tags cause `git push origin v0.4.0` ambiguity

## Code Style

- No comments unless explicitly requested
- Use existing libraries and patterns from the codebase
- Tailwind CSS classes for styling (no CSS modules)
- Zustand for state management
- Tauri plugins (dialog, fs) for native operations

## Architecture Notes

- The window is frameless (`decorations: false`) with a custom TitleBar component
- Multi-tab support with auto-save per tab, stable tabId persisted in `session.json`
- Export supports HTML (frontend) and PDF (Rust backend via WebView2 PrintToPdf API)
- Windows taskbar icon fix: `fix_taskbar_icon()` in `lib.rs` uses Win32 `LoadImageW` + `SendMessageW(WM_SETICON)` to set both ICON_SMALL and ICON_BIG from the EXE embedded resource (ID 32512)
- Dynamic FS scope: Rust `allow_paths` command + `fs_scope().allow_file()` instead of wildcard scope
- Chat history persisted as JSONL per tab: `{appDataDir}/chat/{tabId}.jsonl`
- `promptTokens` stored on assistant messages in JSONL (no separate meta file)
- Assistant messages only written to JSONL when content is complete (one-shot `addMessage` + `appendMessage`); streaming content stored in `streamingContentMap` (temporary, not persisted)
- `cleanupIncompleteToolCalls` — appends "Tool call interrupted" error results for toolCalls missing corresponding tool results; called in `finally` after abort and in `loadChatHistory`
- `stopGeneration` does NOT set `isStreaming=false` — only `finally` blocks control it, preventing race conditions
- `cancel_requests` Rust command cancels in-flight webfetch via `CancellationToken` + `tokio::select!` for millisecond-level abort
- Proxy: `proxyUrl` (non-empty = enabled) stored in settings; Rust `ProxyState` synced via `set_proxy` command; WebView2 proxy set at window creation (requires restart); webfetch/export_pdf use proxy immediately
- `contextMap` (LLM context) is separate from `messagesMap` (display); `contextStart` derived from last `/compact` position
- `/compact` appends divider message + AI summary; auto-compact triggers when `contextTokens > maxContext * 0.8`
- `buildSystemPrompt` uses model's actual `maxContext` (not hardcoded); reserves 35% for conversation history, 65% for document content
- Damaged JSONL lines are skipped on load; if any corruption detected, a repair file is written and renamed to replace the original (best-effort)
- Usage badge shows: context tokens, usage %, cumulative total tokens, cumulative cost
- `completionTokensMap`, `totalTokensMap`, `costMap` are memory-only (reset on restart)
- i18n: simple `t(zh, en)` function per file based on `navigator.language`, no i18n library
- Settings Tab is a special tab (not a file tab), controlled by `showSettingsTab`/`settingsTabActive` in themeStore
- Active file tab background uses editor theme (`--moflow-bg`/`--moflow-accent`), settings tab uses app theme (`--ui-*` vars)
