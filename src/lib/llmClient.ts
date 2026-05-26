import type { AIConfig } from "./settings";
import { getProviderInfo, getModelInfo } from "./modelInfo";
import { estimateTokens } from "./contextBuilder";
import type { ToolCall, ToolDefinition } from "./types";
import { t, isZh } from "../i18n/core";

export class TimeoutError extends Error {
  constructor(timeout: number) {
    super(`Request timed out after ${timeout}ms`);
    this.name = "TimeoutError";
  }
}

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  name?: string;
  reasoningContent?: string;
}

export interface ChatUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  cachedTokens?: number;
  cacheCreationTokens?: number;
}

export interface ChatResult {
  usage: ChatUsage;
  toolCalls?: ToolCall[];
  finishReason?: string;
  reasoningContent?: string;
  ttfbMs?: number;
  chunkCount?: number;
}

export interface ChatOptions {
  timeout?: number;
  tools?: ToolDefinition[];
}

export interface LLMClient {
  chat(
    messages: ChatMessage[],
    onChunk: (text: string) => void,
    signal: AbortSignal,
    options?: ChatOptions
  ): Promise<ChatResult>;
}

function serializeMessagesForEstimation(messages: ChatMessage[]): string {
  return messages.map((m) => {
    let text = m.content ?? "";
    if (m.tool_calls?.length) text += m.tool_calls.map((tc) => tc.name + tc.arguments).join("");
    if (m.reasoningContent) text += m.reasoningContent;
    return text;
  }).join("");
}

class MockClient implements LLMClient {
  async chat(
    messages: ChatMessage[],
    onChunk: (text: string) => void,
    signal: AbortSignal,
    options?: ChatOptions
  ): Promise<ChatResult> {
    void options;
    const lastUser = messages.filter((m) => m.role === "user").pop();
    const userText = lastUser?.content ?? "";
    const docContent = messages.find((m) => m.role === "system")?.content ?? "";

    const response = generateMockResponse(userText, docContent);

    for (let i = 0; i < response.length; i++) {
      if (signal.aborted) break;
      await new Promise((r) => setTimeout(r, 30));
      onChunk(response[i]);
    }

    const promptTokens = estimateTokens(serializeMessagesForEstimation(messages));
    const completionTokens = estimateTokens(response);
    return {
      usage: {
        promptTokens,
        completionTokens,
        totalTokens: promptTokens + completionTokens,
      },
    };
  }
}

function convertToOpenAIMessages(messages: ChatMessage[]): Record<string, unknown>[] {
  return messages.map((m) => {
    if (m.role === "tool") {
      return { role: "tool", tool_call_id: m.tool_call_id, content: m.content };
    }
    if (m.role === "assistant") {
      const msg: Record<string, unknown> = {
        role: "assistant",
        content: m.tool_calls?.length ? (m.content || null) : (m.content || ""),
      };
      if (m.reasoningContent) {
        msg.reasoning_content = m.reasoningContent;
      }
      if (m.tool_calls?.length) {
        msg.tool_calls = m.tool_calls.map((tc) => ({
          id: tc.id,
          type: "function",
          function: { name: tc.name, arguments: tc.arguments },
        }));
      }
      return msg;
    }
    return { role: m.role, content: m.content };
  });
}

class OpenAICompatibleClient implements LLMClient {
  private endpoint: string;
  private token: string;
  private model: string;

  constructor(endpoint: string, token: string, model: string) {
    this.endpoint = endpoint;
    this.token = token;
    this.model = model;
  }

  async chat(
    messages: ChatMessage[],
    onChunk: (text: string) => void,
    signal: AbortSignal,
    options?: ChatOptions
  ): Promise<ChatResult> {
    const timeout = options?.timeout ?? 60000;
    const url = this.endpoint.replace(/\/+$/, "") + "/chat/completions";

    const controller = new AbortController();
    let timedOut = false;
    const timeoutId = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeout);

    const onAbort = () => controller.abort();
    signal.addEventListener("abort", onAbort);

    let usage: ChatUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
    let fullResponse = "";
    let reasoningContent = "";
    const toolCallsMap = new Map<number, ToolCall>();
    let finishReason: string | undefined;
    let chunkCount = 0;
    let firstChunkTime: number | undefined;
    const requestStartTime = performance.now();

