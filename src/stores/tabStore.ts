import { create } from "zustand";
import { appDataDir, join } from "@tauri-apps/api/path";
import { readFile, writeFile, mkdir, remove, exists } from "@tauri-apps/plugin-fs";
import { invoke } from "@tauri-apps/api/core";
import { useChatStore } from "./chatStore";
import { persistSession } from "./sessionStore";
import { useThemeStore } from "./themeStore";
import { toPosix, posixBasename } from "../lib/pathUtils";

export type EditorMode = "wysiwyg" | "source";

export interface TabState {
  id: string;
  filePath: string | null;
  fileName: string;
  content: string;
  lastSavedContent: string;
  isModified: boolean;
  mode: EditorMode;
  contentLoaded: boolean;
}

export function createTab(overrides?: Partial<TabState & { id: string }>): TabState {
  return {
    id: crypto.randomUUID(),
    filePath: null,
    fileName: "Untitled.md",
    content: "",
    lastSavedContent: "",
    isModified: false,
    mode: "wysiwyg",
    contentLoaded: true,
    ...overrides,
  };
}

async function writeUntitledContent(tabId: string, content: string) {
  try {
    const dir = await appDataDir();
    const untitledDir = await join(dir, "untitled");
    if (!(await exists(untitledDir))) {
      await mkdir(untitledDir, { recursive: true });
    }
    const filePath = await join(dir, "untitled", `${tabId}.md`);
    await writeFile(filePath, new TextEncoder().encode(content));
  } catch (e) {
    console.error("writeUntitledContent error:", e);
  }
}

async function readUntitledContent(tabId: string): Promise<string | null> {
  try {
    const dir = await appDataDir();
    const filePath = await join(dir, "untitled", `${tabId}.md`);
    const data = await readFile(filePath);
    return new TextDecoder().decode(data);
  } catch {
    return null;
  }
}

export async function deleteUntitledContent(tabId: string) {
  try {
    const dir = await appDataDir();
    const filePath = await join(dir, "untitled", `${tabId}.md`);
    await remove(filePath);
  } catch { /* file may not exist */ }
}

const untitledTimers = new Map<string, ReturnType<typeof setTimeout>>();

function setDocumentTitle(title: string) {
  if (typeof document !== "undefined") document.title = title;
}

interface TabState_Store {
  files: TabState[];
  activeFileId: string;
  sessionInitialized: boolean;
  workspaceRoot: string | null;
  getEditorHTMLMap: Map<string, () => string>;
  editorActionMap: Map<string, { undo: () => void; redo: () => void }>;

  openTab: (overrides?: Partial<Omit<TabState, "id">>) => string;
  closeTab: (id: string) => void;
  switchTab: (id: string) => void;
  updateTabContent: (id: string, content: string) => void;
  updateTabMeta: (id: string, meta: Partial<TabState>) => void;
  getActiveFile: () => TabState;
  findTabByPath: (filePath: string) => TabState | undefined;
  newFile: () => string;
  setGetEditorHTML: (tabId: string, fn: (() => string) | null) => void;
  setEditorActions: (tabId: string, actions: { undo: () => void; redo: () => void } | null) => void;
  getEditorHTML: (tabId?: string) => (() => string) | null;
  setWorkspaceRoot: (root: string | null) => void;
  getChatKey: () => string;
  closeWorkspace: () => Promise<boolean>;
}

