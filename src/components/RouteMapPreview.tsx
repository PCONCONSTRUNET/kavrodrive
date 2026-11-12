import React, { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Polyline, Marker, useMap } from 'react-leaflet';
import L from 'leaflet';
import { ExternalLink, Route } from 'lucide-react';
import { LocationPoint } from '../types';
import { getGoogleMapsRouteUrl } from '../utils/geo';
import 'leaflet/dist/leaflet.css';

interface RouteMapPreviewProps {
  origin: LocationPoint;
  destination: LocationPoint;
  distanceKm: number;
  durationMin: number;
}

const createPickupIcon = () =>
  L.divIcon({
    className: 'custom-pickup-marker',
    html: `
      <div style="display: flex; flex-direction: column; align-items: center;">
        <div style="background: #121A21; color: #76D800; font-size: 10px; font-weight: 800; padding: 2px 8px; border-radius: 10px; border: 1px solid #76D800; white-space: nowrap; box-shadow: 0 2px 6px rgba(0,0,0,0.25); margin-bottom: 2px;">
          EMBARQUE
        </div>
        <div style="width: 20px; height: 20px; border-radius: 50%; background: #76D800; border: 3px solid #FFFFFF; box-shadow: 0 3px 10px rgba(118, 216, 0, 0.5); display: flex; align-items: center; justify-content: center;">
          <div style="width: 6px; height: 6px; border-radius: 50%; background: #121A21;"></div>
        </div>
      </div>
    `,
    iconSize: [70, 42],
    iconAnchor: [35, 38],
  });

const createDestinationIcon = () =>
  L.divIcon({
    className: 'custom-destination-marker',
    html: `
      <div style="display: flex; flex-direction: column; align-items: center;">
        <div style="background: #121A21; color: #FFFFFF; font-size: 10px; font-weight: 800; padding: 2px 8px; border-radius: 10px; border: 1px solid #475569; white-space: nowrap; box-shadow: 0 2px 6px rgba(0,0,0,0.25); margin-bottom: 2px;">
          DESTINO
        </div>
        <div style="width: 20px; height: 20px; border-radius: 50%; background: #121A21; border: 3px solid #FFFFFF; box-shadow: 0 3px 10px rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center;">
          <div style="width: 6px; height: 6px; border-radius: 50%; background: #76D800;"></div>
        </div>
      </div>
    `,
    iconSize: [70, 42],
    iconAnchor: [35, 38],
  });

const FitRouteBounds: React.FC<{ origin: LocationPoint; destination: LocationPoint }> = ({ origin, destination }) => {
  const map = useMap();
  useEffect(() => {
    const t = setTimeout(() => {
      map.invalidateSize();
      if (origin.lat && origin.lng && destination.lat && destination.lng) {
        map.fitBounds(
          [
            [origin.lat, origin.lng],
            [destination.lat, destination.lng],
          ],
          { padding: [36, 36], maxZoom: 16 }
        );
      }
    }, 120);
    return () => clearTimeout(t);
  }, [map, origin.lat, origin.lng, destination.lat, destination.lng]);
  return null;
};