    try {
      const body: Record<string, unknown> = {
        model: this.model,
        messages: convertToOpenAIMessages(messages),
        stream: true,
        stream_options: { include_usage: true },
      };
      if (options?.tools?.length) {
        body.tools = options.tools.map((t) => {
          const params = t.function.parameters as Record<string, unknown> | undefined;
          const props = params?.properties as Record<string, unknown> | undefined;
          if (props && Object.keys(props).length === 0) {
            return { type: t.type, function: { name: t.function.name, description: t.function.description } };
          }
          return t;
        });
      }

      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.token}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        console.error("[LLMClient] OpenAI API error", res.status, text.slice(0, 500));
        throw new Error(`API error ${res.status}: ${text.slice(0, 200)}`);
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No response body");

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith("data: ")) continue;
          const data = trimmed.slice(6);
          if (data === "[DONE]") continue;

          try {
            const parsed = JSON.parse(data);
            const delta = parsed.choices?.[0]?.delta;
            if (delta?.content) {
              if (firstChunkTime === undefined) firstChunkTime = performance.now();
              chunkCount++;
              onChunk(delta.content);
              fullResponse += delta.content;
            }
            if (delta?.reasoning_content) {
              if (firstChunkTime === undefined) firstChunkTime = performance.now();
              reasoningContent += delta.reasoning_content;
            }
            if (delta?.tool_calls) {
              for (const tc of delta.tool_calls) {
                const idx = tc.index ?? 0;
                if (!toolCallsMap.has(idx)) {
                  toolCallsMap.set(idx, {
                    id: tc.id ?? "",
                    name: tc.function?.name ?? "",
                    arguments: tc.function?.arguments ?? "",
                  });
                } else {
                  const existing = toolCallsMap.get(idx)!;
                  if (tc.id) existing.id = tc.id;
                  if (tc.function?.name) existing.name = tc.function.name;
                  if (tc.function?.arguments) existing.arguments += tc.function.arguments;
                }
              }
            }
            const fr = parsed.choices?.[0]?.finish_reason;
            if (fr) finishReason = fr;
            if (parsed.usage) {
              usage = {
                promptTokens: parsed.usage.prompt_tokens ?? 0,
                completionTokens: parsed.usage.completion_tokens ?? 0,
                totalTokens: parsed.usage.total_tokens ?? 0,
                cachedTokens: parsed.usage.prompt_tokens_details?.cached_tokens ?? undefined,
              };
            }
          } catch {
            // skip malformed JSON
          }
        }
      }
    } catch (e) {
      if (timedOut && e instanceof DOMException && e.name === "AbortError") {
        throw new TimeoutError(timeout);
      }
      throw e;
    } finally {
      clearTimeout(timeoutId);
      signal.removeEventListener("abort", onAbort);
    }

    if (usage.totalTokens === 0) {
      const promptTokens = estimateTokens(serializeMessagesForEstimation(messages));
      usage = {
        promptTokens,
        completionTokens: estimateTokens(fullResponse),
        totalTokens: promptTokens + estimateTokens(fullResponse),
      };
    }

    const result: ChatResult = { usage };
    if (finishReason) result.finishReason = finishReason;
    if (toolCallsMap.size > 0) {
      result.toolCalls = Array.from(toolCallsMap.values());
    }
    if (reasoningContent) {
      result.reasoningContent = reasoningContent;
    }
    if (firstChunkTime !== undefined) {
      result.ttfbMs = Math.round(firstChunkTime - requestStartTime);
    }
    result.chunkCount = chunkCount;
    return result;
  }
}

interface ClaudeContentBlock {
  type: string;
  text?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
  tool_use_id?: string;
  content?: string;
}

function convertToClaudeMessages(messages: ChatMessage[]): { role: string; content: string | ClaudeContentBlock[] }[] {
  const result: { role: string; content: string | ClaudeContentBlock[] }[] = [];
  let pendingToolResults: ClaudeContentBlock[] = [];

  const flushToolResults = () => {
    if (pendingToolResults.length > 0) {
      result.push({ role: "user", content: pendingToolResults });
      pendingToolResults = [];
    }
  };

  for (const m of messages) {
    if (m.role === "tool") {
      pendingToolResults.push({
        type: "tool_result",
        tool_use_id: m.tool_call_id,
        content: m.content,
      });
    } else {
      flushToolResults();

      if (m.role === "assistant" && m.tool_calls?.length) {
        const blocks: ClaudeContentBlock[] = [];
        if (m.content) {
          blocks.push({ type: "text", text: m.content });
        }
        for (const tc of m.tool_calls) {
          let input: Record<string, unknown> = {};
          try {
            input = JSON.parse(tc.arguments || "{}");
          } catch {
            // keep empty input
          }
          blocks.push({ type: "tool_use", id: tc.id, name: tc.name, input });
        }
        result.push({ role: "assistant", content: blocks });
      } else {
        result.push({ role: m.role, content: m.content });
      }
    }
  }

  flushToolResults();
  return result;
}

