# Changelog

## v1.3.11 (2026-06-25)

### Bug Fixes

- **macOS updater signing** — Changed bundle target from `dmg` to `app` so Tauri generates updater signatures and includes macOS ARM in `latest.json`
- **Removed macos-13 from CI matrix** — Intel macOS runner never executed and is not needed

## v1.3.10 (2026-06-25)

### New Features

- **Custom .md file icon** — NSIS installer now registers a custom icon for `.md` files (Python-style document page with MoFlow logo)
  - `bundle.resources` packages `md-file.ico` into the install directory
  - `installerHooks` (NSIS_HOOK_POSTINSTALL) overrides `DefaultIcon` registry key to point to the custom icon

## v1.3.9 (2026-06-25)

### Improvements

- **Updated .md file icon** — Redesigned file icon to match Python-style document page with folded corner and MoFlow logo at bottom-right
- **Removed unused mobile platform icons** — Deleted `android/` and `ios/` icon directories (35 files) since mobile platforms are not supported

## v1.3.8 (2026-06-24)

### New Features

- **Default .md file association** — MoFlow now registers as the default handler for `.md` files on all platforms
  - Windows: NSIS installer registers `.md` → MoFlow in registry
  - macOS: Info.plist `CFBundleDocumentTypes` includes public.source-code with MD extension
  - Linux: .desktop file MIME type updated for text/markdown
  - Double-clicking any `.md` file in the file explorer opens it directly in MoFlow
  - Handles both first-instance launch (app not running) and second-instance launch (app already running) via `tauri-plugin-single-instance`

### Improvements

- **Vite dev server** — Excluded `src-tauri/target/` from file watcher to prevent `EBUSY` errors during `bun run tauri dev`

## v1.3.7 (2026-06-04)

### New Features

- **macOS Apple Silicon (ARM64) support** — Separate aarch64 and x86_64 DMG builds
  - `macos-13` (Intel runner) builds x86_64 DMG for Intel Mac
  - `macos-latest` (ARM runner) builds aarch64 DMG for Apple Silicon (M1/M2/M3/M4)
  - Auto-update correctly distinguishes architecture via `latest.json` (`darwin-x86_64` / `darwin-aarch64`)

### Improvements

- **macOS minimum system version** raised from 10.15 to 11.0 (Big Sur) — required for Apple Silicon support
- **macOS auto-update fix** — previous releases had no `darwin-*` entries in `latest.json`, making auto-update non-functional on macOS since v1.1.0

## v1.3.6 (2026-05-26)

### Improvements

- **Release workflow** — Added `workflow_dispatch` trigger to release workflow for manual release activation

## v1.3.5 (2026-05-26)

### New Features

- **Toast notifications** — Global toast system (`toastStore` + `toast.success/error/info`) replacing local toast implementations across Settings, Proxy, and Skills sections; stacked bottom-right with progress bar and auto-dismiss
- **Prompt Caching** — Full support for OpenAI and Claude prompt caching with cost savings tracking
  - Claude: `cache_control: {"type": "ephemeral"}` on system prompt breakpoint; `cache_read_input_tokens` / `cache_creation_input_tokens` parsing
  - OpenAI: automatic caching (no manual breakpoint needed); `cached_tokens` from `prompt_tokens_details`
  - `calculateCost()` with fixed discount ratios (OpenAI cached 50% off, Claude cache read 90% off, Claude cache creation +25%)
  - UsageBadge multi-line display: Context / Cached (when applicable) / Total / Cost
  - ContextView shows cache savings
  - Sub-agent cache tracking

### Improvements

- **Icon unification** — Migrated ~50 inline SVGs/emojis/unicode to `lucide-react` icons across 18 components for consistent icon style
- **Copy button** — Added copy button to all AI chat messages (user + assistant) and tool results (read/edit/script/generic); copies tool call info + result content
- **Action buttons layout** — Message action buttons (undo + copy) moved below message content instead of inline
- **CSS class collision fix** — Renamed `.moflow-ai-action-btn` to `.moflow-ai-msg-actions` / `.moflow-ai-msg-action-btn` to prevent collision with input box buttons
- **Tool result copy button** — Hover to show, preserves layout space (`visibility: hidden` + `opacity: 0`), appears on hover of tool group
- **Message action hover** — Action buttons use `visibility: hidden` + `opacity: 0` instead of `display: none`, preserving layout space with smooth fade transition
- **WebView2 remote debugging** — Debug builds only (`#[cfg(debug_assertions)]`), `--remote-debugging-port=9222`
- i18n: added `ai.copy`/`ai.copied`/`ai.usage.cached`/`settings.skills.uninstalled` keys for en/zh/ja/ko

