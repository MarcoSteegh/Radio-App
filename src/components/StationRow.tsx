import { memo } from 'react'
import OfflineCountdown from './OfflineCountdown'
import { useI18n } from '../lib/useI18n'
import type { Station } from '../types/station'

type StationRowProps = {
  station: Station
  isSelected: boolean
  isFavorite: boolean
  subtitle?: string
  offlineUntil?: number
  onSelect: () => void
  onToggleFavorite?: () => void
  onRestore?: () => void
}

function StationRow({
  station,
  isSelected,
  isFavorite,
  subtitle,
  offlineUntil,
  onSelect,
  onToggleFavorite,
  onRestore,
}: StationRowProps) {
  const { t } = useI18n()

  return (
    <div className="station-row">
      <button
        type="button"
        className={isSelected ? 'station active' : 'station'}
        onClick={onSelect}
      >
        <span className="station-marker" aria-hidden="true" />
        <span className="station-text">
          <span className="station-title">{station.name}</span>
          <small>{subtitle ?? station.country}</small>
          {offlineUntil != null && onRestore ? (
            <small>
              {station.country} · opnieuw over{' '}
              <OfflineCountdown
                offlineUntil={offlineUntil}
                onExpire={onRestore}
              />
            </small>
          ) : null}
        </span>
      </button>
      {onToggleFavorite ? (
        <button
          type="button"
          className="mini-action"
          onClick={onToggleFavorite}
          aria-label={isFavorite ? `${t('player.favoriteRemove')} ${station.name}` : `${t('player.favoriteAdd')} ${station.name}`}
        >
          {isFavorite ? '★' : '☆'}
        </button>
      ) : null}
      {onRestore ? (
        <button
          type="button"
          className="mini-action"
          onClick={onRestore}
          aria-label={`${t('list.restore')} ${station.name}`}
        >
          ↺
        </button>
      ) : null}
    </div>
  )
}

export default memo(StationRow)
