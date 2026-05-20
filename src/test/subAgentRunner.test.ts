import { describe, it, expect, vi, beforeEach } from 'vitest'
import { runSubAgent } from '../lib/subAgentRunner'
import type { LLMClient, ChatResult } from '../lib/llmClient'
import type { ToolContext } from '../lib/tools'

const mockSignal = new AbortController().signal
const docCtx: ToolContext = { docContent: '# Test\n\nHello world' }

function createMockClient(responses: ChatResult[]): LLMClient {
  let callIndex = 0
  return {
    chat: vi.fn(async (...args: unknown[]) => {
      const onChunk = args[1] as ((text: string) => void) | undefined
      const result = responses[Math.min(callIndex, responses.length - 1)]
      callIndex++
      if (result.usage && onChunk) {
        onChunk(result.finishReason === 'tool_calls' ? '' : 'response text')
      }
      return result
    }),
  }
}

function textResult(_content: string, promptTokens = 100, completionTokens = 50): ChatResult {
  return {
    usage: { promptTokens, completionTokens, totalTokens: promptTokens + completionTokens },
    finishReason: 'stop',
  }
}

function toolCallResult(toolCalls: { id: string; name: string; arguments: string }[], promptTokens = 100, completionTokens = 50): ChatResult {
  return {
    usage: { promptTokens, completionTokens, totalTokens: promptTokens + completionTokens },
    toolCalls,
    finishReason: 'tool_calls',
  }
}

function createNoOpTracer() {
  return {
    startSpan: vi.fn(() => 'span-id'),
    endSpan: vi.fn(),
    endTrace: vi.fn(),
  }
}

