import { createContext } from 'react'
import type { Locale } from './i18n'

export type I18nContextValue = {
  locale: Locale
  setLocale: (l: Locale) => void
  t: (key: string, vars?: Record<string, string>) => string
}

export const I18nContext = createContext<I18nContextValue>({
  locale: 'nl',
  setLocale: () => {},
  t: (key) => key,
})
