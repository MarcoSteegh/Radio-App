import { useState, useEffect, useCallback, useMemo } from 'react'
import type { Station } from '../types/station'

const STATION_RECHECK_MS = 5 * 60 * 1000

export function useOfflineStations(stations: Station[], favoritesById: Record<string, Station> = {}) {
  const [offlineUntilById, setOfflineUntilById] = useState<Record<string, number>>({})
  const [clockTick, setClockTick] = useState(0)

  useEffect(() => {
    const startupTickId = window.setTimeout(() => {
      setClockTick(Date.now())
    }, 0)

    const timerId = window.setInterval(() => {
      setClockTick(Date.now())

      setOfflineUntilById((previous) => {
        let changed = false
        const updated: Record<string, number> = {}

        for (const [stationId, offlineUntil] of Object.entries(previous)) {
          if (offlineUntil > Date.now()) {
            updated[stationId] = offlineUntil
          } else {
            changed = true
          }
        }

        return changed ? updated : previous
      })
    }, 30000)

    return () => {
      window.clearTimeout(startupTickId)
      window.clearInterval(timerId)
    }
  }, [])

  const markStationOffline = useCallback((station: Station) => {
    let shouldShowToast = false

    setOfflineUntilById((previous) => {
      const currentUntil = previous[station.stationuuid]
      const now = Date.now()

      if (currentUntil && currentUntil > now) {
        return previous
      }

      shouldShowToast = true

      return {
        ...previous,
        [station.stationuuid]: now + STATION_RECHECK_MS,
      }
    })

    return shouldShowToast
  }, [])

  const markStationHealthy = useCallback((station: Station) => {
    setOfflineUntilById((previous) => {
      if (!previous[station.stationuuid]) {
        return previous
      }

      const updated = { ...previous }
      delete updated[station.stationuuid]
      return updated
    })
  }, [])

  const resetOfflineStations = useCallback(() => {
    setOfflineUntilById({})
  }, [])

  const activeOfflineCount = useMemo(
    () =>
      Object.values(offlineUntilById).filter((offlineUntil) => offlineUntil > clockTick)
        .length,
    [clockTick, offlineUntilById],
  )

  const offlineStations = useMemo(() => {
    const stationsById = new Map<string, Station>()

    for (const station of stations) {
      stationsById.set(station.stationuuid, station)
    }

    for (const station of Object.values(favoritesById)) {
      if (!stationsById.has(station.stationuuid)) {
        stationsById.set(station.stationuuid, station)
      }
    }

    return Object.entries(offlineUntilById)
      .map(([stationId, offlineUntil]) => {
        const station = stationsById.get(stationId)
        if (!station || offlineUntil <= clockTick) {
          return null
        }

        return {
          station,
          msRemaining: offlineUntil - clockTick,
          offlineUntil,
        }
      })
      .filter(
        (item): item is {
          station: Station
          msRemaining: number
          offlineUntil: number
        } => Boolean(item),
      )
      .sort((a, b) => a.msRemaining - b.msRemaining)
  }, [clockTick, offlineUntilById, stations, favoritesById])

  return {
    offlineUntilById,
    clockTick,
    activeOfflineCount,
    offlineStations,
    markStationOffline,
    markStationHealthy,
    resetOfflineStations,
  }
}
