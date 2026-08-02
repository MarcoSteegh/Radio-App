import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import type { LoadOptions, Station } from '../types/station'
import { ApiError, fetchStations, fetchGeoStations, getApiErrorUserMessage } from '../lib/apiClient'
import { fetchStationsDirect, fetchGeoStationsDirect } from '../lib/directRadioBrowser'
import { trackEvent } from '../lib/observability'
import { sanitizeStation, dedupeStationsByUuid, formatOptions } from '../utils/stationUtils'

const HEALTH_REFRESH_MS = 3 * 60 * 1000
const PROBE_TIMEOUT_MS = 2500

let serverAvailable: boolean | null = null
let probePromise: Promise<boolean> | null = null

function probeServer(): Promise<boolean> {
  if (serverAvailable !== null) {
    return Promise.resolve(serverAvailable)
  }

  if (probePromise) {
    return probePromise
  }

  const API_BASE_URL = import.meta.env.VITE_API_BASE_URL as string
  if (!API_BASE_URL) {
    serverAvailable = false
    return Promise.resolve(false)
  }

  probePromise = (async () => {
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS)
      const response = await fetch(`${API_BASE_URL}/health`, {
        signal: controller.signal,
        credentials: 'same-origin',
      })
      clearTimeout(timeoutId)
      serverAvailable = response.ok
    } catch {
      serverAvailable = false
    }
    return serverAvailable
  })()

  return probePromise
}

async function tryFetchStations(params: {
  term: string
  offset: number
  limit: number
  signal?: AbortSignal
}): Promise<Station[]> {
  const available = await probeServer()

  if (!available) {
    return fetchStationsDirect(params)
  }

  try {
    return await fetchStations(params)
  } catch (err) {
    if (err instanceof ApiError && (err.status === 0 || err.code === 'API_NETWORK_UNAVAILABLE' || err.code === 'API_TIMEOUT')) {
      serverAvailable = false
      return fetchStationsDirect(params)
    }
    throw err
  }
}

async function tryFetchGeoStations(params: {
  offset: number
  limit: number
  signal?: AbortSignal
}): Promise<Station[]> {
  const available = await probeServer()

  if (!available) {
    return fetchGeoStationsDirect(params)
  }

  try {
    return await fetchGeoStations(params)
  } catch (err) {
    if (err instanceof ApiError && (err.status === 0 || err.code === 'API_NETWORK_UNAVAILABLE' || err.code === 'API_TIMEOUT')) {
      serverAvailable = false
      return fetchGeoStationsDirect(params)
    }
    throw err
  }
}

