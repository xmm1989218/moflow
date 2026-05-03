import { Crepe } from "@milkdown/crepe";
import { Milkdown, MilkdownProvider, useEditor } from "@milkdown/react";
import { replaceAll, getHTML } from "@milkdown/utils";
import { EditorStatus } from "@milkdown/core";
import { useAppStore } from "../../stores/appStore";
import "@milkdown/crepe/theme/common/style.css";
import "@milkdown/crepe/theme/nord.css";
import "@milkdown/crepe/theme/nord-dark.css";
import "./Editor.css";
import { useEffect, useRef, useCallback } from "react";

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
        [Crepe.Feature.BlockEdit]: true,
      },
      featureConfigs: {
        [Crepe.Feature.Placeholder]: {
          text: "Start writing...",
          mode: "doc",
        },
      },
    });

    crepe.on((listener) => {
      listener.markdownUpdated((_ctx, markdown) => {
        if (editorReadyRef.current) {
          syncedContentRef.current = markdown;
          setContent(markdown);
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

    editor.action(replaceAll(content, true));
    syncedContentRef.current = content;
  }, [content, loading, getEditor]);

  useEffect(() => {
    return () => setGetEditorHTML(null);
  }, []);

  return (
    <div className="moflow-editor-wrapper" data-editor-theme={editorTheme}>
      {mode === "wysiwyg" ? (
        <Milkdown />
      ) : (
        <SourceModeEditor content={content} setContent={setContent} />
      )}
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
  const activeFileId = useAppStore((s) => s.activeFileId);
  return (
    <MilkdownProvider key={activeFileId}>
      <MilkdownWrapper />
    </MilkdownProvider>
  );
}
