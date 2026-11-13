import React, { useEffect, useMemo, useState } from 'react';
import { MapContainer, TileLayer, Polyline, Marker, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { LocationPoint } from '../types';

export interface OnlineDriverMapDot {
  id: string;
  lat: number;
  lng: number;
  heading?: number;
}

interface PassengerLiveMapProps {
  origin?: LocationPoint | null;
  destination?: LocationPoint | null;
  driverPos?: { lat: number; lng: number; heading?: number } | null;
  nearbyDrivers?: OnlineDriverMapDot[];
  height?: string;
}

const DEFAULT_CENTER: [number, number] = [-28.39123, -49.39354];

const createOriginDotIcon = () =>
  L.divIcon({
    className: 'kavro-pax-origin',
    html: `
      <div style="
        width: 18px;
        height: 18px;
        border-radius: 50%;
        background: #111111;
        border: 4px solid #FFFFFF;
        box-shadow: 0 2px 10px rgba(0,0,0,0.45);
      "></div>
    `,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  });

const createDestinationSquareIcon = () =>
  L.divIcon({
    className: 'kavro-pax-dest',
    html: `
      <div style="
        width: 18px;
        height: 18px;
        border-radius: 3px;
        background: #111111;
        border: 4px solid #FFFFFF;
        box-shadow: 0 2px 10px rgba(0,0,0,0.45);
      "></div>
    `,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  });

const createNearbyCarIcon = (heading = 0, isAssignedDriver = false) =>
  L.divIcon({
    className: 'kavro-nearby-car',
    html: `
      <div style="
        width: ${isAssignedDriver ? 36 : 26}px;
        height: ${isAssignedDriver ? 36 : 26}px;
        border-radius: 50%;
        background: ${isAssignedDriver ? '#111111' : 'rgba(255,255,255,0.94)'};
        border: 2px solid ${isAssignedDriver ? '#76D800' : '#111111'};
        box-shadow: 0 3px 10px rgba(0,0,0,0.28);
        display: flex;
        align-items: center;
        justify-content: center;
        transform: rotate(${Math.round(heading)}deg);
      ">
        <svg width="${isAssignedDriver ? 18 : 13}" height="${isAssignedDriver ? 18 : 13}" viewBox="0 0 24 24" fill="${isAssignedDriver ? '#76D800' : '#111111'}">
          <path d="M12 2L4.5 20.29l.71.71L12 18l6.79 3 .71-.71z" />
        </svg>
      </div>
    `,
    iconSize: [isAssignedDriver ? 36 : 26, isAssignedDriver ? 36 : 26],
    iconAnchor: [isAssignedDriver ? 18 : 13, isAssignedDriver ? 18 : 13],
  });

const PassengerMapCamera: React.FC<{
  center: [number, number];
  bounds: L.LatLngBoundsExpression | null;
}> = ({ center, bounds }) => {
  const map = useMap();

  useEffect(() => {
    const t1 = setTimeout(() => map.invalidateSize(), 120);
    const t2 = setTimeout(() => map.invalidateSize(), 420);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [map]);

  useEffect(() => {
    if (bounds) {
      map.fitBounds(bounds, {
        paddingTopLeft: [44, 68],
        paddingBottomRight: [44, 44],
        maxZoom: 16,
      });
    } else {
      map.setView(center, 15, { animate: true });
    }
  }, [bounds, center[0], center[1], map]);

  return null;
};

export const PassengerLiveMap: React.FC<PassengerLiveMapProps> = ({
  origin,
  destination,
  driverPos,
  nearbyDrivers = [],
  height = '100%',
}) => {
  const [routeCoords, setRouteCoords] = useState<[number, number][]>([]);

  const center: [number, number] = useMemo(() => {
    if (driverPos?.lat && driverPos?.lng) return [driverPos.lat, driverPos.lng];
    if (origin?.lat && origin?.lng) return [origin.lat, origin.lng];
    if (destination?.lat && destination?.lng) return [destination.lat, destination.lng];
    return DEFAULT_CENTER;
  }, [driverPos?.lat, driverPos?.lng, origin?.lat, origin?.lng, destination?.lat, destination?.lng]);

  useEffect(() => {
    if (!origin?.lat || !origin?.lng || !destination?.lat || !destination?.lng) {
      setRouteCoords([]);
      return;
    }

    let cancelled = false;
    const url = `https://router.project-osrm.org/route/v1/driving/${origin.lng},${origin.lat};${destination.lng},${destination.lat}?overview=full&geometries=geojson`;

    fetch(url)
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        const coords = data?.routes?.[0]?.geometry?.coordinates;
        if (Array.isArray(coords) && coords.length >= 2) {
          setRouteCoords(coords.map((c: [number, number]) => [c[1], c[0]]));
        } else {
          setRouteCoords([
            [origin.lat, origin.lng],
            [destination.lat, destination.lng],
          ]);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setRouteCoords([
            [origin.lat, origin.lng],
            [destination.lat, destination.lng],
          ]);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [origin?.lat, origin?.lng, destination?.lat, destination?.lng]);

  const bounds: L.LatLngBoundsExpression | null = useMemo(() => {
    const pts: [number, number][] = [...routeCoords];
    if (pts.length === 0) {
      if (origin?.lat && origin?.lng) pts.push([origin.lat, origin.lng]);
      if (destination?.lat && destination?.lng) pts.push([destination.lat, destination.lng]);
      if (driverPos?.lat && driverPos?.lng) pts.push([driverPos.lat, driverPos.lng]);
    }
    if (pts.length >= 2) {
      return L.latLngBounds(pts);
    }
    return null;
  }, [routeCoords, origin?.lat, origin?.lng, destination?.lat, destination?.lng, driverPos?.lat, driverPos?.lng]);

  const originIcon = useMemo(() => createOriginDotIcon(), []);
  const destIcon = useMemo(() => createDestinationSquareIcon(), []);
  const assignedCarIcon = useMemo(
    () => createNearbyCarIcon(driverPos?.heading || 0, true),
    [driverPos?.heading]
  );

  return (
    <div style={{ width: '100%', height, position: 'relative', backgroundColor: '#E8EDF3' }}>
      <MapContainer
        center={center}
        zoom={15}
        style={{ width: '100%', height: '100%', zIndex: 1 }}
        zoomControl={false}
        attributionControl={false}
      >
        <TileLayer
          url="https://{s}.google.com/vt/lyrs=m&hl=pt-BR&x={x}&y={y}&z={z}"
          subdomains={['mt0', 'mt1', 'mt2', 'mt3']}
          maxZoom={20}
        />

        <PassengerMapCamera center={center} bounds={bounds} />

        {/* Linha de rota Uber Black */}
        {routeCoords.length >= 2 && (
          <Polyline
            positions={routeCoords}
            pathOptions={{ color: '#111111', weight: 5, opacity: 0.92, lineCap: 'round', lineJoin: 'round' }}
          />
        )}

        {/* Origem & Destino */}
        {origin?.lat && origin?.lng && (
          <Marker position={[origin.lat, origin.lng]} icon={originIcon} />
        )}
        {destination?.lat && destination?.lng && (
          <Marker position={[destination.lat, destination.lng]} icon={destIcon} />
        )}

        {/* Motoristas online próximos */}
        {!driverPos && nearbyDrivers.map((drv) => (
          <Marker
            key={drv.id}
            position={[drv.lat, drv.lng]}
            icon={createNearbyCarIcon(drv.heading || 35, false)}
          />
        ))}

        {/* Veículo designado quando em corrida ativa */}
        {driverPos?.lat && driverPos?.lng && (
          <Marker position={[driverPos.lat, driverPos.lng]} icon={assignedCarIcon} />
        )}
      </MapContainer>
    </div>
  );
};

