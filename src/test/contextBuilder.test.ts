import { describe, it, expect } from "vitest";
import { buildSystemPrompt, estimateTokens } from "../lib/contextBuilder";

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

In conclusion, it works.`;

describe("contextBuilder", () => {
  describe("estimateTokens", () => {
    it("estimates more tokens per character for Chinese text", () => {
      const zhTokens = estimateTokens("\u4f60\u597d\u4e16\u754c\u8fd9\u662f\u4e00\u4e2a\u6d4b\u8bd5");
      const enTokens = estimateTokens("abcdefghijklmno");
      expect(zhTokens).toBeGreaterThan(enTokens);
    });

    it("estimates roughly length/2 for Chinese text", () => {
      const tokens = estimateTokens("\u4f60\u597d\u4e16\u754c\u8fd9\u662f\u4e00\u4e2a\u6d4b\u8bd5");
      expect(tokens).toBe(5);
    });

    it("estimates roughly length/4 for English text", () => {
      const tokens = estimateTokens("Hello world this is a test");
      expect(tokens).toBe(7);
    });
  });

  describe("buildSystemPrompt — no workspace", () => {
    it("returns prompt with docContent when short document", () => {
      const { prompt, needsDocTools } = buildSystemPrompt(sampleDoc, 128000);
      expect(prompt).toContain(sampleDoc);
      expect(needsDocTools).toBe(false);
    });

    it("returns prompt without docContent when empty", () => {
      const { prompt, needsDocTools } = buildSystemPrompt("", 128000);
      expect(prompt).not.toContain(sampleDoc);
      expect(needsDocTools).toBe(false);
    });

    it("truncates long documents", () => {
      const longDoc = "x".repeat(200000);
      const { prompt, needsDocTools } = buildSystemPrompt(longDoc, 4000);
      expect(prompt).toContain("truncated");
      expect(needsDocTools).toBe(true);
    });
  });

  describe("buildSystemPrompt — workspace mode", () => {
    it("includes workspace open message when activeFilePath provided", () => {
      const { prompt } = buildSystemPrompt(sampleDoc, 128000, false, "D:/projects/foo", "D:/projects/foo/README.md");
      expect(prompt).toContain("workspace open");
      expect(prompt).toContain("<document_content>");
    });

    it("includes switch-file note", () => {
      const { prompt } = buildSystemPrompt(sampleDoc, 128000, false, "D:/projects/foo", "D:/projects/foo/README.md");
      expect(prompt).toContain("switch files");
    });

    it("includes tool guidance in workspace mode", () => {
      const { prompt } = buildSystemPrompt(sampleDoc, 128000, false, "D:/projects/foo", "D:/projects/foo/README.md");
      expect(prompt).toContain("provided tools");
    });

    it("workspace with no file includes tool guidance", () => {
      const { prompt } = buildSystemPrompt("", 128000, false, "D:/projects/foo", null);
      expect(prompt).toContain("provided tools");
    });

    it("workspace with no file shows workspace message", () => {
      const { prompt } = buildSystemPrompt("", 128000, false, "D:/projects/foo", null);
      expect(prompt).toContain("workspace open");
    });

    it("workspace mode always returns needsDocTools true", () => {
      const { needsDocTools } = buildSystemPrompt(sampleDoc, 128000, false, "D:/projects/foo", "D:/projects/foo/README.md");
      expect(needsDocTools).toBe(true);
    });

    it("workspace mode with no file returns needsDocTools true", () => {
      const { needsDocTools } = buildSystemPrompt("", 128000, false, "D:/projects/foo", null);
      expect(needsDocTools).toBe(true);
    });

    it("workspace truncation includes truncated tag", () => {
      const longDoc = "x".repeat(200000);
      const { prompt } = buildSystemPrompt(longDoc, 4000, true, "D:/projects/foo", "D:/projects/foo/long.md");
      expect(prompt).toContain("<document_content truncated=\"true\">");
      expect(prompt).toContain("<document_structure>");
    });

    it("no workspace prompt does not include workspace-specific tool guidance", () => {
      const { prompt } = buildSystemPrompt(sampleDoc, 128000);
      expect(prompt).not.toContain("provided tools");
    });

    it("no workspace prompt does not include switch-file note", () => {
      const { prompt } = buildSystemPrompt(sampleDoc, 128000);
      expect(prompt).not.toContain("switch files");
    });

    it("includes default.txt content as prefix", () => {
      const { prompt } = buildSystemPrompt(sampleDoc, 128000);
      expect(prompt).toContain("You are the AI assistant for MoFlow editor.");
      expect(prompt).toContain("Tone and style");
      expect(prompt).toContain("Proactiveness");
      expect(prompt).toContain("Tool usage policy");
    });
  });

  describe("buildSystemPrompt — aiMode", () => {
    it("plan mode injects <mode>plan</mode> tag", () => {
      const { prompt } = buildSystemPrompt(sampleDoc, 128000, false, undefined, undefined, "plan");
      expect(prompt).toContain("<mode>plan</mode>");
      expect(prompt).toContain("MUST NOT write, edit, or modify");
    });

    it("build mode does not inject plan mode tag", () => {
      const { prompt } = buildSystemPrompt(sampleDoc, 128000, false, undefined, undefined, "build");
      expect(prompt).not.toContain("<mode>plan</mode>");
    });

    it("undefined aiMode does not inject plan mode tag", () => {
      const { prompt } = buildSystemPrompt(sampleDoc, 128000);
      expect(prompt).not.toContain("<mode>plan</mode>");
    });

    it("plan mode works in workspace mode", () => {
      const { prompt } = buildSystemPrompt(sampleDoc, 128000, false, "D:/projects/foo", "D:/projects/foo/README.md", "plan");
      expect(prompt).toContain("<mode>plan</mode>");
      expect(prompt).toContain("workspace open");
    });

    it("plan mode works with empty document", () => {
      const { prompt } = buildSystemPrompt("", 128000, false, undefined, undefined, "plan");
      expect(prompt).toContain("<mode>plan</mode>");
    });

    it("plan mode works with truncated document", () => {
      const longDoc = "x".repeat(200000);
      const { prompt } = buildSystemPrompt(longDoc, 4000, true, undefined, undefined, "plan");
      expect(prompt).toContain("<mode>plan</mode>");
      expect(prompt).toContain("truncated");
    });
  });

  describe("buildSystemPrompt — subagent section", () => {
    it("includes available_subagents in no-workspace mode", () => {
      const { prompt } = buildSystemPrompt("hello", 128000);
      expect(prompt).toContain("<available_subagents>");
      expect(prompt).toContain('name="explore"');
      expect(prompt).toContain('name="general"');
    });

    it("includes available_subagents in workspace mode", () => {
      const { prompt } = buildSystemPrompt("hello", 128000, false, "/ws", "/ws/a.md");
      expect(prompt).toContain("<available_subagents>");
    });

    it("includes available_subagents with empty document", () => {
      const { prompt } = buildSystemPrompt("", 128000);
      expect(prompt).toContain("<available_subagents>");
    });

    it("includes available_subagents in truncated document", () => {
      const longDoc = "x".repeat(200000);
      const { prompt } = buildSystemPrompt(longDoc, 4000, true);
      expect(prompt).toContain("<available_subagents>");
    });

    it("includes available_subagents in workspace with no file", () => {
      const { prompt } = buildSystemPrompt("", 128000, false, "/ws", null);
      expect(prompt).toContain("<available_subagents>");
    });

    it("includes available_subagents in plan mode", () => {
      const { prompt } = buildSystemPrompt("hello", 128000, false, undefined, undefined, "plan");
      expect(prompt).toContain("<available_subagents>");
      expect(prompt).toContain("<mode>plan</mode>");
    });
  });
});