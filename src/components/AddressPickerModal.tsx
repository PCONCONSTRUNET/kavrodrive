import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { MapContainer, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import {
  ArrowLeft,
  Search,
  MapPin,
  Navigation,
  X,
  Check,
  Loader2,
  LocateFixed,
  ChevronDown,
  Layers,
  Map as MapIcon,
  Home,
  Briefcase,
  Clock,
  Star,
  Plus
} from 'lucide-react';
import { LocationPoint, ClientProfile } from '../types';
import { searchAddressGeocode, reverseGeocode, POPULAR_LOCAL_POINTS } from '../utils/geo';
import { StorageService } from '../services/storage';

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

const DEFAULT_LAT = -28.3878;
const DEFAULT_LNG = -49.3977;

const MapRefCapture: React.FC<{
  mapRef: React.MutableRefObject<L.Map | null>;
  layoutKey: string;
}> = ({ mapRef, layoutKey }) => {
  const map = useMap();
  useEffect(() => {
    mapRef.current = map;
    const t1 = setTimeout(() => map.invalidateSize(), 80);
    const t2 = setTimeout(() => map.invalidateSize(), 300);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [map, layoutKey, mapRef]);
  return null;
};

const MapController: React.FC<{ center: [number, number] }> = ({ center }) => {
  const map = useMap();
  useEffect(() => {
    map.setView(center, map.getZoom());
  }, [center, map]);
  return null;
};

const MapMoveListener: React.FC<{
  onMove: (lat: number, lng: number) => void;
  onMoveStart: () => void;
  onMoveEnd: (lat: number, lng: number) => void;
}> = ({ onMove, onMoveStart, onMoveEnd }) => {
  const onMoveRef = useRef(onMove);
  const onMoveStartRef = useRef(onMoveStart);
  const onMoveEndRef = useRef(onMoveEnd);
  useEffect(() => { onMoveRef.current = onMove; }, [onMove]);
  useEffect(() => { onMoveStartRef.current = onMoveStart; }, [onMoveStart]);
  useEffect(() => { onMoveEndRef.current = onMoveEnd; }, [onMoveEnd]);

  useMapEvents({
    movestart() {
      onMoveStartRef.current();
    },
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

function formatAddressHeadline(raw: string): { primary: string; secondary: string } {
  const clean = String(raw || '').trim();
  if (!clean) return { primary: '', secondary: '' };
  const idx = clean.indexOf(',');
  if (idx <= 0) return { primary: clean, secondary: '' };
  return {
    primary: clean.slice(0, idx).trim(),
    secondary: clean.slice(idx + 1).trim(),
  };
}

export const AddressPickerModal: React.FC<AddressPickerModalProps> = ({
  isOpen,
  onClose,
  title,
  initialPoint,
  onSelect,
}) => {
  const mapRef = useRef<L.Map | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  const [mapCenter, setMapCenter] = useState<[number, number]>([
    initialPoint?.lat ?? DEFAULT_LAT,
    initialPoint?.lng ?? DEFAULT_LNG,
  ]);
  const [controlledCenter, setControlledCenter] = useState<[number, number] | null>(null);

  const [address, setAddress] = useState(initialPoint?.address || '');
  const [isReverseGeocoding, setIsReverseGeocoding] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const [isGettingGps, setIsGettingGps] = useState(false);
  const [gpsError, setGpsError] = useState('');

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Array<{ display_name: string; lat: number; lng: number }>>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isSearchActive, setIsSearchActive] = useState(false);

  const [reference, setReference] = useState(initialPoint?.reference || '');
  const [complement, setComplement] = useState(initialPoint?.complement || '');
  const [showDetails, setShowDetails] = useState(false);
  const [mapLayer, setMapLayer] = useState<'streets' | 'hybrid'>('streets');

  const [savedAddresses, setSavedAddresses] = useState<NonNullable<ClientProfile['savedAddresses']>>([]);
  const [recentDestinations, setRecentDestinations] = useState<LocationPoint[]>([]);

  const reverseTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reverseReqIdRef = useRef(0);
  const searchReqIdRef = useRef(0);
  const skipMoveEndTargetRef = useRef<[number, number] | null>(null);

  const resolveCenterAddress = (lat: number, lng: number) => {
    if (reverseTimeout.current) clearTimeout(reverseTimeout.current);
    const reqId = ++reverseReqIdRef.current;
    setIsReverseGeocoding(true);
    reverseTimeout.current = setTimeout(async () => {
      const result = await reverseGeocode(lat, lng);
      if (reverseReqIdRef.current === reqId) {
        setAddress(result);
        setIsReverseGeocoding(false);
      }
    }, 220);
  };

  useEffect(() => {
    if (!isOpen) return;

    const currentUser = StorageService.getCurrentUser();
    setSavedAddresses(Array.isArray(currentUser?.savedAddresses) ? currentUser.savedAddresses : []);
    setRecentDestinations(StorageService.getRecentDestinations());

    setIsSearchActive(false);
    setSearchQuery('');
    setSearchResults([]);
    setIsSearching(false);
    setGpsError('');
    setIsPanning(false);

    if (initialPoint && Number.isFinite(initialPoint.lat) && Number.isFinite(initialPoint.lng)) {
      const nextCenter: [number, number] = [initialPoint.lat, initialPoint.lng];
      skipMoveEndTargetRef.current = initialPoint.address ? nextCenter : null;
      setMapCenter(nextCenter);
      setControlledCenter(nextCenter);
      setAddress(initialPoint.address || '');
      setReference(initialPoint.reference || '');
      setComplement(initialPoint.complement || '');
      setShowDetails(Boolean(initialPoint.reference || initialPoint.complement));
      if (!initialPoint.address) {
        resolveCenterAddress(initialPoint.lat, initialPoint.lng);
      } else {
        setIsReverseGeocoding(false);
      }
    } else {
      const nextCenter: [number, number] = [DEFAULT_LAT, DEFAULT_LNG];
      skipMoveEndTargetRef.current = null;
      setMapCenter(nextCenter);
      setControlledCenter(nextCenter);
      setAddress('');
      setReference('');
      setComplement('');
      setShowDetails(false);
      resolveCenterAddress(DEFAULT_LAT, DEFAULT_LNG);
    }

    return () => {
      if (reverseTimeout.current) clearTimeout(reverseTimeout.current);
      if (searchTimeout.current) clearTimeout(searchTimeout.current);
    };
  }, [isOpen, initialPoint]);

  const addressHeadline = useMemo(() => formatAddressHeadline(address), [address]);

  if (!isOpen) return null;

  const handleMapMoveStart = () => {
    setIsPanning(true);
    setGpsError('');
  };

  const handleMapMove = (lat: number, lng: number) => {
    setMapCenter([lat, lng]);
  };

  const handleMapMoveEnd = (lat: number, lng: number) => {
    setIsPanning(false);
    setMapCenter([lat, lng]);
    const skipTarget = skipMoveEndTargetRef.current;
    if (
      skipTarget &&
      Math.abs(lat - skipTarget[0]) < 0.00035 &&
      Math.abs(lng - skipTarget[1]) < 0.00035
    ) {
      skipMoveEndTargetRef.current = null;
      return;
    }
    skipMoveEndTargetRef.current = null;
    resolveCenterAddress(lat, lng);
  };

  const handleUseGPS = (closeSearchPanel = false) => {
    if (!navigator.geolocation) {
      setGpsError('Geolocalização não suportada neste navegador.');
      return;
    }
    setGpsError('');
    setIsGettingGps(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        skipMoveEndTargetRef.current = null;
        setMapCenter([lat, lng]);
        if (closeSearchPanel) {
          setIsSearchActive(false);
        }
        if (mapRef.current) {
          mapRef.current.flyTo([lat, lng], 17, { animate: true, duration: 0.9 });
        } else {
          setControlledCenter([lat, lng]);
        }
        resolveCenterAddress(lat, lng);
        setIsGettingGps(false);
      },
      (err) => {
        setIsGettingGps(false);
        if (err.code === err.PERMISSION_DENIED) {
          setGpsError('Permissão de GPS negada. Habilite a localização no navegador ou busque o endereço acima.');
        } else {
          setGpsError('Não foi possível obter seu GPS agora. Tente buscar pelo nome da rua.');
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 12000,
        maximumAge: 0,
      }
    );
  };

  const handleSearchChange = (text: string) => {
    setSearchQuery(text);
    setGpsError('');
    if (!isSearchActive) setIsSearchActive(true);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);

    const trimmed = text.trim();
    const reqId = ++searchReqIdRef.current;
    if (trimmed.length >= 2) {
      setIsSearching(true);
      searchTimeout.current = setTimeout(async () => {
        const res = await searchAddressGeocode(trimmed, mapCenter[0], mapCenter[1]);
        if (searchReqIdRef.current === reqId) {
          setSearchResults(res);
          setIsSearching(false);
        }
      }, 240);
    } else {
      setSearchResults([]);
      setIsSearching(false);
    }
  };

  const applyLocationToMap = (item: {
    display_name: string;
    lat: number;
    lng: number;
    reference?: string;
    complement?: string;
  }) => {
    if (reverseTimeout.current) clearTimeout(reverseTimeout.current);
    reverseReqIdRef.current++;
    skipMoveEndTargetRef.current = [item.lat, item.lng];
    setIsReverseGeocoding(false);

    if (mapRef.current) {
      mapRef.current.flyTo([item.lat, item.lng], 17, { animate: true, duration: 0.85 });
    } else {
      setControlledCenter([item.lat, item.lng]);
    }
    setMapCenter([item.lat, item.lng]);
    setAddress(item.display_name);
    if (item.reference) setReference(item.reference);
    if (item.complement) setComplement(item.complement);
    setSearchQuery('');
    setSearchResults([]);
    setIsSearchActive(false);
  };

  const handleConfirm = () => {
    if (!address.trim() || isReverseGeocoding) return;
    onSelect({
      address: address.trim(),
      lat: mapCenter[0],
      lng: mapCenter[1],
      reference: reference.trim() || undefined,
      complement: complement.trim() || undefined,
    });
    onClose();
  };

  const filteredRecent = recentDestinations.filter(
    (rec) => !savedAddresses.some((sav) => sav.address === rec.address)
  );

  const popularFallbacks = POPULAR_LOCAL_POINTS.slice(0, 5);

  return createPortal(
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 10080,
        backgroundColor: '#FFFFFF',
        display: 'flex',
        justifyContent: 'center',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 480,
          height: '100dvh',
          backgroundColor: '#FFFFFF',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          boxShadow: '0 0 40px rgba(15, 23, 42, 0.08)',
        }}
      >
        {/* ── HEADER CLEAN PROFISSIONAL ─────────────────────────────── */}
        <div
          style={{
            padding: 'calc(10px + env(safe-area-inset-top, 0px)) 16px 10px 16px',
            backgroundColor: '#FFFFFF',
            borderBottom: '1px solid #F1F5F9',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 10,
            flexShrink: 0,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
            <button
              type="button"
              onClick={() => {
                if (isSearchActive) {
                  setIsSearchActive(false);
                  searchInputRef.current?.blur();
                } else {
                  onClose();
                }
              }}
              aria-label={isSearchActive ? 'Voltar para o mapa' : 'Fechar seleção de endereço'}
              style={{
                width: 36,
                height: 36,
                borderRadius: '50%',
                border: '1px solid #E2E8F0',
                backgroundColor: '#F8FAFC',
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
              <h2
                style={{
                  margin: 0,
                  fontSize: '0.96rem',
                  fontWeight: 800,
                  color: '#0F172A',
                  lineHeight: 1.2,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {title}
              </h2>
              <p
                style={{
                  margin: '1px 0 0 0',
                  fontSize: '0.71rem',
                  fontWeight: 600,
                  color: '#64748B',
                }}
              >
                {isSearchActive
                  ? 'Digite rua, ponto de referência ou CEP'
                  : 'Busque acima ou arraste o mapa até o ponto exato'}
              </p>
            </div>
          </div>

          <img
            src="/logo-horizontal.png"
            alt="KAVRO"
            style={{ height: 20, objectFit: 'contain', opacity: 0.9, flexShrink: 0 }}
          />
        </div>

        {/* ── BARRA DE BUSCA PRINCIPAL SEMPRE VISÍVEL ───────────────── */}
        <div
          style={{
            padding: '10px 16px 12px 16px',
            backgroundColor: '#FFFFFF',
            borderBottom: '1px solid #E2E8F0',
            flexShrink: 0,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ position: 'relative', flex: 1 }}>
              <Search
                size={17}
                color={isSearchActive ? '#0F172A' : '#64748B'}
                style={{
                  position: 'absolute',
                  left: 13,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  pointerEvents: 'none',
                }}
              />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onFocus={() => setIsSearchActive(true)}
                onChange={(e) => handleSearchChange(e.target.value)}
                placeholder="Buscar rua, bairro, número ou CEP..."
                style={{
                  width: '100%',
                  height: 44,
                  padding: isSearching || searchQuery ? '0 38px 0 38px' : '0 14px 0 38px',
                  borderRadius: 12,
                  border: isSearchActive ? '1.5px solid #0F172A' : '1.5px solid #E2E8F0',
                  backgroundColor: isSearchActive ? '#FFFFFF' : '#F8FAFC',
                  color: '#0F172A',
                  fontSize: '16px',
                  fontWeight: 500,
                  boxSizing: 'border-box',
                  outline: 'none',
                  transition: 'border-color 0.15s ease, background-color 0.15s ease',
                }}
              />
              {isSearching && (
                <Loader2
                  size={16}
                  color="#65A30D"
                  className="animate-spin"
                  style={{
                    position: 'absolute',
                    right: 12,
                    top: '50%',
                    transform: 'translateY(-50%)',
                  }}
                />
              )}
              {!isSearching && searchQuery && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    setSearchResults([]);
                    searchInputRef.current?.focus();
                  }}
                  aria-label="Limpar busca"
                  style={{
                    position: 'absolute',
                    right: 10,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    width: 24,
                    height: 24,
                    borderRadius: '50%',
                    border: 'none',
                    backgroundColor: '#E2E8F0',
                    color: '#334155',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                  }}
                >
                  <X size={13} />
                </button>
              )}
            </div>

            {isSearchActive && (
              <button
                type="button"
                onClick={() => {
                  setIsSearchActive(false);
                  searchInputRef.current?.blur();
                }}
                style={{
                  height: 44,
                  padding: '0 12px',
                  borderRadius: 12,
                  border: '1px solid #E2E8F0',
                  backgroundColor: '#F8FAFC',
                  color: '#0F172A',
                  fontSize: '0.78rem',
                  fontWeight: 800,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5,
                  cursor: 'pointer',
                  flexShrink: 0,
                }}
              >
                <MapPin size={15} color="#65A30D" />
                <span>Mapa</span>
              </button>
            )}
          </div>

          {gpsError && (
            <div
              style={{
                marginTop: 8,
                padding: '8px 10px',
                borderRadius: 10,
                backgroundColor: '#FEF2F2',
                border: '1px solid #FECACA',
                color: '#B91C1C',
                fontSize: '0.74rem',
                fontWeight: 600,
              }}
            >
              {gpsError}
            </div>
          )}
        </div>

        {/* ── ÁREA PRINCIPAL (MAPA SEMPRE MONTADO + OVERLAY DE BUSCA) ─ */}
        <div
          style={{
            flex: 1,
            position: 'relative',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          {/* OVERLAY DE RESULTADOS E SUGESTÕES (QUANDO BUSCA ESTÁ ATIVA) */}
          {isSearchActive && (
            <div
              style={{
                position: 'absolute',
                inset: 0,
                zIndex: 1020,
                overflowY: 'auto',
                backgroundColor: '#FFFFFF',
                padding: '8px 0 24px 0',
              }}
            >
            {/* Resultados em tempo real da digitação */}
            {searchQuery.trim().length >= 2 && (
              <div>
                {isSearching && searchResults.length === 0 && (
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: '16px 20px',
                      color: '#64748B',
                      fontSize: '0.84rem',
                      fontWeight: 600,
                    }}
                  >
                    <Loader2 size={16} color="#65A30D" className="animate-spin" />
                    <span>Buscando endereços próximos...</span>
                  </div>
                )}

                {searchResults.map((item, idx) => {
                  const formatted = formatAddressHeadline(item.display_name);
                  return (
                    <button
                      key={`${item.lat}-${item.lng}-${idx}`}
                      type="button"
                      onClick={() => applyLocationToMap(item)}
                      style={{
                        width: '100%',
                        padding: '13px 18px',
                        border: 'none',
                        borderBottom: '1px solid #F1F5F9',
                        backgroundColor: '#FFFFFF',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12,
                        textAlign: 'left',
                        cursor: 'pointer',
                      }}
                    >
                      <div
                        style={{
                          width: 36,
                          height: 36,
                          borderRadius: '50%',
                          backgroundColor: '#F1F5F9',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                        }}
                      >
                        <MapPin size={17} color="#0F172A" />
                      </div>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div
                          style={{
                            fontSize: '0.88rem',
                            fontWeight: 700,
                            color: '#0F172A',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                        >
                          {formatted.primary}
                        </div>
                        {formatted.secondary && (
                          <div
                            style={{
                              fontSize: '0.75rem',
                              color: '#64748B',
                              marginTop: 2,
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                            }}
                          >
                            {formatted.secondary}
                          </div>
                        )}
                      </div>
                    </button>
                  );
                })}

                {!isSearching && searchResults.length === 0 && (
                  <div
                    style={{
                      margin: '16px',
                      padding: '18px 16px',
                      borderRadius: 14,
                      backgroundColor: '#F8FAFC',
                      border: '1px solid #E2E8F0',
                      textAlign: 'center',
                    }}
                  >
                    <div style={{ fontSize: '0.86rem', fontWeight: 700, color: '#0F172A' }}>
                      Nenhum endereço encontrado para "{searchQuery}"
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#64748B', marginTop: 4 }}>
                      Tente incluir cidade, CEP de 8 dígitos ou posicione o pino direto no mapa.
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setIsSearchActive(false);
                        searchInputRef.current?.blur();
                      }}
                      style={{
                        marginTop: 12,
                        padding: '8px 14px',
                        borderRadius: 10,
                        border: '1px solid #CBD5E1',
                        backgroundColor: '#FFFFFF',
                        color: '#0F172A',
                        fontSize: '0.78rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                    >
                      Ajustar no mapa
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Atalhos limpos quando a busca ainda está vazia */}
            {searchQuery.trim().length < 2 && (
              <div>
                {/* Ação 1: Usar GPS */}
                <button
                  type="button"
                  onClick={() => handleUseGPS(true)}
                  disabled={isGettingGps}
                  style={{
                    width: '100%',
                    padding: '13px 18px',
                    border: 'none',
                    borderBottom: '1px solid #F1F5F9',
                    backgroundColor: '#FFFFFF',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    textAlign: 'left',
                    cursor: isGettingGps ? 'wait' : 'pointer',
                  }}
                >
                  <div
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: '50%',
                      backgroundColor: '#ECFCCB',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    {isGettingGps ? (
                      <Loader2 size={17} color="#4D7C0F" className="animate-spin" />
                    ) : (
                      <LocateFixed size={17} color="#4D7C0F" />
                    )}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '0.88rem', fontWeight: 700, color: '#0F172A' }}>
                      Usar minha localização atual (GPS)
                    </div>
                    <div style={{ fontSize: '0.74rem', color: '#64748B', marginTop: 1 }}>
                      Centraliza o mapa automaticamente onde você está
                    </div>
                  </div>
                </button>

                {/* Ação 2: Definir diretamente no mapa */}
                <button
                  type="button"
                  onClick={() => {
                    setIsSearchActive(false);
                    searchInputRef.current?.blur();
                  }}
                  style={{
                    width: '100%',
                    padding: '13px 18px',
                    border: 'none',
                    borderBottom: '6px solid #F8FAFC',
                    backgroundColor: '#FFFFFF',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    textAlign: 'left',
                    cursor: 'pointer',
                  }}
                >
                  <div
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: '50%',
                      backgroundColor: '#F1F5F9',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    <MapPin size={17} color="#0F172A" />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '0.88rem', fontWeight: 700, color: '#0F172A' }}>
                      Definir localização no mapa
                    </div>
                    <div style={{ fontSize: '0.74rem', color: '#64748B', marginTop: 1 }}>
                      Arraste o mapa para marcar o local com precisão
                    </div>
                  </div>
                </button>

                {/* Locais salvos (Casa, Trabalho, etc.) */}
                {savedAddresses.length > 0 && (
                  <div style={{ paddingTop: 10 }}>
                    <div
                      style={{
                        padding: '4px 18px 6px 18px',
                        fontSize: '0.68rem',
                        fontWeight: 800,
                        color: '#94A3B8',
                        letterSpacing: '0.06em',
                        textTransform: 'uppercase',
                      }}
                    >
                      Locais salvos
                    </div>
                    {savedAddresses.map((sav) => {
                      const lblLower = sav.label.toLowerCase();
                      const IconComp = lblLower.includes('casa')
                        ? Home
                        : lblLower.includes('trabalho')
                          ? Briefcase
                          : Star;
                      return (
                        <button
                          key={sav.id}
                          type="button"
                          onClick={() =>
                            applyLocationToMap({
                              display_name: sav.address,
                              lat: sav.lat,
                              lng: sav.lng,
                              reference: sav.label,
                            })
                          }
                          style={{
                            width: '100%',
                            padding: '12px 18px',
                            border: 'none',
                            borderBottom: '1px solid #F1F5F9',
                            backgroundColor: '#FFFFFF',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 12,
                            textAlign: 'left',
                            cursor: 'pointer',
                          }}
                        >
                          <div
                            style={{
                              width: 36,
                              height: 36,
                              borderRadius: '50%',
                              backgroundColor: '#F1F5F9',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              flexShrink: 0,
                            }}
                          >
                            <IconComp size={16} color="#0F172A" />
                          </div>
                          <div style={{ minWidth: 0, flex: 1 }}>
                            <div style={{ fontSize: '0.86rem', fontWeight: 700, color: '#0F172A' }}>
                              {sav.label}
                            </div>
                            <div
                              style={{
                                fontSize: '0.74rem',
                                color: '#64748B',
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                              }}
                            >
                              {sav.address}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* Destinos recentes */}
                {filteredRecent.length > 0 && (
                  <div style={{ paddingTop: 10 }}>
                    <div
                      style={{
                        padding: '4px 18px 6px 18px',
                        fontSize: '0.68rem',
                        fontWeight: 800,
                        color: '#94A3B8',
                        letterSpacing: '0.06em',
                        textTransform: 'uppercase',
                      }}
                    >
                      Recentes
                    </div>
                    {filteredRecent.slice(0, 4).map((rec, idx) => {
                      const formatted = formatAddressHeadline(rec.address);
                      return (
                        <button
                          key={`${rec.address}-${idx}`}
                          type="button"
                          onClick={() =>
                            applyLocationToMap({
                              display_name: rec.address,
                              lat: rec.lat,
                              lng: rec.lng,
                              reference: rec.reference,
                              complement: rec.complement,
                            })
                          }
                          style={{
                            width: '100%',
                            padding: '12px 18px',
                            border: 'none',
                            borderBottom: '1px solid #F1F5F9',
                            backgroundColor: '#FFFFFF',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 12,
                            textAlign: 'left',
                            cursor: 'pointer',
                          }}
                        >
                          <div
                            style={{
                              width: 36,
                              height: 36,
                              borderRadius: '50%',
                              backgroundColor: '#F8FAFC',
                              border: '1px solid #E2E8F0',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              flexShrink: 0,
                            }}
                          >
                            <Clock size={16} color="#64748B" />
                          </div>
                          <div style={{ minWidth: 0, flex: 1 }}>
                            <div
                              style={{
                                fontSize: '0.86rem',
                                fontWeight: 700,
                                color: '#0F172A',
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                              }}
                            >
                              {formatted.primary}
                            </div>
                            {formatted.secondary && (
                              <div
                                style={{
                                  fontSize: '0.74rem',
                                  color: '#64748B',
                                  whiteSpace: 'nowrap',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                }}
                              >
                                {formatted.secondary}
                              </div>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* Pontos de referência da região */}
                <div style={{ paddingTop: 10 }}>
                  <div
                    style={{
                      padding: '4px 18px 6px 18px',
                      fontSize: '0.68rem',
                      fontWeight: 800,
                      color: '#94A3B8',
                      letterSpacing: '0.06em',
                      textTransform: 'uppercase',
                    }}
                  >
                    Locais próximos populares
                  </div>
                  {popularFallbacks.map((loc) => (
                    <button
                      key={loc.name}
                      type="button"
                      onClick={() =>
                        applyLocationToMap({
                          display_name: loc.name,
                          lat: loc.lat,
                          lng: loc.lng,
                        })
                      }
                      style={{
                        width: '100%',
                        padding: '12px 18px',
                        border: 'none',
                        borderBottom: '1px solid #F1F5F9',
                        backgroundColor: '#FFFFFF',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12,
                        textAlign: 'left',
                        cursor: 'pointer',
                      }}
                    >
                      <div
                        style={{
                          width: 36,
                          height: 36,
                          borderRadius: '50%',
                          backgroundColor: '#F1F5F9',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                        }}
                      >
                        <Navigation size={15} color="#475569" />
                      </div>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontSize: '0.86rem', fontWeight: 700, color: '#0F172A' }}>
                          {loc.name}
                        </div>
                        <div style={{ fontSize: '0.73rem', color: '#64748B' }}>{loc.subtitle}</div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
          )}

          {/* ── MAPA EM TELA CHEIA FLEXÍVEL ─────────────────────────── */}
          <div style={{ position: 'relative', flex: 1, minHeight: 220, backgroundColor: '#E2E8F0' }}>
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
                <MapMoveListener
                  onMove={handleMapMove}
                  onMoveStart={handleMapMoveStart}
                  onMoveEnd={handleMapMoveEnd}
                />
                <MapRefCapture
                  mapRef={mapRef}
                  layoutKey={`${isOpen}-${showDetails}-${isSearchActive}`}
                />
              </MapContainer>

              {/* Toggle limpo Satélite / Mapa (sem emojis) */}
              <button
                type="button"
                onClick={() => setMapLayer((prev) => (prev === 'streets' ? 'hybrid' : 'streets'))}
                style={{
                  position: 'absolute',
                  top: 12,
                  right: 12,
                  zIndex: 1001,
                  backgroundColor: mapLayer === 'hybrid' ? '#0F172A' : '#FFFFFF',
                  color: mapLayer === 'hybrid' ? '#FFFFFF' : '#0F172A',
                  border: mapLayer === 'hybrid' ? '1px solid #0F172A' : '1px solid #E2E8F0',
                  borderRadius: 999,
                  padding: '7px 12px',
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  boxShadow: '0 4px 12px rgba(15, 23, 42, 0.12)',
                  cursor: 'pointer',
                }}
              >
                {mapLayer === 'streets' ? (
                  <>
                    <Layers size={14} color="#0F172A" />
                    <span>Satélite</span>
                  </>
                ) : (
                  <>
                    <MapIcon size={14} color="#76D800" />
                    <span>Mapa</span>
                  </>
                )}
              </button>

              {/* Pin central limpo estilo Kavro / Uber */}
              <div
                style={{
                  position: 'absolute',
                  top: '50%',
                  left: '50%',
                  transform: isPanning
                    ? 'translate(-50%, calc(-100% - 8px)) scale(1.04)'
                    : 'translate(-50%, -100%)',
                  transition: 'transform 0.14s ease',
                  zIndex: 1000,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  pointerEvents: 'none',
                }}
              >
                <div
                  style={{
                    width: 42,
                    height: 42,
                    borderRadius: '50% 50% 50% 0',
                    backgroundColor: '#0F172A',
                    transform: 'rotate(-45deg)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: '0 8px 18px rgba(15, 23, 42, 0.34)',
                    border: '2px solid #FFFFFF',
                  }}
                >
                  <div style={{ transform: 'rotate(45deg)' }}>
                    <MapPin size={19} color="#76D800" strokeWidth={2.4} />
                  </div>
                </div>
                <div
                  style={{
                    width: isPanning ? 14 : 10,
                    height: 5,
                    backgroundColor: 'rgba(15, 23, 42, 0.28)',
                    borderRadius: '50%',
                    marginTop: 4,
                    filter: 'blur(1.5px)',
                    transition: 'width 0.14s ease',
                  }}
                />
              </div>

              {/* Botão GPS limpo flutuante */}
              <button
                type="button"
                onClick={() => handleUseGPS(false)}
                disabled={isGettingGps}
                aria-label="Usar minha localização GPS"
                style={{
                  position: 'absolute',
                  bottom: 14,
                  right: 14,
                  zIndex: 1001,
                  backgroundColor: '#FFFFFF',
                  border: '1px solid #E2E8F0',
                  borderRadius: '50%',
                  width: 44,
                  height: 44,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: '0 4px 14px rgba(15, 23, 42, 0.16)',
                  cursor: isGettingGps ? 'wait' : 'pointer',
                }}
              >
                {isGettingGps ? (
                  <Loader2 size={19} color="#65A30D" className="animate-spin" />
                ) : (
                  <LocateFixed size={19} color="#0F172A" />
                )}
              </button>
            </div>

            {/* ── RODAPÉ CLEAN DE CONFIRMAÇÃO ─────────────────────────── */}
            <div
              style={{
                backgroundColor: '#FFFFFF',
                borderTop: '1px solid #E2E8F0',
                padding: '14px 16px calc(16px + env(safe-area-inset-bottom, 0px)) 16px',
                boxShadow: '0 -6px 20px rgba(15, 23, 42, 0.05)',
                flexShrink: 0,
              }}
            >
              {/* Endereço resolvido */}
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 11 }}>
                <div
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: 10,
                    backgroundColor: '#ECFCCB',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    marginTop: 2,
                  }}
                >
                  <MapPin size={17} color="#4D7C0F" />
                </div>

                <div style={{ minWidth: 0, flex: 1 }}>
                  <div
                    style={{
                      fontSize: '0.67rem',
                      fontWeight: 800,
                      color: '#64748B',
                      letterSpacing: '0.05em',
                      textTransform: 'uppercase',
                    }}
                  >
                    Ponto selecionado no mapa
                  </div>

                  {isReverseGeocoding ? (
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 7,
                        marginTop: 4,
                      }}
                    >
                      <Loader2 size={15} color="#65A30D" className="animate-spin" />
                      <span style={{ fontSize: '0.92rem', fontWeight: 600, color: '#64748B' }}>
                        Identificando endereço exato...
                      </span>
                    </div>
                  ) : (
                    <>
                      <div
                        style={{
                          fontSize: '0.96rem',
                          fontWeight: 800,
                          color: '#0F172A',
                          lineHeight: 1.28,
                          marginTop: 2,
                        }}
                      >
                        {addressHeadline.primary || 'Arraste o mapa para posicionar o pino'}
                      </div>
                      {addressHeadline.secondary && (
                        <div
                          style={{
                            fontSize: '0.76rem',
                            color: '#64748B',
                            marginTop: 2,
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                        >
                          {addressHeadline.secondary}
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>

              {/* Complemento e Referência discreto e limpo */}
              <div style={{ marginTop: 10 }}>
                <button
                  type="button"
                  onClick={() => setShowDetails((prev) => !prev)}
                  style={{
                    background: 'none',
                    border: 'none',
                    padding: '4px 0',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    cursor: 'pointer',
                    fontSize: '0.76rem',
                    fontWeight: 700,
                    color: '#475569',
                  }}
                >
                  <Plus size={14} color="#65A30D" />
                  <span>Complemento ou referência (opcional)</span>
                  <ChevronDown
                    size={14}
                    style={{
                      transform: showDetails ? 'rotate(180deg)' : 'none',
                      transition: 'transform 0.18s ease',
                    }}
                  />
                </button>

                {showDetails && (
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 1fr',
                      gap: 8,
                      marginTop: 8,
                    }}
                  >
                    <input
                      type="text"
                      placeholder="Complemento (Apto, Casa)"
                      value={complement}
                      onChange={(e) => setComplement(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '9px 11px',
                        borderRadius: 10,
                        border: '1px solid #CBD5E1',
                        backgroundColor: '#F8FAFC',
                        fontSize: '16px',
                        color: '#0F172A',
                        boxSizing: 'border-box',
                        outline: 'none',
                      }}
                    />
                    <input
                      type="text"
                      placeholder="Ponto de referência"
                      value={reference}
                      onChange={(e) => setReference(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '9px 11px',
                        borderRadius: 10,
                        border: '1px solid #CBD5E1',
                        backgroundColor: '#F8FAFC',
                        fontSize: '16px',
                        color: '#0F172A',
                        boxSizing: 'border-box',
                        outline: 'none',
                      }}
                    />
                  </div>
                )}
              </div>

              {/* Botão Confirmar limpo em destaque */}
              <button
                type="button"
                onClick={handleConfirm}
                disabled={!address.trim() || isReverseGeocoding}
                style={{
                  marginTop: 12,
                  width: '100%',
                  height: 48,
                  borderRadius: 12,
                  border: 'none',
                  backgroundColor: address.trim() && !isReverseGeocoding ? '#0F172A' : '#E2E8F0',
                  color: address.trim() && !isReverseGeocoding ? '#FFFFFF' : '#94A3B8',
                  fontSize: '0.94rem',
                  fontWeight: 800,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  cursor: address.trim() && !isReverseGeocoding ? 'pointer' : 'not-allowed',
                  boxShadow:
                    address.trim() && !isReverseGeocoding
                      ? '0 8px 20px rgba(15, 23, 42, 0.16)'
                      : 'none',
                  transition: 'background-color 0.15s ease, color 0.15s ease',
                }}
              >
                {isReverseGeocoding ? (
                  <>
                    <Loader2 size={17} className="animate-spin" />
                    <span>Carregando endereço...</span>
                  </>
                ) : (
                  <>
                    <Check size={18} color="#76D800" strokeWidth={2.6} />
                    <span>Confirmar local</span>
                  </>
                )}
              </button>
            </div>
        </div>
      </div>
    </div>,
    document.body
  );
};
