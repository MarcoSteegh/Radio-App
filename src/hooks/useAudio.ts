import { useState, useRef, useCallback, useEffect } from 'react'
import type { Station } from '../types/station'
import { trackEvent } from '../lib/observability'

const hasAudioContext = typeof AudioContext !== 'undefined' || typeof (globalThis as Record<string, unknown>).webkitAudioContext !== 'undefined'

export function useAudio(
  selectedStation: Station | null,
  options: {
    onStationOffline: (station: Station) => boolean
    onFallbackExhausted: () => void
    onFallbackTriggered: (from: Station, to: Station) => void
    filteredStations: Station[]
    setIsAudioPlaying: (playing: boolean) => void
  },
) {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [volume, setVolumeState] = useState(0.4)
  const [isBuffering, setIsBuffering] = useState(false)
  const volumeRef = useRef(0.4)
  const didManualPlayRef = useRef(false)
  const playStartTrackedIdRef = useRef<string | null>(null)
  const play3MinTimerRef = useRef<number | null>(null)
  const requestedStationRef = useRef<Station | null>(null)
  const selectedStationRef = useRef(selectedStation)
  const optionsRef = useRef(options)

  const audioCtxRef = useRef<AudioContext | null>(null)
  const gainNodeRef = useRef<GainNode | null>(null)
  const sourceNodeRef = useRef<MediaElementAudioSourceNode | null>(null)
  const sourceConnectedRef = useRef(false)

  useEffect(() => {
    optionsRef.current = options
  })

  useEffect(() => {
    selectedStationRef.current = selectedStation
  })

  const ensureAudioContext = useCallback(() => {
    if (!hasAudioContext) return
    const audio = audioRef.current
    if (!audio) return

    if (!audioCtxRef.current) {
      const Ctor = (globalThis.AudioContext ?? (globalThis as Record<string, unknown>).webkitAudioContext) as typeof AudioContext
      audioCtxRef.current = new Ctor()
      gainNodeRef.current = audioCtxRef.current.createGain()
      gainNodeRef.current.gain.value = volumeRef.current
      gainNodeRef.current.connect(audioCtxRef.current.destination)
    }

    if (audioCtxRef.current.state === 'suspended') {
      audioCtxRef.current.resume().catch(() => {})
    }

    if (!sourceConnectedRef.current && gainNodeRef.current) {
      try {
        sourceNodeRef.current = audioCtxRef.current!.createMediaElementSource(audio)
        sourceNodeRef.current.connect(gainNodeRef.current)
        sourceConnectedRef.current = true
      } catch {
        // Already connected or CORS issue
      }
    }
  }, [])

  const setVolume = useCallback((v: number) => {
    volumeRef.current = v
    setVolumeState(v)
    if (gainNodeRef.current) {
      gainNodeRef.current.gain.value = v
    }
    const audio = audioRef.current
    if (audio) audio.volume = v
  }, [])

  const clearPlay3MinTimer = useCallback(() => {
    if (play3MinTimerRef.current !== null) {
      window.clearTimeout(play3MinTimerRef.current)
      play3MinTimerRef.current = null
    }
  }, [])

  useEffect(() => {
    return () => {
      clearPlay3MinTimer()
    }
  }, [clearPlay3MinTimer])

  const onAudioPlaying = useCallback(() => {
    setIsBuffering(false)
    optionsRef.current.setIsAudioPlaying(true)
    ensureAudioContext()
    const audio = audioRef.current
    if (audio && audio.volume !== volumeRef.current) {
      audio.volume = volumeRef.current
    }
    if (gainNodeRef.current) {
      gainNodeRef.current.gain.value = volumeRef.current
    }
    const current = selectedStationRef.current
    if (!current) return

    const stationId = current.stationuuid
    if (playStartTrackedIdRef.current !== stationId) {
      playStartTrackedIdRef.current = stationId
      trackEvent('play_start', {
        stationuuid: stationId,
        country: current.country,
      })
    }

    clearPlay3MinTimer()
    play3MinTimerRef.current = window.setTimeout(() => {
      if (selectedStationRef.current?.stationuuid === stationId) {
        trackEvent('play_3min', {
          stationuuid: stationId,
          country: current.country,
        })
      }
      play3MinTimerRef.current = null
    }, 180000)
  }, [clearPlay3MinTimer, ensureAudioContext])

  const onAudioPauseLike = useCallback(() => {
    setIsBuffering(false)
    optionsRef.current.setIsAudioPlaying(false)
    clearPlay3MinTimer()
  }, [clearPlay3MinTimer])

  const onAudioWaiting = useCallback(() => {
    setIsBuffering(true)
  }, [])

  const onAudioCanPlayThrough = useCallback(() => {
    setIsBuffering(false)
  }, [])

  const onAudioError = useCallback(() => {
    const current = requestedStationRef.current ?? selectedStationRef.current
    if (!current) return
    optionsRef.current.onStationOffline(current)
  }, [])

  const playStation = useCallback((station: Station) => {
    requestedStationRef.current = station

    trackEvent('station_select', {
      stationuuid: station.stationuuid,
      country: station.country,
    })

    try {
      localStorage.setItem('world-radio-explorer-last-station', JSON.stringify(station))
    } catch (err) {
      console.error(err)
    }

    history.replaceState({}, '', `?station=${station.stationuuid}`)

    const audio = audioRef.current
    if (audio && station.url_resolved) {
      didManualPlayRef.current = true
      audio.pause()
      audio.src = `/api/audio-proxy?url=${encodeURIComponent(station.url_resolved)}`
      audio.volume = volumeRef.current

      ensureAudioContext()

      audio.load()
      const playPromise = audio.play()
      if (playPromise && typeof playPromise.catch === 'function') {
        void playPromise.catch(() => {
          didManualPlayRef.current = false
        })
      }
    }
  }, [ensureAudioContext])

  useEffect(() => {
    if (!('mediaSession' in navigator)) return
    const station = selectedStation
    if (!station) return
    navigator.mediaSession.metadata = new MediaMetadata({
      title: station.name,
      artist: station.country,
      album: 'World Radio Explorer',
      artwork: station.favicon ? [{ src: station.favicon, sizes: '96x96', type: 'image/png' }] : [],
    })
  }, [selectedStation])

  useEffect(() => {
    if (!('mediaSession' in navigator)) return
    navigator.mediaSession.setActionHandler('play', () => { audioRef.current?.play() })
    navigator.mediaSession.setActionHandler('pause', () => { audioRef.current?.pause() })
    navigator.mediaSession.setActionHandler('stop', () => { audioRef.current?.pause() })
    return () => {
      navigator.mediaSession.setActionHandler('play', null)
      navigator.mediaSession.setActionHandler('pause', null)
      navigator.mediaSession.setActionHandler('stop', null)
    }
  }, [])

  return {
    audioRef,
    volume,
    setVolume,
    isBuffering,
    requestedStationRef,
    onAudioPlaying,
    onAudioPauseLike,
    onAudioError,
    onAudioWaiting,
    onAudioCanPlayThrough,
    playStation,
    didManualPlayRef,
    ensureAudioContext,
  }
}