## v1.3.2 (2026-05-25)

### New Features

- **Skill environment variable declarations** — Skills can now declare required environment variables in SKILL.md frontmatter (`env` field), enabling scoped injection and UI guidance
  - `SkillEnvEntry` type: `{ name, description, required?, secret? }` — parsed from SKILL.md and registry.yaml
  - **Strict env injection**: only skill-declared variables are injected at runtime; undeclared user env vars are no longer passed to skill scripts
  - **Required variable check**: if a required env var is not configured, script execution is rejected with a clear error listing missing variables
  - **LLM context**: only configured env vars appear in `<available_env_vars>` (unconfigured ones are omitted); no `required` attribute exposed to LLM
  - **Skills section**: each skill card shows declared env variables with two-line layout (key + status on first line, description on second); configured (green), required (orange), optional (gray)
  - **Env vars section**: bottom "Recommended by skills" area lists required-but-unconfigured variables with one-click add; no skill association tags on existing entries

### Improvements

- Default environment variables (`MOFLOW_WORKSPACE_ROOT`, `MOFLOW_ACTIVE_FILE`) are always injected regardless of skill env declarations
- `resolveEnvVars` now accepts an `allowedNames` parameter — only declared variable placeholders are resolved in args strings
- i18n: added skill env keys (`envConfigured`, `envRequired`, `envOptional`, `recommended`, `addVar`) for en/zh/ja/ko

## v1.3.1 (2026-05-25)

### Bug Fixes

- **Windows skill script black console flash** — Added `CREATE_NO_WINDOW` (0x08000000) creation flag to `execute_script` and `check_bun_available` commands; macOS/Linux unaffected (conditional compilation)
- **`runSkillScript` double-quoted path arguments** — Replaced `args.split(/\s+/)` with `parseArgs()` that respects double-quote boundaries; quoted paths like `"C:\path\file.md"` are now passed as single arguments without quotes, preventing OS-level double-quoting
- **Search fails to match words split across mark boundaries** — Patched `prosemirror-search` `textContent()` via `resolve.alias` shim (`src/stubs/prosemirror-search.ts`); removed space injection around non-text child nodes that caused `"frame less"` instead of `"frameless"` when bold/italic marks split a word
- **Search highlights disappear after pressing Enter** — Added `.ProseMirror-active-search-match` CSS rule with orange highlight (was missing, causing the active match to appear unhighlighted); also added `markdownUpdated` guard to skip `updateTabContent` when content unchanged, preventing unnecessary document rebuilds that destroy search decorations
- **`e.key.toLowerCase()` crash** — Added `ovr.key` truthiness check in `getShortcut`/`getAllShortcuts` to guard against incomplete `shortcutOverrides` entries with undefined `key`
- **Settings page resets to Appearance after tab switch** — Persisted `settingsActiveSection` in `themeStore` instead of local `useState`
- **Env vars page shows empty despite saved settings** — Removed `draft` useState that initialized with stale `envVars` (empty on first mount before async `readSettings` completes); now reads directly from store
- **Env vars key column too narrow** — Increased key display and input width from 120px to 170px to fit keys like `WECHAT_APPSECRET`

### Tests

- **`parseArgs` unit tests** — 13 cases covering empty string, simple args, quoted paths, spaces inside quotes, unclosed quotes, real-world skill script arguments, etc.

## v1.3.0 (2026-05-22)

### New Features

- **Message Undo with Git Snapshot** — Undo any AI conversation round and roll back file changes to that point
  - Each conversation round creates a git snapshot (via git2-rs vendored-libgit2) before AI operations
  - Click the undo button on any user message to remove that message and all subsequent messages, restoring files to the pre-AI state
  - Workspace mode: full worktree restore (all tracked files + delete extra files created by AI)
  - Single-file mode: restore only the tracked file, preserving other files in the directory
  - Undo archive (反悔): before undoing, a "post:" snapshot is saved so you can restore back to the pre-undo state
  - Undo-restore bar: after undo, a yellow warning bar appears with a "Restore" button to reverse the undo

