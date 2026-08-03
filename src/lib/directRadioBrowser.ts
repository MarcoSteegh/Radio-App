import type { Station } from '../types/station'
import { sanitizeStation } from '../utils/stationUtils'
import { fallbackStations } from './fallbackStations'

const RADIO_BROWSER_BASE = 'https://de1.api.radio-browser.info/json'

async function directFetch<T>(url: string, signal?: AbortSignal): Promise<T> {
  try {
    const response = await fetch(url, { signal })
    if (!response.ok) {
      throw new Error(`Radio Browser API error: ${response.status}`)
    }
    return response.json() as Promise<T>
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw err
    }
    return fallbackStations as T
  }
}

export async function fetchStationsDirect(params: {
  term: string
  offset: number
  limit: number
  signal?: AbortSignal
}): Promise<Station[]> {
  const { term, offset, limit, signal } = params
  const base = `${RADIO_BROWSER_BASE}/stations`
  const common = `hidebroken=true&order=clickcount&reverse=true&limit=${limit}&offset=${offset}`

  const url = term
    ? `${base}/search?${common}&name=${encodeURIComponent(term)}`
    : `${base}?${common}`

  const raw = await directFetch<unknown[]>(url, signal)
  return raw
    .map((s) => sanitizeStation(s))
    .filter((s): s is Station => s !== null)
}

export async function fetchGeoStationsDirect(params: {
  offset: number
  limit: number
  signal?: AbortSignal
}): Promise<Station[]> {
  const { offset, limit, signal } = params
  const url = `${RADIO_BROWSER_BASE}/stations?hidebroken=true&order=clickcount&reverse=true&limit=${limit}&offset=${offset}&geo_lat=*&geo_long=*`

  const raw = await directFetch<unknown[]>(url, signal)
  return raw
    .map((s) => sanitizeStation(s))
    .filter((s): s is Station => s !== null)
}
