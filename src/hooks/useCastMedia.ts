import { useCallback } from 'react'
import type { Station } from '../types/station'
import { trackEvent } from '../lib/observability'

type CastSessionLike = {
  loadMedia?: (request: unknown) => Promise<unknown>
  setVolume?: (volume: number) => Promise<unknown> | void
  getMediaSession?: () => { pause?: () => void; play?: () => void } | null
}

type ChromeCastLike = {
  cast?: {
    framework?: {
      CastContext: { getInstance: () => { getCurrentSession: () => CastSessionLike | null } }
    }
  }
  chrome?: {
    cast?: {
      media?: {
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

export async function loadMediaToSession(
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

export type CastMediaActions = {
  castToStation: (station: Station) => Promise<boolean>
  setCastVolume: (level: number) => void
  castPause: () => void
  castPlay: () => void
}

export function useCastMedia(
  setCastError: (error: string | null) => void,
  setIsAudioPlaying: (v: boolean) => void,
): CastMediaActions {
  const castToStation = useCallback(async (station: Station) => {
    const castWindow = window as Window & ChromeCastLike
    const framework = castWindow.cast?.framework
    const mediaNamespace = castWindow.chrome?.cast?.media
    const session = framework?.CastContext.getInstance().getCurrentSession()

    if (!session?.loadMedia || !mediaNamespace) return false

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
  }, [setCastError, setIsAudioPlaying])

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

  return { castToStation, setCastVolume, castPause, castPlay }
}
