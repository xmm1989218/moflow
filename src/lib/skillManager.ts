import yaml from "js-yaml";
import { appDataDir, join } from "@tauri-apps/api/path";
import { readFile, mkdir, exists, readDir } from "@tauri-apps/plugin-fs";
import { invoke } from "@tauri-apps/api/core";
import type { SkillMeta } from "./types";

const NAME_RE = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;

export async function getSkillsDir(): Promise<string> {
  const dir = await appDataDir();
  const skillsDir = await join(dir, "skills");
  if (!(await exists(skillsDir))) {
    await mkdir(skillsDir, { recursive: true });
  }
  return skillsDir;
}

export function parseSkillMd(content: string): { meta: Omit<SkillMeta, "path" | "enabled" | "hasScripts">; body: string } {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) throw new Error("Invalid SKILL.md: missing frontmatter");

  let raw: Record<string, unknown>;
  try {
    raw = yaml.load(match[1]) as Record<string, unknown>;
  } catch (e) {
    throw new Error(`Invalid SKILL.md YAML: ${e}`, { cause: e });
  }

  const name = typeof raw.name === "string" ? raw.name.trim() : "";
  if (!name) throw new Error("Invalid SKILL.md: name is required");
  if (!NAME_RE.test(name)) throw new Error(`Invalid SKILL.md: name "${name}" must be lowercase alphanumeric with hyphens, no leading/trailing/consecutive hyphens`);
  if (name.length > 64) throw new Error(`Invalid SKILL.md: name "${name}" exceeds 64 characters`);

  const description = typeof raw.description === "string" ? raw.description.trim() : "";
  if (!description) throw new Error("Invalid SKILL.md: description is required");
  if (description.length > 1024) throw new Error("Invalid SKILL.md: description exceeds 1024 characters");

  const version = typeof raw.version === "string" ? raw.version.trim() : undefined;
  const license = typeof raw.license === "string" ? raw.license : undefined;
  const compatibility = typeof raw.compatibility === "string" ? raw.compatibility : undefined;
  const allowedTools = typeof raw["allowed-tools"] === "string" ? raw["allowed-tools"] : undefined;

  let metadata: Record<string, string> | undefined;
  if (raw.metadata && typeof raw.metadata === "object") {
    metadata = {};
    for (const [k, v] of Object.entries(raw.metadata as Record<string, unknown>)) {
      metadata[k] = String(v);
    }
  }

  return {
    meta: { name, description, version, license, compatibility, metadata, allowedTools },
    body: match[2].trim(),
  };
}

async function hasScriptsDir(skillDir: string): Promise<boolean> {
  const scriptsDir = await join(skillDir, "scripts");
  if (!(await exists(scriptsDir))) return false;
  try {
    const entries = await readDir(scriptsDir);
    return entries.some((e) => e.name.endsWith(".ts") || e.name.endsWith(".js"));
  } catch {
    return false;
  }
}

export async function listScriptFiles(name: string): Promise<string[]> {
  const skillsDir = await getSkillsDir();
  const scriptsDir = await join(skillsDir, name, "scripts");
  if (!(await exists(scriptsDir))) return [];
  try {
    const entries = await readDir(scriptsDir);
    return entries
      .filter((e) => !e.isDirectory && (e.name.endsWith(".ts") || e.name.endsWith(".js")))
      .map((e) => e.name);
  } catch {
    return [];
  }
}

export async function discoverSkills(): Promise<SkillMeta[]> {
  const skillsDir = await getSkillsDir();
  const skills: SkillMeta[] = [];

  try {
    const entries = await readDir(skillsDir);
    for (const entry of entries) {
      if (entry.isDirectory) {
        const skillDir = await join(skillsDir, entry.name);
        const skillMdPath = await join(skillDir, "SKILL.md");
        if (!(await exists(skillMdPath))) continue;

        try {
          const data = await readFile(skillMdPath);
          const content = new TextDecoder().decode(data);
          const { meta } = parseSkillMd(content);
          const hasScripts = await hasScriptsDir(skillDir);

          if (meta.name !== entry.name) {
            console.warn(`[skillManager] Skill name "${meta.name}" does not match directory "${entry.name}", skipping`);
            continue;
          }

          skills.push({
            ...meta,
            path: skillDir,
            enabled: true,
            hasScripts,
          });
        } catch (e) {
          console.warn(`[skillManager] Failed to parse ${entry.name}/SKILL.md:`, e);
        }
      }
    }
  } catch (e) {
    console.error("[skillManager] Failed to scan skills directory:", e);
  }

  return skills;
}

export async function loadSkillBody(name: string): Promise<string> {
  const skillsDir = await getSkillsDir();
  const skillMdPath = await join(skillsDir, name, "SKILL.md");
  const data = await readFile(skillMdPath);
  const content = new TextDecoder().decode(data);
  const { body } = parseSkillMd(content);
  return body;
}

export async function readSkillFile(name: string, relativePath: string): Promise<string> {
  const skillsDir = await getSkillsDir();
  const skillDir = await join(skillsDir, name);
  const filePath = await join(skillDir, relativePath);

  const normalizedPath = filePath.replace(/\\/g, "/");
  const normalizedSkillDir = skillDir.replace(/\\/g, "/");
  if (!normalizedPath.startsWith(normalizedSkillDir + "/")) {
    throw new Error("Path traversal: file is outside skill directory");
  }

  const data = await readFile(filePath);
  const content = new TextDecoder().decode(data);
  if (content.length > 100 * 1024) {
    return content.slice(0, 100 * 1024) + "\n[truncated at 100KB]";
  }
  return content;
}

export async function executeSkillScript(
  skillName: string,
  script: string,
  args: string,
  envVars?: Record<string, string>,
): Promise<string> {
  const skillsDir = await getSkillsDir();
  const scriptPath = await join(skillsDir, skillName, "scripts", script);

  const normalizedScript = scriptPath.replace(/\\/g, "/");
  const normalizedSkillsDir = skillsDir.replace(/\\/g, "/");
  if (!normalizedScript.startsWith(normalizedSkillsDir + "/")) {
    throw new Error("Path traversal: script is outside skills directory");
  }

  return invoke<string>("execute_script", {
    scriptPath,
    args: args ? args.split(/\s+/).filter(Boolean) : [],
    envVars: envVars ?? null,
    timeoutSecs: 30,
  });
}
