import { useState, useEffect, useCallback } from 'react'
import type { Toast } from '../types/station'

export function useToast() {
  const [toast, setToast] = useState<Toast | null>(null)

  useEffect(() => {
    if (!toast) {
      return
    }

    const timerId = window.setTimeout(() => {
      setToast((current) => (current?.id === toast.id ? null : current))
    }, 2800)

    return () => {
      window.clearTimeout(timerId)
    }
  }, [toast])

  const showToast = useCallback((text: string, tone: Toast['tone']) => {
    setToast({
      id: Date.now(),
      text,
      tone,
    })
  }, [])

  const dismissToast = useCallback(() => {
    setToast(null)
  }, [])

  return {
    toast,
    showToast,
    dismissToast,
  }
}
