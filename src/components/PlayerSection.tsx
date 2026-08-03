import type { ChangeEvent, RefObject } from 'react'
import type { Station, Toast } from '../types/station'

type PlayerSectionProps = {
  selectedStation: Station | null
  audioRef: RefObject<HTMLAudioElement | null>
  isAudioPlaying: boolean
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
  onStationOffline: (station: Station) => boolean
  onCanPlay: () => void
  onSetIsAudioPlaying: (playing: boolean) => void
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
  onStationOffline,
  onCanPlay,
  onSetIsAudioPlaying,
  onSleepTimer,
  onDismissToast,
  onExportFavorites,
  onTriggerImport,
  onImportFavorites,
}: PlayerSectionProps) {
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
          Export
        </button>
        <button type="button" className="mini-action" onClick={onTriggerImport}>
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
              {selectedStation.language || 'Onbekende taal'} · {selectedStation.tags || 'Algemeen'}
            </p>
            <div className="station-actions-row">
              <button type="button" className="fav-toggle" onClick={() => onToggleFavorite(selectedStation)}>
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
            onCanPlay={onCanPlay}
            onPlay={() => onSetIsAudioPlaying(true)}
            onPause={() => onSetIsAudioPlaying(false)}
          >
            Je browser ondersteunt geen audio streaming.
          </audio>

          {isAudioPlaying && (
            <div className="sleep-timer-row">
              <div className="sleep-presets">
                <span className="sleep-label">Sleep timer:</span>
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
