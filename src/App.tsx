import { lazy, Suspense, useEffect, useMemo, useRef, useState, useCallback } from 'react'
import type { ChangeEvent, FormEvent } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import L from 'leaflet'
import 'leaflet.markercluster'
import 'leaflet/dist/leaflet.css'
import 'leaflet.markercluster/dist/MarkerCluster.css'
import 'leaflet.markercluster/dist/MarkerCluster.Default.css'
import { MapContainer, TileLayer, useMap } from 'react-leaflet'
import FlyToStation from './components/FlyToStation'
import OfflineCountdown from './components/OfflineCountdown'
import { useAudio } from './hooks/useAudio'
import { useBluetooth } from './hooks/useBluetooth'
import { useCast } from './hooks/useCast'
import { useFavorites } from './hooks/useFavorites'
import { useGeolocation } from './hooks/useGeolocation'
import { useOfflineStations } from './hooks/useOfflineStations'
import { useRecentlyPlayed } from './hooks/useRecentlyPlayed'
import { useSleepTimer } from './hooks/useSleepTimer'
import { useStations } from './hooks/useStations'
import { useToast } from './hooks/useToast'
import { distanceInKm, sanitizeStation } from './utils/stationUtils'
import type { NearbyStation, Station } from './types/station'
import './App.css'

const AdminSubmissions = lazy(() => import('./components/AdminSubmissions'))
const SubmitStation = lazy(() => import('./components/SubmitStation'))

const DEFAULT_CENTER: [number, number] = [24, 11]
const INITIAL_SEARCH = ''

type EscapeHtml = (input: string) => string

const escapeHtml: EscapeHtml = (input) =>
  input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

function MarkerClusterGroup({ stations, onStationClick }: { stations: Station[]; onStationClick?: (station: Station) => void }) {
  const map = useMap()
  const clusterRef = useRef<L.MarkerClusterGroup | null>(null)
  const callbackRef = useRef(onStationClick)
  useEffect(() => { callbackRef.current = onStationClick })

  useEffect(() => {
    if (clusterRef.current) {
      map.removeLayer(clusterRef.current)
      clusterRef.current = null
    }

    const clusterGroup = L.markerClusterGroup({
      chunkedLoading: true,
      maxClusterRadius: 50,
      spiderfyOnMaxZoom: true,
      showCoverageOnHover: false,
      iconCreateFunction: (cluster) => {
        const count = cluster.getChildCount()
        let sizeClass = 'cluster-sm'
        let size = 36

        if (count > 100) {
          sizeClass = 'cluster-lg'
          size = 52
        } else if (count > 20) {
          sizeClass = 'cluster-md'
          size = 44
        }

        return L.divIcon({
          html: `<div class="cluster-icon ${sizeClass}">${count}</div>`,
          className: '',
          iconSize: L.point(size, size),
        })
      },
    })

    for (const station of stations) {
      if (station.geo_lat === null || station.geo_long === null) continue

      const icon = L.divIcon({
        html: '<div class="station-dot"></div>',
        className: '',
        iconSize: L.point(10, 10),
      })

      const marker = L.marker([station.geo_lat, station.geo_long], { icon })
      const safeName = escapeHtml(station.name)
      const safeCountry = escapeHtml(station.country)
      const safeState = escapeHtml(station.state)
      const popupContent = `<strong>${safeName}</strong><div>${safeCountry}${safeState ? `, ${safeState}` : ''}</div>`
      marker.bindPopup(popupContent)
      marker.bindTooltip(popupContent, { direction: 'top', offset: L.point(0, -8) })
      marker.on('click', () => callbackRef.current?.(station))

      clusterGroup.addLayer(marker)
    }

    map.addLayer(clusterGroup)
    clusterRef.current = clusterGroup

    return () => {
      if (clusterRef.current) {
        map.removeLayer(clusterRef.current)
        clusterRef.current = null
      }
    }
  }, [map, stations])

  return null
}

function readStoredFilters() {
  if (typeof window === 'undefined') return { country: 'all', language: 'all', tag: 'all' }
  const stored = window.localStorage.getItem('radio-filters')
  if (!stored) return { country: 'all', language: 'all', tag: 'all' }
  try {
    const parsed = JSON.parse(stored) as { country?: string; language?: string; tag?: string }
    return { country: parsed.country ?? 'all', language: parsed.language ?? 'all', tag: parsed.tag ?? 'all' }
  } catch {
    return { country: 'all', language: 'all', tag: 'all' }
  }
}

