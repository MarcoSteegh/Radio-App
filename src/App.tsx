import { useEffect, useMemo, useRef, useState } from 'react'
import type { ChangeEvent, FormEvent } from 'react'
import { CircleMarker, MapContainer, Popup, TileLayer } from 'react-leaflet'
import FlyToStation from './components/FlyToStation'
import OfflineCountdown from './components/OfflineCountdown'
import type { LoadOptions, NearbyStation, Station, Toast } from './types/station'
import {
  distanceInKm,
  formatOptions,
  parseStoredFavorites,
  sanitizeStation,
} from './utils/stationUtils'
import './App.css'

const API_BASE = 'https://de1.api.radio-browser.info/json'
const DEFAULT_CENTER: [number, number] = [24, 11]
const INITIAL_SEARCH = ''
const FAVORITES_KEY = 'world-radio-explorer-favorites'
const STATION_RECHECK_MS = 5 * 60 * 1000
const HEALTH_REFRESH_MS = 3 * 60 * 1000
const GLOBAL_STATION_LIMIT = 2500
const SEARCH_STATION_LIMIT = 500
const CAST_SENDER_URL =
  'https://www.gstatic.com/cv/js/sender/v1/cast_sender.js?loadCastFramework=1'

type CastSessionLike = {
  getCastDevice?: () => {
    friendlyName?: string
  }
  loadMedia?: (request: unknown) => Promise<unknown>
}

type CastContextLike = {
  setOptions: (options: {
    receiverApplicationId: string
    autoJoinPolicy: string
  }) => void
  requestSession: () => Promise<unknown>
  getCurrentSession: () => CastSessionLike | null
}

type CastFrameworkLike = {
  CastContext: {
    getInstance: () => CastContextLike
  }
  AutoJoinPolicy: {
    ORIGIN_SCOPED: string
  }
}

type ChromeCastLike = {
  __onGCastApiAvailable?: (isAvailable: boolean) => void
  cast?: {
    framework?: CastFrameworkLike
  }
  chrome?: {
    cast?: {
      media?: {
        DEFAULT_MEDIA_RECEIVER_APP_ID?: string
        StreamType?: {
          LIVE?: string
        }
        MetadataType?: {
          GENERIC?: number
        }
        MediaInfo?: new (contentId: string, contentType: string) => {
          streamType?: string
          metadata?: {
            metadataType?: number
            title?: string
            subtitle?: string
            images?: Array<{ url: string }>
          }
        }
        GenericMediaMetadata?: new () => {
          metadataType?: number
          title?: string
          subtitle?: string
          images?: Array<{ url: string }>
        }
        LoadRequest?: new (mediaInfo: {
          streamType?: string
          metadata?: {
            metadataType?: number
            title?: string
            subtitle?: string
            images?: Array<{ url: string }>
          }
        }) => {
          autoplay?: boolean
          currentTime?: number
        }
      }
    }
  }
}

