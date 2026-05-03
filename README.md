# MoFlow

A minimalist desktop Markdown editor with a focus on writing experience.

Built with Tauri v2, React, TypeScript, and Milkdown.

## Features

- **Distraction-free editing** — Frameless window with custom title bar, clean UI
- **Rich Markdown** — GFM (tables, strikethrough, task lists), math (KaTeX), code highlighting (Prism)
- **Multi-tab** — Open and switch between multiple files in tabs with auto-save
- **Dual theme** — Light and dark themes with smooth switching
- **Export** — HTML and PDF export
- **AI Sidebar** — Integrated AI chat panel
- **Status bar** — Word count, cursor position, file info at a glance

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, TypeScript 6, Vite 8, Tailwind CSS 4 |
| Editor | Milkdown 7 (GFM, math, prism, listener) |
| State | Zustand |
| Backend | Tauri 2 (Rust), WebView2 (Windows) |

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) >= 18
- [Bun](https://bun.sh/)
- [Rust](https://www.rust-lang.org/tools/install) (with `cargo`)
- [Tauri Prerequisites](https://v2.tauri.app/start/prerequisites/)

### Install

```bash
bun install
```

### Development

```bash
bun run tauri dev
```

### Build

```bash
bun run tauri build
```

### Lint

```bash
bun run lint
```

## Project Structure

```
src/                    # Frontend (React + TypeScript)
  components/           # UI components
    Editor/             # Milkdown editor wrapper
    TitleBar/           # Custom frameless title bar
    TabBar/             # Tab management
    Toolbar/            # Formatting toolbar
    StatusBar/          # Bottom status bar
    AISidebar/          # AI chat sidebar
    HamburgerMenu/      # Hamburger menu
    ConfirmCloseDialog/ # Unsaved changes dialog
  stores/               # Zustand state stores
  lib/                  # Utilities (export, file ops, theme)
  App.tsx               # Root component
  main.tsx              # Entry point

src-tauri/              # Backend (Rust + Tauri)
  src/lib.rs            # Commands and window setup
  tauri.conf.json       # Tauri configuration
  icons/                # App icons
```

## License

MIT
