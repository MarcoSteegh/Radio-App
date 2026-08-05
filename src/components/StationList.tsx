import { useRef, useState, useCallback } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import StationRow from './StationRow'
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

const FAVORITES_VIRTUAL_THRESHOLD = 30

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
  const favScrollRef = useRef<HTMLDivElement | null>(null)
  const [activeIndex, setActiveIndex] = useState(-1)

  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: filteredStations.length,
    getScrollElement: () => virtualScrollRef.current,
    estimateSize: () => 52,
    overscan: 10,
  })

  const useFavVirtualizer = favoriteStations.length > FAVORITES_VIRTUAL_THRESHOLD
  const favVirtualizer = useVirtualizer({
    count: favoriteStations.length,
    getScrollElement: () => favScrollRef.current,
    estimateSize: () => 52,
    overscan: 10,
    enabled: useFavVirtualizer,
  })

  const handleListKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setActiveIndex((prev) => {
          const next = Math.min(prev + 1, filteredStations.length - 1)
          virtualizer.scrollToIndex(next, { align: 'auto' })
          return next
        })
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setActiveIndex((prev) => {
          const next = Math.max(prev - 1, 0)
          virtualizer.scrollToIndex(next, { align: 'auto' })
          return next
        })
      } else if ((e.key === 'Enter' || e.key === ' ') && activeIndex >= 0) {
        e.preventDefault()
        onSelectStation(filteredStations[activeIndex])
      }
    },
    [activeIndex, filteredStations, onSelectStation, virtualizer],
  )

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
            <StationRow
              key={`offline-${item.station.stationuuid}`}
              station={item.station}
              isSelected={false}
              isFavorite={false}
              offlineUntil={item.offlineUntil}
              onSelect={() => onSelectStation(item.station)}
              onRestore={() => onRestoreOfflineStation(item.station.stationuuid)}
            />
          ))}
        </section>
      ) : null}

      {favoriteStations.length > 0 ? (
        <section className="station-section">
          <h3>{t('list.favorites')} ({favoriteStations.length})</h3>
          {useFavVirtualizer ? (
            <div ref={favScrollRef} className="virtual-list-scroll" style={{ maxHeight: '320px' }}>
              <div style={{ height: `${favVirtualizer.getTotalSize()}px`, position: 'relative' }}>
                {favVirtualizer.getVirtualItems().map((virtualRow) => {
                  const station = favoriteStations[virtualRow.index]
                  return (
                    <div
                      key={station.stationuuid}
                      style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '100%',
                        height: `${virtualRow.size}px`,
                        transform: `translateY(${virtualRow.start}px)`,
                      }}
                    >
                      <StationRow
                        station={station}
                        isSelected={station.stationuuid === selectedStation?.stationuuid}
                        isFavorite={favoriteIdSet.has(station.stationuuid)}
                        onSelect={() => onSelectStation(station)}
                        onToggleFavorite={() => onToggleFavorite(station)}
                      />
                    </div>
                  )
                })}
              </div>
            </div>
          ) : (
            favoriteStations.map((station) => (
              <StationRow
                key={`fav-${station.stationuuid}`}
                station={station}
                isSelected={station.stationuuid === selectedStation?.stationuuid}
                isFavorite={favoriteIdSet.has(station.stationuuid)}
                onSelect={() => onSelectStation(station)}
                onToggleFavorite={() => onToggleFavorite(station)}
              />
            ))
          )}
        </section>
      ) : null}

      {!isLoading && nearbyStations.length > 0 ? (
        <section className="station-section">
          <h3>{t('list.nearby')} ({nearbyStations.length})</h3>
          {nearbyStations.map((station) => (
            <StationRow
              key={`near-${station.stationuuid}`}
              station={station}
              isSelected={station.stationuuid === selectedStation?.stationuuid}
              isFavorite={favoriteIdSet.has(station.stationuuid)}
              subtitle={`${station.country} · ${station.distanceKm.toFixed(0)} km`}
              onSelect={() => onSelectStation(station)}
              onToggleFavorite={() => onToggleFavorite(station)}
            />
          ))}
        </section>
      ) : null}

      {!isLoading ? (
        <section className="station-section">
          <h3>{t('list.topResults')} ({filteredStations.length})</h3>
          <div
            ref={virtualScrollRef}
            className="virtual-list-scroll"
            role="listbox"
            aria-label={t('list.topResults')}
            tabIndex={0}
            onKeyDown={handleListKeyDown}
          >
            <div style={{ height: `${virtualizer.getTotalSize()}px`, position: 'relative' }}>
              {virtualizer.getVirtualItems().map((virtualRow) => {
                const station = filteredStations[virtualRow.index]
                const isActive = virtualRow.index === activeIndex
                return (
                  <div
                    key={station.stationuuid}
                    id={`station-option-${station.stationuuid}`}
                    role="option"
                    aria-selected={station.stationuuid === selectedStation?.stationuuid}
                    data-active={isActive || undefined}
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      height: `${virtualRow.size}px`,
                      transform: `translateY(${virtualRow.start}px)`,
                    }}
                  >
                    <StationRow
                      station={station}
                      isSelected={station.stationuuid === selectedStation?.stationuuid}
                      isFavorite={favoriteIdSet.has(station.stationuuid)}
                      subtitle={`${station.country} · ${station.clickcount} plays`}
                      onSelect={() => onSelectStation(station)}
                      onToggleFavorite={() => onToggleFavorite(station)}
                    />
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
