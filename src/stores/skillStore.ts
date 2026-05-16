import { create } from "zustand";
import type { SkillMeta, RemoteSkill, SkillInstallStatus } from "../lib/types";
import { discoverSkills } from "../lib/skillManager";
import {
  fetchLatestTag,
  fetchRemoteRegistry,
  computeInstallStatus,
  installSkill as registryInstall,
  uninstallSkill as registryUninstall,
  cleanSkillTemp,
} from "../lib/skillRegistry";

interface SkillState {
  discoveredSkills: SkillMeta[];
  skillLoading: boolean;
  remoteSkills: RemoteSkill[];
  installStatuses: SkillInstallStatus[];
  latestTag: string | null;
  isLoadingRemote: boolean;
  remoteError: string | null;

  discoverSkills: () => Promise<void>;
  setSkillEnabled: (name: string, enabled: boolean) => void;
  fetchRemoteSkills: () => Promise<void>;
  installSkill: (name: string) => Promise<void>;
  uninstallSkill: (name: string) => Promise<void>;
}

export const useSkillStore = create<SkillState>((set, get) => ({
  discoveredSkills: [],
  skillLoading: false,
  remoteSkills: [],
  installStatuses: [],
  latestTag: null,
  isLoadingRemote: false,
  remoteError: null,

  discoverSkills: async () => {
    set({ skillLoading: true });
    try {
      await cleanSkillTemp();
      const skills = await discoverSkills();
      const prevEnabled = new Map(
        get().discoveredSkills.map((s) => [s.name, s.enabled]),
      );
      const merged = skills.map((s) => ({
        ...s,
        enabled: prevEnabled.get(s.name) ?? s.enabled,
      }));
      set({ discoveredSkills: merged });

      const { remoteSkills } = get();
      if (remoteSkills.length > 0) {
        set({ installStatuses: computeInstallStatus(remoteSkills, merged) });
      }
    } catch (e) {
      console.error("[skillStore] discoverSkills failed:", e);
    } finally {
      set({ skillLoading: false });
    }
  },

  setSkillEnabled: (name, enabled) => {
    set((state) => ({
      discoveredSkills: state.discoveredSkills.map((s) =>
        s.name === name ? { ...s, enabled } : s,
      ),
    }));
  },

  fetchRemoteSkills: async () => {
    set({ isLoadingRemote: true, remoteError: null });
    try {
      const tag = await fetchLatestTag();
      const registry = await fetchRemoteRegistry(tag);
      const localSkills = get().discoveredSkills;
      const statuses = computeInstallStatus(registry.skills, localSkills);
      set({
        remoteSkills: registry.skills,
        installStatuses: statuses,
        latestTag: tag,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[skillStore] fetchRemoteSkills failed:", e);
      set({ remoteError: msg });
    } finally {
      set({ isLoadingRemote: false });
    }
  },

  installSkill: async (name) => {
    const { latestTag } = get();
    if (!latestTag) throw new Error("No remote tag available");
    await registryInstall(name, latestTag);
    await get().discoverSkills();
    await get().fetchRemoteSkills();
  },

  uninstallSkill: async (name) => {
    await registryUninstall(name);
    await get().discoverSkills();
    await get().fetchRemoteSkills();
  },
}));
