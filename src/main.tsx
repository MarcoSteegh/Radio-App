import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import * as Sentry from '@sentry/react'
import { I18nProvider } from './lib/i18n'
import './lib/sentry'
import './index.css'
import App from './App.tsx'

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {})
  })
}

const Fallback = (
  <div style={{ padding: 24, fontFamily: 'system-ui' }}>
    <h1>Er is iets misgegaan</h1>
    <p>Probeer de pagina te vernieuwen. Als het probleem aanhoudt, neem contact op.</p>
  </div>
)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Sentry.ErrorBoundary fallback={Fallback} showDialog>
      <I18nProvider>
        <App />
      </I18nProvider>
    </Sentry.ErrorBoundary>
  </StrictMode>,
)
