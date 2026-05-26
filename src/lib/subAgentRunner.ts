import type { LLMClient, ChatMessage, ChatResult } from "./llmClient";
import type { ToolDefinition, SubAgentResult, SubAgentType, ToolCallSummary } from "./types";
import type { TracerHandle } from "./tracer";
import type { ToolContext, OnPermissionCallback } from "./tools";
import { executeTool, makeOutlineTool, makeReadTool, makeReadSectionTool, makeGrepTool, makeFindTool, makeGlobTool, makeLsTool, makeWebfetchTool, makeWriteTool, makeEditTool } from "./tools";
import type { PermissionRule } from "./permission";
import { estimateTokens } from "./contextBuilder";
import { calculateCost } from "./modelInfo";
import DEFAULT_PROMPT from "./prompt/default.txt?raw";
import type { Message } from "../stores/chatStore";

const EXPLORE_MAX_ROUNDS = 10;
const GENERAL_MAX_ROUNDS = 15;

const PLAN_DENY_RULES: PermissionRule[] = [
  { permissionKey: "edit", pattern: "**", action: "deny" },
  { permissionKey: "runSkillScript", pattern: "**", action: "deny" },
];

const SUBAGENT_PROMPT = `You are a sub-agent executing a specific task autonomously.
- Focus ONLY on the task described below.
- Use available tools to gather information and complete the task.
- When you have the answer, respond with a clear, complete summary.
- Do NOT ask the user questions — make reasonable assumptions based on available context.
- Be thorough but concise in your final response.`;

function getSubAgentTools(type: SubAgentType, aiMode?: "plan" | "build"): ToolDefinition[] {
  if (type === "explore") {
    return [
      makeOutlineTool(),
      makeReadTool(),
      makeReadSectionTool(),
      makeGrepTool(),
      makeFindTool(),
      makeGlobTool(),
      makeLsTool(),
      makeWebfetchTool(),
    ];
  }

  const tools: ToolDefinition[] = [
    makeOutlineTool(),
    makeReadTool(),
    makeReadSectionTool(),
    makeGrepTool(),
    makeFindTool(),
    makeGlobTool(),
    makeLsTool(),
    makeWebfetchTool(),
  ];
  if (aiMode !== "plan") {
    tools.push(makeWriteTool(), makeEditTool());
  }
  return tools;
}

function buildSubAgentSystemPrompt(
  docContent: string,
  maxContext: number,
  workspaceRoot?: string | null,
  _activeFilePath?: string | null,
  aiMode?: "plan" | "build",
): string {
  const modeSection = aiMode === "plan"
    ? "\n<mode>plan</mode>\nCRITICAL: Plan mode ACTIVE — you MUST NOT write, edit, or modify any files. You may ONLY read, search, and analyze.\n"
    : "";

  const hasWorkspace = !!workspaceRoot;
  const docRatio = 0.50;
  const reserved = Math.floor(maxContext * (1 - docRatio));
  const availableDocTokens = maxContext - reserved;

  if (hasWorkspace) {
    if (!docContent || docContent.trim().length === 0) {
      return [
        DEFAULT_PROMPT,
        "",
        SUBAGENT_PROMPT,
        "",
        "The user has a workspace open but no file is currently active.",
        modeSection,
      ].join("\n");
    }

    const docTokens = estimateTokens(docContent);
    if (docTokens <= availableDocTokens) {
      return [
        DEFAULT_PROMPT,
        "",
        SUBAGENT_PROMPT,
        "",
        "The user has a workspace open.",
        "<document_content>",
        docContent,
        "</document_content>",
        modeSection,
      ].join("\n");
    }

    const zhCount = Array.from(docContent).filter((ch) => /[\u4e00-\u9fff\u3400-\u4dbf]/.test(ch)).length;
    const zhRatio = docContent.length > 0 ? zhCount / docContent.length : 0;
    const charPerToken = zhRatio > 0.3 ? 2 : 4;
    const maxChars = availableDocTokens * charPerToken;
    const truncated = docContent.slice(0, maxChars);

    return [
      DEFAULT_PROMPT,
      "",
      SUBAGENT_PROMPT,
      "",
      "The user has a workspace open (long content, only the beginning is shown).",
      "<document_content truncated=\"true\">",
      truncated,
      "</document_content>",
      modeSection,
    ].join("\n");
  }

  if (!docContent || docContent.trim().length === 0) {
    return [
      DEFAULT_PROMPT,
      "",
      SUBAGENT_PROMPT,
      modeSection,
    ].join("\n");
  }

  const docTokens = estimateTokens(docContent);
  if (docTokens <= availableDocTokens) {
    return [
      DEFAULT_PROMPT,
      "",
      SUBAGENT_PROMPT,
      "",
      "<document_content>",
      docContent,
      "</document_content>",
      modeSection,
    ].join("\n");
  }

  const zhCount = Array.from(docContent).filter((ch) => /[\u4e00-\u9fff\u3400-\u4dbf]/.test(ch)).length;
  const zhRatio = docContent.length > 0 ? zhCount / docContent.length : 0;
  const charPerToken = zhRatio > 0.3 ? 2 : 4;
  const maxChars = availableDocTokens * charPerToken;
  const truncated = docContent.slice(0, maxChars);

  return [
    DEFAULT_PROMPT,
    "",
    SUBAGENT_PROMPT,
    "",
    "<document_content truncated=\"true\">",
    truncated,
    "</document_content>",
    modeSection,
  ].join("\n");
}

