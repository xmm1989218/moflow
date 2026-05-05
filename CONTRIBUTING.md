# Contributing to MoFlow

[中文](./CONTRIBUTING.zh-CN.md) | English

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, TypeScript 6, Vite 8, Tailwind CSS 4 |
| Editor | Milkdown 7 (GFM, math, prism, listener) |
| State | Zustand |
| Backend | Tauri 2 (Rust), WebView2 (Windows) |
| Updater | tauri-plugin-updater, tauri-plugin-process |

## Prerequisites

- [Node.js](https://nodejs.org/) >= 18
- [Bun](https://bun.sh/)
- [Rust](https://www.rust-lang.org/tools/install) (with `cargo`)
- [Tauri Prerequisites](https://v2.tauri.app/start/prerequisites/)

## Setup

```bash
bun install
```

## Development

```bash
bun run tauri dev
```

## Build

```bash
bun run tauri build
```

> **Signing**: For production builds that support auto-update, set the environment variables:
>
> ```bash
> export TAURI_SIGNING_PRIVATE_KEY=<your-private-key>
> export TAURI_SIGNING_PRIVATE_KEY_PASSWORD=<your-password>
> ```
>
> The public key is already configured in `tauri.conf.json`. See [Tauri Updater Signing](https://v2.tauri.app/plugin/updater/#signing) for details.

## Lint

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
    AboutDialog/        # About dialog with update check
    UpdateDialog/       # Update notification toast (bottom-right)
  stores/               # Zustand state stores (app, chat, AI config, AI selection, update)
  lib/                  # Utilities (chat persistence, LLM client, context builder, export, theme, updater)
  App.tsx               # Root component
  main.tsx              # Entry point

src-tauri/              # Backend (Rust + Tauri)
  src/lib.rs            # Commands, plugin setup, and window management
  tauri.conf.json       # Tauri configuration (updater, bundle, security)
  icons/                # App icons
```

## Release

1. **Sync version** — Update `version` in `package.json`, `src-tauri/Cargo.toml`, and `src-tauri/tauri.conf.json`
2. **Set signing env vars** — `TAURI_SIGNING_PRIVATE_KEY` and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`
3. **Build** — `bun run tauri build`
4. **Collect artifacts** from `src-tauri/target/release/bundle/nsis/`:
   - `MoFlow_x.y.z_x64-setup.exe` — NSIS installer
   - `MoFlow_x.y.z_x64-setup.exe.sig` — Update signature
5. **Create `latest.json`**:
   ```json
   {
     "version": "x.y.z",
     "notes": "## v0.2.0\n- New features\n- Bug fixes",
     "pub_date": "2026-05-05T12:00:00Z",
     "platforms": {
       "windows-x86_64": {
         "signature": "<content of .sig file>",
         "url": "https://github.com/xmm1989218/moflow/releases/download/vx.y.z/MoFlow_x.y.z_x64-setup.exe"
       }
     }
   }
   ```
6. **Create GitHub Release** (tag: `vx.y.z`), upload installer + `.sig` + `latest.json`
