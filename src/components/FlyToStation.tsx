import { useEffect } from 'react'
import { useMap } from 'react-leaflet'
import type { Station } from '../types/station'

type FlyToStationProps = {
  station: Station | null
}

function FlyToStation({ station }: FlyToStationProps) {
  const map = useMap()

  useEffect(() => {
    if (!station || station.geo_lat === null || station.geo_long === null) {
      return
    }

    map.flyTo([station.geo_lat, station.geo_long], 6, {
      duration: 1.4,
    })
  }, [map, station])

  return null
}

export default FlyToStation
