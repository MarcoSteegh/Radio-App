import { useState, useEffect, useCallback } from 'react'
import type { Station } from '../types/station'
import { sanitizeStation } from '../utils/stationUtils'

const RECENTLY_PLAYED_KEY = 'world-radio-explorer-recently-played'
const MAX_RECENTLY_PLAYED = 10

export function useRecentlyPlayed() {
  const [recentlyPlayed, setRecentlyPlayed] = useState<Station[]>(() => {
    try {
      const raw = localStorage.getItem(RECENTLY_PLAYED_KEY)
      if (!raw) return []
      const parsed = JSON.parse(raw) as unknown[]
      return parsed
        .map((item) => sanitizeStation(item))
        .filter((s): s is Station => Boolean(s))
        .slice(0, MAX_RECENTLY_PLAYED)
    } catch {
      return []
    }
  })

  useEffect(() => {
    localStorage.setItem(RECENTLY_PLAYED_KEY, JSON.stringify(recentlyPlayed))
  }, [recentlyPlayed])

  const addToRecentlyPlayed = useCallback((station: Station) => {
    setRecentlyPlayed((prev) => {
      const without = prev.filter((s) => s.stationuuid !== station.stationuuid)
      return [station, ...without].slice(0, MAX_RECENTLY_PLAYED)
    })
  }, [])

  return {
    recentlyPlayed,
    addToRecentlyPlayed,
  }
}
