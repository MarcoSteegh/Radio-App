/**
 * One-time import script: fetches all stations from Radio Browser API
 * and upserts them into the MySQL `stations` table via the backend API.
 *
 * Usage:
 *   API_BASE_URL=http://127.0.0.1:3000/api \
 *   SERVICE_KEY=your-service-key \
 *   node scripts/import-stations.mjs
 */

const API_BASE_URL = process.env.API_BASE_URL
const SERVICE_KEY = process.env.SERVICE_KEY

if (!API_BASE_URL || !SERVICE_KEY) {
  console.error('Set API_BASE_URL and SERVICE_KEY environment variables.')
  process.exit(1)
}

const API_BASE = 'https://de1.api.radio-browser.info/json'
const FETCH_BATCH = 1000   // stations per Radio Browser request
const INSERT_BATCH = 500   // rows per backend bulk upsert
const DELAY_MS = 300       // pause between Radio Browser requests

async function fetchBatch(offset) {
  const url =
    `${API_BASE}/stations?limit=${FETCH_BATCH}&offset=${offset}` +
    `&hidebroken=true&order=clickcount&reverse=true`
  const res = await fetch(url, { headers: { 'User-Agent': 'WorldRadioExplorer/1.0' } })
  if (!res.ok) throw new Error(`HTTP ${res.status} at offset ${offset}`)
  return res.json()
}

function toNumber(value, fallback = 0) {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

function toNullableNumber(value) {
  if (value === null || value === undefined || value === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function mapStation(s) {
  const urlResolved = s.url_resolved || s.url || ''
  if (!s.stationuuid || !urlResolved) return null

  return {
    stationuuid: String(s.stationuuid),
    name: String(s.name || '').slice(0, 400),
    country: String(s.country || s.countrycode || '').slice(0, 100),
    state: String(s.state || '').slice(0, 100),
    favicon: String(s.favicon || '').slice(0, 500),
    url_resolved: urlResolved.slice(0, 500),
    language: String(s.language || '').slice(0, 200),
    tags: String(s.tags || '').slice(0, 500),
    votes: toNumber(s.votes),
    clickcount: toNumber(s.clickcount),
    lastcheckok: toNumber(s.lastcheckok, 1),
    geo_lat: toNullableNumber(s.geo_lat),
    geo_long: toNullableNumber(s.geo_long),
    source: 'radio-browser',
  }
}

async function insertBatch(rows) {
  const response = await fetch(`${API_BASE_URL}/admin/stations/bulk-upsert`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-service-key': SERVICE_KEY,
    },
    body: JSON.stringify(rows),
  })

  if (!response.ok) {
    throw new Error(`Bulk upsert failed with status ${response.status}`)
  }
}

async function main() {
  console.log('Starting Radio Browser -> backend import...')
  let offset = 0
  let total = 0

  while (true) {
    console.log(`  Fetching offset ${offset}…`)
    const raw = await fetchBatch(offset)

    if (!Array.isArray(raw) || raw.length === 0) {
      console.log('  No more stations returned.')
      break
    }

    const rows = raw.map(mapStation).filter(Boolean)

    for (let i = 0; i < rows.length; i += INSERT_BATCH) {
      const chunk = rows.slice(i, i + INSERT_BATCH)
      await insertBatch(chunk)
      total += chunk.length
      process.stdout.write(`\r  Imported: ${total}`)
    }

    offset += FETCH_BATCH

    // Respect Radio Browser's servers
    await new Promise((resolve) => setTimeout(resolve, DELAY_MS))
  }

  console.log(`\nDone. Total stations imported/updated: ${total}`)
}

main().catch((err) => {
  console.error('Import failed:', err.message)
  process.exit(1)
})
