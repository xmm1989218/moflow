# Tab Switch Performance Optimization Plan

## Trace Analysis Summary

Chrome DevTools trace (`Trace-20260508T161806.json`) shows tab switching blocks the main thread for **3.7–4.0 seconds**. Root cause: **Milkdown editor is destroyed and recreated 37 times** during a single tab switch click.

Key metrics:
- 37 `EditorView` creations (should be 0 — editor should persist across tab switches)
- 2,052 `_initDocument` calls from `@milkdown/crepe` (~55 per recreation)
- 153 `destroy` calls confirming destroy-recreate cycle
- Hundreds of `UpdateLayoutTree` calls (30–57ms each)

## Fix Plan

### Fix 1: Remove activeFileId from ErrorBoundary resetKeys
**File:** `src/App.tsx:241`

```diff
- <ErrorBoundary resetKeys={[activeFileId]}>
+ <ErrorBoundary>
    <Editor />
  </ErrorBoundary>
```

**Why:** `resetKeys={[activeFileId]}` causes ErrorBoundary to reset its error state when tab switches. If the editor previously errored (e.g., the infinite loop bug), the ErrorBoundary would retry mounting, potentially causing repeated destroy-create cycles. Removing this ensures the editor persists across tab switches.

Can also remove the unused `activeFileId` import from App.tsx if it's no longer needed (check other usages).

### Fix 2: Lazy-Tab Architecture (Major Change)
**File:** `src/components/Editor/Editor.tsx`

Instead of a single Milkdown editor that replaces content on tab switch, create a separate editor instance per tab and toggle visibility. This eliminates `replaceAll()` overhead entirely.

**Current architecture:**
```
Editor → MilkdownProvider → MilkdownWrapper (single instance)
  → content changes → replaceAll() → heavy DOM recreation
```

**New architecture:**
```
Editor → renders one MilkdownProvider per tab
  → each has its own MilkdownWrapper with persistent editor
  → tab switch = show/hide divs (no content replacement)
```

**Implementation:**

```tsx
function Editor() {
  const files = useTabStore((s) => s.files);
  const activeFileId = useTabStore((s) => s.activeFileId);
  const settingsTabActive = useThemeStore((s) => s.settingsTabActive);
  const showSettingsTab = useThemeStore((s) => s.showSettingsTab);

  return (
    <div className="relative flex-1 min-h-0">
      {files.map((tab) => (
        <div
          key={tab.id}
          className="absolute inset-0"
          style={{
            visibility: tab.id === activeFileId && !(showSettingsTab && settingsTabActive) ? "visible" : "hidden",
            pointerEvents: tab.id === activeFileId && !(showSettingsTab && settingsTabActive) ? "auto" : "none",
          }}
        >
          <MilkdownProvider>
            <MilkdownWrapper tabId={tab.id} />
          </MilkdownProvider>
        </div>
      ))}
    </div>
  );
}
```

**MilkdownWrapper changes:**
- Accept `tabId` as a prop instead of reading `activeFileId` from store
- Read content/mode from the specific tab: `useTabStore((s) => s.files.find((f) => f.id === tabId))`
- Use `useShallow` for the merged selector
- Remove `replaceAll` logic entirely — each editor owns its tab's content from creation
- `markdownUpdated` writes directly to `updateTabContent(tabId, markdown)`
- `setGetEditorHTML` is called per-tab-editor

**Memory consideration:** Each Milkdown editor instance consumes memory. For users with many tabs (e.g., 10+), this could be significant. Mitigation: destroy editors for tabs that haven't been active for >5 minutes, recreate on next switch (but this adds complexity; start with persistent instances).

### Fix 3: Stabilize setGetEditorHTML
**File:** `src/components/Editor/Editor.tsx`

Currently `setGetEditorHTML(getHTMLFn)` creates a new function on every content sync, triggering unnecessary store updates:

```tsx
// Current (bad):
const getHTMLFn = () => editor.action(getHTML());
setGetEditorHTML(getHTMLFn); // new reference every time

// Fixed: use a stable ref-based function
const getHTMLRef = useRef<(() => string) | null>(null);

useEffect(() => {
  if (loading) return;
  const editor = getEditor();
  if (!editor || editor.status !== EditorStatus.Created) return;
  getHTMLRef.current = () => editor.action(getHTML());
}, [loading, getEditor]);

useEffect(() => {
  setGetEditorHTML(() => getHTMLRef.current);
}, [setGetEditorHTML]);
```

Or even simpler — only call `setGetEditorHTML` once when the editor is first created, not on every content change.

### Fix 4: Merge content/mode selectors with useShallow
**File:** `src/components/Editor/Editor.tsx`

Currently two separate `files.find()` selectors. Merge into one with `useShallow`:

```tsx
import { useShallow } from "zustand/react/shallow";

const { content, mode } = useTabStore(
  useShallow((s) => {
    const tab = s.files.find((f) => f.id === tabId);
    return { content: tab?.content ?? "", mode: tab?.mode ?? "wysiwyg" };
  })
);
```

This runs `files.find()` once instead of twice, and `useShallow` correctly does shallow comparison on the returned object.

### Fix 5: Remove auto-save activeContent selector from App.tsx
**File:** `src/App.tsx:68-71`

```tsx
// Current: subscribes to content changes, causing App re-render on every keystroke
const activeContent = useTabStore((s) => {
  const tab = s.files.find((f) => f.id === s.activeFileId);
  return tab?.content ?? "";
});
```

The `activeContent` is only used as a trigger for the auto-save timer. It causes App to re-render on every keystroke. Replace with a subscription:

```tsx
useEffect(() => {
  if (!autoSave) return;
  const unsub = useTabStore.subscribe((state, prevState) => {
    const tab = state.files.find((f) => f.id === state.activeFileId);
    const prevTab = prevState.files.find((f) => f.id === prevState.activeFileId);
    if (tab?.content !== prevTab?.content && tab?.isModified && tab?.filePath) {
      // trigger auto-save timer
    }
  });
  return unsub;
}, [autoSave]);
```

Or simpler: just use `useTabStore.getState()` inside the effect and use `activeFileId` + `isModified` as the trigger instead of `activeContent`.

## Execution Order

1. Fix 1 (ErrorBoundary resetKeys) — quick, low risk
2. Fix 5 (App.tsx auto-save selector) — quick, removes App re-render on keystroke
3. Fix 2 (Lazy-tab architecture) — major change, most impactful
4. Fix 3 (Stabilize setGetEditorHTML) — done as part of Fix 2
5. Fix 4 (useShallow selectors) — done as part of Fix 2
6. Verify: `bun run lint` + `tsc -b` + `bun run test` + `cargo check`

## Expected Results

- Tab switch from 3.7–4.0s → near-instant (show/hide div)
- No more `replaceAll()` calls during tab switch
- Editor state (scroll position, cursor, undo history) preserved per tab
- App no longer re-renders on every keystroke

## Risks

- **Memory:** Multiple editor instances consume more memory. Monitor with 10+ tabs.
- **MilkdownProvider:** Each tab needs its own `MilkdownProvider`. Verify that multiple instances work correctly (no global state conflicts).
- **SearchBar:** Currently uses a single `editorView` from `useSearchStore`. Needs to switch to the active tab's editor view on tab change.
- **SelectionAIPanel:** Same as SearchBar — needs to work with the active tab's editor.
- **getEditorHTML:** Currently a single store field. With multiple editors, each tab needs its own getter.
