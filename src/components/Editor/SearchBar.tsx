import { useEffect, useRef, useCallback } from "react";
import { useSearchStore } from "../../stores/searchStore";
import { t } from "../../lib/i18n";
import "./SearchBar.css";

export default function SearchBar() {
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
        ? t("无结果", "No results")
        : `${currentMatch > 0 ? currentMatch : 0}/${matchCount}`;

  const hasInvalidRegex = regexp && query && matchCount === 0;

  return (
    <div className="moflow-search-bar">
      <div className="moflow-search-row">
        <input
          ref={searchInputRef}
          className={`moflow-search-input${hasInvalidRegex ? " moflow-search-input-invalid" : ""}`}
          type="text"
          value={query}
          onChange={(e) => handleQueryChange(e.target.value)}
          onKeyDown={handleSearchKeyDown}
          placeholder={t("搜索...", "Find...")}
          spellCheck={false}
        />
        <span className="moflow-search-match-count">{matchLabel}</span>
        <button
          className="moflow-search-btn"
          onClick={findPrev}
          title={t("上一个 (Shift+Enter)", "Previous (Shift+Enter)")}
          disabled={matchCount <= 0}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="18 15 12 9 6 15" />
          </svg>
        </button>
        <button
          className="moflow-search-btn"
          onClick={findNext}
          title={t("下一个 (Enter)", "Next (Enter)")}
          disabled={matchCount <= 0}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
        <button
          className={`moflow-search-btn${caseSensitive ? " moflow-search-btn-active" : ""}`}
          onClick={toggleCaseSensitive}
          title={t("区分大小写", "Match Case")}
        >
          Aa
        </button>
        <button
          className={`moflow-search-btn${regexp ? " moflow-search-btn-active" : ""}`}
          onClick={toggleRegexp}
          title={t("正则表达式", "Use Regular Expression")}
        >
          .*
        </button>
        <button
          className="moflow-search-btn moflow-search-close-btn"
          onClick={closeSearch}
          title={t("关闭 (Escape)", "Close (Escape)")}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
      {showReplace && (
        <div className="moflow-search-row">
          <input
            className="moflow-search-input"
            type="text"
            value={replaceText}
            onChange={(e) => setReplaceText(e.target.value)}
            onKeyDown={handleReplaceKeyDown}
            placeholder={t("替换...", "Replace...")}
            spellCheck={false}
          />
          <span className="moflow-search-match-count" />
          <button
            className="moflow-search-btn moflow-search-replace-btn"
            onClick={replaceCurrentMatch}
            disabled={matchCount <= 0}
            title={t("替换当前", "Replace Current")}
          >
            {t("替换", "Replace")}
          </button>
          <button
            className="moflow-search-btn moflow-search-replace-btn"
            onClick={replaceAllMatches}
            disabled={matchCount <= 0}
            title={t("全部替换", "Replace All")}
          >
            {t("全部", "All")}
          </button>
        </div>
      )}
    </div>
  );
}
