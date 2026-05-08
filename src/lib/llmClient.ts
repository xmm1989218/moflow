import type { AIConfig } from "./settings";
import { getProviderInfo } from "./modelInfo";
import { estimateTokens } from "./contextBuilder";
import type { ToolCall, ToolDefinition } from "./types";

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
}

export interface ChatResult {
  usage: ChatUsage;
  toolCalls?: ToolCall[];
  finishReason?: string;
  reasoningContent?: string;
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

    const promptTokens = estimateTokens(messages.map((m) => m.content).join(""));
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
              onChunk(delta.content);
              fullResponse += delta.content;
            }
            if (delta?.reasoning_content) {
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
      const promptTokens = estimateTokens(messages.map((m) => m.content).join(""));
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
    let fullResponse = "";

    const toolUseBlocks: Map<number, { id: string; name: string; arguments: string }> = new Map();
    let stopReason: string | undefined;

    try {
      const body: Record<string, unknown> = {
        model: this.model,
        max_tokens: 4096,
        messages: claudeMessages,
        stream: true,
      };
      if (systemMsg) {
        body.system = systemMsg.content;
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
      const promptTokens = estimateTokens(messages.map((m) => m.content).join(""));
      const completionTokens = estimateTokens(fullResponse);
      const usage: ChatUsage = { promptTokens, completionTokens, totalTokens: promptTokens + completionTokens };
      const result: ChatResult = { usage };
      if (stopReason) result.finishReason = stopReason === "tool_use" ? "tool_calls" : stopReason;
      if (toolUseBlocks.size > 0) {
        result.toolCalls = Array.from(toolUseBlocks.values());
      }
      return result;
    }

    const usage: ChatUsage = {
      promptTokens: inputTokens,
      completionTokens: outputTokens,
      totalTokens: inputTokens + outputTokens,
    };
    const result: ChatResult = { usage };
    if (stopReason) result.finishReason = stopReason === "tool_use" ? "tool_calls" : stopReason;
    if (toolUseBlocks.size > 0) {
      result.toolCalls = Array.from(toolUseBlocks.values());
    }
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
    return new ClaudeCompatibleClient(config.apiEndpoint, config.apiToken, config.model);
  }
  return new OpenAICompatibleClient(config.apiEndpoint, config.apiToken, config.model);
}

import { t } from "./i18n";

function generateMockResponse(userMessage: string, docContent: string): string {
  const lines = docContent.split("\n").filter((l) => l.trim());
  const headings = lines.filter((l) => l.startsWith("#"));
  const charCount = docContent.length;
  const wordCount = docContent.split(/\s+/).filter(Boolean).length;

  const lower = userMessage.toLowerCase();

  if (lower.includes("总结") || lower.includes("summar")) {
    if (headings.length > 0) {
      return t(
        `这篇文档包含 ${headings.length} 个标题，共 ${charCount} 个字符。主要章节包括：\n${headings.map((h) => `- ${h}`).join("\n")}\n\n整体来看，文档结构清晰，内容围绕核心主题展开。`,
        `This document has ${headings.length} heading(s) and ${charCount} characters. Main sections:\n${headings.map((h) => `- ${h}`).join("\n")}\n\nThe document is well-structured and focused on its core topic.`
      );
    }
    return t(
      `文档共 ${charCount} 个字符，约 ${wordCount} 个词。目前内容较为简短，可以进一步扩展。`,
      `The document has ${charCount} characters and approximately ${wordCount} words. It's relatively brief and could be expanded.`
    );
  }

  if (lower.includes("改进") || lower.includes("improv") || lower.includes("建议") || lower.includes("suggest")) {
    return t(
      "以下是一些改进建议：\n\n1. **结构优化** - 考虑添加更多层级的标题来组织内容\n2. **内容充实** - 每个章节可以添加更多细节和示例\n3. **格式规范** - 确保列表、代码块等格式一致\n4. **可读性** - 适当使用粗体、引用等增强可读性",
      "Here are some improvement suggestions:\n\n1. **Structure** - Consider adding more heading levels to organize content\n2. **Content** - Each section could benefit from more details and examples\n3. **Formatting** - Ensure consistent use of lists, code blocks, etc.\n4. **Readability** - Use bold, quotes, etc. to enhance readability"
    );
  }

  if (lower.includes("标题") || lower.includes("title") || lower.includes("heading")) {
    if (headings.length > 0) {
      return t(
        `文档中的标题结构：\n${headings.map((h, i) => `${i + 1}. ${h}`).join("\n")}\n\n标题层次清晰，建议保持一致的命名风格。`,
        `Document headings:\n${headings.map((h, i) => `${i + 1}. ${h}`).join("\n")}\n\nThe heading hierarchy is clear. Consider maintaining a consistent naming style.`
      );
    }
    return t("文档目前没有使用标题。建议添加标题来组织内容结构。", "The document doesn't use headings yet. Consider adding headings to organize the content structure.");
  }

  if (lower.includes("解释") || lower.includes("explai")) {
    return t(
      `这段内容共 ${charCount} 个字符。文档的核心理念通过清晰的逻辑展开，建议结合上下文进一步理解其深层含义。`,
      `This passage has ${charCount} characters. The core concept is developed through clear logic. Consider the broader context for deeper understanding.`
    );
  }

  if (lower.includes("翻译") || lower.includes("translat")) {
    return t(
      `[Mock 翻译结果] 这段内容的翻译将保持原文的语义和风格，确保准确传达原文信息。`,
      `[Mock translation] The translation of this content preserves the original meaning and style, ensuring accurate conveyance of the original information.`
    );
  }

  if (charCount === 0) {
    return t(
      "看起来文档还是空的。你可以先开始写一些内容，然后我来帮你分析和改进！",
      "The document appears to be empty. Start writing some content, and I'll help you analyze and improve it!"
    );
  }

  const templates = [
    t(
      `我看到了你的文档，目前有 ${charCount} 个字符。有什么具体想让我帮忙的吗？比如总结内容、提供改进建议、或者分析文档结构。`,
      `I can see your document with ${charCount} characters. How can I help? I can summarize content, suggest improvements, or analyze the document structure.`
    ),
    t(
      `这是一份 ${charCount} 字符的文档。${headings.length > 0 ? `包含 ${headings.length} 个标题，结构看起来不错。` : "还没有添加标题，建议用标题来组织内容。"} 试试问我关于文档的任何问题！`,
      `This is a ${charCount}-character document. ${headings.length > 0 ? `It has ${headings.length} heading(s) and looks well-structured.` : "No headings yet — consider using headings to organize content."} Try asking me anything about the document!`
    ),
  ];

  return templates[Math.floor(Math.random() * templates.length)];
}
