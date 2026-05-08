import { useEffect, useRef, useState } from "react";
import { useTabStore } from "../../stores/tabStore";
import { useThemeStore } from "../../stores/themeStore";
import { useSearchStore } from "../../stores/searchStore";
import { openFile, saveFile, saveFileAs, exportHtml, exportPdf } from "../../lib/fileOps";
import { t } from "../../lib/i18n";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";
import "./HamburgerMenu.css";

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
  const newFile = useTabStore((s) => s.newFile);
  const openSettingsTab = useThemeStore((s) => s.openSettingsTab);

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
        newFile();
        break;
      case "open":
        openFile();
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
      case "find":
        useSearchStore.getState().toggleSearch(false);
        break;
      case "replace":
        useSearchStore.getState().toggleSearch(true);
        break;
      case "fullscreen":
        appWindow.isFullscreen().then((fs) => appWindow.setFullscreen(!fs));
        break;
      case "devtools":
        invoke("toggle_devtools");
        break;
      case "settings":
        openSettingsTab();
        break;
      default:
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
    item("find", t("查找", "Find"), { shortcut: "Ctrl+F" }),
    item("replace", t("替换", "Replace"), { shortcut: "Ctrl+H" }),
    sep(),
    item("export", t("导出", "Export"), {
      submenu: [
        item("export_html", "HTML"),
        item("export_pdf", "PDF"),
      ],
    }),
    sep(),
    item("settings", t("设置", "Settings"), { shortcut: "Ctrl+," }),
    item("fullscreen", t("全屏", "Fullscreen"), { shortcut: "F11" }),
    item("devtools", t("开发者工具", "Developer Tools"), { shortcut: "F12" }),
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
                  onAction(entry.id);
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
