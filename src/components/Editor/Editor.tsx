import { Crepe } from "@milkdown/crepe";
import { Milkdown, MilkdownProvider, useEditor } from "@milkdown/react";
import { replaceAll, getHTML } from "@milkdown/utils";
import { EditorStatus, editorViewCtx, parserCtx, serializerCtx } from "@milkdown/core";
import { Slice, type Node as ProseNode } from "prosemirror-model";

function replaceAllNoHistory(markdown: string) {
  return (ctx: Ctx) => {
    const view = ctx.get(editorViewCtx);
    const doc = ctx.get(parserCtx)(markdown);
    if (!doc) return;
    const { state } = view;
    view.dispatch(
      state.tr
        .replace(0, state.doc.content.size, new Slice(doc.content, 0, 0))
        .setMeta("addToHistory", false)
    );
  };
}

function getSelectionMarkdown(ctx: Ctx, view: { state: { selection: { from: number; to: number }; doc: ProseNode } }): string {
  const { from, to } = view.state.selection;
  const serializer = ctx.get(serializerCtx);
  const slice = view.state.doc.slice(from, to);
  const tempNode = view.state.doc.type.create(null, slice.content);
  return serializer(tempNode);
}

import { TextSelection } from "prosemirror-state";
import type { Ctx } from "@milkdown/kit/ctx";
import { LanguageDescription, LanguageSupport, StreamLanguage } from "@codemirror/language";
import type { StreamParser } from "@codemirror/language";
import { markdown as cmMarkdown } from "@codemirror/lang-markdown";
import { EditorView as CMEditorView, keymap, ViewUpdate, highlightSpecialChars, drawSelection, highlightActiveLine } from "@codemirror/view";
import { EditorState as CMEditorState } from "@codemirror/state";
import { indentWithTab, defaultKeymap, historyKeymap } from "@codemirror/commands";
import { indentOnInput, syntaxHighlighting, defaultHighlightStyle, bracketMatching } from "@codemirror/language";
import { closeBrackets, closeBracketsKeymap } from "@codemirror/autocomplete";
import { highlightSelectionMatches, searchKeymap } from "@codemirror/search";
import { useTabStore, type EditorMode } from "../../stores/tabStore";
import { useThemeStore } from "../../stores/themeStore";
import { useAISelectionStore } from "../../stores/aiSelectionStore";
import { getShortcutDisplay, getShortcutLabel } from "../../lib/shortcuts";
import { t } from "../../i18n/core";
import { useT } from "../../i18n/useT";
import { highlightPlugin, highlightSchema, toggleHighlightCommand } from "../../lib/highlightMark";
import { searchPlugin } from "../../lib/searchPlugin";
import { createHtmlNodeView } from "../../lib/htmlBlock";
import { mermaidPlugin, resetMermaidTheme } from "../../lib/mermaidPlugin";
import { useSearchStore } from "../../stores/searchStore";
import SearchBar from "./SearchBar";
import { commandsCtx } from "@milkdown/kit/core";
import { isMarkSelectedCommand } from "@milkdown/kit/preset/commonmark";
import { undoCommand, redoCommand } from "@milkdown/plugin-history";
import { saveImageToFile, getImageExt, resolveImagePath } from "../../lib/imageManager";

function cmLegacy(parser: StreamParser<unknown>) {
  return new LanguageSupport(StreamLanguage.define(parser));
}

const cmLanguages = [
  LanguageDescription.of({ name: "C", extensions: ["c", "h", "ino"], load() { return import("@codemirror/lang-cpp").then(m => m.cpp()); } }),
  LanguageDescription.of({ name: "C++", alias: ["cpp"], extensions: ["cpp", "c++", "cc", "cxx", "hpp", "h++", "hh", "hxx"], load() { return import("@codemirror/lang-cpp").then(m => m.cpp()); } }),
  LanguageDescription.of({ name: "C#", alias: ["csharp", "cs"], extensions: ["cs"], load() { return import("@codemirror/legacy-modes/mode/clike").then(m => cmLegacy(m.csharp)); } }),
  LanguageDescription.of({ name: "Go", extensions: ["go"], load() { return import("@codemirror/lang-go").then(m => m.go()); } }),
  LanguageDescription.of({ name: "Java", extensions: ["java"], load() { return import("@codemirror/lang-java").then(m => m.java()); } }),
  LanguageDescription.of({ name: "JSON", extensions: ["json", "map"], load() { return import("@codemirror/lang-json").then(m => m.json()); } }),
  LanguageDescription.of({ name: "Kotlin", extensions: ["kt", "kts"], load() { return import("@codemirror/lang-java").then(m => m.java()); } }),
  LanguageDescription.of({ name: "LaTeX", alias: ["tex"], extensions: ["text", "ltx", "tex"], load() { return import("@codemirror/legacy-modes/mode/stex").then(m => cmLegacy(m.stex)); } }),
  LanguageDescription.of({ name: "PHP", extensions: ["php", "php3", "php4", "php5", "php7", "phtml"], load() { return import("@codemirror/lang-php").then(m => m.php()); } }),
  LanguageDescription.of({ name: "Python", alias: ["py"], extensions: ["py", "pyw", "cpy", "gyp"], load() { return import("@codemirror/lang-python").then(m => m.python()); } }),
  LanguageDescription.of({ name: "Rust", extensions: ["rs"], load() { return import("@codemirror/lang-rust").then(m => m.rust()); } }),
  LanguageDescription.of({ name: "SQL", extensions: ["sql"], load() { return import("@codemirror/lang-sql").then(m => m.sql()); } }),
  LanguageDescription.of({ name: "Swift", extensions: ["swift"], load() { return import("@codemirror/legacy-modes/mode/swift").then(m => cmLegacy(m.swift)); } }),
  LanguageDescription.of({ name: "XML", alias: ["rss", "wsdl", "xsd"], extensions: ["xml", "xsl", "xsd", "svg"], load() { return import("@codemirror/lang-xml").then(m => m.xml()); } }),
  LanguageDescription.of({ name: "YAML", extensions: ["yaml", "yml"], load() { return import("@codemirror/lang-yaml").then(m => m.yaml()); } }),
];
import "@milkdown/crepe/theme/common/style.css";
import "@milkdown/crepe/theme/nord.css";
import "@milkdown/crepe/theme/nord-dark.css";
import "./Editor.css";
import SelectionAIPanel from "./SelectionAIPanel";
import { useEffect, useRef, useCallback, memo } from "react";
import { useShallow } from "zustand/react/shallow";

