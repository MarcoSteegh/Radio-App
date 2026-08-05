import { memo } from 'react'
import type { FormEvent } from 'react'
import { useI18n } from '../lib/useI18n'
import type { Locale } from '../lib/i18n'
import FilterCombobox from './FilterCombobox'

type FilterPanelProps = {
  query: string
  isLoading: boolean
  theme: 'dark' | 'light'
  countryFilter: string
  languageFilter: string
  tagFilter: string
  countryOptions: string[]
  languageOptions: string[]
  tagOptions: string[]
  isLocating: boolean
  isBluetoothConnecting: boolean
  isCasting: boolean
  isCastLoading: boolean
  isCastAvailable: boolean
  castError: string | null
  castDeviceName: string | null
  locationError: string | null
  userLocation: { lat: number; lng: number } | null
  bluetoothDeviceName: string | null
  bluetoothError: string | null
  activeOfflineCount: number
  dataStatus: 'live' | 'fallback'
  showAdmin: boolean
  onSearch: (e: FormEvent) => void
  onQueryChange: (value: string) => void
  onClearSearch: () => void
  onResetFilters: () => void
  onResetOfflineStations: () => void
  onLocateUser: () => void
  onConnectBluetooth: () => void
  onConnectGoogleHome: () => void
  onRefreshCastSession: () => void
  onShowSubmit: () => void
  onToggleAdmin: () => void
  onToggleTheme: () => void
  onFilterChange: (patch: { country?: string; language?: string; tag?: string }) => void
  locale: Locale
  onLocaleChange: (l: Locale) => void
}

function FilterPanel({
  query,
  isLoading,
  theme,
  countryFilter,
  languageFilter,
  tagFilter,
  countryOptions,
  languageOptions,
  tagOptions,
  isLocating,
  isBluetoothConnecting,
  isCasting,
  isCastLoading,
  isCastAvailable,
  castError,
  castDeviceName,
  locationError,
  userLocation,
  bluetoothDeviceName,
  bluetoothError,
  activeOfflineCount,
  dataStatus,
  showAdmin,
  onSearch,
  onQueryChange,
  onClearSearch,
  onResetFilters,
  onResetOfflineStations,
  onLocateUser,
  onConnectBluetooth,
  onConnectGoogleHome,
  onRefreshCastSession,
  onShowSubmit,
  onToggleAdmin,
  onToggleTheme,
  onFilterChange,
  locale,
  onLocaleChange,
}: FilterPanelProps) {
  const { t } = useI18n()
  return (
    <>
      <div className="brand-panel">
        <div className="brand-top-row">
          <div>
            <p className="eyebrow">Marco Steegh</p>
            <h1>{t('app.title')}</h1>
            <p className="subtitle">{t('app.subtitle')}</p>
          </div>
          <div className="toolbar-group">
            <select
              id="locale-select"
              name="locale"
              className="locale-select"
              value={locale}
              onChange={(e) => onLocaleChange(e.target.value as Locale)}
              aria-label="Locale"
            >
              <option value="nl">NL</option>
              <option value="en">EN</option>
              <option value="de">DE</option>
              <option value="fr">FR</option>
            </select>
            <button type="button" className="theme-toggle" onClick={onToggleTheme}>
              {theme === 'dark' ? '☀️ Licht' : '🌙 Donker'}
            </button>
          </div>
        </div>
      </div>
      <form className="search search-panel" onSubmit={onSearch}>
        <label htmlFor="station-search">{t('search.label')}</label>
        <div className="search-row search-row-main">
          <input
            id="station-search"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder={t('search.placeholder')}
            aria-describedby="search-help"
            autoComplete="off"
          />
          <button type="submit" disabled={isLoading}>
            {isLoading ? t('search.loading') : t('search.button')}
          </button>
          {query ? (
            <button type="button" className="secondary-btn" onClick={onClearSearch}>
              {t('search.clear')}
            </button>
          ) : null}
        </div>
        <p id="search-help" className="helper subtle">
          {t('search.help')}
        </p>
        <div className="toolbar-row">
          <div className="toolbar-group">
            <button type="button" className="secondary-btn" disabled={isLocating} onClick={onLocateUser}>
              {isLocating ? t('nav.locationing') : t('nav.location')}
            </button>
            <button type="button" className="secondary-btn" disabled={isBluetoothConnecting} onClick={onConnectBluetooth}>
              {isBluetoothConnecting ? t('nav.bluetoothConnecting') : t('nav.bluetooth')}
            </button>
            <button type="button" className="secondary-btn" disabled={isCasting} onClick={onConnectGoogleHome}>
              {isCasting ? t('nav.googleHomeConnecting') : t('nav.googleHome')}
            </button>
            {castError && castDeviceName === null ? (
              <button type="button" className="secondary-btn" disabled={isCastLoading} onClick={onRefreshCastSession}>
                {isCastLoading ? t('nav.castRefreshing') : t('nav.cast')}
              </button>
            ) : null}
          </div>
          <div className="toolbar-group">
            <button type="button" className="secondary-btn" onClick={onShowSubmit}>
              {t('nav.submit')}
            </button>
            <button type="button" className="secondary-btn" onClick={onToggleAdmin}>
              {showAdmin ? t('nav.adminClose') : t('nav.admin')}
            </button>
          </div>
        </div>
        <div className="filter-actions">
          <button type="button" className="secondary-btn" onClick={onResetFilters}>
            {t('filter.reset')}
          </button>
          <button type="button" className="secondary-btn" onClick={onResetOfflineStations}>
            {t('filter.resetOffline')}
          </button>
        </div>
        <div className="status-stack">
          {locationError ? <p className="helper error-text">{locationError}</p> : null}
          {userLocation ? (
            <p className="helper">
              {t('status.locating')} {userLocation.lat.toFixed(2)}, {userLocation.lng.toFixed(2)}
            </p>
          ) : null}
          {bluetoothDeviceName ? <p className="helper">{t('status.bluetooth')} {bluetoothDeviceName}</p> : null}
          {bluetoothError ? <p className="helper error-text">{bluetoothError}</p> : null}
          {castDeviceName ? <p className="helper">{t('status.googleHome')} {castDeviceName}</p> : null}
          {castError ? <p className="helper error-text">{castError}</p> : null}
          {isCastLoading && !isCastAvailable ? <p className="helper">{t('status.castInit')}</p> : null}
          {activeOfflineCount > 0 ? (
            <p className="helper">{activeOfflineCount} {t('status.offlineHidden')}</p>
          ) : null}
          <p className={`helper ${dataStatus === 'fallback' ? 'error-text' : ''}`}>
            {dataStatus === 'fallback' ? t('status.fallbackData') : t('status.liveData')}
          </p>
        </div>
        <div className="filter-grid">
          <FilterCombobox
            label={t('filter.country')}
            value={countryFilter}
            options={countryOptions}
            allLabel={t('filter.allCountries')}
            onChange={(val) => onFilterChange({ country: val })}
          />
          <FilterCombobox
            label={t('filter.language')}
            value={languageFilter}
            options={languageOptions}
            allLabel={t('filter.allLanguages')}
            onChange={(val) => onFilterChange({ language: val })}
          />
          <FilterCombobox
            label={t('filter.tag')}
            value={tagFilter}
            options={tagOptions}
            allLabel={t('filter.allTags')}
            onChange={(val) => onFilterChange({ tag: val })}
          />
        </div>
      </form>
    </>
  )
}

export default memo(FilterPanel)
