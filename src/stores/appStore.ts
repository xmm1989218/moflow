import { create } from "zustand";

export type CloseDialogResult = "save" | "discard" | "cancel";
export type DialogMode = "confirm-close" | "alert";

interface CloseDialogState {
  visible: boolean;
  message: string;
  mode: DialogMode;
}

interface AppState {
  closeDialog: CloseDialogState;

  showCloseDialog: (message: string) => void;
  showAlertDialog: (message: string) => void;
  hideCloseDialog: () => void;
}

export const useAppStore = create<AppState>((set) => ({
  closeDialog: { visible: false, message: "", mode: "confirm-close" },

  showCloseDialog: (message) => {
    set({ closeDialog: { visible: true, message, mode: "confirm-close" } });
  },

  showAlertDialog: (message) => {
    set({ closeDialog: { visible: true, message, mode: "alert" } });
  },

  hideCloseDialog: () => {
    set({ closeDialog: { visible: false, message: "", mode: "confirm-close" } });
  },
}));

export { useTabStore, type TabState, type EditorMode, createTab, deleteUntitledContent, flushAllUntitled, initSession, initFromStartupData } from "./tabStore";
export { useThemeStore, type AppTheme, type EditorTheme, EDITOR_THEMES, resolveAppTheme } from "./themeStore";
export { persistSessionFromStore, deleteSession } from "./sessionStore";
export { usePermissionStore } from "./permissionStore";
