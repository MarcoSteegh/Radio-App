import { useState, useEffect, useCallback, useRef } from 'react'

export function useSleepTimer(clockTick: number) {
  const [sleepEndsAt, setSleepEndsAt] = useState<number | null>(null)
  const sleepTimerRef = useRef<number | null>(null)

  useEffect(() => {
    return () => {
      if (sleepTimerRef.current !== null) {
        window.clearTimeout(sleepTimerRef.current)
      }
    }
  }, [])

  const activateSleepTimer = useCallback((minutes: number, audioRef: React.RefObject<HTMLAudioElement | null>, showToast: (text: string, tone: 'info' | 'success' | 'error') => void) => {
    if (sleepTimerRef.current !== null) {
      window.clearTimeout(sleepTimerRef.current)
      sleepTimerRef.current = null
    }

    if (minutes <= 0) {
      setSleepEndsAt(null)
      return
    }

    const endsAt = clockTick + minutes * 60 * 1000
    setSleepEndsAt(endsAt)

    sleepTimerRef.current = window.setTimeout(() => {
      audioRef.current?.pause()
      setSleepEndsAt(null)
      showToast('Sleep timer: audio gepauzeerd.', 'info')
      sleepTimerRef.current = null
    }, minutes * 60 * 1000)
  }, [clockTick])

  return {
    sleepEndsAt,
    activateSleepTimer,
  }
}