export const useTabStore = create<TabState_Store>((set, get) => ({
  files: [],
  activeFileId: "",
  sessionInitialized: false,
  workspaceRoot: null,
  getEditorHTMLMap: new Map(),
  editorActionMap: new Map(),

  openTab: (overrides) => {
    const tab = createTab(overrides);
    set((state) => ({
      files: [...state.files, tab],
      activeFileId: tab.id,
    }));
    setDocumentTitle(`${tab.fileName} - MoFlow`);    if (tab.filePath === null) {
      writeUntitledContent(tab.id, tab.content);
    }
    const state = get();
    persistSession(state.files, state.activeFileId);
    const chatKey = get().getChatKey();
    if (!useChatStore.getState().chatLoadedMap[chatKey]) {
      useChatStore.getState().loadChatHistory(chatKey);
    }
    return tab.id;
  },

  closeTab: (id) => {
    const state = get();
    const idx = state.files.findIndex((f) => f.id === id);
    if (idx === -1) return;

    if (untitledTimers.has(id)) {
      clearTimeout(untitledTimers.get(id));
      untitledTimers.delete(id);
    }

    const tab = state.files.find((f) => f.id === id);
    if (tab && tab.filePath === null) {
      if (typeof window !== "undefined") deleteUntitledContent(id);
    }

    if (!state.workspaceRoot) {
      useChatStore.getState().deleteChat(id);
      import("./permissionStore").then(({ usePermissionStore }) => {
        usePermissionStore.getState().clearSessionRules(id);
      });
    }
    state.getEditorHTMLMap.delete(id);
    state.editorActionMap.delete(id);

    const newFiles = state.files.filter((f) => f.id !== id);

    if (newFiles.length === 0) {
      if (state.workspaceRoot) {
        set({ files: [], activeFileId: "" });
        setDocumentTitle("MoFlow");
        persistSession([], "");
      } else {
        set({ files: [], activeFileId: "" });
        setDocumentTitle("MoFlow");
        persistSession([], "");
      }
      return;
    }

    let newActiveId = state.activeFileId;
    if (id === state.activeFileId) {
      const newIdx = Math.min(idx, newFiles.length - 1);
      newActiveId = newFiles[newIdx].id;
    }

    set({ files: newFiles, activeFileId: newActiveId });

    if (id === state.activeFileId) {
      const newActive = newFiles.find((f) => f.id === newActiveId);
      if (newActive) {
        setDocumentTitle(`${newActive.fileName}${newActive.isModified ? "*" : ""} - MoFlow`);

        if (!newActive.contentLoaded && newActive.filePath) {
          import("../lib/fileOps").then(({ loadTabContent }) => {
            loadTabContent(newActiveId);
          });
        }

        const chatKey = get().getChatKey();
        const chatLoaded = useChatStore.getState().chatLoadedMap[chatKey];
        if (chatLoaded === undefined) {
          useChatStore.getState().loadChatHistory(chatKey);
        }
      }
    }

    persistSession(newFiles, newActiveId);
  },

  switchTab: (id) => {
    const state = get();
    const themeState = useThemeStore.getState();
    if (themeState.settingsTabActive) {
      themeState.deactivateSettingsTab();
      if (id === state.activeFileId) return;
    } else if (id === state.activeFileId) {
      return;
    }
    const tab = state.files.find((f) => f.id === id);
    if (!tab) return;
    set({ activeFileId: id });
    setDocumentTitle(`${tab.fileName}${tab.isModified ? "*" : ""} - MoFlow`);
    persistSession(get().files, id);

    if (!tab.contentLoaded && tab.filePath) {
      import("../lib/fileOps").then(({ loadTabContent }) => {
        loadTabContent(id);
      });
    }

    const chatKey = get().getChatKey();
    const chatLoaded = useChatStore.getState().chatLoadedMap[chatKey];
    if (chatLoaded === undefined) {
      useChatStore.getState().loadChatHistory(chatKey);
    }
  },

  updateTabContent: (id, content) => {
    set((state) => ({
      files: state.files.map((f) =>
        f.id === id
          ? { ...f, content, isModified: content !== f.lastSavedContent }
          : f
      ),
    }));

    const state = get();
    const tab = state.files.find((f) => f.id === id);
    if (tab && tab.filePath === null) {
      if (untitledTimers.has(id)) clearTimeout(untitledTimers.get(id));
      untitledTimers.set(
        id,
        setTimeout(() => {
          const s = get();
          const t = s.files.find((f) => f.id === id);
          if (t && t.filePath === null) {
            writeUntitledContent(id, t.content);
          }
          untitledTimers.delete(id);
        }, 3000)
      );
    }
  },

  updateTabMeta: (id, meta) => {
    const prevTab = get().files.find((f) => f.id === id);

    set((state) => ({
      files: state.files.map((f) => {
        if (f.id !== id) return f;
        const merged = { ...f, ...meta };
        if (meta.content !== undefined) {
          merged.lastSavedContent = meta.content;
          merged.isModified = false;
        }
        return merged;
      }),
    }));

    if (prevTab && prevTab.filePath === null && meta.filePath) {
      deleteUntitledContent(id);
    }

    const state = get();
    if (id === state.activeFileId) {
      const tab = state.files.find((f) => f.id === id);
      if (tab) {
        setDocumentTitle(`${tab.fileName}${tab.isModified ? "*" : ""} - MoFlow`);
      }
    }
    persistSession(state.files, state.activeFileId);
  },

  getActiveFile: () => {
    const state = get();
    return state.files.find((f) => f.id === state.activeFileId)!;
  },

  findTabByPath: (filePath) => {
    return get().files.find((f) => f.filePath === filePath);
  },

  newFile: () => {
    return get().openTab();
  },

  setGetEditorHTML: (tabId, fn) => {
    const map = new Map(get().getEditorHTMLMap);
    if (fn) {
      map.set(tabId, fn);
    } else {
      map.delete(tabId);
    }
    set({ getEditorHTMLMap: map });
  },

  setEditorActions: (tabId, actions) => {
    const map = new Map(get().editorActionMap);
    if (actions) {
      map.set(tabId, actions);
    } else {
      map.delete(tabId);
    }
    set({ editorActionMap: map });
  },

  getEditorHTML: (tabId) => {
    const id = tabId ?? get().activeFileId;
    return get().getEditorHTMLMap.get(id) ?? null;
  },

  setWorkspaceRoot: (root) => {
    const prev = get().workspaceRoot;
    if (prev && prev !== root) {
      const oldKey = "dir:" + toPosix(prev).toLowerCase();
      useChatStore.getState().deleteChat(oldKey);
    }
    set({ workspaceRoot: root });
    persistSession(get().files, get().activeFileId);
    if (root) {
      const chatKey = get().getChatKey();
      if (!useChatStore.getState().chatLoadedMap[chatKey]) {
        useChatStore.getState().loadChatHistory(chatKey);
      }
    }
  },

  getChatKey: () => {
    const state = get();
    if (state.workspaceRoot) {
      return "dir:" + toPosix(state.workspaceRoot).toLowerCase();
    }
    return state.activeFileId;
  },

  closeWorkspace: async (): Promise<boolean> => {
    const state = get();
    if (!state.workspaceRoot) return true;

    const wsRoot = toPosix(state.workspaceRoot).toLowerCase();
    const isWsTab = (f: TabState) => {
      if (f.filePath === null) return false;
      return toPosix(f.filePath).toLowerCase().startsWith(wsRoot);
    };

    const wsTabs = state.files.filter(isWsTab);
    const otherTabs = state.files.filter((f) => !isWsTab(f));

    const hasUnsaved = wsTabs.some(
      (f) => f.isModified || (f.filePath === null && f.content.length > 0)
    );
    if (hasUnsaved) {
      const { showConfirmCloseDialog } = await import("../lib/closeDialog");
      const { t } = await import("../i18n/core");
      const wsName = posixBasename(state.workspaceRoot);
      const message = t("common.workspaceUnsaved", { wsName });
      const result = await showConfirmCloseDialog(message);
      if (result === "cancel") return false;
      if (result === "save") {
        const { saveAllFiles } = await import("../lib/fileOps");
        await saveAllFiles();
      }
    }

    const chatKey = "dir:" + wsRoot;
    useChatStore.getState().deleteChat(chatKey);
    const { usePermissionStore } = await import("./permissionStore");
    usePermissionStore.getState().clearSessionRules(chatKey);

    for (const tab of wsTabs) {
      if (tab.filePath === null) {
        deleteUntitledContent(tab.id);
      }
    }

    let newActiveId = state.activeFileId;
    const activeTab = state.files.find((f) => f.id === state.activeFileId);
    if (!activeTab || isWsTab(activeTab)) {
      newActiveId = otherTabs[0]?.id ?? "";
    }

    set({ files: otherTabs, activeFileId: newActiveId, workspaceRoot: null });
    const newActive = otherTabs.find((f) => f.id === newActiveId);
    setDocumentTitle(newActive ? `${newActive.fileName}${newActive.isModified ? "*" : ""} - MoFlow` : "MoFlow");
    persistSession(otherTabs, newActiveId);

    if (newActiveId) {
      const newChatKey = get().getChatKey();
      if (!useChatStore.getState().chatLoadedMap[newChatKey]) {
        useChatStore.getState().loadChatHistory(newChatKey);
      }
    }

    return true;
  },
}));

