import { pool } from '../db.js'
import { sendApiError, parseOffset, parseLimit, normalizeText } from '../middleware/helpers.js'

export function createStationRoutes() {
  async function searchStations(req, res) {
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : ''
    const offset = parseOffset(req.query.offset)
    const limit = parseLimit(req.query.limit, 1000, 1000)

    try {
      let sql = `
        SELECT stationuuid, name, country, state, favicon, url_resolved, language, tags,
               votes, clickcount, lastcheckok, geo_lat, geo_long
        FROM stations
        WHERE lastcheckok = 1
          AND url_resolved <> ''
      `
      const params = {}

      if (q) {
        sql += ' AND LOWER(name) LIKE LOWER(:term)'
        params.term = `%${q}%`
      }

      sql += ' ORDER BY clickcount DESC LIMIT :limit OFFSET :offset'
      params.limit = limit
      params.offset = offset

      const [rows] = await pool.query(sql, params)
      res.json(rows)
    } catch {
      sendApiError(res, 500, 'INTERNAL_ERROR', 'Failed to fetch stations.')
    }
  }

  async function getGeoStationCount(_req, res) {
    try {
      const [rows] = await pool.query(
        `
        SELECT COUNT(*) AS count
        FROM stations
        WHERE geo_lat IS NOT NULL
          AND geo_long IS NOT NULL
          AND lastcheckok = 1
          AND url_resolved <> ''
        `,
      )

      const first = rows[0] ?? { count: 0 }
      res.json({ count: Number(first.count ?? 0) })
    } catch {
      sendApiError(res, 500, 'INTERNAL_ERROR', 'Failed to count geo stations.')
    }
  }

  async function getGeoStations(req, res) {
    const offset = parseOffset(req.query.offset)
    const limit = parseLimit(req.query.limit, 1000, 1000)

    try {
      const [rows] = await pool.query(
        `
        SELECT stationuuid, name, country, state, favicon, url_resolved, language, tags,
               votes, clickcount, lastcheckok, geo_lat, geo_long
        FROM stations
        WHERE geo_lat IS NOT NULL
          AND geo_long IS NOT NULL
          AND lastcheckok = 1
          AND url_resolved <> ''
        ORDER BY clickcount DESC
        LIMIT :limit OFFSET :offset
        `,
        { limit, offset },
      )

      res.json(rows)
    } catch {
      sendApiError(res, 500, 'INTERNAL_ERROR', 'Failed to fetch geo stations.')
    }
  }

  async function getStationByUrl(req, res) {
    const url = typeof req.query.url === 'string' ? req.query.url.trim() : ''
    if (!url) {
      sendApiError(res, 400, 'INVALID_QUERY', 'url query param is required.')
      return
    }

    try {
      const [rows] = await pool.query(
        'SELECT stationuuid FROM stations WHERE url_resolved = :url LIMIT 1',
        { url },
      )

      res.json(rows[0] ?? null)
    } catch {
      sendApiError(res, 500, 'INTERNAL_ERROR', 'Failed to check station URL.')
    }
  }

  return {
    searchStations,
    getGeoStationCount,
    getGeoStations,
    getStationByUrl,
  }
}
