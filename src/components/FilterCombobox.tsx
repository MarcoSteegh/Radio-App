import { useState, useRef, useEffect, useMemo } from 'react'
import { useI18n } from '../lib/useI18n'

type FilterComboboxProps = {
  label: string
  value: string
  options: string[]
  allLabel: string
  onChange: (value: string) => void
}

export default function FilterCombobox({ label, value, options, allLabel, onChange }: FilterComboboxProps) {
  const { t } = useI18n()
  const [isOpen, setIsOpen] = useState(false)
  const [search, setSearch] = useState('')
  const inputRef = useRef<HTMLInputElement | null>(null)
  const listRef = useRef<HTMLUListElement | null>(null)

  const selectedLabel = value === 'all' ? allLabel : value

  const filtered = useMemo(() => {
    if (!search) return options
    const lower = search.toLowerCase()
    return options.filter((opt) => opt.toLowerCase().includes(lower))
  }, [options, search])

  const openDropdown = () => {
    setIsOpen(true)
    setSearch('')
  }

  useEffect(() => {
    if (isOpen) {
      inputRef.current?.focus()
    }
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return
    function handleClickOutside(e: MouseEvent) {
      if (listRef.current && !listRef.current.contains(e.target as Node) &&
          inputRef.current && !inputRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isOpen])

  return (
    <div className="combobox-wrapper">
      <label className="filter-label">{label}</label>
      <button
        type="button"
        className="combobox-trigger"
        onClick={() => isOpen ? setIsOpen(false) : openDropdown()}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-label={label}
      >
        <span className="combobox-value">{selectedLabel}</span>
        <span className="combobox-chevron" aria-hidden="true">▾</span>
      </button>
      {isOpen && (
        <div className="combobox-dropdown">
          <input
            ref={inputRef}
            type="text"
            className="combobox-search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('filter.searchPlaceholder')}
            aria-label={label}
          />
          <ul ref={listRef} className="combobox-list" role="listbox">
            <li
              className={`combobox-option ${value === 'all' ? 'selected' : ''}`}
              role="option"
              aria-selected={value === 'all'}
              onClick={() => { onChange('all'); setIsOpen(false) }}
            >
              {allLabel}
            </li>
            {filtered.map((opt) => (
              <li
                key={opt}
                className={`combobox-option ${value === opt ? 'selected' : ''}`}
                role="option"
                aria-selected={value === opt}
                onClick={() => { onChange(opt); setIsOpen(false) }}
              >
                {opt}
              </li>
            ))}
            {filtered.length === 0 && (
              <li className="combobox-empty">{t('filter.noResults')}</li>
            )}
          </ul>
        </div>
      )}
    </div>
  )
}
