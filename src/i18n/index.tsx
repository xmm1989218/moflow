import { createContext, useEffect, useMemo, type ReactNode } from "react";
import { resolveLanguage, t, isZh, setLanguage, type SupportedLanguage } from "./core";
import { notifyI18nChange } from "./useT";

interface I18nContextValue {
  lang: string;
  t: typeof t;
  isZh: typeof isZh;
}

const I18nContext = createContext<I18nContextValue>({
  lang: "en",
  t,
  isZh,
});

export function I18nProvider({
  children,
  language,
}: {
  children: ReactNode;
  language: SupportedLanguage;
}) {
  const lang = resolveLanguage(language);

  useEffect(() => {
    setLanguage(language);
    notifyI18nChange();
  }, [language]);

  const value = useMemo(
    () => ({ lang, t, isZh }),
    [lang]
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}
