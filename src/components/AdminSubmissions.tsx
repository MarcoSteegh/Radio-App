import { useEffect, useMemo, useState } from 'react'
import {
  ApiError,
  fetchAdminObservabilitySummary,
  fetchAdminSubmissions,
  type AdminObservabilitySummary,
  type AdminSubmission,
  loginAdmin,
  logoutAdmin,
  updateAdminSubmission,
} from '../lib/apiClient'

type Props = {
  onClose: () => void
}

type LoadState = 'idle' | 'loading' | 'ready' | 'error'

const EXEC_KPI_TARGETS = {
  activationPct: 65,
  d1RetentionPct: 28,
  d7RetentionPct: 12,
  castSuccessPct: 85,
  streamStartPct: 70,
} as const

function getKpiTone(value: number | null | undefined, target: number): 'kpi-good' | 'kpi-warn' | 'kpi-bad' | 'kpi-na' {
  if (typeof value !== 'number') {
    return 'kpi-na'
  }
  if (value >= target) {
    return 'kpi-good'
  }
  if (value >= Math.max(0, target - 10)) {
    return 'kpi-warn'
  }
  return 'kpi-bad'
}

export default function AdminSubmissions({ onClose }: Props) {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [statusFilter, setStatusFilter] = useState<'pending' | 'approved' | 'all'>('pending')
  const [loadState, setLoadState] = useState<LoadState>('idle')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [submissions, setSubmissions] = useState<AdminSubmission[]>([])
  const [observabilitySummary, setObservabilitySummary] = useState<AdminObservabilitySummary | null>(null)
  const [workingId, setWorkingId] = useState<number | null>(null)

  const pendingCount = useMemo(
    () => submissions.filter((item) => Number(item.approved) !== 1).length,
    [submissions],
  )

  const topEndpointErrorRates = useMemo(
    () => (observabilitySummary?.last24h.endpointErrorRates ?? []).slice(0, 5),
    [observabilitySummary],
  )

  const funnelSteps = useMemo(
    () => observabilitySummary?.last24h.funnel ?? [],
    [observabilitySummary],
  )

  const funnelCompletenessPct = observabilitySummary?.last24h.funnelCompletenessPct ?? 0
  const previousFunnelCompletenessPct = observabilitySummary?.last24h.previousFunnelCompletenessPct ?? 0
  const funnelCompletenessTrendPct = observabilitySummary?.last24h.funnelCompletenessTrendPct ?? 0
  const funnelCompletenessTone = funnelCompletenessPct >= 95
    ? 'kpi-good'
    : funnelCompletenessPct >= 80
      ? 'kpi-warn'
      : 'kpi-bad'
  const trendTone = funnelCompletenessTrendPct >= 0 ? 'kpi-good' : 'kpi-bad'
  const trendSign = funnelCompletenessTrendPct >= 0 ? '+' : ''
  const funnelCompletenessSeries7d = observabilitySummary?.last24h.funnelCompletenessSeries7d ?? []
  const executiveKpis = observabilitySummary?.last24h.kpis

  const formatPct = (value: number | null | undefined) => (
    typeof value === 'number' ? `${value.toFixed(2)}%` : 'n.v.t.'
  )

  const activationTone = getKpiTone(executiveKpis?.activation.activationRatePct, EXEC_KPI_TARGETS.activationPct)
  const d1Tone = getKpiTone(executiveKpis?.retention.d1.retentionRatePct, EXEC_KPI_TARGETS.d1RetentionPct)
  const d7Tone = getKpiTone(executiveKpis?.retention.d7.retentionRatePct, EXEC_KPI_TARGETS.d7RetentionPct)
  const castTone = getKpiTone(executiveKpis?.cast.successRatePct, EXEC_KPI_TARGETS.castSuccessPct)
  const streamStartTone = getKpiTone(executiveKpis?.streamStart.successRatePct, EXEC_KPI_TARGETS.streamStartPct)

  const clearAuthSession = () => {
    setIsAuthenticated(false)
    setPassword('')
    setSubmissions([])
    setObservabilitySummary(null)
  }

  const loadSubmissions = async (
    nextFilter?: 'pending' | 'approved' | 'all',
    options: { suppressUnauthorizedMessage?: boolean } = {},
  ) => {
    const { suppressUnauthorizedMessage = false } = options
    const requestedFilter = nextFilter ?? statusFilter

    setLoadState('loading')
    setErrorMessage(null)

    try {
      const rows = await fetchAdminSubmissions({
        status: requestedFilter,
        offset: 0,
        limit: 200,
      })

      setSubmissions(rows)
      setIsAuthenticated(true)

      try {
        const summary = await fetchAdminObservabilitySummary()
        setObservabilitySummary(summary)
      } catch {
        setObservabilitySummary(null)
      }

      setLoadState('ready')
    } catch (error) {
      if (error instanceof ApiError) {
        if (error.code === 'UNAUTHORIZED' || error.code === 'TOKEN_REVOKED' || error.code === 'TOKEN_EXPIRED') {
          clearAuthSession()
          if (!suppressUnauthorizedMessage) {
            setErrorMessage('Je admin sessie is verlopen. Log opnieuw in.')
          } else {
            setErrorMessage(null)
          }
          setLoadState(suppressUnauthorizedMessage ? 'idle' : 'error')
          return
        } else {
          setErrorMessage(error.message)
        }
      } else {
        setErrorMessage('Kon inzendingen niet laden. Controleer je admin sessie en backend.')
      }
      setLoadState('error')
    }
  }

  const onLogin = async () => {
    const cleanUsername = username.trim()
    if (!cleanUsername || !password) {
      setErrorMessage('Vul gebruikersnaam en wachtwoord in.')
      return
    }

    setLoadState('loading')
    setErrorMessage(null)

    try {
      await loginAdmin({
        username: cleanUsername,
        password,
      })

      setIsAuthenticated(true)
      setPassword('')
      await loadSubmissions(statusFilter)
    } catch (error) {
      if (error instanceof ApiError) {
        setErrorMessage(error.message)
      } else {
        setErrorMessage('Inloggen mislukt.')
      }
      setLoadState('error')
    }
  }

  const onLogout = () => {
    void logoutAdmin().catch(() => {
      // Local session cleanup should still proceed on network or server errors.
    })

    setIsAuthenticated(false)
    setPassword('')
    setSubmissions([])
    setObservabilitySummary(null)
    setLoadState('idle')
    setErrorMessage(null)
  }

  const updateSubmission = async (id: number, approved: boolean) => {
    if (!isAuthenticated) {
      setErrorMessage('Log eerst in als admin.')
      return
    }

    setWorkingId(id)
    setErrorMessage(null)

    try {
      await updateAdminSubmission({ id, approved })

      setSubmissions((previous) => {
        const updatedApproved = approved ? 1 : 0
        return previous.flatMap((item) => {
          if (item.id !== id) {
            return [item]
          }

          if (statusFilter === 'pending' && updatedApproved === 1) {
            return []
          }

          if (statusFilter === 'approved' && updatedApproved === 0) {
            return []
          }

          return [{ ...item, approved: updatedApproved }]
        })
      })
    } catch (error) {
      if (error instanceof ApiError) {
        if (error.code === 'UNAUTHORIZED' || error.code === 'TOKEN_EXPIRED' || error.code === 'TOKEN_REVOKED') {
          clearAuthSession()
          setErrorMessage('Je admin sessie is verlopen. Log opnieuw in.')
        } else {
          setErrorMessage(error.message)
        }
      } else {
        setErrorMessage('Kon inzending niet bijwerken.')
      }
    } finally {
      setWorkingId(null)
    }
  }

  useEffect(() => {
    const startupTimerId = window.setTimeout(() => {
      void loadSubmissions(undefined, { suppressUnauthorizedMessage: true })
    }, 0)

    return () => {
      window.clearTimeout(startupTimerId)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!isAuthenticated) {
      return
    }

    const refreshTimerId = window.setTimeout(() => {
      void loadSubmissions(statusFilter)
    }, 0)

    return () => {
      window.clearTimeout(refreshTimerId)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, statusFilter])

  return (
    <div className="submit-overlay" role="dialog" aria-modal="true" aria-label="Inzendingen beheren">
      <div className="submit-panel admin-panel">
        <button type="button" className="submit-close" onClick={onClose} aria-label="Sluiten">
          ✕
        </button>

        <p className="eyebrow">Beheer</p>
        <h2 className="submit-title">Inzendingen beoordelen</h2>
        <p className="submit-desc">
          Keur nieuwe stations goed of wijs ze af. Goedkeuren zet het station automatisch in de
          stations tabel.
        </p>

        {!isAuthenticated ? (
          <>
            <label className="submit-label" htmlFor="admin-username">
              Gebruikersnaam
              <input
                id="admin-username"
                className="submit-input"
                type="text"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                placeholder="admin"
              />
            </label>

            <label className="submit-label" htmlFor="admin-password">
              Wachtwoord
              <input
                id="admin-password"
                className="submit-input"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="••••••••"
              />
            </label>

            <div className="submit-actions admin-actions">
              <button
                type="button"
                className="secondary-btn"
                onClick={() => { void onLogin() }}
                disabled={loadState === 'loading'}
              >
                {loadState === 'loading' ? 'Inloggen...' : 'Inloggen'}
              </button>
            </div>
          </>
        ) : (
          <div className="submit-actions admin-actions">
            <label className="submit-label admin-filter" htmlFor="admin-status-filter">
              Status
              <select
                id="admin-status-filter"
                className="submit-input"
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value as 'pending' | 'approved' | 'all')}
              >
                <option value="pending">Openstaand</option>
                <option value="approved">Goedgekeurd</option>
                <option value="all">Alles</option>
              </select>
            </label>
            <button
              type="button"
              className="secondary-btn"
              onClick={() => { void loadSubmissions() }}
              disabled={loadState === 'loading'}
            >
              {loadState === 'loading' ? 'Laden...' : 'Vernieuw lijst'}
            </button>
            <button
              type="button"
              className="secondary-btn"
              onClick={() => { onLogout() }}
              disabled={loadState === 'loading'}
            >
              Uitloggen
            </button>
          </div>
        )}

        {errorMessage ? <p className="submit-error">{errorMessage}</p> : null}

        <div className="admin-summary" aria-live="polite">
          {!isAuthenticated
            ? 'Log in om inzendingen te beheren.'
            : loadState === 'loading'
              ? 'Inzendingen laden...'
              : `Getoonde inzendingen: ${submissions.length} · Openstaand in lijst: ${pendingCount}`}
        </div>

        {isAuthenticated && observabilitySummary ? (
          <section className="admin-observability" aria-live="polite">
            <div className="admin-summary">
              Laatste 24u observability: sessies {observabilitySummary.last24h.activeSessions} · errors {observabilitySummary.last24h.errorCount} · events {observabilitySummary.last24h.eventsByName.slice(0, 3).map((row) => `${row.event_name} (${row.count})`).join(', ') || 'geen'}
            </div>

            <div className="admin-observability-grid">
              <article className="admin-observability-card">
                <h3>Executive KPI frame</h3>
                <div className="admin-funnel-list">
                  <div className="admin-funnel-row">
                    <span>Activation (play_start / app_open)</span>
                    <div className="admin-observability-kpi-badges">
                      <span className="admin-observability-subtle">
                        {formatPct(executiveKpis?.activation.activationRatePct)} ({executiveKpis?.activation.activatedSessions ?? 0}/{executiveKpis?.activation.appOpenSessions ?? 0})
                      </span>
                      <span className={`admin-kpi-pill ${activationTone}`}>
                        doel {EXEC_KPI_TARGETS.activationPct}%
                      </span>
                    </div>
                  </div>
                  <div className="admin-funnel-row">
                    <span>D1 retention</span>
                    <div className="admin-observability-kpi-badges">
                      <span className="admin-observability-subtle">
                        {formatPct(executiveKpis?.retention.d1.retentionRatePct)} ({executiveKpis?.retention.d1.retainedSessions ?? 0}/{executiveKpis?.retention.d1.cohortSize ?? 0})
                      </span>
                      <span className={`admin-kpi-pill ${d1Tone}`}>
                        doel {EXEC_KPI_TARGETS.d1RetentionPct}%
                      </span>
                    </div>
                  </div>
                  <div className="admin-funnel-row">
                    <span>D7 retention</span>
                    <div className="admin-observability-kpi-badges">
                      <span className="admin-observability-subtle">
                        {formatPct(executiveKpis?.retention.d7.retentionRatePct)} ({executiveKpis?.retention.d7.retainedSessions ?? 0}/{executiveKpis?.retention.d7.cohortSize ?? 0})
                      </span>
                      <span className={`admin-kpi-pill ${d7Tone}`}>
                        doel {EXEC_KPI_TARGETS.d7RetentionPct}%
                      </span>
                    </div>
                  </div>
                  <div className="admin-funnel-row">
                    <span>Cast success rate</span>
                    <div className="admin-observability-kpi-badges">
                      <span className="admin-observability-subtle">
                        {formatPct(executiveKpis?.cast.successRatePct)} ({executiveKpis?.cast.successes ?? 0}/{executiveKpis?.cast.attempts ?? 0})
                      </span>
                      <span className={`admin-kpi-pill ${castTone}`}>
                        doel {EXEC_KPI_TARGETS.castSuccessPct}%
                      </span>
                    </div>
                  </div>
                  <div className="admin-funnel-row">
                    <span>Stream start success</span>
                    <div className="admin-observability-kpi-badges">
                      <span className="admin-observability-subtle">
                        {formatPct(executiveKpis?.streamStart.successRatePct)} ({executiveKpis?.streamStart.successes ?? 0}/{executiveKpis?.streamStart.attempts ?? 0})
                      </span>
                      <span className={`admin-kpi-pill ${streamStartTone}`}>
                        doel {EXEC_KPI_TARGETS.streamStartPct}%
                      </span>
                    </div>
                  </div>
                </div>
                <p className="admin-observability-subtle">
                  KPI window: laatste 24 uur.
                </p>
              </article>

              <article className="admin-observability-card">
                <h3>Funnel</h3>
                <div className="admin-observability-kpi-row">
                  <p className="admin-observability-kpi">
                    Completeness: {funnelCompletenessPct.toFixed(2)}%
                  </p>
                  <div className="admin-observability-kpi-badges">
                    <span className={`admin-kpi-pill ${funnelCompletenessTone}`}>
                      doel 95%
                    </span>
                    <span className={`admin-kpi-pill ${trendTone}`}>
                      trend {trendSign}{funnelCompletenessTrendPct.toFixed(2)}%
                    </span>
                  </div>
                </div>
                <p className="admin-observability-subtle">
                  Vorige 24u: {previousFunnelCompletenessPct.toFixed(2)}%
                </p>
                {funnelCompletenessSeries7d.length > 0 ? (
                  <div className="admin-sparkline-wrap">
                    <div className="admin-sparkline" role="img" aria-label="7-daagse funnel completeness trend">
                      {funnelCompletenessSeries7d.map((point) => {
                        const heightPct = Math.max(6, Math.min(100, point.completenessPct))
                        return (
                          <span
                            key={point.day}
                            className="admin-sparkline-bar"
                            style={{ height: `${heightPct}%` }}
                            title={`${point.day}: ${point.completenessPct.toFixed(2)}%`}
                          />
                        )
                      })}
                    </div>
                    <div className="admin-sparkline-axis" aria-hidden="true">
                      {funnelCompletenessSeries7d.map((point) => {
                        const dayLabel = new Date(point.day).toLocaleDateString('nl-NL', { weekday: 'short' })
                        return (
                          <span key={`axis-${point.day}`} className="admin-sparkline-axis-label">
                            {dayLabel.replace('.', '')}
                          </span>
                        )
                      })}
                    </div>
                    <div className="admin-sparkline-legend">7 dagen trend</div>
                  </div>
                ) : null}
                {funnelSteps.length > 0 ? (
                  <div className="admin-funnel-list">
                    {funnelSteps.map((step) => (
                      <div className="admin-funnel-row" key={step.eventName}>
                        <span>{step.eventName}</span>
                        <span>
                          {step.sessions} sessies · {step.conversionFromStartPct.toFixed(2)}%
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="helper">Nog geen funnel-data.</p>
                )}
              </article>

              <article className="admin-observability-card">
                <h3>Endpoint error rates</h3>
                {topEndpointErrorRates.length > 0 ? (
                  <div className="admin-funnel-list">
                    {topEndpointErrorRates.map((row) => (
                      <div className="admin-funnel-row" key={row.endpoint}>
                        <span>{row.endpoint}</span>
                        <span>
                          {row.errorRatePct.toFixed(2)}% ({row.errorRequests}/{row.totalRequests})
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="helper">Nog geen endpoint error-data.</p>
                )}
              </article>
            </div>
          </section>
        ) : null}

        <div className="admin-list">
          {isAuthenticated ? null : (
            <p className="helper">Gebruik je admin-account om in te loggen.</p>
          )}

          {loadState === 'ready' && submissions.length === 0 ? (
            <p className="helper">Geen inzendingen voor dit filter.</p>
          ) : null}

          {submissions.map((submission) => (
            <article key={submission.id} className="admin-item">
              <header className="admin-item-header">
                <strong>{submission.name}</strong>
                <span>#{submission.id}</span>
              </header>
              <p className="admin-item-meta">
                {submission.country || 'Onbekend land'}
                {submission.language ? ` · ${submission.language}` : ''}
              </p>
              <p className="admin-item-url">{submission.url_resolved}</p>
              {submission.tags ? <p className="admin-item-meta">Tags: {submission.tags}</p> : null}
              {submission.user_note ? <p className="admin-item-note">{submission.user_note}</p> : null}

              <div className="admin-item-actions">
                <button
                  type="button"
                  className="secondary-btn"
                  onClick={() => { void updateSubmission(submission.id, false) }}
                  disabled={workingId === submission.id}
                >
                  Afkeuren
                </button>
                <button
                  type="button"
                  onClick={() => { void updateSubmission(submission.id, true) }}
                  disabled={workingId === submission.id}
                >
                  Goedkeuren
                </button>
              </div>
            </article>
          ))}
        </div>
      </div>
    </div>
  )
}
