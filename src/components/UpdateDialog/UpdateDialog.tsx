import { useEffect } from "react";
import { Bell, CheckCircle, Sparkles, AlertCircle } from "lucide-react";
import { useUpdateStore } from "../../stores/updateStore";
import { t } from "../../i18n/core";
import { useT } from "../../i18n/useT";

export default function UpdateDialog() {
  const status = useUpdateStore((s) => s.status);
  const installAndRestart = useUpdateStore((s) => s.installAndRestart);
  const dismiss = useUpdateStore((s) => s.dismiss);
  useT();

  useEffect(() => {
    if (status.state === "up-to-date" || status.state === "error") {
      const timer = setTimeout(dismiss, 3000);
      return () => clearTimeout(timer);
    }
  }, [status.state, dismiss]);

  useEffect(() => {
    if (status.state === "available") {
      const handler = (e: KeyboardEvent) => {
        if (e.key === "Escape") dismiss();
      };
      document.addEventListener("keydown", handler);
      return () => document.removeEventListener("keydown", handler);
    }
  }, [status.state, dismiss]);

  if (status.state === "idle") return null;

  if (status.state === "checking") {
    return (
      <div role="status" aria-live="polite" className="fixed bottom-5 right-5 z-[1000] flex items-start gap-2.5 p-3.5 min-w-[260px] max-w-[360px] bg-ui-bg border border-ui-border rounded-[10px] shadow-toast animate-toast-in pointer-events-auto">
        <Bell size={16} className="shrink-0 mt-px" />
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-semibold text-ui-text leading-snug">{t("update.checking")}</div>
        </div>
      </div>
    );
  }

  if (status.state === "up-to-date") {
    return (
      <div role="status" aria-live="polite" className="fixed bottom-5 right-5 z-[1000] flex items-start gap-2.5 p-3.5 min-w-[260px] max-w-[360px] bg-ui-bg border border-ui-border rounded-[10px] shadow-toast animate-toast-in pointer-events-auto">
        <CheckCircle size={16} className="shrink-0 mt-px text-[#38a169]" />
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-semibold text-ui-text leading-snug">{t("update.upToDate")}</div>
        </div>
      </div>
    );
  }

  if (status.state === "available") {
    const { info } = status;
    return (
      <div role="alert" aria-live="polite" className="fixed bottom-5 right-5 z-[1000] flex flex-col gap-3 p-3.5 min-w-[260px] max-w-[360px] bg-ui-bg border border-ui-border rounded-[10px] shadow-toast animate-toast-in pointer-events-auto">
        <div className="flex items-start gap-2.5">
        <Sparkles size={16} className="shrink-0 mt-px text-ui-accent" />
          <div className="flex-1 min-w-0">
            <div className="text-[13px] font-semibold text-ui-text leading-snug">
              {t("update.newVersion")}
              <a
                className="text-ui-accent no-underline hover:no-underline"
                href={`https://github.com/xmm1989218/moflow/releases/tag/v${info.version}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                v{info.version}
              </a>
              {t("update.available")}
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <button className="px-3.5 py-[5px] rounded-md text-xs font-medium cursor-pointer border border-ui-border bg-transparent text-ui-text-secondary hover:bg-ui-bg-secondary transition-[background,border-color] duration-150" onClick={dismiss}>
            {t("update.later")}
          </button>
          <button className="px-3.5 py-[5px] rounded-md text-xs font-medium cursor-pointer border border-ui-accent bg-ui-accent text-white hover:opacity-90 transition-[background,border-color] duration-150" onClick={installAndRestart}>
            {t("update.installRestart")}
          </button>
        </div>
      </div>
    );
  }

  if (status.state === "error") {
    return (
      <div role="alert" aria-live="polite" className="fixed bottom-5 right-5 z-[1000] flex items-start gap-2.5 p-3.5 min-w-[260px] max-w-[360px] bg-ui-bg border border-ui-border rounded-[10px] shadow-toast animate-toast-in pointer-events-auto">
        <AlertCircle size={16} className="shrink-0 mt-px text-[#e53e3e]" />
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-semibold text-ui-text leading-snug">{t("update.checkFailed")}</div>
        </div>
      </div>
    );
  }

  return null;
}