- **Cross-Platform Path Utilities** — `toPosix`, `posixDirname`, `posixBasename` functions replace all inline `.replace(/\\/g, "/")` across the codebase

- **Permission Auto-Allow for Undo-rollable Edits** — Workspace internal file edits and single-file current file edits auto-allow (no permission prompt needed, since undo can roll them back)

### Improvements

- **undoManager Abstraction** — Three primitives (`commit`, `undo`, `restore`) with `UndoDeps` dependency injection for testability; `findCommitForMessage` pure function for commit lookup; `discardUndoArchive` helper
- **Message ID Pre-generation** — `newMessageId()` in chatStore generates UUID before snapshot commit, preserving correct commit-before-addMessage order; `addMessage` accepts optional `{ id }`
- **Snapshot Commit Naming** — Commits named by messageId (not round number); `msgId` for before-AI, `"post:" + msgId` for undo archive
- **Component State Persistence** — `pendingQuestion`, `resolveQuestionRef`, `permissionRequest`, `resolvePermissionRef`, and QuestionBar form state lifted from AISidebar local state to chatStore (per-chatKey isolation); state survives Settings tab switches
- **Plan Mode Enhanced Permission Check** — `executeTool` entry-level check: write/edit/runSkillScript in plan mode return explicit error; workspace auto-allow checks ordered before external path and edit permission checks
- **undoArchiveMap Merged** — `Record<string, UndoArchive>` with `{ hash, messageId, content }` replaces separate hash/content maps

### Bug Fixes

- **Single-file snapshot restore preserves other files** — `delete_extra_files` skipped when `info.file_paths.is_some()` (single-file mode), preventing deletion of unrelated files in the directory

## v1.2.1 (2026-05-21)

### Improvements

- **System prompt consolidation** — Moved `WEBFETCH_INSTRUCTION` and `SUBAGENTS_INSTRUCTION` from system prompt into tool descriptions, eliminating redundancy (LLM reads each instruction only once)
  - webfetch tool: added "Max 3 calls per request" and format usage guidance (markdown for general reading, text for plain text, html for DOM parsing)
  - task tool: sub-agent type descriptions already complete in tool definition, no separate section needed

- **Plan mode prompt enhanced** — Rewrote `PLAN_MODE_INSTRUCTION` following opencode's approach
  - Added "Responsibility" section: read/search/explore codebase, delegate to explore sub-agents, build actionable plans, ask clarifying questions via question tool
  - Added "Important" section: explicit priority override — no file changes under any circumstances
  - Removed old "CRITICAL" / "zero exceptions" language in favor of structured sections

- **Build mode instruction** — Added `BUILD_MODE_INSTRUCTION` so LLM explicitly knows when it exits plan mode

## v1.2.0 (2026-05-20)

### New Features

- **Sub-Agent Task Tool** — AI can now delegate tasks to specialized sub-agents via the "task" tool
  - `explore` sub-agent: read-only code exploration, searching, and analysis (8 tools, max 10 rounds)
  - `general` sub-agent: full-access multi-step tasks with write/edit capability (10 tools, max 15 rounds)
  - Sub-agents run independent chat loops with fresh context (no parent conversation inheritance)
  - Plan mode deny rules cascade to sub-agents (edit/runSkillScript denied in plan mode)
  - Task tool results returned as `<task_result>` XML with summary + full_result

- **Sub-Agent UI** — Interactive sub-agent visualization in the AI sidebar
  - `SubAgentCard` — clickable summary card in main chat showing type badge, description, and rounds
  - `SubAgentView` — detail view with full message history, reusing parent chat bubble styling
  - "← Back to main conversation" navigation between main chat and sub-agent detail

- **Editor List Item Icons** — Custom SVG icons for bullet list, checked/unchecked checkboxes in Crepe editor

### Improvements

