export const isZh = typeof navigator !== "undefined" && navigator.language?.startsWith("zh");
export const t = (zh: string, en: string) => (isZh ? zh : en);
