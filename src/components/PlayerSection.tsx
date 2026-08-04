import type { ChangeEvent, RefObject } from 'react'
import type { Station, Toast } from '../types/station'
import { useI18n } from '../lib/useI18n'

type PlayerSectionProps = {
  selectedStation: Station | null
  audioRef: RefObject<HTMLAudioElement | null>
  isAudioPlaying: boolean
  volume: number
  onVolumeChange: (v: number) => void
  sleepEndsAt: number | null
  favoriteIdSet: Set<string>
  filteredRecentlyPlayed: Station[]
  fallbackMessage: string | null
  recoveryMessage: string | null
  error: string | null
  toast: Toast | null
  importInputRef: RefObject<HTMLInputElement | null>
  onToggleFavorite: (station: Station) => void
  onSelectStation: (station: Station) => void
  onCanPlay: () => void
  onPlaying: () => void
  onPause: () => void
  onError: () => void
  onEnsureAudioContext: () => void
  onSetIsAudioPlaying: (playing: boolean) => void
  onCastPause: () => void
  onCastPlay: () => void
  onSleepTimer: (minutes: number) => void
  onDismissToast: () => void
  onExportFavorites: () => void
  onTriggerImport: () => void
  onImportFavorites: (e: ChangeEvent<HTMLInputElement>) => void
}

export default function PlayerSection({
  selectedStation,
  audioRef,
  isAudioPlaying,
  volume,
  onVolumeChange,
  sleepEndsAt,
  favoriteIdSet,
  filteredRecentlyPlayed,
  fallbackMessage,
  recoveryMessage,
  error,
  toast,
  importInputRef,
  onToggleFavorite,
  onSelectStation,
  onCanPlay,
  onPlaying,
  onPause,
  onError,
  onEnsureAudioContext,
  onSetIsAudioPlaying,
  onCastPause,
  onCastPlay,
  onSleepTimer,
  onDismissToast,
  onExportFavorites,
  onTriggerImport,
  onImportFavorites,
}: PlayerSectionProps) {
  const { t } = useI18n()

  const togglePlayback = () => {
    const audio = audioRef.current
    if (!audio) return
    if (isAudioPlaying) {
      audio.pause()
      onCastPause()
    } else {
      onEnsureAudioContext()
      audio.play().catch(() => {})
      onCastPlay()
    }
  }

  return (
    <>
      {error && <p className="error">{error}</p>}

      {toast ? (
        <div className={`toast toast-${toast.tone}`} role="status" aria-live="polite">
          <span>{toast.text}</span>
          <button type="button" className="toast-close" onClick={onDismissToast} aria-label="Sluit melding">
            x
          </button>
        </div>
      ) : null}

      {fallbackMessage ? (
        <p className="helper error-text" role="status">{fallbackMessage}</p>
      ) : null}

      {recoveryMessage ? (
        <p className="helper success-text" role="status">{recoveryMessage}</p>
      ) : null}

      <div className="favorites-tools">
        <button type="button" className="mini-action" onClick={onExportFavorites}>
          {t('player.export')}
        </button>
        <button type="button" className="mini-action" onClick={onTriggerImport}>
          {t('player.import')}
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
            <p className="eyebrow">{t('player.nowPlaying')}</p>
            <h2>{selectedStation.name}</h2>
            <p>
              {selectedStation.country}
              {selectedStation.state ? `, ${selectedStation.state}` : ''}
            </p>
            <p className="meta">
              {selectedStation.language || t('player.unknownLanguage')} · {selectedStation.tags || t('player.unknownTags')}
            </p>
            <div className="station-actions-row">
              <button type="button" className="fav-toggle" onClick={() => onToggleFavorite(selectedStation)}>
                {favoriteIdSet.has(selectedStation.stationuuid) ? t('player.favoriteRemove') : t('player.favoriteAdd')}
              </button>
            </div>
          </div>

          <audio
            ref={audioRef}
            autoPlay
            preload="none"
            aria-label={selectedStation.name}
            onError={onError}
            onCanPlay={onCanPlay}
            onPlaying={onPlaying}
            onPlay={() => onSetIsAudioPlaying(true)}
            onPause={onPause}
            className="hidden-audio"
          >
            Je browser ondersteunt geen audio streaming.
          </audio>

          <div className="player-controls">
            <button
              type="button"
              className="play-btn"
              onClick={togglePlayback}
              aria-label={isAudioPlaying ? 'Pauzeer' : 'Speel af'}
            >
              {isAudioPlaying ? '⏸' : '▶'}
            </button>

            <div className="volume-row">
              <span className="volume-label" aria-hidden="true">
                {volume === 0 ? '🔇' : volume < 0.5 ? '🔉' : '🔊'}
              </span>
              <input
                type="range"
                className="volume-slider"
                min={0}
                max={1}
                step={0.01}
                value={volume}
                onChange={(e) => onVolumeChange(Number(e.target.value))}
                aria-label="Volume"
              />
              <span className="volume-value">{Math.round(volume * 100)}%</span>
            </div>
          </div>

          {isAudioPlaying && (
            <div className="sleep-timer-row">
              <div className="sleep-presets">
                <span className="sleep-label">{t('player.sleepTimer')}</span>
                {[15, 30, 45, 60].map((minutes) => (
                  <button key={minutes} type="button" className="mini-action" onClick={() => onSleepTimer(minutes)}>
                    {minutes}m
                  </button>
                ))}
                {sleepEndsAt && (
                  <button type="button" className="mini-action" onClick={() => onSleepTimer(0)}>
                    Stop
                  </button>
                )}
              </div>
              {sleepEndsAt && (
                <p className="sleep-label">
                  {t('player.sleepActive')} {new Date(sleepEndsAt).toLocaleTimeString()}
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
                    className={station.stationuuid === selectedStation.stationuuid ? 'station active' : 'station'}
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
                    onClick={() => onToggleFavorite(station)}
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
    </>
  )
}