- **Editor Bullet Serialization** — Markdown serialization now uses `-` (dash) as bullet character via `remarkStringifyOptionsCtx`
- **Editor Mode Switch Sync** — Content now syncs on wysiwyg switch even without saved selection
- **Editor CSS Fix** — `<ul>` list padding separated from `<ol>` with proper `padding-left` and `margin`
- **Sub-Agent CSS Consistency** — Sub-agent view uses `--moflow-*` editor theme variables (matching sidebar convention), reuses `moflow-ai-message` / `moflow-ai-message-content` / `moflow-ai-tool-group` classes instead of separate styling

### Bug Fixes

- Fixed sub-agent UI not following editor theme (was using `--ui-*` app theme vars instead of `--moflow-*` editor vars)

## v1.1.1 (2026-05-20)

### Bug Fixes

- **Updater Proxy Support** — Fixed socks5/http/https proxy not working for auto-update checks and downloads
  - `tauri-plugin-updater` internally uses reqwest 0.13 without the `socks` feature, causing socks5 proxy URLs to fail
  - Added `reqwest_v13` dependency with `socks` feature so Cargo merges it into the updater's reqwest, enabling all proxy types
  - Added `console.log` in `updater.ts` for proxy debugging

## v1.1.0 (2026-05-19)

### New Features

- **Cross-Platform Support (macOS + Linux)** — MoFlow now builds and runs on all major desktop platforms
  - macOS: overlay title bar with native traffic lights, Cmd key shortcuts
  - Linux: AppImage + deb packaging
  - Windows: unchanged, fully tested

- **Multi-Platform CI** — Automated build verification on Windows, macOS, and Linux
  - `.github/workflows/ci.yml` — lint + type check + test + cargo check on all 3 platforms
  - `.github/workflows/release.yml` — 3-platform matrix with Linux system deps

- **tauri-plugin-os** — Platform detection for conditional PDF export strategy

### Improvements

- **PDF Export Dual-Track** — Windows uses Rust WebView2 PrintToPdf (proven quality), macOS/Linux uses JS fallback (jspdf + html2canvas via iframe srcdoc isolation)
- **Platform-Specific Chrome UA** — `#[cfg]` selects Windows/macOS/Linux User-Agent strings
- **Proxy Config Platform Guards** — `proxy_url()` builder calls guarded with `#[cfg(target_os = "windows")]`
- **macOS Window Creation** — `titleBarStyle: "overlay"` + `decorations: true` for native traffic lights
- **macOS TitleBar** — Custom min/max/close buttons hidden on macOS; 78px left padding for traffic lights
- **Shortcuts Cross-Platform** — `isMac` detection with `userAgentData?.platform` fallback; test updated for Ctrl+S / ⌘S
- **Editor Cmd+S** — `e.ctrlKey || e.metaKey` intercepts macOS Cmd+S

### Bug Fixes

- Fixed `formatShortcutDisplay` test failing on macOS CI (expected "Ctrl" but got "⌘")

## v1.0.0 (2026-05-19)

### New Features

- **Skill Marketplace** — Browse, install, update, and uninstall skills from a GitHub-based remote registry
  - Available + Installed sections with search, category filter, and keyword highlighting
  - One-click install from `moflow-skills` monorepo; version management and updates
  - Skill categories: writing / coding / data / productivity / media

- **AI Mode (Plan / Build)** — Switch between two AI interaction modes
  - Plan mode: `edit` + `runSkillScript` denied; AI analyzes only, never modifies files
  - Build mode (default): all tools available with permission checks
  - AISidebar header toggle button + Tab key shortcut (sidebar-only)

- **Shortcut Customization** — Rebind any keyboard shortcut from Settings
  - Key capture UI with conflict detection
  - Per-item reset + reset all
  - `shortcutOverrides` persisted in `settings.json`

- **Trace Observability** — Operation-level tracing for AI agent interactions
  - JSONL trace output (`chats/{safeFileName}/trace.jsonl`)
  - LLM round spans, tool execution spans, compact spans
  - `enableTrace` toggle in Settings AI section (default: off)
  - NoOpTracer pattern for zero overhead when disabled

- **Cached Tokens Tracking** — OpenAI `prompt_tokens_details.cached_tokens` now tracked and displayed
  - Cached tokens + cumulative total tokens shown in ContextView statistics
  - `cachedTokensMap` in chatStore (memory-only, resets on restart)

