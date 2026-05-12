import en from "./locales/en";
import zh from "./locales/zh";
import ja from "./locales/ja";
import ko from "./locales/ko";

export type LocaleMessages = { readonly [K in keyof typeof en]: string };
export type SupportedLanguage = "system" | "zh" | "en" | "ja" | "ko";

const locales: Record<string, LocaleMessages> = { zh, en, ja, ko };

function detectLanguage(): string {
  const nav = typeof navigator !== "undefined" && navigator.language ? navigator.language : "en";
  if (nav.startsWith("zh")) return "zh";
  if (nav.startsWith("ja")) return "ja";
  if (nav.startsWith("ko")) return "ko";
  return "en";
}

export function resolveLanguage(lang: SupportedLanguage): string {
  if (lang === "system") return detectLanguage();
  return lang;
}

function getLocaleForLang(lang: string): LocaleMessages {
  return locales[lang] ?? locales.en ?? en;
}

let currentLang: string | null = null;

function ensureLang() {
  if (currentLang === null) {
    currentLang = detectLanguage();
  }
}

function interpolate(template: string, params?: Record<string, string | number>): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (_, key) =>
    params[key] !== undefined ? String(params[key]) : `{${key}}`
  );
}

export function t(key: string, params?: Record<string, string | number>): string {
  ensureLang();
  const locale = getLocaleForLang(currentLang!);
  const value = (locale as Record<string, string>)[key] ?? (locales.en as Record<string, string>)[key] ?? key;
  return interpolate(value, params);
}

export function isZh(): boolean {
  return (currentLang ?? "en").startsWith("zh");
}

export function getCurrentLang(): string {
  return currentLang ?? "en";
}

export function setLanguage(lang: SupportedLanguage): void {
  currentLang = resolveLanguage(lang);
}

export function getLocale(): LocaleMessages & { t: typeof t; isZh: typeof isZh } {
  ensureLang();
  const locale = getLocaleForLang(currentLang!);
  return { ...locale, t, isZh };
}
