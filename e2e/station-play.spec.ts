import { test, expect } from '@playwright/test'
import { mockAllApis } from './helpers/mockApi'

test.describe('Station playback', () => {
  test.beforeEach(async ({ page }) => {
    await mockAllApis(page)
    await page.goto('/')
    await expect(page.locator('button.station').nth(0)).toBeVisible({ timeout: 10000 })
  })

  test('selecting a station shows now-playing panel with audio', async ({ page }) => {
    await page.locator('button.station:has-text("Jazz NL")').nth(0).click()

    await expect(page.locator('.now-playing h2')).toHaveText('Jazz NL')
    await expect(page.locator('.now-playing')).toContainText('Netherlands')

    const audio = page.locator('audio')
    await expect(audio).toBeVisible()
    const src = await audio.getAttribute('src')
    expect(src).toContain('stream.example.com')
  })

  test('selected station is visually highlighted', async ({ page }) => {
    await page.locator('button.station:has-text("Jazz NL")').nth(0).click()

    await expect(page.locator('button.station.active')).toBeVisible()
    await expect(page.locator('button.station.active')).toContainText('Jazz NL')
  })

  test('clicking a different station switches playback', async ({ page }) => {
    await page.locator('button.station:has-text("Jazz NL")').nth(0).click()
    await expect(page.locator('.now-playing h2')).toHaveText('Jazz NL')

    await page.locator('button.station:has-text("Pop BE")').nth(0).evaluate((el) => (el as HTMLButtonElement).click())
    await expect(page.locator('.now-playing h2')).toHaveText('Pop BE')

    const audio = page.locator('audio')
    const src = await audio.getAttribute('src')
    expect(src).toContain('pop')
  })

  test('station metadata shows language and tags', async ({ page }) => {
    await page.locator('button.station:has-text("Jazz NL")').nth(0).click()

    const meta = page.locator('.now-playing .meta')
    await expect(meta).toContainText('dutch')
    await expect(meta).toContainText('jazz')
  })

  test('audio error marks station as offline', async ({ page }) => {
    await page.locator('button.station:has-text("Jazz NL")').nth(0).click()

    const audio = page.locator('audio')
    await audio.dispatchEvent('error')

    await expect(page.locator('text=stations tijdelijk verborgen wegens streamfouten')).toBeVisible({ timeout: 5000 })
    await expect(page.locator('text=Tijdelijk offline')).toBeVisible()
  })

  test('offline station can be restored via Check offline opnieuw', async ({ page }) => {
    await page.locator('button.station:has-text("Jazz NL")').nth(0).click()

    const audio = page.locator('audio')
    await audio.dispatchEvent('error')

    await expect(page.locator('text=Tijdelijk offline')).toBeVisible({ timeout: 5000 })

    await page.locator('button:has-text("Check offline opnieuw")').click()

    await expect(page.locator('text=Tijdelijk offline')).not.toBeVisible({ timeout: 5000 })
  })
})
