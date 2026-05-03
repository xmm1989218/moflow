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
- `cargo build` (in `src-tauri/`) — ensure Rust compiles

## Project Structure

```
src/                    # Frontend (React + TypeScript)
  components/
    AISidebar/          # AI chat sidebar
    ConfirmCloseDialog/ # Unsaved changes dialog
    Editor/             # Milkdown editor wrapper
    HamburgerMenu/      # Hamburger menu
    StatusBar/          # Bottom status bar
    TabBar/             # Tab management
    TitleBar/           # Custom frameless title bar
    Toolbar/            # Formatting toolbar
  stores/
    appStore.ts         # App state (tabs, theme, file handling)
    chatStore.ts        # AI chat state
  lib/
    exportHtml.ts       # HTML/PDF export logic
    fileOps.ts          # File read/write via Tauri FS plugin
    themeCSS.ts         # Dynamic theme CSS generation
  App.tsx               # Root component
  main.tsx              # Entry point

src-tauri/              # Backend (Rust + Tauri)
  src/lib.rs            # Commands (toggle_devtools, export_pdf), icon fix
  src/main.rs           # Entry point
  tauri.conf.json       # Tauri config (window, bundle, security)
  Cargo.toml            # Rust dependencies
  icons/                # App icons (PNG, ICO, ICNS)
```

## Code Style

- No comments unless explicitly requested
- Use existing libraries and patterns from the codebase
- Tailwind CSS classes for styling (no CSS modules)
- Zustand for state management
- Tauri plugins (dialog, fs) for native operations

## Architecture Notes

- The window is frameless (`decorations: false`) with a custom TitleBar component
- Multi-tab support with auto-save per tab
- Export supports HTML (frontend) and PDF (Rust backend via WebView2 PrintToPdf API)
- Windows taskbar icon fix: `fix_taskbar_icon()` in `lib.rs` uses Win32 `LoadImageW` + `SendMessageW(WM_SETICON)` to set both ICON_SMALL and ICON_BIG from the EXE embedded resource (ID 32512)
