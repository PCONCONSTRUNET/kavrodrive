import React, { useState, useEffect, useRef } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, Circle, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import { 
  AlertTriangle, Phone, Navigation, ShieldAlert, HeartPulse, Flame, 
  MapPin, WifiOff, Copy, Check, Share2, Locate, 
  Layers, ExternalLink, ArrowLeft, RefreshCw, Route, X, Loader2
} from 'lucide-react';
import { SystemConfig } from '../types';
import { WhatsAppIcon } from '../components/WhatsAppIcon';
import { formatPhone } from '../utils/format';
import { reverseGeocode, calculateHaversineDistance } from '../utils/geo';
import 'leaflet/dist/leaflet.css';

interface SosData {
  id: string;
  name: string;
  phone: string;
  lat: number;
  lng: number;
  accuracy: number;
  address: string;
  rideId?: string | null;
  updatedAt: string;
  secondsAgo: number;
  isOnline: boolean;
  active?: boolean;
}

interface SosLiveTrackingScreenProps {
  config: SystemConfig;
}

const isGenericFallbackAddress = (addr?: string) => {
  if (!addr) return true;
  const lower = addr.toLowerCase();
  return (
    lower.includes('base operacional') ||
    lower.includes('lauro müller e região') ||
    lower.includes('lauro muller e regiao') ||
    lower.startsWith('gps:') ||
    lower.startsWith('coordenadas:')
  );
};

// Marcador SOS pulsante da vítima
const createEmergencyMarker = (isOnline: boolean) => {
  const pulseColor = isOnline ? 'rgba(220, 38, 38, 0.45)' : 'rgba(100, 116, 139, 0.35)';
  const pinBg = isOnline ? '#DC2626' : '#64748B';
  const labelText = isOnline ? 'VÍTIMA • AO VIVO' : 'ÚLTIMO PONTO';
  const labelBg = isOnline ? '#DC2626' : '#475569';

  return L.divIcon({
    className: 'custom-sos-marker',
    html: `
      <div style="position: relative; width: 80px; height: 80px; display: flex; flex-direction: column; align-items: center; justify-content: center; pointer-events: none;">
        ${isOnline ? `
          <div style="position: absolute; width: 64px; height: 64px; border-radius: 50%; background: ${pulseColor}; border: 2px solid #EF4444; animation: sosPulse 1.6s ease-out infinite;"></div>
        ` : ''}
        <div style="position: relative; z-index: 3; display: flex; flex-direction: column; align-items: center;">
          <div style="background: ${labelBg}; color: #FFFFFF; font-size: 8.5px; font-weight: 900; letter-spacing: 0.04em; padding: 2px 6px; border-radius: 8px; border: 1.5px solid #FFFFFF; box-shadow: 0 2px 6px rgba(0,0,0,0.35); margin-bottom: 2px; white-space: nowrap;">
            🚨 ${labelText}
          </div>
          <div style="width: 32px; height: 32px; border-radius: 50%; background: ${pinBg}; border: 2.5px solid #FFFFFF; box-shadow: 0 4px 12px rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center; color: #FFFFFF;">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 22s-8-4.5-8-11.8A8 8 0 0 1 12 2a8 8 0 0 1 8 8.2c0 7.3-8 11.8-8 11.8z"/>
              <circle cx="12" cy="10" r="3"/>
            </svg>
          </div>
        </div>
      </div>
    `,
    iconSize: [80, 80],
    iconAnchor: [40, 50]
  });
};

// Marcador em tempo real do Socorrista ("VOCÊ")
const createRescuerMarker = () => {
  return L.divIcon({
    className: 'custom-rescuer-marker',
    html: `
      <div style="position: relative; width: 80px; height: 80px; display: flex; flex-direction: column; align-items: center; justify-content: center; pointer-events: none;">
        <div style="position: absolute; width: 56px; height: 56px; border-radius: 50%; background: rgba(37, 99, 235, 0.35); border: 2px solid #38BDF8; animation: sosPulse 1.8s ease-out infinite;"></div>
        <div style="position: relative; z-index: 3; display: flex; flex-direction: column; align-items: center;">
          <div style="background: #2563EB; color: #FFFFFF; font-size: 8.5px; font-weight: 900; letter-spacing: 0.04em; padding: 2px 6px; border-radius: 8px; border: 1.5px solid #FFFFFF; box-shadow: 0 2px 6px rgba(0,0,0,0.35); margin-bottom: 2px; white-space: nowrap;">
            🚑 VOCÊ (SOCORRO)
          </div>
          <div style="width: 30px; height: 30px; border-radius: 50%; background: #2563EB; border: 2.5px solid #FFFFFF; box-shadow: 0 4px 12px rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center; color: #FFFFFF;">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round">
              <polygon points="3 11 22 2 13 21 11 13 3 11"/>
            </svg>
          </div>
        </div>
      </div>
    `,
    iconSize: [80, 80],
    iconAnchor: [40, 48]
  });
};