function getBlockHandleMetrics() {
  const proseMirror = document.querySelector(".milkdown .ProseMirror");
  const proseMirrorLeft = proseMirror ? proseMirror.getBoundingClientRect().left : 0;
  const paddingX = proseMirror ? parseFloat(getComputedStyle(proseMirror).paddingLeft) || 48 : 48;
  return { proseMirrorLeft, paddingX };
}


const SLASH_MD_MAP: Record<string, { i18nKey: string; md: string }> = {
  "Text": { i18nKey: "editor.block.text", md: "paragraph" },
  "Heading 1": { i18nKey: "editor.block.heading1", md: "# " },
  "Heading 2": { i18nKey: "editor.block.heading2", md: "## " },
  "Heading 3": { i18nKey: "editor.block.heading3", md: "### " },
  "Heading 4": { i18nKey: "editor.block.heading4", md: "#### " },
  "Heading 5": { i18nKey: "editor.block.heading5", md: "##### " },
  "Heading 6": { i18nKey: "editor.block.heading6", md: "###### " },
  "Quote": { i18nKey: "editor.block.quote", md: "> " },
  "Divider": { i18nKey: "editor.block.divider", md: "---" },
  "Bullet List": { i18nKey: "editor.block.bulletList", md: "- " },
  "Ordered List": { i18nKey: "editor.block.orderedList", md: "1. " },
  "Task List": { i18nKey: "editor.block.taskList", md: "- [ ] " },
  "Image": { i18nKey: "editor.block.image", md: "![alt](url)" },
  "Code": { i18nKey: "editor.block.code", md: "```?```" },
  "Table": { i18nKey: "editor.block.table", md: "| | |\n|---|---|" },
  "Math": { i18nKey: "editor.block.math", md: "$$∑$$" },
};

const explainIcon = `
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" data-toolbar-key="explain">
    <path d="M2 3.5C2 3.22386 2.22386 3 2.5 3H8C10.7614 3 13 5.23858 13 8V20.5C13 20.7761 12.7761 21 12.5 21H12C11.1716 21 10.5 20.3284 10.5 19.5V17.5C10.5 16.1193 9.38071 15 8 15H2.5C2.22386 15 2 14.7761 2 14.5V3.5ZM4.5 5V13H8C8.88071 13 9.70849 13.2488 10.4157 13.6817C10.7753 13.9023 11.2836 13.7381 11.3304 13.3219C11.3761 12.9177 11 12.5871 11 12.1803V8C11 6.34315 9.65685 5 8 5H4.5Z"/>
    <path d="M22 3.5C22 3.22386 21.7761 3 21.5 3H16C13.2386 3 11 5.23858 11 8V20.5C11 20.7761 11.2239 21 11.5 21H12C12.8284 21 13.5 20.3284 13.5 19.5V17.5C13.5 16.1193 14.6193 15 16 15H21.5C21.7761 21 22 14.7761 22 14.5V3.5ZM19.5 5V13H16C15.1193 13 14.2915 13.2488 13.5843 13.6817C13.2247 13.9023 12.7164 13.7381 12.6696 13.3219C12.6239 12.9177 13 12.5871 13 12.1803V8C13 6.34315 14.3431 5 16 5H19.5Z"/>
  </svg>
`;

const translateIcon = `
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" data-toolbar-key="translate">
    <path d="M12.87 15.07l-2.54-2.51.03-.03A17.52 17.52 0 0 0 14.07 6H17V4h-7V2H8v2H1v1.99h11.17C11.5 7.92 10.44 9.75 9 11.35 8.07 10.32 7.3 9.19 6.69 8h-2c.73 1.63 1.73 3.17 2.98 4.56l-5.09 5.02L4 19l5-5 3.11 3.11.76-2.04zM18.5 10h-2L12 22h2l1.12-3h4.75L21 22h2l-4.5-12zm-2.62 7l1.62-4.33L19.12 17h-3.24z"/>
  </svg>
`;

const askIcon = `
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" data-toolbar-key="ask">
    <path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0L9.937 15.5z"/>
    <path d="M19 3h2v4h-2V3z"/>
    <path d="M19 7h4v2h-4V7z"/>
  </svg>
`;

const polishIcon = `
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" data-toolbar-key="polish">
    <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>
  </svg>
`;

const highlightIcon = `
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" style="background-color:#fff3b0;border-radius:4px" data-toolbar-key="highlight">
    <path d="M12 4L7 17h2.4l1-3h5.2l1 3H19L14 4h-2zm-1 8l1.5-4.5h.1L14.1 12H11z" style="fill:#000"/>
  </svg>
`;

