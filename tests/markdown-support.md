# MoFlow Markdown Syntax Support

> Back to [README](../README.md) | [中文版](../README.zh-CN.md)

MoFlow uses [Milkdown](https://milkdown.dev/) (with [Crepe](https://github.com/Milkdown/milkdown/tree/main/packages/crepe) wrapper) as the rendering engine, which is built on ProseMirror. The supported syntax covers Markdown 1.0, CommonMark 0.31, and GitHub Flavored Markdown 0.29, plus MoFlow-specific extensions.

**Companion test file:** [test-markdown-spec.md](./test-markdown-spec.md) — open it in MoFlow to visually verify rendering.

---

## CommonMark Syntax

| Syntax | Markdown | Status | Notes |
|--------|----------|--------|-------|
| Paragraphs | Plain text | ✅ | |
| ATX Headings (h1–h6) | `#` ~ `######` | ✅ | Toolbar & slash menu support |
| Setext Headings (h1–h2) | `===` / `---` | ✅ | |
| Bold | `**text**` or `__text__` | ✅ | Toolbar button (Ctrl+B) |
| Italic | `*text*` or `_text_` | ✅ | Toolbar button (Ctrl+I) |
| Bold + Italic | `***text***` | ✅ | |
| Inline Code | `` `code` `` | ✅ | Toolbar button |
| Fenced Code Blocks | ` ```lang ` | ✅ | CodeMirror 6 editor with syntax highlighting, language search, copy button |
| Indented Code Blocks | 4-space indent | ✅ | |
| Blockquotes | `> text` | ✅ | Supports nesting, lazy continuation |
| Ordered Lists | `1. item` | ✅ | Custom list item rendering |
| Unordered Lists | `- item` | ✅ | Custom list item rendering |
| Horizontal Rules | `---` / `***` / `___` | ✅ | |
| Links | `[text](url)` | ✅ | Hover tooltip with copy/edit/remove; toolbar button |
| Reference Links | `[text][ref]` | ✅ | |
| Images (inline) | `![alt](url)` | ✅ | |
| Hard Line Breaks | Two trailing spaces or `\` | ✅ | |
| Soft Line Breaks | Single newline | ✅ | |
| Backslash Escapes | `\*` etc. | ✅ | |
| Entity References | `&amp;` / `&#39;` / `&copy;` | ⚠️ | Marked.js 88% pass rate for CommonMark entity tests |
| Autolinks (angle brackets) | `<https://...>` / `<email>` | ✅ | |
| Raw HTML (inline) | `<span>...</span>` | ✅ | Displays as inline source |
| Raw HTML (block) | `<div>...</div>` | ✅ | Typora-style rendered/source toggle on click |

## GFM Extensions

| Syntax | Markdown | Status | Notes |
|--------|----------|--------|-------|
| Tables | `\| col \| col \|` | ✅ | Full editing UI: add/delete rows & columns, alignment, drag-and-drop |
| Task Lists | `- [ ]` / `- [x]` | ✅ | Checkbox icons; slash menu insert |
| Strikethrough | `~~text~~` | ✅ | Toolbar button |
| Autolinks (GFM) | `https://...` / `www.` / `email` | ⚠️ | Marked.js 79% pass rate for GFM autolink edge cases |
| Disallowed Raw HTML | `<tag>` filtering | ❌ | Marked.js 0% pass rate; not supported |

## MoFlow Custom Extensions

| Syntax | Markdown | Status | Notes |
|--------|----------|--------|-------|
| Highlight | `==text==` | ✅ | Custom mark → `<mark>`; toolbar button (Ctrl+Shift+H); input rule `==text==` |
| Inline Math | `$formula$` | ✅ | KaTeX rendering; popup editor on click |
| Block Math | `$$formula$$` | ✅ | KaTeX rendering; code editor with live preview |
| Mermaid Diagrams | ` ```mermaid ` | ✅ | Flowchart, sequence, class, gantt, pie, state diagrams; rendered SVG preview; edit via CodeMirror; dark/light theme |

## Editor Enhancements

These are not syntax features but affect the editing experience:

| Feature | Trigger | Notes |
|---------|---------|-------|
| Floating Toolbar | Select text | Bold, italic, strikethrough, code, link, LaTeX, highlight, AI actions |
| Slash Menu | Type `/` | Insert: heading, quote, divider, list, task list, image, code block, table, math |
| Block Drag Handle | Hover left of block | Drag to reorder blocks |
| Image Block | Paste/drop image | Caption, upload, resize |
| Link Tooltip | Hover over link | Copy, edit, remove |
| Table Editor | Click in table | Add/delete rows & columns, alignment, drag rows/columns |
| Code Mirror | Click code block | Syntax highlighting (oneDark), language search, copy button |
| Undo / Redo | Ctrl+Z / Ctrl+Shift+Z | History plugin |
| Tab Indent | Tab key in code blocks / lists | 4-space indent |

## Unsupported Features

| Feature | Status | Notes |
|---------|--------|-------|
| Footnotes `[^1]` | ❌ | Not configured; could be added via `@milkdown/plugin-footnote` or remark-footnote |
| Definition Lists | ❌ | Not configured |
| Superscript / Subscript | ❌ | Not configured |
| Disallowed Raw HTML (GFM) | ❌ | GFM spec feature to filter dangerous HTML tags |
| Abbreviations | ❌ | Not configured |
| Marked.js CommonMark link edge cases | ⚠️ | 86% pass rate (77/90) |
| Marked.js GFM autolink edge cases | ⚠️ | 79% pass rate (11/14) |

## Specification Compatibility Reference

Based on [marked.js](https://marked.js.org/) test results:

| Specification | Pass Rate |
|---------------|-----------|
| Markdown 1.0 | 100% |
| CommonMark 0.31 | 98% |
| GitHub Flavored Markdown 0.29 | 97% |
