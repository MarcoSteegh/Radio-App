import { useEffect, useState } from 'react'
import { formatCountdown, getCountdownTone } from '../utils/stationUtils'

type OfflineCountdownProps = {
  offlineUntil: number
  onExpire: () => void
}

function OfflineCountdown({ offlineUntil, onExpire }: OfflineCountdownProps) {
  const [msRemaining, setMsRemaining] = useState(() =>
    Math.max(0, offlineUntil - Date.now()),
  )

  useEffect(() => {
    if (offlineUntil <= Date.now()) {
      onExpire()
      return
    }

    const timerId = window.setInterval(() => {
      const next = Math.max(0, offlineUntil - Date.now())
      setMsRemaining(next)

      if (next <= 0) {
        window.clearInterval(timerId)
        onExpire()
      }
    }, 1000)

    return () => {
      window.clearInterval(timerId)
    }
  }, [offlineUntil, onExpire])

  return (
    <span className={`countdown ${getCountdownTone(msRemaining)}`}>
      {formatCountdown(msRemaining)}
    </span>
  )
}

export default OfflineCountdown