function App() {
  "use no memo"
  const [query, setQuery] = useState(() => {
    if (typeof window === 'undefined') return INITIAL_SEARCH
    return window.localStorage.getItem('radio-search') ?? INITIAL_SEARCH
  })
  const [selectedStation, setSelectedStation] = useState<Station | null>(null)
  const [selectedFlyKey, setSelectedFlyKey] = useState(0)
  const [{ country: countryFilter, language: languageFilter, tag: tagFilter }, setFilters] = useState(readStoredFilters)
  const [showAdmin, setShowAdmin] = useState(false)
  const [showSubmit, setShowSubmit] = useState(false)
  const [isAudioPlaying, setIsAudioPlaying] = useState(false)
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    if (typeof window === 'undefined') return 'dark'
    const stored = window.localStorage.getItem('radio-theme')
    return stored === 'light' ? 'light' : 'dark'
  })

  const searchDebounceTimerRef = useRef<number | null>(null)
  const importInputRef = useRef<HTMLInputElement | null>(null)
  const virtualScrollRef = useRef<HTMLDivElement | null>(null)
  const [recoveryMessage, setRecoveryMessage] = useState<string | null>(null)
  const lastFailedStationRef = useRef<{ uuid: string; name: string } | null>(null)

  const { toast, showToast, dismissToast } = useToast()
  const { stations, mapStations, isLoading, error, listableStations, countryOptions, languageOptions, tagOptions, loadStations } = useStations()
  const [dataStatus, setDataStatus] = useState<'live' | 'fallback'>('live')
  const { favoritesById, favoriteIdSet, favoriteStations, toggleFavorite, importFavorites, updateFavoritesFromStations } = useFavorites()
  const { userLocation, isLocating, locationError, locateUser } = useGeolocation()
  const { bluetoothDeviceName, bluetoothError, isBluetoothConnecting, connectBluetoothDevice } = useBluetooth()
  const { isCastAvailable, isCasting, castDeviceName, castError, isCastLoading, connectGoogleHome, castToStation, refreshCastSession } = useCast(selectedStation)
  const { offlineUntilById, clockTick, activeOfflineCount, offlineStations, markStationOffline, markStationHealthy, resetOfflineStations } = useOfflineStations(stations, favoritesById)
  const { sleepEndsAt, activateSleepTimer } = useSleepTimer(clockTick)
  const { recentlyPlayed, addToRecentlyPlayed } = useRecentlyPlayed()

  const healthyStations = useMemo(
    () =>
      listableStations.filter((station) => {
        const offlineUntil = offlineUntilById[station.stationuuid]
        return !offlineUntil || offlineUntil <= clockTick
      }),
    [clockTick, offlineUntilById, listableStations],
  )

  const matchesActiveFilters = useCallback(
    (station: Station) => {
      const matchesCountry = countryFilter === 'all' || station.country === countryFilter

      const stationLanguages = station.language
        .split(',')
        .map((part) => part.trim())
        .filter(Boolean)
      const matchesLanguage = languageFilter === 'all' || stationLanguages.includes(languageFilter)

      const stationTags = station.tags.toLowerCase()
      const matchesTag = tagFilter === 'all' || stationTags.includes(tagFilter)

      return matchesCountry && matchesLanguage && matchesTag
    },
    [countryFilter, languageFilter, tagFilter],
  )

  const filteredStations = useMemo(
    () => healthyStations.filter(matchesActiveFilters),
    [healthyStations, matchesActiveFilters],
  )

  const filteredRecentlyPlayed = useMemo(
    () => recentlyPlayed.filter(matchesActiveFilters),
    [matchesActiveFilters, recentlyPlayed],
  )

  const nearbyStations = useMemo<NearbyStation[]>(() => {
    if (!userLocation) return []

    return filteredStations
      .map((station) => {
        if (station.geo_lat === null || station.geo_long === null) return null
        return {
          ...station,
          distanceKm: distanceInKm(userLocation.lat, userLocation.lng, station.geo_lat, station.geo_long),
        }
      })
      .filter((station): station is NearbyStation => station !== null)
      .sort((a, b) => a.distanceKm - b.distanceKm)
      .slice(0, 10)
  }, [filteredStations, userLocation])

  const playStationRef = useRef<(station: Station) => void>(() => {})
  const [fallbackMessage, setFallbackMessage] = useState<string | null>(null)

  const onFallbackExhausted = useCallback(() => {
    const message = 'Geen alternatief station beschikbaar.'
    setFallbackMessage(message)
  }, [])

  const onStationOffline = useCallback(
    (station: Station) => {
      const shouldToast = markStationOffline(station)
      lastFailedStationRef.current = { uuid: station.stationuuid, name: station.name }
      setRecoveryMessage(null)
      if (shouldToast) {
        showToast(`${station.name} lijkt offline en wordt tijdelijk verborgen.`, 'error')
      }

      const fallbackStation = filteredStations.find((candidate) => candidate.stationuuid !== station.stationuuid)
      if (fallbackStation) {
        setFallbackMessage(null)
        showToast(`Schakel over naar alternatief: ${fallbackStation.name}`, 'info')
        setSelectedStation(fallbackStation)
        setSelectedFlyKey((k) => k + 1)
        addToRecentlyPlayed(fallbackStation)
        playStationRef.current(fallbackStation)

        if (isCastAvailable && castDeviceName) {
          void castToStation(fallbackStation)
        }
      } else {
        onFallbackExhausted()
      }

      return shouldToast
    },
    [addToRecentlyPlayed, castDeviceName, castToStation, filteredStations, isCastAvailable, markStationOffline, onFallbackExhausted, showToast],
  )

  const onFallbackTriggered = useCallback(
    (from: Station, to: Station) => {
      setFallbackMessage(null)
      showToast(`${from.name} was offline, overstappen naar ${to.name}.`, 'info')
    },
    [showToast],
  )

  const { audioRef, playStation } = useAudio(selectedStation, {
    onStationOffline,
    onFallbackExhausted,
    onFallbackTriggered,
    filteredStations,
    setIsAudioPlaying,
  })

  useEffect(() => {
    playStationRef.current = playStation
  }, [playStation])

  useEffect(() => {
    window.localStorage.setItem('radio-theme', theme)
  }, [theme])

  useEffect(() => {
    window.localStorage.setItem('radio-search', query)
  }, [query])

  useEffect(() => {
    window.localStorage.setItem(
      'radio-filters',
      JSON.stringify({ country: countryFilter, language: languageFilter, tag: tagFilter }),
    )
  }, [countryFilter, languageFilter, tagFilter])

  useEffect(() => {
    if (stations.length > 0 && stations[0]?.stationuuid?.startsWith('fallback-')) {
      setDataStatus('fallback')
      return
    }

    setDataStatus('live')
  }, [stations])

  const updateFavoritesFromStationsRef = useRef(updateFavoritesFromStations)
  useEffect(() => {
    updateFavoritesFromStationsRef.current = updateFavoritesFromStations
  }, [updateFavoritesFromStations])

  useEffect(() => {
    updateFavoritesFromStationsRef.current(stations)
  }, [stations])

  useEffect(() => {
    if (selectedStation || stations.length === 0) return

    const initialStation = stations[0]
    if (!initialStation) return

    setSelectedStation(initialStation)
    setSelectedFlyKey((k) => k + 1)
    addToRecentlyPlayed(initialStation)
    playStation(initialStation)

    if (isCastAvailable && castDeviceName) {
      void castToStation(initialStation)
    }
  }, [addToRecentlyPlayed, castDeviceName, castToStation, isCastAvailable, playStation, selectedStation, stations])

  const onSelectStation = useCallback(
    (station: Station) => {
      const isDifferentStation = selectedStation?.stationuuid !== station.stationuuid
      const hasCoordinates = station.geo_lat !== null && station.geo_long !== null

      setSelectedStation(station)
      if (isDifferentStation && hasCoordinates) {
        setSelectedFlyKey((k) => k + 1)
      } else if (isDifferentStation && !hasCoordinates) {
        const message = `Kan ${station.name} niet op de kaart centreren: locatie ontbreekt.`
        setFallbackMessage(null)
        showToast(message, 'info')
      }
      const wasFailed = lastFailedStationRef.current?.uuid === station.stationuuid
      lastFailedStationRef.current = null

      if (wasFailed) {
        const nextMessage = `Stream werkt weer voor ${station.name}.`
        setRecoveryMessage(nextMessage)
        showToast(nextMessage, 'success')
      } else {
        setRecoveryMessage(null)
      }
      addToRecentlyPlayed(station)
      playStation(station)

      if (isCastAvailable && castDeviceName) {
        void castToStation(station)
      }
    },
    [addToRecentlyPlayed, castDeviceName, castToStation, isCastAvailable, playStation, selectedStation, showToast],
  )

  const onSearch = useCallback(
    (event: FormEvent) => {
      event.preventDefault()
      if (searchDebounceTimerRef.current !== null) {
        window.clearTimeout(searchDebounceTimerRef.current)
      }
      void loadStations(query.trim())
    },
    [query, loadStations],
  )

  const onQueryChange = useCallback(
    (nextValue: string) => {
      setQuery(nextValue)
      if (searchDebounceTimerRef.current !== null) {
        window.clearTimeout(searchDebounceTimerRef.current)
      }
      searchDebounceTimerRef.current = window.setTimeout(() => {
        void loadStations(nextValue.trim())
      }, 450)
    },
    [loadStations],
  )

  useEffect(() => {
    return () => {
      if (searchDebounceTimerRef.current !== null) {
        window.clearTimeout(searchDebounceTimerRef.current)
      }
    }
  }, [])

  const resetFilters = useCallback(() => {
    setFilters({ country: 'all', language: 'all', tag: 'all' })
  }, [])

  const clearSearch = useCallback(() => {
    setQuery(INITIAL_SEARCH)
    void loadStations(INITIAL_SEARCH)
  }, [loadStations])

  const restoreOfflineStation = useCallback(
    (stationId: string) => {
      const station = stations.find((s) => s.stationuuid === stationId) ?? Object.values(favoritesById).find((s) => s.stationuuid === stationId)
      if (station) {
        markStationHealthy(station)
        const wasFailed = lastFailedStationRef.current?.uuid === station.stationuuid
        if (wasFailed) {
          const nextMessage = `Stream werkt weer voor ${station.name}.`
          setRecoveryMessage(nextMessage)
          showToast(nextMessage, 'success')
          lastFailedStationRef.current = null
        }
        setSelectedStation(station)
        setSelectedFlyKey((k) => k + 1)
        playStation(station)
        if (isCastAvailable && castDeviceName) {
          void castToStation(station)
        }
      }
    },
    [stations, favoritesById, markStationHealthy, isCastAvailable, castDeviceName, castToStation, playStation, showToast],
  )

  const handleConnectGoogleHome = useCallback(() => {
    void connectGoogleHome(showToast)
  }, [connectGoogleHome, showToast])

  const handleRefreshCastSession = useCallback(() => {
    refreshCastSession(showToast)
  }, [refreshCastSession, showToast])

  const exportFavorites = useCallback(() => {
    const exportItems = Object.values(favoritesById)
    if (exportItems.length === 0) {
      showToast('Er zijn nog geen favorieten om te exporteren.', 'info')
      return
    }

    const blob = new Blob([JSON.stringify(exportItems, null, 2)], { type: 'application/json' })
    const objectUrl = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = objectUrl
    anchor.download = 'radio-favorieten.json'
    anchor.click()
    URL.revokeObjectURL(objectUrl)
    showToast(`${exportItems.length} favorieten geëxporteerd.`, 'success')
  }, [favoritesById, showToast])

  const triggerImport = useCallback(() => {
    importInputRef.current?.click()
  }, [])

  const onImportFavorites = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const selectedFile = event.target.files?.[0]
      event.target.value = ''
      if (!selectedFile) return

      try {
        const text = await selectedFile.text()
        const parsed = JSON.parse(text) as unknown
        if (!Array.isArray(parsed)) throw new Error('Ongeldig JSON formaat')

        const importedStations = parsed
          .map((item) => sanitizeStation(item))
          .filter((item): item is Station => Boolean(item))

        importFavorites(importedStations)
        showToast(`${importedStations.length} favorieten geïmporteerd.`, 'success')
      } catch {
        showToast('Import mislukt. Gebruik een geldig favorieten JSON-bestand.', 'error')
      }
    },
    [importFavorites, showToast],
  )

  const virtualizer = useVirtualizer({
    count: filteredStations.length,
    getScrollElement: () => virtualScrollRef.current,
    estimateSize: () => 52,
    overscan: 10,
  })

  const handleSleepTimer = useCallback(
    (minutes: number) => {
      activateSleepTimer(minutes, audioRef, showToast)
    },
    [activateSleepTimer, audioRef, showToast],
  )

  return (
    <main className="app-shell" data-theme={theme}>
      <header className="app-header">
        <div className="brand-panel">
          <div className="brand-top-row">
            <div>
              <p className="eyebrow">Marco Steegh</p>
              <h1>World Radio Explorer</h1>
              <p className="subtitle">Ontdek radiostations op de kaart en luister direct live.</p>
            </div>
            <button type="button" className="theme-toggle" onClick={() => setTheme((current) => (current === 'dark' ? 'light' : 'dark'))}>
              {theme === 'dark' ? '☀️ Licht' : '🌙 Donker'}
            </button>
          </div>
        </div>
        <form className="search search-panel" onSubmit={onSearch}>
          <label htmlFor="station-search">Zoek station, genre of stad</label>
          <div className="search-row search-row-main">
            <input
              id="station-search"
              value={query}
              onChange={(event) => onQueryChange(event.target.value)}
              placeholder="bijv. funk, amsterdam, news"
              aria-describedby="search-help"
            />
            <button type="submit" disabled={isLoading}>
              {isLoading ? 'Laden...' : 'Zoeken'}
            </button>
            {query ? (
              <button type="button" className="secondary-btn" onClick={clearSearch}>
                Wis
              </button>
            ) : null}
          </div>
          <p id="search-help" className="helper subtle">
            Zoekopdracht en filters worden opgeslagen in je browser.
          </p>
          <div className="toolbar-row">
            <div className="toolbar-group">
              <button type="button" className="secondary-btn" disabled={isLocating} onClick={locateUser}>
                {isLocating ? 'Locatie...' : 'Mijn locatie'}
              </button>
              <button type="button" className="secondary-btn" disabled={isBluetoothConnecting} onClick={() => void connectBluetoothDevice()}>
                {isBluetoothConnecting ? 'Bluetooth...' : 'Bluetooth'}
              </button>
              <button type="button" className="secondary-btn" disabled={isCasting} onClick={handleConnectGoogleHome}>
                {isCasting ? 'Google Home...' : 'Google Home'}
              </button>
              {castError && castDeviceName === null ? (
                <button type="button" className="secondary-btn" disabled={isCastLoading} onClick={handleRefreshCastSession}>
                  {isCastLoading ? 'Vernieuwen...' : 'Cast'}
                </button>
              ) : null}
            </div>
            <div className="toolbar-group">
              <button type="button" className="secondary-btn" onClick={() => setShowSubmit(true)}>
                Station toevoegen
              </button>
              <button type="button" className="secondary-btn" onClick={() => setShowAdmin((v) => !v)}>
                {showAdmin ? 'Sluit admin' : 'Admin'}
              </button>
            </div>
          </div>
          <div className="filter-actions">
            <button type="button" className="secondary-btn" onClick={resetFilters}>
              Reset filters
            </button>
            <button type="button" className="secondary-btn" onClick={resetOfflineStations}>
              Check offline opnieuw
            </button>
          </div>
          <div className="status-stack">
            {locationError ? <p className="helper error-text">{locationError}</p> : null}
            {userLocation ? (
              <p className="helper">
                Locatie actief: {userLocation.lat.toFixed(2)}, {userLocation.lng.toFixed(2)}
              </p>
            ) : null}
            {bluetoothDeviceName ? <p className="helper">Bluetooth gekoppeld: {bluetoothDeviceName}</p> : null}
            {bluetoothError ? <p className="helper error-text">{bluetoothError}</p> : null}
            {castDeviceName ? <p className="helper">Google Home gekoppeld: {castDeviceName}</p> : null}
            {castError ? <p className="helper error-text">{castError}</p> : null}
            {isCastLoading && !isCastAvailable ? <p className="helper">Google Cast initialiseert...</p> : null}
            {activeOfflineCount > 0 ? (
              <p className="helper">{activeOfflineCount} stations tijdelijk verborgen wegens streamfouten.</p>
            ) : null}
            <p className={`helper ${dataStatus === 'fallback' ? 'error-text' : ''}`}>
              {dataStatus === 'fallback' ? 'Gebruik lokale fallback-data vanwege API-problemen.' : 'Live data actief.'}
            </p>
          </div>
          <div className="filter-grid">
            <label>
              Land
              <select value={countryFilter} onChange={(event) => setFilters((f) => ({ ...f, country: event.target.value }))}>
                <option value="all">Alle landen</option>
                {countryOptions.map((country) => (
                  <option key={country} value={country}>{country}</option>
                ))}
              </select>
            </label>
            <label>
              Taal
              <select value={languageFilter} onChange={(event) => setFilters((f) => ({ ...f, language: event.target.value }))}>
                <option value="all">Alle talen</option>
                {languageOptions.map((language) => (
                  <option key={language} value={language}>{language}</option>
                ))}
              </select>
            </label>
            <label>
              Tag
              <select value={tagFilter} onChange={(event) => setFilters((f) => ({ ...f, tag: event.target.value }))}>
                <option value="all">Alle tags</option>
                {tagOptions.map((tag) => (
                  <option key={tag} value={tag}>{tag}</option>
                ))}
              </select>
            </label>
          </div>
        </form>
      </header>

      <section className="content-grid">
        <div className="map-wrap">
          <MapContainer
            center={DEFAULT_CENTER}
            zoom={2}
            minZoom={2}
            maxZoom={10}
            scrollWheelZoom
            className="map"
            worldCopyJump
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <MarkerClusterGroup stations={mapStations} onStationClick={onSelectStation} />
            <FlyToStation
              latitude={selectedStation?.geo_lat ?? null}
              longitude={selectedStation?.geo_long ?? null}
              requestKey={selectedFlyKey}
            />
          </MapContainer>
        </div>

        <aside className="panel">
          {error && <p className="error">{error}</p>}

          {toast ? (
            <div className={`toast toast-${toast.tone}`} role="status" aria-live="polite">
              <span>{toast.text}</span>
              <button type="button" className="toast-close" onClick={dismissToast} aria-label="Sluit melding">
                x
              </button>
            </div>
          ) : null}

          {fallbackMessage ? (
            <p className="helper error-text" role="status">
              {fallbackMessage}
            </p>
          ) : null}

          {recoveryMessage ? (
            <p className="helper success-text" role="status">
              {recoveryMessage}
            </p>
          ) : null}

          <div className="favorites-tools">
            <button type="button" className="mini-action" onClick={exportFavorites}>
              Export
            </button>
            <button type="button" className="mini-action" onClick={triggerImport}>
              Import
            </button>
            <input ref={importInputRef} className="hidden-input" type="file" accept="application/json" onChange={onImportFavorites} />
          </div>

          {!error && selectedStation ? (
            <>
              <div className="now-playing">
                <p className="eyebrow">Now playing</p>
                <h2>{selectedStation.name}</h2>
                <p>
                  {selectedStation.country}
                  {selectedStation.state ? `, ${selectedStation.state}` : ''}
                </p>
                <p className="meta">
                  {selectedStation.language || 'Onbekende taal'} · {selectedStation.tags || 'Algemeen'}
                </p>
                <div className="station-actions-row">
                  <button type="button" className="fav-toggle" onClick={() => toggleFavorite(selectedStation)}>
                    {favoriteIdSet.has(selectedStation.stationuuid) ? 'Verwijder favoriet' : 'Voeg toe aan favorieten'}
                  </button>
                </div>
              </div>

              <audio
                ref={audioRef}
                key={selectedStation.stationuuid}
                controls
                autoPlay
                preload="none"
                src={selectedStation.url_resolved}
                aria-label={selectedStation.name}
                onError={() => onStationOffline(selectedStation)}
                onCanPlay={() => {
                  markStationHealthy(selectedStation)
                  const failed = lastFailedStationRef.current
                  if (failed) {
                    const nextMessage = `Stream werkt weer voor ${failed.name}.`
                    setRecoveryMessage(nextMessage)
                    showToast(nextMessage, 'success')
                    lastFailedStationRef.current = null
                  }
                }}
                onPlay={() => setIsAudioPlaying(true)}
                onPause={() => setIsAudioPlaying(false)}
              >
                Je browser ondersteunt geen audio streaming.
              </audio>

              {isAudioPlaying && (
                <div className="sleep-timer-row">
                  <div className="sleep-presets">
                    <span className="sleep-label">Sleep timer:</span>
                    {[15, 30, 45, 60].map((minutes) => (
                      <button
                        key={minutes}
                        type="button"
                        className="mini-action"
                        onClick={() => handleSleepTimer(minutes)}
                      >
                        {minutes}m
                      </button>
                    ))}
                    {sleepEndsAt && (
                      <button
                        type="button"
                        className="mini-action"
                        onClick={() => handleSleepTimer(0)}
                      >
                        Stop
                      </button>
                    )}
                  </div>
                  {sleepEndsAt && (
                    <p className="sleep-label">
                      Slaap timer actief tot {new Date(sleepEndsAt).toLocaleTimeString()}
                    </p>
                  )}
                </div>
              )}

              {filteredRecentlyPlayed.length > 0 && (
                <section className="station-section">
                  <h3>Recent gespeeld</h3>
                  {filteredRecentlyPlayed.map((station) => (
                    <div className="station-row" key={`recent-${station.stationuuid}`}>
                      <button
                        type="button"
                        className={station.stationuuid === selectedStation?.stationuuid ? 'station active' : 'station'}
                        onClick={() => onSelectStation(station)}
                      >
                        <span className="station-marker" aria-hidden="true" />
                        <span className="station-text">
                          <span className="station-title">{station.name}</span>
                          <small>{station.country}</small>
                        </span>
                      </button>
                      <button
                        type="button"
                        className="mini-action"
                        onClick={() => toggleFavorite(station)}
                        aria-label={favoriteIdSet.has(station.stationuuid) ? `Verwijder favoriet van ${station.name}` : `Voeg ${station.name} toe aan favorieten`}
                      >
                        {favoriteIdSet.has(station.stationuuid) ? '★' : '☆'}
                      </button>
                    </div>
                  ))}
                </section>
              )}
            </>
          ) : null}

          <div className="station-list">
            {isLoading ? (
              <section className="station-section" aria-label="Stations laden">
                <h3>Resultaten laden...</h3>
                {Array.from({ length: 6 }).map((_, index) => (
                  <div className="skeleton-row" key={`skeleton-${index}`}>
                    <div className="skeleton-line skeleton-title"></div>
                    <div className="skeleton-line skeleton-subtitle"></div>
                  </div>
                ))}
              </section>
            ) : null}

            {!isLoading && filteredStations.length === 0 ? (
              <section className="empty-state" role="status" aria-live="polite">
                <h3>Geen resultaten met deze filters</h3>
                <p>Probeer een andere zoekterm, verander de filters of wis de zoekopdracht om meer stations te zien.</p>
                <div className="empty-state-actions">
                  <button type="button" className="secondary-btn" onClick={resetFilters}>
                    Reset filters
                  </button>
                  {query ? (
                    <button type="button" className="secondary-btn" onClick={clearSearch}>
                      Wis zoekopdracht
                    </button>
                  ) : null}
                </div>
              </section>
            ) : null}

            {offlineStations.length > 0 ? (
              <section className="station-section">
                <h3>Tijdelijk offline ({offlineStations.length})</h3>
                {offlineStations.map((item) => (
                  <div className="station-row" key={`offline-${item.station.stationuuid}`}>
                    <button type="button" className="station" onClick={() => onSelectStation(item.station)}>
                      <span className="station-marker" aria-hidden="true" />
                      <span className="station-text">
                        <span className="station-title">{item.station.name}</span>
                        <small>
                          {item.station.country} · opnieuw over{' '}
                          <OfflineCountdown offlineUntil={item.offlineUntil} onExpire={() => restoreOfflineStation(item.station.stationuuid)} />
                        </small>
                      </span>
                    </button>
                    <button type="button" className="mini-action" onClick={() => restoreOfflineStation(item.station.stationuuid)} aria-label={`Herstel ${item.station.name}`}>
                      ↺
                    </button>
                  </div>
                ))}
              </section>
            ) : null}

            {favoriteStations.length > 0 ? (
              <section className="station-section">
                <h3>Favorieten ({favoriteStations.length})</h3>
                {favoriteStations.map((station) => (
                  <div className="station-row" key={`fav-${station.stationuuid}`}>
                    <button
                      type="button"
                      className={station.stationuuid === selectedStation?.stationuuid ? 'station active' : 'station'}
                      onClick={() => onSelectStation(station)}
                    >
                      <span className="station-marker" aria-hidden="true" />
                      <span className="station-text">
                        <span className="station-title">{station.name}</span>
                        <small>{station.country}</small>
                      </span>
                    </button>
                    <button
                      type="button"
                      className="mini-action"
                      onClick={() => toggleFavorite(station)}
                      aria-label={favoriteIdSet.has(station.stationuuid) ? `Verwijder favoriet van ${station.name}` : `Voeg ${station.name} toe aan favorieten`}
                    >
                      ★
                    </button>
                  </div>
                ))}
              </section>
            ) : null}

            {!isLoading && nearbyStations.length > 0 ? (
              <section className="station-section">
                <h3>Dichtbij ({nearbyStations.length})</h3>
                {nearbyStations.map((station) => (
                  <div className="station-row" key={`near-${station.stationuuid}`}>
                    <button
                      type="button"
                      className={station.stationuuid === selectedStation?.stationuuid ? 'station active' : 'station'}
                      onClick={() => onSelectStation(station)}
                    >
                      <span className="station-marker" aria-hidden="true" />
                      <span className="station-text">
                        <span className="station-title">{station.name}</span>
                        <small>
                          {station.country} · {station.distanceKm.toFixed(0)} km
                        </small>
                      </span>
                    </button>
                    <button
                      type="button"
                      className="mini-action"
                      onClick={() => toggleFavorite(station)}
                      aria-label={favoriteIdSet.has(station.stationuuid) ? `Verwijder favoriet van ${station.name}` : `Voeg ${station.name} toe aan favorieten`}
                    >
                      {favoriteIdSet.has(station.stationuuid) ? '★' : '☆'}
                    </button>
                  </div>
                ))}
              </section>
            ) : null}

            {!isLoading ? (
              <section className="station-section">
                <h3>Topresultaten ({filteredStations.length})</h3>
                <div ref={virtualScrollRef} className="virtual-list-scroll">
                  <div style={{ height: `${virtualizer.getTotalSize()}px`, position: 'relative' }}>
                    {virtualizer.getVirtualItems().map((virtualRow) => {
                      const station = filteredStations[virtualRow.index]
                      return (
                        <div
                          key={station.stationuuid}
                          className="station-row"
                          style={{
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            width: '100%',
                            height: `${virtualRow.size}px`,
                            transform: `translateY(${virtualRow.start}px)`,
                          }}
                        >
                          <button
                            type="button"
                            className={station.stationuuid === selectedStation?.stationuuid ? 'station active' : 'station'}
                            onClick={() => onSelectStation(station)}
                          >
                            <span className="station-marker" aria-hidden="true" />
                            <span className="station-text">
                              <span className="station-title">{station.name}</span>
                              <small>
                                {station.country} · {station.clickcount} plays
                              </small>
                            </span>
                          </button>
                          <button
                            type="button"
                            className="mini-action"
                            onClick={() => toggleFavorite(station)}
                            aria-label={favoriteIdSet.has(station.stationuuid) ? `Verwijder favoriet van ${station.name}` : `Voeg ${station.name} toe aan favorieten`}
                          >
                            {favoriteIdSet.has(station.stationuuid) ? '★' : '☆'}
                          </button>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </section>
            ) : null}
          </div>
        </aside>
      </section>

      {showSubmit && (
        <Suspense fallback={<div className="submit-overlay"><div className="submit-panel">Laden...</div></div>}>
          <SubmitStation onClose={() => setShowSubmit(false)} />
        </Suspense>
      )}

      {showAdmin && (
        <Suspense fallback={<div className="submit-overlay"><div className="submit-panel">Laden...</div></div>}>
          <AdminSubmissions onClose={() => setShowAdmin(false)} />
        </Suspense>
      )}
    </main>
  )
}

export default App
