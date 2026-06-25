import '@testing-library/jest-dom/vitest'

import { vi } from 'vitest'

vi.mock('@tauri-apps/api/core', () => ({
  invoke: () => Promise.resolve(null),
  convertFileSrc: (path: string) => `https://asset.localhost/${path}`,
  isTauri: () => false,
}))

vi.mock('@tauri-apps/api/path', () => ({
  appDataDir: () => Promise.resolve('/tmp/mock-appdata'),
  join: (...paths: string[]) => Promise.resolve(paths.join('/')),
  dirname: (p: string) => Promise.resolve(p.split('/').slice(0, -1).join('/')),
  sep: '/',
}))

vi.mock('@tauri-apps/plugin-fs', () => ({
  readFile: () => Promise.resolve(new Uint8Array(0)),
  writeFile: () => Promise.resolve(undefined),
  exists: () => Promise.resolve(false),
  remove: () => Promise.resolve(undefined),
  mkdir: () => Promise.resolve(undefined),
  rename: () => Promise.resolve(undefined),
  readDir: () => Promise.resolve([]),
}))
