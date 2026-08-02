import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, beforeEach, vi } from 'vitest'

class MemoryStorage implements Storage {
  private store = new Map<string, string>()

  get length() {
    return this.store.size
  }

  clear() {
    this.store.clear()
  }

  getItem(key: string) {
    return this.store.has(key) ? this.store.get(key)! : null
  }

  key(index: number) {
    return Array.from(this.store.keys())[index] ?? null
  }

  removeItem(key: string) {
    this.store.delete(key)
  }

  setItem(key: string, value: string) {
    this.store.set(key, value)
  }
}

const storage = new MemoryStorage()

if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: storage,
  })
}

Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: storage,
})

vi.stubGlobal('localStorage', storage)

beforeEach(() => {
  storage.clear()
})

afterEach(() => {
  cleanup()
  storage.clear()
  vi.unstubAllGlobals()
})
