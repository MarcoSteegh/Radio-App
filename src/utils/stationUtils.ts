import type { Station } from '../types/station'

export function isStation(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object') {
    return false
  }

  return true
}

export function toNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') {
    return null
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  if (typeof value === 'string') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }

  return null
}

export function toNumberWithDefault(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  if (typeof value === 'string') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : fallback
  }

  return fallback
}

export function sanitizeStation(value: unknown): Station | null {
  if (!isStation(value)) {
    return null
  }

  const stationuuid = value.stationuuid
  const name = value.name
  const urlResolved = value.url_resolved

  if (
    typeof stationuuid !== 'string' ||
    !stationuuid ||
    typeof name !== 'string' ||
    !name ||
    typeof urlResolved !== 'string' ||
    !urlResolved
  ) {
    return null
  }

  return {
    stationuuid,
    name,
    country: typeof value.country === 'string' ? value.country : 'Unknown',
    state: typeof value.state === 'string' ? value.state : '',
    favicon: typeof value.favicon === 'string' ? value.favicon : '',
    url_resolved: urlResolved,
    language: typeof value.language === 'string' ? value.language : '',
    tags: typeof value.tags === 'string' ? value.tags : '',
    votes: toNumberWithDefault(value.votes, 0),
    clickcount: toNumberWithDefault(value.clickcount, 0),
    lastcheckok: toNumberWithDefault(value.lastcheckok, 1),
    geo_lat: toNullableNumber(value.geo_lat),
    geo_long: toNullableNumber(value.geo_long),
  }
}

export function dedupeStationsByUuid(stations: Station[]): Station[] {
  return Array.from(new Map(stations.map((station) => [station.stationuuid, station])).values())
}

export function parseStoredFavorites(storageKey: string): Record<string, Station> {
  try {
    const stored = localStorage.getItem(storageKey)
    if (!stored) {
      return {}
    }

    const parsed = JSON.parse(stored) as unknown
    const stations: Station[] = []

    if (Array.isArray(parsed)) {
      for (const item of parsed) {
        const sanitized = sanitizeStation(item)
        if (sanitized) {
          stations.push(sanitized)
        }
      }
    } else if (parsed && typeof parsed === 'object') {
      for (const item of Object.values(parsed)) {
        const sanitized = sanitizeStation(item)
        if (sanitized) {
          stations.push(sanitized)
        }
      }
    }

    return stations.reduce<Record<string, Station>>((accumulator, station) => {
      accumulator[station.stationuuid] = station
      return accumulator
    }, {})
  } catch {
    return {}
  }
}

export function formatOptions(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean))).sort((a, b) =>
    a.localeCompare(b),
  )
}

export function findFallbackStation(failed: Station, candidates: Station[]): Station | null {
  const available = candidates.filter((s) => s.stationuuid !== failed.stationuuid)
  if (available.length === 0) return null

  const failedTags = new Set(failed.tags.toLowerCase().split(',').map((t) => t.trim()).filter(Boolean))
  let bestScore = -1
  let best = available[0]

  for (const candidate of available) {
    let score = 0
    if (failedTags.size > 0) {
      for (const tag of candidate.tags.toLowerCase().split(',').map((t) => t.trim()).filter(Boolean)) {
        if (failedTags.has(tag)) score += 2
      }
    }
    if (candidate.country === failed.country) score += 1
    if (score > bestScore) { bestScore = score; best = candidate }
  }

  return best
}

export function distanceInKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const toRad = (value: number) => (value * Math.PI) / 180
  const earthRadiusKm = 6371
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2)

  return earthRadiusKm * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)))
}

export function formatCountdown(msRemaining: number): string {
  const totalSeconds = Math.max(0, Math.ceil(msRemaining / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}m ${seconds.toString().padStart(2, '0')}s`
}

export function getCountdownTone(msRemaining: number):
  | 'countdown-soon'
  | 'countdown-mid'
  | 'countdown-late' {
  if (msRemaining <= 60_000) {
    return 'countdown-soon'
  }

  if (msRemaining <= 180_000) {
    return 'countdown-mid'
  }

  return 'countdown-late'
}
