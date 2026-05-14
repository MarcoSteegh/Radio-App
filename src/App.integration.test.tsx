import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import App from './App'

vi.mock('react-leaflet', () => ({
  MapContainer: ({ children }: { children: ReactNode }) => (
    <div data-testid="map-container">{children}</div>
  ),
  TileLayer: () => null,
  CircleMarker: ({ children }: { children?: ReactNode }) => (
    <div>{children}</div>
  ),
  Popup: ({ children }: { children?: ReactNode }) => <>{children}</>,
}))

vi.mock('./components/FlyToStation', () => ({
  default: () => null,
}))

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
]

describe('App integration', () => {
  beforeEach(() => {
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

  it('resets country, language and tag filters to all', async () => {
    render(<App />)

    const countrySelect = screen.getByLabelText('Land') as HTMLSelectElement
    const languageSelect = screen.getByLabelText('Taal') as HTMLSelectElement
    const tagSelect = screen.getByLabelText('Tag') as HTMLSelectElement

    await waitFor(() => {
      expect(countrySelect.options.length).toBeGreaterThan(1)
      expect(languageSelect.options.length).toBeGreaterThan(1)
      expect(tagSelect.options.length).toBeGreaterThan(1)
    })

    fireEvent.change(countrySelect, { target: { value: 'Belgium' } })
    fireEvent.change(languageSelect, { target: { value: 'french' } })
    fireEvent.change(tagSelect, { target: { value: 'pop' } })

    expect(countrySelect.value).toBe('Belgium')
    expect(languageSelect.value).toBe('french')
    expect(tagSelect.value).toBe('pop')

    fireEvent.click(screen.getByRole('button', { name: 'Reset filters' }))

    expect(countrySelect.value).toBe('all')
    expect(languageSelect.value).toBe('all')
    expect(tagSelect.value).toBe('all')
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

    const { container } = render(<App />)

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

  it('marks station offline on audio error and restores it manually', async () => {
    render(<App />)

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

    fireEvent.click(screen.getByRole('button', { name: 'Herstel' }))

    await waitFor(() => {
      expect(screen.queryByText('Tijdelijk offline (1)')).not.toBeInTheDocument()
    })
  })
})
