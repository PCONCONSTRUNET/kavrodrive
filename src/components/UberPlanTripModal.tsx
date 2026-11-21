import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowUpDown,
  Calendar,
  ChevronDown,
  Clock,
  Globe,
  Luggage,
  MapPin,
  Navigation,
  Search,
  User,
  Users,
  X,
} from 'lucide-react';
import { ClientProfile, LocationPoint, ServiceCategoryType } from '../types';
import {
  calculateHaversineDistance,
  POPULAR_LOCAL_POINTS,
  reverseGeocode,
  searchAddressGeocode,
} from '../utils/geo';
import { StorageService } from '../services/storage';

interface UberPlanTripModalProps {
  isOpen: boolean;
  origin: LocationPoint | null;
  destination: LocationPoint | null;
  serviceMode: ServiceCategoryType;
  currentUser?: ClientProfile | null;
  scheduleMode: 'now' | 'later';
  scheduledDate: string;
  scheduledTime: string;
  passengers: number;
  hasLuggage: boolean;
  notes: string;
  onBack: () => void;
  onChangeSchedule: (mode: 'now' | 'later', date: string, time: string) => void;
  onChangePassengers: (count: number, luggage: boolean, notes: string) => void;
  onOpenMapPicker: (field: 'origin' | 'destination') => void;
  onSelectOrigin: (pt: LocationPoint | null) => void;
  onSwapOriginDest: () => void;
  onCompleteRoute: (orig: LocationPoint, dest: LocationPoint) => void;
}

interface SearchSuggestionItem {
  key: string;
  title: string;
  subtitle: string;
  point: LocationPoint;
  distanceKm?: number;
  kind: 'recent' | 'saved' | 'search' | 'popular';
}

function splitPlaceHeadline(raw: string): { title: string; subtitle: string } {
  const clean = String(raw || '').trim();
  if (!clean) return { title: '', subtitle: '' };
  const commaIdx = clean.indexOf(',');
  if (commaIdx <= 0) return { title: clean, subtitle: '' };
  return {
    title: clean.slice(0, commaIdx).trim(),
    subtitle: clean.slice(commaIdx + 1).trim(),
  };
}

