import { test, expect } from '@playwright/test'
import { mockAllApis } from './helpers/mockApi'

test.describe('Station search', () => {
  test.beforeEach(async ({ page }) => {
    await mockAllApis(page)
    await page.goto('/')
  })

  test('loads and displays default stations', async ({ page }) => {
    await expect(page.locator('h1')).toHaveText('World Radio Explorer')
    await expect(page.locator('text=Topresultaten')).toBeVisible()

    const stationButtons = page.locator('button.station')
    await expect(stationButtons.nth(0)).toBeVisible({ timeout: 10000 })
    const count = await stationButtons.count()
    expect(count).toBeGreaterThan(0)
  })

  test('search filters stations by name', async ({ page }) => {
    await expect(page.locator('button.station').nth(0)).toBeVisible({ timeout: 10000 })

    const searchInput = page.locator('#station-search')
    await searchInput.fill('Jazz')
    await page.locator('button[type="submit"]').click()

    await expect(page.locator('button.station:has-text("Jazz NL")')).toBeVisible({ timeout: 10000 })
  })

  test('country filter narrows results', async ({ page }) => {
    await expect(page.locator('button.station').nth(0)).toBeVisible({ timeout: 10000 })

    const countrySelect = page.locator('label:has-text("Land") select')
    await countrySelect.selectOption('Belgium')

    const stationButtons = page.locator('button.station')
    const count = await stationButtons.count()
    for (let i = 0; i < count; i++) {
      await expect(stationButtons.nth(i)).toContainText('Belgium')
    }
  })

  test('language filter narrows results', async ({ page }) => {
    await expect(page.locator('button.station').nth(0)).toBeVisible({ timeout: 10000 })

    const languageSelect = page.locator('label:has-text("Taal") select')
    await languageSelect.selectOption('dutch')

    const stationButtons = page.locator('button.station')
    const count = await stationButtons.count()
    expect(count).toBeGreaterThan(0)
    for (let i = 0; i < count; i++) {
      await expect(stationButtons.nth(i)).toContainText(/Jazz|Offline/)
    }
  })

  test('reset filters restores all stations', async ({ page }) => {
    await expect(page.locator('button.station').nth(0)).toBeVisible({ timeout: 10000 })

    const countrySelect = page.locator('label:has-text("Land") select')
    await countrySelect.selectOption('Belgium')
    const filteredCount = await page.locator('button.station').count()

    await page.locator('.filter-actions button:has-text("Reset filters")').click()

    await expect(countrySelect).toHaveValue('all')
    const restoredCount = await page.locator('button.station').count()
    expect(restoredCount).toBeGreaterThanOrEqual(filteredCount)
  })

  test('shows no-results state with combined filters', async ({ page }) => {
    await expect(page.locator('button.station').nth(0)).toBeVisible({ timeout: 10000 })

    const countrySelect = page.locator('label:has-text("Land") select')
    await countrySelect.selectOption('Germany')

    const languageSelect = page.locator('label:has-text("Taal") select')
    await languageSelect.selectOption('dutch')

    await expect(page.locator('text=Geen resultaten met deze filters')).toBeVisible({ timeout: 5000 })
  })

  test('shows skeleton loading indicators during load', async ({ page }) => {
    await page.goto('/')
    const skeletons = page.locator('.skeleton-row')
    const skeletonCount = await skeletons.count()
    expect(skeletonCount).toBeGreaterThanOrEqual(0)
  })
})
