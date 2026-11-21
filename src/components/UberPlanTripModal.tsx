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
  CityOrCepSuggestion,
  reverseGeocode,
  searchAddressGeocode,
  searchCitiesAndViaCep,
} from '../utils/geo';
import { StorageService } from '../services/storage';
import { InlineMapPinView } from './InlineMapPinView';

interface UberPlanTripModalProps {
  isOpen: boolean;
  embedded?: boolean;
  initialFocusField?: 'origin' | 'destination';
  initialOpenSchedule?: boolean;
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
  onOpenMapPicker?: (field: 'origin' | 'destination') => void;
  onSelectOrigin: (pt: LocationPoint | null) => void;
  onSelectDestination?: (pt: LocationPoint | null) => void;
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
  embedded = false,
  initialFocusField,
  initialOpenSchedule = false,
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
  onSelectDestination,
  onSwapOriginDest,
  onCompleteRoute,
}) => {
  const [subView, setSubView] = useState<'plan' | 'city_search' | 'map_pin'>('plan');
  const [activeField, setActiveField] = useState<'origin' | 'destination'>(() =>
    initialFocusField || (origin && !destination ? 'destination' : !origin ? 'origin' : 'destination')
  );
  const [originInput, setOriginInput] = useState<string>(origin?.address || '');
  const [destInput, setDestInput] = useState<string>(destination?.address || '');

  const [cityQuery, setCityQuery] = useState<string>('');
  const [cityResults, setCityResults] = useState<CityOrCepSuggestion[]>([]);
  const [isCitySearching, setIsCitySearching] = useState<boolean>(false);

  const [showSchedulePopover, setShowSchedulePopover] = useState<boolean>(initialOpenSchedule);
  const [showPassengerPopover, setShowPassengerPopover] = useState<boolean>(false);
  const [draftDate, setDraftDate] = useState<string>(scheduledDate);
  const [draftTime, setDraftTime] = useState<string>(scheduledTime);

  const [results, setResults] = useState<Array<{ display_name: string; lat: number; lng: number }>>([]);
  const [isSearching, setIsSearching] = useState<boolean>(false);
  const [hasSearchedEmpty, setHasSearchedEmpty] = useState<boolean>(false);
  const [isLocatingGps, setIsLocatingGps] = useState<boolean>(false);
  const [gpsNotice, setGpsNotice] = useState<string>('');

  const originRef = useRef<HTMLInputElement | null>(null);
  const destRef = useRef<HTMLInputElement | null>(null);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchReqIdRef = useRef<number>(0);
  const pasteImmediateRef = useRef<boolean>(false);

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
    setSubView('plan');
    setResults([]);
    setIsSearching(false);
    setGpsNotice('');
    setShowSchedulePopover(Boolean(initialOpenSchedule));
    setShowPassengerPopover(false);

    const timer = setTimeout(() => {
      if (initialFocusField === 'origin') {
        setActiveField('origin');
        originRef.current?.focus();
      } else {
        setActiveField('destination');
        destRef.current?.focus();
      }
    }, 80);
    return () => clearTimeout(timer);
  }, [isOpen, initialFocusField, initialOpenSchedule]);

  const recentDestinations = useMemo(
    () => (isOpen ? StorageService.getRecentDestinations() : []),
    [isOpen]
  );
  const savedAddresses = useMemo(
    () => (Array.isArray(currentUser?.savedAddresses) ? currentUser.savedAddresses : []),
    [currentUser?.savedAddresses]
  );

  const activeQuery = activeField === 'origin' ? originInput : destInput;

  const runSearch = (
    query: string,
    fieldOverride?: 'origin' | 'destination',
    immediate = false
  ) => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    const targetField = fieldOverride || activeField;
    const trimmed = query.trim();
    const currentSelectedText = targetField === 'origin' ? origin?.address : destination?.address;
    if (trimmed.length < 2 || trimmed === currentSelectedText) {
      setResults([]);
      setIsSearching(false);
      setHasSearchedEmpty(false);
      return;
    }

    const reqId = ++searchReqIdRef.current;
    setIsSearching(true);
    setHasSearchedEmpty(false);

    const execute = async () => {
      try {
        const res = await searchAddressGeocode(trimmed, origin?.lat, origin?.lng);
        if (searchReqIdRef.current === reqId) {
          setResults(res);
          setHasSearchedEmpty(res.length === 0);
          setIsSearching(false);
        }
      } catch {
        if (searchReqIdRef.current === reqId) {
          setResults([]);
          setHasSearchedEmpty(true);
          setIsSearching(false);
        }
      }
    };

    if (immediate) {
      void execute();
    } else {
      searchTimerRef.current = setTimeout(execute, 210);
    }
  };

  const handleFieldChange = (field: 'origin' | 'destination', value: string) => {
    const prevValue = field === 'origin' ? originInput : destInput;
    const wasPaste = pasteImmediateRef.current || Math.abs(value.length - prevValue.length) > 4;
    pasteImmediateRef.current = false;

    setActiveField(field);
    setGpsNotice('');
    if (field === 'origin') {
      setOriginInput(value);
      if (!value.trim() || value.trim() !== (origin?.address || '')) {
        onSelectOrigin(null);
      }
    } else {
      setDestInput(value);
      if (!value.trim() || value.trim() !== (destination?.address || '')) {
        onSelectDestination?.(null);
      }
    }
    runSearch(value, field, wasPaste);
  };

  const handleFieldFocus = (field: 'origin' | 'destination') => {
    setActiveField(field);
    const val = (field === 'origin' ? originInput : destInput).trim();
    const selectedAddr = (field === 'origin' ? origin?.address : destination?.address) || '';
    if (val.length >= 2 && val !== selectedAddr && val !== 'Minha localização atual (GPS)') {
      if (results.length === 0) {
        runSearch(val, field, true);
      }
    } else if (!val || val === selectedAddr) {
      setResults([]);
      setHasSearchedEmpty(false);
    }
  };

  const handleFieldKeyDown = async (
    field: 'origin' | 'destination',
    e: React.KeyboardEvent<HTMLInputElement>
  ) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const val = (field === 'origin' ? originInput : destInput).trim();
    if (val.length < 2) return;
    if (results.length > 0 && activeField === field) {
      const top = results[0];
      handleSelectSuggestion({ address: top.display_name, lat: top.lat, lng: top.lng });
      return;
    }
    const reqId = ++searchReqIdRef.current;
    setActiveField(field);
    setIsSearching(true);
    setHasSearchedEmpty(false);
    const res = await searchAddressGeocode(val, origin?.lat, origin?.lng);
    if (searchReqIdRef.current !== reqId) return;
    setResults(res);
    setHasSearchedEmpty(res.length === 0);
    setIsSearching(false);
    if (res.length > 0) {
      handleSelectSuggestion({
        address: res[0].display_name,
        lat: res[0].lat,
        lng: res[0].lng,
      });
    }
  };

  const handleUseCurrentGps = () => {
    if (!navigator.geolocation) {
      if (onOpenMapPicker) {
        onOpenMapPicker('origin');
      } else {
        setActiveField('origin');
        setSubView('map_pin');
      }
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
    setHasSearchedEmpty(false);
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
    onSelectDestination?.(point);
    setDestInput(point.address);

    if (origin) {
      onCompleteRoute(origin, point);
    } else {
      setActiveField('origin');
      setTimeout(() => originRef.current?.focus(), 60);
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
      if (activeField === 'destination' && origin && sa.address === origin.address) return;
      if (activeField === 'origin' && destination && sa.address === destination.address) return;
      items.push({
        key: `saved-${sa.id}`,
        title: sa.label,
        subtitle: sa.address,
        distanceKm: computeDist(sa.lat, sa.lng),
        point: { address: sa.address, lat: sa.lat, lng: sa.lng, reference: sa.label },
        kind: 'saved',
      });
    });

    const recentCap = normalizedFilter.length >= 2 ? 4 : 2;
    let addedRecents = 0;
    for (let idx = 0; idx < recentDestinations.length && addedRecents < recentCap; idx++) {
      const rec = recentDestinations[idx];
      if (
        normalizedFilter.length >= 2 &&
        !rec.address.toLowerCase().includes(normalizedFilter) &&
        !(rec.reference || '').toLowerCase().includes(normalizedFilter)
      ) {
        continue;
      }
      if (activeField === 'destination' && origin && rec.address === origin.address) continue;
      if (activeField === 'origin' && destination && rec.address === destination.address) continue;
      if (items.some((it) => it.point.address === rec.address)) continue;
      const { title, subtitle } = splitPlaceHeadline(rec.address);
      items.push({
        key: `recent-${idx}-${rec.address}`,
        title: rec.reference || title || rec.address,
        subtitle: subtitle || rec.address,
        distanceKm: computeDist(rec.lat, rec.lng),
        point: rec,
        kind: 'recent',
      });
      addedRecents++;
    }

    return items;
  }, [results, savedAddresses, recentDestinations, activeQuery, activeField, origin, destination]);

  const schedulePillLabel = useMemo(() => {
    if (scheduleMode !== 'later' || !scheduledDate || !scheduledTime) return 'Ir agora';
    const [, m, d] = scheduledDate.split('-');
    return `${d}/${m} • ${scheduledTime}`;
  }, [scheduleMode, scheduledDate, scheduledTime]);

  const handleCitySearchChange = async (value: string) => {
    setCityQuery(value);
    if (value.trim().length < 2) {
      setCityResults([]);
      setIsCitySearching(false);
      return;
    }
    setIsCitySearching(true);
    try {
      const list = await searchCitiesAndViaCep(value);
      setCityResults(list);
    } catch {
      setCityResults([]);
    } finally {
      setIsCitySearching(false);
    }
  };

  const applyCityChoice = (rawCityLabel: string) => {
    const cleanCity = rawCityLabel.replace(/,\s*BR$/i, '').trim();
    if (activeField === 'origin') {
      setOriginInput(cleanCity);
      onSelectOrigin(null);
    } else {
      setDestInput(cleanCity);
      onSelectDestination?.(null);
    }
    setSubView('plan');
    runSearch(cleanCity);
    setTimeout(() => {
      if (activeField === 'origin') {
        originRef.current?.focus();
      } else {
        destRef.current?.focus();
      }
    }, 60);
  };

  const handleConfirmMapPin = (pt: LocationPoint) => {
    if (activeField === 'origin') {
      onSelectOrigin(pt);
      setOriginInput(pt.address);
      if (destination) {
        onCompleteRoute(pt, destination);
        return;
      }
      setSubView('plan');
      setActiveField('destination');
      setTimeout(() => destRef.current?.focus(), 60);
      return;
    }

    StorageService.addRecentDestination(pt);
    onSelectDestination?.(pt);
    setDestInput(pt.address);
    if (origin) {
      onCompleteRoute(origin, pt);
      return;
    }
    setSubView('plan');
    setActiveField('origin');
    setTimeout(() => originRef.current?.focus(), 60);
  };

  if (!isOpen) return null;

  const containerStyle: React.CSSProperties = embedded
    ? {
        flex: 1,
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: '#FFFFFF',
        color: '#0F172A',
        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
      }
    : {
        position: 'fixed',
        inset: 0,
        maxWidth: 480,
        margin: '0 auto',
        backgroundColor: '#FFFFFF',
        zIndex: 10040,
        display: 'flex',
        flexDirection: 'column',
        color: '#0F172A',
        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
      };

  if (subView === 'map_pin') {
    return (
      <div className="animate-fade-in" style={containerStyle}>
        <InlineMapPinView
          field={activeField}
          initialPoint={activeField === 'origin' ? origin : destination}
          onBack={() => setSubView('plan')}
          onConfirm={handleConfirmMapPin}
        />
      </div>
    );
  }

  if (subView === 'city_search') {
    const quickCities = [
      'Lauro Müller - SC',
      'Orleans - SC',
      'Criciúma - SC',
      'Tubarão - SC',
      'Urussanga - SC',
      'Braço do Norte - SC',
      'Florianópolis - SC',
      'Curitiba - PR',
      'Porto Alegre - RS',
    ];

    return (
      <div className="animate-fade-in" style={containerStyle}>
        <div
          style={{
            padding: 'calc(14px + env(safe-area-inset-top, 0px)) 16px 12px 16px',
            borderBottom: '1px solid #F1F5F9',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
            <button
              type="button"
              onClick={() => setSubView('plan')}
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
            <h1 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 900, color: '#0F172A', letterSpacing: '-0.02em' }}>
              Pesquisar em outra cidade
            </h1>
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              height: 44,
              padding: '0 14px',
              borderRadius: 12,
              backgroundColor: '#F1F5F9',
              border: '1.5px solid #0F172A',
            }}
          >
            <Search size={17} color="#0F172A" />
            <input
              type="text"
              autoFocus
              value={cityQuery}
              onChange={(e) => handleCitySearchChange(e.target.value)}
              placeholder="Digite a cidade ou CEP (ex: Orleans, Criciúma...)"
              style={{
                flex: 1,
                border: 'none',
                backgroundColor: 'transparent',
                color: '#0F172A',
                fontSize: '0.88rem',
                fontWeight: 600,
                outline: 'none',
              }}
            />
            {cityQuery && (
              <button
                type="button"
                onClick={() => {
                  setCityQuery('');
                  setCityResults([]);
                }}
                style={{ background: 'none', border: 'none', color: '#475569', cursor: 'pointer', display: 'flex' }}
              >
                <X size={15} />
              </button>
            )}
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '10px 16px 24px 16px' }}>
          {isCitySearching && (
            <div style={{ padding: '12px 4px', fontSize: '0.82rem', color: '#64748B', fontWeight: 600 }}>
              Buscando municípios e CEP...
            </div>
          )}

          {cityQuery.trim().length < 2 && (
            <div>
              <div style={{ fontSize: '0.72rem', fontWeight: 800, color: '#64748B', marginBottom: 8, textTransform: 'uppercase' }}>
                Principais cidades atendidas
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {quickCities.map((city) => (
                  <button
                    key={city}
                    type="button"
                    onClick={() => applyCityChoice(city)}
                    style={{
                      padding: '8px 13px',
                      borderRadius: 999,
                      border: '1px solid #E2E8F0',
                      backgroundColor: '#F8FAFC',
                      color: '#0F172A',
                      fontSize: '0.8rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    {city}
                  </button>
                ))}
              </div>
            </div>
          )}

          {cityResults.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => applyCityChoice(c.streetAddress || c.cityLabel)}
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
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: '0.9rem', fontWeight: 800, color: '#0F172A' }}>
                  {c.cityLabel}
                </div>
                <div style={{ fontSize: '0.75rem', color: '#64748B', marginTop: 1 }}>
                  {c.subtitle}
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in" style={containerStyle}>
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

        {/* ── CAIXA UNIFICADA DE ORIGEM, DESTINO E ALTERNÂNCIA NO MESMO BLOCO ── */}
        <div
          style={{
            width: '100%',
            border: '2px solid #0F172A',
            borderRadius: 16,
            backgroundColor: '#F8FAFC',
            display: 'flex',
            alignItems: 'stretch',
            overflow: 'hidden',
            boxSizing: 'border-box',
          }}
        >
          <div style={{ flex: 1, minWidth: 0, position: 'relative' }}>
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
                onFocus={() => handleFieldFocus('origin')}
                onPaste={() => {
                  pasteImmediateRef.current = true;
                }}
                onKeyDown={(e) => {
                  void handleFieldKeyDown('origin', e);
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
                    setHasSearchedEmpty(false);
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
                onFocus={() => handleFieldFocus('destination')}
                onPaste={() => {
                  pasteImmediateRef.current = true;
                }}
                onKeyDown={(e) => {
                  void handleFieldKeyDown('destination', e);
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
                    onSelectDestination?.(null);
                    setDestInput('');
                    setActiveField('destination');
                    setResults([]);
                    setHasSearchedEmpty(false);
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
              width: 44,
              backgroundColor: '#FFFFFF',
              border: 'none',
              borderLeft: '1px solid #E2E8F0',
              color: '#0F172A',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              flexShrink: 0,
            }}
          >
            <ArrowUpDown size={17} />
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

        {hasSearchedEmpty && !isSearching && activeQuery.trim().length >= 3 && (
          <div
            style={{
              margin: '6px 0 8px 0',
              padding: '10px 12px',
              borderRadius: 12,
              backgroundColor: '#FFFBEB',
              border: '1px solid #FDE68A',
              fontSize: '0.78rem',
              fontWeight: 600,
              color: '#92400E',
            }}
          >
            Não encontramos esse número exato. Tente buscar apenas o nome da rua e cidade, ou toque em{' '}
            <strong>&quot;Defina a localização no mapa&quot;</strong> abaixo.
          </div>
        )}

        {suggestionList.map((item, idx) => (
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
            {item.kind === 'search' && idx === 0 && (
              <span
                style={{
                  flexShrink: 0,
                  padding: '4px 10px',
                  borderRadius: 999,
                  backgroundColor: '#0F172A',
                  color: '#76D800',
                  fontSize: '0.7rem',
                  fontWeight: 800,
                }}
              >
                Aplicar
              </span>
            )}
          </button>
        ))}

        {/* Opções fixas estilo Uber (Cidade diferente + Mais resultados + Mapa) */}
        <button
          type="button"
          onClick={() => {
            setCityQuery('');
            setCityResults([]);
            setSubView('city_search');
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

        {activeQuery.trim().length >= 2 &&
          activeQuery.trim() !== (activeField === 'origin' ? origin?.address : destination?.address) &&
          activeQuery.trim() !== 'Minha localização atual (GPS)' && (
          <button
            type="button"
            onClick={() => runSearch(activeQuery, activeField, true)}
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
              <Search size={16} />
            </div>
            <span
              style={{
                fontSize: '0.9rem',
                fontWeight: 700,
                color: '#0F172A',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              Obtenha mais resultados para {activeQuery.trim()}
            </span>
          </button>
        )}

        <button
          type="button"
          onClick={() => {
            if (onOpenMapPicker) {
              onOpenMapPicker(activeField);
            } else {
              setSubView('map_pin');
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