- **Streaming Metrics** — `ttfbMs` (time-to-first-byte) and `chunkCount` per LLM request
  - Tracked in both OpenAI and Claude streaming clients
  - Available in trace span data

- **promptTokens Persistence** — Assistant messages now store `promptTokens` in JSONL
  - Context usage (`contextTokensMap`) correctly restored on app restart

### Improvements

- **ContextView statistics** — Always shows Cache and Total rows (not conditional on > 0)
- **HamburgerMenu export submenu** — Removed `?` indicator from sub-menu items

## v0.9.6 (2026-05-19)

### New Features

- **Interactive Question Tool** — AI can ask users questions via a wizard-style form before executing non-trivial tasks
  - `makeQuestionTool()` — tool definition with `questions[]` array, each containing `question`, `options[{label, description?}]`, and optional `multiple` flag
  - QuestionBar component — wizard-style multi-step form with progress indicator, radio/checkbox selection, custom "Other" input, Continue/Confirm/Back buttons
  - Question tool does not count toward `maxToolRounds`
  - System prompt: "First principle: Understand before you act" — non-trivial tasks must ask first

- **Input History** — Chat input box now remembers sent messages, navigate with ↑/↓ arrow keys
  - `inputHistory.ts` — per-session persistence (`input_history.json`), max 200 entries, dedup latest
  - Slash commands (`/new`, `/compact`) also added to history
  - Arrow history navigation no longer blocked by slash menu

- **Chat Storage Restructuring** — Each chat session now has its own directory
  - `{appDataDir}/chat/` → `{appDataDir}/chats/{safeFileName}/messages.jsonl`
  - `/new` clears messages only (preserves session directory + input history)
  - `migrateOldChatDir()` auto-migrates on startup

- **Callout UI** — Error and warning messages rendered as styled callout blocks
  - `|?` prefix → red error callout with icon
  - `|!` prefix → yellow warning callout with icon
  - `/compact` "nothing to compact" now shows as yellow warning callout

- **Tool Output XML Wrapping** — Tool results wrapped in XML tags for clearer structure
  - `<file>` for read/readSection (with line count hint and truncation notice)
  - `<grep>`, `<outline>`, `<find>`, `<glob>`, `<ls>` for respective tools
  - `readSection` now includes line numbers for LLM positioning
  - Truncation hints changed from `...(total N lines)` to natural language inside XML tags

### Improvements

- **System prompt** — Removed contradictory "Follow instructions without questioning" rule; merged clarify+plan into "Understand before you act"
- **Env var descriptions** — `MOFLOW_WORKSPACE_ROOT` and `MOFLOW_ACTIVE_FILE` now say "Absolute path of..."
- **`chatStore` centralized I/O** — All chat data access goes through `chatStore`; components no longer import `chatPersistence` or `inputHistory` directly
- **Arrow key history** — History navigation with `historyIndexRef !== -1` check prevents conflict with slash menu
- **`/compact` and `/new`** — Now handled when typed directly in input (not just via slash menu)

## v0.9.5 (2026-05-18)

### New Features

- **Selection AI Markdown serialization** — Selected text is now serialized to Markdown (via `serializerCtx`) instead of plain text (`textBetween`), preserving formatting (bold, links, code, math, lists) in explain/translate/rewrite/ask actions

### Improvements

- **Translate prompt optimization** — Translate no longer sends the full document as system prompt (empty system prompt); uses structured Rules format with XML `<selected_text>` tags; preserves all Markdown formatting exactly
- **Translate panel simplified** — Removed original text preview, shows only the translation result
- **Markdown syntax block trimmed** — Reduced from ~550 chars to ~200 chars across `default.txt`, rewrite hints, and explain prompts; eliminated duplicate `ai.mdSyntax`/`ai.rewrite.mdNote` i18n keys (replaced by `MD_NOTE` constant)
- **Tool descriptions deduplicated** — Removed `WS_FILE_TOOLS`/`DOC_FILE_TOOLS` text blocks from system prompt; LLM now relies solely on API `tools` parameter for tool details
- **Claude max_tokens dynamic** — Replaced hardcoded `max_tokens: 4096` with `min(maxContext - estimatedInputTokens, 8192)`, floor 1024, fallback 4096 for unknown models
- **Token estimation improved** — Fallback mode now includes `tool_calls[].name + arguments` and `reasoningContent` in token estimation (via `serializeMessagesForEstimation()`)