class ClaudeCompatibleClient implements LLMClient {
  private endpoint: string;
  private token: string;
  private model: string;
  private providerId: string;

  constructor(endpoint: string, token: string, model: string, providerId: string) {
    this.endpoint = endpoint;
    this.token = token;
    this.model = model;
    this.providerId = providerId;
  }

  async chat(
    messages: ChatMessage[],
    onChunk: (text: string) => void,
    signal: AbortSignal,
    options?: ChatOptions
  ): Promise<ChatResult> {
    const timeout = options?.timeout ?? 60000;
    const url = this.endpoint.replace(/\/+$/, "") + "/messages";

    const controller = new AbortController();
    let timedOut = false;
    const timeoutId = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeout);

    const onAbort = () => controller.abort();
    signal.addEventListener("abort", onAbort);

    const systemMsg = messages.find((m) => m.role === "system");
    const claudeMessages = convertToClaudeMessages(
      messages.filter((m) => m.role !== "system")
    );

    let inputTokens = 0;
    let outputTokens = 0;
    let cacheReadTokens = 0;
    let cacheCreationTokensVal = 0;
    let fullResponse = "";

    const toolUseBlocks: Map<number, { id: string; name: string; arguments: string }> = new Map();
    let stopReason: string | undefined;
    let firstChunkTime: number | undefined;
    let chunkCount = 0;
    const requestStartTime = performance.now();

    try {
      const modelInfo = getModelInfo(this.providerId, this.model);
      const inputEstimate = estimateTokens(serializeMessagesForEstimation(messages));
      const maxTokens = modelInfo.maxContext > 0
        ? Math.min(Math.max(modelInfo.maxContext - inputEstimate, 1024), 8192)
        : 4096;

      const body: Record<string, unknown> = {
        model: this.model,
        max_tokens: maxTokens,
        messages: claudeMessages,
        stream: true,
      };
      if (systemMsg) {
        body.system = [
          { type: "text", text: systemMsg.content, cache_control: { type: "ephemeral" } },
        ];
      }
      if (options?.tools?.length) {
        body.tools = options.tools.map((t) => {
          const props = (t.function.parameters as Record<string, unknown> | undefined)?.properties as Record<string, unknown> | undefined;
          const inputSchema = (props && Object.keys(props).length === 0)
            ? { type: "object" as const }
            : t.function.parameters;
          return {
            name: t.function.name,
            description: t.function.description,
            input_schema: inputSchema,
          };
        });
      }

      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": this.token,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        console.error("[LLMClient] Claude API error", res.status, text.slice(0, 500));
        throw new Error(`API error ${res.status}: ${text.slice(0, 200)}`);
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No response body");

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data: ")) continue;
          const data = trimmed.slice(6);

          try {
            const parsed = JSON.parse(data);
            if (parsed.type === "content_block_delta" && parsed.delta?.type === "text_delta" && parsed.delta.text) {
              if (firstChunkTime === undefined) firstChunkTime = performance.now();
              chunkCount++;
              onChunk(parsed.delta.text);
              fullResponse += parsed.delta.text;
            }
            if (parsed.type === "content_block_start") {
              const block = parsed.content_block;
              if (block?.type === "tool_use") {
                toolUseBlocks.set(block.index ?? parsed.index ?? 0, {
                  id: block.id ?? "",
                  name: block.name ?? "",
                  arguments: "",
                });
              }
            }
            if (parsed.type === "content_block_delta" && parsed.delta?.type === "input_json_delta") {
              const idx = parsed.index ?? 0;
              const existing = toolUseBlocks.get(idx);
              if (existing && parsed.delta.partial_json) {
                existing.arguments += parsed.delta.partial_json;
              }
            }
            if (parsed.type === "message_start" && parsed.message?.usage) {
              inputTokens = parsed.message.usage.input_tokens ?? 0;
              cacheReadTokens = parsed.message.usage.cache_read_input_tokens ?? 0;
              cacheCreationTokensVal = parsed.message.usage.cache_creation_input_tokens ?? 0;
            }
            if (parsed.type === "message_delta") {
              if (parsed.usage) {
                outputTokens = parsed.usage.output_tokens ?? 0;
              }
              if (parsed.delta?.stop_reason) {
                stopReason = parsed.delta.stop_reason;
              }
            }
          } catch {
            // skip
          }
        }
      }
    } catch (e) {
      if (timedOut && e instanceof DOMException && e.name === "AbortError") {
        throw new TimeoutError(timeout);
      }
      throw e;
    } finally {
      clearTimeout(timeoutId);
      signal.removeEventListener("abort", onAbort);
    }

    if (inputTokens === 0 && outputTokens === 0) {
      const promptTokens = estimateTokens(serializeMessagesForEstimation(messages));
      const completionTokens = estimateTokens(fullResponse);
      const usage: ChatUsage = { promptTokens, completionTokens, totalTokens: promptTokens + completionTokens };
      const result: ChatResult = { usage };
      if (stopReason) result.finishReason = stopReason === "tool_use" ? "tool_calls" : stopReason;
      if (toolUseBlocks.size > 0) {
        result.toolCalls = Array.from(toolUseBlocks.values());
      }
      if (firstChunkTime !== undefined) {
        result.ttfbMs = Math.round(firstChunkTime - requestStartTime);
      }
      result.chunkCount = chunkCount;
      return result;
    }

    const usage: ChatUsage = {
      promptTokens: inputTokens,
      completionTokens: outputTokens,
      totalTokens: inputTokens + outputTokens,
      cachedTokens: cacheReadTokens || undefined,
      cacheCreationTokens: cacheCreationTokensVal || undefined,
    };
    const result: ChatResult = { usage };
    if (stopReason) result.finishReason = stopReason === "tool_use" ? "tool_calls" : stopReason;
    if (toolUseBlocks.size > 0) {
      result.toolCalls = Array.from(toolUseBlocks.values());
    }
    if (firstChunkTime !== undefined) {
      result.ttfbMs = Math.round(firstChunkTime - requestStartTime);
    }
    result.chunkCount = chunkCount;
    return result;
  }
}