export interface RunSubAgentOptions {
  prompt: string;
  description: string;
  subagentType: SubAgentType;
  ctx: ToolContext;
  client: LLMClient;
  signal: AbortSignal;
  tracer: TracerHandle;
  maxContext: number;
  aiMode?: "plan" | "build";
  providerId?: string;
  model?: string;
  onPermission?: OnPermissionCallback;
  onToolCallStatus?: (status: { name: string; args: Record<string, unknown> } | null) => void;
  onStreamingChunk?: (chunk: string) => void;
}

export async function runSubAgent(options: RunSubAgentOptions): Promise<SubAgentResult> {
  const {
    prompt,
    description,
    subagentType,
    ctx,
    client,
    signal,
    tracer,
    maxContext,
    aiMode,
    providerId,
    model,
    onPermission,
    onToolCallStatus,
    onStreamingChunk,
  } = options;

  const maxRounds = subagentType === "explore" ? EXPLORE_MAX_ROUNDS : GENERAL_MAX_ROUNDS;
  const tools = getSubAgentTools(subagentType, aiMode);
  const systemPrompt = buildSubAgentSystemPrompt(ctx.docContent, maxContext, ctx.workspaceRoot, ctx.activeFilePath, aiMode);

  let effectiveSessionRules = ctx.sessionRules ?? [];
  if (aiMode === "plan") {
    effectiveSessionRules = [...PLAN_DENY_RULES, ...effectiveSessionRules];
  }

  const subCtx: ToolContext = {
    ...ctx,
    sessionRules: effectiveSessionRules,
  };

  const messages: Message[] = [];
  let round = 0;
  let totalPromptTokens = 0;
  let totalCompletionTokens = 0;
  let totalCost = 0;
  let totalCachedTokens = 0;
  let totalCacheSavings = 0;
  const toolCallSummaries: ToolCallSummary[] = [];

  const spanId = tracer.startSpan("subagent", `task.${description.slice(0, 40)}`, {});

  const initialUserMsg: Message = {
    id: crypto.randomUUID(),
    role: "user",
    content: prompt,
    timestamp: Date.now(),
  };
  messages.push(initialUserMsg);

  try {
    while (round <= maxRounds) {
      if (signal.aborted) break;
      round++;

      const historyMsgs: ChatMessage[] = messages.map((m) => {
        const msg: ChatMessage = { role: m.role as ChatMessage["role"], content: m.content };
        if (m.role === "assistant" && m.toolCalls?.length) {
          msg.tool_calls = m.toolCalls;
        }
        if (m.role === "assistant" && m.reasoningContent) {
          msg.reasoningContent = m.reasoningContent;
        }
        if (m.role === "tool") {
          msg.tool_call_id = m.toolCallId;
          msg.name = m.toolName;
        }
        return msg;
      });

      const chatMessages: ChatMessage[] = [
        { role: "system", content: systemPrompt },
        ...historyMsgs,
      ];

      let streamingContent = "";

      const llmSpanId = tracer.startSpan("llm", `subagent.llm.round.${round}`, { roundIndex: round });

      const result: ChatResult = await client.chat(
        chatMessages,
        (chunk) => {
          streamingContent += chunk;
          onStreamingChunk?.(chunk);
        },
        signal,
        { tools },
      );

      tracer.endSpan(llmSpanId, {
        roundIndex: round,
        promptTokens: result.usage.promptTokens,
        completionTokens: result.usage.completionTokens,
        finishReason: result.finishReason,
        ttfbMs: result.ttfbMs,
        chunkCount: result.chunkCount,
        toolCallCount: result.toolCalls?.length ?? 0,
        status: "ok",
      });

      const { promptTokens, completionTokens, cachedTokens } = result.usage;
      totalPromptTokens += promptTokens;
      totalCompletionTokens += completionTokens;
      totalCachedTokens += (cachedTokens ?? 0);
      if (providerId && model) {
        const { cost: roundCost, cacheSavings: roundSavings } = calculateCost(promptTokens, completionTokens, providerId, model, cachedTokens, result.usage.cacheCreationTokens);
        totalCost += roundCost;
        totalCacheSavings += roundSavings;
      }

      if (result.finishReason !== "tool_calls" || !result.toolCalls?.length) {
        const assistantMsg: Message = {
          id: crypto.randomUUID(),
          role: "assistant",
          content: streamingContent,
          timestamp: Date.now(),
          promptTokens,
          reasoningContent: result.reasoningContent || undefined,
        };
        messages.push(assistantMsg);

        tracer.endSpan(spanId, {
          status: "ok",
          roundIndex: round,
        });

        return {
          content: streamingContent,
          messages,
          toolCalls: toolCallSummaries,
          totalRounds: round,
          promptTokens: totalPromptTokens,
          completionTokens: totalCompletionTokens,
          totalTokens: totalPromptTokens + totalCompletionTokens,
          cost: totalCost,
          cachedTokens: totalCachedTokens,
          cacheSavings: totalCacheSavings,
        };
      }

      if (signal.aborted) break;

      const assistantMsg: Message = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: streamingContent,
        timestamp: Date.now(),
        toolCalls: result.toolCalls,
        promptTokens,
        reasoningContent: result.reasoningContent || undefined,
      };
      messages.push(assistantMsg);

      for (const tc of result.toolCalls) {
        if (signal.aborted) break;

        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(tc.arguments || "{}");
        } catch {
          args = {};
        }

        const argsBrief = Object.entries(args)
          .map(([k, v]) => `${k}=${String(v).slice(0, 30)}`)
          .join(", ")
          .slice(0, 80);
        toolCallSummaries.push({ name: tc.name, argsBrief, round });

        onToolCallStatus?.({ name: tc.name, args });

        const toolSpanId = tracer.startSpan("tool", `subagent.tool.${tc.name}`, {
          roundIndex: round,
          toolName: tc.name,
        });

        let toolResult: string;
        try {
          toolResult = await executeTool(tc.name, args, signal, subCtx, onPermission);
        } catch (e) {
          toolResult = `Tool execution error: ${e instanceof Error ? e.message : String(e)}`;
        }

        const resultSize = new TextEncoder().encode(toolResult).length;
        tracer.endSpan(toolSpanId, {
          roundIndex: round,
          toolName: tc.name,
          resultSize,
          wasTruncated: resultSize >= 30 * 1024,
          status: toolResult.startsWith("|?") ? "error" : "ok",
        });

        if (signal.aborted) break;

        const toolMsg: Message = {
          id: crypto.randomUUID(),
          role: "tool",
          content: toolResult,
          timestamp: Date.now(),
          toolCallId: tc.id,
          toolName: tc.name,
        };
        messages.push(toolMsg);
      }

      if (signal.aborted) break;

      onToolCallStatus?.(null);

      if (round >= maxRounds) {
        break;
      }
    }
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") {
      // cancelled
    } else {
      console.error("[SubAgent] Error:", e);
    }
  }

  tracer.endSpan(spanId, {
    status: signal.aborted ? "cancelled" : "ok",
    roundIndex: round,
  });

  const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
  const finalContent = lastAssistant?.content ?? "";

  return {
    content: finalContent,
    messages,
    toolCalls: toolCallSummaries,
    totalRounds: round,
    promptTokens: totalPromptTokens,
    completionTokens: totalCompletionTokens,
    totalTokens: totalPromptTokens + totalCompletionTokens,
    cost: totalCost,
    cachedTokens: totalCachedTokens,
    cacheSavings: totalCacheSavings,
  };
}
