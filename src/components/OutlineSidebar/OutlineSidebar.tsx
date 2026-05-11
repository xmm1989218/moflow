import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTabStore } from "../../stores/tabStore";
import { useThemeStore } from "../../stores/themeStore";
import { useSearchStore } from "../../stores/searchStore";
import { buildOutlineTree, type OutlineItem } from "../../lib/outlineTree";
import { t } from "../../lib/i18n";
import FileTree from "../FileTree/FileTree";

function OutlineNode({
  item,
  activeId,
  expandedIds,
  onToggle,
  onJump,
}: {
  item: OutlineItem;
  activeId: string | null;
  expandedIds: Set<string>;
  onToggle: (id: string) => void;
  onJump: (item: OutlineItem) => void;
}) {
  const hasChildren = item.children.length > 0;
  const isExpanded = expandedIds.has(item.id);
  const isActive = activeId === item.id;

  return (
    <li className="m-0 p-0 list-none">
      <div
        className={`flex items-center h-7 pr-2 cursor-pointer text-[13px] transition-[background-color,color] duration-100 gap-0.5 relative ${isActive ? "text-moflow-accent font-medium before:content-[''] before:absolute before:left-0 before:top-0.5 before:bottom-0.5 before:w-0.5 before:bg-moflow-accent before:rounded-sm" : "text-moflow-text-secondary hover:bg-moflow-bg-secondary hover:text-moflow-text"}`}
        style={{ paddingLeft: 8 + (item.level - 1) * 16 }}
        onClick={() => onJump(item)}
      >
        {hasChildren ? (
          <button
            className="inline-flex items-center justify-center w-4 h-4 p-0 border-none bg-none text-moflow-text-secondary cursor-pointer shrink-0 rounded-sm hover:text-moflow-text hover:bg-moflow-bg-secondary"
            onClick={(e) => {
              e.stopPropagation();
              onToggle(item.id);
            }}
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 12 12"
              style={{
                transform: isExpanded ? "rotate(90deg)" : "rotate(0deg)",
                transition: "transform 0.15s",
              }}
            >
              <path d="M4 2l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        ) : (
          <span className="inline-flex items-center justify-center w-4 h-4 p-0 shrink-0 cursor-default" />
        )}
        <span className="overflow-hidden text-ellipsis whitespace-nowrap flex-1 min-w-0 leading-7" title={item.text}>
          {item.text}
        </span>
      </div>
      {hasChildren && isExpanded && (
        <ul className="list-none m-0 p-0">
          {item.children.map((child) => (
            <OutlineNode
              key={child.id}
              item={child}
              activeId={activeId}
              expandedIds={expandedIds}
              onToggle={onToggle}
              onJump={onJump}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

export default function OutlineSidebar() {
  const outlineWidth = useThemeStore((s) => s.outlineWidth);
  const setOutlineWidth = useThemeStore((s) => s.setOutlineWidth);
  const leftPanelTab = useThemeStore((s) => s.leftPanelTab);
  const setLeftPanelTab = useThemeStore((s) => s.setLeftPanelTab);
  const activeFileId = useTabStore((s) => s.activeFileId);
  const content = useTabStore(
    (s) => {
      const tab = s.files.find((f) => f.id === s.activeFileId);
      return tab?.content ?? "";
    }
  );

  const tree = useMemo(() => buildOutlineTree(content), [content]);
  const flatList = useMemo(() => flattenTree(tree), [tree]);

  const [expandedOverrides, setExpandedOverrides] = useState<Map<string, boolean>>(new Map());
  const [activeId, setActiveId] = useState<string | null>(null);

  const expandedIds = useMemo(() => {
    const ids = new Set(flatList.map((i) => i.id));
    for (const [id, expanded] of expandedOverrides) {
      if (expanded) ids.add(id);
      else ids.delete(id);
    }
    return ids;
  }, [flatList, expandedOverrides]);

  const scrollTrackRef = useRef(false);

  useEffect(() => {
    const wrapper = document.querySelector(`[data-tab-id="${activeFileId}"] .moflow-editor-wrapper`);
    if (!wrapper) return;

    let rafId = 0;

    const onScroll = () => {
      if (scrollTrackRef.current) return;
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        const view = useSearchStore.getState().getEditorView(activeFileId);
        if (!view) return;

        const wrapperRect = wrapper.getBoundingClientRect();
        const targetY = wrapperRect.top + 60;

        let bestId: string | null = null;
        let bestPos = -1;

        for (const item of flatList) {
          try {
            const pos = findHeadingPosition(view, item.text, item.level);
            if (pos === null) continue;
            const coords = view.coordsAtPos(pos);
            if (coords.top <= targetY && pos > bestPos) {
              bestPos = pos;
              bestId = item.id;
            }
          } catch {
            continue;
          }
        }

        setActiveId(bestId);
      });
    };

    wrapper.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      wrapper.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(rafId);
    };
  }, [activeFileId, flatList]);

  const handleToggle = useCallback((id: string) => {
    setExpandedOverrides((prev) => {
      const next = new Map(prev);
      next.set(id, !prev.has(id) ? false : !prev.get(id));
      return next;
    });
  }, []);

  const handleJump = useCallback(
    (item: OutlineItem) => {
      const view = useSearchStore.getState().getEditorView(activeFileId);
      if (!view) return;

      const pos = findHeadingPosition(view, item.text, item.level);
      if (pos === null) return;

      scrollTrackRef.current = true;

      const wrapper = document.querySelector(`[data-tab-id="${activeFileId}"] .moflow-editor-wrapper`);
      if (wrapper) {
        try {
          const coords = view.coordsAtPos(pos);
          const wrapperRect = wrapper.getBoundingClientRect();
          const offset = coords.top - wrapperRect.top + wrapper.scrollTop - 40;
          wrapper.scrollTo({ top: offset, behavior: "smooth" });
        } catch { /* ignore */ }
      }

      setActiveId(item.id);
      setTimeout(() => {
        scrollTrackRef.current = false;
      }, 500);
    },
    [activeFileId]
  );

  const handleResizeStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const startX = e.clientX;
      const startW = outlineWidth;

      const onMove = (ev: MouseEvent) => {
        const delta = ev.clientX - startX;
        setOutlineWidth(startW + delta);
      };
      const onUp = () => {
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
      };
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    },
    [outlineWidth, setOutlineWidth]
  );

  return (
    <div className="flex flex-col border-r border-moflow-border bg-moflow-bg relative animate-outline-slide shrink-0" style={{ width: outlineWidth, minWidth: outlineWidth }}>
      <div className="absolute -right-0.5 top-0 w-1 h-full cursor-col-resize z-10 transition-[background-color] duration-150 hover:bg-moflow-accent/40" onMouseDown={handleResizeStart} />
      <div className="h-9 flex items-center border-b border-moflow-border bg-moflow-bg-secondary shrink-0">
        <button
          className={`flex items-center gap-1 px-3 h-full border-none bg-none text-[13px] cursor-pointer transition-[color] duration-100 ${leftPanelTab === "files" ? "text-moflow-text font-semibold" : "text-moflow-text-secondary hover:text-moflow-text"}`}
          onClick={() => setLeftPanelTab("files")}
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"><path d="M2 3h5l2 2h5v8H2V3z" /></svg>
          {t("文件", "Files")}
        </button>
        <button
          className={`flex items-center gap-1 px-3 h-full border-none bg-none text-[13px] cursor-pointer transition-[color] duration-100 ${leftPanelTab === "outline" ? "text-moflow-text font-semibold" : "text-moflow-text-secondary hover:text-moflow-text"}`}
          onClick={() => setLeftPanelTab("outline")}
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"><path d="M2 2h12M2 6h8M2 10h10M2 14h6" /></svg>
          {t("大纲", "Outline")}
        </button>
      </div>
      <div className="flex-1 overflow-y-auto overflow-x-hidden py-1 min-h-0 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-sm [&::-webkit-scrollbar-thumb]:bg-moflow-scrollbar-thumb [&::-webkit-scrollbar-track]:bg-moflow-scrollbar-track">
        {leftPanelTab === "files" ? (
          <FileTree />
        ) : flatList.length === 0 ? (
          <div className="flex items-center justify-center h-full text-moflow-text-secondary text-[13px] opacity-60 p-5 text-center">{t("无标题", "No headings")}</div>
        ) : (
          <ul className="list-none m-0 p-0">
            {tree.map((item) => (
              <OutlineNode
                key={item.id}
                item={item}
                activeId={activeId}
                expandedIds={expandedIds}
                onToggle={handleToggle}
                onJump={handleJump}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function flattenTree(items: OutlineItem[]): OutlineItem[] {
  const result: OutlineItem[] = [];
  for (const item of items) {
    result.push(item);
    result.push(...flattenTree(item.children));
  }
  return result;
}

function findHeadingPosition(
  view: import("@milkdown/prose/view").EditorView,
  text: string,
  level: number
): number | null {
  let found: number | null = null;
  view.state.doc.descendants((node, pos) => {
    if (found !== null) return false;
    if (node.type.name === "heading" && node.attrs.level === level) {
      const nodeText = node.textContent;
      if (nodeText === text || nodeText.startsWith(text) || text.startsWith(nodeText)) {
        found = pos;
        return false;
      }
    }
  });
  return found;
}
