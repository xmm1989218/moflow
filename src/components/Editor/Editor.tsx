import { Crepe } from "@milkdown/crepe";
import { Milkdown, MilkdownProvider, useEditor } from "@milkdown/react";
import { replaceAll, getHTML } from "@milkdown/utils";
import { EditorStatus, editorViewCtx } from "@milkdown/core";
import type { Ctx } from "@milkdown/kit/ctx";
import { useAppStore } from "../../stores/appStore";
import { useAISelectionStore } from "../../stores/aiSelectionStore";
import { highlightPlugin, highlightSchema, toggleHighlightCommand } from "../../lib/highlightMark";
import { commandsCtx } from "@milkdown/kit/core";
import { isMarkSelectedCommand } from "@milkdown/kit/preset/commonmark";
import "@milkdown/crepe/theme/common/style.css";
import "@milkdown/crepe/theme/nord.css";
import "@milkdown/crepe/theme/nord-dark.css";
import "./Editor.css";
import SelectionAIPanel from "./SelectionAIPanel";
import { useEffect, useRef, useCallback } from "react";
import { offset, shift } from "@floating-ui/dom";

const isZh = navigator.language.startsWith("zh");

const SLASH_MD_MAP: Record<string, { zh: string; md: string }> = {
  "Text": { zh: "正文", md: "paragraph" },
  "Heading 1": { zh: "一级标题", md: "# " },
  "Heading 2": { zh: "二级标题", md: "## " },
  "Heading 3": { zh: "三级标题", md: "### " },
  "Heading 4": { zh: "四级标题", md: "#### " },
  "Heading 5": { zh: "五级标题", md: "##### " },
  "Heading 6": { zh: "六级标题", md: "###### " },
  "Quote": { zh: "引用", md: "> " },
  "Divider": { zh: "分割线", md: "---" },
  "Bullet List": { zh: "无序列表", md: "- " },
  "Ordered List": { zh: "有序列表", md: "1. " },
  "Task List": { zh: "待办列表", md: "- [ ] " },
  "Image": { zh: "图片", md: "![alt](url)" },
  "Code": { zh: "代码块", md: "```↵```" },
  "Table": { zh: "表格", md: "| | |\\n|---|---|" },
  "Math": { zh: "数学公式", md: "$$↵$$" },
};

const explainIcon = `
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">
    <path d="M2 3.5C2 3.22386 2.22386 3 2.5 3H8C10.7614 3 13 5.23858 13 8V20.5C13 20.7761 12.7761 21 12.5 21H12C11.1716 21 10.5 20.3284 10.5 19.5V17.5C10.5 16.1193 9.38071 15 8 15H2.5C2.22386 15 2 14.7761 2 14.5V3.5ZM4.5 5V13H8C8.88071 13 9.70849 13.2488 10.4157 13.6817C10.7753 13.9023 11.2836 13.7381 11.3304 13.3219C11.3761 12.9177 11 12.5871 11 12.1803V8C11 6.34315 9.65685 5 8 5H4.5Z"/>
    <path d="M22 3.5C22 3.22386 21.7761 3 21.5 3H16C13.2386 3 11 5.23858 11 8V20.5C11 20.7761 11.2239 21 11.5 21H12C12.8284 21 13.5 20.3284 13.5 19.5V17.5C13.5 16.1193 14.6193 15 16 15H21.5C21.7761 15 22 14.7761 22 14.5V3.5ZM19.5 5V13H16C15.1193 13 14.2915 13.2488 13.5843 13.6817C13.2247 13.9023 12.7164 13.7381 12.6696 13.3219C12.6239 12.9177 13 12.5871 13 12.1803V8C13 6.34315 14.3431 5 16 5H19.5Z"/>
  </svg>
`;

const translateIcon = `
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">
    <path d="M12.87 15.07l-2.54-2.51.03-.03A17.52 17.52 0 0 0 14.07 6H17V4h-7V2H8v2H1v1.99h11.17C11.5 7.92 10.44 9.75 9 11.35 8.07 10.32 7.3 9.19 6.69 8h-2c.73 1.63 1.73 3.17 2.98 4.56l-5.09 5.02L4 19l5-5 3.11 3.11.76-2.04zM18.5 10h-2L12 22h2l1.12-3h4.75L21 22h2l-4.5-12zm-2.62 7l1.62-4.33L19.12 17h-3.24z"/>
  </svg>
`;

const askIcon = `
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">
    <path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0L9.937 15.5z"/>
    <path d="M19 3h2v4h-2V3z"/>
    <path d="M19 7h4v2h-4V7z"/>
  </svg>
`;

const highlightIcon = `
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" style="background-color:#fff3b0;border-radius:4px">
    <path d="M12 4L7 17h2.4l1-3h5.2l1 3H19L14 4h-2zm-1 8l1.5-4.5h.1L14.1 12H11z" style="fill:#000"/>
  </svg>
`;

