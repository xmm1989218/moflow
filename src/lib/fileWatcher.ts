import { watch, readFile, type UnwatchFn, type WatchEvent } from "@tauri-apps/plugin-fs";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useTabStore } from "../stores/tabStore";
import type { ReloadDialogResult } from "../stores/appStore";
import { loadTabContent } from "./fileOps";
import { toPosix } from "./pathUtils";
import { toast } from "./toast";
import { showReloadDialog, showAlertDialog } from "./closeDialog";
import { t } from "../i18n/core";

const watchers = new Map<string, UnwatchFn>();
const pendingConflicts = new Set<string>();
const promptedDisk = new Map<string, string>();
const checkingPaths = new Set<string>();
const recheckPaths = new Set<string>();
let dialogOpen = false;
let initialized = false;

function norm(p: string): string {
  return toPosix(p).toLowerCase();
}

export function hasPendingConflict(tabId: string): boolean {
  return pendingConflicts.has(tabId);
}

function onWatchEvent(event: WatchEvent) {
  for (const p of event.paths) {
    verifyPath(norm(p));
  }
}

async function verifyPath(pathKey: string): Promise<void> {
  if (checkingPaths.has(pathKey)) {
    recheckPaths.add(pathKey);
    return;
  }
  checkingPaths.add(pathKey);
  try {
    do {
      recheckPaths.delete(pathKey);
      const tabs = useTabStore.getState().files.filter(
        (f) => f.filePath && norm(f.filePath) === pathKey && f.contentLoaded
      );
      for (const tab of tabs) {
        await verifyTab(tab.id);
      }
    } while (recheckPaths.has(pathKey));
  } finally {
    checkingPaths.delete(pathKey);
  }
}

async function verifyTab(tabId: string): Promise<void> {
  const tab = useTabStore.getState().files.find((f) => f.id === tabId);
  if (!tab || !tab.filePath || !tab.contentLoaded) return;

  let disk: string;
  try {
    const data = await readFile(tab.filePath);
    disk = new TextDecoder("utf-8").decode(data);
  } catch {
    if (dialogOpen) return;
    pendingConflicts.delete(tabId);
    promptedDisk.delete(tabId);
    await showAlertDialog(t("common.fileDeleted", { fileName: tab.fileName }));
    if (useTabStore.getState().files.some((f) => f.id === tabId)) {
      useTabStore.getState().closeTab(tabId);
    }
    return;
  }

  if (disk === tab.lastSavedContent) {
    pendingConflicts.delete(tabId);
    promptedDisk.delete(tabId);
    return;
  }

  if (!tab.isModified) {
    pendingConflicts.delete(tabId);
    promptedDisk.delete(tabId);
    useTabStore.getState().updateTabMeta(tabId, { content: disk });
    toast.info(t("common.fileReloaded", { fileName: tab.fileName }));
    return;
  }

  if (promptedDisk.get(tabId) === disk || dialogOpen) {
    pendingConflicts.add(tabId);
    return;
  }
  promptedDisk.set(tabId, disk);
  pendingConflicts.add(tabId);

  let result: ReloadDialogResult | undefined;
  dialogOpen = true;
  try {
    result = await showReloadDialog(t("common.fileChangedExternally", { fileName: tab.fileName }));
  } finally {
    dialogOpen = false;
  }

  if (result === "reload") {
    pendingConflicts.delete(tabId);
    promptedDisk.delete(tabId);
    await loadTabContent(tabId);
  }

  recheckPendingConflicts();
}

function recheckPendingConflicts(): void {
  if (dialogOpen) return;
  for (const id of [...pendingConflicts]) {
    const tab = useTabStore.getState().files.find((f) => f.id === id);
    if (tab?.filePath && tab.contentLoaded) {
      verifyTab(id);
    }
  }
}

function recheckAll(): void {
  if (dialogOpen) return;
  for (const f of useTabStore.getState().files) {
    if (f.filePath && f.contentLoaded) {
      verifyPath(norm(f.filePath));
    }
  }
}

function syncWatchers(): void {
  const files = useTabStore.getState().files;

  const activeIds = new Set(files.map((f) => f.id));
  for (const id of [...pendingConflicts]) {
    if (!activeIds.has(id)) pendingConflicts.delete(id);
  }
  for (const id of [...promptedDisk.keys()]) {
    if (!activeIds.has(id)) promptedDisk.delete(id);
  }

  const needed = new Map<string, string>();
  for (const f of files) {
    if (f.filePath) needed.set(norm(f.filePath), f.filePath);
  }

  for (const [key, unwatch] of watchers) {
    if (!needed.has(key)) {
      watchers.delete(key);
      try {
        unwatch();
      } catch { /* ignore */ }
    }
  }

  for (const [key, path] of needed) {
    if (watchers.has(key)) continue;
    watch(path, onWatchEvent, { delayMs: 300 })
      .then((unwatch) => {
        if (watchers.has(key)) {
          try {
            unwatch();
          } catch { /* ignore */ }
          return;
        }
        if (useTabStore.getState().files.some((f) => f.filePath && norm(f.filePath) === key)) {
          watchers.set(key, unwatch);
        } else {
          try {
            unwatch();
          } catch { /* ignore */ }
        }
      })
      .catch(() => { /* watcher unavailable for this path */ });
  }
}

export function initFileWatcher(): void {
  if (initialized) return;
  initialized = true;

  useTabStore.subscribe(() => syncWatchers());
  syncWatchers();

  getCurrentWindow().onFocusChanged((event) => {
    if (event.payload) recheckAll();
  });
}
