import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  ChevronRight, ExternalLink, Copy, Check, Navigation, FileText, X, Bell,
  SlidersHorizontal, RotateCcw, Car, Zap, Star, HandCoins, EyeOff, Eye,
  ShieldCheck, User, Receipt, Pencil, Package
} from 'lucide-react';
import { LocationPoint, Ride, SystemConfig } from '../types';
import { StorageService, canPassengerCancelRide, canPassengerEditRoute } from '../services/storage';
import { resolveCategoryType } from '../utils/categoryEngine';
import { getGoogleMapsRouteUrl } from '../utils/geo';
import { getCleanWhatsappNumber, formatRideCode } from '../utils/format';
import { WhatsAppIcon } from '../components/WhatsAppIcon';
import { LiveGpsNavigationScreen } from '../components/LiveGpsNavigationScreen';
import { PassengerLiveMap } from '../components/PassengerLiveMap';
import { SosEmergencyModal } from '../components/SosEmergencyModal';
import { NotificationsModal } from '../components/NotificationsModal';
import { RideReceiptModal } from '../components/RideReceiptModal';
import { RideRatingBottomSheet } from '../components/RideRatingBottomSheet';
import { RideCancelModal } from '../components/RideCancelModal';
import { RideEditRouteModal } from '../components/RideEditRouteModal';
import { PaymentMethodBadge } from '../components/PaymentMethodIcon';

interface ClientMyRidesScreenProps {
  rides: Ride[];
  config: SystemConfig;
  onOpenActiveRide?: (ride: Ride) => void;
  onBookNewRide: (prefill?: {
    origin?: LocationPoint;
    destination?: LocationPoint;
    categoryId?: string;
  }) => void;
}

type ActivityFilter = 'todas' | 'ativas' | 'finalizadas' | 'canceladas';

const SHORT_MONTHS_PT = [
  'jan.', 'fev.', 'mar.', 'abr.', 'mai.', 'jun.',
  'jul.', 'ago.', 'set.', 'out.', 'nov.', 'dez.'
];

function formatActivityDateTime(dateStr?: string, timeStr?: string): string {
  const safeTime = (timeStr || '').trim();
  if (!dateStr || !dateStr.includes('-')) {
    return safeTime || 'Agora';
  }
  const [, monthPart, dayPart] = dateStr.split('-');
  const dayNum = parseInt(dayPart, 10);
  const monthIdx = parseInt(monthPart, 10) - 1;
  const monthLabel = SHORT_MONTHS_PT[monthIdx] || monthPart;
  const dateLabel = Number.isFinite(dayNum) ? `${dayNum} de ${monthLabel}` : dateStr;
  return safeTime ? `${dateLabel} • ${safeTime}` : dateLabel;
}

function formatHourFromIso(iso?: string): string {
  if (!iso) return '';
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return '';
  return `${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}`;
}

function getHiddenRidesStorageKey(): string {
  const user = StorageService.getCurrentUser();
  return `kavro_hidden_rides_${user?.id || 'guest'}`;
}

