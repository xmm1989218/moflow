import type { AIConfig } from "./aiConfig";
import type { ChatUsage } from "./modelInfo";
import { getProviderInfo } from "./modelInfo";
import { estimateTokens } from "./contextBuilder";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatResult {
  usage: ChatUsage;
}

export interface LLMClient {
  chat(
    messages: ChatMessage[],
    onChunk: (text: string) => void,
    signal: AbortSignal,
    timeout?: number
  ): Promise<ChatResult>;
}

class MockClient implements LLMClient {
  async chat(
    messages: ChatMessage[],
    onChunk: (text: string) => void,
    signal: AbortSignal
  ): Promise<ChatResult> {
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
    timeout = 30000
  ): Promise<ChatResult> {
    const url = this.endpoint.replace(/\/+$/, "") + "/chat/completions";

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    const onAbort = () => controller.abort();
    signal.addEventListener("abort", onAbort);

    let usage: ChatUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.token}`,
        },
        body: JSON.stringify({
          model: this.model,
          messages: messages.map((m) => ({ role: m.role, content: m.content })),
          stream: true,
          stream_options: { include_usage: true },
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
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
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) onChunk(content);
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
    } finally {
      clearTimeout(timeoutId);
      signal.removeEventListener("abort", onAbort);
    }

    if (usage.totalTokens === 0) {
      const promptTokens = estimateTokens(messages.map((m) => m.content).join(""));
      const fullResponse = "";
      usage = {
        promptTokens,
        completionTokens: estimateTokens(fullResponse),
        totalTokens: promptTokens + estimateTokens(fullResponse),
      };
    }

    return { usage };
  }
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
    timeout = 30000
  ): Promise<ChatResult> {
    const url = this.endpoint.replace(/\/+$/, "") + "/messages";

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    const onAbort = () => controller.abort();
    signal.addEventListener("abort", onAbort);

    const filtered = messages.filter((m) => m.role !== "system");
    const systemMsg = messages.find((m) => m.role === "system");

    let inputTokens = 0;
    let outputTokens = 0;

    try {
      const body: Record<string, unknown> = {
        model: this.model,
        max_tokens: 4096,
        messages: filtered.map((m) => ({ role: m.role, content: m.content })),
        stream: true,
      };
      if (systemMsg) {
        body.system = systemMsg.content;
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
            if (parsed.type === "content_block_delta" && parsed.delta?.text) {
              onChunk(parsed.delta.text);
            }
            if (parsed.type === "message_start" && parsed.message?.usage) {
              inputTokens = parsed.message.usage.input_tokens ?? 0;
            }
            if (parsed.type === "message_delta" && parsed.usage) {
              outputTokens = parsed.usage.output_tokens ?? 0;
            }
          } catch {
            // skip
          }
        }
      }
    } finally {
      clearTimeout(timeoutId);
      signal.removeEventListener("abort", onAbort);
    }

    if (inputTokens === 0 && outputTokens === 0) {
      const promptTokens = estimateTokens(messages.map((m) => m.content).join(""));
      return {
        usage: { promptTokens, completionTokens: 0, totalTokens: promptTokens },
      };
    }

    return {
      usage: {
        promptTokens: inputTokens,
        completionTokens: outputTokens,
        totalTokens: inputTokens + outputTokens,
      },
    };
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

const isZh = navigator.language.startsWith("zh");
const t = (zh: string, en: string) => (isZh ? zh : en);

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
