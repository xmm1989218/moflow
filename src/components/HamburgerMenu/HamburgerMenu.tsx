import { useEffect, useRef, useState } from "react";
import { useAppStore, type EditorTheme, EDITOR_THEMES } from "../../stores/appStore";
import { openFile, saveFile, saveFileAs, exportHtml, exportPdf, confirmUnsaved } from "../../lib/fileOps";
import { getCurrentWindow } from "@tauri-apps/api/window";
import "./HamburgerMenu.css";

const isZh = navigator.language.startsWith("zh");
const t = (zh: string, en: string) => (isZh ? zh : en);
const appWindow = getCurrentWindow();

interface MenuItem {
  type: "item";
  id: string;
  label: string;
  shortcut?: string;
  checked?: boolean;
  submenu?: MenuEntry[];
}

interface MenuSeparator {
  type: "separator";
}

type MenuEntry = MenuItem | MenuSeparator;

function sep(): MenuSeparator {
  return { type: "separator" };
}

function isSeparator(entry: MenuEntry): entry is MenuSeparator {
  return entry.type === "separator";
}

function item(
  id: string,
  label: string,
  opts?: { shortcut?: string; checked?: boolean; submenu?: MenuEntry[] }
): MenuItem {
  return { type: "item", id, label, ...opts };
}

export default function HamburgerMenu({ onClose }: { onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const appTheme = useAppStore((s) => s.appTheme);
  const editorTheme = useAppStore((s) => s.editorTheme);
  const toggleStatusBar = useAppStore((s) => s.toggleStatusBar);
  const newFile = useAppStore((s) => s.newFile);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [onClose]);

  const handleAction = (id: string) => {
    switch (id) {
      case "new":
        confirmUnsaved(t("新建文件", "New File")).then((ok) => { if (ok) newFile(); });
        break;
      case "open":
        confirmUnsaved(t("打开新文件", "Open File")).then((ok) => { if (ok) openFile(); });
        break;
      case "save":
        saveFile();
        break;
      case "save_as":
        saveFileAs();
        break;
      case "export_html":
        exportHtml();
        break;
      case "export_pdf":
        exportPdf();
        break;
      case "app_system":
        useAppStore.getState().setAppTheme("system");
        break;
      case "app_light":
        useAppStore.getState().setAppTheme("light");
        break;
      case "app_dark":
        useAppStore.getState().setAppTheme("dark");
        break;
      case "toggle_statusbar":
        toggleStatusBar();
        break;
      case "fullscreen":
        appWindow.isFullscreen().then((fs) => appWindow.setFullscreen(!fs));
        break;
      case "about":
        alert("MoFlow v0.1.0\n© 2026 MoFlow");
        break;
    }
    onClose();
  };

  const menuItems: MenuEntry[] = [
    item("new", t("新建", "New"), { shortcut: "Ctrl+N" }),
    item("open", t("打开...", "Open..."), { shortcut: "Ctrl+O" }),
    item("save", t("保存", "Save"), { shortcut: "Ctrl+S" }),
    item("save_as", t("另存为...", "Save As..."), { shortcut: "Ctrl+Shift+S" }),
    sep(),
    item("export_html", t("导出 HTML", "Export HTML")),
    item("export_pdf", t("导出 PDF", "Export PDF")),
    sep(),
    item("appearance", t("外观", "Appearance"), {
      submenu: [
        item("app_system", t("跟随系统", "System"), { checked: appTheme === "system" }),
        item("app_light", t("浅色", "Light"), { checked: appTheme === "light" }),
        item("app_dark", t("深色", "Dark"), { checked: appTheme === "dark" }),
        sep(),
        item("editor_themes", t("编辑器主题", "Editor Theme"), {
          submenu: EDITOR_THEMES.map((th) =>
            item(`editor_theme_${th.id}`, th.label, { checked: editorTheme === th.id })
          ),
        }),
      ],
    }),
    sep(),
    item("toggle_statusbar", t("切换状态栏", "Toggle Status Bar")),
    item("fullscreen", t("全屏", "Fullscreen"), { shortcut: "F11" }),
    sep(),
    item("about", t("关于 MoFlow", "About MoFlow")),
  ];

  return (
    <div className="moflow-hamburger-menu" ref={ref}>
      {menuItems.map((entry, i) =>
        isSeparator(entry) ? (
          <div key={`sep-${i}`} className="moflow-menu-separator" />
        ) : entry.submenu ? (
          <SubmenuItem key={entry.id} item={entry} onAction={handleAction} />
        ) : (
          <button
            key={entry.id}
            className={`moflow-menu-item${entry.checked ? " checked" : ""}`}
            onClick={() => handleAction(entry.id)}
          >
            <span className="moflow-menu-item-check">
              {entry.checked ? "✓" : ""}
            </span>
            <span className="moflow-menu-item-label">{entry.label}</span>
            {entry.shortcut && (
              <span className="moflow-menu-item-shortcut">{entry.shortcut}</span>
            )}
          </button>
        ),
      )}
    </div>
  );
}

function SubmenuItem({ item: menuItem, onAction }: { item: MenuItem; onAction: (id: string) => void }) {
  const [open, setOpen] = useState(false);

  return (
    <div
      className="moflow-menu-submenu-wrapper"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button className={`moflow-menu-item${menuItem.checked ? " checked" : ""}`}>
        <span className="moflow-menu-item-check">
          {menuItem.checked ? "✓" : ""}
        </span>
        <span className="moflow-menu-item-label">{menuItem.label}</span>
        <span className="moflow-menu-item-arrow">›</span>
      </button>
      {open && menuItem.submenu && (
        <div className="moflow-menu-submenu">
          {menuItem.submenu.map((entry, i) =>
            isSeparator(entry) ? (
              <div key={`sep-${i}`} className="moflow-menu-separator" />
            ) : entry.submenu ? (
              <SubmenuItem key={entry.id} item={entry} onAction={onAction} />
            ) : (
              <button
                key={entry.id}
                className={`moflow-menu-item${entry.checked ? " checked" : ""}`}
                onClick={() => {
                  if (entry.id.startsWith("editor_theme_")) {
                    const themeId = entry.id.slice("editor_theme_".length) as EditorTheme;
                    useAppStore.getState().setEditorTheme(themeId);
                  } else {
                    onAction(entry.id);
                  }
                }}
              >
                <span className="moflow-menu-item-check">
                  {entry.checked ? "✓" : ""}
                </span>
                <span className="moflow-menu-item-label">{entry.label}</span>
              </button>
            ),
          )}
        </div>
      )}
    </div>
  );
}
