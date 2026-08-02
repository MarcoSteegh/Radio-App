import { useState, useRef, useCallback, useEffect } from 'react'
import type { Station } from '../types/station'
import { trackEvent } from '../lib/observability'

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
  const [volume, setVolume] = useState(0.4)
  const didManualPlayRef = useRef(false)
  const playStartTrackedIdRef = useRef<string | null>(null)
  const play3MinTimerRef = useRef<number | null>(null)
  const requestedStationRef = useRef<Station | null>(null)
  const optionsRef = useRef(options)

  useEffect(() => {
    optionsRef.current = options
  })

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
    optionsRef.current.setIsAudioPlaying(true)
    if (!selectedStation) return

    const stationId = selectedStation.stationuuid
    if (playStartTrackedIdRef.current !== stationId) {
      playStartTrackedIdRef.current = stationId
      trackEvent('play_start', {
        stationuuid: stationId,
        country: selectedStation.country,
      })
    }

    clearPlay3MinTimer()
    play3MinTimerRef.current = window.setTimeout(() => {
      if (selectedStation?.stationuuid === stationId) {
        trackEvent('play_3min', {
          stationuuid: stationId,
          country: selectedStation.country,
        })
      }
      play3MinTimerRef.current = null
    }, 180000)
  }, [selectedStation, clearPlay3MinTimer])

  const onAudioPauseLike = useCallback(() => {
    optionsRef.current.setIsAudioPlaying(false)
    clearPlay3MinTimer()
  }, [clearPlay3MinTimer])

  const onAudioError = useCallback(() => {
    const current = requestedStationRef.current ?? selectedStation
    if (!current) return
    optionsRef.current.onStationOffline(current)
  }, [selectedStation])

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
      audio.src = station.url_resolved
      audio.load()
      const playPromise = audio.play()
      if (playPromise && typeof playPromise.catch === 'function') {
        void playPromise.catch(() => {
          didManualPlayRef.current = false
        })
      }
    }
  }, [])

  return {
    audioRef,
    volume,
    setVolume,
    requestedStationRef,
    onAudioPlaying,
    onAudioPauseLike,
    onAudioError,
    playStation,
    didManualPlayRef,
  }
}
