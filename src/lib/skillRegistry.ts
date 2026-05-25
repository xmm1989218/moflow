import yaml from "js-yaml";
import { invoke } from "@tauri-apps/api/core";
import type { RemoteSkill, SkillMeta, SkillInstallStatus } from "./types";

const SKILLS_REPO = "xmm1989218/moflow-skills";
const API_BASE = "https://api.github.com/repos";
const RAW_BASE = "https://raw.githubusercontent.com";

export async function fetchLatestTag(): Promise<string> {
  const url = `${API_BASE}/${SKILLS_REPO}/releases/latest`;
  const body = await invoke<string>("fetch_skill_registry", { url });
  const data = JSON.parse(body);
  if (!data.tag_name) throw new Error("No tag_name in latest release response");
  return data.tag_name as string;
}

export async function fetchRemoteRegistry(tag: string): Promise<{ version: string; skills: RemoteSkill[] }> {
  const url = `${RAW_BASE}/${SKILLS_REPO}/${tag}/registry.yaml`;
  const body = await invoke<string>("fetch_skill_registry", { url });
  const data = yaml.load(body) as { version: string; skills: RemoteSkill[] };
  if (!data.skills || !Array.isArray(data.skills)) throw new Error("Invalid registry.yaml: missing skills array");
  return data;
}

export function computeInstallStatus(
  remoteSkills: RemoteSkill[],
  localSkills: SkillMeta[],
): SkillInstallStatus[] {
  const localMap = new Map(localSkills.map((s) => [s.name, s]));
  const results: SkillInstallStatus[] = [];

  for (const rs of remoteSkills) {
    const local = localMap.get(rs.name);
    if (!local) {
      results.push({
        name: rs.name,
        status: "new",
        remoteVersion: rs.version,
        description: rs.description,
        category: rs.category,
        tags: rs.tags,
        hasScripts: rs.hasScripts,
        hasDeps: rs.hasDeps,
        license: rs.license,
        env: rs.env,
        metadata: rs.metadata,
      });
    } else if (local.version !== rs.version) {
      results.push({
        name: rs.name,
        status: "update",
        localVersion: local.version ?? "0.0.0",
        remoteVersion: rs.version,
        description: rs.description,
        category: rs.category,
        tags: rs.tags,
        hasScripts: rs.hasScripts,
        hasDeps: rs.hasDeps,
        license: rs.license,
        env: rs.env,
        metadata: rs.metadata,
      });
    } else {
      results.push({
        name: rs.name,
        status: "installed",
        localVersion: local.version ?? "0.0.0",
        remoteVersion: rs.version,
        description: rs.description,
        category: rs.category,
        tags: rs.tags,
        hasScripts: rs.hasScripts,
        hasDeps: rs.hasDeps,
        license: rs.license,
        env: rs.env,
        metadata: rs.metadata,
      });
    }
  }

  const remoteNames = new Set(remoteSkills.map((s) => s.name));
  for (const ls of localSkills) {
    if (!remoteNames.has(ls.name)) {
      results.push({
        name: ls.name,
        status: "local-only",
        localVersion: ls.version,
        description: ls.description,
        hasScripts: ls.hasScripts,
        hasDeps: false,
        license: ls.license,
        env: ls.env,
        metadata: ls.metadata,
      });
    }
  }

  return results;
}

export async function installSkill(name: string, tag: string): Promise<void> {
  await invoke("download_and_install_skill", { tag, skillName: name });
}

export async function uninstallSkill(name: string): Promise<void> {
  await invoke("uninstall_skill", { skillName: name });
}

export async function cleanSkillTemp(): Promise<void> {
  await invoke("clean_skill_temp");
}

export async function checkBunAvailable(): Promise<string> {
  return invoke<string>("check_bun_available");
}