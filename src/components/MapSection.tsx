import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet.markercluster'
import 'leaflet/dist/leaflet.css'
import 'leaflet.markercluster/dist/MarkerCluster.css'
import 'leaflet.markercluster/dist/MarkerCluster.Default.css'
import { CircleMarker, MapContainer, TileLayer, useMap } from 'react-leaflet'
import FlyToStation from './FlyToStation'
import type { Station } from '../types/station'

const DEFAULT_CENTER: [number, number] = [24, 11]

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function MarkerClusterLayer({
  stations,
  onStationClick,
}: {
  stations: Station[]
  onStationClick?: (station: Station) => void
}) {
  const map = useMap()
  const clusterRef = useRef<L.MarkerClusterGroup | null>(null)
  const stationsRef = useRef<Station[]>([])
  const callbackRef = useRef(onStationClick)
  useEffect(() => { callbackRef.current = onStationClick })

  useEffect(() => {
    if (!clusterRef.current) {
      const clusterGroup = L.markerClusterGroup({
        chunkedLoading: true,
        maxClusterRadius: 50,
        spiderfyOnMaxZoom: true,
        showCoverageOnHover: false,
        iconCreateFunction: (cluster) => {
          const count = cluster.getChildCount()
          let sizeClass = 'cluster-sm'
          let size = 36
          if (count > 100) { sizeClass = 'cluster-lg'; size = 52 }
          else if (count > 20) { sizeClass = 'cluster-md'; size = 44 }
          return L.divIcon({
            html: `<div class="cluster-icon ${sizeClass}">${count}</div>`,
            className: '',
            iconSize: L.point(size, size),
          })
        },
      })
      map.addLayer(clusterGroup)
      clusterRef.current = clusterGroup
    }

    const clusterGroup = clusterRef.current
    const prevStations = stationsRef.current
    const prevIds = new Set(prevStations.map((s) => s.stationuuid))
    const nextIds = new Set(stations.map((s) => s.stationuuid))

    for (const station of prevStations) {
      if (!nextIds.has(station.stationuuid)) {
        clusterGroup.eachLayer((layer) => {
          const marker = layer as L.Marker
          if (marker.getLatLng) {
            const latLng = marker.getLatLng()
            if (latLng.lat === station.geo_lat && latLng.lng === station.geo_long) {
              clusterGroup.removeLayer(marker)
            }
          }
        })
      }
    }

    for (const station of stations) {
      if (prevIds.has(station.stationuuid)) continue
      if (station.geo_lat === null || station.geo_long === null) continue
      const icon = L.divIcon({
        html: '<div class="station-dot"></div>',
        className: '',
        iconSize: L.point(10, 10),
      })
      const marker = L.marker([station.geo_lat, station.geo_long], { icon })
      const safeName = escapeHtml(station.name)
      const safeCountry = escapeHtml(station.country)
      const safeState = escapeHtml(station.state)
      const popupContent = `<strong>${safeName}</strong><div>${safeCountry}${safeState ? `, ${safeState}` : ''}</div>`
      marker.bindPopup(popupContent)
      marker.bindTooltip(popupContent, { direction: 'top', offset: L.point(0, -8) })
      marker.on('click', () => callbackRef.current?.(station))
      clusterGroup.addLayer(marker)
    }

    stationsRef.current = stations

    return () => {
      if (clusterRef.current) {
        map.removeLayer(clusterRef.current)
        clusterRef.current = null
      }
    }
  }, [map, stations])

  return null
}

type MapSectionProps = {
  mapStations: Station[]
  selectedStation: Station | null
  selectedFlyKey: number
  onStationClick: (station: Station) => void
}

export default function MapSection({ mapStations, selectedStation, selectedFlyKey, onStationClick }: MapSectionProps) {
  return (
    <MapContainer
      center={DEFAULT_CENTER}
      zoom={2}
      minZoom={2}
      maxZoom={18}
      scrollWheelZoom
      className="map"
      worldCopyJump
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <MarkerClusterLayer stations={mapStations} onStationClick={onStationClick} />
      {selectedStation?.geo_lat != null && selectedStation?.geo_long != null && (
        <CircleMarker
          center={[selectedStation.geo_lat, selectedStation.geo_long]}
          radius={10}
          pathOptions={{ color: '#ffffff', fillColor: '#e74c3c', fillOpacity: 1, weight: 2 }}
        />
      )}
      <FlyToStation
        latitude={selectedStation?.geo_lat ?? null}
        longitude={selectedStation?.geo_long ?? null}
        requestKey={selectedFlyKey}
      />
    </MapContainer>
  )
}
