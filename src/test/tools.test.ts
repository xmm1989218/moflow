import { describe, it, expect } from 'vitest'
import { executeTool, getFileToolDefinitions, getProjectToolDefinitions, getNetworkToolDefinitions, getToolDefinitions, WEBFETCH_LIMIT } from '../lib/tools'
import type { ToolContext } from '../lib/tools'

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
const docCtx: ToolContext = { docContent: sampleDoc }

describe('tools', () => {
  describe('tool definitions', () => {
    it('fileToolDefinitions has 3 tools', () => {
      const fileToolDefinitions = getFileToolDefinitions()
      expect(fileToolDefinitions).toHaveLength(3)
      const names = fileToolDefinitions.map((d) => d.function.name)
      expect(names).toContain('outline')
      expect(names).toContain('read')
      expect(names).toContain('readSection')
    })

    it('projectToolDefinitions has 3 tools', () => {
      const projectToolDefinitions = getProjectToolDefinitions()
      expect(projectToolDefinitions).toHaveLength(3)
      const names = projectToolDefinitions.map((d) => d.function.name)
      expect(names).toContain('find')
      expect(names).toContain('glob')
      expect(names).toContain('ls')
    })

    it('networkToolDefinitions has 1 tool', () => {
      const networkToolDefinitions = getNetworkToolDefinitions()
      expect(networkToolDefinitions).toHaveLength(1)
      expect(networkToolDefinitions[0].function.name).toBe('webfetch')
    })

    it('getToolDefinitions returns correct sets', () => {
      const noTools = getToolDefinitions(false, null)
      expect(noTools.map((d) => d.function.name)).toEqual(['webfetch', 'question'])

      const docOnly = getToolDefinitions(true, null)
      expect(docOnly.map((d) => d.function.name)).toContain('outline')
      expect(docOnly.map((d) => d.function.name)).toContain('grep')
      expect(docOnly.map((d) => d.function.name)).not.toContain('find')

      const withWs = getToolDefinitions(true, '/some/root')
      expect(withWs.map((d) => d.function.name)).toContain('outline')
      expect(withWs.map((d) => d.function.name)).toContain('find')
      expect(withWs.map((d) => d.function.name)).toContain('glob')
      expect(withWs.map((d) => d.function.name)).toContain('ls')

      const wsNoDoc = getToolDefinitions(false, '/some/root')
      expect(wsNoDoc.map((d) => d.function.name)).toContain('outline')
      expect(wsNoDoc.map((d) => d.function.name)).toContain('read')
      expect(wsNoDoc.map((d) => d.function.name)).toContain('find')
    })
  })

  describe('WEBFETCH_LIMIT', () => {
    it('is 3', () => {
      expect(WEBFETCH_LIMIT).toBe(3)
    })
  })

  describe('executeTool', () => {
    it('returns "Unknown tool" for unknown name', async () => {
      const result = await executeTool('nonexistent', {}, mockSignal, docCtx)
      expect(result).toContain('Unknown tool')
    })

    describe('outline', () => {
      it('returns heading tree with line ranges', async () => {
        const result = await executeTool('outline', {}, mockSignal, docCtx)
        expect(result).toContain('Introduction')
        expect(result).toContain('Methods')
        expect(result).toContain('Results')
        expect(result).toMatch(/L\d+-\d+/)
      })

      it('returns no headings message for empty document', async () => {
        const result = await executeTool('outline', {}, mockSignal, { docContent: 'no headings here' })
        expect(result).toBeTruthy()
      })

      it('returns error when path provided without workspace', async () => {
        const result = await executeTool('outline', { path: 'other.md' }, mockSignal, { docContent: sampleDoc })
        const hasError = result.includes('workspace') || result.includes('工作区')
        expect(hasError).toBe(true)
      })
    })

    describe('read', () => {
      it('reads from offset with limit', async () => {
        const result = await executeTool('read', { offset: 1, limit: 3 }, mockSignal, docCtx)
        expect(result).toContain('1:')
        expect(result).toContain('Introduction')
      })

      it('defaults to offset 1, limit 200', async () => {
        const result = await executeTool('read', {}, mockSignal, docCtx)
        expect(result).toContain('1:')
      })

      it('returns error for start beyond document', async () => {
        const result = await executeTool('read', { offset: 999 }, mockSignal, docCtx)
        const hasError = result.includes('out of range') || result.includes('超出范围')
        expect(hasError).toBe(true)
      })
    })

    describe('grep', () => {
      it('finds matching lines with line numbers', async () => {
        const result = await executeTool('grep', { pattern: 'model' }, mockSignal, docCtx)
        expect(result).toMatch(/\d+:/)
      })

      it('returns "No matches found" for no results', async () => {
        const result = await executeTool('grep', { pattern: 'xyznonexistent' }, mockSignal, docCtx)
        expect(result).toContain('No matches found')
      })

      it('returns error for invalid regex', async () => {
        const result = await executeTool('grep', { pattern: '[invalid' }, mockSignal, docCtx)
        expect(result).toContain('Invalid regex')
      })
    })

    describe('readSection', () => {
      it('reads section content under heading', async () => {
        const result = await executeTool('readSection', { heading: 'Methods' }, mockSignal, docCtx)
        expect(result).toContain('Dataset')
        expect(result).toContain('Model Architecture')
        expect(result).toContain('Training')
        expect(result).not.toContain('Results')
      })

      it('reads subsection content', async () => {
        const result = await executeTool('readSection', { heading: 'Dataset' }, mockSignal, docCtx)
        expect(result).toContain('large dataset')
        expect(result).not.toContain('Model Architecture')
      })

      it('returns available headings when not found', async () => {
        const result = await executeTool('readSection', { heading: 'Nonexistent' }, mockSignal, docCtx)
        expect(result).toContain('Section not found')
        expect(result).toContain('Introduction')
      })
    })

    describe('find/glob/ls without workspace', () => {
      it('find returns error without workspace', async () => {
        const result = await executeTool('find', { pattern: 'test' }, mockSignal, { docContent: '' })
        const hasError = result.includes('workspace') || result.includes('工作区')
        expect(hasError).toBe(true)
      })

      it('glob returns error without workspace', async () => {
        const result = await executeTool('glob', { pattern: '*.md' }, mockSignal, { docContent: '' })
        const hasError = result.includes('workspace') || result.includes('工作区')
        expect(hasError).toBe(true)
      })

      it('ls returns error without workspace', async () => {
        const result = await executeTool('ls', {}, mockSignal, { docContent: '' })
        const hasError = result.includes('workspace') || result.includes('工作区')
        expect(hasError).toBe(true)
      })
    })

    describe('webfetch', () => {
      it('rejects non-http URLs', async () => {
        const result = await executeTool('webfetch', { url: 'ftp://example.com' }, mockSignal, docCtx)
        expect(result).toContain('Unsupported URL protocol')
      })

      it('rejects invalid URLs', async () => {
        const result = await executeTool('webfetch', { url: 'not-a-url' }, mockSignal, docCtx)
        expect(result).toContain('Invalid URL')
      })
    })

    describe('truncation', () => {
      it('truncates long results', async () => {
        const longDoc = 'x'.repeat(40000)
        const result = await executeTool('read', { offset: 1, limit: 1 }, mockSignal, { docContent: longDoc })
        expect(result.length).toBeLessThan(40000)
      })
    })
  })
})
