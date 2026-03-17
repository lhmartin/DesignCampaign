/// <reference types="vitest/globals" />
import '@testing-library/jest-dom'

// electronAPI is undefined in tests — matches the browser FSA code path
Object.defineProperty(window, 'electronAPI', { value: undefined, writable: true })

// Vitest 4.x jsdom doesn't always expose a working localStorage.
// Provide a reliable in-memory implementation so Zustand's persist middleware works.
const _lsStore = new Map<string, string>()
const localStorageMock: Storage = {
  getItem:    (key)        => _lsStore.get(key) ?? null,
  setItem:    (key, value) => { _lsStore.set(key, String(value)) },
  removeItem: (key)        => { _lsStore.delete(key) },
  clear:      ()           => { _lsStore.clear() },
  get length()             { return _lsStore.size },
  key:        (i)          => [..._lsStore.keys()][i] ?? null,
}
Object.defineProperty(window, 'localStorage', { value: localStorageMock, writable: true })

// Clear localStorage before each test to prevent filter-store persist bleed-through
beforeEach(() => {
  _lsStore.clear()
})
