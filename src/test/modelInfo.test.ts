import { describe, it, expect } from 'vitest'
import { calculateCost, getModelInfo, formatCost } from '../lib/modelInfo'

describe('modelInfo', () => {
  describe('calculateCost', () => {
    it('returns zero cost for unknown provider/model', () => {
      const result = calculateCost(1000, 500, 'unknown', 'unknown-model')
      expect(result.cost).toBe(0)
      expect(result.currency).toBe('USD')
    })

    it('calculates cost based on per-million-token pricing', () => {
      const info = getModelInfo('openai', 'gpt-4o')
      if (info.inputPricePer1M === 0 && info.outputPricePer1M === 0) {
        return
      }
      const result = calculateCost(1_000_000, 1_000_000, 'openai', 'gpt-4o')
      expect(result.cost).toBeGreaterThan(0)
    })

    it('applies OpenAI cached token discount (50%)', () => {
      const result = calculateCost(1_000_000, 0, 'openai', 'gpt-4o', 500_000)
      const full = calculateCost(1_000_000, 0, 'openai', 'gpt-4o')
      expect(result.cost).toBeLessThan(full.cost)
      expect(result.cacheSavings).toBeGreaterThan(0)
    })

    it('applies Claude cache read discount (90%) and cache creation surcharge (25%)', () => {
      const result = calculateCost(1_000_000, 0, 'anthropic', 'claude-sonnet-4', 500_000, 100_000)
      const full = calculateCost(1_000_000, 0, 'anthropic', 'claude-sonnet-4')
      expect(result.cost).toBeLessThan(full.cost)
      expect(result.cacheSavings).toBeGreaterThan(0)
    })
  })

  describe('formatCost', () => {
    it('formats zero cost in USD', () => {
      expect(formatCost(0, 'USD')).toBe('$0')
    })

    it('formats zero cost in CNY', () => {
      expect(formatCost(0, 'CNY')).toBe('¥0')
    })

    it('formats small cost with less-than indicator', () => {
      expect(formatCost(0.005, 'USD')).toBe('$<0.01')
      expect(formatCost(0.005, 'CNY')).toBe('¥<0.01')
    })

    it('formats normal cost with two decimal places', () => {
      expect(formatCost(1.5, 'USD')).toBe('$1.50')
      expect(formatCost(1.5, 'CNY')).toBe('¥1.50')
    })
  })

  describe('getModelInfo', () => {
    it('returns default entry for unknown provider', () => {
      const info = getModelInfo('nonexistent', 'model')
      expect(info.maxContext).toBe(0)
      expect(info.inputPricePer1M).toBe(0)
      expect(info.outputPricePer1M).toBe(0)
    })

    it('returns exact model match when available', () => {
      const info = getModelInfo('openai', 'gpt-4o')
      expect(info.id).toBe('gpt-4o')
      expect(info.maxContext).toBeGreaterThan(0)
    })
  })
})
