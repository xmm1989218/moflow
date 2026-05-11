import { appDataDir, join } from "@tauri-apps/api/path";
import { writeFile, mkdir, remove, exists } from "@tauri-apps/plugin-fs";
import { useTabStore, type TabState, type EditorMode } from "./tabStore";

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

async function persistSession(files: TabState[], activeFileId: string, workspaceRoot?: string | null) {
  try {
    const session: SessionData = {
      tabs: files.map((tab) => ({
        tabId: tab.id,
        filePath: tab.filePath,
        fileName: tab.fileName,
        mode: tab.mode,
      })),
      activeTabId: activeFileId,
      workspaceRoot: workspaceRoot ?? useTabStore.getState().workspaceRoot,
    };

    const dir = await appDataDir();
    if (!(await exists(dir))) {
      await mkdir(dir, { recursive: true });
    }
    const json = JSON.stringify(session);
    await writeFile(await join(dir, "session.json"), new TextEncoder().encode(json));
  } catch (e) {
    console.error("[persistSession] error:", e);
  }
}

export async function deleteSession() {
  try {
    const dir = await appDataDir();
    const sessionPath = await join(dir, "session.json");
    if (await exists(sessionPath)) {
      await remove(sessionPath);
    }
  } catch { /* ignore */ }
}

export { persistSession };

export async function persistSessionFromStore() {
  const state = useTabStore.getState();
  await persistSession(state.files, state.activeFileId);
}
