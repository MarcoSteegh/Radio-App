import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import { I18nProvider } from './lib/i18n'
import App from './App'

vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: ({ count }: { count: number }) => ({
    getTotalSize: () => count * 52,
    getVirtualItems: () =>
      Array.from({ length: count }, (_, index) => ({
        index,
        start: index * 52,
      })),
  }),
}))

const mockLeafletMap = {
  addLayer: vi.fn(),
  removeLayer: vi.fn(),
  flyTo: vi.fn(),
}

const mockMapInstance = {
  getBounds: () => ({
    getNorth: () => 90,
    getSouth: () => -90,
    getEast: () => 180,
    getWest: () => -180,
  }),
  getZoom: () => 2,
}

vi.mock('react-leaflet', () => ({
  MapContainer: ({ children }: { children: ReactNode }) => (
    <div data-testid="map-container">{children}</div>
  ),
  useMapEvents: () => mockMapInstance,
  useMap: () => mockLeafletMap,
  TileLayer: () => null,
  CircleMarker: ({ children }: { children?: ReactNode }) => (
    <div>{children}</div>
  ),
  Popup: ({ children }: { children?: ReactNode }) => <>{children}</>,
}))

vi.mock('leaflet', () => ({
  default: {
    markerClusterGroup: () => ({
      addLayer: vi.fn(),
      on: vi.fn(),
    }),
    marker: () => ({
      on: vi.fn(),
      bindPopup: vi.fn(),
      bindTooltip: vi.fn(),
    }),
    divIcon: () => ({}),
    point: (x: number, y: number) => ({ x, y }),
  },
}))

vi.mock('leaflet.markercluster', () => ({}))
vi.mock('leaflet.markercluster/dist/MarkerCluster.css', () => ({}))

vi.mock('./components/OfflineCountdown', () => ({
  default: () => <span>offline</span>,
}))

const stationFixture = [
  {
    stationuuid: 's1',
    name: 'Jazz NL',
    country: 'Netherlands',
    state: '',
    favicon: '',
    url_resolved: 'https://stream.example/1',
    language: 'dutch',
    tags: 'jazz,news',
    votes: 10,
    clickcount: 15,
    lastcheckok: 1,
    geo_lat: 52.37,
    geo_long: 4.9,
  },
  {
    stationuuid: 's2',
    name: 'Pop BE',
    country: 'Belgium',
    state: '',
    favicon: '',
    url_resolved: 'https://stream.example/2',
    language: 'french',
    tags: 'pop',
    votes: 5,
    clickcount: 9,
    lastcheckok: 1,
    geo_lat: 50.85,
    geo_long: 4.35,
  },
  {
    stationuuid: 's3',
    name: 'Talk US',
    country: 'United States',
    state: '',
    favicon: '',
    url_resolved: 'https://stream.example/3',
    language: 'english',
    tags: 'talk',
    votes: 3,
    clickcount: 7,
    lastcheckok: 1,
    geo_lat: null,
    geo_long: null,
  },
]

function getStationButton(name: string): HTMLButtonElement {
  const stationText = screen
    .getAllByText(name)
    .find((node) => node.closest('button')?.className.includes('station'))

  const button = stationText?.closest('button')
  if (!button) {
    throw new Error(`${name} station button not found`)
  }

  return button as HTMLButtonElement
}

