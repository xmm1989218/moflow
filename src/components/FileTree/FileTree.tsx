/* eslint-disable react-refresh/only-export-components */
import { useCallback, useEffect, useRef, useState } from "react";
import { readDir, mkdir, writeFile, remove, rename as renameFile } from "@tauri-apps/plugin-fs";
import { useTabStore } from "../../stores/tabStore";
import { loadFileByPath } from "../../lib/fileOps";
import { invoke } from "@tauri-apps/api/core";
import { t } from "../../i18n/core";
import { useT } from "../../i18n/useT";
import { Folder, FileText, File, Image as ImageIcon } from "lucide-react";

interface FileEntry {
  name: string;
  path: string;
  isDirectory: boolean;
}

const MD_EXTS = new Set([".md", ".markdown", ".txt"]);
const IMAGE_EXTS = new Set([".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp", ".bmp", ".ico"]);

function getFileExt(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? name.slice(dot).toLowerCase() : "";
}

function isMdFile(name: string): boolean {
  return MD_EXTS.has(getFileExt(name));
}

function isImageFile(name: string): boolean {
  return IMAGE_EXTS.has(getFileExt(name));
}

function getFileIcon(entry: FileEntry) {
  if (entry.isDirectory) {
    return <Folder size={14} className="text-ui-accent shrink-0" />;
  }
  if (isMdFile(entry.name)) {
    return <FileText size={14} className="shrink-0" />;
  }
  if (isImageFile(entry.name)) {
    return <ImageIcon size={14} className="text-moflow-text-secondary shrink-0" />;
  }
  return <File size={14} className="text-moflow-text-secondary shrink-0" />;
}

const dirCache = new Map<string, FileEntry[]>();
let cacheVersion = 0;

export function invalidateDirCache(path?: string) {
  cacheVersion++;
  if (path) {
    dirCache.delete(path);
  } else {
    dirCache.clear();
  }
}