interface StartupData {
  settings: Record<string, unknown> | null;
  session: Record<string, unknown> | null;
  active_tab_content: string | null;
  active_tab_id: string | null;
  untitled_contents: Record<string, string>;
}

const defaultSettings = {
  appTheme: "system",
  editorTheme: "github",
  autoSave: false,
  showStatusBar: true,
  sidebarWidth: 360,
  outlineWidth: 240,
  aiConfig: { mode: "mock", providerId: "custom", provider: "openai-compatible", apiEndpoint: "", apiToken: "", model: "" },
  proxyUrl: "",
  language: "system" as const,
  permissions: { externalPath: { "*": "ask" }, runSkillScript: { "*": "ask" }, edit: { "*": "ask" } },
  envVars: {} as Record<string, string>,
  maxToolRounds: 20,
};

const defaultAIConfig = { mode: "mock", providerId: "custom", provider: "openai-compatible", apiEndpoint: "", apiToken: "", model: "" };

export async function initFromStartupData(): Promise<boolean> {
  performance.mark("get-startup-data-start");
  const data = await invoke<StartupData | null>("get_startup_data");
  performance.mark("get-startup-data-end");
  performance.measure("get-startup-data", "get-startup-data-start", "get-startup-data-end");

  if (!data || !data.session) return false;

  if (data.settings) {
    performance.mark("apply-settings-start");
    const settings = {
      ...defaultSettings,
      ...data.settings,
      aiConfig: { ...defaultAIConfig, ...(data.settings.aiConfig as Record<string, unknown> || {}) },
      proxyUrl: (data.settings.proxyUrl as string) ?? "",
    };
    useThemeStore.setState({
      appTheme: settings.appTheme as "system" | "light" | "dark",
      editorTheme: settings.editorTheme as "github" | "github-dark" | "nord" | "nord-dark" | "catppuccin-latte" | "catppuccin-mocha",
      autoSave: settings.autoSave as boolean,
      showStatusBar: settings.showStatusBar as boolean,
      sidebarWidth: settings.sidebarWidth as number,
      outlineWidth: (settings.outlineWidth as number) ?? 240,
      aiConfig: settings.aiConfig as import("../lib/settings").AIConfig,
      proxyUrl: settings.proxyUrl,
      language: (settings.language as import("../lib/settings").SupportedLanguage) ?? "system",
      permissions: settings.permissions as import("../lib/permission").Permissions | undefined,
      envVars: (settings.envVars as Record<string, string>) ?? {},
      aiMode: ((data.settings as Record<string, unknown>).aiMode as "build" | "plan") ?? "build",
      shortcutOverrides: ((data.settings as Record<string, unknown>).shortcutOverrides as Record<string, { key: string; modifiers: ("ctrl" | "shift" | "alt")[] }>) ?? {},
      recentFiles: Array.isArray((data.settings as Record<string, unknown>).recentFiles) ? ((data.settings as Record<string, unknown>).recentFiles as string[]) : [],
      recentWorkspaces: Array.isArray((data.settings as Record<string, unknown>).recentWorkspaces) ? ((data.settings as Record<string, unknown>).recentWorkspaces as string[]) : [],
    });
    const { applyShortcutOverrides } = await import("../lib/shortcuts");
    applyShortcutOverrides(useThemeStore.getState().shortcutOverrides);
    await invoke("set_proxy", { proxyUrl: settings.proxyUrl || null });
    performance.mark("apply-settings-end");
    performance.measure("apply-settings", "apply-settings-start", "apply-settings-end");
  }

  performance.mark("restore-session-start");
  const sessionTabs = (data.session.tabs as Array<Record<string, unknown>>) ?? [];
  if (sessionTabs.length === 0) return false;

  const tabs: TabState[] = [];
  for (const st of sessionTabs) {
    const tabId = (st.tabId || st.untitledId) as string | undefined;
    if (!tabId) continue;

    if (st.filePath) {
      const isActive = tabId === data.active_tab_id;
      tabs.push(
        createTab({
          id: tabId,
          filePath: st.filePath as string,
          fileName: st.fileName as string,
          mode: (st.mode as EditorMode) || "wysiwyg",
          content: isActive && data.active_tab_content ? data.active_tab_content : "",
          lastSavedContent: isActive && data.active_tab_content ? data.active_tab_content : "",
          isModified: false,
          contentLoaded: isActive && !!data.active_tab_content,
        })
      );
    } else {
      const content = data.untitled_contents[tabId] ?? "";
      tabs.push(
        createTab({
          id: tabId,
          filePath: null,
          fileName: st.fileName as string,
          mode: (st.mode as EditorMode) || "wysiwyg",
          content,
          lastSavedContent: content,
          isModified: false,
          contentLoaded: true,
        })
      );
    }
  }

  let activeFileId = tabs[0]?.id;
  if (data.active_tab_id) {
    const found = tabs.find((t) => t.id === data.active_tab_id);
    if (found) activeFileId = found.id;
  } else if (data.session?.activeFilePath) {
    const found = tabs.find((t) => t.filePath === data.session!.activeFilePath);
    if (found) activeFileId = found.id;
  } else if (data.session?.activeUntitledId) {
    const found = tabs.find((t) => t.id === data.session!.activeUntitledId);
    if (found) activeFileId = found.id;
  }

  const workspaceRoot = (data.session.workspaceRoot as string) ?? null;
  useTabStore.setState({ files: tabs, activeFileId, sessionInitialized: true, workspaceRoot });
  persistSession(tabs, activeFileId, workspaceRoot);

  performance.mark("restore-session-end");
  performance.measure("restore-session", "restore-session-start", "restore-session-end");

  return true;
}

