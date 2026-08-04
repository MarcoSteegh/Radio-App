import { lazy, Suspense, useEffect, useMemo, useRef, useState, useCallback, startTransition } from 'react'
import type { ChangeEvent, FormEvent } from 'react'
import FilterPanel from './components/FilterPanel'
import MapSection from './components/MapSection'
import PlayerSection from './components/PlayerSection'
import StationList from './components/StationList'
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
import { useI18n } from './lib/useI18n'
import { distanceInKm, findFallbackStation, sanitizeStation } from './utils/stationUtils'
import type { NearbyStation, Station } from './types/station'
import './App.css'

const AdminSubmissions = lazy(() => import('./components/AdminSubmissions'))
const SubmitStation = lazy(() => import('./components/SubmitStation'))

const INITIAL_SEARCH = ''

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
  const { locale, setLocale, t } = useI18n()
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
    if (stored === 'light' || stored === 'dark') return stored
    return window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
  })
  const [recoveryMessage, setRecoveryMessage] = useState<string | null>(null)
  const [fallbackMessage, setFallbackMessage] = useState<string | null>(null)

  const searchDebounceTimerRef = useRef<number | null>(null)
  const importInputRef = useRef<HTMLInputElement | null>(null)
  const lastFailedStationRef = useRef<{ uuid: string; name: string } | null>(null)
  const playStationRef = useRef<(station: Station) => void>(() => {})
  const hasAutoSelectedRef = useRef(false)

  const { toast, showToast, dismissToast } = useToast()
  const { stations, mapStations, isLoading, error, listableStations, countryOptions, languageOptions, tagOptions, loadStations } = useStations()
  const { favoritesById, favoriteIdSet, favoriteStations, toggleFavorite, importFavorites, updateFavoritesFromStations } = useFavorites()
  const { userLocation, isLocating, locationError, locateUser } = useGeolocation()
  const { bluetoothDeviceName, bluetoothError, isBluetoothConnecting, connectBluetoothDevice } = useBluetooth()
  const { isCastAvailable, isCasting, castDeviceName, castError, isCastLoading, connectGoogleHome, castToStation, refreshCastSession, setCastVolume, castPause, castPlay } = useCast(selectedStation)
  const { offlineUntilById, clockTick, activeOfflineCount, offlineStations, markStationOffline, markStationHealthy, resetOfflineStations } = useOfflineStations(stations, favoritesById)
  const { sleepEndsAt, activateSleepTimer } = useSleepTimer(clockTick)
  const { recentlyPlayed, addToRecentlyPlayed } = useRecentlyPlayed()

  // -- Derived state --------------------------------------------------------

  const dataStatus = useMemo<'live' | 'fallback'>(
    () => (stations[0]?.stationuuid?.startsWith('fallback-') ? 'fallback' : 'live'),
    [stations],
  )

  const healthyStations = useMemo(
    () => listableStations.filter((s) => {
      const offlineUntil = offlineUntilById[s.stationuuid]
      return !offlineUntil || offlineUntil <= clockTick
    }),
    [clockTick, offlineUntilById, listableStations],
  )

  const matchesActiveFilters = useCallback(
    (station: Station) => {
      if (countryFilter !== 'all' && station.country !== countryFilter) return false
      const langs = station.language.split(',').map((p) => p.trim()).filter(Boolean)
      if (languageFilter !== 'all' && !langs.includes(languageFilter)) return false
      if (tagFilter !== 'all' && !station.tags.toLowerCase().includes(tagFilter)) return false
      return true
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
      .map((s) => {
        if (s.geo_lat === null || s.geo_long === null) return null
        return { ...s, distanceKm: distanceInKm(userLocation.lat, userLocation.lng, s.geo_lat, s.geo_long) }
      })
      .filter((s): s is NearbyStation => s !== null)
      .sort((a, b) => a.distanceKm - b.distanceKm)
      .slice(0, 10)
  }, [filteredStations, userLocation])

  // -- Callbacks ------------------------------------------------------------

  const onFallbackExhausted = useCallback(() => {
    setFallbackMessage(t('error.noFallback'))
  }, [t])

  const onStationOffline = useCallback(
    (station: Station) => {
      const shouldToast = markStationOffline(station)
      lastFailedStationRef.current = { uuid: station.stationuuid, name: station.name }
      setRecoveryMessage(null)
      if (shouldToast) showToast(`${station.name} ${t('error.offline')}`, 'error')

      const fallback = findFallbackStation(station, filteredStations)
      if (fallback) {
        setFallbackMessage(null)
        showToast(`${t('error.fallback')} ${fallback.name}`, 'info')
        setSelectedStation(fallback)
        setSelectedFlyKey((k) => k + 1)
        addToRecentlyPlayed(fallback)
        playStationRef.current(fallback)
        if (isCastAvailable && castDeviceName) void castToStation(fallback)
      } else {
        onFallbackExhausted()
      }
      return shouldToast
    },
    [addToRecentlyPlayed, castDeviceName, castToStation, filteredStations, isCastAvailable, markStationOffline, onFallbackExhausted, showToast, t],
  )

  const onFallbackTriggered = useCallback(
    (from: Station, to: Station) => {
      setFallbackMessage(null)
      showToast(`${from.name} was offline, overstappen naar ${to.name}.`, 'info')
    },
    [showToast],
  )

  const { audioRef, volume, setVolume: setLocalVolume, playStation, onAudioPlaying, onAudioPauseLike, onAudioError, ensureAudioContext } = useAudio(selectedStation, {
    onStationOffline,
    onFallbackExhausted,
    onFallbackTriggered,
    filteredStations,
    setIsAudioPlaying,
  })

  const setVolume = useCallback((v: number) => {
    setLocalVolume(v)
    setCastVolume(v)
  }, [setLocalVolume, setCastVolume])

  useEffect(() => { playStationRef.current = playStation }, [playStation])

  const onAudioCanPlay = useCallback(() => {
    if (!selectedStation) return
    markStationHealthy(selectedStation)
    const failed = lastFailedStationRef.current
    if (failed) {
      const msg = `${t('error.recovery')} ${failed.name}.`
      setRecoveryMessage(msg)
      showToast(msg, 'success')
      lastFailedStationRef.current = null
    }
  }, [markStationHealthy, selectedStation, showToast, t])

  const onSelectStation = useCallback(
    (station: Station) => {
      const isDifferentStation = selectedStation?.stationuuid !== station.stationuuid
      const hasCoordinates = station.geo_lat !== null && station.geo_long !== null

      setSelectedStation(station)
      if (hasCoordinates) {
        setSelectedFlyKey((k) => k + 1)
      } else if (isDifferentStation) {
        setFallbackMessage(null)
        showToast(t('error.noLocation', { name: station.name }), 'info')
      }

      const wasFailed = lastFailedStationRef.current?.uuid === station.stationuuid
      lastFailedStationRef.current = null
      if (wasFailed) {
        const msg = `${t('error.recovery')} ${station.name}.`
        setRecoveryMessage(msg)
        showToast(msg, 'success')
      } else {
        setRecoveryMessage(null)
      }

      addToRecentlyPlayed(station)
      playStation(station)
      if (isCastAvailable && castDeviceName) void castToStation(station)
    },
    [addToRecentlyPlayed, castDeviceName, castToStation, isCastAvailable, playStation, selectedStation, showToast, t],
  )

  const onSearch = useCallback(
    (event: FormEvent) => {
      event.preventDefault()
      if (searchDebounceTimerRef.current !== null) window.clearTimeout(searchDebounceTimerRef.current)
      void loadStations(query.trim())
    },
    [query, loadStations],
  )

  const onQueryChange = useCallback(
    (nextValue: string) => {
      setQuery(nextValue)
      if (searchDebounceTimerRef.current !== null) window.clearTimeout(searchDebounceTimerRef.current)
      searchDebounceTimerRef.current = window.setTimeout(() => void loadStations(nextValue.trim()), 450)
    },
    [loadStations],
  )

  const resetFilters = useCallback(() => {
    setFilters({ country: 'all', language: 'all', tag: 'all' })
  }, [])

  const clearSearch = useCallback(() => {
    setQuery(INITIAL_SEARCH)
    void loadStations(INITIAL_SEARCH)
  }, [loadStations])

  const restoreOfflineStation = useCallback(
    (stationId: string) => {
      const station =
        stations.find((s) => s.stationuuid === stationId) ??
        Object.values(favoritesById).find((s) => s.stationuuid === stationId)
      if (!station) return
      markStationHealthy(station)
      const wasFailed = lastFailedStationRef.current?.uuid === station.stationuuid
      if (wasFailed) {
        const msg = `${t('error.recovery')} ${station.name}.`
        setRecoveryMessage(msg)
        showToast(msg, 'success')
        lastFailedStationRef.current = null
      }
      setSelectedStation(station)
      setSelectedFlyKey((k) => k + 1)
      playStation(station)
      if (isCastAvailable && castDeviceName) void castToStation(station)
    },
    [castDeviceName, castToStation, favoritesById, isCastAvailable, markStationHealthy, playStation, showToast, stations, t],
  )

  const exportFavorites = useCallback(() => {
    const items = Object.values(favoritesById)
    if (items.length === 0) { showToast(t('player.noFavorites'), 'info'); return }
    const blob = new Blob([JSON.stringify(items, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = 'radio-favorieten.json'
    anchor.click()
    URL.revokeObjectURL(url)
    showToast(t('player.exportSuccess', { count: String(items.length) }), 'success')
  }, [favoritesById, showToast, t])

  const triggerImport = useCallback(() => { importInputRef.current?.click() }, [])

  const onImportFavorites = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0]
      event.target.value = ''
      if (!file) return
      try {
        const parsed = JSON.parse(await file.text()) as unknown
        if (!Array.isArray(parsed)) throw new Error(t('player.importFormatError'))
        const imported = parsed.map((item) => sanitizeStation(item)).filter((s): s is Station => Boolean(s))
        importFavorites(imported)
    showToast(t('player.importSuccess', { count: String(imported.length) }), 'success')
      } catch {
        showToast(t('player.importError'), 'error')
      }
    },
    [importFavorites, showToast, t],
  )

  const handleSleepTimer = useCallback(
    (minutes: number) => { activateSleepTimer(minutes, audioRef, showToast) },
    [activateSleepTimer, audioRef, showToast],
  )

  // -- Effects --------------------------------------------------------------

  useEffect(() => { window.localStorage.setItem('radio-theme', theme) }, [theme])
  useEffect(() => { window.localStorage.setItem('radio-search', query) }, [query])
  useEffect(() => {
    window.localStorage.setItem('radio-filters', JSON.stringify({ country: countryFilter, language: languageFilter, tag: tagFilter }))
  }, [countryFilter, languageFilter, tagFilter])

  const updateFavoritesRef = useRef(updateFavoritesFromStations)
  useEffect(() => { updateFavoritesRef.current = updateFavoritesFromStations }, [updateFavoritesFromStations])
  useEffect(() => { updateFavoritesRef.current(stations) }, [stations])

  useEffect(() => {
    if (hasAutoSelectedRef.current || stations.length === 0) return
    const initial = stations[0]
    if (!initial) return
    hasAutoSelectedRef.current = true
    // Initial auto-selection: startTransition moves setState out of the synchronous effect body
    startTransition(() => {
      setSelectedStation(initial)
      setSelectedFlyKey((k) => k + 1)
      addToRecentlyPlayed(initial)
    })
    playStation(initial)
    if (isCastAvailable && castDeviceName) void castToStation(initial)
  }, [addToRecentlyPlayed, castDeviceName, castToStation, isCastAvailable, playStation, stations])

  useEffect(() => {
    return () => {
      if (searchDebounceTimerRef.current !== null) window.clearTimeout(searchDebounceTimerRef.current)
    }
  }, [])

  useEffect(() => {
    return () => {
      const audio = audioRef.current
      if (audio) { audio.pause(); audio.removeAttribute('src'); audio.load() }
    }
  }, [audioRef])

  // -- Render ---------------------------------------------------------------

  return (
    <main className="app-shell" data-theme={theme}>
      <a href="#station-list" className="skip-link">
        Ga naar stationlijst
      </a>

      <header className="app-header" role="banner">
        <FilterPanel
          query={query}
          isLoading={isLoading}
          theme={theme}
          countryFilter={countryFilter}
          languageFilter={languageFilter}
          tagFilter={tagFilter}
          countryOptions={countryOptions}
          languageOptions={languageOptions}
          tagOptions={tagOptions}
          isLocating={isLocating}
          isBluetoothConnecting={isBluetoothConnecting}
          isCasting={isCasting}
          isCastLoading={isCastLoading}
          isCastAvailable={isCastAvailable}
          castError={castError}
          castDeviceName={castDeviceName}
          locationError={locationError}
          userLocation={userLocation}
          bluetoothDeviceName={bluetoothDeviceName}
          bluetoothError={bluetoothError}
          activeOfflineCount={activeOfflineCount}
          dataStatus={dataStatus}
          showAdmin={showAdmin}
          onSearch={onSearch}
          onQueryChange={onQueryChange}
          onClearSearch={clearSearch}
          onResetFilters={resetFilters}
          onResetOfflineStations={resetOfflineStations}
          onLocateUser={locateUser}
          onConnectBluetooth={() => void connectBluetoothDevice()}
          onConnectGoogleHome={() => void connectGoogleHome(showToast)}
          onRefreshCastSession={() => refreshCastSession(showToast)}
          onShowSubmit={() => setShowSubmit(true)}
          onToggleAdmin={() => setShowAdmin((v) => !v)}
          onToggleTheme={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
          onFilterChange={(patch) => setFilters((f) => ({ ...f, ...patch }))}
          locale={locale}
          onLocaleChange={setLocale}
        />
      </header>

      <section className="content-grid" role="main" aria-label="Kaart en stations">
        <div className="map-wrap">
          <MapSection
            mapStations={mapStations}
            selectedStation={selectedStation}
            selectedFlyKey={selectedFlyKey}
            onStationClick={onSelectStation}
          />
        </div>

        <aside className="panel">
          <PlayerSection
            selectedStation={selectedStation}
            audioRef={audioRef}
            isAudioPlaying={isAudioPlaying}
            volume={volume}
            onVolumeChange={setVolume}
            sleepEndsAt={sleepEndsAt}
            favoriteIdSet={favoriteIdSet}
            filteredRecentlyPlayed={filteredRecentlyPlayed}
            fallbackMessage={fallbackMessage}
            recoveryMessage={recoveryMessage}
            error={error}
            toast={toast}
            importInputRef={importInputRef}
            onToggleFavorite={toggleFavorite}
            onSelectStation={onSelectStation}
            onCanPlay={onAudioCanPlay}
            onPlaying={onAudioPlaying}
            onPause={onAudioPauseLike}
            onError={onAudioError}
            onEnsureAudioContext={ensureAudioContext}
            onSetIsAudioPlaying={setIsAudioPlaying}
            onCastPause={castPause}
            onCastPlay={castPlay}
            onSleepTimer={handleSleepTimer}
            onDismissToast={dismissToast}
            onExportFavorites={exportFavorites}
            onTriggerImport={triggerImport}
            onImportFavorites={onImportFavorites}
          />
          <StationList
            isLoading={isLoading}
            filteredStations={filteredStations}
            offlineStations={offlineStations}
            favoriteStations={favoriteStations}
            nearbyStations={nearbyStations}
            selectedStation={selectedStation}
            favoriteIdSet={favoriteIdSet}
            query={query}
            onSelectStation={onSelectStation}
            onToggleFavorite={toggleFavorite}
            onRestoreOfflineStation={restoreOfflineStation}
            onResetFilters={resetFilters}
            onClearSearch={clearSearch}
          />
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
