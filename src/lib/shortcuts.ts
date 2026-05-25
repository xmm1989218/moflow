import { t } from "../i18n/core";

const isMac = typeof navigator !== "undefined" && /Mac|iPod|iPhone|iPad/.test(((navigator as unknown) as { userAgentData?: { platform?: string }; platform?: string }).userAgentData?.platform ?? navigator.platform ?? "");

export interface ShortcutDef {
  id: string;
  key: string;
  modifiers: ("ctrl" | "shift" | "alt")[];
  labelKey: string;
}

export interface ShortcutOverride {
  key: string;
  modifiers: ("ctrl" | "shift" | "alt")[];
}

export const defaultShortcuts: ShortcutDef[] = [
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

let overrides: Record<string, ShortcutOverride> = {};

export function applyShortcutOverrides(userOverrides: Record<string, ShortcutOverride>): void {
  overrides = userOverrides;
}

export function getShortcut(id: string): ShortcutDef | undefined {
  const base = defaultShortcuts.find((s) => s.id === id);
  if (!base) return undefined;
  const ovr = overrides[id];
  if (ovr && ovr.key) return { ...base, key: ovr.key, modifiers: ovr.modifiers ?? base.modifiers };
  return base;
}

export function getAllShortcuts(): ShortcutDef[] {
  return defaultShortcuts.map((s) => {
    const ovr = overrides[s.id];
    if (ovr && ovr.key) return { ...s, key: ovr.key, modifiers: ovr.modifiers ?? s.modifiers };
    return s;
  });
}

export function formatShortcutDisplay(def: ShortcutDef | ShortcutOverride & { key: string }): string {
  const parts: string[] = [];
  const mods = "modifiers" in def ? def.modifiers : [];
  if (mods.includes("ctrl")) {
    parts.push(isMac ? "⌘" : "Ctrl");
  }
  if (mods.includes("shift")) {
    parts.push(isMac ? "⇧" : "Shift");
  }
  if (mods.includes("alt")) {
    parts.push(isMac ? "⌥" : "Alt");
  }
  const keyDisplay = def.key === "," ? "," : def.key.length === 1 ? def.key.toUpperCase() : def.key;
  parts.push(keyDisplay);
  return parts.join(isMac ? "" : "+");
}

export function getShortcutDisplay(id: string): string {
  const def = getShortcut(id);
  if (!def) return "";
  return formatShortcutDisplay(def);
}

export function getShortcutLabel(id: string): string {
  const def = getShortcut(id);
  if (!def) return "";
  return t(def.labelKey);
}

export function findConflict(id: string, key: string, modifiers: ("ctrl" | "shift" | "alt")[]): string | null {
  const all = getAllShortcuts();
  for (const s of all) {
    if (s.id === id) continue;
    if (s.key === key && s.modifiers.length === modifiers.length && s.modifiers.every((m) => modifiers.includes(m))) {
      return s.id;
    }
  }
  return null;
}

export function parseKeyEvent(e: KeyboardEvent): ShortcutOverride | null {
  if (e.key === "Control" || e.key === "Shift" || e.key === "Alt" || e.key === "Meta") return null;
  const modifiers: ("ctrl" | "shift" | "alt")[] = [];
  if (e.ctrlKey || e.metaKey) modifiers.push("ctrl");
  if (e.shiftKey) modifiers.push("shift");
  if (e.altKey) modifiers.push("alt");
  const key = e.key === "," ? "," : e.key;
  if (!key || key.length === 0) return null;
  return { key, modifiers };
}