export async function initSession() {
  performance.mark("readSettings-start");
  const { readSettings } = await import("../lib/settings");
  const { useThemeStore } = await import("./themeStore");
  const settings = await readSettings();
  performance.mark("readSettings-end");
  performance.measure("readSettings", "readSettings-start", "readSettings-end");

  useThemeStore.setState({
    appTheme: settings.appTheme,
    editorTheme: settings.editorTheme,
    autoSave: settings.autoSave,
    showStatusBar: settings.showStatusBar,
    sidebarWidth: settings.sidebarWidth,
    outlineWidth: settings.outlineWidth ?? 240,
    aiConfig: settings.aiConfig,
    proxyUrl: settings.proxyUrl ?? "",
    language: settings.language ?? "system",
    permissions: settings.permissions,
    envVars: settings.envVars ?? {},
    maxToolRounds: settings.maxToolRounds ?? 20,
    aiMode: settings.aiMode ?? "build",
    shortcutOverrides: settings.shortcutOverrides ?? {},
    recentFiles: settings.recentFiles ?? [],
    recentWorkspaces: settings.recentWorkspaces ?? [],
  });

  const { applyShortcutOverrides } = await import("../lib/shortcuts");
  applyShortcutOverrides(settings.shortcutOverrides ?? {});

  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("set_proxy", { proxyUrl: settings.proxyUrl || null });

  performance.mark("restoreSession-start");
  const restored = await restoreSession();
  performance.mark("restoreSession-end");
  performance.measure("restoreSession", "restoreSession-start", "restoreSession-end");

  if (restored) {
    useTabStore.setState({
      files: restored.files,
      activeFileId: restored.activeFileId,
      sessionInitialized: true,
      workspaceRoot: restored.workspaceRoot,
    });

    const activeTab = restored.files.find((f) => f.id === restored.activeFileId);
    if (activeTab && !activeTab.contentLoaded && activeTab.filePath) {
      const { loadTabContent } = await import("../lib/fileOps");
      performance.mark("loadTabContent-start");
      loadTabContent(activeTab.id).finally(() => {
        performance.mark("loadTabContent-end");
        performance.measure("loadTabContent", "loadTabContent-start", "loadTabContent-end");
      });
    }
  } else {
    useTabStore.setState({ sessionInitialized: true });
  }

  const state = useTabStore.getState();
  persistSession(state.files, state.activeFileId);
}

