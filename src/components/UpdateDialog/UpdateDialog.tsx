import { useEffect } from "react";
import { useUpdateStore } from "../../stores/updateStore";
import { t } from "../../lib/i18n";

export default function UpdateDialog() {
  const status = useUpdateStore((s) => s.status);
  const installAndRestart = useUpdateStore((s) => s.installAndRestart);
  const dismiss = useUpdateStore((s) => s.dismiss);

  useEffect(() => {
    if (status.state === "up-to-date" || status.state === "error") {
      const timer = setTimeout(dismiss, 3000);
      return () => clearTimeout(timer);
    }
  }, [status.state, dismiss]);

  if (status.state === "idle") return null;

  if (status.state === "checking") {
    return (
      <div className="fixed bottom-5 right-5 z-[1000] flex items-start gap-2.5 p-3.5 min-w-[260px] max-w-[360px] bg-ui-bg border border-ui-border rounded-[10px] shadow-toast animate-toast-in pointer-events-auto">
        <div className="shrink-0 w-5 h-5 flex items-center justify-center text-sm mt-px">⏳</div>
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-semibold text-ui-text leading-snug">{t("正在检查更新…", "Checking for updates…")}</div>
        </div>
      </div>
    );
  }

  if (status.state === "up-to-date") {
    return (
      <div className="fixed bottom-5 right-5 z-[1000] flex items-start gap-2.5 p-3.5 min-w-[260px] max-w-[360px] bg-ui-bg border border-ui-border rounded-[10px] shadow-toast animate-toast-in pointer-events-auto">
        <div className="shrink-0 w-5 h-5 flex items-center justify-center text-sm mt-px text-[#38a169]">✓</div>
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-semibold text-ui-text leading-snug">{t("已是最新版本", "You're up to date")}</div>
        </div>
      </div>
    );
  }

  if (status.state === "available") {
    const { info } = status;
    return (
      <div className="fixed bottom-5 right-5 z-[1000] flex flex-col gap-3 p-3.5 min-w-[260px] max-w-[360px] bg-ui-bg border border-ui-border rounded-[10px] shadow-toast animate-toast-in pointer-events-auto">
        <div className="flex items-start gap-2.5">
          <div className="shrink-0 w-5 h-5 flex items-center justify-center text-sm mt-px text-ui-accent">↓</div>
          <div className="flex-1 min-w-0">
            <div className="text-[13px] font-semibold text-ui-text leading-snug">
              {t("新版本 ", "New version ")}
              <a
                className="text-ui-accent no-underline hover:no-underline"
                href={`https://github.com/xmm1989218/moflow/releases/tag/v${info.version}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                v{info.version}
              </a>
              {t(" 可用", " available")}
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <button className="px-3.5 py-[5px] rounded-md text-xs font-medium cursor-pointer border border-ui-border bg-transparent text-ui-text-secondary hover:bg-ui-bg-secondary transition-[background,border-color] duration-150" onClick={dismiss}>
            {t("稍后", "Later")}
          </button>
          <button className="px-3.5 py-[5px] rounded-md text-xs font-medium cursor-pointer border border-ui-accent bg-ui-accent text-white hover:opacity-90 transition-[background,border-color] duration-150" onClick={installAndRestart}>
            {t("安装并重启", "Install & Restart")}
          </button>
        </div>
      </div>
    );
  }

  if (status.state === "error") {
    return (
      <div className="fixed bottom-5 right-5 z-[1000] flex items-start gap-2.5 p-3.5 min-w-[260px] max-w-[360px] bg-ui-bg border border-ui-border rounded-[10px] shadow-toast animate-toast-in pointer-events-auto">
        <div className="shrink-0 w-5 h-5 flex items-center justify-center text-sm mt-px text-[#e53e3e]">✕</div>
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-semibold text-ui-text leading-snug">{t("检查更新失败", "Update check failed")}</div>
        </div>
      </div>
    );
  }

  return null;
}
