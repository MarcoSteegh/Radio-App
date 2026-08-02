import { test, expect } from '@playwright/test'
import { mockAllApis } from './helpers/mockApi'

test.describe('Favorites', () => {
  test.beforeEach(async ({ page }) => {
    await mockAllApis(page)
    await page.goto('/')
    await expect(page.locator('button.station').nth(0)).toBeVisible({ timeout: 10000 })
  })

  test('adds a station to favorites and removes it', async ({ page }) => {
    await page.locator('button.station:has-text("Jazz NL")').nth(0).click()

    await expect(page.locator('.now-playing h2')).toHaveText('Jazz NL')

    await page.locator('button:has-text("Voeg toe aan favorieten")').click()

    await expect(page.locator('text=Favorieten (1)')).toBeVisible()
    await expect(page.locator('button:has-text("Verwijder favoriet")')).toBeVisible()

    await page.locator('button:has-text("Verwijder favoriet")').click()

    await expect(page.locator('button:has-text("Voeg toe aan favorieten")')).toBeVisible()
  })

  test('favorites persist after page reload', async ({ page }) => {
    await page.locator('button.station:has-text("Jazz NL")').nth(0).click()
    await page.locator('button:has-text("Voeg toe aan favorieten")').click()
    await expect(page.locator('text=Favorieten (1)')).toBeVisible()

    await page.reload()
    await expect(page.locator('button.station').nth(0)).toBeVisible({ timeout: 10000 })

    await expect(page.locator('text=Favorieten (1)')).toBeVisible()
  })

  test('export favorites generates a download', async ({ page }) => {
    await page.locator('button.station:has-text("Jazz NL")').nth(0).click()
    await page.locator('button:has-text("Voeg toe aan favorieten")').click()
    await expect(page.locator('text=Favorieten (1)')).toBeVisible()

    const downloadPromise = page.waitForEvent('download')
    await page.locator('button:has-text("Export")').click()
    const download = await downloadPromise
    expect(download.suggestedFilename()).toBe('radio-favorieten.json')
  })

  test('import favorites from JSON file', async ({ page }) => {
    const importPayload = [
      {
        stationuuid: 'imported-1',
        name: 'Imported Station',
        country: 'Japan',
        state: '',
        favicon: '',
        url_resolved: 'https://stream.example.com/imported',
        language: 'japanese',
        tags: 'jpop',
        votes: 10,
        clickcount: 50,
        lastcheckok: 1,
        geo_lat: 35.68,
        geo_long: 139.69,
      },
    ]

    const [fileChooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      page.locator('button:has-text("Import")').click(),
    ])

    await fileChooser.setFiles({
      name: 'favorites.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(importPayload)),
    })

    await expect(page.locator('text=1 favorieten geïmporteerd.')).toBeVisible({ timeout: 5000 })
    await expect(page.locator('text=Favorieten (1)')).toBeVisible()
  })

  test('unfav button removes station from favorites list', async ({ page }) => {
    await page.locator('button.station:has-text("Pop BE")').nth(0).click()
    await page.locator('button:has-text("Voeg toe aan favorieten")').click()
    await expect(page.locator('text=Favorieten (1)')).toBeVisible()

    const unfavBtn = page.locator('.station-section:has-text("Favorieten") button:has-text("Unfav")')
    await unfavBtn.evaluate((el) => (el as HTMLButtonElement).click())

    await expect(page.locator('.station-section:has-text("Favorieten")')).not.toBeVisible({ timeout: 5000 })
  })
})
