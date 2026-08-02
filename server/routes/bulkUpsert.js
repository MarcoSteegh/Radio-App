import { pool } from '../db.js'
import { sendApiError } from '../middleware/helpers.js'

export function createBulkUpsertRoute() {
  async function bulkUpsert(req, res) {
    const rows = Array.isArray(req.body) ? req.body : []
    if (rows.length === 0) {
      sendApiError(res, 400, 'INVALID_PAYLOAD', 'Expected a non-empty array payload.')
      return
    }

    const normalized = rows
      .filter((row) => row && row.stationuuid && row.url_resolved)
      .map((row) => ({
        stationuuid: String(row.stationuuid).slice(0, 80),
        name: String(row.name ?? '').slice(0, 400),
        country: String(row.country ?? '').slice(0, 100),
        state: String(row.state ?? '').slice(0, 100),
        favicon: String(row.favicon ?? '').slice(0, 500),
        url_resolved: String(row.url_resolved ?? '').slice(0, 500),
        language: String(row.language ?? '').slice(0, 200),
        tags: String(row.tags ?? '').slice(0, 500),
        votes: Number(row.votes ?? 0),
        clickcount: Number(row.clickcount ?? 0),
        lastcheckok: Number(row.lastcheckok ?? 1),
        geo_lat: row.geo_lat === null || row.geo_lat === '' ? null : Number(row.geo_lat),
        geo_long: row.geo_long === null || row.geo_long === '' ? null : Number(row.geo_long),
        source: String(row.source ?? 'radio-browser').slice(0, 50),
      }))

    if (normalized.length === 0) {
      sendApiError(res, 400, 'INVALID_PAYLOAD', 'No valid rows to import.')
      return
    }

    const sql = `
      INSERT INTO stations (
        stationuuid, name, country, state, favicon, url_resolved, language, tags,
        votes, clickcount, lastcheckok, geo_lat, geo_long, source
      ) VALUES ?
      ON DUPLICATE KEY UPDATE
        name = VALUES(name),
        country = VALUES(country),
        state = VALUES(state),
        favicon = VALUES(favicon),
        url_resolved = VALUES(url_resolved),
        language = VALUES(language),
        tags = VALUES(tags),
        votes = VALUES(votes),
        clickcount = VALUES(clickcount),
        lastcheckok = VALUES(lastcheckok),
        geo_lat = VALUES(geo_lat),
        geo_long = VALUES(geo_long),
        source = VALUES(source)
    `

    const values = normalized.map((row) => [
      row.stationuuid,
      row.name,
      row.country,
      row.state,
      row.favicon,
      row.url_resolved,
      row.language,
      row.tags,
      Number.isFinite(row.votes) ? row.votes : 0,
      Number.isFinite(row.clickcount) ? row.clickcount : 0,
      Number.isFinite(row.lastcheckok) ? row.lastcheckok : 1,
      Number.isFinite(row.geo_lat) ? row.geo_lat : null,
      Number.isFinite(row.geo_long) ? row.geo_long : null,
      row.source,
    ])

    try {
      const [result] = await pool.query(sql, [values])
      res.json({ affectedRows: Number(result.affectedRows ?? 0), importedRows: normalized.length })
    } catch {
      sendApiError(res, 500, 'INTERNAL_ERROR', 'Bulk upsert failed.')
    }
  }

  return { bulkUpsert }
}
