import '@testing-library/jest-dom/vitest'

const mockInvoke = () => Promise.resolve(null);
const mockConvertFileSrc = (path: string) => `https://asset.localhost/${path}`;

if (typeof globalThis.window !== 'undefined') {
  globalThis.window.__TAURI_INTERNALS__ = {
    invoke: mockInvoke,
    convertFileSrc: mockConvertFileSrc,
  };
}
