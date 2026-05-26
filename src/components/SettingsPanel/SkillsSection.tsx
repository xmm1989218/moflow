import { useState, useEffect, useMemo } from "react";
import { useSkillStore } from "../../stores/skillStore";
import { useThemeStore } from "../../stores/themeStore";
import { showConfirmDialog, showAlertDialog } from "../../lib/closeDialog";
import { checkBunAvailable } from "../../lib/skillRegistry";
import { t } from "../../i18n/core";
import { useT } from "../../i18n/useT";
import { RefreshCw } from "lucide-react";
import type { SkillInstallStatus, SkillEnvEntry } from "../../lib/types";

const SKILL_CATEGORIES = ["writing", "coding", "data", "productivity", "media"] as const;
type SkillCategory = typeof SKILL_CATEGORIES[number];

function HighlightedText({ text, query }: { text: string; query: string }) {
  if (!query) return <>{text}</>;
  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();
  const idx = lowerText.indexOf(lowerQuery);
  if (idx === -1) return <>{text}</>;
  const before = text.slice(0, idx);
  const match = text.slice(idx, idx + query.length);
  const after = text.slice(idx + query.length);
  return (
    <>
      {before}
      <mark className="bg-ui-accent/30 text-ui-text rounded-[2px] px-0.5">{match}</mark>
      {after}
    </>
  );
}

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
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<SkillCategory | "all">("all");

  useEffect(() => {
    discoverSkills();
    fetchRemoteSkills();
  }, [discoverSkills, fetchRemoteSkills]);

  const localMap = new Map(discoveredSkills.map((s) => [s.name, s]));
  const userEnvVars = useThemeStore((s) => s.envVars);

  const matchesSearch = (status: SkillInstallStatus, query: string): boolean => {
    if (!query) return true;
    const q = query.toLowerCase();
    return (
      status.name.toLowerCase().includes(q) ||
      status.description.toLowerCase().includes(q) ||
      (status.tags?.some((tag) => tag.toLowerCase().includes(q)) ?? false)
    );
  };

  const matchesCategory = (status: SkillInstallStatus, cat: SkillCategory | "all"): boolean => {
    if (cat === "all") return true;
    return status.category === cat;
  };

  const filteredStatuses = useMemo(() => {
    return installStatuses.filter(
      (s) => matchesSearch(s, searchQuery) && matchesCategory(s, selectedCategory),
    );
  }, [installStatuses, searchQuery, selectedCategory]);

  const remoteSkills = filteredStatuses.filter((s) => s.status !== "local-only");
  const localOnlySkills = filteredStatuses.filter((s) => s.status === "local-only");

  const availableCategories = useMemo(() => {
    const cats = new Set<string>();
    installStatuses.forEach((s) => {
      if (s.category) cats.add(s.category);
    });
    return SKILL_CATEGORIES.filter((c) => cats.has(c));
  }, [installStatuses]);

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
      const { toast } = await import("../../lib/toast");
      toast.success(t("settings.skills.installed"));
    } catch (e) {
      const { toast } = await import("../../lib/toast");
      toast.error(String(e));
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
      const { toast } = await import("../../lib/toast");
      toast.success(t("settings.skills.uninstalled"));
    } catch (e) {
      const { toast } = await import("../../lib/toast");
      toast.error(String(e));
    } finally {
      setInstallingName(null);
    }
  };

  const handleToggle = (name: string, enabled: boolean) => {
    setSkillEnabled(name, !enabled);
  };

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

  const renderEnvList = (env: SkillEnvEntry[]) => {
    if (env.length === 0) return null;
    return (
      <div className="flex flex-col gap-1 mb-2">
        {env.map((e) => {
          const configured = !!userEnvVars[e.name];
          const isRequired = e.required !== false;
          return (
            <div key={e.name} className="text-[11px]">
              <div className="flex items-center gap-1.5">
                <span className="font-mono text-ui-text-secondary">{e.name}</span>
                {configured ? (
                  <span className="text-[#22c55e] font-medium">{t("settings.skills.envConfigured")}</span>
                ) : isRequired ? (
                  <span className="text-[#f59e0b] font-medium">{t("settings.skills.envRequired")}</span>
                ) : (
                  <span className="text-ui-text-secondary/50">{t("settings.skills.envOptional")}</span>
                )}
              </div>
              <div className="text-ui-text-secondary/60">{e.description}</div>
            </div>
          );
        })}
      </div>
    );
  };

  const renderSkillCard = (status: SkillInstallStatus) => (
    <div key={status.name} className="border border-ui-border rounded-lg p-3">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-[13px] font-semibold text-ui-text">
          <HighlightedText text={status.name} query={searchQuery} />
        </span>
        {renderVersion(status)}
        {renderStatusBadge(status)}
        {status.category && (
          <span className="text-[11px] px-1.5 py-0.5 rounded bg-ui-bg-secondary text-ui-text-secondary font-medium">
            {t(`settings.skills.category.${status.category}`)}
          </span>
        )}
        {status.hasScripts && (
          <span className="text-[11px] text-ui-accent">{t("settings.skills.hasScripts")}</span>
        )}
      </div>
      <div className="text-[12px] text-ui-text-secondary mb-2">
        <HighlightedText text={status.description} query={searchQuery} />
      </div>
      {status.tags && status.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2">
          {status.tags.map((tag) => (
            <span key={tag} className="text-[11px] px-1.5 py-0.5 rounded bg-ui-bg-secondary text-ui-text-secondary">
              <HighlightedText text={tag} query={searchQuery} />
            </span>
          ))}
        </div>
      )}
      {status.env && status.env.length > 0 && renderEnvList(status.env)}
      <div className="flex items-center justify-between">
        {renderActionButton(status)}
        {(status.status === "installed" || status.status === "update" || status.status === "local-only") && renderToggle(status.name)}
      </div>
    </div>
  );

  const isFiltering = searchQuery || selectedCategory !== "all";

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
          <RefreshCw size={14} className={isLoadingRemote ? "animate-spin" : ""} />
        </button>
      </div>

      <div className="flex items-center gap-3 mb-4">
        <input
          className="flex-1 py-1.5 px-2.5 border border-ui-border rounded text-[13px] font-inherit bg-ui-input-bg text-ui-text outline-none focus:border-ui-accent placeholder:text-ui-text-secondary"
          placeholder={t("settings.skills.searchPlaceholder")}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          type="text"
        />
        {availableCategories.length > 0 && (
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              className={`px-2.5 py-1 rounded-md text-[12px] font-medium cursor-pointer border transition-[background-color,border-color,color] duration-150 ${selectedCategory === "all" ? "bg-ui-accent text-white border-ui-accent" : "bg-transparent text-ui-text-secondary border-ui-border hover:bg-ui-bg-secondary"}`}
              onClick={() => setSelectedCategory("all")}
              type="button"
            >
              {t("settings.skills.allCategories")}
            </button>
            {availableCategories.map((cat) => (
              <button
                key={cat}
                className={`px-2.5 py-1 rounded-md text-[12px] font-medium cursor-pointer border transition-[background-color,border-color,color] duration-150 ${selectedCategory === cat ? "bg-ui-accent text-white border-ui-accent" : "bg-transparent text-ui-text-secondary border-ui-border hover:bg-ui-bg-secondary"}`}
                onClick={() => setSelectedCategory(cat)}
                type="button"
              >
                {t(`settings.skills.category.${cat}`)}
              </button>
            ))}
          </div>
        )}
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
            {remoteSkills.map(renderSkillCard)}
          </div>
        </div>
      )}

      {localOnlySkills.length > 0 && (
        <div>
          <h4 className="text-[12px] font-semibold text-ui-text-secondary uppercase tracking-wide mb-3">{t("settings.skills.installedLocal")}</h4>
          <div className="flex flex-col gap-2">
            {localOnlySkills.map(renderSkillCard)}
          </div>
        </div>
      )}

      {!skillLoading && !isLoadingRemote && installStatuses.length === 0 && discoveredSkills.length === 0 && (
        <div className="text-[13px] text-ui-text-secondary">{t("settings.skills.noRemoteSkills")}</div>
      )}

      {isFiltering && filteredStatuses.length === 0 && installStatuses.length > 0 && (
        <div className="text-[13px] text-ui-text-secondary">{t("settings.skills.noResults")}</div>
      )}
    </div>
  );
}