import { getToolbarTooltipMap, BUILT_IN_TOOLTIP_KEYS } from "../../lib/toolbarTooltip";

interface MilkdownWrapperProps {
  tabId: string;
}

const MilkdownWrapper = memo(function MilkdownWrapper({ tabId }: MilkdownWrapperProps) {
  useT();
  const { content, mode } = useTabStore(
    useShallow((s) => {
      const tab = s.files.find((f) => f.id === tabId);
      return { content: tab?.content ?? "", mode: tab?.mode ?? "wysiwyg" };
    })
  );
  const editorTheme = useThemeStore((s) => s.editorTheme);
  const updateTabContent = useTabStore((s) => s.updateTabContent);
  const setGetEditorHTML = useTabStore((s) => s.setGetEditorHTML);
  const setEditorActions = useTabStore((s) => s.setEditorActions);

  const setContent = useCallback(
    (c: string) => updateTabContent(tabId, c),
    [tabId, updateTabContent]
  );

  const contentRef = useRef(content);
  const editorReadyRef = useRef(false);
  const syncedContentRef = useRef(content);
  const justLoadedRef = useRef(true);
  const crepeRef = useRef<Crepe | null>(null);
  const modeRef = useRef<EditorMode>(mode);
  const savedSelectionRef = useRef<{ from: number; to: number } | null>(null);
  const savedScrollRef = useRef<number>(0);
  const contentAtSwitchRef = useRef<string | null>(null);
  const skipHistoryRef = useRef(false);

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  useEffect(() => {
    if (mode === "source") {
      const crepe = crepeRef.current;
      if (crepe && crepe.editor && crepe.editor.status === EditorStatus.Created) {
        try {
          const view = crepe.editor.ctx.get(editorViewCtx);
          savedSelectionRef.current = { from: view.state.selection.from, to: view.state.selection.to };
          const wrapper = document.querySelector(`[data-tab-id="${tabId}"] .moflow-editor-wrapper`) as HTMLElement | null;
          savedScrollRef.current = wrapper?.scrollTop ?? 0;
          contentAtSwitchRef.current = content;
        } catch { /* editor not ready */ }
      }
    }
  }, [mode, tabId, content]);

  useEffect(() => {
    resetMermaidTheme();
  }, [editorTheme]);

  useEffect(() => {
    let tooltipEl: HTMLElement | null = null;

    const ensureTooltip = () => {
      if (!tooltipEl) {
        tooltipEl = document.createElement("div");
        tooltipEl.className = "moflow-toolbar-tooltip";
        tooltipEl.style.display = "none";
        document.body.appendChild(tooltipEl);
      }
      return tooltipEl;
    };

    const getTooltipText = (btn: Element): string | undefined => {
      const map = getToolbarTooltipMap();
      const svg = btn.querySelector("svg[data-toolbar-key]");
      const key = svg?.getAttribute("data-toolbar-key");
      if (key && map[key]) return map[key];
      const toolbar = btn.closest(".milkdown-toolbar");
      if (!toolbar) return undefined;
      const allButtons = toolbar.querySelectorAll(".toolbar-item");
      const index = Array.from(allButtons).indexOf(btn);
      if (index >= 0 && index < BUILT_IN_TOOLTIP_KEYS.length) {
        return map[BUILT_IN_TOOLTIP_KEYS[index]];
      }
      return undefined;
    };

    const showTooltip = (btn: Element) => {
      const text = getTooltipText(btn);
      if (!text) return;
      const el = ensureTooltip();
      el.textContent = text;
      el.style.display = "block";
      const btnRect = btn.getBoundingClientRect();
      const tipRect = el.getBoundingClientRect();
      let left = btnRect.left + btnRect.width / 2 - tipRect.width / 2;
      let top = btnRect.top - tipRect.height - 6;
      if (left < 4) left = 4;
      if (top < 4) top = btnRect.bottom + 6;
      el.style.left = `${left}px`;
      el.style.top = `${top}px`;
    };

    const hideTooltip = () => {
      if (tooltipEl) tooltipEl.style.display = "none";
    };

    const onPointerOver = (e: PointerEvent) => {
      const target = (e.target as Element)?.closest?.(".milkdown-toolbar .toolbar-item");
      if (target) showTooltip(target);
    };

    const onPointerOut = (e: PointerEvent) => {
      const related = e.relatedTarget as Element | null;
      if (related?.closest?.(".milkdown-toolbar .toolbar-item")) return;
      hideTooltip();
    };

    document.body.addEventListener("pointerover", onPointerOver);
    document.body.addEventListener("pointerout", onPointerOut);

    return () => {
      document.body.removeEventListener("pointerover", onPointerOver);
      document.body.removeEventListener("pointerout", onPointerOut);
      if (tooltipEl) tooltipEl.remove();
      tooltipEl = null;
    };
  }, []);

  useEffect(() => {
    contentRef.current = content;
  }, [content]);

  const { get: getEditor, loading } = useEditor((root) => {
    performance.mark(`editor-init-start-${tabId}`);
    const crepe = new Crepe({
      root,
      defaultValue: contentRef.current,
      features: {
        [Crepe.Feature.Toolbar]: true,
        [Crepe.Feature.Placeholder]: true,
        [Crepe.Feature.Cursor]: true,
        [Crepe.Feature.Latex]: true,
        [Crepe.Feature.ImageBlock]: true,
        [Crepe.Feature.LinkTooltip]: true,
        [Crepe.Feature.ListItem]: true,
        [Crepe.Feature.Table]: true,
        [Crepe.Feature.CodeMirror]: true,
        [Crepe.Feature.BlockEdit]: true,
      },
      featureConfigs: {
        [Crepe.Feature.ImageBlock]: {
          onUpload: async (file: File) => {
            const tab = useTabStore.getState().files.find((f) => f.id === tabId);
            if (!tab?.filePath) {
              return "";
            }
            const ext = getImageExt(file);
            const buffer = await file.arrayBuffer();
            const data = new Uint8Array(buffer);
            return await saveImageToFile(tab.filePath, data, ext);
          },
          proxyDomURL: (url: string) => {
            const tab = useTabStore.getState().files.find((f) => f.id === tabId);
            return resolveImagePath(url, tab?.filePath ?? null);
          },
        },
        [Crepe.Feature.CodeMirror]: {
          languages: cmLanguages,
        },
        [Crepe.Feature.BlockEdit]: {
          blockHandle: {
            getPosition: (deriveContext) => {
              const domRect = deriveContext.active.el.getBoundingClientRect();
              const { proseMirrorLeft, paddingX } = getBlockHandleMetrics();
              const x = proseMirrorLeft + paddingX;
              return {
                x,
                y: domRect.y,
                width: 0,
                height: domRect.height,
                top: domRect.top,
                bottom: domRect.bottom,
                left: x,
                right: x,
              };
            },
            getOffset: () => 4,
            middleware: [
              {
                name: "clampToEditor",
                fn: ({ x, y }: { x: number; y: number }) => {
                  const wrapper = document.querySelector(`[data-tab-id="${tabId}"] .moflow-editor-wrapper`);
                  if (!wrapper) return { x, y };
                  const rect = wrapper.getBoundingClientRect();
                  if (y < rect.top || y > rect.bottom - 24) {
                    return { x: -9999, y: -9999 };
                  }
                  return { x, y };
                },
              },
            ],
          },
        },
        [Crepe.Feature.Placeholder]: {
          text: "Start writing...",
          mode: "doc",
        },
        [Crepe.Feature.Toolbar]: {
          boldIcon: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" data-toolbar-key="bold"><path d="M8.85758 18.625C8.4358 18.625 8.07715 18.4772 7.78163 18.1817C7.48613 17.8862 7.33838 17.5275 7.33838 17.1058V6.8942C7.33838 6.47242 7.48613 6.11377 7.78163 5.81825C8.07715 5.52275 8.4358 5.375 8.85758 5.375H12.1999C13.2191 5.375 14.1406 5.69231 14.9643 6.32693C15.788 6.96154 16.1999 7.81603 16.1999 8.89038C16.1999 9.63779 16.0194 10.2471 15.6585 10.7183C15.2976 11.1894 14.9088 11.5314 14.4922 11.7442C15.005 11.9211 15.4947 12.2708 15.9614 12.7933C16.428 13.3157 16.6614 14.0192 16.6614 14.9038C16.6614 16.182 16.1902 17.1217 15.2479 17.723C14.3056 18.3243 13.3563 18.625 12.3999 18.625H8.85758ZM9.4883 16.6327H12.3191C13.1063 16.6327 13.6627 16.4141 13.9884 15.9769C14.314 15.5397 14.4768 15.1205 14.4768 14.7192C14.4768 14.3179 14.314 13.8987 13.9884 13.4615C13.6627 13.0243 13.0909 12.8057 12.273 12.8057H9.4883V16.6327ZM9.4883 10.875H12.0826C12.6903 10.875 13.172 10.7013 13.5278 10.3539C13.8836 10.0064 14.0615 9.59037 14.0615 9.10575C14.0615 8.59035 13.8733 8.16918 13.497 7.84225C13.1207 7.51533 12.6595 7.35188 12.1133 7.35188H9.4883V10.875Z"/></svg>`,
          italicIcon: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" data-toolbar-key="italic"><path d="M6.29811 18.625C6.04505 18.625 5.83115 18.5375 5.65641 18.3626C5.48166 18.1877 5.39429 17.9736 5.39429 17.7203C5.39429 17.467 5.48166 17.2532 5.65641 17.0788C5.83115 16.9045 6.04505 16.8173 6.29811 16.8173H9.21159L12.452 7.18265H9.53851C9.28545 7.18265 9.07155 7.0952 8.89681 6.9203C8.72206 6.7454 8.63469 6.5313 8.63469 6.278C8.63469 6.02472 8.72206 5.81089 8.89681 5.63652C9.07155 5.46217 9.28545 5.375 9.53851 5.375H16.8847C17.1377 5.375 17.3516 5.46245 17.5264 5.63735C17.7011 5.81225 17.7885 6.02634 17.7885 6.27962C17.7885 6.53293 17.7011 6.74676 17.5264 6.92113C17.3516 7.09548 17.1377 7.18265 16.8847 7.18265H14.2789L11.0385 16.8173H13.6443C13.8973 16.8173 14.1112 16.9048 14.286 17.0797C14.4607 17.2546 14.5481 17.4687 14.5481 17.722C14.5481 17.9752 14.4607 18.1891 14.286 18.3634C14.1112 18.5378 13.8973 18.625 13.6443 18.625H6.29811Z"/></svg>`,
          strikethroughIcon: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" data-toolbar-key="strikethrough"><path d="M3.25 13.7404C3.0375 13.7404 2.85938 13.6684 2.71563 13.5246C2.57188 13.3808 2.5 13.2026 2.5 12.99C2.5 12.7774 2.57188 12.5993 2.71563 12.4558C2.85938 12.3122 3.0375 12.2404 3.25 12.2404H20.75C20.9625 12.2404 21.1406 12.3123 21.2843 12.4561C21.4281 12.5999 21.5 12.7781 21.5 12.9907C21.5 13.2033 21.4281 13.3814 21.2843 13.525C21.1406 13.6686 20.9625 13.7404 20.75 13.7404H3.25ZM10.9423 10.2596V6.62495H6.5673C6.2735 6.62495 6.02377 6.52201 5.8181 6.31613C5.61245 6.11026 5.50963 5.86027 5.50963 5.56615C5.50963 5.27205 5.61245 5.02083 5.8181 4.8125C6.02377 4.60417 6.2735 4.5 6.5673 4.5H17.4423C17.7361 4.5 17.9858 4.60294 18.1915 4.80883C18.3971 5.01471 18.5 5.2647 18.5 5.5588C18.5 5.85292 18.3971 6.10413 18.1915 6.31245C17.9858 6.52078 17.7361 6.62495 17.4423 6.62495H13.0673V10.2596H10.9423ZM10.9423 15.7211H13.0673V18.4423C13.0673 18.7361 12.9643 18.9858 12.7584 19.1915C12.5526 19.3971 12.3026 19.5 12.0085 19.5C11.7144 19.5 11.4631 19.3962 11.2548 19.1887C11.0465 18.9811 10.9423 18.7291 10.9423 18.4327V15.7211Z"/></svg>`,
          codeIcon: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" data-toolbar-key="code"><g clip-path="url(#clip0_977_8081)"><path d="M9.4 16.6L4.8 12L9.4 7.4L8 6L2 12L8 18L9.4 16.6ZM14.6 16.6L19.2 12L14.6 7.4L16 6L22 12L16 18L14.6 16.6Z"/></g><defs><clipPath id="clip0_977_8081"><rect width="24" height="24" /></clipPath></defs></svg>`,
          linkIcon: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" data-toolbar-key="link"><path d="M17.0385 19.5003V16.5388H14.0769V15.0388H17.0385V12.0773H18.5384V15.0388H21.5V16.5388H18.5384V19.5003H17.0385ZM10.8077 16.5388H7.03845C5.78282 16.5388 4.7125 16.0963 3.8275 15.2114C2.9425 14.3266 2.5 13.2564 2.5 12.0009C2.5 10.7454 2.9425 9.67504 3.8275 8.78979C4.7125 7.90454 5.78282 7.46191 7.03845 7.46191H10.8077V8.96186H7.03845C6.1987 8.96186 5.48235 9.25834 4.8894 9.85129C4.29645 10.4442 3.99998 11.1606 3.99998 12.0003C3.99998 12.8401 4.29645 13.5564 4.8894 14.1494C5.48235 14.7423 6.1987 15.0388 7.03845 15.0388H10.8077V16.5388ZM8.25 12.7503V11.2504H15.75V12.7503H8.25ZM21.5 12.0003H20C20 11.1606 19.7035 10.4442 19.1106 9.85129C18.5176 9.25834 17.8013 8.96186 16.9615 8.96186H13.1923V7.46191H16.9615C18.2171 7.46191 19.2875 7.90441 20.1725 8.78939C21.0575 9.67439 21.5 10.7447 21.5 12.0003Z"/></svg>`,
          latexIcon: `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" data-toolbar-key="latex"><path fill="currentColor" d="M7 19v-.808L13.096 12L7 5.808V5h10v1.25H9.102L14.727 12l-5.625 5.77H17V19z"/></svg>`,
          buildToolbar: (builder) => {
            builder
              .getGroup("formatting")
              .addItem("highlight", {
                icon: highlightIcon,
                active: (ctx: Ctx) => {
                  const commands = ctx.get(commandsCtx);
                  return commands.call(isMarkSelectedCommand.key, highlightSchema.type(ctx));
                },
                onRun: (ctx: Ctx) => {
                  const commands = ctx.get(commandsCtx);
                  commands.call(toggleHighlightCommand.key);
                },
              });
            builder
              .addGroup("ai", "AI")
              .addItem("explain", {
                icon: explainIcon,
                active: () => false,
                onRun: (ctx: Ctx) => {
                  const view = ctx.get(editorViewCtx);
                  const text = getSelectionMarkdown(ctx, view);
                  if (!text) return;
                  const coords = view.coordsAtPos(view.state.selection.from);
                  useAISelectionStore.getState().triggerExplain(text, {
                    x: coords.left,
                    y: coords.bottom,
                  });
                },
              })
              .addItem("translate", {
                icon: translateIcon,
                active: () => false,
                onRun: (ctx: Ctx) => {
                  const view = ctx.get(editorViewCtx);
                  const text = getSelectionMarkdown(ctx, view);
                  if (!text) return;
                  const coords = view.coordsAtPos(view.state.selection.from);
                  useAISelectionStore.getState().triggerTranslate(text, {
                    x: coords.left,
                    y: coords.bottom,
                  });
                },
              })
              .addItem("ask", {
                icon: askIcon,
                active: () => false,
                onRun: (ctx: Ctx) => {
                  const view = ctx.get(editorViewCtx);
                  const text = getSelectionMarkdown(ctx, view);
                  if (!text) return;
                  const coords = view.coordsAtPos(view.state.selection.from);
                  useAISelectionStore.getState().triggerAsk(text, {
                    x: coords.left,
                    y: coords.bottom,
                  });
                },
              })
              .addItem("polish", {
                icon: polishIcon,
                active: () => false,
                onRun: (ctx: Ctx) => {
                  const view = ctx.get(editorViewCtx);
                  const text = getSelectionMarkdown(ctx, view);
                  if (!text) return;
                  const coords = view.coordsAtPos(view.state.selection.from);
                  useAISelectionStore.getState().triggerPolish(text, {
                    x: coords.left,
                    y: coords.bottom,
                  });
                },
              });
          },
        },
      },
    });

    crepe.editor.use(highlightPlugin);
    crepe.editor.use(searchPlugin);
    crepe.editor.use(mermaidPlugin);

    crepe.on((listener) => {
      listener.mounted((ctx) => {
        const view = ctx.get(editorViewCtx);
        useSearchStore.getState().setEditorView(tabId, view);
        useAISelectionStore.getState().setReplaceSelection((newText: string) => {
          const crepe = crepeRef.current;
          if (!crepe) return;
          const editor = crepe.editor;
          if (!editor || editor.status !== EditorStatus.Created) return;
          editor.action((ctx) => {
            const view = ctx.get(editorViewCtx);
            const parser = ctx.get(parserCtx);
            const { from, to } = view.state.selection;
            if (from === to) return;
            const trimmed = newText.trim();
            try {
              const doc = parser(trimmed);
              if (doc && doc.content.size > 0) {
                view.dispatch(view.state.tr.replace(from, to, Slice.maxOpen(doc.content)));
                return;
              }
            } catch {
              view.dispatch(view.state.tr.insertText(trimmed, from, to));
            }
          });
        });
        const existing = view.props.nodeViews ?? {};
        view.setProps({
          nodeViews: {
            ...existing,
            html: createHtmlNodeView(),
          },
        });
        useTabStore.getState().setEditorActions(tabId, {
          undo: () => {
            const ed = crepeRef.current?.editor;
            if (ed?.status !== EditorStatus.Created) return;
            ed.action((c) => { c.get(commandsCtx).call(undoCommand.key); });
            if (modeRef.current === "source") {
              skipHistoryRef.current = true;
              const md = crepeRef.current?.getMarkdown() ?? syncedContentRef.current;
              useTabStore.getState().updateTabContent(tabId, md);
            }
          },
          redo: () => {
            const ed = crepeRef.current?.editor;
            if (ed?.status !== EditorStatus.Created) return;
            ed.action((c) => { c.get(commandsCtx).call(redoCommand.key); });
            if (modeRef.current === "source") {
              skipHistoryRef.current = true;
              const md = crepeRef.current?.getMarkdown() ?? syncedContentRef.current;
              useTabStore.getState().updateTabContent(tabId, md);
            }
          },
        });
      });

      listener.markdownUpdated((_ctx, markdown) => {
        if (editorReadyRef.current) {
          syncedContentRef.current = markdown;
          if (modeRef.current === "source") return;
          if (justLoadedRef.current) {
            justLoadedRef.current = false;
            useTabStore.getState().updateTabMeta(tabId, { content: markdown });
          } else {
            useTabStore.getState().updateTabContent(tabId, markdown);
          }
        }
      });
    });

    editorReadyRef.current = true;
    crepeRef.current = crepe;
    performance.mark(`editor-ready-${tabId}`);
    performance.measure(`editor-init-${tabId}`, `editor-init-start-${tabId}`, `editor-ready-${tabId}`);
    if (tabId === useTabStore.getState().activeFileId) {
      window.__startupMark?.("editor-ready", "react-mount");
    }

    return crepe;
  }, [tabId]);

  useEffect(() => {
    if (loading) return;
    const editor = getEditor();
    if (!editor || editor.status !== EditorStatus.Created) return;

    const getHTMLFn = () => editor.action(getHTML());
    setGetEditorHTML(tabId, getHTMLFn);

    if (content === syncedContentRef.current) return;

    if (modeRef.current === "source" && !skipHistoryRef.current) {
      editor.action(replaceAll(content, false));
    } else {
      editor.action(replaceAllNoHistory(content));
    }
    skipHistoryRef.current = false;
    syncedContentRef.current = content;
  }, [content, loading, getEditor, setGetEditorHTML, tabId]);

  useEffect(() => {
    if (mode !== "wysiwyg") return;
    if (savedSelectionRef.current === null) return;
    const crepe = crepeRef.current;
    if (!crepe || !crepe.editor || crepe.editor.status !== EditorStatus.Created) return;

    const sel = savedSelectionRef.current;
    const scrollTop = savedScrollRef.current;
    const contentAtSwitch = contentAtSwitchRef.current;
    savedSelectionRef.current = null;
    contentAtSwitchRef.current = null;

    const contentChanged = contentAtSwitch !== null && contentAtSwitch !== content;

    requestAnimationFrame(() => {
      try {
        const view = crepe.editor.ctx.get(editorViewCtx);
        if (!contentChanged) {
          const pos = Math.min(sel.from, view.state.doc.content.size);
          view.dispatch(view.state.tr.setSelection(TextSelection.near(view.state.tr.doc.resolve(pos))));
        }
        const wrapper = document.querySelector(`[data-tab-id="${tabId}"] .moflow-editor-wrapper`) as HTMLElement | null;
        if (wrapper) wrapper.scrollTop = scrollTop;
      } catch { /* ignore */ }
    });
  }, [mode, content, tabId]);

  useEffect(() => {
    return () => {
      setGetEditorHTML(tabId, null);
      setEditorActions(tabId, null);
      useSearchStore.getState().setEditorView(tabId, null);
    };
  }, [setGetEditorHTML, setEditorActions, tabId]);

  useEffect(() => {
    let tooltipEl: HTMLElement | null = null;

    const ensureTooltip = () => {
      if (!tooltipEl) {
        tooltipEl = document.createElement("div");
        tooltipEl.className = "moflow-slash-tooltip";
        tooltipEl.style.display = "none";
        document.body.appendChild(tooltipEl);
      }
      return tooltipEl;
    };

    const showTooltip = (li: HTMLElement) => {
      const tip = li.dataset.tip;
      if (!tip) return;
      const el = ensureTooltip();
      el.textContent = tip;
      el.style.display = "block";
      const liRect = li.getBoundingClientRect();
      const tipRect = el.getBoundingClientRect();
      let left = liRect.left + liRect.width / 2 - tipRect.width / 2;
      let top = liRect.top - tipRect.height - 8;
      if (left < 4) left = 4;
      if (top < 4) top = liRect.bottom + 8;
      el.style.left = `${left}px`;
      el.style.top = `${top}px`;
    };

    const hideTooltip = () => {
      if (tooltipEl) tooltipEl.style.display = "none";
    };

    const injectSlashAttrs = (root: ParentNode) => {
      const items = root.querySelectorAll(".milkdown-slash-menu .menu-group li");
      items.forEach((li) => {
        if (li instanceof HTMLElement && !li.dataset.tip) {
          const span = li.querySelector("span:not(.milkdown-icon)");
          const label = span?.textContent?.trim() ?? "";
          if (!label) return;
          const entry = SLASH_MD_MAP[label];
          const nameLine = entry ? t(entry.i18nKey) : label;
          const mdLine = entry ? `Markdown: ${entry.md}` : "";
          li.dataset.tip = mdLine ? `${nameLine}\n${mdLine}` : nameLine;
          li.addEventListener("mouseenter", () => showTooltip(li));
          li.addEventListener("mouseleave", hideTooltip);
        }
      });
    };
    const observer = new MutationObserver(() => {
      injectSlashAttrs(document);
    });

    observer.observe(document.body, { childList: true, subtree: true });
    injectSlashAttrs(document);

    return () => {
      observer.disconnect();
      if (tooltipEl) tooltipEl.remove();
    };
  }, []);

  useEffect(() => {
    const wrapper = document.querySelector(`[data-tab-id="${tabId}"] .moflow-editor-wrapper`) as HTMLElement | null;
    if (!wrapper) return;

    const onMove = (e: MouseEvent) => {
      const rect = wrapper.getBoundingClientRect();
      wrapper.classList.toggle("scrollbar-visible", e.clientX > rect.right - 12);
    };
    const onLeave = () => wrapper.classList.remove("scrollbar-visible");

    wrapper.addEventListener("mousemove", onMove);
    wrapper.addEventListener("mouseleave", onLeave);
    return () => {
      wrapper.removeEventListener("mousemove", onMove);
      wrapper.removeEventListener("mouseleave", onLeave);
    };
  }, [tabId]);

  useEffect(() => {
    const mergedIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="18" viewBox="0 0 28 18" fill="none"><path d="M3 9h8M7 5v8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><circle cx="18" cy="4" r="1.2" fill="currentColor"/><circle cx="18" cy="9" r="1.2" fill="currentColor"/><circle cx="18" cy="14" r="1.2" fill="currentColor"/><circle cx="22" cy="4" r="1.2" fill="currentColor"/><circle cx="22" cy="9" r="1.2" fill="currentColor"/><circle cx="22" cy="14" r="1.2" fill="currentColor"/></svg>`;

    const patchHandle = (handle: Element) => {
      const items = handle.querySelectorAll(".operation-item");
      const handleItem = items[1] as HTMLElement | undefined;
      if (!handleItem || handleItem.dataset.merged) return;
      handleItem.dataset.merged = "1";

      const iconSpan = handleItem.querySelector(".milkdown-icon");
      if (iconSpan) iconSpan.innerHTML = mergedIcon;

      let startX = 0;
      let startY = 0;

      handleItem.addEventListener("pointerdown", ((e: PointerEvent) => {
        startX = e.clientX;
        startY = e.clientY;
      }) as EventListener);

      handleItem.addEventListener("pointerup", ((e: PointerEvent) => {
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        if (Math.sqrt(dx * dx + dy * dy) < 5) {
          e.preventDefault();
          e.stopPropagation();
          const addItem = items[0] as HTMLElement;
          if (addItem) {
            addItem.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
            addItem.dispatchEvent(new PointerEvent("pointerup", { bubbles: true }));
          }
        }
      }) as EventListener);

    };

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of Array.from(mutation.addedNodes)) {
          if (!(node instanceof HTMLElement)) continue;
          if (node.classList?.contains("milkdown-block-handle")) {
            patchHandle(node);
          } else {
            const handles = node.querySelectorAll?.(".milkdown-block-handle");
            handles?.forEach(patchHandle);
          }
        }
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });
    document.querySelectorAll(".milkdown-block-handle").forEach(patchHandle);

    return () => observer.disconnect();
  }, [tabId]);

  const wrapperRef = useRef<HTMLDivElement>(null);

  const handleMouseDown = () => {
    wrapperRef.current?.setAttribute("data-selecting", "true");
  };

  const handleMouseUp = () => {
    setTimeout(() => {
      wrapperRef.current?.removeAttribute("data-selecting");
    }, 50);
  };

  return (
    <div ref={wrapperRef} className="moflow-editor-wrapper" data-editor-theme={editorTheme} onMouseDown={handleMouseDown} onMouseUp={handleMouseUp}>
      <div className={mode === "source" ? "moflow-milkdown-hidden" : ""}>
        <Milkdown />
      </div>
      {mode === "source" && (
        <SourceModeEditor
          content={content}
          setContent={setContent}
        />
      )}
      <SelectionAIPanel />
      <SearchBar />
    </div>
  );
});