// Controlador de câmera do mapa (centraliza na vítima ou enquadra rota completa entre socorrista e vítima)
const MapController: React.FC<{
  victimPos: [number, number];
  rescuerPos: [number, number] | null;
  zoomTrigger: number;
  fitBoundsTrigger: number;
}> = ({ victimPos, rescuerPos, zoomTrigger, fitBoundsTrigger }) => {
  const map = useMap();

  useEffect(() => {
    if (zoomTrigger > 0 && victimPos && !isNaN(victimPos[0]) && !isNaN(victimPos[1])) {
      map.flyTo(victimPos, Math.max(map.getZoom(), 16), {
        animate: true,
        duration: 0.7
      });
    }
  }, [zoomTrigger, map]);

  useEffect(() => {
    if (fitBoundsTrigger > 0 && rescuerPos && victimPos) {
      const bounds = L.latLngBounds([rescuerPos, victimPos]);
      map.fitBounds(bounds, { padding: [55, 55], maxZoom: 17, animate: true });
    }
  }, [fitBoundsTrigger, map]);

  return null;
};

export const SosLiveTrackingScreen: React.FC<SosLiveTrackingScreenProps> = () => {
  const { sosId: routeSosId } = useParams<{ sosId: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  // Suporte a ?c=lat,lng curto ou ?lat=...&lng=...
  const sosId = routeSosId || searchParams.get('id') || 'alerta-sos';
  const compactCoord = searchParams.get('c')?.split(',') || [];
  const paramLat = compactCoord.length === 2
    ? parseFloat(compactCoord[0])
    : searchParams.get('lat')
    ? parseFloat(searchParams.get('lat')!)
    : null;
  const paramLng = compactCoord.length === 2
    ? parseFloat(compactCoord[1])
    : searchParams.get('lng')
    ? parseFloat(searchParams.get('lng')!)
    : null;
  const paramNome = searchParams.get('nome') || searchParams.get('name') || '';
  const paramTel = searchParams.get('tel') || searchParams.get('phone') || '';
  const paramAddr = searchParams.get('addr') || searchParams.get('endereco') || '';
  const paramAcc = searchParams.get('acc') ? parseFloat(searchParams.get('acc')!) : 15;
  const paramTime = searchParams.get('t') ? new Date(parseInt(searchParams.get('t')!)).toISOString() : new Date().toISOString();

  const defaultLat = -28.3926;
  const defaultLng = -49.3989;

  const [sosData, setSosData] = useState<SosData>(() => ({
    id: sosId,
    name: paramNome || 'Passageiro em Emergência',
    phone: paramTel || '',
    lat: paramLat !== null && !isNaN(paramLat) ? paramLat : defaultLat,
    lng: paramLng !== null && !isNaN(paramLng) ? paramLng : defaultLng,
    accuracy: paramAcc,
    address: paramAddr && !isGenericFallbackAddress(paramAddr) ? paramAddr : 'Identificando endereço pelo GPS...',
    rideId: searchParams.get('rideId') || null,
    updatedAt: paramTime,
    secondsAgo: 0,
    isOnline: true
  }));

  const [copiedCoords, setCopiedCoords] = useState(false);
  const [mapLayer, setMapLayer] = useState<'streets' | 'satellite'>('satellite');
  const [recenterTrigger, setRecenterTrigger] = useState(0);
  const [fitBoundsTrigger, setFitBoundsTrigger] = useState(0);
  const lastGeocodedKeyRef = useRef<string>('');

  // Estado da Rota de Socorro em Tempo Real (Socorrista -> Vítima)
  const [isFollowingRoute, setIsFollowingRoute] = useState(false);
  const [rescuerCoords, setRescuerCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [routePolyline, setRoutePolyline] = useState<[number, number][]>([]);
  const [routeDistanceMeters, setRouteDistanceMeters] = useState<number | null>(null);
  const [routeDurationSeconds, setRouteDurationSeconds] = useState<number | null>(null);
  const [isLocatingRescuer, setIsLocatingRescuer] = useState(false);
  const [routeError, setRouteError] = useState<string | null>(null);
  const hasInitialFitRef = useRef(false);

  // Injetar animação pulsante
  useEffect(() => {
    const styleId = 'sos-animation-styles';
    if (!document.getElementById(styleId)) {
      const style = document.createElement('style');
      style.id = styleId;
      style.innerHTML = `
        @keyframes sosPulse {
          0% { transform: scale(0.6); opacity: 0.9; }
          70% { transform: scale(1.65); opacity: 0; }
          100% { transform: scale(1.65); opacity: 0; }
        }
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `;
      document.head.appendChild(style);
    }
  }, []);

  // Polling contínuo da telemetria da vítima a cada 3s
  const fetchTelemetry = async () => {
    try {
      const res = await fetch(`/api/sos/${encodeURIComponent(sosId)}/location`, {
        cache: 'no-store'
      });
      if (res.ok) {
        const data = await res.json();
        if (data.ok && data.lat && data.lng) {
          setSosData(prev => {
            const incomingAddr = data.address && !isGenericFallbackAddress(data.address) ? data.address : '';
            const currentValidAddr = !isGenericFallbackAddress(prev.address) && !prev.address.startsWith('Identificando')
              ? prev.address
              : '';
            return {
              id: data.id,
              name: data.name || prev.name,
              phone: data.phone || prev.phone,
              lat: Number(data.lat),
              lng: Number(data.lng),
              accuracy: Number(data.accuracy || 15),
              address: incomingAddr || currentValidAddr || prev.address,
              rideId: data.rideId || prev.rideId,
              updatedAt: data.updatedAt || prev.updatedAt,
              secondsAgo: data.secondsAgo ?? 0,
              isOnline: Boolean(data.isOnline),
              active: data.active
            };
          });
        }
      }
    } catch {
      // Mantém última localização conhecida
    }
  };

  useEffect(() => {
    fetchTelemetry();
    const interval = setInterval(fetchTelemetry, 3000);
    return () => clearInterval(interval);
  }, [sosId]);

  // Geocodificação reversa automática das coordenadas reais da vítima (corrige endereço genérico)
  useEffect(() => {
    if (!sosData.lat || !sosData.lng) return;
    const coordKey = `${sosData.lat.toFixed(4)},${sosData.lng.toFixed(4)}`;
    const needsGeocode =
      isGenericFallbackAddress(sosData.address) ||
      sosData.address.startsWith('Identificando') ||
      lastGeocodedKeyRef.current !== coordKey;

    if (!needsGeocode) return;
    lastGeocodedKeyRef.current = coordKey;

    let cancelled = false;
    reverseGeocode(sosData.lat, sosData.lng).then((resolved) => {
      if (!cancelled && resolved && !resolved.startsWith('GPS:')) {
        setSosData(prev => ({
          ...prev,
          address: resolved
        }));
      }
    });

    return () => {
      cancelled = true;
    };
  }, [sosData.lat, sosData.lng]);

  // Monitoramento de GPS em tempo real do Socorrista quando "Rota ao Vivo" está ativa
  useEffect(() => {
    if (!isFollowingRoute) {
      setRescuerCoords(null);
      setRoutePolyline([]);
      setRouteDistanceMeters(null);
      setRouteDurationSeconds(null);
      setRouteError(null);
      hasInitialFitRef.current = false;
      return;
    }

    if (!('geolocation' in navigator)) {
      setRouteError('GPS não suportado neste navegador.');
      return;
    }

    setIsLocatingRescuer(true);
    setRouteError(null);

    const onPos = (pos: GeolocationPosition) => {
      const next = {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude
      };
      setRescuerCoords(next);
      setIsLocatingRescuer(false);
      if (!hasInitialFitRef.current) {
        hasInitialFitRef.current = true;
        setTimeout(() => setFitBoundsTrigger(prev => prev + 1), 150);
      }
    };

    const onErr = () => {
      setIsLocatingRescuer(false);
      setRouteError('Permita o acesso à sua localização para traçar a rota em tempo real.');
    };

    navigator.geolocation.getCurrentPosition(onPos, onErr, {
      enableHighAccuracy: true,
      timeout: 8000,
      maximumAge: 0
    });

    const watchId = navigator.geolocation.watchPosition(onPos, () => {}, {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 0
    });

    return () => {
      navigator.geolocation.clearWatch(watchId);
    };
  }, [isFollowingRoute]);

  // Calcula a rota viária em tempo real (OSRM) entre o Socorrista e a Vítima
  useEffect(() => {
    if (!isFollowingRoute || !rescuerCoords) return;

    let cancelled = false;
    const fetchLiveRoute = async () => {
      try {
        const url = `https://router.project-osrm.org/route/v1/driving/${rescuerCoords.lng},${rescuerCoords.lat};${sosData.lng},${sosData.lat}?overview=full&geometries=geojson`;
        const res = await fetch(url);
        if (res.ok) {
          const data = await res.json();
          const route = data?.routes?.[0];
          if (!cancelled && route && route.geometry?.coordinates) {
            const coords: [number, number][] = route.geometry.coordinates.map(
              (c: [number, number]) => [c[1], c[0]]
            );
            const fallbackKm = calculateHaversineDistance(rescuerCoords.lat, rescuerCoords.lng, sosData.lat, sosData.lng);
            setRoutePolyline(coords);
            setRouteDistanceMeters(route.distance ?? fallbackKm * 1000);
            setRouteDurationSeconds(route.duration ?? (fallbackKm / 40) * 3600);
            return;
          }
        }
      } catch {
        // Fallback em linha reta caso OSRM oscile
      }

      if (!cancelled) {
        const directKm = calculateHaversineDistance(rescuerCoords.lat, rescuerCoords.lng, sosData.lat, sosData.lng);
        setRoutePolyline([
          [rescuerCoords.lat, rescuerCoords.lng],
          [sosData.lat, sosData.lng]
        ]);
        setRouteDistanceMeters(directKm * 1000);
        setRouteDurationSeconds((directKm / 35) * 3600);
      }
    };

    fetchLiveRoute();
    return () => {
      cancelled = true;
    };
  }, [isFollowingRoute, rescuerCoords?.lat, rescuerCoords?.lng, sosData.lat, sosData.lng]);

  const handleCopyCoords = () => {
    const text = `${sosData.lat.toFixed(5)}, ${sosData.lng.toFixed(5)}`;
    navigator.clipboard.writeText(text);
    setCopiedCoords(true);
    setTimeout(() => setCopiedCoords(false), 2000);
  };

  const handleShare = () => {
    const cleanUrl = `${window.location.origin}/sos/${encodeURIComponent(sosData.id)}`;
    const mapsUrl = `https://maps.google.com/?q=${sosData.lat.toFixed(5)},${sosData.lng.toFixed(5)}`;
    const shareText =
      `🚨 *ALERTA DE EMERGÊNCIA / SOS - KAVRO DRIVE*\n\n` +
      `👤 *Solicitante:* ${sosData.name}${sosData.phone ? ` (${formatPhone(sosData.phone)})` : ''}\n` +
      `📍 *Endereço GPS:* ${sosData.address}\n` +
      `🛰️ *Coordenadas:* ${sosData.lat.toFixed(5)}, ${sosData.lng.toFixed(5)}\n\n` +
      `🔴 *1. Rastreamento ao Vivo e Rota de Socorro:*\n${cleanUrl}\n\n` +
      `🗺️ *2. Abrir Localização no Google Maps:*\n${mapsUrl}`;

    if (navigator.share) {
      // Sem 'url' separado para não duplicar o link no final da mensagem
      navigator.share({
        title: '🚨 Alerta SOS - Kavro Drive',
        text: shareText
      }).catch(() => {
        window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(shareText)}`, '_blank');
      });
    } else {
      window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(shareText)}`, '_blank');
    }
  };

  const formatTime = (isoString: string) => {
    try {
      const d = new Date(isoString);
      return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '--:--';
    }
  };

  const formatAgo = (seconds: number) => {
    if (seconds < 5) return 'agora';
    if (seconds < 60) return `há ${seconds}s`;
    const min = Math.floor(seconds / 60);
    if (min < 60) return `há ${min}m`;
    const hours = Math.floor(min / 60);
    return `há ${hours}h`;
  };

  const formatDistance = (meters: number | null) => {
    if (meters === null) return '--';
    if (meters < 1000) return `${Math.round(meters)} m`;
    return `${(meters / 1000).toFixed(1)} km`;
  };

  const formatEta = (seconds: number | null) => {
    if (seconds === null) return '--';
    const min = Math.max(1, Math.round(seconds / 60));
    return `~${min} min`;
  };

  const googleMapsRouteUrl = rescuerCoords
    ? `https://www.google.com/maps/dir/?api=1&origin=${rescuerCoords.lat},${rescuerCoords.lng}&destination=${sosData.lat},${sosData.lng}&travelmode=driving`
    : `https://www.google.com/maps/dir/?api=1&destination=${sosData.lat},${sosData.lng}&travelmode=driving`;
  const wazeRouteUrl = `https://waze.com/ul?ll=${sosData.lat},${sosData.lng}&navigate=yes`;

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      display: 'flex',
      flexDirection: 'column',
      backgroundColor: '#0F172A',
      color: '#FFFFFF',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      overflow: 'hidden',
      zIndex: 9999
    }}>
      {/* BARRA SUPERIOR ÚNICA COMPACTA (HEADER + STATUS INTEGRADOS) */}
      <header style={{
        backgroundColor: '#0F172A',
        borderBottom: `1.5px solid ${sosData.isOnline ? '#16A34A' : '#DC2626'}`,
        padding: 'calc(6px + env(safe-area-inset-top, 0px)) 10px 6px 10px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 8,
        zIndex: 1000,
        flexShrink: 0
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flex: 1 }}>
          <button
            onClick={() => navigate('/')}
            style={{
              width: 30,
              height: 30,
              borderRadius: 8,
              backgroundColor: '#1E293B',
              border: '1px solid #334155',
              color: '#FFFFFF',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              flexShrink: 0
            }}
          >
            <ArrowLeft size={16} />
          </button>

          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'nowrap' }}>
              <span style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                backgroundColor: sosData.isOnline ? '#22C55E' : '#EF4444',
                boxShadow: sosData.isOnline ? '0 0 8px #22C55E' : '0 0 8px #EF4444',
                flexShrink: 0
              }} />
              <span style={{
                fontSize: '0.82rem',
                fontWeight: 900,
                color: '#FFFFFF',
                letterSpacing: '-0.01em',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis'
              }}>
                {sosData.isOnline ? 'SOS • AO VIVO' : 'SOS • ÚLTIMO PONTO'}
              </span>
              <span style={{
                fontSize: '0.66rem',
                backgroundColor: sosData.isOnline ? 'rgba(22, 163, 74, 0.25)' : 'rgba(220, 38, 38, 0.28)',
                color: sosData.isOnline ? '#86EFAC' : '#FCA5A5',
                border: `1px solid ${sosData.isOnline ? '#15803D' : '#B91C1C'}`,
                padding: '1px 6px',
                borderRadius: 6,
                fontWeight: 800,
                whiteSpace: 'nowrap',
                flexShrink: 0
              }}>
                {formatAgo(sosData.secondsAgo)} • ±{Math.round(sosData.accuracy)}m
              </span>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          <button
            onClick={() => fetchTelemetry()}
            style={{
              width: 30,
              height: 30,
              borderRadius: 8,
              backgroundColor: '#1E293B',
              border: '1px solid #334155',
              color: '#E2E8F0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer'
            }}
            title="Atualizar GPS"
          >
            <RefreshCw size={14} />
          </button>

          <button
            onClick={handleShare}
            style={{
              height: 30,
              padding: '0 10px',
              borderRadius: 8,
              backgroundColor: '#15803D',
              border: 'none',
              color: '#FFFFFF',
              fontSize: '0.74rem',
              fontWeight: 800,
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              cursor: 'pointer'
            }}
          >
            <Share2 size={13} />
            <span>Compartilhar</span>
          </button>
        </div>
      </header>

      {/* MAPA LEAFLET EM TELA AMPLA (~80% DO ESPAÇO ÚTIL) */}
      <div style={{ flex: 1, position: 'relative', width: '100%', minHeight: 0 }}>
        <MapContainer
          center={[sosData.lat, sosData.lng]}
          zoom={16}
          style={{ width: '100%', height: '100%' }}
          zoomControl={false}
        >
          {mapLayer === 'streets' ? (
            <TileLayer
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              attribution='&copy; OpenStreetMap'
              maxZoom={19}
            />
          ) : (
            <>
              <TileLayer
                url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                attribution="Tiles &copy; Esri"
                maxZoom={19}
              />
              <TileLayer
                url="https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}"
                maxZoom={19}
              />
              <TileLayer
                url="https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}"
                maxZoom={19}
              />
            </>
          )}

          {/* Raio de precisão da vítima */}
          <Circle
            center={[sosData.lat, sosData.lng]}
            radius={Math.max(15, Math.min(sosData.accuracy, 400))}
            pathOptions={{
              color: sosData.isOnline ? '#DC2626' : '#64748B',
              fillColor: sosData.isOnline ? '#EF4444' : '#94A3B8',
              fillOpacity: 0.14,
              weight: 1.5,
              dashArray: '4 4'
            }}
          />

          {/* Polilinha da Rota de Socorro em Tempo Real (Socorrista -> Vítima) */}
          {isFollowingRoute && routePolyline.length >= 2 && (
            <>
              <Polyline
                positions={routePolyline}
                pathOptions={{
                  color: '#0F172A',
                  weight: 8,
                  opacity: 0.75,
                  lineCap: 'round',
                  lineJoin: 'round'
                }}
              />
              <Polyline
                positions={routePolyline}
                pathOptions={{
                  color: '#38BDF8',
                  weight: 5,
                  opacity: 0.98,
                  lineCap: 'round',
                  lineJoin: 'round'
                }}
              />
            </>
          )}

          {/* Marcador da Vítima */}
          <Marker
            position={[sosData.lat, sosData.lng]}
            icon={createEmergencyMarker(sosData.isOnline)}
          />

          {/* Marcador do Socorrista ("VOCÊ") quando a rota ao vivo está ativa */}
          {isFollowingRoute && rescuerCoords && (
            <Marker
              position={[rescuerCoords.lat, rescuerCoords.lng]}
              icon={createRescuerMarker()}
            />
          )}

          <MapController
            victimPos={[sosData.lat, sosData.lng]}
            rescuerPos={rescuerCoords ? [rescuerCoords.lat, rescuerCoords.lng] : null}
            zoomTrigger={recenterTrigger}
            fitBoundsTrigger={fitBoundsTrigger}
          />
        </MapContainer>

        {/* PÍLULA COMPACTA DE STATUS OFFLINE (SE DESCONECTADO) OU HUD DE ROTA AO VIVO */}
        <div style={{
          position: 'absolute',
          top: 8,
          left: 8,
          right: 54,
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
          zIndex: 1000,
          pointerEvents: 'none'
        }}>
          {!sosData.isOnline && (
            <div style={{
              alignSelf: 'flex-start',
              backgroundColor: 'rgba(127, 29, 29, 0.92)',
              backdropFilter: 'blur(6px)',
              border: '1px solid #EF4444',
              borderRadius: 8,
              padding: '4px 9px',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              fontSize: '0.68rem',
              color: '#FEE2E2',
              boxShadow: '0 2px 10px rgba(0,0,0,0.35)',
              pointerEvents: 'auto'
            }}>
              <WifiOff size={12} color="#FCA5A5" style={{ flexShrink: 0 }} />
              <span>
                <strong>Sinal offline</strong> (último às {formatTime(sosData.updatedAt)}) • Exibindo último ponto salvo
              </span>
            </div>
          )}

          {isFollowingRoute && (
            <div style={{
              alignSelf: 'flex-start',
              backgroundColor: 'rgba(15, 23, 42, 0.94)',
              backdropFilter: 'blur(8px)',
              border: '1.5px solid #38BDF8',
              borderRadius: 10,
              padding: '6px 10px',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              boxShadow: '0 4px 14px rgba(0,0,0,0.45)',
              pointerEvents: 'auto'
            }}>
              {isLocatingRescuer ? (
                <>
                  <Loader2 size={14} color="#38BDF8" style={{ animation: 'spin 1s linear infinite' }} />
                  <span style={{ fontSize: '0.73rem', fontWeight: 800, color: '#E2E8F0' }}>
                    Localizando seu GPS para traçar a rota...
                  </span>
                </>
              ) : routeError ? (
                <>
                  <AlertTriangle size={14} color="#F87171" />
                  <span style={{ fontSize: '0.71rem', color: '#FCA5A5', fontWeight: 700 }}>{routeError}</span>
                </>
              ) : (
                <>
                  <Route size={15} color="#38BDF8" />
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: '0.76rem', fontWeight: 900, color: '#38BDF8' }}>
                      {formatDistance(routeDistanceMeters)}
                    </span>
                    <span style={{ fontSize: '0.68rem', color: '#64748B' }}>•</span>
                    <span style={{ fontSize: '0.76rem', fontWeight: 900, color: '#4ADE80' }}>
                      {formatEta(routeDurationSeconds)}
                    </span>
                  </div>
                  <button
                    onClick={() => setFitBoundsTrigger(prev => prev + 1)}
                    style={{
                      backgroundColor: '#1E293B',
                      border: '1px solid #475569',
                      color: '#E2E8F0',
                      borderRadius: 6,
                      padding: '2px 7px',
                      fontSize: '0.66rem',
                      fontWeight: 800,
                      cursor: 'pointer'
                    }}
                  >
                    Enquadrar
                  </button>
                </>
              )}

              <button
                onClick={() => setIsFollowingRoute(false)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#94A3B8',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: 2,
                  cursor: 'pointer'
                }}
                title="Fechar Rota ao Vivo"
              >
                <X size={14} />
              </button>
            </div>
          )}
        </div>

        {/* BOTÕES FLUTUANTES DO MAPA (COMPACTOS) */}
        <div style={{
          position: 'absolute',
          top: 8,
          right: 8,
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
          zIndex: 1000
        }}>
          <button
            onClick={() => setRecenterTrigger(prev => prev + 1)}
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              backgroundColor: 'rgba(15, 23, 42, 0.9)',
              border: '1px solid #475569',
              color: '#38BDF8',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 2px 10px rgba(0,0,0,0.4)',
              cursor: 'pointer'
            }}
            title="Centralizar na Vítima"
          >
            <Locate size={18} />
          </button>

          <button
            onClick={() => setMapLayer(prev => prev === 'streets' ? 'satellite' : 'streets')}
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              backgroundColor: 'rgba(15, 23, 42, 0.9)',
              border: '1px solid #475569',
              color: '#F8FAFC',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 2px 10px rgba(0,0,0,0.4)',
              cursor: 'pointer'
            }}
            title="Alternar Satélite / Mapa"
          >
            <Layers size={17} />
          </button>
        </div>
      </div>

      {/* DOCK INFERIOR ULTRA-COMPACTO (OCUPA MÍNIMO ESPAÇO NO MOBILE E DESKTOP) */}
      <div style={{
        backgroundColor: '#0F172A',
        borderTop: '1px solid #1E293B',
        padding: '8px 10px calc(8px + env(safe-area-inset-bottom, 0px)) 10px',
        zIndex: 1000,
        flexShrink: 0,
        display: 'flex',
        justifyContent: 'center'
      }}>
        <div style={{
          width: '100%',
          maxWidth: 720,
          display: 'flex',
          flexDirection: 'column',
          gap: 6
        }}>
          {/* LINHA 1: SOLICITANTE + ENDEREÇO REAL + COORDENADAS COPIÁVEIS + LIGAR/WHATSAPP */}
          <div style={{
            backgroundColor: '#1E293B',
            borderRadius: 10,
            padding: '7px 10px',
            border: '1px solid #334155',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8
          }}>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <span style={{
                  fontSize: '0.86rem',
                  fontWeight: 900,
                  color: '#FFFFFF',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap'
                }}>
                  {sosData.name}
                </span>
                {sosData.phone && (
                  <span style={{ fontSize: '0.73rem', color: '#4ADE80', fontWeight: 800, whiteSpace: 'nowrap' }}>
                    {formatPhone(sosData.phone)}
                  </span>
                )}
              </div>

              <div style={{
                fontSize: '0.73rem',
                color: '#E2E8F0',
                marginTop: 2,
                display: 'flex',
                alignItems: 'center',
                gap: 4
              }}>
                <MapPin size={12} color="#EF4444" style={{ flexShrink: 0 }} />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 700 }}>
                  {sosData.address}
                </span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                <button
                  onClick={handleCopyCoords}
                  style={{
                    background: 'rgba(15, 23, 42, 0.7)',
                    border: '1px solid #334155',
                    borderRadius: 5,
                    padding: '1px 6px',
                    color: '#38BDF8',
                    fontSize: '0.67rem',
                    fontFamily: 'monospace',
                    fontWeight: 700,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    cursor: 'pointer'
                  }}
                  title="Copiar coordenadas GPS"
                >
                  <span>{sosData.lat.toFixed(5)}, {sosData.lng.toFixed(5)}</span>
                  {copiedCoords ? <Check size={10} color="#4ADE80" /> : <Copy size={10} />}
                  <span style={{ fontFamily: 'sans-serif', fontSize: '0.63rem', color: copiedCoords ? '#4ADE80' : '#94A3B8' }}>
                    {copiedCoords ? 'Copiado' : 'Copiar'}
                  </span>
                </button>
              </div>
            </div>

            {sosData.phone && (
              <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                <a
                  href={`tel:${sosData.phone.replace(/\D/g, '')}`}
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: 9,
                    backgroundColor: '#2563EB',
                    color: '#FFFFFF',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    textDecoration: 'none'
                  }}
                  title="Ligar para o Solicitante"
                >
                  <Phone size={16} />
                </a>

                <a
                  href={`https://wa.me/55${sosData.phone.replace(/\D/g, '')}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: 9,
                    backgroundColor: '#15803D',
                    color: '#FFFFFF',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    textDecoration: 'none'
                  }}
                  title="WhatsApp do Solicitante"
                >
                  <WhatsAppIcon size={17} />
                </a>
              </div>
            )}
          </div>

          {/* LINHA 2: 3 BOTÕES DE ROTA (ROTA AO VIVO NO MAPA + GOOGLE MAPS + WAZE) */}
          <div style={{ display: 'grid', gridTemplateColumns: '1.15fr 1fr 1fr', gap: 6 }}>
            <button
              type="button"
              onClick={() => setIsFollowingRoute(prev => !prev)}
              style={{
                backgroundColor: isFollowingRoute ? '#0284C7' : '#2563EB',
                color: '#FFFFFF',
                padding: '8px 6px',
                borderRadius: 9,
                border: isFollowingRoute ? '1.5px solid #7DD3FC' : 'none',
                fontWeight: 900,
                fontSize: '0.75rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 5,
                cursor: 'pointer',
                boxShadow: '0 2px 8px rgba(37, 99, 235, 0.35)'
              }}
            >
              <Route size={15} />
              <span>{isFollowingRoute ? 'Rota Ativa' : 'Rota ao Vivo'}</span>
            </button>

            <a
              href={googleMapsRouteUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                backgroundColor: '#FFFFFF',
                color: '#0F172A',
                padding: '8px 6px',
                borderRadius: 9,
                fontWeight: 800,
                fontSize: '0.75rem',
                textDecoration: 'none',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 5
              }}
            >
              <Navigation size={14} color="#2563EB" />
              <span>Google Maps</span>
            </a>

            <a
              href={wazeRouteUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                backgroundColor: '#33CCFF',
                color: '#002B49',
                padding: '8px 6px',
                borderRadius: 9,
                fontWeight: 900,
                fontSize: '0.75rem',
                textDecoration: 'none',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 5
              }}
            >
              <ExternalLink size={14} />
              <span>Waze</span>
            </a>
          </div>

          {/* LINHA 3: EMERGÊNCIA 190 / 192 / 193 COM OS ÍCONES OFICIAIS */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr 1fr',
            gap: 6
          }}>
            <a
              href="tel:190"
              style={{
                backgroundColor: '#DC2626',
                color: '#FFFFFF',
                padding: '5px 6px',
                borderRadius: 9,
                textDecoration: 'none',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                boxShadow: '0 2px 8px rgba(220, 38, 38, 0.3)'
              }}
            >
              <span style={{
                width: 24,
                height: 24,
                borderRadius: 6,
                backgroundColor: '#FFFFFF',
                padding: 2,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0
              }}>
                <img src="/icons/icone-190.png" alt="190" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
              </span>
              <span style={{ fontSize: '0.72rem', fontWeight: 900, whiteSpace: 'nowrap' }}>Polícia 190</span>
            </a>

            <a
              href="tel:192"
              style={{
                backgroundColor: '#E11D48',
                color: '#FFFFFF',
                padding: '5px 6px',
                borderRadius: 9,
                textDecoration: 'none',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                boxShadow: '0 2px 8px rgba(225, 29, 72, 0.3)'
              }}
            >
              <span style={{
                width: 28,
                height: 24,
                borderRadius: 6,
                backgroundColor: '#FFFFFF',
                padding: 2,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0
              }}>
                <img src="/icons/icone-samu.png" alt="SAMU 192" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
              </span>
              <span style={{ fontSize: '0.72rem', fontWeight: 900, whiteSpace: 'nowrap' }}>SAMU 192</span>
            </a>

            <a
              href="tel:193"
              style={{
                backgroundColor: '#EA580C',
                color: '#FFFFFF',
                padding: '5px 6px',
                borderRadius: 9,
                textDecoration: 'none',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                boxShadow: '0 2px 8px rgba(234, 88, 12, 0.3)'
              }}
            >
              <span style={{
                width: 24,
                height: 24,
                borderRadius: 6,
                backgroundColor: '#FFFFFF',
                padding: 2,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0
              }}>
                <img src="/icons/icone-193.png" alt="Bombeiros 193" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
              </span>
              <span style={{ fontSize: '0.72rem', fontWeight: 900, whiteSpace: 'nowrap' }}>Bombeiros 193</span>
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};
