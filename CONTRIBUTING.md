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
  components/
    AISidebar/          # AI chat sidebar (doCompact, auto-compact, UsageBadge, tracer instrumentation)
                          AISidebar.css — sidebar layout + chat bubble + callout + question bar styles
                          MessageContent.css — Markdown element selectors (retained)
                          ContextView.tsx — context inspection panel
                          PermissionBar.tsx — inline permission consent bar (allow/always/deny)
                          QuestionBar.tsx — wizard-style question form (radio/checkbox/custom input)
    ConfirmCloseDialog/ # Unsaved changes dialog (Tailwind, no CSS file)
    Editor/             # Milkdown editor wrapper + SelectionAIPanel
                          Editor.css — ProseMirror/Crepe/CodeMirror DOM overrides (retained)
    FileTree/           # Workspace file tree (lazy-load, right-click menu, new/rename/delete)
    HamburgerMenu/      # Hamburger menu (Tailwind, no CSS file)
    OutlineSidebar/     # Outline tree + Files tab (dual-tab header, shared resize handle)
    SettingsPanel/      # Settings tab (appearance, AI, proxy, about) (Tailwind, no CSS file)
    StatusBar/          # Bottom status bar (Tailwind, no CSS file)
    TabBar/             # Tab management (file tabs + settings tab) (Tailwind, no CSS file)
    TitleBar/           # Custom frameless title bar (gear button) (Tailwind, no CSS file)
  index.css             # Global styles + @theme block (73 CSS vars → Tailwind namespace)
  stores/
    appStore.ts         # Re-exports from tabStore, themeStore, etc.
    chatStore.ts        # AI chat state (streamingContentMap, contextMap, inputHistoryMap, cleanupIncompleteToolCalls, newMessageId, addMessage(id?), undoArchiveMap, undoFromMessage)
    aiSelectionStore.ts # Selection AI panel state
    searchStore.ts      # Find & replace state (per-tab editorViewMap)
    sessionStore.ts     # Session persistence (workspaceRoot)
    tabStore.ts         # File tabs, workspaceRoot, getChatKey, closeWorkspace
    themeStore.ts       # App/editor theme, AI config, sidebar, settings tab, leftPanelTab, language
    permissionStore.ts  # Session permission rules (per-chatKey, alwaysAllow cascade)
    skillStore.ts       # Skill discovery, remote registry, install/update/uninstall
    updateStore.ts      # Auto-update state
  i18n/
    core.ts             # Core i18n utilities (t, isZh, getLocale, setLanguage, resolveLanguage)
    index.tsx           # I18nProvider component
    useT.ts             # useT() hook for React reactivity on language change
    locales/
      zh.ts             # Chinese locale (~273 keys)
      en.ts             # English locale (~273 keys, source of truth)
      ja.ts             # Japanese locale (AI-generated)
      ko.ts             # Korean locale (AI-generated)
  lib/
    chatPersistence.ts  # JSONL chat history (chatKey-based, safeFileName, append, load, repair, rewriteChat, backupChatForUndo)
    inputHistory.ts     # Per-session input history (loadInputHistory/saveInputHistory/appendInputHistory)
    contextBuilder.ts   # System prompt builder (workspaceRoot, activeFilePath, dynamic maxContext)
    modelInfo.ts        # Model pricing, maxContext, calculateCost, formatCost
    llmClient.ts        # OpenAI/Claude/Mock LLM clients (streaming + tool-calling)
    settings.ts         # App settings persistence (proxyUrl derived proxy state, permissions)
    exportHtml.ts       # HTML/PDF export logic (image base64 embedding)
    fileOps.ts          # File read/write/open folder via Tauri FS plugin
    imageManager.ts     # Image save/resolve (saveImageToFile, resolveImagePath)
    shortcuts.ts        # Centralized shortcut registry (getShortcutDisplay, getShortcutLabel)
    themeCSS.ts         # Dynamic theme CSS generation
    permission.ts       # Permission engine (wildcard matching, evaluateWithSession, generateAlwaysPattern)
    skillManager.ts     # Skill discovery, SKILL.md parsing, script execution
    tools.ts            # AI tool definitions + execution (outline, read, readSection, grep, find, glob, ls, webfetch, write, edit, question, skill, runSkillScript)
    undoManager.ts      # Undo primitives (commit/undo/restore) + UndoDeps DI
    snapshot.ts         # TypeScript invoke wrappers for 6 snapshot commands
    pathUtils.ts        # toPosix/posixDirname/posixBasename cross-platform path utilities
    types.ts            # Shared types (ToolCall, ToolDefinition, ChatMessage, SkillMeta)
    updater.ts          # Auto-update with proxy support
  App.tsx               # Root component
  main.tsx              # Entry point

