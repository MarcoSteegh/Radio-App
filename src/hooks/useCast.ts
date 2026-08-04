import { useCallback, useState, useEffect } from 'react'
import type { Station } from '../types/station'
import { trackEvent } from '../lib/observability'

type CastSessionLike = {
  getCastDevice?: () => { friendlyName?: string }
  loadMedia?: (request: unknown) => Promise<unknown>
  setVolume?: (volume: number) => Promise<unknown> | void
  getMediaSession?: () => { setVolume?: (volume: number) => Promise<unknown> | void; pause?: () => void; play?: () => void } | null
}

type CastContextLike = {
  setOptions: (options: { receiverApplicationId: string; autoJoinPolicy: string }) => void
  requestSession: () => Promise<unknown>
  getCurrentSession: () => CastSessionLike | null
  addEventListener: (eventType: string, handler: (event: { sessionState: string }) => void) => void
  removeEventListener: (eventType: string, handler: (event: { sessionState: string }) => void) => void
}

type CastFrameworkLike = {
  CastContext: { getInstance: () => CastContextLike }
  SessionState?: { SESSION_STARTED: string; SESSION_RESUMED: string; SESSION_ENDING: string; SESSION_ENDED: string; NO_SESSION: string }
  CastContextEventType?: { SESSION_STATE_CHANGED: string }
}

type ChromeCastLike = {
  __onGCastApiAvailable?: (isAvailable: boolean) => void
  cast?: { framework?: CastFrameworkLike }
  chrome?: {
    cast?: {
      media?: {
        DEFAULT_MEDIA_RECEIVER_APP_ID?: string
        StreamType?: { LIVE?: string }
        MetadataType?: { GENERIC?: number }
        MediaInfo?: new (contentId: string, contentType: string) => { streamType?: string; metadata?: unknown }
        GenericMediaMetadata?: new () => { metadataType?: number; title?: string; subtitle?: string; images?: Array<{ url: string }> }
        LoadRequest?: new (mediaInfo: unknown) => { autoplay?: boolean; currentTime?: number }
      }
    }
  }
}

type CastMediaNamespace = NonNullable<NonNullable<NonNullable<ChromeCastLike['chrome']>['cast']>['media']>

const CAST_SENDER_URL = 'https://www.gstatic.com/cv/js/sender/v1/cast_sender.js?loadCastFramework=1'

async function loadMediaToSession(
  station: Station,
  session: CastSessionLike,
  mediaNamespace: CastMediaNamespace,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!station.url_resolved) {
    return { ok: false, error: 'Dit station heeft geen geldige stream URL voor Google Home.' }
  }

  let protocol: string
  try {
    ;({ protocol } = new URL(station.url_resolved))
  } catch {
    return { ok: false, error: 'Stream URL is ongeldig en kan niet worden geparsed.' }
  }
  if (protocol !== 'http:' && protocol !== 'https:') {
    return { ok: false, error: 'Stream URL heeft een ongeldig protocol. Alleen http/https wordt ondersteund.' }
  }

  const { MediaInfo, LoadRequest } = mediaNamespace
  if (!MediaInfo || !LoadRequest) {
    return { ok: false, error: 'Google Cast media classes zijn niet beschikbaar.' }
  }

  try {
    const mediaInfo = new MediaInfo(station.url_resolved, 'audio/aac')
    mediaInfo.streamType = mediaNamespace.StreamType?.LIVE ?? 'LIVE'

    if (mediaNamespace.GenericMediaMetadata) {
      const metadata = new mediaNamespace.GenericMediaMetadata()
      metadata.metadataType = mediaNamespace.MetadataType?.GENERIC ?? 0
      metadata.title = station.name
      metadata.subtitle = `${station.country}${station.state ? `, ${station.state}` : ''}`.trim()
      metadata.images = station.favicon ? [{ url: station.favicon }] : []
      mediaInfo.metadata = metadata
    } else {
      mediaInfo.metadata = {
        metadataType: mediaNamespace.MetadataType?.GENERIC ?? 0,
        title: station.name,
        subtitle: `${station.country}${station.state ? `, ${station.state}` : ''}`.trim(),
        images: station.favicon ? [{ url: station.favicon }] : [],
      }
    }

    const request = new LoadRequest(mediaInfo)
    request.autoplay = true
    request.currentTime = 0

    await session.loadMedia!(request)
    return { ok: true }
  } catch {
    return { ok: false, error: 'De geselecteerde stream kon niet naar Google Home worden gestuurd.' }
  }
}