export function getLLMClient(config: AIConfig): LLMClient {
  if (config.mode === "mock") {
    return new MockClient();
  }

  const providerInfo = getProviderInfo(config.providerId);
  const compatibility = providerInfo?.compatibility ?? config.provider;

  if (compatibility === "claude") {
    return new ClaudeCompatibleClient(config.apiEndpoint, config.apiToken, config.model, config.providerId);
  }
  return new OpenAICompatibleClient(config.apiEndpoint, config.apiToken, config.model);
}

function generateMockResponse(userMessage: string, docContent: string): string {
  const lines = docContent.split("\n").filter((l) => l.trim());
  const headings = lines.filter((l) => l.startsWith("#"));
  const charCount = docContent.length;
  const wordCount = docContent.split(/\s+/).filter(Boolean).length;

  const lower = userMessage.toLowerCase();

  if (lower.includes("总结") || lower.includes("summarize") || lower.includes("summary")) {
    if (headings.length > 0) {
      return t("ai.mock.summaryWithHeadings", {
        n: headings.length,
        c: charCount,
        headings: headings.map((h) => `- ${h}`).join("\n"),
      });
    }
    return t("ai.mock.summaryNoHeadings", { c: charCount, w: wordCount });
  }

  if (lower.includes("改进") || lower.includes("improve") || lower.includes("建议") || lower.includes("suggest") || lower.includes("suggestion")) {
    return t("ai.mock.suggestions");
  }

  if (lower.includes("标题") || lower.includes("title") || lower.includes("heading") || lower.includes("headings")) {
    if (headings.length > 0) {
      return t("ai.mock.headingsList", {
        headings: headings.map((h, i) => `${i + 1}. ${h}`).join("\n"),
      });
    }
    return t("ai.mock.noHeadings");
  }

  if (lower.includes("解释") || lower.includes("explain")) {
    return t("ai.mock.explain", { c: charCount });
  }

  if (lower.includes("翻译") || lower.includes("translate")) {
    return t("ai.mock.translate");
  }

  if (charCount === 0) {
    return t("ai.mock.emptyDoc");
  }

  const templates = [
    t("ai.mock.template1", { c: charCount }),
    t("ai.mock.template2", {
      c: charCount,
      hasHeadings: headings.length > 0
        ? (isZh() ? `包含 ${headings.length} 个标题，结构看起来不错。` : `It has ${headings.length} heading(s) and looks well-structured.`)
        : (isZh() ? "还没有添加标题，建议用标题来组织内容。" : "No headings yet — consider using headings to organize content."),
    }),
  ];

  return templates[Math.floor(Math.random() * templates.length)];
}
