import { pool } from '../db.js'
import { sendApiError, normalizeText, getClientIdentifier, parseOffset, parseLimit } from '../middleware/helpers.js'

function validateSubmissionPayload(body) {
  const name = normalizeText(body?.name, 400)
  const urlResolved = normalizeText(body?.url_resolved, 500)
  const country = normalizeText(body?.country, 100)
  const language = normalizeText(body?.language, 200)
  const tags = normalizeText(body?.tags, 500)
  const favicon = normalizeText(body?.favicon, 500)
  const userNote = normalizeText(body?.user_note, 500)

  if (!name) {
    return { ok: false, errorCode: 'INVALID_PAYLOAD', errorMessage: 'Name is required.' }
  }

  if (!/^https?:\/\//i.test(urlResolved)) {
    return { ok: false, errorCode: 'INVALID_PAYLOAD', errorMessage: 'A valid http/https url_resolved is required.' }
  }

  return {
    ok: true,
    data: {
      name,
      url_resolved: urlResolved,
      country,
      language,
      tags,
      favicon,
      user_note: userNote,
    },
  }
}

export function createSubmissionRoutes() {
  async function submitStation(req, res) {
    const validation = validateSubmissionPayload(req.body ?? {})
    if (!validation.ok) {
      sendApiError(res, 400, validation.errorCode, validation.errorMessage)
      return
    }

    const payload = validation.data

    try {
      const [existing] = await pool.query(
        'SELECT stationuuid FROM stations WHERE url_resolved = :url LIMIT 1',
        { url: payload.url_resolved },
      )

      if (existing[0]) {
        sendApiError(res, 409, 'DUPLICATE_STATION_URL', 'Duplicate station URL.')
        return
      }

      const [result] = await pool.query(
        `
        INSERT INTO station_submissions (
          stationuuid, name, country, language, tags, favicon, url_resolved, user_note
        ) VALUES (UUID(), :name, :country, :language, :tags, :favicon, :url_resolved, :user_note)
        `,
        {
          ...payload,
        },
      )

      const insertId = Number(result.insertId ?? 0)
      const [rows] = await pool.query(
        'SELECT stationuuid FROM station_submissions WHERE id = :id LIMIT 1',
        { id: insertId },
      )

      res.status(201).json({ id: insertId, stationuuid: rows[0]?.stationuuid ?? '' })
    } catch {
      sendApiError(res, 500, 'INTERNAL_ERROR', 'Failed to submit station.')
    }
  }

  return { submitStation }
}

export function createAdminSubmissionRoutes() {
  async function getSubmissions(req, res) {
    const status = typeof req.query.status === 'string' ? req.query.status : 'pending'
    if (!['pending', 'approved', 'all'].includes(status)) {
      sendApiError(res, 400, 'INVALID_QUERY', 'status must be pending, approved, or all.')
      return
    }
    const offset = parseOffset(req.query.offset)
    const limit = parseLimit(req.query.limit, 100, 500)

    let whereClause = ''
    if (status === 'pending') {
      whereClause = 'WHERE approved = 0'
    } else if (status === 'approved') {
      whereClause = 'WHERE approved = 1'
    }

    try {
      const [rows] = await pool.query(
        `
        SELECT id, stationuuid, name, country, state, favicon, url_resolved,
               language, tags, user_note, approved, submitted_at
        FROM station_submissions
        ${whereClause}
        ORDER BY submitted_at DESC
        LIMIT :limit OFFSET :offset
        `,
        { limit, offset },
      )

      res.json(rows)
    } catch {
      sendApiError(res, 500, 'INTERNAL_ERROR', 'Failed to fetch submissions.')
    }
  }

  async function getSubmissionsCount(req, res) {
    const status = typeof req.query.status === 'string' ? req.query.status : 'pending'
    if (!['pending', 'approved', 'all'].includes(status)) {
      sendApiError(res, 400, 'INVALID_QUERY', 'status must be pending, approved, or all.')
      return
    }

    let whereClause = ''
    if (status === 'pending') {
      whereClause = 'WHERE approved = 0'
    } else if (status === 'approved') {
      whereClause = 'WHERE approved = 1'
    }

    try {
      const [rows] = await pool.query(
        `
        SELECT COUNT(*) AS count
        FROM station_submissions
        ${whereClause}
        `,
      )

      res.json({ count: Number(rows[0]?.count ?? 0) })
    } catch {
      sendApiError(res, 500, 'INTERNAL_ERROR', 'Failed to count submissions.')
    }
  }

  async function updateSubmission(req, res) {
    const id = Number(req.params.id)
    if (!Number.isInteger(id) || id <= 0) {
      sendApiError(res, 400, 'INVALID_SUBMISSION_ID', 'Invalid submission id.')
      return
    }

    const body = req.body ?? {}
    if (typeof body.approved !== 'boolean' && body.approved !== 0 && body.approved !== 1) {
      sendApiError(res, 400, 'INVALID_PAYLOAD', 'approved must be boolean.')
      return
    }
    const approved = body.approved === true || body.approved === 1

    try {
      const [existingRows] = await pool.query(
        `
        SELECT id, stationuuid, approved
        FROM station_submissions
        WHERE id = :id
        LIMIT 1
        `,
        { id },
      )

      const existing = existingRows[0]
      if (!existing) {
        sendApiError(res, 404, 'SUBMISSION_NOT_FOUND', 'Submission not found.')
        return
      }

      const previousApproved = Number(existing.approved) === 1 ? 1 : 0
      const nextApproved = approved ? 1 : 0

      await pool.query(
        'UPDATE station_submissions SET approved = :approved WHERE id = :id',
        { approved: approved ? 1 : 0, id },
      )

      const [rows] = await pool.query(
        `
        SELECT id, stationuuid, name, country, state, favicon, url_resolved,
               language, tags, user_note, approved, submitted_at
        FROM station_submissions
        WHERE id = :id
        LIMIT 1
        `,
        { id },
      )

      const adminUsername = normalizeText(req.adminAuth?.payload?.sub ?? 'admin', 120)
      const userAgentHeader = req.headers['user-agent']
      const userAgent = normalizeText(Array.isArray(userAgentHeader) ? userAgentHeader[0] : userAgentHeader, 255)
      const requestIp = normalizeText(getClientIdentifier(req), 120)

      await pool.query(
        `
        INSERT INTO admin_moderation_audit_log (
          submission_id,
          stationuuid,
          action,
          previous_approved,
          next_approved,
          admin_username,
          ip_address,
          user_agent
        ) VALUES (
          :submission_id,
          :stationuuid,
          :action,
          :previous_approved,
          :next_approved,
          :admin_username,
          :ip_address,
          :user_agent
        )
        `,
        {
          submission_id: id,
          stationuuid: normalizeText(existing.stationuuid, 80),
          action: nextApproved === 1 ? 'approve' : 'reject',
          previous_approved: previousApproved,
          next_approved: nextApproved,
          admin_username: adminUsername,
          ip_address: requestIp,
          user_agent: userAgent,
        },
      )

      res.json(rows[0] ?? null)
    } catch {
      sendApiError(res, 500, 'INTERNAL_ERROR', 'Failed to update submission.')
    }
  }

  return {
    getSubmissions,
    getSubmissionsCount,
    updateSubmission,
  }
}
