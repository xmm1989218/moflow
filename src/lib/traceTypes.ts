export interface TraceSpan {
  id: string;
  traceId: string;
  type: "llm" | "tool" | "permission" | "compact" | "subagent";
  name: string;
  startTime: number;
  endTime?: number;
  durationMs?: number;
  status: "ok" | "error" | "cancelled";

  roundIndex?: number;

  promptTokens?: number;
  completionTokens?: number;
  finishReason?: string;
  ttfbMs?: number;
  chunkCount?: number;
  toolCallCount?: number;

  toolName?: string;
  argsSummary?: string;
  resultSize?: number;
  wasTruncated?: boolean;
  permissionDecision?: string;
  permissionKey?: string;

  messagesBefore?: number;
  messagesAfter?: number;
  tokensSaved?: number;

  error?: string;
}

export interface TraceStartEvent {
  type: "trace_start";
  traceId: string;
  chatKey: string;
  userMessage: string;
  model: string;
  startTime: number;
}

export interface TraceSpanEvent {
  type: "span";
  traceId: string;
  id: string;
  spanType: TraceSpan["type"];
  name: string;
  durationMs: number;
  status: TraceSpan["status"];
  roundIndex?: number;
  promptTokens?: number;
  completionTokens?: number;
  finishReason?: string;
  ttfbMs?: number;
  chunkCount?: number;
  toolCallCount?: number;
  toolName?: string;
  argsSummary?: string;
  resultSize?: number;
  wasTruncated?: boolean;
  permissionDecision?: string;
  permissionKey?: string;
  messagesBefore?: number;
  messagesAfter?: number;
  tokensSaved?: number;
  error?: string;
}

export interface TraceEndEvent {
  type: "trace_end";
  traceId: string;
  durationMs: number;
  totalRounds: number;
  totalToolCalls: number;
  totalTokens: number;
  totalCost: number;
  status: "ok" | "error" | "cancelled";
}

export type TraceEvent = TraceStartEvent | TraceSpanEvent | TraceEndEvent;