export function useCast(selectedStation: Station | null) {
  const [isCastAvailable, setIsCastAvailable] = useState(false)
  const [isCasting, setIsCasting] = useState(false)
  const [castDeviceName, setCastDeviceName] = useState<string | null>(null)
  const [castError, setCastError] = useState<string | null>(null)
  const [isCastLoading, setIsCastLoading] = useState(true)
  const [isAudioPlaying, setIsAudioPlaying] = useState(false)

  useEffect(() => {
    if (!window.isSecureContext) return

    const castWindow = window as Window & ChromeCastLike
    let isMounted = true

    const tryConfigureCast = () => {
      const framework = castWindow.cast?.framework
      if (!framework) return false

      try {
        const receiverApplicationId =
          castWindow.chrome?.cast?.media?.DEFAULT_MEDIA_RECEIVER_APP_ID ?? 'CC1AD845'

        framework.CastContext.getInstance().setOptions({
          receiverApplicationId,
          autoJoinPolicy: 'origin_scoped',
        })

        if (isMounted) {
          setIsCastAvailable(true)
          setCastError(null)
          setIsCastLoading(false)
        }
        return true
      } catch {
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
      previousCastCallback?.(isAvailable)
      if (!isMounted) return

      const configured = tryConfigureCast()
      if (!configured) {
        setCastError('Google Cast kon niet worden geinitialiseerd.')
        setIsCastLoading(false)
        return
      }

      if (!isAvailable) {
        setIsCastAvailable(false)
      }
    }

    castWindow.__onGCastApiAvailable = castReadyCallback

    if (tryConfigureCast()) {
      return () => {
        isMounted = false
        if (castWindow.__onGCastApiAvailable === castReadyCallback) {
          castWindow.__onGCastApiAvailable = previousCastCallback
        }
      }
    }

    const existingCastScript = Array.from(document.querySelectorAll('script')).find(
      (s) => s.getAttribute('src')?.includes('cast_sender.js'),
    )

    if (existingCastScript) {
      return () => {
        isMounted = false
        if (castWindow.__onGCastApiAvailable === castReadyCallback) {
          castWindow.__onGCastApiAvailable = previousCastCallback
        }
      }
    }

    const script = document.createElement('script')
    script.src = CAST_SENDER_URL
    script.async = true
    script.defer = true

    const onError = () => {
      if (!isMounted) return
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
    if (!isCastAvailable) return

    const castWindow = window as Window & ChromeCastLike
    const framework = castWindow.cast?.framework
    if (!framework) return

    const castContext = framework.CastContext.getInstance()
    const eventType = framework.CastContextEventType?.SESSION_STATE_CHANGED ?? 'sessionstatechanged'

    const handleSessionState = (event: { sessionState: string }) => {
      const { SESSION_STARTED, SESSION_RESUMED, SESSION_ENDED, NO_SESSION } = framework.SessionState ?? {}
      const { sessionState } = event

      if (sessionState === SESSION_STARTED || sessionState === SESSION_RESUMED) {
        const session = castContext.getCurrentSession()
        if (!session) return
        const deviceName = session.getCastDevice?.().friendlyName ?? 'Google Home'
        setCastDeviceName(deviceName)
        setCastError(null)
      } else if (sessionState === SESSION_ENDED || sessionState === NO_SESSION) {
        setCastDeviceName(null)
        setIsAudioPlaying(false)
      }
    }

    castContext.addEventListener(eventType, handleSessionState)

    return () => {
      castContext.removeEventListener(eventType, handleSessionState)
    }
  }, [isCastAvailable])

  const connectGoogleHome = useCallback(async (showToast: (text: string, tone: 'info' | 'success' | 'error') => void) => {
    const castWindow = window as Window & ChromeCastLike
    const framework = castWindow.cast?.framework
    const hasCastMediaApi = Boolean(castWindow.chrome?.cast?.media)
    const isChromiumBrowser = /Chrome|Edg\//.test(navigator.userAgent)

    if (!window.isSecureContext) {
      setCastError('Google Home koppelen werkt alleen via HTTPS of localhost.')
      return
    }

    if (!isChromiumBrowser) {
      setCastError('Google Home Cast werkt in Chrome of Edge.')
      return
    }

    if (!hasCastMediaApi) {
      setCastError('Google Cast API ontbreekt. Open de app in Chrome/Edge en probeer opnieuw.')
      return
    }

    if (isCastLoading) {
      setCastError('Google Cast initialiseert nog. Probeer over enkele seconden opnieuw.')
      return
    }

    if (!framework) {
      setCastError('Cast framework niet geladen. Vernieuw de pagina of controleer je internet.')
      return
    }

    setCastError(null)
    setIsCasting(true)
    trackEvent('cast_connect_attempt', { castAvailable: isCastAvailable, hasCastMediaApi })

    try {
      const castContext = framework.CastContext.getInstance()
      if (!castContext) {
        setCastError('Cast context kon niet worden opgehaald.')
        setIsCasting(false)
        return
      }

      const receiverApplicationId =
        (castWindow.chrome?.cast?.media as { DEFAULT_MEDIA_RECEIVER_APP_ID?: string })
          ?.DEFAULT_MEDIA_RECEIVER_APP_ID ?? 'CC1AD845'
      castContext.setOptions({ receiverApplicationId, autoJoinPolicy: 'origin_scoped' })

      await castContext.requestSession()

      const session = castContext.getCurrentSession()
      if (!session) {
        trackEvent('cast_connect_failed', { reason: 'no_session' })
        setCastError('Sessie aangevraagd maar niet actief. Google Home bereikbaar?')
        setIsCasting(false)
        return
      }

      const deviceName = session.getCastDevice?.().friendlyName ?? 'Google Home'
      trackEvent('cast_connect_success', { deviceName })
      setCastDeviceName(deviceName)
      setCastError(null)
      showToast(`Verbonden met ${deviceName}.`, 'success')

      if (selectedStation) {
        const mediaNamespace = castWindow.chrome?.cast?.media
        if (mediaNamespace) {
          const result = await loadMediaToSession(selectedStation, session, mediaNamespace)
          if (result.ok) {
            trackEvent('cast_stream_success', { stationuuid: selectedStation.stationuuid })
            setCastError(null)
            setIsAudioPlaying(true)
          } else {
            trackEvent('cast_stream_failed', { stationuuid: selectedStation.stationuuid, reason: 'load_media_failed' })
            setCastError(result.error)
          }
        }
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err)
      if (errMsg === 'cancel' || errMsg === 'CANCEL') {
        trackEvent('cast_connect_cancel', { reason: 'user_cancel' })
        return
      }
      trackEvent('cast_connect_failed', { reason: errMsg })
      setCastError('Koppelen mislukt. Controleer of Google Home online is en op hetzelfde netwerk zit.')
    } finally {
      setIsCasting(false)
    }
  }, [isCastAvailable, isCastLoading, selectedStation])

  const castToStation = useCallback(async (station: Station) => {
    const castWindow = window as Window & ChromeCastLike
    const framework = castWindow.cast?.framework
    const mediaNamespace = castWindow.chrome?.cast?.media
    const session = framework?.CastContext.getInstance().getCurrentSession()

    if (!session?.loadMedia || !mediaNamespace) return

    const result = await loadMediaToSession(station, session, mediaNamespace)
    if (!result.ok) {
      trackEvent('cast_stream_failed', { stationuuid: station.stationuuid, reason: 'load_media_failed' })
      setCastError(result.error)
      return false
    }

    trackEvent('cast_stream_success', { stationuuid: station.stationuuid })
    setCastError(null)
    setIsAudioPlaying(true)
    return true
  }, [])

  const refreshCastSession = useCallback((showToast: (text: string, tone: 'info' | 'success' | 'error') => void) => {
    const castWindow = window as Window & ChromeCastLike
    const framework = castWindow.cast?.framework

    if (!framework) {
      setCastError('Cast framework ontbreekt. Vernieuw de pagina en probeer opnieuw.')
      return
    }

    setIsCastLoading(true)
    setCastError(null)

    try {
      const castContext = framework.CastContext.getInstance()
      if (!castContext) {
        setCastError('Cast context kon niet worden opgehaald. Vernieuw de pagina.')
        setIsCastLoading(false)
        return
      }

      try {
        const receiverApplicationId =
          (castWindow.chrome?.cast?.media as { DEFAULT_MEDIA_RECEIVER_APP_ID?: string })
            ?.DEFAULT_MEDIA_RECEIVER_APP_ID ?? 'CC1AD845'
        castContext.setOptions({ receiverApplicationId, autoJoinPolicy: 'origin_scoped' })
      } catch {
        // ignore
      }

      void castContext.requestSession()
        .then(() => {
          const session = castContext.getCurrentSession()
          if (!session) {
            setCastError('Sessie aangevraagd maar geen sessie actief. Google Home niet bereikbaar?')
            setIsCastLoading(false)
            return
          }

          const deviceName = session.getCastDevice?.().friendlyName ?? 'Google Home'
          setCastDeviceName(deviceName)
          setCastError(null)
          setIsCastAvailable(true)
          showToast(`Verbonden met ${deviceName}.`, 'success')
          setIsCastLoading(false)
        })
        .catch((err) => {
          const errMsg = err instanceof Error ? err.message : String(err)
          if (errMsg === 'cancel' || errMsg === 'CANCEL') {
            setIsCastLoading(false)
            return
          }
          setCastError('Cast-verzoek geweigerd. Google Home online en op hetzelfde netwerk?')
          setIsCastLoading(false)
        })
    } catch {
      setCastError('Interne Cast-fout. Vernieuw de pagina en probeer opnieuw.')
      setIsCastLoading(false)
    }
  }, [])

  const setCastVolume = useCallback((level: number) => {
    const castWindow = window as Window & ChromeCastLike
    const framework = castWindow.cast?.framework
    const session = framework?.CastContext.getInstance().getCurrentSession()
    if (!session) return
    const clamped = Math.max(0, Math.min(1, level))
    try {
      if (typeof session.setVolume === 'function') {
        session.setVolume(clamped)
      }
    } catch (err) {
      console.error('[cast] setVolume failed:', err)
    }
  }, [])

  const castPause = useCallback(() => {
    const castWindow = window as Window & ChromeCastLike
    const framework = castWindow.cast?.framework
    const session = framework?.CastContext.getInstance().getCurrentSession()
    const mediaSession = session?.getMediaSession?.()
    if (mediaSession && typeof mediaSession.pause === 'function') {
      mediaSession.pause()
    }
  }, [])

  const castPlay = useCallback(() => {
    const castWindow = window as Window & ChromeCastLike
    const framework = castWindow.cast?.framework
    const session = framework?.CastContext.getInstance().getCurrentSession()
    const mediaSession = session?.getMediaSession?.()
    if (mediaSession && typeof mediaSession.play === 'function') {
      mediaSession.play()
    }
  }, [])

  return {
    isCastAvailable,
    isCasting,
    castDeviceName,
    castError,
    isCastLoading,
    isAudioPlaying,
    setIsAudioPlaying,
    setCastError,
    connectGoogleHome,
    castToStation,
    refreshCastSession,
    setCastVolume,
    castPause,
    castPlay,
  }
}
