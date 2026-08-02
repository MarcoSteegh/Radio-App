import { useEffect, useRef } from 'react'
import { useMap } from 'react-leaflet'
type FlyToStationProps = {
  latitude: number | null | undefined
  longitude: number | null | undefined
  requestKey: number
}

function FlyToStation({ latitude, longitude, requestKey }: FlyToStationProps) {
  const map = useMap()
  const lastHandledRequestKeyRef = useRef<number | null>(null)

  useEffect(() => {
    if (requestKey === 0 || lastHandledRequestKeyRef.current === requestKey) {
      return
    }

    lastHandledRequestKeyRef.current = requestKey

    if (latitude === null || latitude === undefined || longitude === null || longitude === undefined) {
      return
    }

    map.flyTo([latitude, longitude], 9, {
      duration: 1.4,
    })
  }, [latitude, longitude, map, requestKey])

  return null
}

export default FlyToStation
