import React, { useEffect, useMemo, useRef, useState } from 'react';
import { MapContainer, TileLayer, Polyline, Marker, Circle, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Ride } from '../types';

export interface RouteStepSummary {
  streetName: string;
  nextStreetName: string;
  distanceMeters: number;
  maneuverType?: string;
  maneuverModifier?: string;
}

interface DriverHomeMapProps {
  driverLocation?: { lat: number; lng: number; heading?: number } | null;
  isOnline: boolean;
  activeRide?: Ride | null;
  recenterSignal?: number;
  onRouteInfoUpdate?: (info: {
    distanceKm: number;
    durationMin: number;
    step: RouteStepSummary;
  }) => void;
}

const DEFAULT_CENTER: [number, number] = [-28.39123, -49.39354];

const createUberArrowPuckIcon = (heading = 0) =>
  L.divIcon({
    className: 'kavro-uber-arrow-puck',
    html: `
      <div style="
        width: 44px;
        height: 44px;
        border-radius: 50%;
        background: rgba(255, 255, 255, 0.96);
        border: 3px solid #111111;
        box-shadow: 0 4px 14px rgba(0,0,0,0.28);
        display: flex;
        align-items: center;
        justify-content: center;
        transform: rotate(${Math.round(heading)}deg);
        transition: transform 0.25s ease;
      ">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="#111111">
          <path d="M12 2L4.5 20.29l.71.71L12 18l6.79 3 .71-.71z" />
        </svg>
      </div>
    `,
    iconSize: [44, 44],
    iconAnchor: [22, 22],
  });

const createUberGreenTargetPin = () =>
  L.divIcon({
    className: 'kavro-uber-green-pin',
    html: `
      <div style="display:flex;flex-direction:column;align-items:center;">
        <div style="
          width: 34px;
          height: 34px;
          border-radius: 50%;
          background: #15803D;
          border: 3px solid #FFFFFF;
          box-shadow: 0 4px 12px rgba(21,128,61,0.45);
          display: flex;
          align-items: center;
          justify-content: center;
        ">
          <div style="width: 10px; height: 10px; background: #DCFCE7; border-radius: 2px;"></div>
        </div>
        <div style="width: 3px; height: 11px; background: #15803D; border-radius: 2px; margin-top: -1px;"></div>
        <div style="width: 8px; height: 4px; border-radius: 50%; background: rgba(0,0,0,0.25);"></div>
      </div>
    `,
    iconSize: [34, 48],
    iconAnchor: [17, 46],
  });

const createSurgeDemandIcon = (amountText: string) =>
  L.divIcon({
    className: 'kavro-surge-pill',
    html: `
      <div style="
        background: #B91C1C;
        color: #FFFFFF;
        padding: 4px 11px;
        border-radius: 999px;
        font-size: 12px;
        font-weight: 800;
        white-space: nowrap;
        box-shadow: 0 4px 12px rgba(185,28,28,0.38);
        border: 1.5px solid rgba(255,255,255,0.3);
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      ">${amountText}</div>
    `,
    iconSize: [68, 28],
    iconAnchor: [34, 14],
  });

const MapViewportController: React.FC<{
  center: [number, number];
  bounds: L.LatLngBoundsExpression | null;
  recenterSignal?: number;
}> = ({ center, bounds, recenterSignal }) => {
  const map = useMap();
  const prevSignalRef = useRef<number | undefined>(recenterSignal);

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
        paddingTopLeft: [36, 130],
        paddingBottomRight: [36, 145],
        maxZoom: 16,
      });
    } else {
      map.setView(center, 15, { animate: true });
    }
  }, [bounds, center[0], center[1], map]);

  useEffect(() => {
    if (recenterSignal !== undefined && recenterSignal !== prevSignalRef.current) {
      prevSignalRef.current = recenterSignal;
      if (bounds) {
        map.fitBounds(bounds, {
          paddingTopLeft: [36, 130],
          paddingBottomRight: [36, 145],
          maxZoom: 16,
        });
      } else {
        map.setView(center, 16, { animate: true });
      }
    }
  }, [recenterSignal, bounds, center, map]);

  return null;
};

