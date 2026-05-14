export type Station = {
  stationuuid: string
  name: string
  country: string
  state: string
  favicon: string
  url_resolved: string
  language: string
  tags: string
  votes: number
  clickcount: number
  lastcheckok: number
  geo_lat: number | null
  geo_long: number | null
}

export type NearbyStation = Station & { distanceKm: number }

export type Toast = {
  id: number
  text: string
  tone: 'info' | 'success' | 'error'
}

export type LoadOptions = {
  silent?: boolean
}