function App() {
  const [stations, setStations] = useState<Station[]>([])
  const [selectedStation, setSelectedStation] = useState<Station | null>(null)
  const [query, setQuery] = useState(INITIAL_SEARCH)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [favoritesById, setFavoritesById] = useState<Record<string, Station>>(
    () => parseStoredFavorites(FAVORITES_KEY),
  )
  const [userLocation, setUserLocation] = useState<{
    lat: number
    lng: number
  } | null>(null)
  const [isLocating, setIsLocating] = useState(false)
  const [locationError, setLocationError] = useState<string | null>(null)
  const [isBluetoothConnecting, setIsBluetoothConnecting] = useState(false)
  const [bluetoothDeviceName, setBluetoothDeviceName] = useState<string | null>(null)
  const [bluetoothError, setBluetoothError] = useState<string | null>(null)
  const [isCastAvailable, setIsCastAvailable] = useState(false)
  const [isCasting, setIsCasting] = useState(false)
  const [castDeviceName, setCastDeviceName] = useState<string | null>(null)
  const [castError, setCastError] = useState<string | null>(null)
  const [isCastLoading, setIsCastLoading] = useState(true)
  const [debugInfo, setDebugInfo] = useState('')
  const [countryFilter, setCountryFilter] = useState('all')
  const [languageFilter, setLanguageFilter] = useState('all')
  const [tagFilter, setTagFilter] = useState('all')
  const [toast, setToast] = useState<Toast | null>(null)
  const [offlineUntilById, setOfflineUntilById] = useState<Record<string, number>>({})
  const [lastLoadedTerm, setLastLoadedTerm] = useState(INITIAL_SEARCH)
  const [clockTick, setClockTick] = useState(0)
  const importInputRef = useRef<HTMLInputElement | null>(null)
  const searchDebounceTimerRef = useRef<number | null>(null)
  const activeRequestIdRef = useRef(0)
  const activeControllerRef = useRef<AbortController | null>(null)
  const isLoadingRef = useRef(false)

  const playableStations = useMemo(
    () =>
      stations.filter(
        (station) =>
          station.geo_lat !== null &&
          station.geo_long !== null &&
          station.url_resolved &&
          station.lastcheckok !== 0,
      ),
    [stations],
  )

  const healthyStations = useMemo(
    () =>
      playableStations.filter((station) => {
        const offlineUntil = offlineUntilById[station.stationuuid]
        return !offlineUntil || offlineUntil <= clockTick
      }),
    [clockTick, offlineUntilById, playableStations],
  )

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
  }, [clockTick, favoritesById, offlineUntilById, stations])

  const countryOptions = useMemo(
    () => formatOptions(playableStations.map((station) => station.country)),
    [playableStations],
  )

  const languageOptions = useMemo(
    () =>
      formatOptions(
        playableStations.flatMap((station) =>
          station.language
            .split(',')
            .map((part) => part.trim())
            .filter(Boolean),
        ),
      ),
    [playableStations],
  )

  const tagOptions = useMemo(
    () =>
      formatOptions(
        playableStations.flatMap((station) =>
          station.tags
            .split(',')
            .map((part) => part.trim().toLowerCase())
            .filter(Boolean),
        ),
      ).slice(0, 40),
    [playableStations],
  )

  const filteredStations = useMemo(() => {
    return healthyStations.filter((station) => {
      const matchesCountry =
        countryFilter === 'all' || station.country === countryFilter

      const stationLanguages = station.language
        .split(',')
        .map((part) => part.trim())
        .filter(Boolean)
      const matchesLanguage =
        languageFilter === 'all' || stationLanguages.includes(languageFilter)

      const stationTags = station.tags.toLowerCase()
      const matchesTag = tagFilter === 'all' || stationTags.includes(tagFilter)

      return matchesCountry && matchesLanguage && matchesTag
    })
  }, [countryFilter, healthyStations, languageFilter, tagFilter])

  const favoriteIdSet = useMemo(
    () => new Set(Object.keys(favoritesById)),
    [favoritesById],
  )

  const favoriteStations = useMemo(
    () => Object.values(favoritesById).slice(0, 16),
    [favoritesById],
  )

  const nearbyStations = useMemo<NearbyStation[]>(() => {
    if (!userLocation) {
      return []
    }

    return filteredStations
      .map((station) => {
        if (station.geo_lat === null || station.geo_long === null) {
          return null
        }

        return {
          ...station,
          distanceKm: distanceInKm(
            userLocation.lat,
            userLocation.lng,
            station.geo_lat,
            station.geo_long,
          ),
      })
        } catch (err) {
          // Geef SDK tijd om devices te vinden (mDNS discovery kan traag zijn)
          console.log('⏳ Wacht 2s voor device discovery...')
          setTimeout(() => {
            if (isMounted) {
              console.log('📡 Device discovery timeout, probeer toch')
              setIsCastAvailable(true)
            }
          }, 2000)
          return true
        } catch (err) {
      .filter((station): station is Station & { distanceKm: number } =>
        Boolean(station),
      )
      .sort((a, b) => a.distanceKm - b.distanceKm)
      .slice(0, 10)
  }, [filteredStations, userLocation])

  useEffect(() => {
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(Object.values(favoritesById)))
  }, [favoritesById])

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

  useEffect(() => {
    isLoadingRef.current = isLoading
  }, [isLoading])

  useEffect(() => {
    if (!window.isSecureContext) {
      return
    }

    const castWindow = window as Window & ChromeCastLike
    let isMounted = true

    const tryConfigureCast = () => {
      const framework = castWindow.cast?.framework
      if (!framework) {
        const msg = '❌ Cast framework ontbreekt'
        console.error(msg)
        return false
      }

      try {
        const receiverApplicationId =
          castWindow.chrome?.cast?.media?.DEFAULT_MEDIA_RECEIVER_APP_ID ?? 'CC1AD845'

        console.log(`🔧 setOptions aanroepen met receiverApp: ${receiverApplicationId}`)
        framework.CastContext.getInstance().setOptions({
          receiverApplicationId,
          autoJoinPolicy: framework.AutoJoinPolicy.ORIGIN_SCOPED,
        })
        console.log('✅ setOptions geslaagd')

        if (isMounted) {
          setIsCastAvailable(true)
          setCastError(null)
          setIsCastLoading(false)
        }
        return true
      } catch (err) {
        const msg = `❌ Cast configuratie error: ${err instanceof Error ? err.message : String(err)}`
        console.error(msg)
        if (isMounted) {
          setIsCastAvailable(false)
          setCastError('Google Cast kon niet worden geinitialiseerd.')
          setIsCastLoading(false)
        }
        return false
      }
    }

    const previousCastCallback = castWindow.__onGCastApiAvailable
    const castReadyCallback = (isAvailable: boolean) => {
      console.log(`🎬 __onGCastApiAvailable callback: isAvailable=${isAvailable}`)
      previousCastCallback?.(isAvailable)

      if (!isMounted) {
        return
      }

      if (!isAvailable) {
        const msg = '❌ Google Cast niet beschikbaar op dit netwerk'
        console.warn(msg)
        setIsCastAvailable(false)
        setCastError('Google Cast is niet beschikbaar op dit apparaat of netwerk.')
        setIsCastLoading(false)
        setDebugInfo(msg)
        return
      }

      console.log('✅ Cast is beschikbaar, configureer nu...')
      if (!tryConfigureCast()) {
        setCastError('Google Cast kon niet worden geinitialiseerd.')
        setIsCastLoading(false)
        setDebugInfo('❌ Cast kon niet worden geconfigureerd')
        return
      }

      setDebugInfo('✅ Cast SDK geinitialiseerd. Zoekt naar devices...')
    }

    castWindow.__onGCastApiAvailable = castReadyCallback

    console.log('📺 Cast SDK script laden en initialisatie starten...')

    if (tryConfigureCast()) {
      return () => {
        isMounted = false
        if (castWindow.__onGCastApiAvailable === castReadyCallback) {
          castWindow.__onGCastApiAvailable = previousCastCallback
        }
      }
    }

    // Script laden als nog niet geladen
    if (!castWindow.cast) {
      console.log('📥 Cast SDK script inladen...')
      const script = document.createElement('script')
      script.src = CAST_SENDER_URL
      script.onload = () => {
        console.log('✅ Cast SDK script geladen')
        if (isMounted) {
          setDebugInfo('✅ Cast SDK script geladen. Initialiseert...')
        }
      }
      script.onerror = () => {
        const msg = '❌ Cast SDK script kon niet worden geladen'
        console.error(msg)
        if (isMounted) {
          setDebugInfo(msg)
        }
      }
      document.head.appendChild(script)
    }

      // Fallback: als callback na 3s niet is getriggerd, forceer toch beschikbaarheid
      const timeoutId = setTimeout(() => {
        if (isMounted && !window.cast?.framework?.CastContext) {
          console.log('⏳ Cast SDK timeout na 3s, maar probeer toch')
          tryConfigureCast()
        }
      }, 3000)

      return () => {
        clearTimeout(timeoutId)
      }

    const scriptId = 'google-cast-sdk'
    const existingScript = document.getElementById(scriptId) as HTMLScriptElement | null

    if (existingScript) {
      return () => {
        isMounted = false
        if (castWindow.__onGCastApiAvailable === castReadyCallback) {
          castWindow.__onGCastApiAvailable = previousCastCallback
        }
      }
    }

    const script = document.createElement('script')
    script.id = scriptId
    script.src = CAST_SENDER_URL
    script.async = true
    script.defer = true

    const onError = () => {
      if (!isMounted) {
        return
      }
      setIsCastAvailable(false)
      setCastError('Google Cast SDK kon niet worden geladen.')
      setIsCastLoading(false)
    }

    script.addEventListener('error', onError)
    document.head.appendChild(script)

    return () => {
      isMounted = false
      script.removeEventListener('error', onError)
      if (castWindow.__onGCastApiAvailable === castReadyCallback) {
        castWindow.__onGCastApiAvailable = previousCastCallback
      }
    }
  }, [])

  useEffect(() => {
    if (!toast) {
      return
    }

    const timerId = window.setTimeout(() => {
      setToast((current) => (current?.id === toast.id ? null : current))
    }, 2800)

    return () => {
      window.clearTimeout(timerId)
    }
  }, [toast])

  const showToast = (text: string, tone: Toast['tone']) => {
    setToast({
      id: Date.now(),
      text,
      tone,
    })
  }

  const dismissToast = () => {
    setToast(null)
  }

  const loadStations = async (term: string, options: LoadOptions = {}) => {
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
      const limit = cleanTerm ? SEARCH_STATION_LIMIT : GLOBAL_STATION_LIMIT
      const url = cleanTerm
        ? `${API_BASE}/stations/search?limit=${limit}&hidebroken=true&order=clickcount&reverse=true&name=${encodeURIComponent(cleanTerm)}`
        : `${API_BASE}/stations?limit=${limit}&hidebroken=true&order=clickcount&reverse=true`
      const response = await fetch(url, {
        signal: controller.signal,
      })

      if (!response.ok) {
        throw new Error('Stations konden niet worden opgehaald.')
      }

      const raw = (await response.json()) as unknown[]
      const cleaned = raw
        .map((station) => sanitizeStation(station))
        .filter((station): station is Station => Boolean(station))
        .slice(0, limit)

      if (requestId !== activeRequestIdRef.current) {
        return
      }

      setStations(cleaned)
      setSelectedStation((previousSelected) => {
        if (!cleaned.length) {
          return silent ? previousSelected : null
        }

        if (previousSelected) {
          const selectedInResults = cleaned.find(
            (station) => station.stationuuid === previousSelected.stationuuid,
          )

          if (selectedInResults) {
            return selectedInResults
          }

          if (silent) {
            return previousSelected
          }
        }

        return cleaned[0]
      })
      setFavoritesById((previous) => {
        if (Object.keys(previous).length === 0) {
          return previous
        }

        const updated = { ...previous }
        for (const station of cleaned) {
          if (updated[station.stationuuid]) {
            updated[station.stationuuid] = station
          }
        }

        return updated
      })
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return
      }

      if (requestId !== activeRequestIdRef.current) {
        return
      }

      if (!silent) {
        setError('Fout bij laden van stations. Probeer een andere zoekterm.')
        setStations([])
        setSelectedStation(null)
      }
    } finally {
      if (!silent && requestId === activeRequestIdRef.current) {
        setIsLoading(false)
      }
    }
  }

  useEffect(() => {
    return () => {
      activeControllerRef.current?.abort()
      if (searchDebounceTimerRef.current !== null) {
        window.clearTimeout(searchDebounceTimerRef.current)
      }
    }
  }, [])

  useEffect(() => {
    const startupTimerId = window.setTimeout(() => {
      void loadStations(INITIAL_SEARCH)
    }, 0)

    return () => {
      window.clearTimeout(startupTimerId)
    }
  }, [])

  useEffect(() => {
    const timerId = window.setInterval(() => {
      void loadStations(lastLoadedTerm, { silent: true })
    }, HEALTH_REFRESH_MS)

    return () => {
      window.clearInterval(timerId)
    }
  }, [lastLoadedTerm])

  const queueSearch = (term: string) => {
    if (searchDebounceTimerRef.current !== null) {
      window.clearTimeout(searchDebounceTimerRef.current)
    }

    searchDebounceTimerRef.current = window.setTimeout(() => {
      void loadStations(term)
    }, 450)
  }

  const onQueryChange = (nextValue: string) => {
    setQuery(nextValue)
    queueSearch(nextValue)
  }

  const onSearch = (event: FormEvent) => {
    event.preventDefault()
    const cleanQuery = query.trim()
    if (searchDebounceTimerRef.current !== null) {
      window.clearTimeout(searchDebounceTimerRef.current)
    }
    void loadStations(cleanQuery)
  }

  const markStationOffline = (station: Station) => {
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

    if (shouldShowToast) {
      showToast(
        `${station.name} lijkt offline en wordt tijdelijk verborgen.`,
        'error',
      )
    }
  }

  const markStationHealthy = (station: Station) => {
    setOfflineUntilById((previous) => {
      if (!previous[station.stationuuid]) {
        return previous
      }

      const updated = { ...previous }
      delete updated[station.stationuuid]
      return updated
    })
  }

  const resetOfflineStations = () => {
    setOfflineUntilById({})
    showToast('Offline stations worden opnieuw toegestaan.', 'info')
  }

  const restoreOfflineStation = (stationId: string) => {
    setOfflineUntilById((previous) => {
      if (!previous[stationId]) {
        return previous
      }

      const updated = { ...previous }
      delete updated[stationId]
      return updated
    })
  }

  const toggleFavorite = (station: Station) => {
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
  }

  const locateUser = () => {
    if (!navigator.geolocation) {
      setLocationError('Geolocatie wordt niet ondersteund in deze browser.')
      return
    }

    setIsLocating(true)
    setLocationError(null)

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setUserLocation({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        })
        setIsLocating(false)
      },
      () => {
        setLocationError('Locatie ophalen mislukt. Controleer je browsertoestemming.')
        setIsLocating(false)
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
      },
    )
  }

  const connectBluetoothDevice = async () => {
    type BluetoothLike = {
      requestDevice: (options: {
        acceptAllDevices: boolean
        optionalServices?: string[]
      }) => Promise<{ name?: string }>
    }
    type BluetoothNavigator = Navigator & {
      bluetooth?: BluetoothLike
    }

    const nav = navigator as BluetoothNavigator
    if (!nav.bluetooth) {
      setBluetoothError('Web Bluetooth wordt niet ondersteund in deze browser.')
      return
    }

    if (!window.isSecureContext) {
      setBluetoothError('Bluetooth werkt alleen via HTTPS of localhost.')
      return
    }

    setBluetoothError(null)
    setIsBluetoothConnecting(true)

    try {
      const device = await nav.bluetooth.requestDevice({
        acceptAllDevices: true,
      })

      setBluetoothDeviceName(device.name || 'Onbekend apparaat')
      showToast('Bluetooth-apparaat gekoppeld.', 'success')
    } catch {
      setBluetoothError('Bluetooth koppelen geannuleerd of mislukt.')
    } finally {
      setIsBluetoothConnecting(false)
    }
  }

  const connectGoogleHome = async () => {
    const castStationToGoogleHome = async (
      station: Station,
      sessionOverride?: CastSessionLike | null,
    ) => {
      const castWindow = window as Window & ChromeCastLike
      const framework = castWindow.cast?.framework
      const mediaNamespace = castWindow.chrome?.cast?.media

      if (!framework || !mediaNamespace) {
        setCastError('Google Cast media API is niet beschikbaar.')
        return false
      }

      const session =
        sessionOverride ?? framework.CastContext.getInstance().getCurrentSession()

      if (!session?.loadMedia) {
        setCastError('Geen actieve Google Cast sessie gevonden.')
        return false
      }

      if (!station.url_resolved) {
        setCastError('Dit station heeft geen geldige stream URL voor Google Home.')
        return false
      }

      const MediaInfo = mediaNamespace.MediaInfo
      const LoadRequest = mediaNamespace.LoadRequest

      if (!MediaInfo || !LoadRequest) {
        setCastError('Google Cast media classes zijn niet beschikbaar.')
        return false
      }

      try {
        const mediaInfo = new MediaInfo(station.url_resolved, 'audio/aac')
        mediaInfo.streamType = mediaNamespace.StreamType?.LIVE ?? 'LIVE'

        if (mediaNamespace.GenericMediaMetadata) {
          const metadata = new mediaNamespace.GenericMediaMetadata()
          metadata.metadataType = mediaNamespace.MetadataType?.GENERIC ?? 0
          metadata.title = station.name
          metadata.subtitle =
            `${station.country}${station.state ? `, ${station.state}` : ''}`.trim()
          metadata.images = station.favicon ? [{ url: station.favicon }] : []
          mediaInfo.metadata = metadata
        } else {
          mediaInfo.metadata = {
            metadataType: mediaNamespace.MetadataType?.GENERIC ?? 0,
            title: station.name,
            subtitle:
              `${station.country}${station.state ? `, ${station.state}` : ''}`.trim(),
            images: station.favicon ? [{ url: station.favicon }] : [],
          }
        }

        const request = new LoadRequest(mediaInfo)
        request.autoplay = true
        request.currentTime = 0

        await session.loadMedia(request)

        setCastError(null)
        showToast(`Streaming naar ${castDeviceName ?? 'Google Home'}: ${station.name}`, 'success')
        return true
      } catch {
        setCastError('De geselecteerde stream kon niet naar Google Home worden gestuurd.')
        return false
      }
    }

    const castWindow = window as Window & ChromeCastLike
    const framework = castWindow.cast?.framework
    const hasCastMediaApi = Boolean(castWindow.chrome?.cast?.media)
    const isChromiumBrowser = /Chrome|Edg\//.test(navigator.userAgent)

    if (!window.isSecureContext) {
      const msg = 'Google Home koppelen werkt alleen via HTTPS of localhost.'
      setCastError(msg)
      console.warn(`❌ ${msg}`)
      setDebugInfo(`❌ ${msg}`)
      return
    }

    if (!isChromiumBrowser) {
      const msg = 'Google Home Cast werkt in Chrome of Edge.'
      setCastError(msg)
      console.warn(`❌ ${msg}`)
      setDebugInfo(`❌ ${msg}`)
      return
    }

    if (!hasCastMediaApi) {
      const msg = 'Google Cast API ontbreekt. Open de app in Chrome/Edge en probeer opnieuw.'
      setCastError(msg)
      console.warn(`❌ ${msg}`)
      setDebugInfo(`❌ ${msg}`)
      return
    }

    if (isCastLoading) {
      const msg = 'Google Cast initialiseert nog. Probeer over enkele seconden opnieuw.'
      setCastError(msg)
      console.warn(`⏳ ${msg}`)
      setDebugInfo(`⏳ ${msg}`)
      return
    }

    if (!framework) {
      const msg = 'Cast framework niet geladen. Vernieuw de pagina of controleer je internet.'
      setCastError(msg)
      console.warn(`❌ ${msg}`)
      setDebugInfo(`❌ ${msg}`)
      return
    }

    if (!isCastAvailable) {
      const msg = 'Cast meldt geen apparaten beschikbaar. Controleer of je Google Home online is en op hetzelfde netwerk zit. Probeer opnieuw of vernieuw de pagina.'
      setCastError(msg)
      console.warn(`⚠️ ${msg}`)
      setDebugInfo(`⚠️ Geen Cast-apparaten gevonden. Check netwerk en mDNS.`)
      return
    }

    setCastError(null)
    setIsCasting(true)

    try {
      const castContext = framework.CastContext.getInstance()
      if (!isCastAvailable) {
        const msg = 'Cast meldt geen apparaten beschikbaar. Probeer toch verbinding te maken?'
        console.warn(`⚠️ ${msg}`)
        setDebugInfo(`⚠️ ${msg}`)
        // Niet return — laat gebruiker toch proberen via knop
      }

      setCastError(null)
      setIsCasting(true)
      setDebugInfo('🔄 requestSession() aanroepen...')

      try {
        const castContext = framework.CastContext.getInstance()
      if (!castContext) {
        const msg = 'Cast context kon niet worden opgehaald.'
        setCastError(msg)
        console.error(`❌ ${msg}`)
        setDebugInfo(`❌ ${msg}`)
        setIsCasting(false)
        return
      }

      console.log('📡 requestSession() aanroepen...')
      setDebugInfo('📡 requestSession() aanroepen...')
      await castContext.requestSession()
      console.log('✅ requestSession() geslaagd')
      setDebugInfo('✅ requestSession() geslaagd')

      const session = castContext.getCurrentSession()
      if (!session) {
        const msg = 'Sessie aangevraagd maar niet actief. Google Home bereikbaar?'
        setCastError(msg)
        console.warn(`⚠️ ${msg}`)
        setDebugInfo(`⚠️ ${msg}`)
        setIsCasting(false)
        return
      }

      const deviceName = session.getCastDevice?.().friendlyName ?? 'Google Home'
      setCastDeviceName(deviceName)
      setCastError(null)
      setDebugInfo(`✅ Verbonden met: ${deviceName}`)
      showToast(`Verbonden met ${deviceName}.`, 'success')

      if (selectedStation && session) {
        await castStationToGoogleHome(selectedStation, session)
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err)
      console.error(`❌ connectGoogleHome error: ${errMsg}`)
      const msg = 'Koppelen mislukt. Controleer of Google Home online is en op hetzelfde netwerk zit.'
      setCastError(msg)
      setDebugInfo(`❌ Fout: ${errMsg}`)
    } finally {
      setIsCasting(false)
    }
  }

  const onSelectStation = (station: Station) => {
    setSelectedStation(station)

    if (!castDeviceName) {
      return
    }

    const castWindow = window as Window & ChromeCastLike
    const framework = castWindow.cast?.framework
    const mediaNamespace = castWindow.chrome?.cast?.media
    const session = framework?.CastContext.getInstance().getCurrentSession()

    if (!framework || !mediaNamespace || !session?.loadMedia) {
      return
    }

    const MediaInfo = mediaNamespace.MediaInfo
    const LoadRequest = mediaNamespace.LoadRequest
    if (!MediaInfo || !LoadRequest || !station.url_resolved) {
      return
    }

    const mediaInfo = new MediaInfo(station.url_resolved, 'audio/aac')
    mediaInfo.streamType = mediaNamespace.StreamType?.LIVE ?? 'LIVE'

    if (mediaNamespace.GenericMediaMetadata) {
      const metadata = new mediaNamespace.GenericMediaMetadata()
      metadata.metadataType = mediaNamespace.MetadataType?.GENERIC ?? 0
      metadata.title = station.name
      metadata.subtitle = `${station.country}${station.state ? `, ${station.state}` : ''}`
      metadata.images = station.favicon ? [{ url: station.favicon }] : []
      mediaInfo.metadata = metadata
    } else {
      mediaInfo.metadata = {
        metadataType: mediaNamespace.MetadataType?.GENERIC ?? 0,
        title: station.name,
        subtitle: `${station.country}${station.state ? `, ${station.state}` : ''}`,
        images: station.favicon ? [{ url: station.favicon }] : [],
      }
    }

    const request = new LoadRequest(mediaInfo)
    request.autoplay = true
    request.currentTime = 0

    void session.loadMedia(request).catch(() => {
      setCastError('De geselecteerde stream kon niet naar Google Home worden gestuurd.')
    })
  }

  const resetFilters = () => {
    setCountryFilter('all')
    setLanguageFilter('all')
    setTagFilter('all')
  }

  const refreshCastSession = () => {
    console.log('🔄 refreshCastSession gestart')
    setDebugInfo('🔄 Cast sessie vernieuwen...')

    const castWindow = window as Window & ChromeCastLike
    const framework = castWindow.cast?.framework

    if (!framework) {
      const msg = 'Cast framework ontbreekt. Vernieuw de pagina en probeer opnieuw.'
      setCastError(msg)
      console.warn(`❌ ${msg}`)
      setDebugInfo(`❌ ${msg}`)
      return
    }

    setIsCastLoading(true)
    setCastError(null)

    try {
      const castContext = framework.CastContext.getInstance()
      if (!castContext) {
        const msg = 'Cast context kon niet worden opgehaald. Vernieuw de pagina.'
        setCastError(msg)
        console.warn(`❌ ${msg}`)
        setDebugInfo(`❌ ${msg}`)
        setIsCastLoading(false)
        return
      }

      console.log('📡 requestSession() aanroepen in refresh...')
      setDebugInfo('📡 requestSession() aanroepen...')

      // requestSession() mag alleen aangeroepen worden als setOptions() al in de initialisatie is gedaan
      const sessionPromise = castContext.requestSession()
      if (!sessionPromise) {
        const msg = 'requestSession() retourneerde niets. Vernieuw de pagina.'
        setCastError(msg)
        console.warn(`❌ ${msg}`)
        setDebugInfo(`❌ ${msg}`)
        setIsCastLoading(false)
        return
      }

      void sessionPromise
        .then(() => {
          try {
            console.log('✅ requestSession() resolved, krijg sessie...')
            setDebugInfo('✅ requestSession() resolved, krijg sessie...')

            const session = castContext.getCurrentSession()
            if (!session) {
              const msg = 'Sessie aangevraagd maar geen sessie actief. Google Home niet bereikbaar?'
              setCastError(msg)
              console.warn(`⚠️ ${msg}`)
              setDebugInfo(`⚠️ ${msg}`)
              setIsCastLoading(false)
              return
            }

            const deviceName = session.getCastDevice?.().friendlyName ?? 'Google Home'
            setCastDeviceName(deviceName)
            setCastError(null)
            setIsCastAvailable(true)
            setDebugInfo(`✅ Verbonden met: ${deviceName}`)
            showToast(`Verbonden met ${deviceName}.`, 'success')
            console.log(`✅ Cast sessie vernieuwd: ${deviceName}`)
            setIsCastLoading(false)
          } catch (err) {
            const errMsg = err instanceof Error ? err.message : String(err)
            console.error(`❌ Error after requestSession: ${errMsg}`)
            const msg = 'Fout na Cast-verzoek. Controleer je Google Home en netwerk.'
            setCastError(msg)
            setDebugInfo(`❌ Fout: ${errMsg}`)
            setIsCastLoading(false)
          }
        })
        .catch((err) => {
          const errMsg = err instanceof Error ? err.message : String(err)
          console.error(`❌ requestSession rejected: ${errMsg}`)
          const msg = 'Cast-verzoek geweigerd. Google Home online en op hetzelfde netwerk?'
          setCastError(msg)
          setDebugInfo(`❌ Fout: ${errMsg}`)
          setIsCastLoading(false)
        })
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err)
      console.error(`❌ Cast refresh outer error: ${errMsg}`)
      const msg = 'Interne Cast-fout. Vernieuw de pagina en probeer opnieuw.'
      setCastError(msg)
      setDebugInfo(`❌ Fout: ${errMsg}`)
      setIsCastLoading(false)
    }
  }

  const exportFavorites = () => {
    const exportItems = Object.values(favoritesById)

    if (exportItems.length === 0) {
      showToast('Er zijn nog geen favorieten om te exporteren.', 'info')
      return
    }

    const blob = new Blob([JSON.stringify(exportItems, null, 2)], {
      type: 'application/json',
    })
    const objectUrl = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = objectUrl
    anchor.download = 'radio-favorieten.json'
    anchor.click()
    URL.revokeObjectURL(objectUrl)

    showToast(`${exportItems.length} favorieten geëxporteerd.`, 'success')
  }

  const triggerImport = () => {
    importInputRef.current?.click()
  }

  const onImportFavorites = async (event: ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0]
    event.target.value = ''

    if (!selectedFile) {
      return
    }

    try {
      const text = await selectedFile.text()
      const parsed = JSON.parse(text) as unknown

      if (!Array.isArray(parsed)) {
        throw new Error('Ongeldig JSON formaat')
      }

      const importedStations = parsed
        .map((item) => sanitizeStation(item))
        .filter((item): item is Station => Boolean(item))

      setFavoritesById((previous) => {
        const merged = { ...previous }
        for (const station of importedStations) {
          merged[station.stationuuid] = station
        }
        return merged
      })

      showToast(`${importedStations.length} favorieten geïmporteerd.`, 'success')
    } catch {
      showToast('Import mislukt. Gebruik een geldig favorieten JSON-bestand.', 'error')
    }
  }

  return (
    <main className="app-shell">
      <header className="app-header">
        <div>
          <p className="eyebrow">Marco Steegh</p>
          <h1>World Radio Explorer</h1>
          <p className="subtitle">
            Ontdek radiostations op de kaart en luister direct live.
          </p>
        </div>
        <form className="search" onSubmit={onSearch}>
          <label htmlFor="station-search">
            Zoek station, genre of stad (laat leeg voor wereldwijd)
          </label>
          <div className="search-row">
            <input
              id="station-search"
              value={query}
              onChange={(event) => onQueryChange(event.target.value)}
              placeholder="bijv. funk, amsterdam, news (of leeg)"
            />
            <button type="submit" disabled={isLoading}>
              {isLoading ? 'Laden...' : 'Zoeken'}
            </button>
            <button
              type="button"
              className="secondary-btn"
              disabled={isLocating}
              onClick={locateUser}
            >
              {isLocating ? 'Locatie...' : 'Gebruik mijn locatie'}
            </button>
            <button
              type="button"
              className="secondary-btn"
              disabled={isBluetoothConnecting}
              onClick={() => {
                void connectBluetoothDevice()
              }}
            >
              {isBluetoothConnecting ? 'Bluetooth...' : 'Koppel Bluetooth'}
            </button>
            <button
              type="button"
              className="secondary-btn"
              disabled={isCasting}
              onClick={() => {
                void connectGoogleHome()
              }}
            >
              {isCasting ? 'Google Home...' : 'Koppel Google Home'}
            </button>
            {castError && castDeviceName === null ? (
              <button
                type="button"
                className="secondary-btn"
                disabled={isCastLoading}
                onClick={refreshCastSession}
              >
                {isCastLoading ? 'Vernieuwen...' : 'Vernieuw Cast'}
              </button>
            ) : null}
          </div>
          <div className="filter-actions">
            <button type="button" className="secondary-btn" onClick={resetFilters}>
              Reset filters
            </button>
            <button
              type="button"
              className="secondary-btn"
              onClick={resetOfflineStations}
            >
              Check offline opnieuw
            </button>
          </div>
          {locationError ? <p className="helper error-text">{locationError}</p> : null}
          {userLocation ? (
            <p className="helper">
              Locatie actief: {userLocation.lat.toFixed(2)}, {userLocation.lng.toFixed(2)}
            </p>
          ) : null}
          {bluetoothDeviceName ? (
            <p className="helper">Bluetooth gekoppeld: {bluetoothDeviceName}</p>
          ) : null}
          {bluetoothError ? <p className="helper error-text">{bluetoothError}</p> : null}
          {castDeviceName ? (
            <p className="helper">Google Home gekoppeld: {castDeviceName}</p>
          ) : null}
          {castError ? <p className="helper error-text">{castError}</p> : null}
          {debugInfo ? (
            <p className="helper" style={{ backgroundColor: 'rgba(255, 183, 3, 0.1)', padding: '0.6rem', borderRadius: '8px', marginTop: '0.6rem' }}>
              <strong>🔍 Debug info:</strong> {debugInfo}
            </p>
          ) : null}
          {isCastLoading && !isCastAvailable ? (
            <p className="helper">Google Cast initialiseert...</p>
          ) : null}
          {activeOfflineCount > 0 ? (
            <p className="helper">
              {activeOfflineCount} stations tijdelijk verborgen wegens streamfouten.
            </p>
          ) : null}
          <div className="filter-grid">
            <label>
              Land
              <select
                value={countryFilter}
                onChange={(event) => setCountryFilter(event.target.value)}
              >
                <option value="all">Alle landen</option>
                {countryOptions.map((country) => (
                  <option key={country} value={country}>
                    {country}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Taal
              <select
                value={languageFilter}
                onChange={(event) => setLanguageFilter(event.target.value)}
              >
                <option value="all">Alle talen</option>
                {languageOptions.map((language) => (
                  <option key={language} value={language}>
                    {language}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Tag
              <select
                value={tagFilter}
                onChange={(event) => setTagFilter(event.target.value)}
              >
                <option value="all">Alle tags</option>
                {tagOptions.map((tag) => (
                  <option key={tag} value={tag}>
                    {tag}
                  </option>
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

            {filteredStations.map((station) => {
              if (station.geo_lat === null || station.geo_long === null) {
                return null
              }

              const isActive = selectedStation?.stationuuid === station.stationuuid

              return (
                <CircleMarker
                  key={station.stationuuid}
                  center={[station.geo_lat, station.geo_long]}
                  radius={isActive ? 9 : 5}
                  color={isActive ? '#fb8500' : '#ca6702'}
                  weight={isActive ? 3 : 2}
                  fillColor={isActive ? '#ffb703' : '#ee9b00'}
                  fillOpacity={0.8}
                  eventHandlers={{
                    click: () => onSelectStation(station),
                  }}
                >
                  <Popup>
                    <strong>{station.name}</strong>
                    <div>{station.country}</div>
                  </Popup>
                </CircleMarker>
              )
            })}

            <FlyToStation station={selectedStation} />
          </MapContainer>
        </div>
        <aside className="panel">
          {error && <p className="error">{error}</p>}

          {toast ? (
            <div className={`toast toast-${toast.tone}`} role="status" aria-live="polite">
              <span>{toast.text}</span>
              <button
                type="button"
                className="toast-close"
                onClick={dismissToast}
                aria-label="Sluit melding"
              >
                x
              </button>
            </div>
          ) : null}

          <div className="favorites-tools">
            <button type="button" className="mini-action" onClick={exportFavorites}>
              Export
            </button>
            <button type="button" className="mini-action" onClick={triggerImport}>
              Import
            </button>
            <input
              ref={importInputRef}
              className="hidden-input"
              type="file"
              accept="application/json"
              onChange={onImportFavorites}
            />
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
                  {selectedStation.language || 'Onbekende taal'} ·{' '}
                  {selectedStation.tags || 'Algemeen'}
                </p>
                <button
                  type="button"
                  className="fav-toggle"
                  onClick={() => toggleFavorite(selectedStation)}
                >
                  {favoriteIdSet.has(selectedStation.stationuuid)
                    ? 'Verwijder favoriet'
                    : 'Voeg toe aan favorieten'}
                </button>
              </div>

              <audio
                key={selectedStation.stationuuid}
                controls
                autoPlay
                preload="none"
                src={selectedStation.url_resolved}
                onError={() => markStationOffline(selectedStation)}
                onCanPlay={() => markStationHealthy(selectedStation)}
              >
                Je browser ondersteunt geen audio streaming.
              </audio>
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
              <section className="empty-state">
                <h3>Geen resultaten met deze filters</h3>
                <p>
                  Probeer een andere zoekterm of reset de filters om meer stations te
                  zien.
                </p>
                <button type="button" className="secondary-btn" onClick={resetFilters}>
                  Reset filters
                </button>
              </section>
            ) : null}

            {offlineStations.length > 0 ? (
              <section className="station-section">
                <h3>Tijdelijk offline ({offlineStations.length})</h3>
                {offlineStations.map((item) => (
                  <div className="station-row" key={`offline-${item.station.stationuuid}`}>
                    <button
                      type="button"
                      className="station"
                      onClick={() => onSelectStation(item.station)}
                    >
                      <span>{item.station.name}</span>
                      <small>
                        {item.station.country} · opnieuw over{' '}
                        <OfflineCountdown
                          offlineUntil={item.offlineUntil}
                          onExpire={() => restoreOfflineStation(item.station.stationuuid)}
                        />
                      </small>
                    </button>
                    <button
                      type="button"
                      className="mini-action"
                      onClick={() => restoreOfflineStation(item.station.stationuuid)}
                    >
                      Herstel
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
                      className={
                        station.stationuuid === selectedStation?.stationuuid
                          ? 'station active'
                          : 'station'
                      }
                      onClick={() => onSelectStation(station)}
                    >
                      <span>{station.name}</span>
                      <small>{station.country}</small>
                    </button>
                    <button
                      type="button"
                      className="mini-action"
                      onClick={() => toggleFavorite(station)}
                    >
                      Unfav
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
                      className={
                        station.stationuuid === selectedStation?.stationuuid
                          ? 'station active'
                          : 'station'
                      }
                      onClick={() => onSelectStation(station)}
                    >
                      <span>{station.name}</span>
                      <small>
                        {station.country} · {station.distanceKm.toFixed(0)} km
                      </small>
                    </button>
                    <button
                      type="button"
                      className="mini-action"
                      onClick={() => toggleFavorite(station)}
                    >
                      {favoriteIdSet.has(station.stationuuid) ? 'Unfav' : 'Fav'}
                    </button>
                  </div>
                ))}
              </section>
            ) : null}

            {!isLoading ? (
              <section className="station-section">
                <h3>Topresultaten ({filteredStations.length})</h3>
                {filteredStations.slice(0, 18).map((station) => (
                  <div className="station-row" key={station.stationuuid}>
                    <button
                      type="button"
                      className={
                        station.stationuuid === selectedStation?.stationuuid
                          ? 'station active'
                          : 'station'
                      }
                      onClick={() => onSelectStation(station)}
                    >
                      <span>{station.name}</span>
                      <small>
                        {station.country} · {station.clickcount} plays
                      </small>
                    </button>
                    <button
                      type="button"
                      className="mini-action"
                      onClick={() => toggleFavorite(station)}
                    >
                      {favoriteIdSet.has(station.stationuuid) ? 'Unfav' : 'Fav'}
                    </button>
                  </div>
                ))}
              </section>
            ) : null}
          </div>
        </aside>
      </section>
    </main>
  )
}

export default App
