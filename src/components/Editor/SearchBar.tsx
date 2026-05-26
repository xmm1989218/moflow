import { useEffect, useRef, useCallback } from "react";
import { useSearchStore } from "../../stores/searchStore";
import { t } from "../../i18n/core";
import { useT } from "../../i18n/useT";
import { ChevronUp, ChevronDown, X } from "lucide-react";

export default function SearchBar() {
  useT();
  const visible = useSearchStore((s) => s.visible);
  const showReplace = useSearchStore((s) => s.showReplace);
  const query = useSearchStore((s) => s.query);
  const replaceText = useSearchStore((s) => s.replaceText);
  const caseSensitive = useSearchStore((s) => s.caseSensitive);
  const regexp = useSearchStore((s) => s.regexp);
  const matchCount = useSearchStore((s) => s.matchCount);
  const currentMatch = useSearchStore((s) => s.currentMatch);

  const setQuery = useSearchStore((s) => s.setQuery);
  const setReplaceText = useSearchStore((s) => s.setReplaceText);
  const toggleCaseSensitive = useSearchStore((s) => s.toggleCaseSensitive);
  const toggleRegexp = useSearchStore((s) => s.toggleRegexp);
  const findNext = useSearchStore((s) => s.findNext);
  const findPrev = useSearchStore((s) => s.findPrev);
  const replaceCurrentMatch = useSearchStore((s) => s.replaceCurrentMatch);
  const replaceAllMatches = useSearchStore((s) => s.replaceAllMatches);
  const closeSearch = useSearchStore((s) => s.closeSearch);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (visible) {
      setTimeout(() => searchInputRef.current?.focus(), 50);
    }
  }, [visible]);

  const handleQueryChange = useCallback(
    (value: string) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        setQuery(value);
      }, 200);
      useSearchStore.setState({ query: value });
    },
    [setQuery]
  );

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const handleSearchKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (e.shiftKey) {
        findPrev();
      } else {
        findNext();
      }
    } else if (e.key === "Escape") {
      closeSearch();
    }
  };

  const handleReplaceKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      closeSearch();
    }
  };

  if (!visible) return null;

  const matchLabel =
    matchCount < 0
      ? ""
      : matchCount === 0
        ? t("editor.search.noResults")
        : `${currentMatch > 0 ? currentMatch : 0}/${matchCount}`;

  const hasInvalidRegex = regexp && query && matchCount === 0;

  return (
    <div className="absolute top-2 right-3 z-40 flex flex-col gap-1 bg-moflow-bg border border-moflow-border rounded-lg shadow-search p-1.5 animate-search-appear">
      <div className="flex items-center gap-[3px]">
        <input
          ref={searchInputRef}
          className={`w-[200px] py-1 px-2 border rounded text-[13px] font-inherit bg-moflow-bg text-moflow-text outline-none focus:border-moflow-accent placeholder:text-moflow-text-secondary${hasInvalidRegex ? " border-[#ef4444]" : " border-moflow-border"}`}
          type="text"
          value={query}
          onChange={(e) => handleQueryChange(e.target.value)}
          onKeyDown={handleSearchKeyDown}
          placeholder={t("editor.search.placeholder")}
          spellCheck={false}
        />
        <span className="min-w-[48px] text-center text-[11px] text-moflow-text-secondary whitespace-nowrap shrink-0">{matchLabel}</span>
        <button
          className="flex items-center justify-center min-w-6 h-6 px-1 border-none rounded bg-transparent text-moflow-text-secondary cursor-pointer text-[11px] font-semibold font-inherit shrink-0 transition-[background-color,color] duration-100 hover:not-disabled:bg-moflow-bg-secondary hover:not-disabled:text-moflow-text disabled:opacity-35 disabled:cursor-not-allowed"
          onClick={findPrev}
          title={t("editor.search.previous")}
          disabled={matchCount <= 0}
        >
          <ChevronUp size={12} />
        </button>
        <button
          className="flex items-center justify-center min-w-6 h-6 px-1 border-none rounded bg-transparent text-moflow-text-secondary cursor-pointer text-[11px] font-semibold font-inherit shrink-0 transition-[background-color,color] duration-100 hover:not-disabled:bg-moflow-bg-secondary hover:not-disabled:text-moflow-text disabled:opacity-35 disabled:cursor-not-allowed"
          onClick={findNext}
          title={t("editor.search.next")}
          disabled={matchCount <= 0}
        >
          <ChevronDown size={12} />
        </button>
        <button
          className={`flex items-center justify-center min-w-6 h-6 px-1 border-none rounded cursor-pointer text-[11px] font-semibold font-inherit shrink-0 transition-[background-color,color] duration-100 ${caseSensitive ? "bg-moflow-accent text-white hover:not-disabled:opacity-85" : "bg-transparent text-moflow-text-secondary hover:not-disabled:bg-moflow-bg-secondary hover:not-disabled:text-moflow-text"}`}
          onClick={toggleCaseSensitive}
          title={t("editor.search.matchCase")}
        >
          Aa
        </button>
        <button
          className={`flex items-center justify-center min-w-6 h-6 px-1 border-none rounded cursor-pointer text-[11px] font-semibold font-inherit shrink-0 transition-[background-color,color] duration-100 ${regexp ? "bg-moflow-accent text-white hover:not-disabled:opacity-85" : "bg-transparent text-moflow-text-secondary hover:not-disabled:bg-moflow-bg-secondary hover:not-disabled:text-moflow-text"}`}
          onClick={toggleRegexp}
          title={t("editor.search.regexp")}
        >
          .*
        </button>
        <button
          className="flex items-center justify-center min-w-6 h-6 px-1 border-none rounded bg-transparent text-moflow-text-secondary cursor-pointer text-[11px] font-semibold font-inherit shrink-0 transition-[background-color,color] duration-100 hover:bg-moflow-bg-secondary hover:text-moflow-text ml-0.5"
          onClick={closeSearch}
          title={t("editor.search.close")}
        >
          <X size={14} />
        </button>
      </div>
      {showReplace && (
        <div className="flex items-center gap-[3px]">
          <input
            className="w-[200px] py-1 px-2 border border-moflow-border rounded text-[13px] font-inherit bg-moflow-bg text-moflow-text outline-none focus:border-moflow-accent placeholder:text-moflow-text-secondary"
            type="text"
            value={replaceText}
            onChange={(e) => setReplaceText(e.target.value)}
            onKeyDown={handleReplaceKeyDown}
            placeholder={t("editor.search.replacePlaceholder")}
            spellCheck={false}
          />
          <span className="min-w-[48px]" />
          <button
            className="flex items-center justify-center h-6 px-1.5 border-none rounded bg-transparent text-moflow-text-secondary cursor-pointer text-[11px] font-medium font-inherit shrink-0 transition-[background-color,color] duration-100 hover:not-disabled:bg-moflow-bg-secondary hover:not-disabled:text-moflow-text disabled:opacity-35 disabled:cursor-not-allowed"
            onClick={replaceCurrentMatch}
            disabled={matchCount <= 0}
            title={t("editor.search.replaceCurrent")}
          >
            {t("editor.search.replace")}
          </button>
          <button
            className="flex items-center justify-center h-6 px-1.5 border-none rounded bg-transparent text-moflow-text-secondary cursor-pointer text-[11px] font-medium font-inherit shrink-0 transition-[background-color,color] duration-100 hover:not-disabled:bg-moflow-bg-secondary hover:not-disabled:text-moflow-text disabled:opacity-35 disabled:cursor-not-allowed"
            onClick={replaceAllMatches}
            disabled={matchCount <= 0}
            title={t("editor.search.replaceAll")}
          >
            {t("editor.search.all")}
          </button>
        </div>
      )}
    </div>
  );
}
