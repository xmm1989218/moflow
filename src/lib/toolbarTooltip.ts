import { t } from "../i18n/core";

export function getToolbarTooltipMap(): Record<string, string> {
  return {
    bold: t("toolbar.bold"),
    italic: t("toolbar.italic"),
    strikethrough: t("toolbar.strikethrough"),
    code: t("toolbar.code"),
    latex: t("toolbar.latex"),
    link: t("toolbar.link"),
    highlight: t("toolbar.highlight"),
    explain: t("toolbar.explain"),
    translate: t("toolbar.translate"),
    polish: t("toolbar.polish"),
    ask: t("toolbar.ask"),
  };
}

export const BUILT_IN_TOOLTIP_KEYS = ["bold", "italic", "strikethrough", "code", "latex", "link"];
