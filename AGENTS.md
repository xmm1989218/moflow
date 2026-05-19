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

**Before releasing a new version:**
- Run `bun test` — regression test, all must pass
- Update `CHANGELOG.md` — add new version section with New Features / Improvements / Bug Fixes
- Update `README.md` — check if new features need to be added to the Features list
- Update `AGENTS.md` — check if Architecture Notes or Project Structure descriptions need updating
- Update `CONTRIBUTING.md` — check if release process or development workflow has changed

## Project Structure

```
src/                    # Frontend (React + TypeScript)
  components/
    AISidebar/          # AI chat sidebar (doCompact, auto-compact, UsageBadge, tracer instrumentation)
                          AISidebar.css — sidebar layout + chat bubble + callout + question bar styles
                          MessageContent.css — Markdown element selectors (retained)
                          ContextView.tsx — context inspection panel (statistics, cached tokens, total tokens, breakdown, raw messages)
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
                          Keyframes, animations, shadows, scrollbar styles
  stores/
    appStore.ts         # Re-exports from tabStore, themeStore, etc.
    chatStore.ts        # AI chat state (streamingContentMap, contextMap, inputHistoryMap, cachedTokensMap, cleanupIncompleteToolCalls)
    permissionStore.ts  # Session permission rules (per-chatKey, alwaysAllow cascade, session aiMode)
    skillStore.ts       # Skill discovery, remote registry, install/update/uninstall
    aiSelectionStore.ts # Selection AI panel state
    searchStore.ts      # Find & replace state (per-tab editorViewMap)
    sessionStore.ts     # Session persistence (workspaceRoot)
    tabStore.ts         # File tabs, workspaceRoot, getChatKey, closeWorkspace
    themeStore.ts       # App/editor theme, AI config, sidebar, settings tab, leftPanelTab, language, aiMode, shortcutOverrides, enableTrace
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
    chatPersistence.ts  # JSONL chat history (chats/{safeFileName}/messages.jsonl, safeFileName exported, clearChat, removeChat, migrateOldChatDir, appendTraceEvent, clearTrace)
    inputHistory.ts     # Per-session input history (loadInputHistory/saveInputHistory/appendInputHistory, 200 max, dedup)
    contextBuilder.ts   # System prompt builder (TOOLS_GUIDE replaces WS_FILE_TOOLS/DOC_FILE_TOOLS)
    fileOps.ts          # File read/write/open folder via Tauri FS plugin
    imageManager.ts     # Image save/resolve (saveImageToFile, resolveImagePath)
    modelInfo.ts        # Model pricing, maxContext, calculateCost, formatCost
    llmClient.ts        # OpenAI/Claude/Mock LLM clients (streaming + tool-calling, Claude dynamic max_tokens, ChatUsage.cachedTokens, ChatResult.ttfbMs/chunkCount)
    shortcuts.ts        # Centralized shortcut registry (defaultShortcuts, overrides, getShortcutDisplay, getShortcutLabel, findConflict, parseKeyEvent)
    settings.ts         # App settings persistence (proxyUrl derived proxy state, permissions, aiMode, shortcutOverrides, enableTrace)
    exportHtml.ts       # HTML/PDF export logic (image base64 embedding)
    themeCSS.ts         # Dynamic theme CSS generation
    permission.ts       # Permission engine (wildcard matching, evaluateWithSession, generateAlwaysPattern)
    tools.ts            # AI tool definitions + execution (outline, read, readSection, grep, find, glob, ls, webfetch, write, edit, question, skill, runSkillScript) — descriptions hardcoded English, no i18n
    skillManager.ts     # Skill discovery, SKILL.md parsing, script execution (cwd support)
    tracer.ts           # Tracer + NoOpTracer + createTracer factory (JSONL trace output, zero overhead when disabled)
    traceTypes.ts       # TraceSpan, TraceStartEvent, TraceSpanEvent, TraceEndEvent types
    types.ts            # Shared types (ToolCall, ToolDefinition, ChatMessage, SkillMeta)
    updater.ts          # Auto-update with proxy support
  App.tsx               # Root component
  main.tsx              # Entry point

src-tauri/              # Backend (Rust + Tauri)
  src/lib.rs            # Commands (toggle_devtools, export_pdf, allow_paths, webfetch, set_proxy, cancel_requests, execute_script, fetch_skill_registry), ProxyState, CancelState, icon fix
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
- Tailwind CSS utility classes for all component styling (no CSS modules, no separate CSS files for components)
- Only `Editor.css` (ProseMirror/Crepe/CodeMirror DOM overrides) and `MessageContent.css` (Markdown element selectors) retain CSS files — these cannot be replaced by Tailwind
- CSS custom properties (`--ui-*`, `--moflow-*`) defined per theme in `index.css`, registered in `@theme` block for Tailwind namespace (e.g. `bg-ui-bg`, `text-moflow-text`)
- Zustand for state management
- Tauri plugins (dialog, fs) for native operations
- `settings.json` keys must use camelCase (e.g. `externalPath`, `runSkillScript`, `maxToolRounds`), not snake_case

## Architecture Notes

- The window is frameless (`decorations: false`) with a custom TitleBar component
- Multi-tab support with auto-save per tab, stable tabId persisted in `session.json`
- Export supports HTML (frontend) and PDF (Rust backend via WebView2 PrintToPdf API)
- Windows taskbar icon fix: `fix_taskbar_icon()` in `lib.rs` uses Win32 `LoadImageW` + `SendMessageW(WM_SETICON)` to set both ICON_SMALL and ICON_BIG from the EXE embedded resource (ID 32512)
- Dynamic FS scope: Rust `allow_paths` command + `fs_scope().allow_file()` instead of wildcard scope
- Chat history persisted as JSONL per chat: `{appDataDir}/chats/{safeFileName}/messages.jsonl` + `input_history.json` per session directory
- Chat key dual-mode: workspace → `"dir:" + normalized path` (one chat per workspace, survives tab switch/close); single-file → `tabId` (deleted on tab close)
- `promptTokens` persisted on assistant messages in JSONL — `contextTokensMap` restored on restart via `getContext()` reading last assistant's `promptTokens`
- Assistant messages only written to JSONL when content is complete (one-shot `addMessage` + `appendMessage`); streaming content stored in `streamingContentMap` (temporary, not persisted)
- `cleanupIncompleteToolCalls` — appends "Tool call interrupted" error results for toolCalls missing corresponding tool results; called in `finally` after abort and in `loadChatHistory`
- `stopGeneration` does NOT set `isStreaming=false` — only `finally` blocks control it, preventing race conditions
- `cancel_requests` Rust command cancels in-flight webfetch via `CancellationToken` + `tokio::select!` for millisecond-level abort
- Proxy: `proxyUrl` (non-empty = enabled) stored in settings; Rust `ProxyState` synced via `set_proxy` command; WebView2 proxy set at window creation (requires restart); webfetch/export_pdf use proxy immediately
- `contextMap` (LLM context) is separate from `messagesMap` (display); `contextStart` derived from last `/compact` position
- `/compact` appends divider message + AI summary; auto-compact triggers when `contextTokens > maxContext * 0.8`
- `buildSystemPrompt` uses model's actual `maxContext` (not hardcoded); workspace mode: filename label + switch-file note; no-workspace mode: unchanged; tool descriptions only in API `tools` parameter (not duplicated in system prompt)
- Damaged JSONL lines are skipped on load; if any corruption detected, a repair file is written and renamed to replace the original (best-effort)
- Usage badge shows: context tokens, usage %, cumulative total tokens, cumulative cost
- `completionTokensMap`, `totalTokensMap`, `costMap`, `cachedTokensMap` are memory-only (reset on restart)
- `promptTokens` persisted on assistant messages in JSONL — `contextTokensMap` restored on restart via `getContext()` reading last assistant's `promptTokens`
- i18n: `src/i18n/core.ts` exports `t(key, params?)`, `isZh()`, `setLanguage()`, `resolveLanguage()`; `src/i18n/useT.ts` exports `useT()` hook for React reactivity; `src/i18n/index.tsx` exports `I18nProvider`; 4 locale files in `src/i18n/locales/`; dot-notation keys (e.g. `"common.confirm"`, `"ai.send"`)
- **IMPORTANT**: All React components that call `t()` must also call `useT()` to re-render on language change; `t()` from `core.ts` is a module-level function with no React reactivity
- Tool definitions use factory functions (e.g. `makeOutlineTool()`) but descriptions are hardcoded English strings (not i18n) — LLM prompts should always be English
- Tool error messages in `tools.ts` are also hardcoded English (not i18n) — they are only consumed by the LLM, not displayed to users
- Settings Tab is a special tab (not a file tab), controlled by `showSettingsTab`/`settingsTabActive` in themeStore
- Active file tab background uses editor theme (`--moflow-bg`/`--moflow-accent`), settings tab uses app theme (`--ui-*` vars)
- `closeWorkspace` only closes workspace-related tabs (files under workspaceRoot), preserves other tabs; returns `false` if user cancels unsaved dialog
- Opening a new directory auto-closes current workspace first (with unsaved confirm)
- Shortcuts centralized in `src/lib/shortcuts.ts`, platform-aware display (Ctrl vs ⌘); user overrides stored in `shortcutOverrides` (settings.json), applied via `applyShortcutOverrides()`; App.tsx uses dynamic matching via `getAllShortcuts()` instead of hardcoded if-else
- AI mode (Plan/Build): `aiMode` stored in settings + `sessionAiModeMap` in permissionStore for per-session override; Plan mode injects deny session rules for `edit` + `runSkillScript` + adds `<mode>plan</mode>` to system prompt (double guarantee); Build mode is default (all ask); AISidebar header toggle + Tab key switch (sidebar-only, textarea not focused)
- Shortcuts section in Settings Panel: `ShortcutsSection` component with key capture UI, conflict detection, per-item reset, reset all
- 13 AI tools: outline/read/readSection/grep/find/glob/ls/webfetch/write/edit/question/skill/runSkillScript; `getToolDefinitions(needsDocTools, workspaceRoot, activeFilePath)` combines by mode
- Permission system: `checkPathAccess()` replaces `isPathAllowed()` — workspace-internal paths auto-allow, workspace-external paths evaluate via permission engine (session rules > global rules > default `ask`); `allowFsScope()` extends Tauri FS scope on allow
- `executeTool` signature: `(name, args, signal, ctx, onPermission?)` — `onPermission` callback shows PermissionBar UI for external path access
- Permission keys: `externalPath` (file read), `runSkillScript` (skill script), `edit` (file write); three actions: allow/ask/deny; wildcard patterns (`*`, `?`, `**`)
- Session rules stored per `chatKey` in `permissionStore`; `/new` and tab/workspace close clear session rules
- Theme variables include `--moflow-warn`/`--moflow-warn-text` per editor theme (for PermissionBar "always allow" button)
- `runSkillScript` script param requires `skillName/scriptName` format (e.g. `markdown-to-ppt/convert.js`); `executeSkillScript` accepts `cwd` param (activeFile dir > workspaceRoot); bun resolves `node_modules` from script's directory regardless of cwd
- `toolWrite` returns `"File written successfully."`, `toolEdit` returns `"Edit applied successfully."` — minimal results to LLM; UI `EditToolResult` builds diff display from `item.info.args`
- Tool outputs wrapped in XML tags (`<file>`, `<grep>`, `<outline>`, `<find>`, `<glob>`, `<ls>`) following opencode's approach; line number format stays `N: ` (not opencode's `    N|`)
- Error messages shown as `|?` (red callout), warnings as `|!` (yellow callout)
- Question tool: `makeQuestionTool()` with `questions[]` array; wizard-style QuestionBar; question tool does NOT count toward `maxToolRounds`; intercepted via `pendingQuestion` state + `resolveQuestionRef` Promise (same pattern as PermissionBar)
- Input history: `inputHistoryMap` in `chatStore`; `/new` clears messages but preserves input history; session directory deletion only on session destroy (close tab/workspace)
- `chatStore` is the sole frontend entry point for chat data — no component imports `chatPersistence` or `inputHistory` directly
- Trace: `createTracer(chatKey, input, model)` returns `TracerHandle`; writes JSONL to `chats/{safeFileName}/trace.jsonl`; NoOpTracer when `enableTrace=false`; `traceStatus` tracked in handleSend for abort/error; tracer.endTrace in finally block
- `ChatResult.ttfbMs` / `chunkCount` tracked in OpenAI and Claude streaming clients; `ChatUsage.cachedTokens` parsed from OpenAI `prompt_tokens_details.cached_tokens`
- Selection AI: `getSelectionMarkdown(ctx, view)` serializes ProseMirror selection to Markdown via `serializerCtx` (preserves bold, links, code, math, lists); translate uses empty system prompt (no docContent), explain/rewrite keep full document context
