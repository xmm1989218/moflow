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
      const zhTokens = estimateTokens("你好世界这是一个测试");
      const enTokens = estimateTokens("abcdefghijklmno");
      expect(zhTokens).toBeGreaterThan(enTokens);
    });

    it("estimates roughly length/2 for Chinese text", () => {
      const tokens = estimateTokens("你好世界这是一个测试");
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
      const hasTruncation = prompt.includes("truncated") || prompt.includes("截断");
      expect(hasTruncation).toBe(true);
      expect(needsDocTools).toBe(true);
    });
  });

  describe("buildSystemPrompt — workspace mode", () => {
    it("includes filename when activeFileName provided", () => {
      const { prompt } = buildSystemPrompt(sampleDoc, 128000, false, "D:/projects/foo", "README.md");
      expect(prompt).toContain("README.md");
    });

    it("includes switch-file note", () => {
      const { prompt } = buildSystemPrompt(sampleDoc, 128000, false, "D:/projects/foo", "README.md");
      const hasSwitchNote = prompt.includes("switch files") || prompt.includes("切换文件");
      expect(hasSwitchNote).toBe(true);
    });

    it("includes all tools in workspace mode", () => {
      const { prompt } = buildSystemPrompt(sampleDoc, 128000, false, "D:/projects/foo", "README.md");
      expect(prompt).toContain("find(");
      expect(prompt).toContain("glob(");
      expect(prompt).toContain("ls(");
    });

    it("workspace with no file includes tool list", () => {
      const { prompt } = buildSystemPrompt("", 128000, false, "D:/projects/foo", null);
      expect(prompt).toContain("find(");
      expect(prompt).toContain("glob(");
      expect(prompt).toContain("ls(");
      expect(prompt).toContain("read(");
    });

    it("workspace with no file shows workspace message", () => {
      const { prompt } = buildSystemPrompt("", 128000, false, "D:/projects/foo", null);
      const hasWsMsg = prompt.includes("workspace open") || prompt.includes("工作区");
      expect(hasWsMsg).toBe(true);
    });

    it("workspace mode always returns needsDocTools true", () => {
      const { needsDocTools } = buildSystemPrompt(sampleDoc, 128000, false, "D:/projects/foo", "README.md");
      expect(needsDocTools).toBe(true);
    });

    it("workspace mode with no file returns needsDocTools true", () => {
      const { needsDocTools } = buildSystemPrompt("", 128000, false, "D:/projects/foo", null);
      expect(needsDocTools).toBe(true);
    });

    it("workspace truncation includes filename", () => {
      const longDoc = "x".repeat(200000);
      const { prompt } = buildSystemPrompt(longDoc, 128000, true, "D:/projects/foo", "long.md");
      expect(prompt).toContain("long.md");
    });

    it("no workspace prompt does not include workspace-specific tools", () => {
      const { prompt } = buildSystemPrompt(sampleDoc, 128000);
      expect(prompt).not.toContain("find(");
      expect(prompt).not.toContain("glob(");
      expect(prompt).not.toContain("ls(");
    });

    it("no workspace prompt does not include switch-file note", () => {
      const { prompt } = buildSystemPrompt(sampleDoc, 128000);
      expect(prompt).not.toContain("switch files");
      expect(prompt).not.toContain("切换文件");
    });
  });
});