describe('App integration', () => {
  beforeEach(() => {
    localStorage.clear()
    localStorage.setItem('radio-locale', 'nl')
    mockLeafletMap.addLayer.mockClear()
    mockLeafletMap.removeLayer.mockClear()
    mockLeafletMap.flyTo.mockClear()
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => stationFixture,
      }),
    )
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it('restores saved search and filter preferences after remount', async () => {
    localStorage.setItem('radio-search', 'jazz')
    localStorage.setItem(
      'radio-filters',
      JSON.stringify({ country: 'Belgium', language: 'french', tag: 'pop' }),
    )

    render(<I18nProvider><App /></I18nProvider>)

    const searchInput = screen.getByLabelText('Zoek station, genre of stad') as HTMLInputElement
    const countryBtn = screen.getByRole('button', { name: /Land/i })
    const languageBtn = screen.getByRole('button', { name: /Taal/i })
    const tagBtn = screen.getByRole('button', { name: /Tag/i })

    await waitFor(() => {
      expect(searchInput.value).toBe('jazz')
      expect(countryBtn.textContent).toContain('Belgium')
      expect(languageBtn.textContent).toContain('french')
      expect(tagBtn.textContent).toContain('pop')
    })
  })

  it('toggles between dark and light mode', async () => {
    render(<I18nProvider><App /></I18nProvider>)

    const toggleButton = screen.getByRole('button', { name: /licht|donker/i })
    expect(toggleButton).toBeInTheDocument()
    expect(document.querySelector('.app-shell')?.getAttribute('data-theme')).toBe('dark')

    fireEvent.click(toggleButton)

    await waitFor(() => {
      expect(document.querySelector('.app-shell')?.getAttribute('data-theme')).toBe('light')
    })

    fireEvent.click(toggleButton)

    await waitFor(() => {
      expect(document.querySelector('.app-shell')?.getAttribute('data-theme')).toBe('dark')
    })
  })

  it('resets country, language and tag filters to all', async () => {
    render(<I18nProvider><App /></I18nProvider>)

    const countryBtn = screen.getByRole('button', { name: /Land/i })
    const languageBtn = screen.getByRole('button', { name: /Taal/i })
    const tagBtn = screen.getByRole('button', { name: /Tag/i })

    await waitFor(() => {
      expect(countryBtn.textContent).not.toBe('Alle landen')
    })

    fireEvent.click(countryBtn)
    await waitFor(() => {
      expect(screen.getByRole('option', { name: 'Belgium' })).toBeInTheDocument()
    })
    fireEvent.click(screen.getByRole('option', { name: 'Belgium' }))

    fireEvent.click(languageBtn)
    await waitFor(() => {
      expect(screen.getByRole('option', { name: 'french' })).toBeInTheDocument()
    })
    fireEvent.click(screen.getByRole('option', { name: 'french' }))

    fireEvent.click(tagBtn)
    await waitFor(() => {
      expect(screen.getByRole('option', { name: 'pop' })).toBeInTheDocument()
    })
    fireEvent.click(screen.getByRole('option', { name: 'pop' }))

    fireEvent.click(screen.getByRole('button', { name: /Reset filters/i }))

    await waitFor(() => {
      expect(countryBtn.textContent).toContain('Alle landen')
      expect(languageBtn.textContent).toContain('Alle talen')
      expect(tagBtn.textContent).toContain('Alle tags')
    })
  })

  it('imports favorites from json and exports them with success toast', async () => {
    const createObjectURLMock = vi
      .spyOn(URL, 'createObjectURL')
      .mockReturnValue('blob:radio-test')
    const revokeObjectURLMock = vi
      .spyOn(URL, 'revokeObjectURL')
      .mockImplementation(() => {})

    const anchorClickMock = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => {})

    const { container } = render(<I18nProvider><App /></I18nProvider>)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Import' })).toBeInTheDocument()
    })

    const importInput = container.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement | null
    expect(importInput).not.toBeNull()
    if (!importInput) {
      throw new Error('Import input not found')
    }

    const importPayload = [
      {
        stationuuid: 'fav1',
        name: 'Favorite One',
        country: 'France',
        state: '',
        favicon: '',
        url_resolved: 'https://stream.example/fav1',
        language: 'french',
        tags: 'chill',
        votes: 1,
        clickcount: 2,
        lastcheckok: 1,
        geo_lat: 48.85,
        geo_long: 2.35,
      },
    ]
    const importFile = new File(
      [JSON.stringify(importPayload)],
      'favorites.json',
      { type: 'application/json' },
    )

    fireEvent.change(importInput, {
      target: { files: [importFile] },
    })

    await waitFor(() => {
      expect(screen.getByText('Favorieten (1)')).toBeInTheDocument()
    })
    expect(screen.getByText('1 favorieten geïmporteerd.')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Export' }))

    await waitFor(() => {
      expect(
        screen.getByText('1 favorieten geëxporteerd.'),
      ).toBeInTheDocument()
    })

    expect(createObjectURLMock).toHaveBeenCalledTimes(1)
    expect(revokeObjectURLMock).toHaveBeenCalledTimes(1)
    expect(anchorClickMock).toHaveBeenCalledTimes(1)

    createObjectURLMock.mockRestore()
    revokeObjectURLMock.mockRestore()
    anchorClickMock.mockRestore()
  })

  it('shows recovery feedback when a station becomes healthy again after an error', async () => {
    render(<I18nProvider><App /></I18nProvider>)

    await waitFor(() => {
      expect(document.querySelector('audio')).not.toBeNull()
    })

    const audio = document.querySelector('audio')
    expect(audio).not.toBeNull()
    if (!audio) {
      throw new Error('Audio element not found')
    }

    fireEvent.error(audio)

    await waitFor(() => {
      expect(screen.getByText(/tijdelijk verborgen wegens streamfouten/i)).toBeInTheDocument()
    })

    const restoreBtn = screen.getByRole('button', { name: /Herstel Jazz NL/i })
    fireEvent.click(restoreBtn)

    await waitFor(() => {
      expect(screen.getAllByText(/stream werkt weer/i).length).toBeGreaterThan(0)
    })
  })

  it('marks station offline on audio error and restores it manually', async () => {
    render(<I18nProvider><App /></I18nProvider>)

    await waitFor(() => {
      expect(document.querySelector('audio')).not.toBeNull()
    })

    const audio = document.querySelector('audio')
    expect(audio).not.toBeNull()
    if (!audio) {
      throw new Error('Audio element not found')
    }

    fireEvent.error(audio)

    await waitFor(() => {
      expect(
        screen.getByText('1 stations tijdelijk verborgen wegens streamfouten.'),
      ).toBeInTheDocument()
    })

    expect(screen.getByText('Tijdelijk offline (1)')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Check offline opnieuw' }))

    await waitFor(() => {
      expect(screen.queryByText('Tijdelijk offline (1)')).not.toBeInTheDocument()
    })
  })

  it('automatically switches to an alternative station on stream error (fallback)', async () => {
    render(<I18nProvider><App /></I18nProvider>)

    await waitFor(() => {
      expect(document.querySelector('audio')).not.toBeNull()
    })

    // Wait for stations to be loaded and first station (Jazz NL / s1) to be selected.
    await waitFor(() => {
      const audio = document.querySelector('audio')
      expect(audio?.getAttribute('aria-label')).toMatch(/Jazz NL|Pop BE/)
    })

    const audio = document.querySelector('audio')!
    // Record which station was initially selected; fallback should switch away from it.
    const initialLabel = audio.getAttribute('aria-label') ?? ''

    fireEvent.error(audio)

    // Fallback toast should appear.
    await waitFor(() => {
      expect(screen.getByText(/Schakel over naar alternatief/)).toBeInTheDocument()
    })

    // After fallback the audio element should reference a DIFFERENT station.
    await waitFor(() => {
      const audioAfter = document.querySelector('audio')
      expect(audioAfter?.getAttribute('aria-label')).not.toBe(initialLabel)
    })
  })

  it('shows exhausted fallback message when only one station is available', async () => {
    // Override fetch to return a single-station list for this test.
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => [stationFixture[0]],
      }),
    )

    render(<I18nProvider><App /></I18nProvider>)

    await waitFor(() => {
      expect(document.querySelector('audio')).not.toBeNull()
    })

    const audio = document.querySelector('audio')!
    fireEvent.error(audio)

    await waitFor(() => {
      expect(
        screen.getByText(/Geen alternatief station beschikbaar/),
      ).toBeInTheDocument()
    })
  })

  it('recenters the map when selecting a station with coordinates', async () => {
    render(<I18nProvider><App /></I18nProvider>)

    await waitFor(() => {
      expect(mockLeafletMap.flyTo).toHaveBeenCalled()
    })

    const initialFlyToCount = mockLeafletMap.flyTo.mock.calls.length
    const popStationButton = getStationButton('Pop BE')

    fireEvent.click(popStationButton)

    await waitFor(() => {
      expect(mockLeafletMap.flyTo).toHaveBeenCalledWith([50.85, 4.35], 14, {
        duration: 1.4,
      })
    })

    expect(mockLeafletMap.flyTo).toHaveBeenCalledTimes(initialFlyToCount + 1)

    fireEvent.click(getStationButton('Pop BE'))

    await waitFor(() => {
      expect(mockLeafletMap.flyTo).toHaveBeenCalledTimes(initialFlyToCount + 2)
    })
  })

  it('shows a toast and keeps the map in place when the selected station has no coordinates', async () => {
    render(<I18nProvider><App /></I18nProvider>)

    await waitFor(() => {
      expect(mockLeafletMap.flyTo).toHaveBeenCalled()
    })

    const initialFlyToCount = mockLeafletMap.flyTo.mock.calls.length
    const talkStationButton = getStationButton('Talk US')

    fireEvent.click(talkStationButton)

    await waitFor(() => {
      expect(
        screen.getByText('Kan Talk US niet op de kaart centreren: locatie ontbreekt.'),
      ).toBeInTheDocument()
    })

    expect(mockLeafletMap.flyTo).toHaveBeenCalledTimes(initialFlyToCount)
  })
})
