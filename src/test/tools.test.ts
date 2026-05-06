import { describe, it, expect } from 'vitest'
import { executeTool, toolDefinitions } from '../lib/tools'

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

describe('tools', () => {
  describe('toolDefinitions', () => {
    it('has 4 tool definitions', () => {
      expect(toolDefinitions).toHaveLength(4)
    })

    it('each tool has required fields', () => {
      for (const def of toolDefinitions) {
        expect(def.type).toBe('function')
        expect(def.function.name).toBeTruthy()
        expect(def.function.description).toBeTruthy()
        expect(def.function.parameters).toBeTruthy()
      }
    })

    it('contains all expected tool names', () => {
      const names = toolDefinitions.map((t) => t.function.name)
      expect(names).toContain('outline')
      expect(names).toContain('grep')
      expect(names).toContain('read_lines')
      expect(names).toContain('read_section')
    })
  })

  describe('executeTool', () => {
    it('returns "Unknown tool" for unknown name', () => {
      const result = executeTool('nonexistent', {}, sampleDoc)
      expect(result).toContain('Unknown tool')
    })

    describe('outline', () => {
      it('returns heading tree with line ranges', () => {
        const result = executeTool('outline', {}, sampleDoc)
        expect(result).toContain('Introduction')
        expect(result).toContain('Methods')
        expect(result).toContain('Results')
        expect(result).toMatch(/L\d+-\d+/)
      })

      it('returns no headings message for empty document', () => {
        const result = executeTool('outline', {}, 'no headings here')
        expect(result).toBeTruthy()
      })
    })

    describe('grep', () => {
      it('finds matching lines with line numbers', () => {
        const result = executeTool('grep', { pattern: 'model' }, sampleDoc)
        expect(result).toMatch(/\d+:/)
      })

      it('returns "No matches found" for no results', () => {
        const result = executeTool('grep', { pattern: 'xyznonexistent' }, sampleDoc)
        expect(result).toContain('No matches found')
      })

      it('returns error for invalid regex', () => {
        const result = executeTool('grep', { pattern: '[invalid' }, sampleDoc)
        expect(result).toContain('Invalid regex')
      })
    })

    describe('read_lines', () => {
      it('reads specified line range', () => {
        const result = executeTool('read_lines', { start: 1, end: 3 }, sampleDoc)
        expect(result).toContain('1:')
        expect(result).toContain('Introduction')
      })

      it('clamps out of range', () => {
        const result = executeTool('read_lines', { start: 1, end: 3 }, 'only one line')
        expect(result).toContain('1:')
      })

      it('returns error for start beyond document', () => {
        const result = executeTool('read_lines', { start: 999, end: 1000 }, sampleDoc)
        expect(result).toContain('超出范围')
      })
    })

    describe('read_section', () => {
      it('reads section content under heading', () => {
        const result = executeTool('read_section', { heading: 'Methods' }, sampleDoc)
        expect(result).toContain('Dataset')
        expect(result).toContain('Model Architecture')
        expect(result).toContain('Training')
        expect(result).not.toContain('Results')
      })

      it('reads subsection content', () => {
        const result = executeTool('read_section', { heading: 'Dataset' }, sampleDoc)
        expect(result).toContain('large dataset')
        expect(result).not.toContain('Model Architecture')
      })

      it('returns available headings when not found', () => {
        const result = executeTool('read_section', { heading: 'Nonexistent' }, sampleDoc)
        expect(result).toContain('Section not found')
        expect(result).toContain('Introduction')
      })
    })

    describe('truncation', () => {
      it('truncates long results', () => {
        const longDoc = 'x'.repeat(10000)
        const result = executeTool('read_lines', { start: 1, end: 1 }, longDoc)
        expect(result.length).toBeLessThan(10000)
        expect(result).toContain('截断')
      })
    })
  })
})
