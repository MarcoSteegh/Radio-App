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
      (error) => {
        let message = 'Locatie ophalen mislukt.'
        if (error.code === GeolocationPositionError.PERMISSION_DENIED) {
          message = 'Locatie toegang geweigerd. Sta locatietoegang toe in je browserinstellingen.'
        } else if (error.code === GeolocationPositionError.TIMEOUT) {
          message = 'Locatie ophalen duurde te lang. Probeer het opnieuw.'
        } else if (error.code === GeolocationPositionError.POSITION_UNAVAILABLE) {
          message = 'Locatie niet beschikbaar. Controleer je apparaatinstellingen.'
        }
        setLocationError(message)
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
