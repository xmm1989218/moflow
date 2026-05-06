import { describe, it, expect, beforeEach } from "vitest";
import { useAISelectionStore } from "../stores/aiSelectionStore";

describe("aiSelectionStore", () => {
  beforeEach(() => {
    useAISelectionStore.getState().dismiss();
  });

  it("initial state has no active action", () => {
    const state = useAISelectionStore.getState();
    expect(state.activeAction).toBeNull();
    expect(state.selectedText).toBe("");
    expect(state.selectionCoords).toBeNull();
    expect(state.lastResult).toBe("");
  });

  it("triggerExplain sets activeAction and selectedText", () => {
    useAISelectionStore.getState().triggerExplain("hello world", { x: 100, y: 200 });
    const state = useAISelectionStore.getState();
    expect(state.activeAction).toBe("explain");
    expect(state.selectedText).toBe("hello world");
    expect(state.selectionCoords).toEqual({ x: 100, y: 200 });
    expect(state.lastResult).toBe("");
  });

  it("triggerTranslate sets activeAction and resets lastResult", () => {
    useAISelectionStore.getState().setLastResult("some result");
    useAISelectionStore.getState().triggerTranslate("hello", { x: 50, y: 50 });
    const state = useAISelectionStore.getState();
    expect(state.activeAction).toBe("translate");
    expect(state.lastResult).toBe("");
  });

  it("triggerAsk sets activeAction and resets lastResult", () => {
    useAISelectionStore.getState().setLastResult("old result");
    useAISelectionStore.getState().triggerAsk("question text", { x: 0, y: 0 });
    const state = useAISelectionStore.getState();
    expect(state.activeAction).toBe("ask");
    expect(state.lastResult).toBe("");
  });

  it("setLastResult stores the result", () => {
    useAISelectionStore.getState().triggerExplain("text", { x: 0, y: 0 });
    useAISelectionStore.getState().setLastResult("explained result");
    expect(useAISelectionStore.getState().lastResult).toBe("explained result");
  });

  it("dismiss clears everything including lastResult", () => {
    useAISelectionStore.getState().triggerExplain("text", { x: 10, y: 20 });
    useAISelectionStore.getState().setLastResult("result text");
    useAISelectionStore.getState().dismiss();
    const state = useAISelectionStore.getState();
    expect(state.activeAction).toBeNull();
    expect(state.selectedText).toBe("");
    expect(state.selectionCoords).toBeNull();
    expect(state.lastResult).toBe("");
  });

  it("swapLanguages handles auto source correctly", () => {
    const state = useAISelectionStore.getState();
    state.setSourceLang("auto");
    state.setTargetLang("en");
    state.swapLanguages();
    const swapped = useAISelectionStore.getState();
    expect(swapped.sourceLang).toBe("en");
    expect(swapped.targetLang).toBe("zh-CN");
  });

  it("swapLanguages with non-auto langs swaps normally", () => {
    const state = useAISelectionStore.getState();
    state.setSourceLang("en");
    state.setTargetLang("ja");
    state.swapLanguages();
    const swapped = useAISelectionStore.getState();
    expect(swapped.sourceLang).toBe("ja");
    expect(swapped.targetLang).toBe("en");
  });
});
