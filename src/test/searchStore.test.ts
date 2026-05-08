import { describe, it, expect, beforeEach } from "vitest";
import type { EditorView } from "@milkdown/prose/view";
import { useSearchStore } from "../stores/searchStore";

describe("searchStore", () => {
  beforeEach(() => {
    const store = useSearchStore.getState();
    if (store.visible) {
      store.closeSearch();
    }
    useSearchStore.setState({
      visible: false,
      showReplace: false,
      query: "",
      replaceText: "",
      caseSensitive: false,
      regexp: false,
      matchCount: -1,
      currentMatch: -1,
      editorViewMap: new Map(),
    });
  });

  it("initial state is hidden with no query", () => {
    const state = useSearchStore.getState();
    expect(state.visible).toBe(false);
    expect(state.query).toBe("");
    expect(state.matchCount).toBe(-1);
    expect(state.currentMatch).toBe(-1);
  });

  it("toggleSearch(false) shows search without replace", () => {
    useSearchStore.getState().toggleSearch(false);
    const state = useSearchStore.getState();
    expect(state.visible).toBe(true);
    expect(state.showReplace).toBe(false);
  });

  it("toggleSearch(true) shows search with replace", () => {
    useSearchStore.getState().toggleSearch(true);
    const state = useSearchStore.getState();
    expect(state.visible).toBe(true);
    expect(state.showReplace).toBe(true);
  });

  it("toggleSearch(false) when already visible is a no-op", () => {
    useSearchStore.getState().toggleSearch(true);
    useSearchStore.getState().toggleSearch(false);
    expect(useSearchStore.getState().showReplace).toBe(true);
  });

  it("toggleSearch(true) when already visible enables replace", () => {
    useSearchStore.getState().toggleSearch(false);
    useSearchStore.getState().toggleSearch(true);
    expect(useSearchStore.getState().showReplace).toBe(true);
  });

  it("closeSearch resets all state", () => {
    useSearchStore.getState().toggleSearch(true);
    useSearchStore.setState({
      query: "test",
      replaceText: "new",
      caseSensitive: true,
      regexp: true,
      matchCount: 5,
      currentMatch: 2,
    });
    useSearchStore.getState().closeSearch();
    const state = useSearchStore.getState();
    expect(state.visible).toBe(false);
    expect(state.query).toBe("");
    expect(state.replaceText).toBe("");
    expect(state.caseSensitive).toBe(false);
    expect(state.regexp).toBe(false);
    expect(state.matchCount).toBe(-1);
    expect(state.currentMatch).toBe(-1);
  });

  it("setEditorView stores the view", () => {
    const mockView = {} as EditorView;
    const tabId = "test-tab";
    useSearchStore.getState().setEditorView(tabId, mockView);
    expect(useSearchStore.getState().getEditorView(tabId)).toBe(mockView);
    useSearchStore.getState().setEditorView(tabId, null);
    expect(useSearchStore.getState().getEditorView(tabId)).toBeNull();
  });

  it("toggleCaseSensitive toggles the flag", () => {
    expect(useSearchStore.getState().caseSensitive).toBe(false);
    useSearchStore.getState().toggleCaseSensitive();
    expect(useSearchStore.getState().caseSensitive).toBe(true);
    useSearchStore.getState().toggleCaseSensitive();
    expect(useSearchStore.getState().caseSensitive).toBe(false);
  });

  it("toggleRegexp toggles the flag", () => {
    expect(useSearchStore.getState().regexp).toBe(false);
    useSearchStore.getState().toggleRegexp();
    expect(useSearchStore.getState().regexp).toBe(true);
    useSearchStore.getState().toggleRegexp();
    expect(useSearchStore.getState().regexp).toBe(false);
  });

  it("setQuery without editorView sets query in state only", () => {
    useSearchStore.getState().setQuery("hello");
    expect(useSearchStore.getState().query).toBe("hello");
  });

  it("setQuery with empty string resets matchCount", () => {
    useSearchStore.setState({ matchCount: 5, currentMatch: 2 });
    useSearchStore.getState().setQuery("");
    expect(useSearchStore.getState().matchCount).toBe(-1);
    expect(useSearchStore.getState().currentMatch).toBe(-1);
  });

  it("setReplaceText updates replaceText in state", () => {
    useSearchStore.getState().setReplaceText("new text");
    expect(useSearchStore.getState().replaceText).toBe("new text");
  });
});