async function readDirEntries(dirPath: string): Promise<FileEntry[]> {
  const cached = dirCache.get(dirPath);
  if (cached) return cached;

  try {
    const entries = await readDir(dirPath);
    const sep = dirPath.includes("\\") ? "\\" : "/";
    const result: FileEntry[] = [];
    for (const entry of entries) {
      if (entry.name === "." || entry.name === "..") continue;
      result.push({
        name: entry.name,
        path: dirPath + sep + entry.name,
        isDirectory: entry.isDirectory,
      });
    }

    result.sort((a, b) => {
      if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    dirCache.set(dirPath, result);
    return result;
  } catch {
    return [];
  }
}

function FileTreeNode({
  entry,
  depth,
  activeFilePath,
  expandedDirs,
  onToggleDir,
  onOpenFile,
  onContextMenu,
}: {
  entry: FileEntry;
  depth: number;
  activeFilePath: string | null;
  expandedDirs: Set<string>;
  onToggleDir: (path: string) => void;
  onOpenFile: (entry: FileEntry) => void;
  onContextMenu: (e: React.MouseEvent, entry: FileEntry) => void;
}) {
  const isExpanded = expandedDirs.has(entry.path);
  const isActive = !entry.isDirectory && entry.path === activeFilePath;
  const isMd = !entry.isDirectory && isMdFile(entry.name);

  return (
    <div
      className={`flex items-center h-7 pr-2 text-[13px] transition-[background-color,color] duration-100 gap-0.5 relative ${isMd ? "cursor-pointer" : entry.isDirectory ? "cursor-pointer" : "cursor-default"} ${isActive ? "text-moflow-accent font-medium before:content-[''] before:absolute before:left-0 before:top-0.5 before:bottom-0.5 before:w-0.5 before:bg-moflow-accent before:rounded-sm" : isMd ? "text-moflow-text-secondary hover:bg-moflow-bg-secondary hover:text-moflow-text" : entry.isDirectory ? "text-moflow-text-secondary hover:bg-moflow-bg-secondary hover:text-moflow-text" : "text-moflow-text-secondary/40"}`}
      style={{ paddingLeft: 8 + depth * 16 }}
      onClick={() => {
        if (entry.isDirectory) {
          onToggleDir(entry.path);
        } else if (isMd) {
          onOpenFile(entry);
        }
      }}
      onContextMenu={(e) => onContextMenu(e, entry)}
    >
      {entry.isDirectory ? (
        <button
          className="inline-flex items-center justify-center w-4 h-4 p-0 border-none bg-none text-moflow-text-secondary cursor-pointer shrink-0 rounded-sm hover:text-moflow-text hover:bg-moflow-bg-secondary"
          onClick={(e) => {
            e.stopPropagation();
            onToggleDir(entry.path);
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
      <span className="shrink-0 mr-1">{getFileIcon(entry)}</span>
      <span className="overflow-hidden text-ellipsis whitespace-nowrap flex-1 min-w-0 leading-7" title={entry.path}>
        {entry.name}
      </span>
    </div>
  );
}

interface ContextMenuState {
  x: number;
  y: number;
  entry: FileEntry;
}

export default function FileTree() {
  const workspaceRoot = useTabStore((s) => s.workspaceRoot);
  const activeFilePath = useTabStore((s) => {
    const tab = s.files.find((f) => f.id === s.activeFileId);
    return tab?.filePath ?? null;
  });
  const setWorkspaceRoot = useTabStore((s) => s.setWorkspaceRoot);

  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set());
  const [dirContents, setDirContents] = useState<Record<string, FileEntry[]>>({});
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const focusedMenuIndexRef = useRef(0);
  const menuItemsRef = useRef<(HTMLButtonElement | null)[]>([]);
  const [renaming, setRenaming] = useState<{ path: string; name: string; isDir: boolean } | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [creating, setCreating] = useState<{ parentPath: string; type: "file" | "folder" } | null>(null);
  const [createValue, setCreateValue] = useState("");
  const [currentVersion, setCurrentVersion] = useState(cacheVersion);
  useT();
  const renameInputRef = useRef<HTMLInputElement>(null);
  const createInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (renaming && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [renaming]);

  useEffect(() => {
    if (creating && createInputRef.current) {
      createInputRef.current.focus();
    }
  }, [creating]);

  useEffect(() => {
    if (!workspaceRoot) return;

    const loadEntries = async (dirPath: string) => {
      const entries = await readDirEntries(dirPath);
      setDirContents((prev) => {
        if (prev[dirPath] === entries) return prev;
        return { ...prev, [dirPath]: entries };
      });
    };

    loadEntries(workspaceRoot);
    for (const dir of expandedDirs) {
      loadEntries(dir);
    }
  }, [workspaceRoot, expandedDirs, currentVersion]);

  const handleToggleDir = useCallback((dirPath: string) => {
    setExpandedDirs((prev) => {
      const next = new Set(prev);
      if (next.has(dirPath)) {
        next.delete(dirPath);
      } else {
        next.add(dirPath);
      }
      return next;
    });
  }, []);

  const handleOpenFile = useCallback((entry: FileEntry) => {
    if (!isMdFile(entry.name)) return;
    loadFileByPath(entry.path);
  }, []);

  const refreshDir = useCallback((dirPath: string) => {
    invalidateDirCache(dirPath);
    setCurrentVersion(cacheVersion);
  }, []);

  const handleContextMenu = useCallback((e: React.MouseEvent, entry: FileEntry) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, entry });
  }, []);

  useEffect(() => {
    if (!contextMenu) return;
    focusedMenuIndexRef.current = 0;
    requestAnimationFrame(() => {
      menuItemsRef.current[0]?.focus();
    });
    const close = () => setContextMenu(null);
    document.addEventListener("click", close);
    document.addEventListener("contextmenu", close);
    return () => {
      document.removeEventListener("click", close);
      document.removeEventListener("contextmenu", close);
    };
  }, [contextMenu]);

  const handleNewFile = useCallback((parentPath: string, type: "file" | "folder") => {
    setCreating({ parentPath, type });
    setCreateValue(type === "file" ? "Untitled.md" : "New Folder");
  }, []);

  const handleCreateConfirm = useCallback(async () => {
    if (!creating || !createValue.trim()) {
      setCreating(null);
      return;
    }
    const { parentPath, type } = creating;
    const sep = parentPath.includes("\\") ? "\\" : "/";
    const newPath = parentPath + sep + createValue.trim();

    try {
      await invoke("allow_paths", { paths: [newPath] });
      if (type === "folder") {
        await mkdir(newPath, { recursive: true });
      } else {
        await writeFile(newPath, new Uint8Array(0));
      }
      refreshDir(parentPath);
      if (type === "file") {
        loadFileByPath(newPath);
      }
    } catch (e) {
      console.error("Create failed:", e);
    }
    setCreating(null);
  }, [creating, createValue, refreshDir]);

  const handleRenameStart = useCallback((entry: FileEntry) => {
    setRenaming({ path: entry.path, name: entry.name, isDir: entry.isDirectory });
    setRenameValue(entry.name);
  }, []);

  const handleRenameConfirm = useCallback(async () => {
    if (!renaming || !renameValue.trim() || renameValue.trim() === renaming.name) {
      setRenaming(null);
      return;
    }
    const dir = renaming.path.includes("\\")
      ? renaming.path.substring(0, renaming.path.lastIndexOf("\\"))
      : renaming.path.substring(0, renaming.path.lastIndexOf("/"));
    const newPath = dir + (renaming.path.includes("\\") ? "\\" : "/") + renameValue.trim();

    try {
      await invoke("allow_paths", { paths: [newPath] });
      await renameFile(renaming.path, newPath);

      const tabStore = useTabStore.getState();
      const tab = tabStore.files.find((f) => f.filePath === renaming.path);
      if (tab) {
        tabStore.updateTabMeta(tab.id, {
          filePath: newPath,
          fileName: renameValue.trim(),
        });
      }

      invalidateDirCache(dir);
      dirCache.forEach((_, key) => {
        if (key.startsWith(renaming.path)) {
          dirCache.delete(key);
        }
      });
      setCurrentVersion(cacheVersion);
    } catch (e) {
      console.error("Rename failed:", e);
    }
    setRenaming(null);
  }, [renaming, renameValue]);

  const handleDelete = useCallback(async (entry: FileEntry) => {
    const confirmMsg = entry.isDirectory
      ? t("fileTree.confirmDeleteFolder", { name: entry.name })
      : t("fileTree.confirmDeleteFile", { name: entry.name });
    if (!window.confirm(confirmMsg)) return;

    try {
      await remove(entry.path, { recursive: entry.isDirectory });

      const tabStore = useTabStore.getState();
      if (!entry.isDirectory) {
        const tab = tabStore.files.find((f) => f.filePath === entry.path);
        if (tab) tabStore.closeTab(tab.id);
      } else {
        for (const tab of tabStore.files) {
          if (tab.filePath && tab.filePath.startsWith(entry.path)) {
            tabStore.closeTab(tab.id);
          }
        }
      }

      const parentDir = entry.path.includes("\\")
        ? entry.path.substring(0, entry.path.lastIndexOf("\\"))
        : entry.path.substring(0, entry.path.lastIndexOf("/"));
      refreshDir(parentDir);
    } catch (e) {
      console.error("Delete failed:", e);
    }
  }, [refreshDir]);

  const getContextMenuItems = useCallback((entry: FileEntry) => {
    const items: { label: string; action: () => void; danger?: boolean }[] = [];
    if (entry.isDirectory) {
      items.push(
        { label: t("fileTree.newFile"), action: () => handleNewFile(entry.path, "file") },
        { label: t("fileTree.newFolder"), action: () => handleNewFile(entry.path, "folder") },
      );
    }
    items.push({ label: t("fileTree.rename"), action: () => handleRenameStart(entry) });
    items.push({ label: t("fileTree.delete"), action: () => handleDelete(entry), danger: true });
    return items;
  }, [handleNewFile, handleRenameStart, handleDelete]);

  const handleMenuKeyDown = useCallback((e: React.KeyboardEvent) => {
    const items = getContextMenuItems(contextMenu!.entry);
    if (e.key === "Escape") {
      setContextMenu(null);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      focusedMenuIndexRef.current = (focusedMenuIndexRef.current + 1) % items.length;
      menuItemsRef.current[focusedMenuIndexRef.current]?.focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      focusedMenuIndexRef.current = (focusedMenuIndexRef.current - 1 + items.length) % items.length;
      menuItemsRef.current[focusedMenuIndexRef.current]?.focus();
    } else if (e.key === "Enter") {
      e.preventDefault();
      items[focusedMenuIndexRef.current]?.action();
      setContextMenu(null);
    }
  }, [contextMenu, getContextMenuItems]);

  const renderTree = (dirPath: string, depth: number): React.ReactNode => {
    const entries = dirContents[dirPath];
    if (!entries) return null;

    return entries.map((entry) => {
      if (entry.path === renaming?.path) {
        return (
          <li key={entry.path} className="m-0 p-0 list-none">
            <div className="flex items-center h-7 pr-2 gap-1" style={{ paddingLeft: 8 + depth * 16 }}>
              <span className="inline-flex items-center justify-center w-4 h-4 p-0 shrink-0" />
              <span className="shrink-0 mr-1">{getFileIcon(entry)}</span>
              <input
                ref={renameInputRef}
                className="flex-1 min-w-0 h-5 px-1 text-[13px] bg-moflow-bg border border-moflow-accent rounded-sm outline-none text-moflow-text"
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleRenameConfirm();
                  if (e.key === "Escape") setRenaming(null);
                }}
                onBlur={handleRenameConfirm}
              />
            </div>
          </li>
        );
      }

      return (
        <li key={entry.path} className="m-0 p-0 list-none">
          <FileTreeNode
            entry={entry}
            depth={depth}
            activeFilePath={activeFilePath}
            expandedDirs={expandedDirs}
            onToggleDir={handleToggleDir}
            onOpenFile={handleOpenFile}
            onContextMenu={handleContextMenu}
          />
          {entry.isDirectory && expandedDirs.has(entry.path) && (
            <ul className="list-none m-0 p-0">
              {renderTree(entry.path, depth + 1)}
              {creating && creating.parentPath === entry.path && (
                <li className="m-0 p-0 list-none">
                  <div className="flex items-center h-7 pr-2 gap-1" style={{ paddingLeft: 8 + (depth + 1) * 16 }}>
                    <span className="inline-flex items-center justify-center w-4 h-4 p-0 shrink-0" />
                    <span className="shrink-0 mr-1">
                      {creating.type === "folder" ? getFileIcon({ name: "", path: "", isDirectory: true }) : getFileIcon({ name: "Untitled.md", path: "", isDirectory: false })}
                    </span>
                    <input
                      ref={createInputRef}
                      className="flex-1 min-w-0 h-5 px-1 text-[13px] bg-moflow-bg border border-moflow-accent rounded-sm outline-none text-moflow-text"
                      value={createValue}
                      onChange={(e) => setCreateValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleCreateConfirm();
                        if (e.key === "Escape") setCreating(null);
                      }}
                      onBlur={handleCreateConfirm}
                    />
                  </div>
                </li>
              )}
            </ul>
          )}
        </li>
      );
    });
  };

  if (!workspaceRoot) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-moflow-text-secondary text-[13px] opacity-60 p-5 text-center gap-2">
        <Folder size={32} className="text-ui-text-secondary/30" />
        <span>{t("fileTree.noFolderOpen")}</span>
        <button
          className="px-3 py-1 text-[12px] bg-moflow-accent/10 text-moflow-accent border border-moflow-accent/30 rounded hover:bg-moflow-accent/20 cursor-pointer transition-[background-color] duration-100"
          onClick={async () => {
            const { open } = await import("@tauri-apps/plugin-dialog");
            const selected = await open({ directory: true, multiple: false });
            if (!selected) return;
            setWorkspaceRoot(selected);
            await invoke("allow_paths", { paths: [selected] });
            setExpandedDirs(new Set([selected]));
            invalidateDirCache();
            setCurrentVersion(cacheVersion);
          }}
        >
          {t("fileTree.openFolder")}
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full" onClick={() => setContextMenu(null)}>
      <ul className="list-none m-0 p-0 flex-1 overflow-y-auto">
        {renderTree(workspaceRoot, 0)}
        {creating && creating.parentPath === workspaceRoot && (
          <li className="m-0 p-0 list-none">
            <div className="flex items-center h-7 pr-2 gap-1" style={{ paddingLeft: 8 }}>
              <span className="inline-flex items-center justify-center w-4 h-4 p-0 shrink-0" />
              <span className="shrink-0 mr-1">
                {creating.type === "folder" ? getFileIcon({ name: "", path: "", isDirectory: true }) : getFileIcon({ name: "Untitled.md", path: "", isDirectory: false })}
              </span>
              <input
                ref={createInputRef}
                className="flex-1 min-w-0 h-5 px-1 text-[13px] bg-moflow-bg border border-moflow-accent rounded-sm outline-none text-moflow-text"
                value={createValue}
                onChange={(e) => setCreateValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCreateConfirm();
                  if (e.key === "Escape") setCreating(null);
                }}
                onBlur={handleCreateConfirm}
              />
            </div>
          </li>
        )}
      </ul>

      {contextMenu && (() => {
        const menuItems = getContextMenuItems(contextMenu.entry);
        const normalItems = menuItems.filter((item) => !item.danger);
        const dangerItems = menuItems.filter((item) => item.danger);
        let refIndex = 0;
        return (
          <div
            role="menu"
            className="fixed bg-ui-menu-bg border border-ui-border rounded-lg shadow-menu p-1 z-[2000] animate-menu-fadein min-w-[160px]"
            style={{ left: contextMenu.x, top: contextMenu.y }}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={handleMenuKeyDown}
          >
            {normalItems.map((item) => {
              const idx = refIndex++;
              return (
                <button
                  key={item.label}
                  ref={(el) => { menuItemsRef.current[idx] = el; }}
                  role="menuitem"
                  className="flex items-center w-full py-1.5 px-3 border-none bg-none text-ui-text text-[13px] cursor-pointer rounded text-left hover:bg-ui-menu-hover"
                  tabIndex={-1}
                  onClick={() => {
                    item.action();
                    setContextMenu(null);
                  }}
                >
                  {item.label}
                </button>
              );
            })}
            {dangerItems.length > 0 && (
              <>
                <div className="h-px bg-ui-border mx-2 my-1" />
                {dangerItems.map((item) => {
                  const idx = refIndex++;
                  return (
                    <button
                      key={item.label}
                      ref={(el) => { menuItemsRef.current[idx] = el; }}
                      role="menuitem"
                      className="flex items-center w-full py-1.5 px-3 border-none bg-none text-red-500 text-[13px] cursor-pointer rounded text-left hover:bg-ui-menu-hover"
                      tabIndex={-1}
                      onClick={() => {
                        item.action();
                        setContextMenu(null);
                      }}
                    >
                      {item.label}
                    </button>
                  );
                })}
              </>
            )}
          </div>
        );
      })()}
    </div>
  );
}
