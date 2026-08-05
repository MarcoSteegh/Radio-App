import type { Station } from '../types/station'
import { useCastSdk } from './useCastSdk'
import { useCastSession } from './useCastSession'
import { useCastMedia, loadMediaToSession } from './useCastMedia'

export function useCast(selectedStation: Station | null) {
  const { isCastAvailable, isCastLoading, castError, setCastError } = useCastSdk()

  const {
    isCasting,
    castDeviceName,
    isAudioPlaying,
    setIsAudioPlaying,
    connectGoogleHome,
    refreshCastSession,
  } = useCastSession(isCastAvailable, isCastLoading, castError, setCastError, selectedStation, loadMediaToSession)

  const { castToStation, setCastVolume, castPause, castPlay } = useCastMedia(setCastError, setIsAudioPlaying)

  return {
    isCastAvailable,
    isCasting,
    castDeviceName,
    castError,
    isCastLoading,
    isAudioPlaying,
    setIsAudioPlaying,
    setCastError,
    connectGoogleHome,
    castToStation,
    refreshCastSession,
    setCastVolume,
    castPause,
    castPlay,
  }
}