export const DriverHomeMap: React.FC<DriverHomeMapProps> = ({
  driverLocation,
  isOnline,
  activeRide,
  recenterSignal,
  onRouteInfoUpdate,
}) => {
  const [liveGps, setLiveGps] = useState<[number, number] | null>(
    driverLocation?.lat && driverLocation?.lng ? [driverLocation.lat, driverLocation.lng] : null
  );
  const [liveHeading, setLiveHeading] = useState<number>(driverLocation?.heading || 0);
  const [routeCoords, setRouteCoords] = useState<[number, number][]>([]);

  useEffect(() => {
    if (driverLocation?.lat && driverLocation?.lng) {
      setLiveGps([driverLocation.lat, driverLocation.lng]);
      if (typeof driverLocation.heading === 'number') {
        setLiveHeading(driverLocation.heading);
      }
    }
  }, [driverLocation?.lat, driverLocation?.lng, driverLocation?.heading]);

  // Watch local device GPS when on map
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLiveGps([pos.coords.latitude, pos.coords.longitude]);
        if (typeof pos.coords.heading === 'number' && !Number.isNaN(pos.coords.heading)) {
          setLiveHeading(pos.coords.heading);
        }
      },
      () => {},
      { enableHighAccuracy: true, timeout: 6000, maximumAge: 15000 }
    );
  }, []);

  const currentCenter: [number, number] = useMemo(() => {
    if (activeRide?.driverLocation?.lat && activeRide?.driverLocation?.lng) {
      return [activeRide.driverLocation.lat, activeRide.driverLocation.lng];
    }
    if (liveGps) return liveGps;
    if (activeRide?.origin?.lat && activeRide?.origin?.lng) {
      return [activeRide.origin.lat, activeRide.origin.lng];
    }
    return DEFAULT_CENTER;
  }, [activeRide?.driverLocation?.lat, activeRide?.driverLocation?.lng, activeRide?.origin?.lat, activeRide?.origin?.lng, liveGps]);

  const targetPoint = useMemo(() => {
    if (!activeRide) return null;
    const isTripInProgress = activeRide.status === 'em_andamento';
    return isTripInProgress ? activeRide.destination : activeRide.origin;
  }, [activeRide]);

  // Fetch OSRM route when activeRide exists
  useEffect(() => {
    if (!activeRide || !targetPoint?.lat || !targetPoint?.lng) {
      setRouteCoords([]);
      return;
    }

    const startLat = activeRide.driverLocation?.lat || liveGps?.[0] || activeRide.origin.lat;
    const startLng = activeRide.driverLocation?.lng || liveGps?.[1] || activeRide.origin.lng;
    const endLat = targetPoint.lat;
    const endLng = targetPoint.lng;

    if (!startLat || !startLng) return;

    let cancelled = false;
    const url = `https://router.project-osrm.org/route/v1/driving/${startLng},${startLat};${endLng},${endLat}?overview=full&geometries=geojson&steps=true`;

    fetch(url)
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        const route = data?.routes?.[0];
        if (!route?.geometry?.coordinates) {
          setRouteCoords([
            [startLat, startLng],
            [endLat, endLng],
          ]);
          return;
        }
        const latLngs: [number, number][] = route.geometry.coordinates.map(
          (c: [number, number]) => [c[1], c[0]]
        );
        setRouteCoords(latLngs);

        if (onRouteInfoUpdate) {
          const distKm = Math.max(0.1, Number((route.distance / 1000).toFixed(1)));
          const durMin = Math.max(1, Math.round(route.duration / 60));
          const steps = route.legs?.[0]?.steps || [];
          const firstStep = steps[0];
          const secondStep = steps[1] || steps[0];
          const rawStreet = firstStep?.name || activeRide.origin.address.split(',')[0] || 'Via local';
          const nextStreet = secondStep?.name || targetPoint.address.split(',')[0] || 'Destino';
          const stepDist = Math.max(20, Math.round(firstStep?.distance || 50));

          onRouteInfoUpdate({
            distanceKm: distKm,
            durationMin: durMin,
            step: {
              streetName: rawStreet,
              nextStreetName: nextStreet,
              distanceMeters: stepDist,
              maneuverType: secondStep?.maneuver?.type,
              maneuverModifier: secondStep?.maneuver?.modifier,
            },
          });
        }
      })
      .catch(() => {
        if (!cancelled) {
          setRouteCoords([
            [startLat, startLng],
            [endLat, endLng],
          ]);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    activeRide?.id,
    activeRide?.status,
    targetPoint?.lat,
    targetPoint?.lng,
    currentCenter[0],
    currentCenter[1],
  ]);

  const activeBounds: L.LatLngBoundsExpression | null = useMemo(() => {
    if (!activeRide || !targetPoint?.lat || !targetPoint?.lng) return null;
    if (routeCoords.length >= 2) {
      return L.latLngBounds(routeCoords);
    }
    return L.latLngBounds([currentCenter, [targetPoint.lat, targetPoint.lng]]);
  }, [activeRide, targetPoint?.lat, targetPoint?.lng, routeCoords, currentCenter]);

  const driverIcon = useMemo(() => createUberArrowPuckIcon(liveHeading), [liveHeading]);
  const greenPinIcon = useMemo(() => createUberGreenTargetPin(), []);
  const surgeIcon = useMemo(() => createSurgeDemandIcon('+R$ 4'), []);

  // Posição sutil de demanda dinâmica na região (para visual Radar estilo Uber)
  const surgeCoords: [number, number] = useMemo(
    () => [currentCenter[0] + 0.0085, currentCenter[1] - 0.011],
    [currentCenter[0], currentCenter[1]]
  );

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1, backgroundColor: '#E8EDF3' }}>
      <MapContainer
        center={currentCenter}
        zoom={15}
        style={{ width: '100%', height: '100%' }}
        zoomControl={false}
        attributionControl={false}
      >
        <TileLayer
          url="https://{s}.google.com/vt/lyrs=m&hl=pt-BR&x={x}&y={y}&z={z}"
          subdomains={['mt0', 'mt1', 'mt2', 'mt3']}
          maxZoom={20}
        />

        <MapViewportController
          center={currentCenter}
          bounds={activeBounds}
          recenterSignal={recenterSignal}
        />

        {/* Área sutil de demanda dinâmica quando sem corrida ativa (idêntico ao print Uber Driver) */}
        {!activeRide && (
          <>
            <Circle
              center={surgeCoords}
              radius={850}
              pathOptions={{
                color: 'transparent',
                fillColor: isOnline ? '#DC2626' : '#EF4444',
                fillOpacity: isOnline ? 0.22 : 0.14,
              }}
            />
            <Marker position={surgeCoords} icon={surgeIcon} interactive={false} />
          </>
        )}

        {/* Rota preta crisp estilo Uber Driver Turn-by-Turn */}
        {activeRide && routeCoords.length >= 2 && (
          <>
            <Polyline
              positions={routeCoords}
              pathOptions={{ color: '#000000', weight: 7, opacity: 0.92, lineCap: 'round', lineJoin: 'round' }}
            />
            {/* Pequeno segmento de destaque de tráfego estilo Google/Uber */}
            {routeCoords.length > 6 && (
              <Polyline
                positions={routeCoords.slice(Math.floor(routeCoords.length * 0.25), Math.floor(routeCoords.length * 0.42))}
                pathOptions={{ color: '#D97706', weight: 4.5, opacity: 0.95, lineCap: 'round' }}
              />
            )}
          </>
        )}

        {/* Pin verde do ponto de encontro / destino */}
        {activeRide && targetPoint?.lat && targetPoint?.lng && (
          <Marker position={[targetPoint.lat, targetPoint.lng]} icon={greenPinIcon} />
        )}

        {/* Marcador circular com seta preta do motorista */}
        <Marker position={currentCenter} icon={driverIcon} />
      </MapContainer>
    </div>
  );
};