function SourceModeEditor({
  content,
  setContent,
}: {
  content: string;
  setContent: (c: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<CMEditorView | null>(null);
  const syncingRef = useRef(false);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const contentRef = useRef(content);

  useEffect(() => {
    contentRef.current = content;
  }, [content]);

  useEffect(() => {
    if (!containerRef.current) return;

    const filteredHistoryKeymap = historyKeymap.filter((b) => {
      const k = b.key;
      return k !== "Mod-z" && k !== "Mod-y" && k !== "Mod-Shift-z";
    });

    const state = CMEditorState.create({
      doc: contentRef.current,
      extensions: [
        highlightSpecialChars(),
        drawSelection(),
        indentOnInput(),
        syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
        bracketMatching(),
        closeBrackets(),
        highlightActiveLine(),
        highlightSelectionMatches(),
        cmMarkdown(),
        keymap.of([
          ...closeBracketsKeymap,
          ...defaultKeymap,
          ...searchKeymap,
          ...filteredHistoryKeymap,
        ]),
        keymap.of([
          {
            key: "Mod-z",
            run: () => {
              const activeId = useTabStore.getState().activeFileId;
              useTabStore.getState().editorActionMap.get(activeId)?.undo?.();
              return true;
            },
          },
          {
            key: "Mod-y",
            run: () => {
              const activeId = useTabStore.getState().activeFileId;
              useTabStore.getState().editorActionMap.get(activeId)?.redo?.();
              return true;
            },
          },
          {
            key: "Mod-Shift-z",
            run: () => {
              const activeId = useTabStore.getState().activeFileId;
              useTabStore.getState().editorActionMap.get(activeId)?.redo?.();
              return true;
            },
          },
          indentWithTab,
        ]),
        CMEditorView.updateListener.of((update: ViewUpdate) => {
          if (syncingRef.current) return;
          if (update.docChanged) {
            if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
            debounceTimerRef.current = setTimeout(() => {
              const newContent = update.state.doc.toString();
              syncingRef.current = true;
              setContent(newContent);
              syncingRef.current = false;
            }, 500);
          }
        }),
        CMEditorView.theme({
          "&": { height: "100%" },
          ".cm-scroller": { overflow: "visible" },
          ".cm-gutters": { display: "none" },
        }),
      ],
    });

    const view = new CMEditorView({
      state,
      parent: containerRef.current,
    });
    viewRef.current = view;

    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      view.destroy();
      viewRef.current = null;
    };
  }, [setContent]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view || syncingRef.current) return;
    const currentDoc = view.state.doc.toString();
    if (currentDoc === content) return;
    syncingRef.current = true;
    view.dispatch({
      changes: { from: 0, to: currentDoc.length, insert: content },
    });
    syncingRef.current = false;
  }, [content]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === "s") {
        e.preventDefault();
      }
    };
    const el = containerRef.current;
    el?.addEventListener("keydown", handler);
    return () => el?.removeEventListener("keydown", handler);
  }, []);

  return (
    <div className="moflow-source-wrapper" ref={containerRef} />
  );
}

