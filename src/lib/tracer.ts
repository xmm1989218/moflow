import { appendTraceEvent } from "./chatPersistence";
import { useThemeStore } from "../stores/themeStore";
import type { TraceSpanEvent } from "./traceTypes";

const MAX_ARGS_SUMMARY = 200;

interface ActiveSpan {
  id: string;
  type: "llm" | "tool" | "permission" | "compact" | "subagent";
  name: string;
  startTime: number;
  roundIndex?: number;
  toolName?: string;
}

export interface TracerHandle {
  startSpan(type: ActiveSpan["type"], name: string, init?: Partial<ActiveSpan>): string;
  endSpan(spanId: string, fields: Partial<TraceSpanEvent>): void;
  endTrace(status: "ok" | "error" | "cancelled", summary: { totalTokens: number; totalCost: number }): void;
}

class Tracer implements TracerHandle {
  private traceId: string;
  private chatKey: string;
  private startTime: number;
  private shortId: string;
  private spans: Map<string, ActiveSpan> = new Map();
  private totalRounds = 0;
  private totalToolCalls = 0;
  private finished = false;

  constructor(traceId: string, chatKey: string, userMessage: string, model: string) {
    this.traceId = traceId;
    this.chatKey = chatKey;
    this.startTime = performance.now();
    this.shortId = traceId.slice(0, 4);

    appendTraceEvent(chatKey, {
      type: "trace_start",
      traceId,
      chatKey,
      userMessage: userMessage.slice(0, 100),
      model,
      startTime: Date.now(),
    } as Record<string, unknown>);

    console.debug(`[trace ▶] #${this.shortId} "${userMessage.slice(0, 60)}" (${chatKey.slice(0, 30)})`);
  }

  startSpan(type: ActiveSpan["type"], name: string, init?: Partial<ActiveSpan>): string {
    const spanId = crypto.randomUUID().slice(0, 8);
    const span: ActiveSpan = {
      id: spanId,
      type,
      name,
      startTime: performance.now(),
      ...init,
    };
    this.spans.set(spanId, span);

    if (type === "llm") this.totalRounds++;
    if (type === "tool") this.totalToolCalls++;

    console.debug(`[trace ▶] #${this.shortId} ${name}`);
    return spanId;
  }

  endSpan(spanId: string, fields: Partial<TraceSpanEvent>): void {
    const span = this.spans.get(spanId);
    if (!span) return;
    this.spans.delete(spanId);

    const endTime = performance.now();
    const durationMs = Math.round(endTime - span.startTime);

    const event: TraceSpanEvent = {
      type: "span",
      traceId: this.traceId,
      id: spanId,
      spanType: span.type,
      name: span.name,
      durationMs,
      status: fields.status ?? "ok",
      roundIndex: span.roundIndex ?? fields.roundIndex,
      ...fields,
    };

    appendTraceEvent(this.chatKey, { ...event } as Record<string, unknown>);

    const parts: string[] = [];
    parts.push(`${durationMs}ms`);
    if (fields.promptTokens) parts.push(`prompt=${fields.promptTokens}`);
    if (fields.completionTokens) parts.push(`comp=${fields.completionTokens}`);
    if (fields.finishReason) parts.push(`finish=${fields.finishReason}`);
    if (fields.ttfbMs) parts.push(`ttfb=${fields.ttfbMs}ms`);
    if (fields.chunkCount) parts.push(`chunks=${fields.chunkCount}`);
    if (fields.toolCallCount) parts.push(`tools=${fields.toolCallCount}`);
    if (fields.resultSize) parts.push(`result=${formatSize(fields.resultSize)}`);
    if (fields.permissionDecision) parts.push(`perm=${fields.permissionDecision}${fields.permissionKey ? "(" + fields.permissionKey + ")" : ""}`);
    if (fields.error) parts.push(`error=${fields.error.slice(0, 80)}`);

    console.debug(`[trace ■] #${this.shortId} ${span.name} ${parts.join(" ")}`);
  }

  endTrace(status: "ok" | "error" | "cancelled", summary: { totalTokens: number; totalCost: number }): void {
    if (this.finished) return;
    this.finished = true;

    const durationMs = Math.round(performance.now() - this.startTime);

    appendTraceEvent(this.chatKey, {
      type: "trace_end",
      traceId: this.traceId,
      durationMs,
      totalRounds: this.totalRounds,
      totalToolCalls: this.totalToolCalls,
      totalTokens: summary.totalTokens,
      totalCost: summary.totalCost,
      status,
    } as Record<string, unknown>);

    const costStr = summary.totalCost > 0 ? `cost=$${summary.totalCost.toFixed(4)}` : "";
    console.info(
      `[trace ■] #${this.shortId} ${durationMs}ms rounds=${this.totalRounds} tools=${this.totalToolCalls} tokens=${summary.totalTokens} ${costStr} ${status}`
    );
  }
}

class NoOpTracer implements TracerHandle {
  startSpan(): string { return ""; }
  endSpan(): void {}
  endTrace(): void {}
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

export function truncateArgsSummary(args: Record<string, unknown>): string {
  const str = JSON.stringify(args);
  return str.length > MAX_ARGS_SUMMARY ? str.slice(0, MAX_ARGS_SUMMARY) + "…" : str;
}

export function createTracer(chatKey: string, userMessage: string, model: string): TracerHandle {
  if (!useThemeStore.getState().enableTrace) {
    return new NoOpTracer();
  }
  const traceId = crypto.randomUUID();
  return new Tracer(traceId, chatKey, userMessage, model);
}