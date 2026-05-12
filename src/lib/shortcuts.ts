import { t } from "../i18n/core";

const isMac = typeof navigator !== "undefined" && /Mac|iPod|iPhone|iPad/.test(navigator.platform ?? "");

export interface ShortcutDef {
  id: string;
  key: string;
  modifiers: ("ctrl" | "shift" | "alt")[];
  labelKey: string;
}

const shortcuts: ShortcutDef[] = [
  { id: "newFile", key: "n", modifiers: ["ctrl"], labelKey: "shortcut.newFile" },
  { id: "openFile", key: "o", modifiers: ["ctrl"], labelKey: "shortcut.openFile" },
  { id: "openFolder", key: "o", modifiers: ["ctrl", "shift"], labelKey: "shortcut.openFolder" },
  { id: "saveFile", key: "s", modifiers: ["ctrl"], labelKey: "shortcut.saveFile" },
  { id: "saveFileAs", key: "s", modifiers: ["ctrl", "shift"], labelKey: "shortcut.saveFileAs" },
  { id: "undo", key: "z", modifiers: ["ctrl"], labelKey: "shortcut.undo" },
  { id: "redo", key: "y", modifiers: ["ctrl"], labelKey: "shortcut.redo" },
  { id: "closeTab", key: "w", modifiers: ["ctrl"], labelKey: "shortcut.closeTab" },
  { id: "nextTab", key: "Tab", modifiers: ["ctrl"], labelKey: "shortcut.nextTab" },
  { id: "prevTab", key: "Tab", modifiers: ["ctrl", "shift"], labelKey: "shortcut.prevTab" },
  { id: "find", key: "f", modifiers: ["ctrl"], labelKey: "shortcut.find" },
  { id: "replace", key: "h", modifiers: ["ctrl"], labelKey: "shortcut.replace" },
  { id: "settings", key: ",", modifiers: ["ctrl"], labelKey: "shortcut.settings" },
  { id: "outline", key: "F7", modifiers: [], labelKey: "shortcut.outline" },
  { id: "aiSidebar", key: "F8", modifiers: [], labelKey: "shortcut.aiSidebar" },
  { id: "fullscreen", key: "F11", modifiers: [], labelKey: "shortcut.fullscreen" },
  { id: "devtools", key: "F12", modifiers: [], labelKey: "shortcut.devtools" },
];

const shortcutMap = new Map(shortcuts.map((s) => [s.id, s]));

export function getShortcut(id: string): ShortcutDef | undefined {
  return shortcutMap.get(id);
}

export function getAllShortcuts(): ShortcutDef[] {
  return shortcuts;
}

export function getShortcutDisplay(id: string): string {
  const def = shortcutMap.get(id);
  if (!def) return "";
  const parts: string[] = [];
  if (def.modifiers.includes("ctrl")) {
    parts.push(isMac ? "⌘" : "Ctrl");
  }
  if (def.modifiers.includes("shift")) {
    parts.push(isMac ? "⇧" : "Shift");
  }
  if (def.modifiers.includes("alt")) {
    parts.push(isMac ? "⌥" : "Alt");
  }
  const keyDisplay = def.key === "," ? "," : def.key.length === 1 ? def.key.toUpperCase() : def.key;
  parts.push(keyDisplay);
  return parts.join(isMac ? "" : "+");
}

export function getShortcutLabel(id: string): string {
  const def = shortcutMap.get(id);
  if (!def) return "";
  return t(def.labelKey);
}
