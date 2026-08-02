export type StationFixture = {
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

export const jazzStation: StationFixture = {
  stationuuid: 'test-jazz-nl',
  name: 'Jazz NL',
  country: 'Netherlands',
  state: 'Noord-Holland',
  favicon: '',
  url_resolved: 'https://stream.example.com/jazz',
  language: 'dutch',
  tags: 'jazz,smooth',
  votes: 120,
  clickcount: 500,
  lastcheckok: 1,
  geo_lat: 52.37,
  geo_long: 4.9,
}

export const popStation: StationFixture = {
  stationuuid: 'test-pop-be',
  name: 'Pop BE',
  country: 'Belgium',
  state: 'Antwerp',
  favicon: '',
  url_resolved: 'https://stream.example.com/pop',
  language: 'french',
  tags: 'pop,top40',
  votes: 85,
  clickcount: 320,
  lastcheckok: 1,
  geo_lat: 50.85,
  geo_long: 4.35,
}

export const rockStation: StationFixture = {
  stationuuid: 'test-rock-de',
  name: 'Rock Berlin',
  country: 'Germany',
  state: 'Berlin',
  favicon: '',
  url_resolved: 'https://stream.example.com/rock',
  language: 'german',
  tags: 'rock,alternative',
  votes: 60,
  clickcount: 210,
  lastcheckok: 1,
  geo_lat: 52.52,
  geo_long: 13.4,
}

export const newsStation: StationFixture = {
  stationuuid: 'test-news-us',
  name: 'News US',
  country: 'United States',
  state: 'New York',
  favicon: '',
  url_resolved: 'https://stream.example.com/news',
  language: 'english',
  tags: 'news,talk',
  votes: 40,
  clickcount: 150,
  lastcheckok: 1,
  geo_lat: 40.71,
  geo_long: -74.0,
}

export const offlineStation: StationFixture = {
  stationuuid: 'test-offline-nl',
  name: 'Offline Radio',
  country: 'Netherlands',
  state: '',
  favicon: '',
  url_resolved: 'https://stream.example.com/offline',
  language: 'dutch',
  tags: 'test',
  votes: 10,
  clickcount: 5,
  lastcheckok: 0,
  geo_lat: 51.92,
  geo_long: 4.48,
}

export const noCoordsStation: StationFixture = {
  stationuuid: 'test-nocoords',
  name: 'No Coords',
  country: 'France',
  state: '',
  favicon: '',
  url_resolved: 'https://stream.example.com/nocoords',
  language: 'french',
  tags: 'experimental',
  votes: 2,
  clickcount: 1,
  lastcheckok: 1,
  geo_lat: null,
  geo_long: null,
}

export const allStations: StationFixture[] = [
  jazzStation,
  popStation,
  rockStation,
  newsStation,
  offlineStation,
  noCoordsStation,
]

export const playableStations: StationFixture[] = [
  jazzStation,
  popStation,
  rockStation,
  newsStation,
]
