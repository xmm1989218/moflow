const isMac = typeof navigator !== "undefined" && /Mac|iPod|iPhone|iPad/.test(navigator.platform ?? "");

export interface ShortcutDef {
  id: string;
  key: string;
  modifiers: ("ctrl" | "shift" | "alt")[];
  label: { zh: string; en: string };
}

const shortcuts: ShortcutDef[] = [
  { id: "newFile", key: "n", modifiers: ["ctrl"], label: { zh: "新建", en: "New" } },
  { id: "openFile", key: "o", modifiers: ["ctrl"], label: { zh: "打开...", en: "Open..." } },
  { id: "openFolder", key: "o", modifiers: ["ctrl", "shift"], label: { zh: "打开目录", en: "Open Folder" } },
  { id: "saveFile", key: "s", modifiers: ["ctrl"], label: { zh: "保存", en: "Save" } },
  { id: "saveFileAs", key: "s", modifiers: ["ctrl", "shift"], label: { zh: "另存为...", en: "Save As..." } },
  { id: "closeTab", key: "w", modifiers: ["ctrl"], label: { zh: "关闭标签", en: "Close Tab" } },
  { id: "nextTab", key: "Tab", modifiers: ["ctrl"], label: { zh: "下一个标签", en: "Next Tab" } },
  { id: "prevTab", key: "Tab", modifiers: ["ctrl", "shift"], label: { zh: "上一个标签", en: "Previous Tab" } },
  { id: "find", key: "f", modifiers: ["ctrl"], label: { zh: "查找", en: "Find" } },
  { id: "replace", key: "h", modifiers: ["ctrl"], label: { zh: "替换", en: "Replace" } },
  { id: "settings", key: ",", modifiers: ["ctrl"], label: { zh: "设置", en: "Settings" } },
  { id: "outline", key: "F7", modifiers: [], label: { zh: "大纲", en: "Outline" } },
  { id: "aiSidebar", key: "F8", modifiers: [], label: { zh: "AI 助手", en: "AI Assistant" } },
  { id: "fullscreen", key: "F11", modifiers: [], label: { zh: "全屏", en: "Fullscreen" } },
  { id: "devtools", key: "F12", modifiers: [], label: { zh: "开发者工具", en: "Developer Tools" } },
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
  const isZh = typeof navigator !== "undefined" && navigator.language?.startsWith("zh");
  return isZh ? def.label.zh : def.label.en;
}
