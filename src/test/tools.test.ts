import { describe, it, expect } from 'vitest'
import { executeTool, docToolDefinitions, networkToolDefinitions, WEBFETCH_LIMIT } from '../lib/tools'

const sampleDoc = `# Introduction

This is the intro paragraph.

## Background

Some background info here.

## Motivation

Why we did this.

# Methods

## Dataset

We used a large dataset.

## Model Architecture

The model has 3 layers.

## Training

Trained for 100 epochs.

# Results

The results were great.

# Conclusion

In conclusion, it works.`

const mockSignal = new AbortController().signal

describe('tools', () => {
  describe('docToolDefinitions', () => {
    it('has 4 doc tool definitions', () => {
      expect(docToolDefinitions).toHaveLength(4)
    })

    it('each tool has required fields', () => {
      for (const def of docToolDefinitions) {
        expect(def.type).toBe('function')
        expect(def.function.name).toBeTruthy()
        expect(def.function.description).toBeTruthy()
        expect(def.function.parameters).toBeTruthy()
      }
    })

    it('contains all expected doc tool names', () => {
      const names = docToolDefinitions.map((d) => d.function.name)
      expect(names).toContain('outline')
      expect(names).toContain('grep')
      expect(names).toContain('read_lines')
      expect(names).toContain('read_section')
    })
  })

  describe('networkToolDefinitions', () => {
    it('has 1 network tool definition', () => {
      expect(networkToolDefinitions).toHaveLength(1)
    })

    it('contains webfetch', () => {
      const names = networkToolDefinitions.map((d) => d.function.name)
      expect(names).toContain('webfetch')
    })
  })

  describe('WEBFETCH_LIMIT', () => {
    it('is 3', () => {
      expect(WEBFETCH_LIMIT).toBe(3)
    })
  })

  describe('executeTool', () => {
    it('returns "Unknown tool" for unknown name', async () => {
      const result = await executeTool('nonexistent', {}, sampleDoc, mockSignal)
      expect(result).toContain('Unknown tool')
    })

    describe('outline', () => {
      it('returns heading tree with line ranges', async () => {
        const result = await executeTool('outline', {}, sampleDoc, mockSignal)
        expect(result).toContain('Introduction')
        expect(result).toContain('Methods')
        expect(result).toContain('Results')
        expect(result).toMatch(/L\d+-\d+/)
      })

      it('returns no headings message for empty document', async () => {
        const result = await executeTool('outline', {}, 'no headings here', mockSignal)
        expect(result).toBeTruthy()
      })
    })

    describe('grep', () => {
      it('finds matching lines with line numbers', async () => {
        const result = await executeTool('grep', { pattern: 'model' }, sampleDoc, mockSignal)
        expect(result).toMatch(/\d+:/)
      })

      it('returns "No matches found" for no results', async () => {
        const result = await executeTool('grep', { pattern: 'xyznonexistent' }, sampleDoc, mockSignal)
        expect(result).toContain('No matches found')
      })

      it('returns error for invalid regex', async () => {
        const result = await executeTool('grep', { pattern: '[invalid' }, sampleDoc, mockSignal)
        expect(result).toContain('Invalid regex')
      })
    })

    describe('read_lines', () => {
      it('reads specified line range', async () => {
        const result = await executeTool('read_lines', { start: 1, end: 3 }, sampleDoc, mockSignal)
        expect(result).toContain('1:')
        expect(result).toContain('Introduction')
      })

      it('clamps out of range', async () => {
        const result = await executeTool('read_lines', { start: 1, end: 3 }, 'only one line', mockSignal)
        expect(result).toContain('1:')
      })

      it('returns error for start beyond document', async () => {
        const result = await executeTool('read_lines', { start: 999, end: 1000 }, sampleDoc, mockSignal)
        expect(result).toContain('超出范围')
      })
    })

    describe('read_section', () => {
      it('reads section content under heading', async () => {
        const result = await executeTool('read_section', { heading: 'Methods' }, sampleDoc, mockSignal)
        expect(result).toContain('Dataset')
        expect(result).toContain('Model Architecture')
        expect(result).toContain('Training')
        expect(result).not.toContain('Results')
      })

      it('reads subsection content', async () => {
        const result = await executeTool('read_section', { heading: 'Dataset' }, sampleDoc, mockSignal)
        expect(result).toContain('large dataset')
        expect(result).not.toContain('Model Architecture')
      })

      it('returns available headings when not found', async () => {
        const result = await executeTool('read_section', { heading: 'Nonexistent' }, sampleDoc, mockSignal)
        expect(result).toContain('Section not found')
        expect(result).toContain('Introduction')
      })
    })

    describe('webfetch', () => {
      it('rejects non-http URLs', async () => {
        const result = await executeTool('webfetch', { url: 'ftp://example.com' }, sampleDoc, mockSignal)
        expect(result).toContain('Unsupported URL protocol')
      })

      it('rejects invalid URLs', async () => {
        const result = await executeTool('webfetch', { url: 'not-a-url' }, sampleDoc, mockSignal)
        expect(result).toContain('Invalid URL')
      })
    })

    describe('truncation', () => {
      it('truncates long results', async () => {
        const longDoc = 'x'.repeat(10000)
        const result = await executeTool('read_lines', { start: 1, end: 1 }, longDoc, mockSignal)
        expect(result.length).toBeLessThan(10000)
        expect(result).toContain('截断')
      })
    })
  })
})