async function restoreSession(): Promise<{ files: TabState[]; activeFileId: string; workspaceRoot: string | null } | null> {
  try {
    const dir = await appDataDir();
    const sessionPath = await join(dir, "session.json");
    if (!(await exists(sessionPath))) {
      return null;
    }

    const data = await readFile(sessionPath);
    const session: SessionData = JSON.parse(new TextDecoder().decode(data));

    const tabs: TabState[] = [];
    if (session.tabs && session.tabs.length > 0) {
      for (const st of session.tabs) {
        const tabId = st.tabId || st.untitledId;

        if (st.filePath) {
          tabs.push(
            createTab({
              id: tabId,
              filePath: st.filePath,
              fileName: st.fileName,
              mode: st.mode,
              content: "",
              lastSavedContent: "",
              isModified: false,
              contentLoaded: false,
            })
          );
        } else {
          const content = tabId ? (await readUntitledContent(tabId)) ?? "" : "";
          tabs.push(
            createTab({
              id: tabId,
              filePath: null,
              fileName: st.fileName,
              mode: st.mode,
              content,
              lastSavedContent: content,
              isModified: false,
              contentLoaded: true,
            })
          );
        }
      }
    }

    let activeFileId = tabs[0]?.id ?? "";
    if (session.activeTabId) {
      const found = tabs.find((t) => t.id === session.activeTabId);
      if (found) activeFileId = found.id;
    } else if (session.activeFilePath) {
      const found = tabs.find((t) => t.filePath === session.activeFilePath);
      if (found) activeFileId = found.id;
    } else if (session.activeUntitledId) {
      const found = tabs.find((t) => t.id === session.activeUntitledId);
      if (found) activeFileId = found.id;
    }

    return { files: tabs, activeFileId, workspaceRoot: session.workspaceRoot ?? null };
  } catch (e) {
    console.error("restoreSession error:", e);
    return null;
  }
}

interface SessionTab {
  tabId?: string;
  untitledId?: string;
  filePath: string | null;
  fileName: string;
  mode: EditorMode;
}

interface SessionData {
  tabs: SessionTab[];
  activeTabId?: string;
  activeFilePath?: string | null;
  activeUntitledId?: string;
  workspaceRoot?: string | null;
}

export async function flushAllUntitled() {
  const state = useTabStore.getState();
  for (const tab of state.files) {
    if (tab.filePath === null && tab.content.length > 0) {
      await writeUntitledContent(tab.id, tab.content);
    }
  }
}
