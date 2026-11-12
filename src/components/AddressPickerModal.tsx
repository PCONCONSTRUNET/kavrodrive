import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { MapContainer, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { Search, MapPin, Navigation, X, Check, Loader2, Compass, ChevronDown } from 'lucide-react';
import { LocationPoint } from '../types';
import { searchAddressGeocode, reverseGeocode } from '../utils/geo';

// Fix leaflet default icon paths
import 'leaflet/dist/leaflet.css';
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

interface AddressPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  initialPoint?: LocationPoint;
  onSelect: (point: LocationPoint) => void;
}

// Captura a instância do mapa e a expõe via ref (e corrige tamanho dentro do modal)
const MapRefCapture: React.FC<{ mapRef: React.MutableRefObject<L.Map | null> }> = ({ mapRef }) => {
  const map = useMap();
  useEffect(() => {
    mapRef.current = map;
    const t1 = setTimeout(() => map.invalidateSize(), 100);
    const t2 = setTimeout(() => map.invalidateSize(), 400);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [map]);
  return null;
};

// Controla o centro do mapa
const MapController: React.FC<{ center: [number, number] }> = ({ center }) => {
  const map = useMap();
  useEffect(() => {
    map.setView(center, map.getZoom());
  }, [center, map]);
  return null;
};

// Detecta quando o mapa para de se mover e atualiza coordenadas do centro
const MapMoveListener: React.FC<{
  onMove: (lat: number, lng: number) => void;
  onMoveEnd: (lat: number, lng: number) => void;
}> = ({ onMove, onMoveEnd }) => {
  const onMoveRef = useRef(onMove);
  const onMoveEndRef = useRef(onMoveEnd);
  useEffect(() => { onMoveRef.current = onMove; }, [onMove]);
  useEffect(() => { onMoveEndRef.current = onMoveEnd; }, [onMoveEnd]);

  useMapEvents({
    move(e) {
      const c = e.target.getCenter();
      onMoveRef.current(c.lat, c.lng);
    },
    moveend(e) {
      const c = e.target.getCenter();
      onMoveEndRef.current(c.lat, c.lng);
    },
  });
  return null;
};

export const AddressPickerModal: React.FC<AddressPickerModalProps> = ({
  isOpen,
  onClose,
  title,
  initialPoint,
  onSelect,
}) => {
  // Coordenadas padrão — Lauro Müller, SC
  const DEFAULT_LAT = -28.3878;
  const DEFAULT_LNG = -49.3977;

  const mapRef = useRef<L.Map | null>(null);

  const [mapCenter, setMapCenter] = useState<[number, number]>([
    initialPoint?.lat ?? DEFAULT_LAT,
    initialPoint?.lng ?? DEFAULT_LNG,
  ]);
  const [controlledCenter, setControlledCenter] = useState<[number, number] | null>(null);

  const [address, setAddress] = useState(initialPoint?.address || '');
  const [isReverseGeocoding, setIsReverseGeocoding] = useState(false);
  const [isGettingGps, setIsGettingGps] = useState(false);

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Array<{ display_name: string; lat: number; lng: number }>>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showSearch, setShowSearch] = useState(false);

  const [reference, setReference] = useState(initialPoint?.reference || '');
  const [complement, setComplement] = useState(initialPoint?.complement || '');
  const [showDetails, setShowDetails] = useState(false);
  const [mapLayer, setMapLayer] = useState<'streets' | 'hybrid'>('streets');

  const reverseTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (isOpen) {
      setShowSearch(false);
      setSearchQuery('');
      setSearchResults([]);
      if (initialPoint) {
        setMapCenter([initialPoint.lat, initialPoint.lng]);
        setControlledCenter([initialPoint.lat, initialPoint.lng]);
        setAddress(initialPoint.address);
        setReference(initialPoint.reference || '');
        setComplement(initialPoint.complement || '');
      }
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // Enquanto o mapa está sendo arrastado
  const handleMapMove = (lat: number, lng: number) => {
    setMapCenter([lat, lng]);
  };

  // Quando o arraste termina — faz reverse geocode
  const handleMapMoveEnd = (lat: number, lng: number) => {
    setMapCenter([lat, lng]);
    if (reverseTimeout.current) clearTimeout(reverseTimeout.current);
    setIsReverseGeocoding(true);
    reverseTimeout.current = setTimeout(async () => {
      const result = await reverseGeocode(lat, lng);
      setAddress(result);
      setIsReverseGeocoding(false);
    }, 300);
  };

  // GPS real do navegador — usa flyTo() diretamente no mapa via ref
  const handleUseGPS = () => {
    if (!navigator.geolocation) {
      alert('Geolocalização não suportada pelo seu navegador.');
      return;
    }
    setIsGettingGps(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        // Usa flyTo diretamente na instância do mapa — mais confiável que setView via state
        if (mapRef.current) {
          mapRef.current.flyTo([lat, lng], 17, { animate: true, duration: 1.2 });
        } else {
          // fallback se o mapa ainda não foi capturado
          setControlledCenter([lat, lng]);
          setMapCenter([lat, lng]);
        }
        setIsGettingGps(false);
      },
      (err) => {
        setIsGettingGps(false);
        if (err.code === err.PERMISSION_DENIED) {
          alert('Permissão de localização negada. Habilite o GPS nas configurações do navegador.');
        } else {
          alert('Não foi possível obter sua localização. Tente novamente.');
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0, // sempre pega localização fresca — sem cache
      }
    );
  };

  // Busca de endereço por texto
  const handleSearch = (text: string) => {
    setSearchQuery(text);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    const trimmed = text.trim();
    if (trimmed.length >= 2) {
      setIsSearching(true);
      searchTimeout.current = setTimeout(async () => {
        const res = await searchAddressGeocode(trimmed, mapCenter[0], mapCenter[1]);
        setSearchResults(res);
        setIsSearching(false);
      }, 250);
    } else {
      setSearchResults([]);
      setIsSearching(false);
    }
  };

  // Seleciona resultado da busca — move o mapa
  const handleSelectResult = (item: { display_name: string; lat: number; lng: number }) => {
    if (mapRef.current) {
      mapRef.current.flyTo([item.lat, item.lng], 17, { animate: true, duration: 1.0 });
    }
    setControlledCenter([item.lat, item.lng]);
    setMapCenter([item.lat, item.lng]);
    setAddress(item.display_name);
    setSearchQuery('');
    setSearchResults([]);
    setShowSearch(false);
  };

  // Confirmar localização
  const handleConfirm = () => {
    if (!address.trim()) return;
    onSelect({
      address: address.trim(),
      lat: mapCenter[0],
      lng: mapCenter[1],
      reference: reference.trim() || undefined,
      complement: complement.trim() || undefined,
    });
    onClose();
  };

  return createPortal(
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        backgroundColor: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        width: '100%',
        maxWidth: 480,
        backgroundColor: '#fff',
        borderRadius: '24px 24px 0 0',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        maxHeight: '95vh',
      }}>
        {/* ── MAPA DETALHADO (RUAS, CASAS, COMÉRCIOS — IGUAL AO GPS DO MOTORISTA) ─────────────────────────── */}
        <div style={{ position: 'relative', height: 320, flexShrink: 0 }}>
          <MapContainer
            center={mapCenter}
            zoom={17}
            style={{ height: '100%', width: '100%' }}
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
              attribution="&copy; Google Maps"
            />
            {controlledCenter && <MapController center={controlledCenter} />}
            <MapMoveListener onMove={handleMapMove} onMoveEnd={handleMapMoveEnd} />
            <MapRefCapture mapRef={mapRef} />
          </MapContainer>

          {/* Alternar Mapa Detalhado / Satélite com Ruas */}
          <button
            type="button"
            onClick={() => setMapLayer(prev => (prev === 'streets' ? 'hybrid' : 'streets'))}
            style={{
              position: 'absolute',
              top: 12,
              left: 12,
              zIndex: 1001,
              background: '#121A21',
              color: '#76D800',
              border: '1.5px solid #2C3E50',
              borderRadius: 18,
              padding: '6px 12px',
              fontSize: '0.74rem',
              fontWeight: 800,
              boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
              cursor: 'pointer'
            }}
          >
            {mapLayer === 'streets' ? '🛰️ Ver Satélite/Casas' : '🗺️ Ver Mapa de Ruas'}
          </button>

          {/* Pin central fixo estilo iFood */}
          <div style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -100%)',
            zIndex: 1000,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            pointerEvents: 'none',
          }}>
            <div style={{
              width: 40,
              height: 40,
              borderRadius: '50% 50% 50% 0',
              backgroundColor: '#121A21',
              transform: 'rotate(-45deg)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
            }}>
              <div style={{ transform: 'rotate(45deg)' }}>
                <MapPin size={20} color="#76D800" />
              </div>
            </div>
            {/* sombra do pin */}
            <div style={{
              width: 10,
              height: 5,
              backgroundColor: 'rgba(0,0,0,0.2)',
              borderRadius: '50%',
              marginTop: 2,
              filter: 'blur(2px)',
            }} />
          </div>

          {/* Botão fechar */}
          <button
            onClick={onClose}
            style={{
              position: 'absolute',
              top: 12,
              right: 12,
              zIndex: 1001,
              background: '#fff',
              border: 'none',
              borderRadius: '50%',
              width: 36,
              height: 36,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
              cursor: 'pointer',
            }}
          >
            <X size={18} color="#121A21" />
          </button>

          {/* Botão GPS */}
          <button
            onClick={handleUseGPS}
            disabled={isGettingGps}
            style={{
              position: 'absolute',
              bottom: 12,
              right: 12,
              zIndex: 1001,
              background: '#fff',
              border: 'none',
              borderRadius: '50%',
              width: 40,
              height: 40,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
              cursor: 'pointer',
            }}
          >
            {isGettingGps
              ? <Loader2 size={20} color="#76D800" className="animate-spin" />
              : <Compass size={20} color="#76D800" />
            }
          </button>

          {/* Buscar endereço — botão de busca sobre o mapa */}
          <button
            onClick={() => setShowSearch(!showSearch)}
            style={{
              position: 'absolute',
              bottom: 12,
              left: 12,
              zIndex: 1001,
              background: '#fff',
              border: 'none',
              borderRadius: 20,
              padding: '8px 14px',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
              cursor: 'pointer',
              fontSize: '0.82rem',
              fontWeight: 700,
              color: '#121A21',
            }}
          >
            <Search size={16} color="#76D800" />
            Buscar endereço
          </button>
        </div>

        {/* ── BUSCA (expande ao clicar) ─────── */}
        {showSearch && (
          <div style={{ padding: '12px 16px', borderBottom: '1px solid #F0F2F5', backgroundColor: '#FAFBFC' }}>
            <div style={{ position: 'relative' }}>
              <Search size={16} style={{ position: 'absolute', left: 12, top: 13, color: '#94A3B8' }} />
              <input
                type="text"
                placeholder="Digite rua, bairro ou cidade..."
                value={searchQuery}
                onChange={(e) => handleSearch(e.target.value)}
                style={{
                  width: '100%',
                  padding: '11px 40px 11px 38px',
                  borderRadius: 12,
                  border: '1.5px solid #E2E8F0',
                  fontSize: '16px', // Previne auto-zoom no mobile (iOS / Android)
                  backgroundColor: '#fff',
                  boxSizing: 'border-box',
                  outline: 'none',
                }}
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    setSearchResults([]);
                  }}
                  style={{
                    position: 'absolute',
                    right: isSearching ? 34 : 10,
                    top: 10,
                    background: '#F1F5F9',
                    border: 'none',
                    borderRadius: '50%',
                    width: 22,
                    height: 22,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    color: '#64748B',
                  }}
                  aria-label="Limpar busca"
                >
                  <X size={13} />
                </button>
              )}
              {isSearching && (
                <div style={{ position: 'absolute', right: 12, top: 13 }}>
                  <Loader2 size={16} color="#76D800" className="animate-spin" />
                </div>
              )}
            </div>

            {/* Lista de resultados encontrados */}
            {searchResults.length > 0 && (
              <div style={{
                background: '#fff',
                border: '1px solid #E2E8F0',
                borderRadius: 12,
                marginTop: 8,
                overflow: 'hidden',
                boxShadow: '0 4px 14px rgba(0,0,0,0.08)',
                maxHeight: 220,
                overflowY: 'auto',
              }}>
                {searchResults.map((item, idx) => (
                  <div
                    key={idx}
                    onClick={() => handleSelectResult(item)}
                    style={{
                      padding: '11px 14px',
                      borderBottom: idx < searchResults.length - 1 ? '1px solid #F1F5F9' : 'none',
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: 10,
                      cursor: 'pointer',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = '#F8FAFC')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = '#fff')}
                  >
                    <Navigation size={15} color="#76D800" style={{ flexShrink: 0, marginTop: 2 }} />
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <p style={{ fontSize: '0.85rem', fontWeight: 600, color: '#1E293B', marginBottom: 2 }}>
                        {item.display_name.split(',')[0]}
                      </p>
                      <p style={{ fontSize: '0.73rem', color: '#64748B', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {item.display_name}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Aviso quando não encontrou nenhum resultado */}
            {searchQuery.trim().length >= 2 && !isSearching && searchResults.length === 0 && (
              <div style={{
                background: '#fff',
                border: '1px solid #E2E8F0',
                borderRadius: 12,
                marginTop: 8,
                padding: '12px 14px',
                textAlign: 'center',
                color: '#64748B',
                fontSize: '0.82rem',
              }}>
                Nenhum endereço encontrado para "<strong>{searchQuery}</strong>".<br />
                <span style={{ fontSize: '0.74rem', color: '#94A3B8' }}>
                  Você pode arrastar o mapa ou navegar para o local desejado.
                </span>
              </div>
            )}
          </div>
        )}

        {/* ── ENDEREÇO DETECTADO ────────────── */}
        <div style={{ padding: '14px 20px', borderBottom: '1px solid #F0F2F5' }}>
          <p style={{ fontSize: '0.72rem', fontWeight: 600, color: '#94A3B8', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 4 }}>
            {title}
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <MapPin size={16} color="#76D800" style={{ flexShrink: 0 }} />
            {isReverseGeocoding ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Loader2 size={14} color="#76D800" className="animate-spin" />
                <span style={{ fontSize: '0.88rem', color: '#94A3B8' }}>Identificando endereço...</span>
              </div>
            ) : (
              <p style={{ fontSize: '0.9rem', fontWeight: 600, color: '#121A21', lineHeight: 1.3 }}>
                {address || 'Arraste o mapa para ajustar a localização'}
              </p>
            )}
          </div>
          {/* Coordenadas pequenas */}
          <p style={{ fontSize: '0.7rem', color: '#CBD5E1', marginTop: 4, marginLeft: 24 }}>
            {mapCenter[0].toFixed(5)}, {mapCenter[1].toFixed(5)}
          </p>
        </div>

        {/* ── DETALHES OPCIONAIS ────────────── */}
        <div style={{ flexShrink: 0 }}>
          <button
            onClick={() => setShowDetails(!showDetails)}
            style={{
              width: '100%',
              padding: '10px 20px',
              background: 'none',
              border: 'none',
              borderBottom: showDetails ? '1px solid #F0F2F5' : 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              cursor: 'pointer',
              fontSize: '0.82rem',
              fontWeight: 600,
              color: '#64748B',
            }}
          >
            <span>Complemento e Referência (opcional)</span>
            <ChevronDown size={16} style={{ transform: showDetails ? 'rotate(180deg)' : 'none', transition: '0.2s' }} />
          </button>
          {showDetails && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, padding: '12px 20px 14px 20px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#475569', marginBottom: 4 }}>
                  Complemento
                </label>
                <input
                  type="text"
                  placeholder="Apto, Bloco..."
                  value={complement}
                  onChange={(e) => setComplement(e.target.value)}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: 10, border: '1px solid #CBD5E1', fontSize: '16px', boxSizing: 'border-box' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#475569', marginBottom: 4 }}>
                  Referência
                </label>
                <input
                  type="text"
                  placeholder="Perto de..."
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: 10, border: '1px solid #CBD5E1', fontSize: '16px', boxSizing: 'border-box' }}
                />
              </div>
            </div>
          )}
        </div>

        {/* ── CONFIRMAR ────────────── */}
        <div style={{ padding: '14px 20px 24px 20px', display: 'flex', gap: 10 }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              flex: 1,
              padding: '13px',
              borderRadius: 14,
              border: '1.5px solid #E2E8F0',
              background: '#fff',
              fontWeight: 700,
              fontSize: '0.9rem',
              color: '#64748B',
              cursor: 'pointer',
            }}
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!address.trim() || isReverseGeocoding}
            className="btn-ios-primary"
            style={{
              flex: 2,
              padding: '13px',
              opacity: address.trim() && !isReverseGeocoding ? 1 : 0.5,
              cursor: address.trim() ? 'pointer' : 'not-allowed',
            }}
          >
            <Check size={18} />
            <span>Confirmar Local</span>
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};
