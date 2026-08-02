import type { Page } from '@playwright/test'
import { playableStations, type StationFixture } from '../fixtures/stations'

type MockApiOptions = {
  stations?: StationFixture[]
  searchResults?: StationFixture[]
}

export async function mockRadioBrowserApi(page: Page, options: MockApiOptions = {}) {
  const stations = options.stations ?? playableStations
  const searchResults = options.searchResults ?? stations

  await page.route('**/api/stations/search**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(searchResults),
    })
  })

  await page.route('**/api/stations/geo**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(stations),
    })
  })

  await page.route('**/api/stations/geo-count**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ count: stations.length }),
    })
  })

  await page.route('**/api/stations**', async (route) => {
    const url = new URL(route.request().url())
    const q = url.searchParams.get('q') ?? url.searchParams.get('name') ?? ''

    if (q) {
      const filtered = searchResults.filter(
        (s) =>
          s.name.toLowerCase().includes(q.toLowerCase()) ||
          s.tags.toLowerCase().includes(q.toLowerCase()),
      )
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(filtered),
      })
    } else {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(stations),
      })
    }
  })

  await page.route('**/api/stations/by-url**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(null),
    })
  })

  await page.route('**/api/submissions**', async (route) => {
    if (route.request().method() === 'POST') {
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ id: 1, stationuuid: 'new-station-uuid' }),
      })
    } else {
      await route.fulfill({ status: 405 })
    }
  })

  await page.route('**/api/observability/**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true }),
    })
  })

  await page.route('**/api/health**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ status: 'ok' }),
    })
  })

  await page.route('**/api/image-proxy**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'image/png',
      body: Buffer.alloc(1),
    })
  })

  await page.route('**/api/admin/**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ authenticated: false }),
    })
  })
}

export async function mockRadioBrowserDirectApi(page: Page, options: MockApiOptions = {}) {
  const stations = options.stations ?? playableStations

  await page.route('**/radio-browser.info/**', async (route) => {
    const url = new URL(route.request().url())

    if (url.pathname.includes('/stations/search')) {
      const name = url.searchParams.get('name') ?? ''
      const filtered = name
        ? stations.filter((s) => s.name.toLowerCase().includes(name.toLowerCase()))
        : stations
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(filtered),
      })
    } else {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(stations),
      })
    }
  })
}

export async function mockAllApis(page: Page, options: MockApiOptions = {}) {
  await mockRadioBrowserApi(page, options)
  await mockRadioBrowserDirectApi(page, options)
}

export async function mockStationOffline(page: Page, stationUuid: string) {
  await page.route('**/api/stations**', async (route) => {
    const url = new URL(route.request().url())
    const q = url.searchParams.get('q') ?? url.searchParams.get('name') ?? ''

    let responseStations = [...playableStations]

    if (q) {
      responseStations = responseStations.filter(
        (s) =>
          s.name.toLowerCase().includes(q.toLowerCase()) ||
          s.tags.toLowerCase().includes(q.toLowerCase()),
      )
    }

    const station = responseStations.find((s) => s.stationuuid === stationUuid)
    if (station) {
      station.lastcheckok = 0
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(responseStations),
    })
  })
}
