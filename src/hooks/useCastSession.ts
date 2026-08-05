import { useState, useCallback, useEffect } from 'react'
import type { Station } from '../types/station'
import { trackEvent } from '../lib/observability'
import type { loadMediaToSession } from './useCastMedia'

type CastSessionLike = {
  getCastDevice?: () => { friendlyName?: string }
  loadMedia?: (request: unknown) => Promise<unknown>
  getMediaSession?: () => { pause?: () => void; play?: () => void } | null
}

type CastContextLike = {
  setOptions: (options: { receiverApplicationId: string; autoJoinPolicy: string }) => void
  requestSession: () => Promise<unknown>
  getCurrentSession: () => CastSessionLike | null
  addEventListener: (eventType: string, handler: (event: { sessionState: string }) => void) => void
  removeEventListener: (eventType: string, handler: (event: { sessionState: string }) => void) => void
}

type ChromeCastLike = {
  cast?: {
    framework?: {
      CastContext: { getInstance: () => CastContextLike }
      SessionState?: { SESSION_STARTED: string; SESSION_RESUMED: string; SESSION_ENDING: string; SESSION_ENDED: string; NO_SESSION: string }
      CastContextEventType?: { SESSION_STATE_CHANGED: string }
    }
  }
  chrome?: {
    cast?: {
      media?: { DEFAULT_MEDIA_RECEIVER_APP_ID?: string }
    }
  }
}

type LoadMediaFn = typeof loadMediaToSession

export type CastSessionState = {
  isCasting: boolean
  castDeviceName: string | null
  isAudioPlaying: boolean
  setIsAudioPlaying: (v: boolean) => void
  connectGoogleHome: (showToast: (text: string, tone: 'info' | 'success' | 'error') => void) => Promise<void>
  refreshCastSession: (showToast: (text: string, tone: 'info' | 'success' | 'error') => void) => void
}

export function useCastSession(
  isCastAvailable: boolean,
  isCastLoading: boolean,
  setCastError: (error: string | null) => void,
  selectedStation: Station | null,
  loadMediaToSession: LoadMediaFn,
): CastSessionState {
  const [isCasting, setIsCasting] = useState(false)
  const [castDeviceName, setCastDeviceName] = useState<string | null>(null)
  const [isAudioPlaying, setIsAudioPlaying] = useState(false)

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
  }, [isCastAvailable, setCastError])

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
  }, [isCastAvailable, isCastLoading, selectedStation, setCastError, loadMediaToSession])

  const refreshCastSession = useCallback((showToast: (text: string, tone: 'info' | 'success' | 'error') => void) => {
    const castWindow = window as Window & ChromeCastLike
    const framework = castWindow.cast?.framework

    if (!framework) {
      setCastError('Cast framework ontbreekt. Vernieuw de pagina en probeer opnieuw.')
      return
    }

    setCastError(null)

    try {
      const castContext = framework.CastContext.getInstance()
      if (!castContext) {
        setCastError('Cast context kon niet worden opgehaald. Vernieuw de pagina.')
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
            return
          }

          const deviceName = session.getCastDevice?.().friendlyName ?? 'Google Home'
          setCastDeviceName(deviceName)
          setCastError(null)
          showToast(`Verbonden met ${deviceName}.`, 'success')
        })
        .catch((err) => {
          const errMsg = err instanceof Error ? err.message : String(err)
          if (errMsg === 'cancel' || errMsg === 'CANCEL') return
          setCastError('Cast-verzoek geweigerd. Google Home online en op hetzelfde netwerk?')
        })
    } catch {
      setCastError('Interne Cast-fout. Vernieuw de pagina en probeer opnieuw.')
    }
  }, [setCastError])

  return {
    isCasting,
    castDeviceName,
    isAudioPlaying,
    setIsAudioPlaying,
    connectGoogleHome,
    refreshCastSession,
  }
}
