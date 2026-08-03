import type { FormEvent } from 'react'

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
}

export default function FilterPanel({
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
}: FilterPanelProps) {
  return (
    <>
      <div className="brand-panel">
        <div className="brand-top-row">
          <div>
            <p className="eyebrow">Marco Steegh</p>
            <h1>World Radio Explorer</h1>
            <p className="subtitle">Ontdek radiostations op de kaart en luister direct live.</p>
          </div>
          <button type="button" className="theme-toggle" onClick={onToggleTheme}>
            {theme === 'dark' ? '☀️ Licht' : '🌙 Donker'}
          </button>
        </div>
      </div>
      <form className="search search-panel" onSubmit={onSearch}>
        <label htmlFor="station-search">Zoek station, genre of stad</label>
        <div className="search-row search-row-main">
          <input
            id="station-search"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="bijv. rock, Malaga, news"
            aria-describedby="search-help"
          />
          <button type="submit" disabled={isLoading}>
            {isLoading ? 'Laden...' : 'Zoeken'}
          </button>
          {query ? (
            <button type="button" className="secondary-btn" onClick={onClearSearch}>
              Wis
            </button>
          ) : null}
        </div>
        <p id="search-help" className="helper subtle">
          Zoekopdracht en filters worden opgeslagen in je browser.
        </p>
        <div className="toolbar-row">
          <div className="toolbar-group">
            <button type="button" className="secondary-btn" disabled={isLocating} onClick={onLocateUser}>
              {isLocating ? 'Locatie...' : 'Mijn locatie'}
            </button>
            <button type="button" className="secondary-btn" disabled={isBluetoothConnecting} onClick={onConnectBluetooth}>
              {isBluetoothConnecting ? 'Bluetooth...' : 'Bluetooth'}
            </button>
            <button type="button" className="secondary-btn" disabled={isCasting} onClick={onConnectGoogleHome}>
              {isCasting ? 'Google Home...' : 'Google Home'}
            </button>
            {castError && castDeviceName === null ? (
              <button type="button" className="secondary-btn" disabled={isCastLoading} onClick={onRefreshCastSession}>
                {isCastLoading ? 'Vernieuwen...' : 'Cast'}
              </button>
            ) : null}
          </div>
          <div className="toolbar-group">
            <button type="button" className="secondary-btn" onClick={onShowSubmit}>
              Station toevoegen
            </button>
            <button type="button" className="secondary-btn" onClick={onToggleAdmin}>
              {showAdmin ? 'Sluit admin' : 'Admin'}
            </button>
          </div>
        </div>
        <div className="filter-actions">
          <button type="button" className="secondary-btn" onClick={onResetFilters}>
            Reset filters
          </button>
          <button type="button" className="secondary-btn" onClick={onResetOfflineStations}>
            Check offline opnieuw
          </button>
        </div>
        <div className="status-stack">
          {locationError ? <p className="helper error-text">{locationError}</p> : null}
          {userLocation ? (
            <p className="helper">
              Locatie actief: {userLocation.lat.toFixed(2)}, {userLocation.lng.toFixed(2)}
            </p>
          ) : null}
          {bluetoothDeviceName ? <p className="helper">Bluetooth gekoppeld: {bluetoothDeviceName}</p> : null}
          {bluetoothError ? <p className="helper error-text">{bluetoothError}</p> : null}
          {castDeviceName ? <p className="helper">Google Home gekoppeld: {castDeviceName}</p> : null}
          {castError ? <p className="helper error-text">{castError}</p> : null}
          {isCastLoading && !isCastAvailable ? <p className="helper">Google Cast initialiseert...</p> : null}
          {activeOfflineCount > 0 ? (
            <p className="helper">{activeOfflineCount} stations tijdelijk verborgen wegens streamfouten.</p>
          ) : null}
          <p className={`helper ${dataStatus === 'fallback' ? 'error-text' : ''}`}>
            {dataStatus === 'fallback' ? 'Gebruik lokale fallback-data vanwege API-problemen.' : 'Live data actief.'}
          </p>
        </div>
        <div className="filter-grid">
          <label>
            Land
            <select value={countryFilter} onChange={(event) => onFilterChange({ country: event.target.value })}>
              <option value="all">Alle landen</option>
              {countryOptions.map((country) => (
                <option key={country} value={country}>{country}</option>
              ))}
            </select>
          </label>
          <label>
            Taal
            <select value={languageFilter} onChange={(event) => onFilterChange({ language: event.target.value })}>
              <option value="all">Alle talen</option>
              {languageOptions.map((language) => (
                <option key={language} value={language}>{language}</option>
              ))}
            </select>
          </label>
          <label>
            Tag
            <select value={tagFilter} onChange={(event) => onFilterChange({ tag: event.target.value })}>
              <option value="all">Alle tags</option>
              {tagOptions.map((tag) => (
                <option key={tag} value={tag}>{tag}</option>
              ))}
            </select>
          </label>
        </div>
      </form>
    </>
  )
}