### Bug Fixes

- **AI message list markers** — Fixed `ul`/`ol` list-style reset by Tailwind Preflight; added `list-style-type: disc/decimal` to `MessageContent.css`
- **Toolbar selection flash** — Toolbar hidden during mouse drag (`data-selecting` attribute); 50ms delay on mouseup prevents flash when clicking to deselect

## v0.9.3 (2026-05-17)

### New Features

- **Write Tool** — AI can create or overwrite files
  - `makeWriteTool()` — tool definition with path + content parameters, supports absolute and relative paths
  - `toolWrite()` — execution logic: path resolution (workspace > activeFile dir > absolute), `edit` permission check, `allowFsScope`, `writeFile`, auto-create parent directories, sync open tab content
  - `getToolDefinitions` now includes write tool when workspaceRoot or activeFilePath is available
  - `WS_FILE_TOOLS` / `DOC_FILE_TOOLS` prompt instructions updated for write tool

- **Edit Tool** — AI can make targeted text replacements in existing files
  - `makeEditTool()` — tool definition with path + old_string + new_string + replace_all parameters
  - `toolEdit()` — exact match + trailing-whitespace fuzzy match; multiple matches prompt replace_all; no match returns surrounding context hint
  - `resolvePathAndCheckWritePermission()` — shared path resolution + permission check for write/edit
  - `syncTabContent()` — shared tab content sync for write/edit

### Improvements

- **Skill call refactoring** — `runSkillScript` script parameter now requires `skillName/scriptName` format (e.g. `markdown-to-ppt/convert.js`), eliminating ambiguous brute-force fallback when two skills have same-named scripts
  - `toolSkill` now returns script names with skill prefix (`- markdown-to-ppt/convert.js` instead of `- convert.js`)
  - `executeSkillScript` passes `cwd` parameter (activeFile directory preferred, workspaceRoot fallback) so scripts can use relative file paths
  - Rust `execute_script` accepts `cwd: Option<String>` parameter

- **Tool result simplification** — write/edit tool results are now minimal strings (`"File written successfully."` / `"Edit applied successfully."`), since the LLM already has the tool call args; removed preview, path, diff, and `---` separator from results
  - `EditToolResult` UI component now builds diff display from `item.info.args.old_string/new_string` instead of parsing `msg.content` for `---` separator

- **Tool naming unification** — `read_section` → `readSection`, `run_skill_script` → `runSkillScript`, `external_path` → `externalPath` (8 files, ~35 places)
  - `formatToolArgs` structured display for read/readSection/grep/outline — path first, `key=val` for rest
  - Prompt `read_lines` → `read` unified in contextBuilder
  - i18n key naming aligned with camelCase tool names

- **Tool rounds configurable** — `MAX_TOOL_ROUNDS` from hardcoded 10 → store configurable `maxToolRounds` (default 20, range 1-50, Settings AI panel)
  - AISection refactored to draft + Save mode (no instant save)
  - maxToolRounds input: `type="text"` + `inputMode="numeric"` (no spinner arrows)

- **`<available_skills>` / `<available_env_vars>` XML compacted** — Single-line attribute format saves ~120 tokens

- **Error state collapsible** — GenericToolResult, EditToolResult, ReadToolGroup all use `<details>` for error states

### Bug Fixes

- **`permission.ts evaluate()` undefined guard** — Added `if (!rules) return "ask"` to prevent crash on undefined rules
- **ContextView tool call params truncation** — Removed 30-char limit on tool args display

## v0.9.2 (2026-05-16)

### Improvements

- **AI prompt hardcoded English** — Tool descriptions and error messages in `tools.ts` changed from i18n `t()` calls to hardcoded English strings, since LLM prompts should always be in English regardless of UI language
  - 26 tool definition descriptions (`ai.tool.*.desc` / `ai.tool.*.param.*`) replaced with inline English
  - 27 tool error messages (`ai.tool.error.*`) replaced with inline English
  - `skill` and `run_skill_script` tool descriptions added proper English text (previously missing from `en.ts`, causing fallback failures)
  - Removed `import { t } from "../i18n/core"` from `tools.ts`
