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

## Project Structure

```
src/                    # Frontend (React + TypeScript)
  components/
    AISidebar/          # AI chat sidebar (doCompact, auto-compact, UsageBadge)
    ConfirmCloseDialog/ # Unsaved changes dialog
    Editor/             # Milkdown editor wrapper + SelectionAIPanel
    HamburgerMenu/      # Hamburger menu
    StatusBar/          # Bottom status bar
    TabBar/             # Tab management
    TitleBar/           # Custom frameless title bar
    Toolbar/            # Formatting toolbar
  stores/
    appStore.ts         # App state (tabs, theme, file handling, stable tabId)
    chatStore.ts        # AI chat state (contextMap, usage tracking, compact)
    aiConfigStore.ts    # AI provider/model config
    aiSelectionStore.ts # Selection AI panel state
  lib/
    chatPersistence.ts  # JSONL chat history (append, load, repair corrupted)
    contextBuilder.ts   # System prompt builder (dynamic maxContext from model)
    modelInfo.ts        # Model pricing, maxContext, calculateCost, formatCost
    llmClient.ts        # OpenAI/Claude/Mock LLM clients (streaming)
    aiConfig.ts         # AI config persistence
    exportHtml.ts       # HTML/PDF export logic
    fileOps.ts          # File read/write via Tauri FS plugin
    themeCSS.ts         # Dynamic theme CSS generation
  App.tsx               # Root component
  main.tsx              # Entry point

src-tauri/              # Backend (Rust + Tauri)
  src/lib.rs            # Commands (toggle_devtools, export_pdf, allow_paths), icon fix
  src/main.rs           # Entry point
  tauri.conf.json       # Tauri config (window, bundle, security)
  Cargo.toml            # Rust dependencies
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
- `contextMap` (LLM context) is separate from `messagesMap` (display); `contextStart` derived from last `/compact` position
- `/compact` appends divider message + AI summary; auto-compact triggers when `contextTokens > maxContext * 0.8`
- `buildSystemPrompt` uses model's actual `maxContext` (not hardcoded); reserves 35% for conversation history, 65% for document content
- Damaged JSONL lines are skipped on load; if any corruption detected, a repair file is written and renamed to replace the original (best-effort)
- Usage badge shows: context tokens, usage %, cumulative total tokens, cumulative cost
- `completionTokensMap`, `totalTokensMap`, `costMap` are memory-only (reset on restart)
- i18n: simple `t(zh, en)` function per file based on `navigator.language`, no i18n library
- Tool-calling support is planned for phase 2 (grep/read_section tools for document exploration)