function MilkdownWrapper() {
  const activeFileId = useAppStore((s) => s.activeFileId);
  const content = useAppStore((s) => {
    const tab = s.files.find((f) => f.id === s.activeFileId);
    return tab?.content ?? "";
  });
  const editorTheme = useAppStore((s) => s.editorTheme);
  const mode = useAppStore((s) => {
    const tab = s.files.find((f) => f.id === s.activeFileId);
    return tab?.mode ?? "wysiwyg";
  });
  const updateTabContent = useAppStore((s) => s.updateTabContent);
  const setGetEditorHTML = useAppStore((s) => s.setGetEditorHTML);

  const setContent = useCallback(
    (c: string) => updateTabContent(activeFileId, c),
    [activeFileId, updateTabContent]
  );

  const contentRef = useRef(content);
  const editorReadyRef = useRef(false);
  const syncedContentRef = useRef(content);
  const justLoadedRef = useRef(true);

  useEffect(() => {
    contentRef.current = content;
  }, [content]);

  const { get: getEditor, loading } = useEditor((root) => {
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
        [Crepe.Feature.BlockEdit]: {
          blockHandle: {
            floatingUIOptions: {
              middleware: [
                offset(16),
                shift({ padding: 4, crossAxis: true }),
              ],
            },
          },
        },
      },
      featureConfigs: {
        [Crepe.Feature.Placeholder]: {
          text: "Start writing...",
          mode: "doc",
        },
        [Crepe.Feature.Toolbar]: {
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
                  const { from, to } = view.state.selection;
                  const text = view.state.doc.textBetween(from, to);
                  if (!text) return;
                  const coords = view.coordsAtPos(from);
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
                  const { from, to } = view.state.selection;
                  const text = view.state.doc.textBetween(from, to);
                  if (!text) return;
                  const coords = view.coordsAtPos(from);
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
                  const { from, to } = view.state.selection;
                  const text = view.state.doc.textBetween(from, to);
                  if (!text) return;
                  const coords = view.coordsAtPos(from);
                  useAISelectionStore.getState().triggerAsk(text, {
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

    crepe.on((listener) => {
      listener.markdownUpdated((_ctx, markdown) => {
        if (editorReadyRef.current) {
          syncedContentRef.current = markdown;
          const currentId = useAppStore.getState().activeFileId;
          if (justLoadedRef.current) {
            justLoadedRef.current = false;
            useAppStore.getState().updateTabMeta(currentId, { content: markdown });
          } else {
            useAppStore.getState().updateTabContent(currentId, markdown);
          }
        }
      });
    });

    editorReadyRef.current = true;

    return crepe;
  }, []);

  useEffect(() => {
    if (loading) return;
    const editor = getEditor();
    if (!editor || editor.status !== EditorStatus.Created) return;

    const getHTMLFn = () => editor.action(getHTML());
    setGetEditorHTML(getHTMLFn);

    if (content === syncedContentRef.current) return;

    justLoadedRef.current = true;
    editor.action(replaceAll(content, true));
    syncedContentRef.current = content;
  }, [content, loading, getEditor, setGetEditorHTML]);

  useEffect(() => {
    return () => setGetEditorHTML(null);
  }, [setGetEditorHTML]);

  useEffect(() => {
    let tooltipEl: HTMLDivElement | null = null;

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
          const nameLine = isZh && entry ? entry.zh : label;
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
    const wrapper = document.querySelector(".moflow-editor-wrapper");
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
  }, []);

  useEffect(() => {
    const mergedIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="18" viewBox="0 0 28 18" fill="none"><path d="M3 9h8M7 5v8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><circle cx="18" cy="4" r="1.2" fill="currentColor"/><circle cx="18" cy="9" r="1.2" fill="currentColor"/><circle cx="18" cy="14" r="1.2" fill="currentColor"/><circle cx="22" cy="4" r="1.2" fill="currentColor"/><circle cx="22" cy="9" r="1.2" fill="currentColor"/><circle cx="22" cy="14" r="1.2" fill="currentColor"/></svg>`;

    const patchHandle = (handle: Element) => {
      const items = handle.querySelectorAll(".operation-item");
      const handleItem = items[1];
      if (!handleItem || handleItem.dataset.merged) return;
      handleItem.dataset.merged = "1";

      const iconSpan = handleItem.querySelector(".milkdown-icon");
      if (iconSpan) iconSpan.innerHTML = mergedIcon;

      let startX = 0;
      let startY = 0;

      handleItem.addEventListener("pointerdown", (e: PointerEvent) => {
        startX = e.clientX;
        startY = e.clientY;
      });

      handleItem.addEventListener("pointerup", (e: PointerEvent) => {
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
      });
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
  }, []);

  return (
    <div className="moflow-editor-wrapper" data-editor-theme={editorTheme}>
      {mode === "wysiwyg" ? (
        <Milkdown />
      ) : (
        <SourceModeEditor content={content} setContent={setContent} />
      )}
      <SelectionAIPanel />
    </div>
  );
}

function SourceModeEditor({ content, setContent }: { content: string; setContent: (c: string) => void }) {
  return (
    <div className="moflow-source-wrapper">
      <textarea
        className="moflow-source-textarea"
        value={content}
        onChange={(e) => setContent(e.target.value)}
        spellCheck={false}
      />
    </div>
  );
}

export default function Editor() {
  return (
    <MilkdownProvider>
      <MilkdownWrapper />
    </MilkdownProvider>
  );
}
