import { useEffect, useRef, useState } from "react";
import { useChatStore } from "../../stores/chatStore";
import { useAppStore } from "../../stores/appStore";
import "./AISidebar.css";

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

export default function AISidebar() {
  const messages = useChatStore((s) => s.messages);
  const isStreaming = useChatStore((s) => s.isStreaming);
  const addMessage = useChatStore((s) => s.addMessage);
  const appendToLastMessage = useChatStore((s) => s.appendToLastMessage);
  const setStreaming = useChatStore((s) => s.setStreaming);
  const docContent = useAppStore((s) => {
    const tab = s.files.find((f) => f.id === s.activeFileId);
    return tab?.content ?? "";
  });
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [input, setInput] = useState("");

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || isStreaming) return;

    setInput("");
    addMessage({ role: "user", content: text });

    const response = generateMockResponse(text, docContent);

    setStreaming(true);
    addMessage({ role: "assistant", content: "" });

    for (let i = 0; i < response.length; i++) {
      await new Promise((r) => setTimeout(r, 30));
      appendToLastMessage(response[i]);
    }
    setStreaming(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="moflow-ai-sidebar">
      <div className="moflow-ai-header">
        <span className="moflow-ai-header-title">{t("AI 助手", "AI Assistant")}</span>
      </div>

      <div className="moflow-ai-messages">
        {messages.length === 0 && (
          <div className="moflow-ai-empty">
            <div className="moflow-ai-empty-icon">✨</div>
            <p>{t("有什么关于当前文档的问题？", "Questions about the current document?")}</p>
          </div>
        )}
        {messages.map((msg) => (
          <div key={msg.id} className={`moflow-ai-message moflow-ai-message-${msg.role}`}>
            <div className="moflow-ai-message-content">
              {msg.content}
              {msg.role === "assistant" && isStreaming && msg === messages[messages.length - 1] && (
                <span className="moflow-ai-cursor">▌</span>
              )}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      <div className="moflow-ai-input-area">
        <textarea
          className="moflow-ai-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={t("输入消息...", "Type a message...")}
          rows={1}
          disabled={isStreaming}
        />
        <button
          className="moflow-ai-send-btn"
          onClick={handleSend}
          disabled={!input.trim() || isStreaming}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="22" y1="2" x2="11" y2="13" />
            <polygon points="22 2 15 22 11 13 2 9 22 2" />
          </svg>
        </button>
      </div>
    </div>
  );
}
