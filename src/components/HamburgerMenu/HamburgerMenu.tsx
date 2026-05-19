import { useEffect, useRef, useState } from "react";
import { useTabStore } from "../../stores/tabStore";
import { useThemeStore } from "../../stores/themeStore";
import { useSearchStore } from "../../stores/searchStore";
import { openFile, saveFile, saveFileAs, exportHtml, exportPdf, openFolder } from "../../lib/fileOps";
import { t } from "../../i18n/core";
import { useT } from "../../i18n/useT";
import { getShortcutDisplay } from "../../lib/shortcuts";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";

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
  const workspaceRoot = useTabStore((s) => s.workspaceRoot);
  const openSettingsTab = useThemeStore((s) => s.openSettingsTab);
  useT();

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
      case "open_folder":
        openFolder();
        break;
      case "close_folder":
        useTabStore.getState().closeWorkspace();
        break;
      case "save":
        saveFile();
        break;
      case "save_as":
        saveFileAs();
        break;
      case "undo": {
        const activeId = useTabStore.getState().activeFileId;
        useTabStore.getState().editorActionMap.get(activeId)?.undo?.();
        break;
      }
      case "redo": {
        const activeId = useTabStore.getState().activeFileId;
        useTabStore.getState().editorActionMap.get(activeId)?.redo?.();
        break;
      }
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
    item("new", t("menu.new"), { shortcut: getShortcutDisplay("newFile") }),
    item("open", t("menu.open"), { shortcut: getShortcutDisplay("openFile") }),
    item("open_folder", t("menu.openFolder"), { shortcut: getShortcutDisplay("openFolder") }),
    ...(workspaceRoot ? [item("close_folder", t("menu.closeFolder"))] : []),
    item("save", t("menu.save"), { shortcut: getShortcutDisplay("saveFile") }),
    item("save_as", t("menu.saveAs"), { shortcut: getShortcutDisplay("saveFileAs") }),
    sep(),
    item("undo", t("menu.undo"), { shortcut: getShortcutDisplay("undo") }),
    item("redo", t("menu.redo"), { shortcut: getShortcutDisplay("redo") }),
    sep(),
    item("find", t("menu.find"), { shortcut: getShortcutDisplay("find") }),
    item("replace", t("menu.replace"), { shortcut: getShortcutDisplay("replace") }),
    sep(),
    item("export", t("menu.export"), {
      submenu: [
        item("export_html", "HTML"),
        item("export_pdf", "PDF"),
      ],
    }),
    sep(),
    item("settings", t("menu.settings"), { shortcut: getShortcutDisplay("settings") }),
    item("fullscreen", t("menu.fullscreen"), { shortcut: getShortcutDisplay("fullscreen") }),
    item("devtools", t("menu.devtools"), { shortcut: getShortcutDisplay("devtools") }),
  ];

  return (
    <div className="absolute top-9 left-1 min-w-[220px] bg-ui-menu-bg border border-ui-border rounded-lg shadow-menu p-1 z-[1000] animate-menu-fadein" ref={ref}>
      {menuItems.map((entry, i) =>
        isSeparator(entry) ? (
          <div key={`sep-${i}`} className="h-px bg-ui-border mx-2 my-1" />
        ) : entry.submenu ? (
          <SubmenuItem key={entry.id} item={entry} onAction={handleAction} />
        ) : (
          <button
            key={entry.id}
            className={`flex items-center w-full py-1.5 px-3 border-none bg-none text-ui-text text-[13px] cursor-pointer rounded text-left gap-2 whitespace-nowrap hover:bg-ui-menu-hover${entry.checked ? " font-semibold" : ""}`}
            onClick={() => handleAction(entry.id)}
          >
            <span className="w-4 shrink-0 text-center text-xs text-ui-accent">
              {entry.checked ? "?" : ""}
            </span>
            <span className="flex-1">{entry.label}</span>
            {entry.shortcut && (
              <span className="text-[11px] text-ui-text-secondary ml-6">{entry.shortcut}</span>
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
      className="relative"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button className={`flex items-center w-full py-1.5 px-3 border-none bg-none text-ui-text text-[13px] cursor-pointer rounded text-left gap-2 whitespace-nowrap hover:bg-ui-menu-hover${menuItem.checked ? " font-semibold" : ""}`}>
        <span className="w-4 shrink-0 text-center text-xs text-ui-accent">
          {menuItem.checked ? "?" : ""}
        </span>
        <span className="flex-1">{menuItem.label}</span>
      </button>
      {open && menuItem.submenu && (
        <div className="absolute left-full top-0 min-w-[200px] bg-ui-menu-bg border border-ui-border rounded-lg shadow-menu p-1 z-[1001] animate-menu-fadein">
          {menuItem.submenu.map((entry, i) =>
            isSeparator(entry) ? (
              <div key={`sep-${i}`} className="h-px bg-ui-border mx-2 my-1" />
            ) : entry.submenu ? (
              <SubmenuItem key={entry.id} item={entry} onAction={onAction} />
            ) : (
              <button
                key={entry.id}
                className={`flex items-center w-full py-1.5 px-3 border-none bg-none text-ui-text text-[13px] cursor-pointer rounded text-left gap-2 whitespace-nowrap hover:bg-ui-menu-hover${entry.checked ? " font-semibold" : ""}`}
                onClick={() => {
                  onAction(entry.id);
                }}
              >
                <span className="w-4 shrink-0 text-center text-xs text-ui-accent">
{entry.checked ? "?" : ""}
                </span>
                <span className="flex-1">{entry.label}</span>
              </button>
            ),
          )}
        </div>
      )}
    </div>
  );
}
