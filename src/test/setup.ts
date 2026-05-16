import '@testing-library/jest-dom/vitest'

const mockTauriInternals = {
  invoke: () => Promise.resolve(null),
  convertFileSrc: (path: string) => `https://asset.localhost/${path}`,
};

(globalThis as Record<string, unknown>).__TAURI_INTERNALS__ = mockTauriInternals;
