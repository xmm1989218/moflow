import { create } from "zustand";
import {
  checkForUpdate,
  downloadUpdate,
  installUpdate,
  type UpdateStatus,
  type UpdateInfo,
} from "../lib/updater";
import type { Update } from "@tauri-apps/plugin-updater";

interface UpdateState {
  status: UpdateStatus;
  update: Update | null;
  downloadedVersion: string | null;
  checkUpdate: (manual?: boolean) => Promise<void>;
  installAndRestart: () => Promise<void>;
  dismiss: () => void;
}

let autoDismissTimer: ReturnType<typeof setTimeout> | null = null;

export const useUpdateStore = create<UpdateState>((set, get) => ({
  status: { state: "idle" },
  update: null,
  downloadedVersion: null,

  checkUpdate: async (manual = false) => {
    if (autoDismissTimer) {
      clearTimeout(autoDismissTimer);
      autoDismissTimer = null;
    }

    if (manual) {
      set({ status: { state: "checking" } });
    }

    try {
      const update = await checkForUpdate();
      if (!update) {
        if (manual) {
          set({ status: { state: "up-to-date", version: "" } });
          autoDismissTimer = setTimeout(() => {
            if (get().status.state === "up-to-date") {
              set({ status: { state: "idle" } });
            }
            autoDismissTimer = null;
          }, 3000);
        } else {
          set({ status: { state: "idle" } });
        }
        return;
      }

      const { downloadedVersion } = get();
      if (downloadedVersion !== update.version) {
        await downloadUpdate(update);
        set({ downloadedVersion: update.version });
      }

      const info: UpdateInfo = {
        version: update.version,
        date: update.date,
        body: update.body,
        currentVersion: update.currentVersion,
      };
      set({ status: { state: "available", info }, update });
    } catch (e) {
      console.error("[updater] Update check failed:", e);
      if (manual) {
        const msg = e instanceof Error ? e.message : String(e);
        set({ status: { state: "error", message: msg } });
        autoDismissTimer = setTimeout(() => {
          if (get().status.state === "error") {
            set({ status: { state: "idle" } });
          }
          autoDismissTimer = null;
        }, 3000);
      } else {
        set({ status: { state: "idle" } });
      }
    }
  },

  installAndRestart: async () => {
    const { update } = get();
    if (!update) return;
    try {
      await installUpdate(update);
    } catch (e) {
      console.error("[updater] Install failed:", e);
      set({ status: { state: "idle" }, update: null, downloadedVersion: null });
    }
  },

  dismiss: () => {
    if (autoDismissTimer) {
      clearTimeout(autoDismissTimer);
      autoDismissTimer = null;
    }
    set({ status: { state: "idle" } });
  },
}));
