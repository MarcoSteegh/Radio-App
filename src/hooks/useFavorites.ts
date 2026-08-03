import { useState, useEffect, useCallback, useMemo } from 'react'
import type { Station } from '../types/station'

const FAVORITES_KEY = 'world-radio-explorer-favorites'

function parseStoredFavorites(): Record<string, Station> {
  try {
    const raw = localStorage.getItem(FAVORITES_KEY)
    if (!raw) return {}

    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) {
      const result: Record<string, Station> = {}
      for (const item of parsed) {
        if (item && typeof item === 'object' && 'stationuuid' in item) {
          const station = item as Station
          if (station.stationuuid) {
            result[station.stationuuid] = station
          }
        }
      }
      return result
    }

    if (typeof parsed === 'object' && parsed !== null) {
      return parsed as Record<string, Station>
    }
  } catch {
    // ignore
  }
  return {}
}

export function useFavorites() {
  const [favoritesById, setFavoritesById] = useState<Record<string, Station>>(
    () => parseStoredFavorites(),
  )

  useEffect(() => {
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(Object.values(favoritesById)))
  }, [favoritesById])

  const toggleFavorite = useCallback((station: Station) => {
    setFavoritesById((previous) => {
      if (previous[station.stationuuid]) {
        const remaining = { ...previous }
        delete remaining[station.stationuuid]
        return remaining
      }

      return {
        ...previous,
        [station.stationuuid]: station,
      }
    })
  }, [])

  const importFavorites = useCallback((importedStations: Station[]) => {
    setFavoritesById((previous) => {
      const merged = { ...previous }
      for (const station of importedStations) {
        merged[station.stationuuid] = station
      }
      return merged
    })
  }, [])

  const updateFavoritesFromStations = useCallback((stations: Station[]) => {
    setFavoritesById((previous) => {
      if (Object.keys(previous).length === 0) {
        return previous
      }

      const updated = { ...previous }
      for (const station of stations) {
        if (updated[station.stationuuid]) {
          updated[station.stationuuid] = station
        }
      }

      return updated
    })
  }, [])

  const favoriteIdSet = useMemo(() => new Set(Object.keys(favoritesById)), [favoritesById])
  const favoriteStations = useMemo(() => Object.values(favoritesById), [favoritesById])

  return {
    favoritesById,
    favoriteIdSet,
    favoriteStations,
    toggleFavorite,
    importFavorites,
    updateFavoritesFromStations,
  }
}