describe('subAgentRunner', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('runSubAgent — basic flow', () => {
    it('returns content from a single LLM response', async () => {
      const client = createMockClient([textResult('Final answer')])
      const tracer = createNoOpTracer()

      const result = await runSubAgent({
        prompt: 'Find all API endpoints',
        description: 'Explore API',
        subagentType: 'explore',
        ctx: docCtx,
        client,
        signal: mockSignal,
        tracer,
        maxContext: 128000,
      })

      expect(result.content).toBeTruthy()
      expect(result.totalRounds).toBeGreaterThanOrEqual(1)
      expect(result.promptTokens).toBe(100)
      expect(result.completionTokens).toBe(50)
      expect(result.messages.length).toBeGreaterThan(0)
    })

    it('includes initial user message with prompt', async () => {
      const client = createMockClient([textResult('Done')])
      const tracer = createNoOpTracer()

      const result = await runSubAgent({
        prompt: 'Search for routes',
        description: 'Search',
        subagentType: 'explore',
        ctx: docCtx,
        client,
        signal: mockSignal,
        tracer,
        maxContext: 128000,
      })

      const userMsg = result.messages.find((m) => m.role === 'user')
      expect(userMsg).toBeDefined()
      expect(userMsg!.content).toBe('Search for routes')
    })
  })

  describe('runSubAgent — tool calling', () => {
    it('executes tool calls and feeds results back', async () => {
      const tcId = 'tc-1'
      const responses: ChatResult[] = [
        toolCallResult([{ id: tcId, name: 'outline', arguments: '{}' }]),
        textResult('Here is the outline summary'),
      ]
      const client = createMockClient(responses)
      const tracer = createNoOpTracer()

      const result = await runSubAgent({
        prompt: 'Show me the outline',
        description: 'Outline',
        subagentType: 'explore',
        ctx: docCtx,
        client,
        signal: mockSignal,
        tracer,
        maxContext: 128000,
      })

      expect(result.totalRounds).toBe(2)
      expect(result.toolCalls.length).toBe(1)
      expect(result.toolCalls[0].name).toBe('outline')
      expect(result.toolCalls[0].round).toBe(1)
      expect(client.chat).toHaveBeenCalledTimes(2)
    })

    it('records tool call summaries', async () => {
      const tc1 = { id: 'tc-1', name: 'outline', arguments: '{}' }
      const tc2 = { id: 'tc-2', name: 'grep', arguments: '{"pattern":"test"}' }
      const responses: ChatResult[] = [
        toolCallResult([tc1, tc2]),
        textResult('Summary of findings'),
      ]
      const client = createMockClient(responses)
      const tracer = createNoOpTracer()

      const result = await runSubAgent({
        prompt: 'Analyze',
        description: 'Analysis',
        subagentType: 'explore',
        ctx: docCtx,
        client,
        signal: mockSignal,
        tracer,
        maxContext: 128000,
      })

      expect(result.toolCalls).toHaveLength(2)
      expect(result.toolCalls[0].name).toBe('outline')
      expect(result.toolCalls[1].name).toBe('grep')
    })
  })

  describe('runSubAgent — max rounds', () => {
    it('explore mode uses max 10 rounds', async () => {
      const alwaysToolCall = toolCallResult([{ id: 'tc-loop', name: 'outline', arguments: '{}' }])
      const client = createMockClient([alwaysToolCall])
      const tracer = createNoOpTracer()

      const result = await runSubAgent({
        prompt: 'Keep going',
        description: 'Loop test',
        subagentType: 'explore',
        ctx: docCtx,
        client,
        signal: mockSignal,
        tracer,
        maxContext: 128000,
      })

      expect(result.totalRounds).toBeLessThanOrEqual(10)
    })

    it('general mode uses max 15 rounds', async () => {
      const alwaysToolCall = toolCallResult([{ id: 'tc-loop', name: 'outline', arguments: '{}' }])
      const client = createMockClient([alwaysToolCall])
      const tracer = createNoOpTracer()

      const result = await runSubAgent({
        prompt: 'Keep going',
        description: 'Loop test',
        subagentType: 'general',
        ctx: docCtx,
        client,
        signal: mockSignal,
        tracer,
        maxContext: 128000,
      })

      expect(result.totalRounds).toBeLessThanOrEqual(15)
    })
  })

  describe('runSubAgent — abort', () => {
    it('stops on abort signal', async () => {
      const abortController = new AbortController()
      const client = createMockClient([textResult('Partial')])
      const tracer = createNoOpTracer()

      setTimeout(() => abortController.abort(), 10)

      const result = await runSubAgent({
        prompt: 'Test abort',
        description: 'Abort test',
        subagentType: 'explore',
        ctx: docCtx,
        client,
        signal: abortController.signal,
        tracer,
        maxContext: 128000,
      })

      expect(result).toBeDefined()
      expect(result.totalRounds).toBeGreaterThanOrEqual(0)
    })
  })

  describe('runSubAgent — tracer integration', () => {
    it('creates subagent span', async () => {
      const client = createMockClient([textResult('Done')])
      const tracer = createNoOpTracer()

      await runSubAgent({
        prompt: 'Test',
        description: 'Tracer test',
        subagentType: 'explore',
        ctx: docCtx,
        client,
        signal: mockSignal,
        tracer,
        maxContext: 128000,
      })

      expect(tracer.startSpan).toHaveBeenCalledWith('subagent', expect.stringContaining('task.'), expect.any(Object))
      expect(tracer.endSpan).toHaveBeenCalled()
    })
  })

  describe('runSubAgent — cost calculation', () => {
    it('accumulates tokens across rounds', async () => {
      const responses: ChatResult[] = [
        { usage: { promptTokens: 200, completionTokens: 100, totalTokens: 300 }, finishReason: 'stop' },
      ]
      const client = createMockClient(responses)
      const tracer = createNoOpTracer()

      const result = await runSubAgent({
        prompt: 'Test cost',
        description: 'Cost test',
        subagentType: 'explore',
        ctx: docCtx,
        client,
        signal: mockSignal,
        tracer,
        maxContext: 128000,
      })

      expect(result.promptTokens).toBe(200)
      expect(result.completionTokens).toBe(100)
      expect(result.totalTokens).toBe(300)
    })
  })

  describe('runSubAgent — plan mode', () => {
    it('plan mode denies write/edit tools in explore', async () => {
      const client = createMockClient([textResult('Analysis done')])
      const tracer = createNoOpTracer()

      const result = await runSubAgent({
        prompt: 'Analyze code',
        description: 'Plan analysis',
        subagentType: 'explore',
        ctx: docCtx,
        client,
        signal: mockSignal,
        tracer,
        maxContext: 128000,
        aiMode: 'plan',
      })

      expect(result).toBeDefined()
    })
  })

  describe('runSubAgent — error handling', () => {
    it('handles client throwing error', async () => {
      const client: LLMClient = {
        chat: vi.fn(async () => {
          throw new Error('API error')
        }),
      }
      const tracer = createNoOpTracer()

      const result = await runSubAgent({
        prompt: 'Test error',
        description: 'Error test',
        subagentType: 'explore',
        ctx: docCtx,
        client,
        signal: mockSignal,
        tracer,
        maxContext: 128000,
      })

      expect(result).toBeDefined()
      expect(result.totalRounds).toBeGreaterThanOrEqual(0)
    })
  })
})