export const RouteMapPreview: React.FC<RouteMapPreviewProps> = ({
  origin,
  destination,
  distanceKm,
  durationMin,
}) => {
  const [routeCoords, setRouteCoords] = useState<[number, number][]>([]);
  const googleMapsUrl = getGoogleMapsRouteUrl(origin, destination);

  useEffect(() => {
    let cancelled = false;
    async function fetchRoute() {
      if (!origin.lat || !origin.lng || !destination.lat || !destination.lng) return;
      try {
        const res = await fetch(
          `https://router.project-osrm.org/route/v1/driving/${origin.lng},${origin.lat};${destination.lng},${destination.lat}?overview=full&geometries=geojson`
        );
        if (res.ok) {
          const data = await res.json();
          const coords = data.routes?.[0]?.geometry?.coordinates;
          if (coords && coords.length > 0 && !cancelled) {
            setRouteCoords(coords.map((c: [number, number]) => [c[1], c[0]]));
            return;
          }
        }
      } catch {}
      if (!cancelled) {
        setRouteCoords([
          [origin.lat, origin.lng],
          [destination.lat, destination.lng],
        ]);
      }
    }
    fetchRoute();
    return () => {
      cancelled = true;
    };
  }, [origin.lat, origin.lng, destination.lat, destination.lng]);

  const centerLat = (origin.lat + destination.lat) / 2;
  const centerLng = (origin.lng + destination.lng) / 2;

  return (
    <div style={{
      borderRadius: 18,
      overflow: 'hidden',
      border: '1.5px solid #E2E8F0',
      backgroundColor: '#1E293B',
      position: 'relative',
      boxShadow: '0 4px 20px rgba(0,0,0,0.08)'
    }}>
      {/* Top Banner de Informações da Rota */}
      <div style={{
        backgroundColor: '#121A21',
        padding: '12px 16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderBottom: '1px solid #2C3E50',
        color: '#ffffff'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            background: 'rgba(118, 216, 0, 0.2)',
            padding: 6,
            borderRadius: 8,
            color: '#76D800'
          }}>
            <Route size={18} />
          </div>
          <div>
            <div style={{ fontSize: '0.85rem', fontWeight: 700 }}>Trajeto Calculado</div>
            <div style={{ fontSize: '0.72rem', color: '#94A3B8' }}>Mapa detalhado de ruas e endereços</div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 14, textAlign: 'right' }}>
          <div>
            <div style={{ fontSize: '0.95rem', fontWeight: 800, color: '#76D800' }}>
              {distanceKm.toFixed(1)} km
            </div>
            <div style={{ fontSize: '0.68rem', color: '#94A3B8' }}>Distância</div>
          </div>
          <div>
            <div style={{ fontSize: '0.95rem', fontWeight: 800, color: '#FFFFFF' }}>
              ~{durationMin} min
            </div>
            <div style={{ fontSize: '0.68rem', color: '#94A3B8' }}>Duração estimada</div>
          </div>
        </div>
      </div>

      {/* Mapa Detalhado Estilo GPS ao Vivo do Motorista (Google Maps Tiles + Rota Viária) */}
      <div style={{ height: 220, position: 'relative', background: '#e5e7eb' }}>
        <MapContainer
          center={[centerLat, centerLng]}
          zoom={14}
          style={{ width: '100%', height: '100%', zIndex: 1 }}
          zoomControl={false}
          attributionControl={false}
        >
          <TileLayer
            url="https://{s}.google.com/vt/lyrs=m&hl=pt-BR&x={x}&y={y}&z={z}"
            subdomains={['mt0', 'mt1', 'mt2', 'mt3']}
            maxZoom={20}
            attribution="&copy; Google Maps"
          />
          <FitRouteBounds origin={origin} destination={destination} />
          {routeCoords.length > 0 && (
            <>
              <Polyline positions={routeCoords} pathOptions={{ color: '#0F172A', weight: 7, opacity: 0.6 }} />
              <Polyline positions={routeCoords} pathOptions={{ color: '#2563EB', weight: 4.5, opacity: 0.95 }} />
            </>
          )}
          <Marker position={[origin.lat, origin.lng]} icon={createPickupIcon()} />
          <Marker position={[destination.lat, destination.lng]} icon={createDestinationIcon()} />
        </MapContainer>

        {/* Overlay com Botão de Ação Direta para o Google Maps */}
        <a
          href={googleMapsUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            position: 'absolute',
            bottom: 10,
            right: 10,
            zIndex: 500,
            backgroundColor: 'rgba(18, 26, 33, 0.92)',
            backdropFilter: 'blur(4px)',
            color: '#ffffff',
            padding: '7px 12px',
            borderRadius: 20,
            fontSize: '0.75rem',
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            textDecoration: 'none',
            boxShadow: '0 2px 10px rgba(0,0,0,0.3)',
            border: '1px solid rgba(255,255,255,0.15)'
          }}
        >
          <span>Abrir no Google Maps</span>
          <ExternalLink size={13} color="#76D800" />
        </a>
      </div>

      {/* Detalhe dos Pontos: Origem e Destino */}
      <div style={{ padding: '12px 16px', backgroundColor: '#ffffff' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 8 }}>
          <div style={{
            width: 18,
            height: 18,
            borderRadius: '50%',
            backgroundColor: '#76D800',
            border: '3px solid #E2F9B8',
            marginTop: 2,
            flexShrink: 0
          }} />
          <div style={{ fontSize: '0.82rem', color: '#1E293B', lineHeight: 1.3 }}>
            <span style={{ fontWeight: 700, color: '#4D9400' }}>Embarque: </span>
            {origin.address}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          <div style={{
            width: 18,
            height: 18,
            borderRadius: '50%',
            backgroundColor: '#121A21',
            border: '3px solid #94A3B8',
            marginTop: 2,
            flexShrink: 0
          }} />
          <div style={{ fontSize: '0.82rem', color: '#1E293B', lineHeight: 1.3 }}>
            <span style={{ fontWeight: 700, color: '#121A21' }}>Destino: </span>
            {destination.address}
          </div>
        </div>
      </div>
    </div>
  );
};
