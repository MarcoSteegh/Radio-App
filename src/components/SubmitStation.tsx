import { useActionState } from 'react'
import { findStationByUrl, submitStation } from '../lib/apiClient'
import { trackEvent } from '../lib/observability'

type Props = {
  onClose: () => void
}

type ActionResult = {
  status: 'idle' | 'success' | 'duplicate' | 'error'
}

const initialResult: ActionResult = { status: 'idle' }

function validateUrl(value: string): boolean {
  try {
    const { protocol } = new URL(value)
    return protocol === 'http:' || protocol === 'https:'
  } catch {
    return false
  }
}

function getString(formData: FormData, key: string): string {
  return (formData.get(key) as string | null) ?? ''
}

export default function SubmitStation({ onClose }: Props) {
  const [result, submitAction, isPending] = useActionState(
    async (_prev: ActionResult, formData: FormData): Promise<ActionResult> => {
      const urlResolved = getString(formData, 'url_resolved').trim()

      if (!validateUrl(urlResolved)) {
        return { status: 'error' }
      }

      try {
        const existing = await findStationByUrl(urlResolved)
        if (existing) {
          trackEvent('submit_station_duplicate', { url: urlResolved })
          return { status: 'duplicate' }
        }

        const country = getString(formData, 'country').trim()
        await submitStation({
          name: getString(formData, 'name').trim().slice(0, 400),
          url_resolved: urlResolved.slice(0, 500),
          country: country.slice(0, 100),
          language: getString(formData, 'language').trim().slice(0, 200),
          tags: getString(formData, 'tags').trim().slice(0, 500),
          favicon: getString(formData, 'favicon').trim().slice(0, 500),
          user_note: getString(formData, 'user_note').trim().slice(0, 500),
        })

        trackEvent('submit_station', {
          country,
          hasFavicon: Boolean(getString(formData, 'favicon').trim()),
        })

        return { status: 'success' }
      } catch {
        return { status: 'error' }
      }
    },
    initialResult,
  )

  return (
    <div className="submit-overlay" role="dialog" aria-modal="true" aria-label="Station doorsturen">
      <div className="submit-panel">
        <button
          type="button"
          className="submit-close"
          onClick={onClose}
          aria-label="Sluiten"
        >
          ✕
        </button>

        <p className="eyebrow">Gemeenschap</p>
        <h2 className="submit-title">Station doorsturen</h2>
        <p className="submit-desc">
          Ken je een radiostation dat nog ontbreekt? Stuur het door en wij voegen
          het toe na beoordeling.
        </p>

        {result.status === 'success' ? (
          <div className="submit-result submit-result--success">
            <p>Bedankt! Je inzending is ontvangen en wordt zo snel mogelijk beoordeeld.</p>
            <button type="button" className="secondary-btn" onClick={onClose}>
              Sluiten
            </button>
          </div>
        ) : (
          <form action={submitAction} noValidate>
            <div className="submit-fields">
              <label className="submit-label">
                Naam van het station *
                <input
                  className="submit-input"
                  name="name"
                  required
                  maxLength={400}
                  placeholder="bijv. NPO Radio 2"
                />
              </label>

              <label className="submit-label">
                Stream URL (http/https) *
                <input
                  className="submit-input"
                  type="url"
                  name="url_resolved"
                  required
                  maxLength={500}
                  placeholder="https://stream.example.com/radio"
                />
              </label>

              <div className="submit-row">
                <label className="submit-label">
                  Land
                  <input
                    className="submit-input"
                    name="country"
                    maxLength={100}
                    placeholder="bijv. Netherlands"
                  />
                </label>

                <label className="submit-label">
                  Taal
                  <input
                    className="submit-input"
                    name="language"
                    maxLength={200}
                    placeholder="bijv. dutch"
                  />
                </label>
              </div>

              <label className="submit-label">
                Tags (komma-gescheiden)
                <input
                  className="submit-input"
                  name="tags"
                  maxLength={500}
                  placeholder="bijv. pop, hits, top 40"
                />
              </label>

              <label className="submit-label">
                Logo URL (optioneel)
                <input
                  className="submit-input"
                  type="url"
                  name="favicon"
                  maxLength={500}
                  placeholder="https://example.com/logo.png"
                />
              </label>

              <label className="submit-label">
                Opmerking (optioneel)
                <textarea
                  className="submit-input submit-textarea"
                  name="user_note"
                  maxLength={500}
                  rows={3}
                  placeholder="Extra informatie voor de beheerder"
                />
              </label>
            </div>

            {result.status === 'duplicate' && (
              <p className="submit-error">
                Dit station staat al in onze database (zelfde stream URL).
              </p>
            )}
            {result.status === 'error' && (
              <p className="submit-error">
                Controleer de stream URL (moet beginnen met http:// of https://) en
                probeer het opnieuw.
              </p>
            )}

            <div className="submit-actions">
              <button
                type="button"
                className="secondary-btn"
                onClick={onClose}
                disabled={isPending}
              >
                Annuleren
              </button>
              <button type="submit" disabled={isPending}>
                {isPending ? 'Indienen…' : 'Indienen'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
