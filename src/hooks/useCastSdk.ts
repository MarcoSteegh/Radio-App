import { useState, useEffect } from 'react'

const CAST_SENDER_URL = 'https://www.gstatic.com/cv/js/sender/v1/cast_sender.js?loadCastFramework=1'

type ChromeCastLike = {
  __onGCastApiAvailable?: (isAvailable: boolean) => void
  cast?: {
    framework?: {
      CastContext: { getInstance: () => { setOptions: (options: { receiverApplicationId: string; autoJoinPolicy: string }) => void } }
      CastContextEventType?: { SESSION_STATE_CHANGED: string }
      SessionState?: { SESSION_STARTED: string; SESSION_RESUMED: string; SESSION_ENDING: string; SESSION_ENDED: string; NO_SESSION: string }
    }
  }
}

export type CastSdkState = {
  isCastAvailable: boolean
  isCastLoading: boolean
  castError: string | null
  setCastError: (error: string | null) => void
}

export function useCastSdk(): CastSdkState {
  const [isCastAvailable, setIsCastAvailable] = useState(false)
  const [castError, setCastError] = useState<string | null>(null)
  const [isCastLoading, setIsCastLoading] = useState(true)

  useEffect(() => {
    if (!window.isSecureContext) return

    const castWindow = window as Window & ChromeCastLike
    let isMounted = true

    const tryConfigureCast = () => {
      const framework = castWindow.cast?.framework
      if (!framework) return false

      try {
        const receiverApplicationId =
          castWindow.chrome?.cast?.media?.DEFAULT_MEDIA_RECEIVER_APP_ID ?? 'CC1AD845'

        framework.CastContext.getInstance().setOptions({
          receiverApplicationId,
          autoJoinPolicy: 'origin_scoped',
        })

        if (isMounted) {
          setIsCastAvailable(true)
          setCastError(null)
          setIsCastLoading(false)
        }
        return true
      } catch {
        if (isMounted) {
          setIsCastAvailable(false)
          setCastError('Google Cast kon niet worden geinitialiseerd.')
          setIsCastLoading(false)
        }
        return false
      }
    }

    const previousCastCallback = castWindow.__onGCastApiAvailable
    const castReadyCallback = (isAvailable: boolean) => {
      previousCastCallback?.(isAvailable)
      if (!isMounted) return

      const configured = tryConfigureCast()
      if (!configured) {
        setCastError('Google Cast kon niet worden geinitialiseerd.')
        setIsCastLoading(false)
        return
      }

      if (!isAvailable) {
        setIsCastAvailable(false)
      }
    }

    castWindow.__onGCastApiAvailable = castReadyCallback

    if (tryConfigureCast()) {
      return () => {
        isMounted = false
        if (castWindow.__onGCastApiAvailable === castReadyCallback) {
          castWindow.__onGCastApiAvailable = previousCastCallback
        }
      }
    }

    const existingCastScript = Array.from(document.querySelectorAll('script')).find(
      (s) => s.getAttribute('src')?.includes('cast_sender.js'),
    )

    if (existingCastScript) {
      return () => {
        isMounted = false
        if (castWindow.__onGCastApiAvailable === castReadyCallback) {
          castWindow.__onGCastApiAvailable = previousCastCallback
        }
      }
    }

    const script = document.createElement('script')
    script.src = CAST_SENDER_URL
    script.async = true
    script.defer = true

    const onError = () => {
      if (!isMounted) return
      setIsCastAvailable(false)
      setCastError('Google Cast SDK kon niet worden geladen.')
      setIsCastLoading(false)
    }

    script.addEventListener('error', onError)
    document.head.appendChild(script)

    return () => {
      isMounted = false
      script.removeEventListener('error', onError)
      if (castWindow.__onGCastApiAvailable === castReadyCallback) {
        castWindow.__onGCastApiAvailable = previousCastCallback
      }
    }
  }, [])

  return { isCastAvailable, isCastLoading, castError, setCastError }
}