export default function Editor() {
  useT();
  const files = useTabStore((s) => s.files);
  const activeFileId = useTabStore((s) => s.activeFileId);
  const sessionInitialized = useTabStore((s) => s.sessionInitialized);
  const workspaceRoot = useTabStore((s) => s.workspaceRoot);

  if (!sessionInitialized) return null;

  if (files.length === 0) {
    if (workspaceRoot) {
      const wsName = workspaceRoot.replace(/\\/g, "/").split("/").filter(Boolean).pop() || workspaceRoot;
      return (
        <div className="flex-1 min-h-0 flex items-center justify-center bg-moflow-bg">
          <div className="flex flex-col items-center gap-3 text-moflow-text-secondary select-none">
            <div className="text-sm opacity-70">{wsName}</div>
            <div className="text-xs opacity-50">{t("editor.aiAvailable")}</div>
            {(["newFile", "openFile"] as const).map((id) => (
              <div key={id} className="flex items-center gap-2 text-sm">
                <kbd className="px-2 py-0.5 rounded bg-moflow-code-bg text-moflow-text text-xs font-mono border border-moflow-border">
                  {getShortcutDisplay(id)}
                </kbd>
                <span className="opacity-50 text-xs">{getShortcutLabel(id)}</span>
              </div>
            ))}
          </div>
        </div>
      );
    }

    return (
      <div className="flex-1 min-h-0 flex items-center justify-center bg-moflow-bg">
        <div className="flex flex-col items-center gap-3 text-moflow-text-secondary select-none">
          {(["newFile", "openFile", "openFolder"] as const).map((id) => (
            <div key={id} className="flex items-center gap-2 text-sm">
              <kbd className="px-2 py-0.5 rounded bg-moflow-code-bg text-moflow-text text-xs font-mono border border-moflow-border">
                {getShortcutDisplay(id)}
              </kbd>
              <span className="opacity-50 text-xs">{getShortcutLabel(id)}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex-1 min-h-0">
      {files.map((tab) => (
        <div
          key={tab.id}
          data-tab-id={tab.id}
          className="absolute inset-0 flex flex-col"
          style={{
            visibility: tab.id === activeFileId ? "visible" : "hidden",
            pointerEvents: tab.id === activeFileId ? "auto" : "none",
          }}
        >
          <MilkdownProvider>
            <MilkdownWrapper tabId={tab.id} />
          </MilkdownProvider>
        </div>
      ))}
    </div>
  );
}
