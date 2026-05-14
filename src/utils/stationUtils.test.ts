import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  distanceInKm,
  formatCountdown,
  formatOptions,
  getCountdownTone,
  parseStoredFavorites,
  sanitizeStation,
} from './stationUtils'

const STORAGE_KEY = 'test-favorites'

type LocalStorageMock = {
  getItem: (key: string) => string | null
  setItem: (key: string, value: string) => void
  removeItem: (key: string) => void
  clear: () => void
}

function createLocalStorageMock(): LocalStorageMock {
  const store = new Map<string, string>()

  return {
    getItem(key: string) {
      return store.has(key) ? store.get(key)! : null
    },
    setItem(key: string, value: string) {
      store.set(key, value)
    },
    removeItem(key: string) {
      store.delete(key)
    },
    clear() {
      store.clear()
    },
  }
}

describe('stationUtils', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', createLocalStorageMock())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('sanitizeStation returns null for invalid input', () => {
    expect(sanitizeStation(null)).toBeNull()
    expect(sanitizeStation({})).toBeNull()
    expect(
      sanitizeStation({
        stationuuid: '',
        name: 'Test',
        url_resolved: 'https://stream.example',
      }),
    ).toBeNull()
  })

  it('sanitizeStation normalizes numeric fields and defaults', () => {
    const station = sanitizeStation({
      stationuuid: 'abc123',
      name: 'My Station',
      country: 'Netherlands',
      url_resolved: 'https://stream.example',
      votes: '12',
      clickcount: '21',
      lastcheckok: '1',
      geo_lat: '52.37',
      geo_long: '4.9',
    })

    expect(station).not.toBeNull()
    expect(station?.votes).toBe(12)
    expect(station?.clickcount).toBe(21)
    expect(station?.lastcheckok).toBe(1)
    expect(station?.geo_lat).toBeCloseTo(52.37)
    expect(station?.geo_long).toBeCloseTo(4.9)
  })

  it('parseStoredFavorites accepts array format', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([
        {
          stationuuid: 's1',
          name: 'Station 1',
          country: 'NL',
          url_resolved: 'https://s1.example',
        },
      ]),
    )

    const result = parseStoredFavorites(STORAGE_KEY)
    expect(Object.keys(result)).toEqual(['s1'])
    expect(result.s1.name).toBe('Station 1')
  })

  it('parseStoredFavorites accepts object-map format and filters invalid entries', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        one: {
          stationuuid: 's2',
          name: 'Station 2',
          country: 'BE',
          url_resolved: 'https://s2.example',
        },
        invalid: { foo: 'bar' },
      }),
    )

    const result = parseStoredFavorites(STORAGE_KEY)
    expect(Object.keys(result)).toEqual(['s2'])
  })

  it('formatOptions returns unique sorted values', () => {
    expect(formatOptions(['jazz', 'rock', 'jazz', '', 'pop'])).toEqual([
      'jazz',
      'pop',
      'rock',
    ])
  })

  it('distanceInKm returns near-zero for equal points', () => {
    expect(distanceInKm(52.37, 4.9, 52.37, 4.9)).toBeCloseTo(0, 5)
  })

  it('countdown helpers map time ranges correctly', () => {
    expect(formatCountdown(90_000)).toBe('1m 30s')
    expect(getCountdownTone(30_000)).toBe('countdown-soon')
    expect(getCountdownTone(120_000)).toBe('countdown-mid')
    expect(getCountdownTone(300_000)).toBe('countdown-late')
  })
})
