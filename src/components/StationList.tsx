import { useRef } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import OfflineCountdown from './OfflineCountdown'
import { useI18n } from '../lib/useI18n'
import type { NearbyStation, Station } from '../types/station'

type OfflineEntry = { station: Station; msRemaining: number; offlineUntil: number }

type StationListProps = {
  isLoading: boolean
  filteredStations: Station[]
  offlineStations: OfflineEntry[]
  favoriteStations: Station[]
  nearbyStations: NearbyStation[]
  selectedStation: Station | null
  favoriteIdSet: Set<string>
  query: string
  onSelectStation: (station: Station) => void
  onToggleFavorite: (station: Station) => void
  onRestoreOfflineStation: (id: string) => void
  onResetFilters: () => void
  onClearSearch: () => void
}

export default function StationList({
  isLoading,
  filteredStations,
  offlineStations,
  favoriteStations,
  nearbyStations,
  selectedStation,
  favoriteIdSet,
  query,
  onSelectStation,
  onToggleFavorite,
  onRestoreOfflineStation,
  onResetFilters,
  onClearSearch,
}: StationListProps) {
  "use no memo"
  const { t } = useI18n()
  const virtualScrollRef = useRef<HTMLDivElement | null>(null)
  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: filteredStations.length,
    getScrollElement: () => virtualScrollRef.current,
    estimateSize: () => 52,
    overscan: 10,
  })

  return (
    <div className="station-list" id="station-list" role="region" aria-label="Stations">
      {isLoading ? (
        <section className="station-section" aria-label="Stations laden">
          <h3>{t('list.loading')}</h3>
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
          <h3>{t('list.empty')}</h3>
          <p>{t('list.emptyHint')}</p>
          <div className="empty-state-actions">
            <button type="button" className="secondary-btn" onClick={onResetFilters}>
              {t('filter.reset')}
            </button>
            {query ? (
              <button type="button" className="secondary-btn" onClick={onClearSearch}>
                {t('list.emptyClear')}
              </button>
            ) : null}
          </div>
        </section>
      ) : null}

      {offlineStations.length > 0 ? (
        <section className="station-section">
          <h3>{t('list.offline')} ({offlineStations.length})</h3>
          {offlineStations.map((item) => (
            <div className="station-row" key={`offline-${item.station.stationuuid}`}>
              <button type="button" className="station" onClick={() => onSelectStation(item.station)}>
                <span className="station-marker" aria-hidden="true" />
                <span className="station-text">
                  <span className="station-title">{item.station.name}</span>
                  <small>
                    {item.station.country} · opnieuw over{' '}
                    <OfflineCountdown
                      offlineUntil={item.offlineUntil}
                      onExpire={() => onRestoreOfflineStation(item.station.stationuuid)}
                    />
                  </small>
                </span>
              </button>
              <button
                type="button"
                className="mini-action"
                onClick={() => onRestoreOfflineStation(item.station.stationuuid)}
                aria-label={`Herstel ${item.station.name}`}
              >
                ↺
              </button>
            </div>
          ))}
        </section>
      ) : null}

      {favoriteStations.length > 0 ? (
        <section className="station-section">
          <h3>{t('list.favorites')} ({favoriteStations.length})</h3>
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
                onClick={() => onToggleFavorite(station)}
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
          <h3>{t('list.nearby')} ({nearbyStations.length})</h3>
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
                onClick={() => onToggleFavorite(station)}
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
          <h3>{t('list.topResults')} ({filteredStations.length})</h3>
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
                      onClick={() => onToggleFavorite(station)}
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
  )
}
