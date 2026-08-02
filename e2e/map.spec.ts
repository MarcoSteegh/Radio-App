import { test, expect } from '@playwright/test'
import { mockAllApis } from './helpers/mockApi'

test.describe('Map', () => {
  test.beforeEach(async ({ page }) => {
    await mockAllApis(page)
    await page.goto('/')
  })

  test('map container renders', async ({ page }) => {
    const mapContainer = page.locator('.map-wrap')
    await expect(mapContainer).toBeVisible({ timeout: 10000 })

    const map = page.locator('.leaflet-container')
    await expect(map).toBeVisible()
  })

  test('map has tile layer', async ({ page }) => {
    await expect(page.locator('.leaflet-container')).toBeVisible({ timeout: 10000 })

    const tileImages = page.locator('.leaflet-tile')
    const tileCount = await tileImages.count()
    expect(tileCount).toBeGreaterThan(0)
  })

  test('map zoom controls are present', async ({ page }) => {
    await expect(page.locator('.leaflet-container')).toBeVisible({ timeout: 10000 })

    const zoomIn = page.locator('.leaflet-control-zoom-in')
    const zoomOut = page.locator('.leaflet-control-zoom-out')
    await expect(zoomIn).toBeVisible()
    await expect(zoomOut).toBeVisible()
  })

  test('selecting a station shows its info', async ({ page }) => {
    await expect(page.locator('button.station').nth(0)).toBeVisible({ timeout: 10000 })

    await page.locator('button.station:has-text("Jazz NL")').click()

    await expect(page.locator('.now-playing h2')).toHaveText('Jazz NL')
  })

  test('OpenStreetMap attribution is present', async ({ page }) => {
    await expect(page.locator('.leaflet-container')).toBeVisible({ timeout: 10000 })

    const attribution = page.locator('.leaflet-control-attribution')
    await expect(attribution).toBeVisible()
    await expect(attribution).toContainText('OpenStreetMap')
  })
})
