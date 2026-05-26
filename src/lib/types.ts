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

export interface ToolCallSummary {
  name: string;
  argsBrief: string;
  round: number;
}

export interface SubAgentResult {
  content: string;
  messages: import("../stores/chatStore").Message[];
  toolCalls: ToolCallSummary[];
  totalRounds: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  cost: number;
  cachedTokens: number;
  cacheSavings: number;
}

export type SubAgentType = "explore" | "general";

export type SubAgentStatus = "running" | "completed" | "cancelled" | "error";

export interface SubAgentExecution {
  taskId: string;
  description: string;
  subagentType: SubAgentType;
  messages: import("../stores/chatStore").Message[];
  totalRounds: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  cost: number;
  cachedTokens: number;
  cacheSavings: number;
  status: SubAgentStatus;
  parentChatKey: string;
}

export interface SkillEnvEntry {
  name: string;
  description: string;
  required?: boolean;
  secret?: boolean;
}

export interface SkillMeta {
  name: string;
  description: string;
  version?: string;
  license?: string;
  compatibility?: string;
  allowedTools?: string;
  metadata?: Record<string, string>;
  env?: SkillEnvEntry[];
  path: string;
  enabled: boolean;
  hasScripts: boolean;
}

export interface RemoteSkill {
  name: string;
  description: string;
  version: string;
  category?: string;
  tags?: string[];
  hasScripts: boolean;
  hasDeps: boolean;
  license?: string;
  env?: SkillEnvEntry[];
  metadata?: Record<string, string>;
}

export type SkillInstallStatus =
  | {
      name: string;
      status: "new";
      remoteVersion: string;
      description: string;
      category?: string;
      tags?: string[];
      hasScripts: boolean;
      hasDeps: boolean;
      license?: string;
      env?: SkillEnvEntry[];
      metadata?: Record<string, string>;
    }
  | {
      name: string;
      status: "update";
      localVersion: string;
      remoteVersion: string;
      description: string;
      category?: string;
      tags?: string[];
      hasScripts: boolean;
      hasDeps: boolean;
      license?: string;
      env?: SkillEnvEntry[];
      metadata?: Record<string, string>;
    }
  | {
      name: string;
      status: "installed";
      localVersion: string;
      remoteVersion: string;
      description: string;
      category?: string;
      tags?: string[];
      hasScripts: boolean;
      hasDeps: boolean;
      license?: string;
      env?: SkillEnvEntry[];
      metadata?: Record<string, string>;
    }
  | {
      name: string;
      status: "local-only";
      localVersion?: string;
      description: string;
      category?: string;
      tags?: string[];
      hasScripts: boolean;
      hasDeps: boolean;
      license?: string;
      env?: SkillEnvEntry[];
      metadata?: Record<string, string>;
    };
