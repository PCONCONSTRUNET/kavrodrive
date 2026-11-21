import React, { useEffect, useRef, useState } from 'react';
import { MapContainer, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { ArrowLeft, Check, Layers, LocateFixed, Loader2, Map as MapIcon, MapPin } from 'lucide-react';
import { LocationPoint } from '../types';
import { reverseGeocode } from '../utils/geo';
import 'leaflet/dist/leaflet.css';

interface InlineMapPinViewProps {
  field: 'origin' | 'destination';
  initialPoint?: LocationPoint | null;
  onBack: () => void;
  onConfirm: (point: LocationPoint) => void;
}

const DEFAULT_LAT = -28.3878;
const DEFAULT_LNG = -49.3977;

const MapSizeFix: React.FC<{ mapRef: React.MutableRefObject<L.Map | null> }> = ({ mapRef }) => {
  const map = useMap();
  useEffect(() => {
    mapRef.current = map;
    const t1 = setTimeout(() => map.invalidateSize(), 60);
    const t2 = setTimeout(() => map.invalidateSize(), 260);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [map, mapRef]);
  return null;
};

const MapMoveWatcher: React.FC<{
  onStart: () => void;
  onEnd: (lat: number, lng: number) => void;
}> = ({ onStart, onEnd }) => {
  const startRef = useRef(onStart);
  const endRef = useRef(onEnd);
  useEffect(() => { startRef.current = onStart; }, [onStart]);
  useEffect(() => { endRef.current = onEnd; }, [onEnd]);

  useMapEvents({
    movestart() {
      startRef.current();
    },
    moveend(e) {
      const c = e.target.getCenter();
      endRef.current(c.lat, c.lng);
    },
  });
  return null;
};

/**
 * Seletor visual de ponto no mapa embutido diretamente dentro do modal unificado da Uber,
 * evitando a abertura de outro modal separado ao tocar em "Defina a localização no mapa".
 */
export const InlineMapPinView: React.FC<InlineMapPinViewProps> = ({
  field,
  initialPoint,
  onBack,
  onConfirm,
}) => {
  const mapRef = useRef<L.Map | null>(null);
  const reqIdRef = useRef(0);
  const reverseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [coords, setCoords] = useState<[number, number]>([
    initialPoint?.lat ?? DEFAULT_LAT,
    initialPoint?.lng ?? DEFAULT_LNG,
  ]);
  const [address, setAddress] = useState<string>(initialPoint?.address || 'Movimente o mapa para escolher');
  const [isPanning, setIsPanning] = useState<boolean>(false);
  const [isResolving, setIsResolving] = useState<boolean>(false);
  const [isGpsLoading, setIsGpsLoading] = useState<boolean>(false);
  const [mapLayer, setMapLayer] = useState<'streets' | 'hybrid'>('streets');

  const resolveCoords = (lat: number, lng: number) => {
    if (reverseTimerRef.current) clearTimeout(reverseTimerRef.current);
    const reqId = ++reqIdRef.current;
    setIsResolving(true);
    reverseTimerRef.current = setTimeout(async () => {
      try {
        const rev = await reverseGeocode(lat, lng);
        if (reqIdRef.current === reqId) {
          setAddress(rev || `${lat.toFixed(5)}, ${lng.toFixed(5)}`);
        }
      } catch {
        if (reqIdRef.current === reqId) {
          setAddress(`${lat.toFixed(5)}, ${lng.toFixed(5)}`);
        }
      } finally {
        if (reqIdRef.current === reqId) {
          setIsResolving(false);
        }
      }
    }, 220);
  };

  useEffect(() => {
    resolveCoords(coords[0], coords[1]);
    return () => {
      if (reverseTimerRef.current) clearTimeout(reverseTimerRef.current);
    };
  }, []);

  const handleCenterGps = () => {
    if (!navigator.geolocation) return;
    setIsGpsLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        setCoords([lat, lng]);
        mapRef.current?.setView([lat, lng], 17);
        resolveCoords(lat, lng);
        setIsGpsLoading(false);
      },
      () => {
        setIsGpsLoading(false);
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', backgroundColor: '#FFFFFF' }}>
      {/* Topo compacto dentro do mesmo modal */}
      <div
        style={{
          padding: 'calc(14px + env(safe-area-inset-top, 0px)) 16px 12px 16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 10,
          borderBottom: '1px solid #F1F5F9',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <button
            type="button"
            onClick={onBack}
            aria-label="Voltar para endereços"
            style={{
              width: 36,
              height: 36,
              borderRadius: '50%',
              backgroundColor: '#F1F5F9',
              border: 'none',
              color: '#0F172A',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              flexShrink: 0,
            }}
          >
            <ArrowLeft size={18} />
          </button>
          <div style={{ minWidth: 0 }}>
            <h2 style={{ margin: 0, fontSize: '1.04rem', fontWeight: 900, color: '#0F172A', letterSpacing: '-0.02em' }}>
              {field === 'origin' ? 'Definir partida no mapa' : 'Definir destino no mapa'}
            </h2>
            <p style={{ margin: 0, fontSize: '0.72rem', color: '#64748B', fontWeight: 600 }}>
              Arraste o mapa até o local exato
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setMapLayer((prev) => (prev === 'streets' ? 'hybrid' : 'streets'))}
          style={{
            height: 34,
            padding: '0 11px',
            borderRadius: 999,
            border: '1px solid #E2E8F0',
            backgroundColor: mapLayer === 'hybrid' ? '#0F172A' : '#F8FAFC',
            color: mapLayer === 'hybrid' ? '#FFFFFF' : '#0F172A',
            fontSize: '0.74rem',
            fontWeight: 700,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 5,
            cursor: 'pointer',
            flexShrink: 0,
          }}
        >
          {mapLayer === 'streets' ? <Layers size={13} /> : <MapIcon size={13} color="#76D800" />}
          <span>{mapLayer === 'streets' ? 'Satélite' : 'Mapa'}</span>
        </button>
      </div>

      {/* Mapa isolado com pin central fixo */}
      <div style={{ position: 'relative', flex: 1, minHeight: 220, backgroundColor: '#E2E8F0', isolation: 'isolate' }}>
        <MapContainer
          center={coords}
          zoom={17}
          style={{ width: '100%', height: '100%' }}
          zoomControl={false}
          attributionControl={false}
        >
          <TileLayer
            key={mapLayer}
            url={
              mapLayer === 'hybrid'
                ? 'https://{s}.google.com/vt/lyrs=y&hl=pt-BR&x={x}&y={y}&z={z}'
                : 'https://{s}.google.com/vt/lyrs=m&hl=pt-BR&x={x}&y={y}&z={z}'
            }
            subdomains={['mt0', 'mt1', 'mt2', 'mt3']}
            maxZoom={20}
          />
          <MapSizeFix mapRef={mapRef} />
          <MapMoveWatcher
            onStart={() => setIsPanning(true)}
            onEnd={(lat, lng) => {
              setIsPanning(false);
              setCoords([lat, lng]);
              resolveCoords(lat, lng);
            }}
          />
        </MapContainer>

        {/* Botão GPS flutuante */}
        <button
          type="button"
          onClick={handleCenterGps}
          aria-label="Centralizar no meu GPS"
          style={{
            position: 'absolute',
            right: 14,
            bottom: 14,
            zIndex: 450,
            width: 42,
            height: 42,
            borderRadius: '50%',
            backgroundColor: '#FFFFFF',
            border: '1px solid #E2E8F0',
            color: '#0F172A',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 6px 16px rgba(15, 23, 42, 0.18)',
            cursor: 'pointer',
          }}
        >
          {isGpsLoading ? <Loader2 size={18} className="animate-spin" /> : <LocateFixed size={18} />}
        </button>

        {/* Pin central estilo Uber */}
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: isPanning ? 'translate(-50%, calc(-100% - 8px)) scale(1.05)' : 'translate(-50%, -100%)',
            transition: 'transform 0.14s ease',
            zIndex: 450,
            pointerEvents: 'none',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
          }}
        >
          <div
            style={{
              width: 38,
              height: 38,
              borderRadius: '50% 50% 50% 0',
              transform: 'rotate(-45deg)',
              backgroundColor: field === 'origin' ? '#16A34A' : '#0F172A',
              border: '3px solid #FFFFFF',
              boxShadow: '0 8px 18px rgba(15, 23, 42, 0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <div style={{ transform: 'rotate(45deg)', color: '#FFFFFF' }}>
              <MapPin size={16} />
            </div>
          </div>
          <div style={{ width: 8, height: 3, borderRadius: '50%', backgroundColor: 'rgba(15, 23, 42, 0.35)', marginTop: 2 }} />
        </div>
      </div>

      {/* Rodapé de confirmação dentro do mesmo modal */}
      <div
        style={{
          padding: '14px 16px calc(18px + env(safe-area-inset-bottom, 0px)) 16px',
          borderTop: '1px solid #F1F5F9',
          backgroundColor: '#FFFFFF',
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div
            style={{
              width: 34,
              height: 34,
              borderRadius: '50%',
              backgroundColor: field === 'origin' ? '#DCFCE7' : '#F1F5F9',
              color: field === 'origin' ? '#15803D' : '#0F172A',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            {isResolving ? <Loader2 size={16} className="animate-spin" /> : <MapPin size={16} />}
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: '0.7rem', fontWeight: 800, color: '#64748B', textTransform: 'uppercase' }}>
              {field === 'origin' ? 'Ponto de partida' : 'Destino selecionado'}
            </div>
            <div style={{ fontSize: '0.9rem', fontWeight: 800, color: '#0F172A', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {isResolving ? 'Buscando endereço...' : address}
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={() => onConfirm({ address, lat: coords[0], lng: coords[1] })}
          style={{
            width: '100%',
            height: 48,
            borderRadius: 999,
            border: 'none',
            backgroundColor: '#0F172A',
            color: '#FFFFFF',
            fontSize: '0.92rem',
            fontWeight: 800,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            cursor: 'pointer',
          }}
        >
          <Check size={17} />
          <span>{field === 'origin' ? 'Confirmar partida' : 'Confirmar destino'}</span>
        </button>
      </div>
    </div>
  );
};