- **Locale cleanup** — Removed ~45 `ai.tool.*` / `ai.tool.error.*` keys from all 4 locale files (en/zh/ja/ko); retained `ai.toolStatus.*` keys (UI-visible spinner text)

### Bug Fixes

- **Missing `js-yaml` dependency** — Added `js-yaml` and `@types/js-yaml` to `package.json` (previously used but undeclared, causing `TS2307: Cannot find module 'js-yaml'` on `bun run build`)

## v0.9.0 (2026-05-16)

### New Features

- **Skill system** — Extensible skill framework with discovery, activation, and script execution
  - `src/lib/skillManager.ts` — Skill discovery (scan `SKILL.md` frontmatter), body loading, script execution via `bun`
  - `src/lib/skillRegistry.ts` — Remote skill registry from GitHub monorepo (`moflow-skills`), install/update/uninstall with atomic replacement
  - `src/stores/skillStore.ts` — Zustand store for discovered/remote skills, install statuses
  - `src/lib/prompt/default.txt` — Static system prompt (English only, replaces i18n-based prompts)
  - `src/lib/types.ts` — `SkillMeta`, `RemoteSkill`, `SkillInstallStatus` types
  - `skill` tool — AI loads skill instructions by name; `<available_skills>` XML in system prompt (opencode pattern)
  - `run_skill_script` tool — Execute `.ts`/`.js` scripts from skill's `scripts/` directory; `${VAR_NAME}` placeholder resolution; three-layer STOP instruction
  - `/skills` slash command — Dropdown display of enabled skills with descriptions (no toggle; enable/disable only via Settings)

- **Skill Store UI** — Browse, install, update, and uninstall skills from Settings → Skills
  - `src/components/SettingsPanel/SkillsSection.tsx` — Available (remote) + Installed (local) sections with confirm dialogs
  - `src/components/SettingsPanel/EnvVarsSection.tsx` — Auto-save environment variables for skill scripts
  - `src/stores/themeStore.ts` — `envVars`/`setEnvVars` persisted via `persistSettings`
  - `src/lib/settings.ts` — `envVars` field added to `AppSettings`

- **Rust backend for skills**
  - `fetch_skill_registry` — Fetch remote skill list from GitHub monorepo
  - `download_and_install_skill` — Download zip, extract skill, atomic install (rename old→`.old`, tmp→target, rollback on failure)
  - `uninstall_skill` — Remove skill directory
  - `clean_skill_temp` — Clean `.tmp-*` and `*.old` directories
  - `check_bun_available` — Verify bun is installed
  - `execute_script` — Run script via `bun` in skill's `scripts/` directory with env vars and 30s timeout
  - Windows path separator fix: `PathBuf::starts_with`/`strip_prefix` instead of string comparison

- **Confirm dialog** — Generic confirm mode for skill install/update/uninstall
  - `src/stores/appStore.ts` — `DialogMode` union adds `"confirm"`, `showConfirmDialog()` action
  - `src/lib/closeDialog.ts` — `showConfirmDialog()`/`resolveConfirm()` functions
  - `src/components/ConfirmCloseDialog/ConfirmCloseDialog.tsx` — Confirm mode UI (OK/Cancel)

- **Permission system update** — `execute` → `run_skill_script`
  - `src/lib/permission.ts` — Permission key renamed from `execute` to `run_skill_script`
  - `src/stores/permissionStore.ts` — Updated key type
  - `src/components/AISidebar/PermissionBar.tsx` — `run_skill_script` case added

- **SlashCommandMenu rewrite** — 3-phase menu (commands → models → skills)
  - `/skills` shows enabled skills with name on first line, description on second line
  - Menu width auto-adapts to textarea width

- **i18n updates** — All 4 locales (en/zh/ja/ko) updated with skill/runSkillScript descriptions and params
  - Removed `ai.systemPrompt.*` and `ai.mdSyntax` keys (replaced by static `default.txt`)

### Prompt & Skill Optimization (v0.9.1)

