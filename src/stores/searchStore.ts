import { create } from "zustand";
import type { EditorView } from "@milkdown/prose/view";
import type { EditorState } from "@milkdown/prose/state";
import {
  SearchQuery,
  setSearchState,
  getMatchHighlights,
  findNext as pmFindNext,
  findPrev as pmFindPrev,
  replaceAll as pmReplaceAll,
  replaceCurrent as pmReplaceCurrent,
} from "prosemirror-search";

interface SearchState {
  visible: boolean;
  showReplace: boolean;
  query: string;
  replaceText: string;
  caseSensitive: boolean;
  regexp: boolean;
  matchCount: number;
  currentMatch: number;
  editorView: EditorView | null;

  setEditorView: (view: EditorView | null) => void;
  toggleSearch: (withReplace?: boolean) => void;
  closeSearch: () => void;
  setQuery: (q: string) => void;
  setReplaceText: (t: string) => void;
  toggleCaseSensitive: () => void;
  toggleRegexp: () => void;
  findNext: () => void;
  findPrev: () => void;
  replaceCurrentMatch: () => void;
  replaceAllMatches: () => void;
}

function buildSearchQuery(query: string, caseSensitive: boolean, regexp: boolean, replace?: string): SearchQuery {
  return new SearchQuery({
    search: query,
    caseSensitive,
    regexp,
    literal: !regexp,
    replace: replace ?? "",
  });
}

function countMatches(state: EditorState): number {
  const highlights = getMatchHighlights(state);
  return highlights.find().length;
}

function getCurrentMatchIndex(view: EditorView): number {
  const { from } = view.state.selection;
  const highlights = getMatchHighlights(view.state);
  const matches = highlights.find();
  let idx = 0;
  for (const m of matches) {
    if (m.from >= from) break;
    idx++;
  }
  return Math.min(idx, matches.length - 1);
}

export const useSearchStore = create<SearchState>((set, get) => ({
  visible: false,
  showReplace: false,
  query: "",
  replaceText: "",
  caseSensitive: false,
  regexp: false,
  matchCount: -1,
  currentMatch: -1,
  editorView: null,

  setEditorView: (view) => set({ editorView: view }),

  toggleSearch: (withReplace = false) => {
    const state = get();
    if (state.visible && !withReplace) {
      return;
    }
    set({ visible: true, showReplace: withReplace || state.showReplace });
  },

  closeSearch: () => {
    const { editorView } = get();
    if (editorView) {
      const emptyQuery = buildSearchQuery("", false, false);
      const tr = editorView.state.tr;
      setSearchState(tr, emptyQuery);
      editorView.dispatch(tr);
    }
    set({
      visible: false,
      showReplace: false,
      query: "",
      replaceText: "",
      caseSensitive: false,
      regexp: false,
      matchCount: -1,
      currentMatch: -1,
    });
  },

  setQuery: (q) => {
    set({ query: q });
    const { editorView, caseSensitive, regexp, replaceText } = get();
    if (!q) {
      if (editorView) {
        const emptyQuery = buildSearchQuery("", false, false);
        const tr = editorView.state.tr;
        setSearchState(tr, emptyQuery);
        editorView.dispatch(tr);
      }
      set({ matchCount: -1, currentMatch: -1 });
      return;
    }

    if (!editorView) return;

    const sq = buildSearchQuery(q, caseSensitive, regexp, replaceText);
    if (!sq.valid) {
      set({ matchCount: 0, currentMatch: -1 });
      return;
    }

    const tr = editorView.state.tr;
    setSearchState(tr, sq);
    editorView.dispatch(tr);

    const count = countMatches(editorView.state);
    const curIdx = count > 0 ? getCurrentMatchIndex(editorView) + 1 : 0;
    set({ matchCount: count, currentMatch: curIdx });
  },

  setReplaceText: (t) => {
    set({ replaceText: t });
    const { editorView, query, caseSensitive, regexp } = get();
    if (!editorView || !query) return;

    const sq = buildSearchQuery(query, caseSensitive, regexp, t);
    if (!sq.valid) return;

    const tr = editorView.state.tr;
    setSearchState(tr, sq);
    editorView.dispatch(tr);
  },

  toggleCaseSensitive: () => {
    const next = !get().caseSensitive;
    set({ caseSensitive: next });
    const { editorView, query, regexp, replaceText } = get();
    if (!editorView || !query) return;

    const sq = buildSearchQuery(query, next, regexp, replaceText);
    if (!sq.valid) { set({ matchCount: 0, currentMatch: -1 }); return; }

    const tr = editorView.state.tr;
    setSearchState(tr, sq);
    editorView.dispatch(tr);

    const count = countMatches(editorView.state);
    const curIdx = count > 0 ? getCurrentMatchIndex(editorView) + 1 : 0;
    set({ matchCount: count, currentMatch: curIdx });
  },

  toggleRegexp: () => {
    const next = !get().regexp;
    set({ regexp: next });
    const { editorView, query, caseSensitive, replaceText } = get();
    if (!editorView || !query) return;

    const sq = buildSearchQuery(query, caseSensitive, next, replaceText);
    if (!sq.valid) { set({ matchCount: 0, currentMatch: -1 }); return; }

    const tr = editorView.state.tr;
    setSearchState(tr, sq);
    editorView.dispatch(tr);

    const count = countMatches(editorView.state);
    const curIdx = count > 0 ? getCurrentMatchIndex(editorView) + 1 : 0;
    set({ matchCount: count, currentMatch: curIdx });
  },

  findNext: () => {
    const { editorView } = get();
    if (!editorView) return;
    pmFindNext(editorView.state, editorView.dispatch);
    const { query, caseSensitive, regexp } = get();
    if (!query) return;
    const sq = buildSearchQuery(query, caseSensitive, regexp);
    if (sq.valid) {
      const curIdx = getCurrentMatchIndex(editorView) + 1;
      set({ currentMatch: curIdx });
    }
  },

  findPrev: () => {
    const { editorView } = get();
    if (!editorView) return;
    pmFindPrev(editorView.state, editorView.dispatch);
    const { query, caseSensitive, regexp } = get();
    if (!query) return;
    const sq = buildSearchQuery(query, caseSensitive, regexp);
    if (sq.valid) {
      const curIdx = getCurrentMatchIndex(editorView) + 1;
      set({ currentMatch: curIdx });
    }
  },

  replaceCurrentMatch: () => {
    const { editorView } = get();
    if (!editorView) return;
    pmReplaceCurrent(editorView.state, editorView.dispatch);
  },

  replaceAllMatches: () => {
    const { editorView } = get();
    if (!editorView) return;
    pmReplaceAll(editorView.state, editorView.dispatch);
    set({ matchCount: 0, currentMatch: -1 });
  },
}));