function loadHiddenRideIds(): string[] {
  try {
    const raw = localStorage.getItem(getHiddenRidesStorageKey());
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function getActivityStatusInfo(status: Ride['status']) {
  switch (status) {
    case 'aguardando_pagamento':
      return { label: 'Aguardando PIX', color: '#B45309', bg: '#FEF3C7', isLive: false, isActive: true };
    case 'aguardando_confirmacao':
      return { label: 'Procurando motorista', color: '#1D4ED8', bg: '#DBEAFE', isLive: false, isActive: true };
    case 'na_fila':
      return { label: 'Na fila do motorista', color: '#B45309', bg: '#FEF3C7', isLive: false, isActive: true };
    case 'confirmada':
      return { label: 'Confirmada', color: '#1D4ED8', bg: '#DBEAFE', isLive: true, isActive: true };
    case 'a_caminho':
      return { label: 'Motorista a caminho', color: '#6D28D9', bg: '#EDE9FE', isLive: true, isActive: true };
    case 'no_local':
      return { label: 'No ponto de embarque', color: '#15803D', bg: '#DCFCE7', isLive: true, isActive: true };
    case 'em_andamento':
      return { label: 'Em viagem', color: '#15803D', bg: '#DCFCE7', isLive: true, isActive: true };
    case 'finalizada':
      return { label: 'Concluída', color: '#15803D', bg: '#DCFCE7', isLive: false, isActive: false };
    case 'cancelada':
      return { label: 'Cancelada', color: '#FFFFFF', bg: '#DC2626', isLive: false, isActive: false };
    default:
      return { label: 'Registrada', color: '#475569', bg: '#F1F5F9', isLive: false, isActive: false };
  }
}

export const ClientMyRidesScreen: React.FC<ClientMyRidesScreenProps> = ({
  rides,
  config,
  onOpenActiveRide,
  onBookNewRide,
}) => {
  const [localRides, setLocalRides] = useState<Ride[]>(rides);
  const [selectedRide, setSelectedRide] = useState<Ride | null>(null);
  const [receiptRide, setReceiptRide] = useState<Ride | null>(null);
  const [ratingRide, setRatingRide] = useState<Ride | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [liveTrackingRide, setLiveTrackingRide] = useState<Ride | null>(null);
  const [isSosOpen, setIsSosOpen] = useState(false);
  const [cancelTargetRide, setCancelTargetRide] = useState<Ride | null>(null);
  const [editRouteTargetRide, setEditRouteTargetRide] = useState<Ride | null>(null);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<ActivityFilter>('todas');
  const [showHidden, setShowHidden] = useState(false);
  const [hiddenRideIds, setHiddenRideIds] = useState<string[]>(() => loadHiddenRideIds());
  const [unreadNotifCount, setUnreadNotifCount] = useState<number>(() => {
    return StorageService.getNotifications().filter(n => !n.read).length;
  });

  useEffect(() => {
    const updateCount = () => {
      setUnreadNotifCount(StorageService.getNotifications().filter(n => !n.read).length);
    };
    window.addEventListener('up_notifications_updated', updateCount);
    window.addEventListener('up_database_synced', updateCount);
    window.addEventListener('up_push_received', updateCount);
    return () => {
      window.removeEventListener('up_notifications_updated', updateCount);
      window.removeEventListener('up_database_synced', updateCount);
      window.removeEventListener('up_push_received', updateCount);
    };
  }, []);

  useEffect(() => {
    setLocalRides(rides);
  }, [rides]);

  const updateFromStore = () => {
    const all = StorageService.getRides();
    const currentUser = StorageService.getCurrentUser();
    const uPhoneClean = (currentUser?.phone || '').replace(/\D/g, '');
    const filtered = all.filter(r => {
      const rPhoneClean = (r.clientPhone || '').replace(/\D/g, '');
      return (
        (currentUser?.id && r.clientId === currentUser.id) ||
        (uPhoneClean && rPhoneClean && uPhoneClean === rPhoneClean) ||
        (currentUser?.name && r.clientName && r.clientName.trim().toLowerCase() === currentUser.name.trim().toLowerCase())
      );
    });
    setLocalRides(filtered.length > 0 || !currentUser ? filtered : all);

    if (selectedRide) {
      const fresh = all.find(r => r.id === selectedRide.id);
      if (fresh) setSelectedRide(fresh);
    }
  };

  useEffect(() => {
    StorageService.syncFromDatabase().then(() => updateFromStore());
    const handleSync = () => updateFromStore();
    window.addEventListener('up_rides_updated', handleSync);
    window.addEventListener('up_database_synced', handleSync);

    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        StorageService.syncFromDatabase().then(() => updateFromStore());
      }
    }, 2000);

    return () => {
      clearInterval(interval);
      window.removeEventListener('up_rides_updated', handleSync);
      window.removeEventListener('up_database_synced', handleSync);
    };
  }, [selectedRide?.id]);

  useEffect(() => {
    if (selectedRide) {
      const fresh = rides.find(r => r.id === selectedRide.id);
      if (fresh) setSelectedRide(fresh);
    }
  }, [rides]);

  useEffect(() => {
    if (!selectedRide) return;
    const prevBodyOverflow = document.body.style.overflow;
    const prevHtmlOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevBodyOverflow;
      document.documentElement.style.overflow = prevHtmlOverflow;
    };
  }, [selectedRide]);

  const handleCopyCode = (id: string) => {
    navigator.clipboard.writeText(id);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleHideRide = (rideId: string) => {
    const next = Array.from(new Set([...hiddenRideIds, rideId]));
    setHiddenRideIds(next);
    try {
      localStorage.setItem(getHiddenRidesStorageKey(), JSON.stringify(next));
    } catch {
      // ignore storage quota errors
    }
    setSelectedRide(null);
  };

  const handleUnhideRide = (rideId: string) => {
    const next = hiddenRideIds.filter(id => id !== rideId);
    setHiddenRideIds(next);
    try {
      localStorage.setItem(getHiddenRidesStorageKey(), JSON.stringify(next));
    } catch {
      // ignore storage quota errors
    }
  };

  const handleRebook = (ride: Ride, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setSelectedRide(null);
    onBookNewRide({
      origin: ride.origin,
      destination: ride.destination,
      categoryId: ride.category
    });
  };

  const visibleRides = useMemo(() => {
    return localRides.filter(r => {
      const isHidden = hiddenRideIds.includes(r.id);
      if (!showHidden && isHidden) return false;
      if (statusFilter === 'ativas') return getActivityStatusInfo(r.status).isActive;
      if (statusFilter === 'finalizadas') return r.status === 'finalizada';
      if (statusFilter === 'canceladas') return r.status === 'cancelada';
      return true;
    });
  }, [localRides, hiddenRideIds, showHidden, statusFilter]);

  const activeRides = useMemo(
    () => visibleRides.filter(r => getActivityStatusInfo(r.status).isActive),
    [visibleRides]
  );

  const pastRides = useMemo(
    () => visibleRides.filter(r => !getActivityStatusInfo(r.status).isActive),
    [visibleRides]
  );

  const featuredRide = pastRides[0] || null;
  const listPastRides = featuredRide ? pastRides.slice(1) : pastRides;

  const renderReagendarPill = (ride: Ride) => (
    <button
      type="button"
      onClick={(e) => handleRebook(ride, e)}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        backgroundColor: '#F3F4F6',
        color: '#0F172A',
        border: 'none',
        borderRadius: 999,
        padding: '8px 13px',
        fontSize: '0.78rem',
        fontWeight: 700,
        cursor: 'pointer',
        whiteSpace: 'nowrap',
        flexShrink: 0
      }}
    >
      <RotateCcw size={14} strokeWidth={2.4} />
      <span>Reagendar</span>
    </button>
  );

  return (
    <div className="animate-fade-in" style={{ backgroundColor: '#FFFFFF', minHeight: '100%', padding: '18px 16px calc(108px + env(safe-area-inset-bottom, 0px)) 16px' }}>
      {/* ── CABEÇALHO ESTILO UBER ("Atividade") ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <h1 style={{ margin: 0, fontSize: '1.85rem', fontWeight: 900, color: '#0F172A', letterSpacing: '-0.03em' }}>
          Atividade
        </h1>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button
            type="button"
            onClick={() => setIsNotificationsOpen(true)}
            title="Notificações"
            style={{
              width: 34,
              height: 34,
              borderRadius: '50%',
              backgroundColor: '#F3F4F6',
              border: '1px solid #E5E7EB',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#0F172A',
              cursor: 'pointer',
              position: 'relative'
            }}
          >
            <Bell size={15} strokeWidth={2.3} />
            {unreadNotifCount > 0 && (
              <span style={{
                position: 'absolute',
                top: -3,
                right: -3,
                backgroundColor: '#DC2626',
                color: '#FFFFFF',
                fontSize: '0.58rem',
                fontWeight: 900,
                minWidth: 15,
                height: 15,
                borderRadius: 8,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '0 3px',
                border: '1.5px solid #FFFFFF'
              }}>
                {unreadNotifCount > 9 ? '9+' : unreadNotifCount}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setIsFilterOpen(v => !v)}
            title="Filtrar viagens"
            style={{
              width: 34,
              height: 34,
              borderRadius: '50%',
              backgroundColor: isFilterOpen || statusFilter !== 'todas' || showHidden ? '#0F172A' : '#F3F4F6',
              color: isFilterOpen || statusFilter !== 'todas' || showHidden ? '#76D800' : '#0F172A',
              border: '1px solid #E5E7EB',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer'
            }}
          >
            <SlidersHorizontal size={15} strokeWidth={2.4} />
          </button>
        </div>
      </div>

      {/* Painel compacto de filtros estilo Uber */}
      {isFilterOpen && (
        <div style={{
          backgroundColor: '#F8FAFC',
          border: '1px solid #E2E8F0',
          borderRadius: 14,
          padding: '10px 12px',
          marginBottom: 14,
          display: 'flex',
          flexDirection: 'column',
          gap: 8
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            {(
              [
                { id: 'todas', label: 'Todas' },
                { id: 'ativas', label: 'Em andamento' },
                { id: 'finalizadas', label: 'Concluídas' },
                { id: 'canceladas', label: 'Canceladas' }
              ] as Array<{ id: ActivityFilter; label: string }>
            ).map(f => (
              <button
                key={f.id}
                type="button"
                onClick={() => setStatusFilter(f.id)}
                style={{
                  padding: '6px 11px',
                  borderRadius: 999,
                  border: 'none',
                  fontSize: '0.74rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  backgroundColor: statusFilter === f.id ? '#0F172A' : '#FFFFFF',
                  color: statusFilter === f.id ? '#76D800' : '#475569',
                  boxShadow: statusFilter === f.id ? 'none' : 'inset 0 0 0 1px #E2E8F0'
                }}
              >
                {f.label}
              </button>
            ))}
          </div>

          {hiddenRideIds.length > 0 && (
            <button
              type="button"
              onClick={() => setShowHidden(v => !v)}
              style={{
                alignSelf: 'flex-start',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                background: 'none',
                border: 'none',
                padding: '2px 0',
                fontSize: '0.74rem',
                fontWeight: 700,
                color: '#1D4ED8',
                cursor: 'pointer'
              }}
            >
              {showHidden ? <Eye size={13} /> : <EyeOff size={13} />}
              <span>
                {showHidden
                  ? 'Ocultar viagens arquivadas'
                  : `Mostrar ${hiddenRideIds.length} viagem(ns) ocultada(s)`}
              </span>
            </button>
          )}
        </div>
      )}

      {/* ── ESTADO VAZIO ── */}
      {visibleRides.length === 0 ? (
        <div style={{
          padding: '38px 20px',
          textAlign: 'center',
          backgroundColor: '#F8FAFC',
          borderRadius: 20,
          border: '1px solid #E2E8F0',
          marginTop: 8
        }}>
          <Car size={40} color="#94A3B8" style={{ margin: '0 auto 10px auto' }} />
          <h3 style={{ margin: '0 0 6px 0', fontSize: '1.02rem', fontWeight: 800, color: '#0F172A' }}>
            Nenhuma viagem encontrada
          </h3>
          <p style={{ margin: '0 0 18px 0', fontSize: '0.82rem', color: '#64748B' }}>
            Suas viagens realizadas e agendamentos aparecerão aqui.
          </p>
          <button
            type="button"
            onClick={() => onBookNewRide()}
            style={{
              backgroundColor: '#0F172A',
              color: '#76D800',
              border: 'none',
              borderRadius: 999,
              padding: '12px 22px',
              fontSize: '0.88rem',
              fontWeight: 800,
              cursor: 'pointer'
            }}
          >
            Pedir primeira viagem
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          {/* ── SEÇÃO: VIAGENS ATIVAS / EM ANDAMENTO ── */}
          {activeRides.length > 0 && (
            <div>
              <h2 style={{ margin: '0 0 10px 0', fontSize: '1.02rem', fontWeight: 800, color: '#0F172A' }}>
                Em andamento
              </h2>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {activeRides.map((ride, idx) => {
                  const st = getActivityStatusInfo(ride.status);
                  const destTitle = ride.destination.reference || ride.destination.address.split(',')[0];
                  const showFeaturedMap = idx === 0;

                  if (!showFeaturedMap) {
                    return (
                      <div
                        key={ride.id}
                        onClick={() => setSelectedRide(ride)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: 12,
                          padding: '12px 0',
                          borderBottom: '1px solid #F1F5F9',
                          cursor: 'pointer'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0, flex: 1 }}>
                          <div style={{
                            width: 56,
                            height: 56,
                            borderRadius: 12,
                            backgroundColor: '#F3F4F6',
                            border: '1px solid #E5E7EB',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0
                          }}>
                            <Car size={24} color="#0F172A" />
                          </div>

                          <div style={{ minWidth: 0, flex: 1 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                              <span style={{
                                fontSize: '0.64rem',
                                fontWeight: 800,
                                padding: '2px 7px',
                                borderRadius: 999,
                                backgroundColor: st.bg,
                                color: st.color
                              }}>
                                {st.label}
                              </span>
                            </div>
                            <div style={{
                              fontSize: '0.92rem',
                              fontWeight: 800,
                              color: '#0F172A',
                              lineHeight: 1.2,
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis'
                            }}>
                              {destTitle}
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', fontSize: '0.75rem', color: '#64748B', marginTop: 3 }}>
                              <span>{formatActivityDateTime(ride.date, ride.time)} • R$ {ride.totalPrice.toFixed(2).replace('.', ',')}</span>
                              <PaymentMethodBadge method={ride.paymentMethod} compact iconSize={12} />
                            </div>
                          </div>
                        </div>

                        {renderReagendarPill(ride)}
                      </div>
                    );
                  }

                  return (
                    <div
                      key={ride.id}
                      onClick={() => setSelectedRide(ride)}
                      style={{
                        borderRadius: 18,
                        border: '1.5px solid #0F172A',
                        backgroundColor: '#FFFFFF',
                        padding: 14,
                        cursor: 'pointer',
                        boxShadow: '0 4px 16px rgba(15, 23, 42, 0.08)'
                      }}
                    >
                      <div style={{ height: 118, borderRadius: 12, overflow: 'hidden', marginBottom: 12, pointerEvents: 'none', border: '1px solid #E5E7EB' }}>
                        <PassengerLiveMap
                          origin={ride.origin}
                          destination={ride.destination}
                          driverPos={ride.driverLocation || null}
                          searchingPulse={ride.status === 'aguardando_confirmacao'}
                        />
                      </div>

                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                            <span style={{
                              fontSize: '0.68rem',
                              fontWeight: 800,
                              padding: '3px 8px',
                              borderRadius: 999,
                              backgroundColor: st.bg,
                              color: st.color
                            }}>
                              {st.label}
                            </span>
                            <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#64748B' }}>
                              {formatRideCode(ride)}
                            </span>
                            {(ride.serviceType === 'entregas' || Boolean(ride.deliveryDetails) || resolveCategoryType(ride.category || '') === 'entregas') && (
                              <span style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 3,
                                fontSize: '0.66rem',
                                fontWeight: 800,
                                padding: '2px 7px',
                                borderRadius: 999,
                                backgroundColor: '#DCFCE7',
                                color: '#166534'
                              }}>
                                <Package size={10} />
                                <span>Entrega</span>
                              </span>
                            )}
                          </div>
                          <div style={{ fontSize: '1.02rem', fontWeight: 800, color: '#0F172A', lineHeight: 1.25 }}>
                            {destTitle}
                          </div>
                          <div style={{ fontSize: '0.76rem', color: '#64748B', marginTop: 3 }}>
                            {formatActivityDateTime(ride.date, ride.time)}
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
                            <span style={{ fontSize: '0.84rem', fontWeight: 800, color: '#0F172A' }}>
                              R$ {ride.totalPrice.toFixed(2).replace('.', ',')}
                            </span>
                            <PaymentMethodBadge method={ride.paymentMethod} compact iconSize={12} />
                          </div>
                        </div>

                        <ChevronRight size={18} color="#94A3B8" style={{ flexShrink: 0, marginTop: 4 }} />
                      </div>

                      {st.isLive && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setLiveTrackingRide(ride);
                          }}
                          style={{
                            marginTop: 12,
                            width: '100%',
                            height: 42,
                            borderRadius: 12,
                            border: 'none',
                            backgroundColor: '#0F172A',
                            color: '#FFFFFF',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 8,
                            fontSize: '0.82rem',
                            fontWeight: 800,
                            cursor: 'pointer'
                          }}
                        >
                          <Navigation size={15} color="#76D800" />
                          <span>Acompanhar no GPS ao Vivo</span>
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── SEÇÃO: ANTERIORES (LAYOUT IDÊNTICO À UBER) ── */}
          {pastRides.length > 0 && (
            <div>
              <h2 style={{ margin: '0 0 12px 0', fontSize: '1.05rem', fontWeight: 800, color: '#0F172A' }}>
                Anteriores
              </h2>

              {/* Card em Destaque com Mapa (1ª viagem anterior) */}
              {featuredRide && (() => {
                const destTitle = featuredRide.destination.reference || featuredRide.destination.address.split(',')[0];
                const isCancelled = featuredRide.status === 'cancelada';
                const displayPrice = isCancelled ? 0 : featuredRide.totalPrice;

                return (
                  <div
                    onClick={() => setSelectedRide(featuredRide)}
                    style={{
                      border: '1px solid #E5E7EB',
                      borderRadius: 18,
                      padding: 14,
                      backgroundColor: '#FFFFFF',
                      cursor: 'pointer',
                      boxShadow: '0 2px 10px rgba(15, 23, 42, 0.04)',
                      marginBottom: 8
                    }}
                  >
                    <div style={{
                      height: 132,
                      borderRadius: 12,
                      overflow: 'hidden',
                      border: '1px solid #E5E7EB',
                      marginBottom: 12,
                      pointerEvents: 'none'
                    }}>
                      <PassengerLiveMap
                        origin={featuredRide.origin}
                        destination={featuredRide.destination}
                      />
                    </div>

                    <div style={{ fontSize: '1.08rem', fontWeight: 900, color: '#0F172A', lineHeight: 1.25 }}>
                      {destTitle}
                    </div>
                    <div style={{ fontSize: '0.78rem', color: '#64748B', marginTop: 4 }}>
                      {formatActivityDateTime(featuredRide.date, featuredRide.time)}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: '0.82rem', color: '#475569', fontWeight: 700, marginTop: 4 }}>
                      <span>
                        R$ {displayPrice.toFixed(2).replace('.', ',')}
                        {isCancelled ? ' • Cancelada' : ''}
                        {hiddenRideIds.includes(featuredRide.id) ? ' • Ocultada' : ''}
                      </span>
                      <PaymentMethodBadge method={featuredRide.paymentMethod} compact iconSize={13} />
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 }}>
                      {renderReagendarPill(featuredRide)}
                      {featuredRide.status === 'finalizada' && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setReceiptRide(featuredRide);
                          }}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 5,
                            background: 'none',
                            border: 'none',
                            color: '#475569',
                            fontSize: '0.76rem',
                            fontWeight: 700,
                            cursor: 'pointer'
                          }}
                        >
                          <Receipt size={14} />
                          <span>Recibo</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })()}

              {/* Demais viagens em lista limpa estilo Uber */}
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {listPastRides.map(ride => {
                  const destTitle = ride.destination.reference || ride.destination.address.split(',')[0];
                  const isCancelled = ride.status === 'cancelada';
                  const displayPrice = isCancelled ? 0 : ride.totalPrice;
                  const isElectric = String(ride.category || '').toLowerCase().includes('exec') ||
                    String(ride.category || '').toLowerCase().includes('plus');

                  return (
                    <div
                      key={ride.id}
                      onClick={() => setSelectedRide(ride)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 12,
                        padding: '14px 0',
                        borderBottom: '1px solid #F1F5F9',
                        cursor: 'pointer'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0, flex: 1 }}>
                        {/* Miniatura quadrada estilo Uber */}
                        <div style={{
                          width: 56,
                          height: 56,
                          borderRadius: 12,
                          backgroundColor: '#F3F4F6',
                          border: '1px solid #E5E7EB',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          position: 'relative',
                          flexShrink: 0
                        }}>
                          <Car size={24} color="#0F172A" />
                          {isElectric && (
                            <Zap size={11} color="#58B200" fill="#58B200" style={{ position: 'absolute', top: 7, right: 7 }} />
                          )}
                        </div>

                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{
                            fontSize: '0.94rem',
                            fontWeight: 800,
                            color: '#0F172A',
                            lineHeight: 1.2,
                            overflow: 'hidden',
                            display: '-webkit-box',
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: 'vertical'
                          }}>
                            {destTitle}
                          </div>
                          <div style={{ fontSize: '0.75rem', color: '#64748B', marginTop: 3 }}>
                            {formatActivityDateTime(ride.date, ride.time)}
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', fontSize: '0.76rem', color: isCancelled ? '#64748B' : '#0F172A', fontWeight: 600, marginTop: 2 }}>
                            <span>
                              R$ {displayPrice.toFixed(2).replace('.', ',')}
                              {isCancelled ? ' • Cancelada' : ''}
                              {hiddenRideIds.includes(ride.id) ? ' • Ocultada' : ''}
                            </span>
                            <PaymentMethodBadge method={ride.paymentMethod} compact iconSize={11} />
                          </div>
                        </div>
                      </div>

                      {renderReagendarPill(ride)}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════
          MODAL FULLSCREEN: "INFORMAÇÕES DA VIAGEM" (ESTILO UBER PASSAGEIRO)
          ═══════════════════════════════════════════════════════════════════════ */}
      {selectedRide && createPortal((() => {
        const st = getActivityStatusInfo(selectedRide.status);
        const isCancelled = selectedRide.status === 'cancelada';
        const isHidden = hiddenRideIds.includes(selectedRide.id);
        const pickupClock = selectedRide.time || formatHourFromIso(selectedRide.createdAt);
        const dropoffClock = selectedRide.status === 'finalizada' ? formatHourFromIso(selectedRide.updatedAt) : '';
        const tipMatch = String(selectedRide.passengerNotes || '').match(/Gorjeta:\s*R\$\s*([\d.,]+)/i);
        const recordedTipLabel = tipMatch ? `R$ ${tipMatch[1]}` : '';

        return (
          <div
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 9999,
              backgroundColor: 'rgba(15, 23, 42, 0.55)',
              display: 'flex',
              justifyContent: 'center'
            }}
            onClick={() => setSelectedRide(null)}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                width: '100%',
                maxWidth: 480,
                height: '100dvh',
                backgroundColor: '#FFFFFF',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden'
              }}
            >
              {/* Barra Superior */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '14px 16px',
                borderBottom: '1px solid #F1F5F9',
                backgroundColor: '#FFFFFF',
                flexShrink: 0
              }}>
                <button
                  type="button"
                  onClick={() => setSelectedRide(null)}
                  aria-label="Fechar"
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: '50%',
                    border: 'none',
                    backgroundColor: '#F3F4F6',
                    color: '#0F172A',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer'
                  }}
                >
                  <X size={18} />
                </button>
                <span style={{ fontSize: '0.96rem', fontWeight: 800, color: '#0F172A' }}>
                  Informações da viagem
                </span>
                <div style={{ width: 34 }} />
              </div>

              {/* Conteúdo Rolável */}
              <div style={{
                flex: 1,
                overflowY: 'auto',
                WebkitOverflowScrolling: 'touch',
                padding: '14px 16px 32px 16px'
              }}>
                {/* Mini Mapa da Viagem */}
                <div style={{
                  height: 162,
                  borderRadius: 16,
                  overflow: 'hidden',
                  border: '1px solid #E5E7EB',
                  marginBottom: 16,
                  pointerEvents: 'none'
                }}>
                  <PassengerLiveMap
                    origin={selectedRide.origin}
                    destination={selectedRide.destination}
                    driverPos={selectedRide.driverLocation || null}
                    searchingPulse={selectedRide.status === 'aguardando_confirmacao'}
                  />
                </div>

                {/* Título + Avatar do Motorista */}
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 14 }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <h2 style={{
                      margin: 0,
                      fontSize: '1.42rem',
                      fontWeight: 900,
                      color: '#0F172A',
                      letterSpacing: '-0.025em',
                      lineHeight: 1.15
                    }}>
                      {(selectedRide.serviceType === 'entregas' || Boolean(selectedRide.deliveryDetails) || resolveCategoryType(selectedRide.category || '') === 'entregas')
                        ? `Entrega pelo ${selectedRide.categoryName || 'Entregas'}`
                        : `Viagem pelo ${selectedRide.categoryName || 'Padrão'}`}
                    </h2>

                    <div style={{ fontSize: '0.84rem', color: '#475569', marginTop: 10 }}>
                      {formatActivityDateTime(selectedRide.date, selectedRide.time)}
                    </div>

                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      marginTop: 4,
                      fontSize: '0.86rem',
                      fontWeight: 700,
                      color: '#0F172A'
                    }}>
                      <span>R$ {(isCancelled ? 0 : selectedRide.totalPrice).toFixed(2).replace('.', ',')}</span>
                      <span style={{ color: '#94A3B8' }}>•</span>
                      <span>{formatRideCode(selectedRide)}</span>
                      <button
                        type="button"
                        onClick={() => handleCopyCode(formatRideCode(selectedRide))}
                        style={{ background: 'none', border: 'none', color: '#64748B', cursor: 'pointer', padding: 2, display: 'inline-flex' }}
                        title="Copiar código"
                      >
                        {copiedId === formatRideCode(selectedRide) ? <Check size={13} color="#16A34A" /> : <Copy size={13} />}
                      </button>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
                      <span style={{
                        display: 'inline-block',
                        padding: '3px 9px',
                        borderRadius: 6,
                        backgroundColor: st.bg,
                        color: st.color,
                        fontSize: '0.73rem',
                        fontWeight: 800
                      }}>
                        {st.label}
                      </span>
                      <PaymentMethodBadge method={selectedRide.paymentMethod} compact={false} iconSize={14} />
                    </div>
                  </div>

                  {/* Avatar circular do motorista */}
                  <div style={{
                    width: 54,
                    height: 54,
                    borderRadius: '50%',
                    backgroundColor: '#F3F4F6',
                    border: '1px solid #E5E7EB',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    overflow: 'hidden',
                    flexShrink: 0
                  }}>
                    {selectedRide.driverPhoto ? (
                      <img src={selectedRide.driverPhoto} alt={selectedRide.driverName || 'Motorista'} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                      <User size={24} color="#64748B" />
                    )}
                  </div>
                </div>

                {/* Botão Recibo + Ver ao Vivo + Cancelar (destaque Uber) */}
                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10, marginTop: 14, paddingBottom: 16, borderBottom: '1px solid #F1F5F9' }}>
                  <button
                    type="button"
                    onClick={() => setReceiptRide(selectedRide)}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 7,
                      backgroundColor: '#F3F4F6',
                      color: '#0F172A',
                      border: 'none',
                      borderRadius: 999,
                      padding: '9px 15px',
                      fontSize: '0.82rem',
                      fontWeight: 800,
                      cursor: 'pointer'
                    }}
                  >
                    <Receipt size={15} />
                    <span>Recibo</span>
                  </button>

                  {st.isLive && (
                    <button
                      type="button"
                      onClick={() => {
                        const target = selectedRide;
                        setSelectedRide(null);
                        if (onOpenActiveRide) {
                          onOpenActiveRide(target);
                        } else {
                          setLiveTrackingRide(target);
                        }
                      }}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 7,
                        backgroundColor: '#111111',
                        color: '#FFFFFF',
                        border: 'none',
                        borderRadius: 999,
                        padding: '9px 15px',
                        fontSize: '0.82rem',
                        fontWeight: 800,
                        cursor: 'pointer'
                      }}
                    >
                      <Navigation size={14} />
                      <span>Acompanhar viagem</span>
                    </button>
                  )}

                  {canPassengerEditRoute(selectedRide) && (
                    <button
                      type="button"
                      onClick={() => setEditRouteTargetRide(selectedRide)}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        backgroundColor: '#EFF6FF',
                        color: '#1D4ED8',
                        border: '1px solid #BFDBFE',
                        borderRadius: 999,
                        padding: '9px 15px',
                        fontSize: '0.82rem',
                        fontWeight: 800,
                        cursor: 'pointer'
                      }}
                    >
                      <Pencil size={13} />
                      <span>Alterar rota</span>
                    </button>
                  )}

                  {canPassengerCancelRide(selectedRide) && (
                    <button
                      type="button"
                      onClick={() => setCancelTargetRide(selectedRide)}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        backgroundColor: '#FEF2F2',
                        color: '#DC2626',
                        border: '1px solid #FECACA',
                        borderRadius: 999,
                        padding: '9px 15px',
                        fontSize: '0.82rem',
                        fontWeight: 800,
                        cursor: 'pointer'
                      }}
                    >
                      <span>
                        {selectedRide.status === 'aguardando_pagamento' || selectedRide.status === 'aguardando_confirmacao'
                          ? 'Cancelar solicitação'
                          : 'Cancelar viagem'}
                      </span>
                    </button>
                  )}
                </div>

                {/* Detalhes da Entrega (quando modalidade Entregas) */}
                {(selectedRide.serviceType === 'entregas' || Boolean(selectedRide.deliveryDetails) || resolveCategoryType(selectedRide.category || '') === 'entregas') && selectedRide.deliveryDetails && (
                  <div style={{
                    marginTop: 12,
                    padding: '10px 12px',
                    borderRadius: 12,
                    backgroundColor: '#F0FDF4',
                    border: '1px solid #BBF7D0',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 4
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.82rem', fontWeight: 800, color: '#14532D' }}>
                      <Package size={15} color="#15803D" />
                      <span>{selectedRide.deliveryDetails.itemDescription} ({selectedRide.deliveryDetails.packageSize || 'pequeno'})</span>
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#166534', fontWeight: 600 }}>
                      {selectedRide.deliveryDetails.role === 'sender' ? 'Destinatário:' : 'Remetente:'}{' '}
                      <strong>{selectedRide.deliveryDetails.recipientName}</strong> ({selectedRide.deliveryDetails.recipientPhone})
                    </div>
                    <div style={{ fontSize: '0.73rem', color: '#15803D', fontWeight: 600 }}>
                      Entrega:{' '}
                      {selectedRide.deliveryDetails.dropoffMode === 'portaria'
                        ? 'Na portaria'
                        : selectedRide.deliveryDetails.dropoffMode === 'recepcao'
                          ? 'Recepção / Loja'
                          : 'Em mãos'}
                      {selectedRide.deliveryDetails.instructions ? ` • Obs: ${selectedRide.deliveryDetails.instructions}` : ''}
                    </div>
                  </div>
                )}

                {/* Trajeto Origem -> Destino com Horários */}
                <div style={{ padding: '14px 0', borderBottom: '1px solid #F1F5F9', display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, minWidth: 0, flex: 1 }}>
                      <span style={{
                        width: 9,
                        height: 9,
                        borderRadius: '50%',
                        border: '2.5px solid #0F172A',
                        marginTop: 5,
                        flexShrink: 0
                      }} />
                      <span style={{ fontSize: '0.82rem', color: '#0F172A', lineHeight: 1.4, fontWeight: 500 }}>
                        {selectedRide.origin.address}
                      </span>
                    </div>
                    {pickupClock && (
                      <span style={{ fontSize: '0.76rem', color: '#64748B', fontWeight: 600, flexShrink: 0 }}>
                        {pickupClock}
                      </span>
                    )}
                  </div>

                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, minWidth: 0, flex: 1 }}>
                      <span style={{
                        width: 9,
                        height: 9,
                        borderRadius: 2,
                        border: '2.5px solid #0F172A',
                        marginTop: 5,
                        flexShrink: 0
                      }} />
                      <span style={{ fontSize: '0.82rem', color: '#0F172A', lineHeight: 1.4, fontWeight: 500 }}>
                        {selectedRide.destination.address}
                      </span>
                    </div>
                    {dropoffClock && (
                      <span style={{ fontSize: '0.76rem', color: '#64748B', fontWeight: 600, flexShrink: 0 }}>
                        {dropoffClock}
                      </span>
                    )}
                  </div>
                </div>

                {/* Valor Extra / Gorjeta */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 10,
                  padding: '15px 0',
                  borderBottom: '1px solid #F1F5F9'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <HandCoins size={19} color="#0F172A" />
                    <span style={{ fontSize: '0.86rem', fontWeight: 600, color: '#0F172A' }}>
                      {recordedTipLabel
                        ? `Valor extra adicionado: ${recordedTipLabel}`
                        : 'Nenhum valor extra adicionado'}
                    </span>
                  </div>
                  {selectedRide.status === 'finalizada' && !recordedTipLabel && !selectedRide.passengerRating && (
                    <button
                      type="button"
                      onClick={() => setRatingRide(selectedRide)}
                      style={{
                        backgroundColor: '#F3F4F6',
                        color: '#0F172A',
                        border: 'none',
                        borderRadius: 999,
                        padding: '8px 13px',
                        fontSize: '0.76rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                        whiteSpace: 'nowrap'
                      }}
                    >
                      Adicionar valor extra
                    </button>
                  )}
                </div>

                {/* Avaliação */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 10,
                  padding: '15px 0',
                  borderBottom: '1px solid #F1F5F9'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <Star size={19} color="#0F172A" fill={selectedRide.passengerRating ? '#F59E0B' : 'none'} />
                    <span style={{ fontSize: '0.86rem', fontWeight: 600, color: '#0F172A' }}>
                      {selectedRide.passengerRating
                        ? `Avaliação: ${selectedRide.passengerRating} ★`
                        : 'Sem avaliação'}
                    </span>
                  </div>
                  {selectedRide.status === 'finalizada' && !selectedRide.passengerRating && (
                    <button
                      type="button"
                      onClick={() => setRatingRide(selectedRide)}
                      style={{
                        backgroundColor: '#F3F4F6',
                        color: '#0F172A',
                        border: 'none',
                        borderRadius: 999,
                        padding: '8px 13px',
                        fontSize: '0.76rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                        whiteSpace: 'nowrap'
                      }}
                    >
                      Avaliar viagem
                    </button>
                  )}
                </div>

                {/* Ocultar esta viagem */}
                <button
                  type="button"
                  onClick={() => (isHidden ? handleUnhideRide(selectedRide.id) : handleHideRide(selectedRide.id))}
                  style={{
                    width: '100%',
                    background: 'none',
                    border: 'none',
                    borderBottom: '1px solid #F1F5F9',
                    padding: '15px 0',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 12,
                    cursor: 'pointer',
                    textAlign: 'left'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    {isHidden ? <Eye size={19} color="#0F172A" /> : <EyeOff size={19} color="#0F172A" />}
                    <div>
                      <div style={{ fontSize: '0.88rem', fontWeight: 700, color: '#0F172A' }}>
                        {isHidden ? 'Exibir viagem novamente' : 'Ocultar esta viagem'}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: '#64748B', marginTop: 1 }}>
                        {isHidden
                          ? 'Restaure esta viagem na sua atividade anterior'
                          : 'Remova esta viagem da sua atividade anterior'}
                      </div>
                    </div>
                  </div>
                  <ChevronRight size={17} color="#94A3B8" />
                </button>

                {/* Ajuda e segurança */}
                <div style={{ paddingTop: 18 }}>
                  <h3 style={{ margin: '0 0 10px 0', fontSize: '1.12rem', fontWeight: 900, color: '#0F172A' }}>
                    Ajuda e segurança
                  </h3>

                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <button
                      type="button"
                      onClick={() => handleRebook(selectedRide)}
                      style={{
                        width: '100%',
                        background: 'none',
                        border: 'none',
                        borderBottom: '1px solid #F1F5F9',
                        padding: '13px 0',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        cursor: 'pointer',
                        color: '#0F172A',
                        fontSize: '0.86rem',
                        fontWeight: 600
                      }}
                    >
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
                        <RotateCcw size={17} />
                        <span>Reagendar este trajeto</span>
                      </span>
                      <ChevronRight size={16} color="#94A3B8" />
                    </button>

                    {selectedRide.status === 'em_andamento' && (
                      <button
                        type="button"
                        onClick={() => setIsSosOpen(true)}
                        style={{
                          width: '100%',
                          background: 'none',
                          border: 'none',
                          borderBottom: '1px solid #F1F5F9',
                          padding: '13px 0',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          cursor: 'pointer',
                          color: '#B91C1C',
                          fontSize: '0.86rem',
                          fontWeight: 700
                        }}
                      >
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
                          <ShieldCheck size={17} />
                          <span>Central de Emergência SOS</span>
                        </span>
                        <ChevronRight size={16} color="#94A3B8" />
                      </button>
                    )}

                    <a
                      href={`https://wa.me/${getCleanWhatsappNumber(config.companyWhatsapp)}?text=Ol%C3%A1,%20preciso%20de%20ajuda%20sobre%20a%20viagem%20${encodeURIComponent(formatRideCode(selectedRide))}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        width: '100%',
                        borderBottom: '1px solid #F1F5F9',
                        padding: '13px 0',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        textDecoration: 'none',
                        color: '#0F172A',
                        fontSize: '0.86rem',
                        fontWeight: 600
                      }}
                    >
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
                        <WhatsAppIcon size={17} />
                        <span>Atendimento WhatsApp</span>
                      </span>
                      <ChevronRight size={16} color="#94A3B8" />
                    </a>

                    <a
                      href={`/viagem/${selectedRide.id}`}
                      style={{
                        width: '100%',
                        borderBottom: '1px solid #F1F5F9',
                        padding: '13px 0',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        textDecoration: 'none',
                        color: '#0F172A',
                        fontSize: '0.86rem',
                        fontWeight: 600
                      }}
                    >
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
                        <FileText size={17} />
                        <span>Acompanhar página da viagem</span>
                      </span>
                      <ChevronRight size={16} color="#94A3B8" />
                    </a>

                    <a
                      href={getGoogleMapsRouteUrl(selectedRide.origin, selectedRide.destination)}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        width: '100%',
                        padding: '13px 0',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        textDecoration: 'none',
                        color: '#475569',
                        fontSize: '0.84rem',
                        fontWeight: 600
                      }}
                    >
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
                        <ExternalLink size={16} />
                        <span>Abrir rota no Google Maps</span>
                      </span>
                      <ChevronRight size={16} color="#94A3B8" />
                    </a>
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })(), document.body)}

      {/* Recibo da Viagem */}
      {receiptRide && (
        <RideReceiptModal
          isOpen={Boolean(receiptRide)}
          onClose={() => setReceiptRide(null)}
          ride={receiptRide}
          config={config}
        />
      )}

      {/* Avaliação / Valor Extra (Gorjeta) */}
      <RideRatingBottomSheet
        isOpen={Boolean(ratingRide)}
        ride={ratingRide}
        raterRole="cliente"
        onClose={() => setRatingRide(null)}
        onSubmitted={() => {
          setRatingRide(null);
          StorageService.syncFromDatabase().then(() => updateFromStore());
        }}
      />

      {/* Tela de Acompanhamento GPS do Cliente */}
      {liveTrackingRide && (
        <LiveGpsNavigationScreen
          isOpen={Boolean(liveTrackingRide)}
          ride={liveTrackingRide}
          userRole="client"
          onClose={() => setLiveTrackingRide(null)}
          config={config}
        />
      )}

      {/* Central de Emergência SOS */}
      <SosEmergencyModal
        isOpen={isSosOpen}
        onClose={() => setIsSosOpen(false)}
        currentLocationText={selectedRide ? `${selectedRide.origin.address} ➔ ${selectedRide.destination.address}` : 'Lauro Müller e Região - SC'}
        rideId={selectedRide?.id}
        driverPhone={config?.driverPhone || config?.companyPhone || config?.companyWhatsapp}
      />

      {/* Central de Notificações */}
      <NotificationsModal
        isOpen={isNotificationsOpen}
        onClose={() => setIsNotificationsOpen(false)}
        userRole="client"
        onSelectRide={(rId) => {
          const found = localRides.find(r => r.id === rId);
          if (found) setSelectedRide(found);
        }}
      />

      {/* Cancelamento pelo Passageiro */}
      <RideCancelModal
        isOpen={Boolean(cancelTargetRide)}
        ride={cancelTargetRide}
        config={config}
        onClose={() => setCancelTargetRide(null)}
        onCancelled={(result) => {
          const cancelledId = cancelTargetRide?.id;
          setCancelTargetRide(null);
          if (!cancelledId) return;
          const updatedRide =
            StorageService.getRides().find((r) => r.id === cancelledId) ||
            result.ride ||
            (cancelTargetRide ? { ...cancelTargetRide, status: 'cancelada' as const, cancelledBy: 'passenger' as const } : undefined);
          if (updatedRide) {
            setLocalRides((prev) => prev.map((r) => (r.id === cancelledId ? updatedRide : r)));
            if (selectedRide && selectedRide.id === cancelledId) {
              setSelectedRide(updatedRide);
            }
          }
        }}
      />

      {/* Alteração de Origem/Destino antes do Embarque */}
      <RideEditRouteModal
        isOpen={Boolean(editRouteTargetRide)}
        ride={editRouteTargetRide}
        config={config}
        onClose={() => setEditRouteTargetRide(null)}
        onUpdated={(updated) => {
          setEditRouteTargetRide(null);
          setLocalRides((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
          if (selectedRide && selectedRide.id === updated.id) {
            setSelectedRide(updated);
          }
        }}
      />
    </div>
  );
};