export function useStations() {
  const [stations, setStations] = useState<Station[]>([])
  const [mapStations, setMapStations] = useState<Station[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastLoadedTerm, setLastLoadedTerm] = useState('')
  const [isMapStationsLoading, setIsMapStationsLoading] = useState(false)

  const activeRequestIdRef = useRef(0)
  const activeControllerRef = useRef<AbortController | null>(null)
  const isLoadingRef = useRef(false)
  const urlStationIdRef = useRef<string | null>(
    new URLSearchParams(window.location.search).get('station'),
  )

  useEffect(() => {
    isLoadingRef.current = isLoading
  }, [isLoading])

  const loadStations = useCallback(async (term: string, options: LoadOptions = {}) => {
    const { silent = false } = options

    if (silent && isLoadingRef.current) {
      return
    }

    const cleanTerm = term.trim()
    const requestId = ++activeRequestIdRef.current
    setLastLoadedTerm(cleanTerm)

    activeControllerRef.current?.abort()
    const controller = new AbortController()
    activeControllerRef.current = controller

    if (!silent) {
      setIsLoading(true)
      setError(null)
    }

    try {
      let allData: Station[]

      if (cleanTerm) {
        allData = await tryFetchStations({
          term: cleanTerm,
          offset: 0,
          limit: 1000,
          signal: controller.signal,
        })
      } else {
        const [p1, p2, p3] = await Promise.all([
          tryFetchStations({ term: '', offset: 0, limit: 1000, signal: controller.signal }),
          tryFetchStations({ term: '', offset: 1000, limit: 1000, signal: controller.signal }),
          tryFetchStations({ term: '', offset: 2000, limit: 1000, signal: controller.signal }),
        ])
        allData = [...p1, ...p2, ...p3]
      }

      const cleaned = allData
        .map((station) => sanitizeStation(station))
        .filter((station): station is Station => Boolean(station))
      const uniqueCleaned = dedupeStationsByUuid(cleaned)

      if (requestId !== activeRequestIdRef.current) {
        return
      }

      setStations(uniqueCleaned)
      if (urlStationIdRef.current) {
        urlStationIdRef.current = null
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        return
      }

      if (requestId !== activeRequestIdRef.current) {
        return
      }

      if (!silent) {
        setError(getApiErrorUserMessage(err, 'station_search'))
        setStations([])
      }

      if (err instanceof ApiError) {
        trackEvent('station_load_failed', {
          term: cleanTerm,
          status: err.status,
          code: err.code ?? '',
          silent,
        })
      }
    } finally {
      if (!silent && requestId === activeRequestIdRef.current) {
        setIsLoading(false)
      }
    }
  }, [])

  useEffect(() => {
    return () => {
      activeControllerRef.current?.abort()
    }
  }, [])

  useEffect(() => {
    const startupTimerId = window.setTimeout(() => {
      void loadStations('')
    }, 0)

    return () => {
      window.clearTimeout(startupTimerId)
    }
  }, [loadStations])

  useEffect(() => {
    const timerId = window.setInterval(() => {
      void loadStations(lastLoadedTerm, { silent: true })
    }, HEALTH_REFRESH_MS)

    return () => {
      window.clearInterval(timerId)
    }
  }, [lastLoadedTerm, loadStations])

  useEffect(() => {
    let isMounted = true

    const loadGeoStations = async () => {
      setIsMapStationsLoading(true)

      try {
        const batchSize = 1000
        let offset = 0
        const seenStationIds = new Set<string>()

        setMapStations([])

        while (isMounted) {
          const batch = await tryFetchGeoStations({ offset, limit: batchSize })

          if (!isMounted) return

          if (!Array.isArray(batch) || batch.length === 0) {
            if (isMounted) setIsMapStationsLoading(false)
            return
          }

          const parsed = batch
            .map((station) => sanitizeStation(station))
            .filter((station): station is Station => Boolean(station))

          const freshStations: Station[] = []
          for (const station of parsed) {
            if (seenStationIds.has(station.stationuuid)) continue
            seenStationIds.add(station.stationuuid)
            freshStations.push(station)
          }

          if (freshStations.length > 0) {
            setMapStations((previous) => previous.concat(freshStations))
          }

          if (batch.length < batchSize) {
            if (isMounted) setIsMapStationsLoading(false)
            return
          }

          offset += batchSize
        }
      } catch (err) {
        if (err instanceof ApiError) {
          trackEvent('map_geo_load_failed', { status: err.status, code: err.code ?? '' })
        }
      } finally {
        if (isMounted) setIsMapStationsLoading(false)
      }
    }

    void loadGeoStations()
    return () => { isMounted = false }
  }, [])

  const listableStations = useMemo(
    () => stations.filter((station) => station.url_resolved && station.lastcheckok !== 0),
    [stations],
  )

  const countryOptions = useMemo(
    () => formatOptions(listableStations.map((station) => station.country)),
    [listableStations],
  )

  const languageOptions = useMemo(
    () => formatOptions(
      listableStations.flatMap((station) =>
        station.language.split(',').map((part) => part.trim()).filter(Boolean),
      ),
    ),
    [listableStations],
  )

  const tagOptions = useMemo(
    () => formatOptions(
      listableStations.flatMap((station) =>
        station.tags.split(',').map((part) => part.trim().toLowerCase()).filter(Boolean),
      ),
    ).slice(0, 40),
    [listableStations],
  )

  return {
    stations,
    mapStations,
    isLoading,
    error,
    lastLoadedTerm,
    isMapStationsLoading,
    listableStations,
    countryOptions,
    languageOptions,
    tagOptions,
    loadStations,
    setStations,
    urlStationIdRef,
  }
}
