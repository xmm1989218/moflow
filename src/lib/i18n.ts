export const isZh = navigator.language.startsWith("zh");
export const t = (zh: string, en: string) => (isZh ? zh : en);