export const UberPlanTripModal: React.FC<UberPlanTripModalProps> = ({
  isOpen,
  origin,
  destination,
  serviceMode,
  currentUser,
  scheduleMode,
  scheduledDate,
  scheduledTime,
  passengers,
  hasLuggage,
  notes,
  onBack,
  onChangeSchedule,
  onChangePassengers,
  onOpenMapPicker,
  onSelectOrigin,
  onSwapOriginDest,
  onCompleteRoute,
}) => {
  const [activeField, setActiveField] = useState<'origin' | 'destination'>(() =>
    origin && !destination ? 'destination' : !origin ? 'origin' : 'destination'
  );
  const [originInput, setOriginInput] = useState<string>(origin?.address || '');
  const [destInput, setDestInput] = useState<string>(destination?.address || '');

  const [showSchedulePopover, setShowSchedulePopover] = useState<boolean>(false);
  const [showPassengerPopover, setShowPassengerPopover] = useState<boolean>(false);
  const [draftDate, setDraftDate] = useState<string>(scheduledDate);
  const [draftTime, setDraftTime] = useState<string>(scheduledTime);

  const [results, setResults] = useState<Array<{ display_name: string; lat: number; lng: number }>>([]);
  const [isSearching, setIsSearching] = useState<boolean>(false);
  const [isLocatingGps, setIsLocatingGps] = useState<boolean>(false);
  const [gpsNotice, setGpsNotice] = useState<string>('');

  const originRef = useRef<HTMLInputElement | null>(null);
  const destRef = useRef<HTMLInputElement | null>(null);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchReqIdRef = useRef<number>(0);

  useEffect(() => {
    setOriginInput(origin?.address || '');
  }, [origin?.address]);

  useEffect(() => {
    setDestInput(destination?.address || '');
  }, [destination?.address]);

  useEffect(() => {
    setDraftDate(scheduledDate);
    setDraftTime(scheduledTime);
  }, [scheduledDate, scheduledTime]);

  useEffect(() => {
    if (!isOpen) return;
    setResults([]);
    setIsSearching(false);
    setGpsNotice('');
    setShowSchedulePopover(false);
    setShowPassengerPopover(false);

    const timer = setTimeout(() => {
      if (!origin) {
        setActiveField('origin');
        originRef.current?.focus();
      } else {
        setActiveField('destination');
        destRef.current?.focus();
      }
    }, 80);
    return () => clearTimeout(timer);
  }, [isOpen]);

  const recentDestinations = useMemo(
    () => (isOpen ? StorageService.getRecentDestinations() : []),
    [isOpen]
  );
  const savedAddresses = useMemo(
    () => (Array.isArray(currentUser?.savedAddresses) ? currentUser.savedAddresses : []),
    [currentUser?.savedAddresses]
  );

  const activeQuery = activeField === 'origin' ? originInput : destInput;

  const runSearch = (query: string) => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    const trimmed = query.trim();
    const currentSelectedText = activeField === 'origin' ? origin?.address : destination?.address;
    if (trimmed.length < 2 || trimmed === currentSelectedText) {
      setResults([]);
      setIsSearching(false);
      return;
    }

    const reqId = ++searchReqIdRef.current;
    setIsSearching(true);
    searchTimerRef.current = setTimeout(async () => {
      try {
        const res = await searchAddressGeocode(trimmed, origin?.lat, origin?.lng);
        if (searchReqIdRef.current === reqId) {
          setResults(res);
          setIsSearching(false);
        }
      } catch {
        if (searchReqIdRef.current === reqId) {
          setResults([]);
          setIsSearching(false);
        }
      }
    }, 240);
  };

  const handleFieldChange = (field: 'origin' | 'destination', value: string) => {
    setActiveField(field);
    setGpsNotice('');
    if (field === 'origin') {
      setOriginInput(value);
    } else {
      setDestInput(value);
    }
    runSearch(value);
  };

  const handleUseCurrentGps = () => {
    if (!navigator.geolocation) {
      onOpenMapPicker('origin');
      return;
    }
    setIsLocatingGps(true);
    setGpsNotice('');
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        let addr = 'Minha localização atual (GPS)';
        try {
          const rev = await reverseGeocode(lat, lng);
          if (rev) addr = rev;
        } catch {
          // Mantém fallback GPS
        }
        const pt: LocationPoint = { address: addr, lat, lng };
        onSelectOrigin(pt);
        setOriginInput(addr);
        setIsLocatingGps(false);
        setResults([]);
        if (!destination) {
          setActiveField('destination');
          setTimeout(() => destRef.current?.focus(), 60);
        }
      },
      () => {
        setIsLocatingGps(false);
        setGpsNotice('Não foi possível obter seu GPS agora. Busque o endereço ou marque no mapa.');
      },
      { enableHighAccuracy: true, timeout: 9000 }
    );
  };

  const handleSelectSuggestion = (point: LocationPoint) => {
    setResults([]);
    setIsSearching(false);
    if (activeField === 'origin') {
      onSelectOrigin(point);
      setOriginInput(point.address);
      if (destination) {
        onCompleteRoute(point, destination);
      } else {
        setActiveField('destination');
        setTimeout(() => destRef.current?.focus(), 60);
      }
      return;
    }

    StorageService.addRecentDestination(point);
    setDestInput(point.address);

    if (origin) {
      onCompleteRoute(origin, point);
    } else {
      const fallbackOrigin: LocationPoint = {
        address: 'Minha localização atual (GPS)',
        lat: -28.3878,
        lng: -49.3977,
      };
      onSelectOrigin(fallbackOrigin);
      onCompleteRoute(fallbackOrigin, point);
    }
  };

  const suggestionList = useMemo<SearchSuggestionItem[]>(() => {
    const computeDist = (lat: number, lng: number): number | undefined => {
      if (!origin || !Number.isFinite(origin.lat) || !Number.isFinite(origin.lng)) return undefined;
      return calculateHaversineDistance(origin.lat, origin.lng, lat, lng);
    };

    if (results.length > 0) {
      return results.map((r, idx) => {
        const { title, subtitle } = splitPlaceHeadline(r.display_name);
        return {
          key: `search-${idx}-${r.lat}-${r.lng}`,
          title: title || r.display_name,
          subtitle: subtitle || r.display_name,
          distanceKm: computeDist(r.lat, r.lng),
          point: { address: r.display_name, lat: r.lat, lng: r.lng },
          kind: 'search',
        };
      });
    }

    const items: SearchSuggestionItem[] = [];
    const normalizedFilter = activeQuery.trim().toLowerCase();

    savedAddresses.forEach((sa) => {
      if (
        normalizedFilter.length >= 2 &&
        !sa.label.toLowerCase().includes(normalizedFilter) &&
        !sa.address.toLowerCase().includes(normalizedFilter)
      ) {
        return;
      }
      items.push({
        key: `saved-${sa.id}`,
        title: sa.label,
        subtitle: sa.address,
        distanceKm: computeDist(sa.lat, sa.lng),
        point: { address: sa.address, lat: sa.lat, lng: sa.lng, reference: sa.label },
        kind: 'saved',
      });
    });

    recentDestinations.slice(0, 5).forEach((rec, idx) => {
      if (
        normalizedFilter.length >= 2 &&
        !rec.address.toLowerCase().includes(normalizedFilter) &&
        !(rec.reference || '').toLowerCase().includes(normalizedFilter)
      ) {
        return;
      }
      const { title, subtitle } = splitPlaceHeadline(rec.address);
      items.push({
        key: `recent-${idx}-${rec.address}`,
        title: rec.reference || title || rec.address,
        subtitle: subtitle || rec.address,
        distanceKm: computeDist(rec.lat, rec.lng),
        point: rec,
        kind: 'recent',
      });
    });

    if (items.length < 5) {
      POPULAR_LOCAL_POINTS.slice(0, 6).forEach((p, idx) => {
        if (items.some((it) => it.point.address === p.name)) return;
        items.push({
          key: `pop-${idx}`,
          title: p.name,
          subtitle: p.subtitle,
          distanceKm: computeDist(p.lat, p.lng),
          point: { address: p.name, lat: p.lat, lng: p.lng },
          kind: 'popular',
        });
      });
    }

    return items;
  }, [results, savedAddresses, recentDestinations, activeQuery, origin]);

  const schedulePillLabel = useMemo(() => {
    if (scheduleMode !== 'later' || !scheduledDate || !scheduledTime) return 'Ir agora';
    const [, m, d] = scheduledDate.split('-');
    return `${d}/${m} • ${scheduledTime}`;
  }, [scheduleMode, scheduledDate, scheduledTime]);

  if (!isOpen) return null;

  return (
    <div
      className="animate-fade-in"
      style={{
        position: 'fixed',
        inset: 0,
        maxWidth: 480,
        margin: '0 auto',
        backgroundColor: '#FFFFFF',
        zIndex: 90,
        display: 'flex',
        flexDirection: 'column',
        color: '#0F172A',
        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
      }}
    >
      {/* ── TOPO CLEAN ESTILO UBER ("Planeje sua próxima viagem") ── */}
      <div
        style={{
          padding: 'calc(14px + env(safe-area-inset-top, 0px)) 16px 12px 16px',
          borderBottom: '1px solid #F1F5F9',
          backgroundColor: '#FFFFFF',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
          <button
            type="button"
            onClick={onBack}
            aria-label="Voltar"
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
            <ArrowLeft size={19} />
          </button>

          <h1
            style={{
              margin: 0,
              fontSize: '1.18rem',
              fontWeight: 900,
              color: '#0F172A',
              letterSpacing: '-0.02em',
            }}
          >
            {serviceMode === 'entregas' ? 'Planeje sua entrega' : 'Planeje sua próxima viagem'}
          </h1>
        </div>

        {/* Pílulas "Ir agora" e "Para mim" */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
          <button
            type="button"
            onClick={() => {
              setShowSchedulePopover((v) => !v);
              setShowPassengerPopover(false);
            }}
            style={{
              height: 34,
              padding: '0 12px',
              borderRadius: 999,
              border: scheduleMode === 'later' ? '1.5px solid #16A34A' : '1px solid #E2E8F0',
              backgroundColor: scheduleMode === 'later' ? '#F0FDF4' : '#F1F5F9',
              color: scheduleMode === 'later' ? '#15803D' : '#0F172A',
              fontSize: '0.8rem',
              fontWeight: 700,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              cursor: 'pointer',
            }}
          >
            {scheduleMode === 'later' ? <Calendar size={14} /> : <Clock size={14} />}
            <span>{schedulePillLabel}</span>
            <ChevronDown size={14} />
          </button>

          <button
            type="button"
            onClick={() => {
              setShowPassengerPopover((v) => !v);
              setShowSchedulePopover(false);
            }}
            style={{
              height: 34,
              padding: '0 12px',
              borderRadius: 999,
              border: '1px solid #E2E8F0',
              backgroundColor: '#F1F5F9',
              color: '#0F172A',
              fontSize: '0.8rem',
              fontWeight: 700,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              cursor: 'pointer',
            }}
          >
            <User size={14} />
            <span>
              {passengers === 1 ? 'Para mim' : `${passengers} passageiros`}
              {hasLuggage ? ' • Malas' : ''}
            </span>
            <ChevronDown size={14} />
          </button>
        </div>

        {/* Popover inline de Agendar Horário */}
        {showSchedulePopover && (
          <div
            style={{
              backgroundColor: '#F8FAFC',
              border: '1px solid #E2E8F0',
              borderRadius: 14,
              padding: 12,
              marginBottom: 12,
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
            }}
          >
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <button
                type="button"
                onClick={() => {
                  onChangeSchedule('now', draftDate, draftTime);
                  setShowSchedulePopover(false);
                }}
                style={{
                  height: 36,
                  borderRadius: 10,
                  border: scheduleMode === 'now' ? '2px solid #0F172A' : '1px solid #CBD5E1',
                  backgroundColor: scheduleMode === 'now' ? '#0F172A' : '#FFFFFF',
                  color: scheduleMode === 'now' ? '#FFFFFF' : '#0F172A',
                  fontSize: '0.8rem',
                  fontWeight: 800,
                  cursor: 'pointer',
                }}
              >
                Ir agora
              </button>
              <button
                type="button"
                onClick={() => onChangeSchedule('later', draftDate, draftTime)}
                style={{
                  height: 36,
                  borderRadius: 10,
                  border: scheduleMode === 'later' ? '2px solid #16A34A' : '1px solid #CBD5E1',
                  backgroundColor: scheduleMode === 'later' ? '#16A34A' : '#FFFFFF',
                  color: scheduleMode === 'later' ? '#FFFFFF' : '#0F172A',
                  fontSize: '0.8rem',
                  fontWeight: 800,
                  cursor: 'pointer',
                }}
              >
                Agendar horário
              </button>
            </div>

            {scheduleMode === 'later' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  type="date"
                  value={draftDate}
                  onChange={(e) => setDraftDate(e.target.value)}
                  style={{
                    flex: 1,
                    height: 38,
                    padding: '0 10px',
                    borderRadius: 10,
                    border: '1px solid #CBD5E1',
                    backgroundColor: '#FFFFFF',
                    fontSize: '0.82rem',
                    fontWeight: 700,
                  }}
                />
                <input
                  type="time"
                  value={draftTime}
                  onChange={(e) => setDraftTime(e.target.value)}
                  style={{
                    width: 105,
                    height: 38,
                    padding: '0 10px',
                    borderRadius: 10,
                    border: '1px solid #CBD5E1',
                    backgroundColor: '#FFFFFF',
                    fontSize: '0.82rem',
                    fontWeight: 700,
                  }}
                />
                <button
                  type="button"
                  onClick={() => {
                    onChangeSchedule('later', draftDate, draftTime);
                    setShowSchedulePopover(false);
                  }}
                  style={{
                    height: 38,
                    padding: '0 14px',
                    borderRadius: 10,
                    border: 'none',
                    backgroundColor: '#0F172A',
                    color: '#76D800',
                    fontSize: '0.8rem',
                    fontWeight: 800,
                    cursor: 'pointer',
                  }}
                >
                  OK
                </button>
              </div>
            )}
          </div>
        )}

        {/* Popover inline de Passageiros / Malas */}
        {showPassengerPopover && (
          <div
            style={{
              backgroundColor: '#F8FAFC',
              border: '1px solid #E2E8F0',
              borderRadius: 14,
              padding: 12,
              marginBottom: 12,
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Users size={15} color="#475569" />
                {[1, 2, 3, 4].map((num) => (
                  <button
                    key={num}
                    type="button"
                    onClick={() => onChangePassengers(num, hasLuggage, notes)}
                    style={{
                      width: 30,
                      height: 30,
                      borderRadius: 9,
                      border: passengers === num ? '2px solid #0F172A' : '1px solid #CBD5E1',
                      backgroundColor: passengers === num ? '#0F172A' : '#FFFFFF',
                      color: passengers === num ? '#FFFFFF' : '#0F172A',
                      fontSize: '0.8rem',
                      fontWeight: 800,
                      cursor: 'pointer',
                    }}
                  >
                    {num}
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={() => onChangePassengers(passengers, !hasLuggage, notes)}
                style={{
                  height: 30,
                  padding: '0 10px',
                  borderRadius: 9,
                  border: hasLuggage ? '1.5px solid #0F172A' : '1px solid #CBD5E1',
                  backgroundColor: hasLuggage ? '#0F172A' : '#FFFFFF',
                  color: hasLuggage ? '#FFFFFF' : '#334155',
                  fontSize: '0.76rem',
                  fontWeight: 700,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                  cursor: 'pointer',
                }}
              >
                <Luggage size={14} />
                <span>Malas</span>
              </button>
            </div>

            <input
              type="text"
              placeholder="Observação para o motorista (opcional)..."
              value={notes}
              onChange={(e) => onChangePassengers(passengers, hasLuggage, e.target.value)}
              style={{
                width: '100%',
                height: 38,
                padding: '0 12px',
                borderRadius: 10,
                border: '1px solid #CBD5E1',
                backgroundColor: '#FFFFFF',
                fontSize: '0.82rem',
                boxSizing: 'border-box',
              }}
            />
          </div>
        )}

        {/* ── CAIXA CONECTADA DE ORIGEM E DESTINO (EXATO FORMATO UBER) ── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div
            style={{
              flex: 1,
              minWidth: 0,
              border: '2px solid #0F172A',
              borderRadius: 16,
              backgroundColor: '#F8FAFC',
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            {/* Linha vertical conectando bolinha ao quadrado */}
            <div
              style={{
                position: 'absolute',
                left: 19,
                top: 25,
                bottom: 25,
                width: 1.5,
                backgroundColor: '#0F172A',
                pointerEvents: 'none',
                zIndex: 2,
              }}
            />

            {/* Campo Origem */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                height: 46,
                paddingLeft: 38,
                paddingRight: 8,
                backgroundColor: activeField === 'origin' ? '#FFFFFF' : 'transparent',
                borderBottom: '1px solid #E2E8F0',
                position: 'relative',
              }}
            >
              <span
                style={{
                  position: 'absolute',
                  left: 14,
                  width: 11,
                  height: 11,
                  borderRadius: '50%',
                  border: '3px solid #16A34A',
                  backgroundColor: '#FFFFFF',
                  boxSizing: 'border-box',
                  zIndex: 3,
                }}
              />
              <input
                ref={originRef}
                type="text"
                value={originInput}
                onFocus={() => {
                  setActiveField('origin');
                  setResults([]);
                }}
                onChange={(e) => handleFieldChange('origin', e.target.value)}
                placeholder="Ponto de partida..."
                style={{
                  flex: 1,
                  minWidth: 0,
                  border: 'none',
                  backgroundColor: 'transparent',
                  color: '#0F172A',
                  fontSize: '0.88rem',
                  fontWeight: 600,
                  outline: 'none',
                }}
              />
              {originInput ? (
                <button
                  type="button"
                  aria-label="Limpar origem"
                  onClick={() => {
                    onSelectOrigin(null);
                    setOriginInput('');
                    setActiveField('origin');
                    setResults([]);
                    originRef.current?.focus();
                  }}
                  style={{
                    width: 26,
                    height: 26,
                    borderRadius: '50%',
                    backgroundColor: '#E2E8F0',
                    color: '#475569',
                    border: 'none',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    flexShrink: 0,
                  }}
                >
                  <X size={13} />
                </button>
              ) : (
                <button
                  type="button"
                  title="Usar localização atual (GPS)"
                  onClick={handleUseCurrentGps}
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: '50%',
                    backgroundColor: '#FFFFFF',
                    color: '#16A34A',
                    border: '1px solid #CBD5E1',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    flexShrink: 0,
                    opacity: isLocatingGps ? 0.5 : 1,
                  }}
                >
                  <Navigation size={13} />
                </button>
              )}
            </div>

            {/* Campo Destino */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                height: 46,
                paddingLeft: 38,
                paddingRight: 8,
                backgroundColor: activeField === 'destination' ? '#FFFFFF' : 'transparent',
                position: 'relative',
              }}
            >
              <span
                style={{
                  position: 'absolute',
                  left: 14,
                  width: 11,
                  height: 11,
                  borderRadius: 2,
                  border: '3px solid #0F172A',
                  backgroundColor: '#FFFFFF',
                  boxSizing: 'border-box',
                  zIndex: 3,
                }}
              />
              <input
                ref={destRef}
                type="text"
                value={destInput}
                onFocus={() => {
                  setActiveField('destination');
                  setResults([]);
                }}
                onChange={(e) => handleFieldChange('destination', e.target.value)}
                placeholder={serviceMode === 'entregas' ? 'Endereço de entrega?' : 'Para onde?'}
                style={{
                  flex: 1,
                  minWidth: 0,
                  border: 'none',
                  backgroundColor: 'transparent',
                  color: '#0F172A',
                  fontSize: '0.9rem',
                  fontWeight: 700,
                  outline: 'none',
                }}
              />
              {destInput && (
                <button
                  type="button"
                  aria-label="Limpar destino"
                  onClick={() => {
                    setDestInput('');
                    setActiveField('destination');
                    setResults([]);
                    destRef.current?.focus();
                  }}
                  style={{
                    width: 26,
                    height: 26,
                    borderRadius: '50%',
                    backgroundColor: '#E2E8F0',
                    color: '#475569',
                    border: 'none',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    flexShrink: 0,
                  }}
                >
                  <X size={13} />
                </button>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={onSwapOriginDest}
            title="Inverter origem e destino"
            aria-label="Inverter origem e destino"
            style={{
              width: 38,
              height: 38,
              borderRadius: '50%',
              backgroundColor: '#F1F5F9',
              border: '1px solid #E2E8F0',
              color: '#0F172A',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              flexShrink: 0,
            }}
          >
            <ArrowUpDown size={16} />
          </button>
        </div>

        {gpsNotice && (
          <div style={{ marginTop: 8, fontSize: '0.75rem', fontWeight: 700, color: '#DC2626' }}>
            {gpsNotice}
          </div>
        )}
      </div>

      {/* ── LISTA DE SUGESTÕES E RESULTADOS EM TEMPO REAL ── */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          WebkitOverflowScrolling: 'touch',
          padding: '6px 16px calc(24px + env(safe-area-inset-bottom, 0px)) 16px',
        }}
      >
        {activeField === 'origin' && (
          <button
            type="button"
            onClick={handleUseCurrentGps}
            disabled={isLocatingGps}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '12px 4px',
              background: 'none',
              border: 'none',
              borderBottom: '1px solid #F1F5F9',
              textAlign: 'left',
              cursor: 'pointer',
            }}
          >
            <div
              style={{
                width: 38,
                height: 38,
                borderRadius: '50%',
                backgroundColor: '#DCFCE7',
                color: '#15803D',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <Navigation size={16} />
            </div>
            <div>
              <div style={{ fontSize: '0.9rem', fontWeight: 800, color: '#0F172A' }}>
                {isLocatingGps ? 'Obtendo localização atual...' : 'Usar minha localização atual (GPS)'}
              </div>
              <div style={{ fontSize: '0.75rem', color: '#64748B' }}>
                Detectar automaticamente onde você está agora
              </div>
            </div>
          </button>
        )}

        {isSearching && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '12px 4px',
              color: '#64748B',
              fontSize: '0.82rem',
              fontWeight: 600,
            }}
          >
            <Search size={15} />
            <span>Buscando endereços e locais...</span>
          </div>
        )}

        {suggestionList.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => handleSelectSuggestion(item.point)}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '12px 4px',
              background: 'none',
              border: 'none',
              borderBottom: '1px solid #F1F5F9',
              textAlign: 'left',
              cursor: 'pointer',
            }}
          >
            <div
              style={{
                width: 38,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                gap: 2,
              }}
            >
              <div
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: '50%',
                  backgroundColor: '#F1F5F9',
                  color: '#0F172A',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {item.kind === 'recent' ? (
                  <Clock size={15} />
                ) : (
                  <MapPin size={15} />
                )}
              </div>
              {typeof item.distanceKm === 'number' && Number.isFinite(item.distanceKm) && (
                <span style={{ fontSize: '0.66rem', fontWeight: 700, color: '#64748B', whiteSpace: 'nowrap' }}>
                  {item.distanceKm >= 10 ? `${Math.round(item.distanceKm)} km` : `${item.distanceKm.toFixed(1)} km`}
                </span>
              )}
            </div>

            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontSize: '0.92rem',
                  fontWeight: 800,
                  color: '#0F172A',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {item.title}
              </div>
              <div
                style={{
                  fontSize: '0.77rem',
                  color: '#64748B',
                  marginTop: 2,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {item.subtitle}
              </div>
            </div>
          </button>
        ))}

        {/* Opções fixas estilo Uber (Cidade diferente + Mapa) */}
        <button
          type="button"
          onClick={() => {
            if (activeField === 'origin') {
              setOriginInput('');
              originRef.current?.focus();
            } else {
              setDestInput('');
              destRef.current?.focus();
            }
          }}
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '13px 4px',
            background: 'none',
            border: 'none',
            borderBottom: '1px solid #F1F5F9',
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
              color: '#0F172A',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <Globe size={16} />
          </div>
          <span style={{ fontSize: '0.9rem', fontWeight: 700, color: '#0F172A' }}>
            Pesquisar em uma cidade diferente
          </span>
        </button>

        <button
          type="button"
          onClick={() => onOpenMapPicker(activeField)}
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '13px 4px',
            background: 'none',
            border: 'none',
            borderBottom: '1px solid #F1F5F9',
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
              color: '#0F172A',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <MapPin size={16} />
          </div>
          <span style={{ fontSize: '0.9rem', fontWeight: 700, color: '#0F172A' }}>
            Defina a localização no mapa
          </span>
        </button>
      </div>

      {/* Botão flutuante para confirmar se ambos já estiverem preenchidos durante edição */}
      {origin && destination && (
        <div
          style={{
            padding: '10px 16px calc(14px + env(safe-area-inset-bottom, 0px)) 16px',
            borderTop: '1px solid #F1F5F9',
            backgroundColor: '#FFFFFF',
          }}
        >
          <button
            type="button"
            onClick={() => onCompleteRoute(origin, destination)}
            style={{
              width: '100%',
              height: 48,
              borderRadius: 999,
              border: 'none',
              backgroundColor: '#0F172A',
              color: '#FFFFFF',
              fontSize: '0.92rem',
              fontWeight: 800,
              cursor: 'pointer',
            }}
          >
            Ver opções e valores →
          </button>
        </div>
      )}
    </div>
  );
};