- **Document content XML tags** — `---` separators replaced with `<document_content>` / `<document_structure>` tags, preventing LLM confusion between filenames and document titles
- **Environment variable current values** — `<available_env_vars>` now includes `<current_value>` showing actual paths; `buildSystemPrompt` param changed from `activeFileName` to `activeFilePath`
- **Removed redundant prompt text** — "The user is editing..." / "Please answer..." removed; XML tags self-document
- **SKILL_INSTRUCTION updated** — "MoFlow resolves these before execution — you do NOT need to know their actual values"
- **Skill tool output cleaned** — Removed redundant `Available environment variables` paragraph (already in system prompt `<available_env_vars>`)
- **Strengthened STOP instruction** — `[Script executed successfully. Report this output to the user and STOP.]` → `[SUCCESS — Do NOT call run_skill_script again. Report this output to the user now.]`
- **Removed debug logs** — 20 `console.info` calls removed from contextBuilder, tools, AISidebar, skillManager, skillStore

### Bug Fixes

- **`initFromStartupData` missing fields** — Added `language`, `permissions`, `envVars` to local `defaultSettings` and `useThemeStore.setState()` call, preventing silent data loss on normal startup
- **Zustand infinite loop** — Moved `.filter()` outside `useSkillStore` selector to return stable reference
- **SkillsSection i18n key mismatches** — Fixed; errors now via `showAlertDialog`
- **`discoverSkills()` startup race** — Moved from `initSession()` to `App.tsx` startup callback (runs after both init paths)

## v0.8.5 (2026-05-13)

### New Features

- **Permission system** — Wildcard pattern matching with three-tier evaluation (session > global > default) and inline consent bar for external path access
  - `src/lib/permission.ts` — Hand-written wildcard engine (`*`/`?`/`**`), zero dependencies; `evaluate()`, `evaluateWithSession()`, `generateAlwaysPattern()` functions
  - Three permission keys: `external_path` (file read, v0.8.5), `execute` (skill script, v0.9.0), `edit` (file write, reserved)
  - Three actions per rule: `allow` / `ask` / `deny`; last-matching-rule-wins semantics
  - `src/stores/permissionStore.ts` — Per-chatKey session rules; `/new`, tab close, and workspace close clear session rules
  - `src/components/AISidebar/PermissionBar.tsx` — Inline consent bar above input area (Allow / Always Allow / Deny buttons)
  - "Always Allow" writes session rule with wildcard pattern (e.g. `~/configs/*`); subsequent matches auto-allow
  - PermissionBar uses editor theme CSS variables (`--moflow-*`); "Always Allow" button uses `--moflow-warn`/`--moflow-warn-text` per theme
  - `--moflow-warn`/`--moflow-warn-text` CSS variables added to all 6 editor themes in `index.css`

- **`executeTool` signature change** — New `onPermission` callback parameter for permission checks inside tool execution
  - `checkPathAccess()` replaces `isPathAllowed()` — workspace-internal paths auto-allow, workspace-external paths evaluate via permission engine
  - `allowFsScope()` calls Tauri `allow_paths` to extend FS scope when permission is granted
  - `resolveAbsolutePath()` detects absolute paths (Windows drive letters, Unix `/`) to avoid incorrect path joining

- **Chat input history navigation** — Up/Down arrow keys cycle through previous user messages (bash-style)
  - Up arrow on first line → older messages; Down arrow on last line → newer messages
  - Draft input preserved when entering history, restored on exit
  - Any character input exits history navigation mode

- **System prompt instruction-following improvement** — All 6 prompt entry points (4 languages) now include "Prefer to execute user instructions directly. If unclear, briefly ask for clarification instead of refusing."
  - Tool guidance text also strengthened: "ALWAYS use these tools... NEVER say you cannot access the local file system"

### Bug Fixes

- **Absolute path joining error** — `ls D:\` was incorrectly resolved to `workspaceRoot + D:\`; now absolute paths are detected and used directly
- **Tauri FS scope blocking** — Even after user granted permission via PermissionBar, `exists()`/`readDir()` still failed; `allowFsScope()` now extends FS scope on allow
- **`??` placeholder icons** — Empty state icon and tool result badge replaced with proper SVG icons (chat bubble and wrench)
- **`/new` not clearing session rules** — Now calls `clearSessionRules(chatKey)` on `/new`
- **PermissionBar not following editor theme** — Replaced hardcoded `--ui-*` vars and Tailwind colors with `--moflow-*` editor theme vars

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
