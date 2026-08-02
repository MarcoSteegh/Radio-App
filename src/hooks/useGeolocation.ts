import { useState, useCallback } from 'react'

export function useGeolocation() {
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null)
  const [isLocating, setIsLocating] = useState(false)
  const [locationError, setLocationError] = useState<string | null>(null)

  const locateUser = useCallback(() => {
    if (!navigator.geolocation) {
      setLocationError('Geolocatie wordt niet ondersteund in deze browser.')
      return
    }

    setIsLocating(true)
    setLocationError(null)

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setUserLocation({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        })
        setIsLocating(false)
      },
      () => {
        setLocationError('Locatie ophalen mislukt. Controleer je browsertoestemming.')
        setIsLocating(false)
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
      },
    )
  }, [])

  return {
    userLocation,
    isLocating,
    locationError,
    locateUser,
  }
}