src-tauri/              # Backend (Rust + Tauri)
  src/lib.rs            # Commands (toggle_devtools, export_pdf, allow_paths, webfetch, set_proxy, cancel_requests, execute_script, fetch_skill_registry)
  src/snapshot.rs       # Snapshot commands (snapshot_init/commit/checkout_files/restore/log/destroy) + 24 tests
  src/main.rs           # Entry point
  tauri.conf.json       # Tauri config (window: [] for manual creation, bundle, security)
  Cargo.toml            # Rust dependencies (reqwest+socks, tokio, tokio-util, htmd, url, git2)
  icons/                # App icons (PNG, ICO, ICNS)
```

## Release

### One-command release

```bash
bun run release x.y.z
```

This script (`scripts/release.mjs`) automates the entire release flow:

1. **Validate** — Checks version format, git branch (must be `master`), and clean working directory
2. **Sync version** — Updates `package.json`, `src-tauri/Cargo.toml`, and `src-tauri/tauri.conf.json`
3. **Commit bump** — Commits the version change (`chore: bump version to x.y.z`)
4. **Lint** — Runs `bun run lint`; rolls back the commit on failure
5. **Build** — Runs `bun run tauri build`; rolls back the commit on failure
6. **Collect artifacts** — Finds `.exe` and `.sig` in `src-tauri/target/release/bundle/nsis/`
7. **Generate `latest.json`** — Auto-generates with version, signature, download URL, and timestamp
8. **Publish** — Creates git tag `vx.y.z`, pushes commit + tag, creates GitHub Release with all artifacts

> **Signing**: The release script automatically reads the signing private key from `~/.tauri/moflow.key` (based on `productName` in `tauri.conf.json`). If the key file doesn't exist, the script will error with instructions on how to generate one. Alternatively, you can set the `TAURI_SIGNING_PRIVATE_KEY` environment variable explicitly. If your key was generated with a password, also set `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`.
>
> The public key is already configured in `tauri.conf.json`. See [Tauri Updater Signing](https://v2.tauri.app/plugin/updater/#signing) for details.

### Manual version sync (without release)

If you only need to sync version numbers across config files without building:

```bash
bun run sync-version x.y.z
```

### Manual release (without script)

If you prefer to do each step manually:

1. **Sync version** — Update `version` in `package.json`, `src-tauri/Cargo.toml`, and `src-tauri/tauri.conf.json`
2. **Commit** — `git commit -m "chore: bump version to x.y.z"`
3. **Set signing env vars** — `TAURI_SIGNING_PRIVATE_KEY` and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`
4. **Build** — `bun run tauri build`
5. **Collect artifacts** from `src-tauri/target/release/bundle/nsis/`:
   - `MoFlow_x.y.z_x64-setup.exe` — NSIS installer
   - `MoFlow_x.y.z_x64-setup.exe.sig` — Update signature
6. **Create `latest.json`**:
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
7. **Create GitHub Release** (tag: `vx.y.z`), upload installer + `.sig` + `latest.json`
