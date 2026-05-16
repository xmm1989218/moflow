import { useState, useEffect } from "react";
import { useSkillStore } from "../../stores/skillStore";
import { showConfirmDialog, showAlertDialog } from "../../lib/closeDialog";
import { checkBunAvailable } from "../../lib/skillRegistry";
import { t } from "../../i18n/core";
import { useT } from "../../i18n/useT";
import type { SkillInstallStatus } from "../../lib/types";

export default function SkillsSection() {
  useT();
  const discoveredSkills = useSkillStore((s) => s.discoveredSkills);
  const skillLoading = useSkillStore((s) => s.skillLoading);
  const isLoadingRemote = useSkillStore((s) => s.isLoadingRemote);
  const remoteError = useSkillStore((s) => s.remoteError);
  const installStatuses = useSkillStore((s) => s.installStatuses);
  const discoverSkills = useSkillStore((s) => s.discoverSkills);
  const fetchRemoteSkills = useSkillStore((s) => s.fetchRemoteSkills);
  const setSkillEnabled = useSkillStore((s) => s.setSkillEnabled);
  const installSkill = useSkillStore((s) => s.installSkill);
  const uninstallSkill = useSkillStore((s) => s.uninstallSkill);
  const [installingName, setInstallingName] = useState<string | null>(null);

  useEffect(() => {
    discoverSkills();
    fetchRemoteSkills();
  }, [discoverSkills, fetchRemoteSkills]);

  const handleInstall = async (status: SkillInstallStatus) => {
    if (status.hasScripts) {
      try {
        await checkBunAvailable();
      } catch {
        await showAlertDialog(t("settings.skills.bunRequired"));
        return;
      }
    }

    const msg = status.status === "update"
      ? t("settings.skills.confirmUpdate", { name: status.name, local: status.localVersion ?? "?", remote: status.remoteVersion ?? "?" })
      : t("settings.skills.confirmInstall", { name: status.name });
    const confirmed = await showConfirmDialog(msg);
    if (!confirmed) return;

    setInstallingName(status.name);
    try {
      await installSkill(status.name);
    } catch (e) {
      await showAlertDialog(String(e));
    } finally {
      setInstallingName(null);
    }
  };

  const handleUninstall = async (status: SkillInstallStatus) => {
    const confirmed = await showConfirmDialog(t("settings.skills.confirmUninstall", { name: status.name }));
    if (!confirmed) return;

    setInstallingName(status.name);
    try {
      await uninstallSkill(status.name);
    } catch (e) {
      await showAlertDialog(String(e));
    } finally {
      setInstallingName(null);
    }
  };

  const handleToggle = (name: string, enabled: boolean) => {
    setSkillEnabled(name, !enabled);
  };

  const remoteSkills = installStatuses.filter((s) => s.status !== "local-only");
  const localOnlySkills = installStatuses.filter((s) => s.status === "local-only");
  const localMap = new Map(discoveredSkills.map((s) => [s.name, s]));

  const renderVersion = (status: SkillInstallStatus) => {
    if (status.status === "update") {
      return (
        <span className="text-[11px] text-ui-text-secondary">
          {t("settings.skills.updateVersion", { local: status.localVersion ?? "?", remote: status.remoteVersion ?? "?" })}
        </span>
      );
    }
    const v = status.status === "local-only" ? status.localVersion : status.remoteVersion;
    return v ? <span className="text-[11px] text-ui-text-secondary">v{v}</span> : null;
  };

  const renderStatusBadge = (status: SkillInstallStatus) => {
    if (status.status === "new") {
      return <span className="text-[11px] px-1.5 py-0.5 rounded bg-ui-accent/15 text-ui-accent font-medium">{t("settings.skills.new")}</span>;
    }
    return null;
  };

  const renderActionButton = (status: SkillInstallStatus) => {
    const isBusy = installingName === status.name;

    if (status.status === "new") {
      return (
        <button
          className="px-3 py-1 rounded-md text-[12px] font-medium cursor-pointer border border-ui-accent bg-ui-accent text-white hover:opacity-90 disabled:opacity-50 disabled:cursor-default"
          onClick={() => handleInstall(status)}
          disabled={isBusy || installingName !== null}
          type="button"
        >
          {isBusy ? "..." : t("settings.skills.install")}
        </button>
      );
    }

    if (status.status === "update") {
      return (
        <button
          className="px-3 py-1 rounded-md text-[12px] font-medium cursor-pointer border border-ui-accent bg-ui-accent text-white hover:opacity-90 disabled:opacity-50 disabled:cursor-default"
          onClick={() => handleInstall(status)}
          disabled={isBusy || installingName !== null}
          type="button"
        >
          {isBusy ? "..." : t("settings.skills.update")}
        </button>
      );
    }

    if (status.status === "installed") {
      return (
        <span className="px-3 py-1 rounded-md text-[12px] font-medium border border-ui-border bg-ui-bg text-ui-text-secondary cursor-default">
          {t("settings.skills.installed")}
        </span>
      );
    }

    if (status.status === "local-only") {
      return (
        <button
          className="px-3 py-1 rounded-md text-[12px] font-medium cursor-pointer border border-ui-border bg-transparent text-ui-text-secondary hover:bg-ui-bg-secondary hover:text-ui-text disabled:opacity-50 disabled:cursor-default"
          onClick={() => handleUninstall(status)}
          disabled={isBusy || installingName !== null}
          type="button"
        >
          {isBusy ? "..." : t("settings.skills.uninstall")}
        </button>
      );
    }

    return null;
  };

  const renderToggle = (name: string) => {
    const skill = localMap.get(name);
    if (!skill) return null;
    return (
      <button
        className={`w-9 h-5 rounded-full cursor-pointer relative transition-[background-color,border-color] duration-200 shrink-0 ${skill.enabled ? "bg-ui-accent border-ui-accent" : "bg-ui-input-bg border-ui-border"}`}
        onClick={() => handleToggle(name, skill.enabled)}
        type="button"
        aria-pressed={skill.enabled}
      >
        <span className={`absolute top-[3px] left-0.5 w-3.5 h-3.5 rounded-full bg-white transition-transform duration-200${skill.enabled ? " translate-x-4" : ""}`} />
      </button>
    );
  };

  return (
    <div className="max-w-[720px] w-full">
      <div className="flex items-center justify-between pb-2 border-b border-ui-border mb-5">
        <h3 className="text-sm font-semibold text-ui-text m-0">{t("settings.section.skills")}</h3>
        <button
          className="flex items-center justify-center w-7 h-7 rounded-md border-none bg-transparent text-ui-text-secondary cursor-pointer hover:bg-ui-bg-secondary hover:text-ui-text disabled:opacity-50"
          onClick={() => fetchRemoteSkills()}
          disabled={isLoadingRemote}
          type="button"
          title={t("settings.skills.refresh")}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={isLoadingRemote ? "animate-spin" : ""}
          >
            <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2" />
          </svg>
        </button>
      </div>

      {remoteError && (
        <div className="mb-4 px-3 py-2 rounded-md bg-red-500/10 text-[12px] text-red-500">
          {t("settings.skills.remoteError")}: {remoteError}
        </div>
      )}

      {isLoadingRemote && installStatuses.length === 0 && (
        <div className="mb-4 text-[13px] text-ui-text-secondary">{t("settings.skills.fetchingRemote")}</div>
      )}

      {remoteSkills.length > 0 && (
        <div className="mb-6">
          <h4 className="text-[12px] font-semibold text-ui-text-secondary uppercase tracking-wide mb-3">{t("settings.skills.available")}</h4>
          <div className="flex flex-col gap-2">
            {remoteSkills.map((status) => (
              <div key={status.name} className="border border-ui-border rounded-lg p-3">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[13px] font-semibold text-ui-text">{status.name}</span>
                  {renderVersion(status)}
                  {renderStatusBadge(status)}
                  {status.hasScripts && (
                    <span className="text-[11px] text-ui-accent">{t("settings.skills.hasScripts")}</span>
                  )}
                </div>
                <div className="text-[12px] text-ui-text-secondary mb-2">{status.description}</div>
                <div className="flex items-center justify-between">
                  {renderActionButton(status)}
                  {(status.status === "installed" || status.status === "update") && renderToggle(status.name)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {localOnlySkills.length > 0 && (
        <div>
          <h4 className="text-[12px] font-semibold text-ui-text-secondary uppercase tracking-wide mb-3">{t("settings.skills.installedLocal")}</h4>
          <div className="flex flex-col gap-2">
            {localOnlySkills.map((status) => (
              <div key={status.name} className="border border-ui-border rounded-lg p-3">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[13px] font-semibold text-ui-text">{status.name}</span>
                  {renderVersion(status)}
                  <span className="text-[11px] px-1.5 py-0.5 rounded bg-ui-bg-secondary text-ui-text-secondary font-medium">{t("settings.skills.localOnly")}</span>
                  {status.hasScripts && (
                    <span className="text-[11px] text-ui-accent">{t("settings.skills.hasScripts")}</span>
                  )}
                </div>
                <div className="text-[12px] text-ui-text-secondary mb-2">{status.description}</div>
                <div className="flex items-center justify-between">
                  {renderActionButton(status)}
                  {renderToggle(status.name)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {!skillLoading && !isLoadingRemote && installStatuses.length === 0 && discoveredSkills.length === 0 && (
        <div className="text-[13px] text-ui-text-secondary">{t("settings.skills.noRemoteSkills")}</div>
      )}
    </div>
  );
}
