export interface ToolCall {
  id: string;
  name: string;
  arguments: string;
}

export interface ToolDefinition {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface SkillMeta {
  name: string;
  description: string;
  version?: string;
  license?: string;
  compatibility?: string;
  allowedTools?: string;
  metadata?: Record<string, string>;
  path: string;
  enabled: boolean;
  hasScripts: boolean;
}

export interface RemoteSkill {
  name: string;
  description: string;
  version: string;
  hasScripts: boolean;
  hasDeps: boolean;
  license?: string;
  metadata?: Record<string, string>;
}

export type SkillInstallStatus =
  | {
      name: string;
      status: "new";
      remoteVersion: string;
      description: string;
      hasScripts: boolean;
      hasDeps: boolean;
      license?: string;
      metadata?: Record<string, string>;
    }
  | {
      name: string;
      status: "update";
      localVersion: string;
      remoteVersion: string;
      description: string;
      hasScripts: boolean;
      hasDeps: boolean;
      license?: string;
      metadata?: Record<string, string>;
    }
  | {
      name: string;
      status: "installed";
      localVersion: string;
      remoteVersion: string;
      description: string;
      hasScripts: boolean;
      hasDeps: boolean;
      license?: string;
      metadata?: Record<string, string>;
    }
  | {
      name: string;
      status: "local-only";
      localVersion?: string;
      description: string;
      hasScripts: boolean;
      hasDeps: boolean;
      license?: string;
      metadata?: Record<string, string>;
    };
