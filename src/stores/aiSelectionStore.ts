import { create } from "zustand";

export type AIAction = "explain" | "translate" | "ask" | "polish";

export const LANGUAGES = [
  { code: "auto", label: "自动检测", labelEn: "Auto Detect" },
  { code: "zh-CN", label: "中文（简体）", labelEn: "Chinese (Simplified)" },
  { code: "zh-TW", label: "中文（繁体）", labelEn: "Chinese (Traditional)" },
  { code: "en", label: "英语", labelEn: "English" },
  { code: "ja", label: "日语", labelEn: "Japanese" },
  { code: "ko", label: "韩语", labelEn: "Korean" },
  { code: "fr", label: "法语", labelEn: "French" },
  { code: "de", label: "德语", labelEn: "German" },
  { code: "es", label: "西班牙语", labelEn: "Spanish" },
  { code: "ru", label: "俄语", labelEn: "Russian" },
] as const;

export type LanguageCode = (typeof LANGUAGES)[number]["code"];

interface AISelectionState {
  selectedText: string;
  selectionCoords: { x: number; y: number } | null;
  activeAction: AIAction | null;
  sourceLang: LanguageCode;
  targetLang: LanguageCode;
  lastResult: string;
  replaceSelection: ((newText: string) => void) | null;
  rewriteKey: number;

  triggerExplain: (text: string, coords: { x: number; y: number }) => void;
  triggerTranslate: (text: string, coords: { x: number; y: number }) => void;
  triggerAsk: (text: string, coords: { x: number; y: number }) => void;
  triggerPolish: (text: string, coords: { x: number; y: number }) => void;
  setTargetLang: (lang: LanguageCode) => void;
  setSourceLang: (lang: LanguageCode) => void;
  swapLanguages: () => void;
  setLastResult: (r: string) => void;
  setReplaceSelection: (fn: ((newText: string) => void) | null) => void;
  dismiss: () => void;
}

function getDefaultTargetLang(): LanguageCode {
  const lang = navigator.language ?? "";
  if (lang.startsWith("zh")) return "zh-CN";
  if (lang.startsWith("en")) return "en";
  if (lang.startsWith("ja")) return "ja";
  if (lang.startsWith("ko")) return "ko";
  if (lang.startsWith("fr")) return "fr";
  if (lang.startsWith("de")) return "de";
  if (lang.startsWith("es")) return "es";
  if (lang.startsWith("ru")) return "ru";
  return "zh-CN";
}

export const useAISelectionStore = create<AISelectionState>((set, get) => ({
  selectedText: "",
  selectionCoords: null,
  activeAction: null,
  sourceLang: "auto",
  targetLang: getDefaultTargetLang(),
  lastResult: "",
  replaceSelection: null,
  rewriteKey: 0,

  triggerExplain: (text, coords) => {
    set({ selectedText: text, selectionCoords: coords, activeAction: "explain", lastResult: "" });
  },

  triggerTranslate: (text, coords) => {
    set({ selectedText: text, selectionCoords: coords, activeAction: "translate", lastResult: "" });
  },

  triggerAsk: (text, coords) => {
    set({ selectedText: text, selectionCoords: coords, activeAction: "ask", lastResult: "" });
  },

  triggerPolish: (text, coords) => {
    set((s) => ({ selectedText: text, selectionCoords: coords, activeAction: "polish", lastResult: "", rewriteKey: s.rewriteKey + 1 }));
  },

  setTargetLang: (lang) => {
    set({ targetLang: lang });
  },

  setSourceLang: (lang) => {
    set({ sourceLang: lang });
  },

  swapLanguages: () => {
    const { sourceLang, targetLang } = get();
    set({
      sourceLang: targetLang === "auto" ? "en" : targetLang,
      targetLang: sourceLang === "auto" ? "zh-CN" : sourceLang,
    });
  },

  setLastResult: (r) => set({ lastResult: r }),

  setReplaceSelection: (fn) => set({ replaceSelection: fn }),

  dismiss: () => {
    set({ activeAction: null, selectedText: "", selectionCoords: null, lastResult: "" });
  },
}));
