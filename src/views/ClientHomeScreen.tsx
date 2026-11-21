import React, { useState, useEffect } from 'react';
import {
  MapPin, Search, Clock, ChevronRight, Calendar,
  Home, Briefcase, Star, Navigation,
  Trash2, Plus, X, Dumbbell, MapPinned, Bell, Lock, ArrowRight, Car, Package
} from 'lucide-react';
import { LocationPoint, SystemConfig, ClientProfile, Ride } from '../types';
import { normalizeCategoriesFromConfig, resolveCategoryType } from '../utils/categoryEngine';
import { AddressPickerModal } from '../components/AddressPickerModal';
import { StorageService, findActivePassengerRide } from '../services/storage';
import { PassengerLiveMap } from '../components/PassengerLiveMap';
import { PassengerFeatureCarousel } from '../components/PassengerFeatureCarousel';
import { PartnersSponsorsSection } from '../components/PartnersSponsorsSection';
import { NotificationsModal } from '../components/NotificationsModal';
import { TermsPrivacyModal } from '../components/TermsPrivacyModal';

interface ClientHomeScreenProps {
  config: SystemConfig;
  currentUser?: ClientProfile | null;
  onStartBooking: (
    origin?: LocationPoint,
    destination?: LocationPoint,
    categoryId?: string,
    options?: { focusField?: 'origin' | 'destination'; openSchedule?: boolean }
  ) => void;
  onOpenActiveRide?: (ride: Ride) => void;
  onGoToMyRides: () => void;
  onGoToProfile: () => void;
  onOpenAuth?: (mode: 'login' | 'register') => void;
  onUserChange?: (user: ClientProfile) => void;
}

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Bom dia';
  if (h < 18) return 'Boa tarde';
  return 'Boa noite';
}

export const ClientHomeScreen: React.FC<ClientHomeScreenProps> = ({
  config,
  currentUser,
  onStartBooking,
  onOpenActiveRide,
  onGoToMyRides,
  onGoToProfile,
  onUserChange,
}) => {
  const [origin, setOrigin] = useState<LocationPoint | null>(null);
  const [destination, setDestination] = useState<LocationPoint | null>(null);
  const [pickingType, setPickingType] = useState<'origin' | 'destination' | 'new_saved' | null>(null);
  const [cancellingBannerRideId, setCancellingBannerRideId] = useState<string | null>(null);
  const [recentDestinations, setRecentDestinations] = useState<LocationPoint[]>([]);
  const [activeLiveRide, setActiveLiveRide] = useState<Ride | null>(null);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState<boolean>(false);
  const [isTermsOpen, setIsTermsOpen] = useState<boolean>(false);
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
    const checkActiveRide = () => {
      setActiveLiveRide(findActivePassengerRide(StorageService.getRides(), currentUser));
    };

    checkActiveRide();
    StorageService.syncFromDatabase().then(checkActiveRide);

    window.addEventListener('up_rides_updated', checkActiveRide);
    window.addEventListener('up_database_synced', checkActiveRide);

    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        StorageService.syncFromDatabase().then(checkActiveRide);
      }
    }, 1500);

    return () => {
      clearInterval(interval);
      window.removeEventListener('up_rides_updated', checkActiveRide);
      window.removeEventListener('up_database_synced', checkActiveRide);
    };
  }, [currentUser]);

  // Estados para gerenciar endereço fixo salvo
  const [selectedSavedAddr, setSelectedSavedAddr] = useState<{ id: string; label: string; address: string; lat: number; lng: number } | null>(null);
  const [isAddingSavedModal, setIsAddingSavedModal] = useState(false);
  const [newSavedLabel, setNewSavedLabel] = useState('Casa');
  const [customSavedLabel, setCustomSavedLabel] = useState('');

  useEffect(() => {
    setRecentDestinations(StorageService.getRecentDestinations());
  }, []);

  useEffect(() => {
    if (currentUser?.savedAddresses && currentUser.savedAddresses.length > 0 && !origin) {
      const first = currentUser.savedAddresses[0];
      setOrigin({ address: first.address, lat: first.lat, lng: first.lng, reference: first.label });
    }
  }, [currentUser]);

  // Seleção via AddressPickerModal
  const handleSelectLocation = (point: LocationPoint) => {
    if (pickingType === 'origin') {
      setOrigin(point);
    } else if (pickingType === 'destination') {
      setDestination(point);
      StorageService.addRecentDestination(point);
      setRecentDestinations(StorageService.getRecentDestinations());
      onStartBooking(origin || undefined, point);
    } else if (pickingType === 'new_saved') {
      // Salva endereço fixo diretamente no perfil do cliente
      if (!currentUser) return;
      const label = newSavedLabel === 'Outro' && customSavedLabel.trim() ? customSavedLabel.trim() : newSavedLabel;
      const newAddressItem = {
        id: `addr-${Date.now()}`,
        label,
        address: point.address,
        lat: point.lat,
        lng: point.lng,
      };

      const updatedList = [...(currentUser.savedAddresses || []), newAddressItem];
      const updatedUser: ClientProfile = { ...currentUser, savedAddresses: updatedList };

      StorageService.saveClient(updatedUser);
      StorageService.setCurrentUser(updatedUser);
      if (onUserChange) onUserChange(updatedUser);

      // Limpa os estados do modal
      setIsAddingSavedModal(false);
      setCustomSavedLabel('');
    }
    setPickingType(null);
  };

  // Excluir endereço recente individual
  const handleRemoveRecent = (e: React.MouseEvent, addressToRemove: string) => {
    e.stopPropagation();
    StorageService.removeRecentDestination(addressToRemove);
    setRecentDestinations(StorageService.getRecentDestinations());
  };

  // Limpar todos os recentes
  const handleClearAllRecents = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm('Deseja limpar todo o histórico de endereços recentes?')) {
      StorageService.clearRecentDestinations();
      setRecentDestinations([]);
    }
  };

  // Aplicar endereço fixo como Partida
  const handleApplySavedAsOrigin = () => {
    if (!selectedSavedAddr) return;
    setOrigin({
      address: selectedSavedAddr.address,
      lat: selectedSavedAddr.lat,
      lng: selectedSavedAddr.lng,
      reference: selectedSavedAddr.label
    });
    setSelectedSavedAddr(null);
  };

  // Aplicar endereço fixo como Destino
  const handleApplySavedAsDestination = () => {
    if (!selectedSavedAddr) return;
    const destPoint: LocationPoint = {
      address: selectedSavedAddr.address,
      lat: selectedSavedAddr.lat,
      lng: selectedSavedAddr.lng,
      reference: selectedSavedAddr.label
    };
    setDestination(destPoint);
    StorageService.addRecentDestination(destPoint);
    setRecentDestinations(StorageService.getRecentDestinations());
    setSelectedSavedAddr(null);
    onStartBooking(origin || undefined, destPoint);
  };

  // Excluir endereço fixo salvo do perfil
  const handleDeleteSavedAddress = () => {
    if (!currentUser || !selectedSavedAddr) return;
    const updatedList = (currentUser.savedAddresses || []).filter(a => a.id !== selectedSavedAddr.id);
    const updatedUser: ClientProfile = { ...currentUser, savedAddresses: updatedList };

    StorageService.saveClient(updatedUser);
    StorageService.setCurrentUser(updatedUser);
    if (onUserChange) onUserChange(updatedUser);
    setSelectedSavedAddr(null);
  };

  const handleQuickDest = (dest: LocationPoint) => {
    setDestination(dest);
    StorageService.addRecentDestination(dest);
    setRecentDestinations(StorageService.getRecentDestinations());
    onStartBooking(origin || undefined, dest);
  };

  const firstName = currentUser?.name?.split(' ')[0] ?? '';
  const savedAddresses = currentUser?.savedAddresses ?? [];
  const onlineDrivers = StorageService.getOnlineDrivers();
  const onlineDriversCount = StorageService.getOnlineDriversCount();

  return (
    <div
      className="animate-fade-in"
      style={{
        backgroundColor: '#FFFFFF',
        minHeight: '100%',
        paddingBottom: 'calc(104px + env(safe-area-inset-bottom, 0px))',
        width: '100%',
        maxWidth: '100%',
        overflowX: 'hidden'
      }}
    >

      {/* Modal de Busca no Mapa */}
      <AddressPickerModal
        isOpen={pickingType !== null}
        onClose={() => setPickingType(null)}
        title={
          pickingType === 'origin'
            ? 'Local de Partida'
            : pickingType === 'new_saved'
              ? 'Localizar Endereço Fixo'
              : 'Para onde você vai?'
        }
        onSelect={handleSelectLocation}
      />

      {/* ── HEADER FLUTUANTE TRANSPARENTE (BRANCO GLASSMORPHISM) ──────────────── */}
      <div style={{
        position: 'sticky',
        top: 'calc(8px + env(safe-area-inset-top, 0px))',
        zIndex: 30,
        background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.48) 0%, rgba(255, 255, 255, 0.24) 100%)',
        backdropFilter: 'blur(24px) saturate(210%)',
        WebkitBackdropFilter: 'blur(24px) saturate(210%)',
        margin: '8px 12px 0 12px',
        padding: '10px 14px',
        borderRadius: 22,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 8,
        border: '1px solid rgba(255, 255, 255, 0.72)',
        boxShadow: '0 10px 28px rgba(15, 23, 42, 0.1), inset 0 1.5px 1px rgba(255, 255, 255, 0.9), inset 0 -1px 1px rgba(255, 255, 255, 0.32)',
        width: 'calc(100% - 24px)',
        boxSizing: 'border-box'
      }}>
        <img
          src="/logo-horizontal.png"
          alt="KAVRO DRIVE"
          style={{ height: 32, maxWidth: 136, objectFit: 'contain', flexShrink: 0 }}
        />

        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
          <button
            type="button"
            onClick={() => setIsNotificationsOpen(true)}
            style={{
              width: 32,
              height: 32,
              borderRadius: '50%',
              backgroundColor: '#F3F4F6',
              border: '1px solid #E5E7EB',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#111827',
              cursor: 'pointer',
              position: 'relative',
              flexShrink: 0
            }}
            title="Notificações e Avisos"
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
        </div>
      </div>

      {/* ── CARTÃO DE VIAGEM ATIVA ESTILO UBER (LIMPO + BARRA DE PROGRESSO) ── */}
      {activeLiveRide && (() => {
        const isWaitingSearch =
          activeLiveRide.status === 'aguardando_confirmacao' ||
          activeLiveRide.status === 'aguardando_pagamento';
        const statusHeadline =
          activeLiveRide.status === 'aguardando_pagamento'
            ? 'Finalize o pagamento PIX'
            : activeLiveRide.status === 'aguardando_confirmacao'
              ? 'Procurando motorista...'
              : activeLiveRide.status === 'na_fila'
                ? 'Motorista finalizando corrida anterior'
                : activeLiveRide.status === 'no_local'
                  ? 'Seu motorista chegou!'
                  : activeLiveRide.status === 'em_andamento'
                    ? 'Viagem em andamento'
                    : 'Motorista a caminho';
        const statusSubline = !isWaitingSearch && activeLiveRide.driverName
          ? [activeLiveRide.driverName, activeLiveRide.driverVehicle, activeLiveRide.driverPlate]
              .filter(Boolean)
              .join(' • ')
          : activeLiveRide.destination?.address || 'Conectando com motoristas próximos';

        const handleOpenTrip = () => {
          if (onOpenActiveRide) {
            onOpenActiveRide(activeLiveRide);
          } else {
            onStartBooking(origin || undefined, destination || undefined);
          }
        };

        return (
          <div
            role="button"
            tabIndex={0}
            onClick={handleOpenTrip}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handleOpenTrip();
              }
            }}
            style={{
              margin: '12px 16px 0 16px',
              backgroundColor: '#FFFFFF',
              borderRadius: 18,
              border: '1px solid #E5E7EB',
              overflow: 'hidden',
              boxShadow: '0 4px 16px rgba(15, 23, 42, 0.07)',
              cursor: 'pointer'
            }}
          >
            <div className="kavro-radar-track" style={{ borderRadius: 0, height: 3 }} aria-hidden="true">
              <div
                className="kavro-radar-beam"
                style={{
                  background: isWaitingSearch
                    ? 'linear-gradient(90deg, transparent, #276EF1 40%, #111111 70%, transparent)'
                    : 'linear-gradient(90deg, transparent, #16A34A 45%, #111111 75%, transparent)'
                }}
              />
            </div>

            <div style={{
              padding: '12px 14px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 11, minWidth: 0, flex: 1 }}>
                {!isWaitingSearch && activeLiveRide.driverPhoto ? (
                  <img
                    src={activeLiveRide.driverPhoto}
                    alt={activeLiveRide.driverName || 'Motorista'}
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: '50%',
                      objectFit: 'cover',
                      border: '1.5px solid #E5E7EB',
                      flexShrink: 0
                    }}
                  />
                ) : (
                  <div style={{
                    width: 40,
                    height: 40,
                    borderRadius: '50%',
                    backgroundColor: '#F3F4F6',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#111111',
                    flexShrink: 0,
                    position: 'relative'
                  }}>
                    <Navigation size={17} />
                    <span
                      className={isWaitingSearch ? 'kavro-beacon-amber' : 'kavro-beacon-green'}
                      style={{
                        position: 'absolute',
                        top: 2,
                        right: 2,
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        backgroundColor: isWaitingSearch ? '#276EF1' : '#16A34A',
                        border: '1.5px solid #FFFFFF'
                      }}
                    />
                  </div>
                )}

                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{
                    fontSize: '0.9rem',
                    color: '#0F172A',
                    fontWeight: 800,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis'
                  }}>
                    {statusHeadline}
                  </div>
                  <div style={{
                    fontSize: '0.75rem',
                    color: '#64748B',
                    fontWeight: 600,
                    marginTop: 2,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis'
                  }}>
                    {statusSubline}
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                {activeLiveRide.status === 'aguardando_pagamento' && (
                  <button
                    type="button"
                    disabled={cancellingBannerRideId === activeLiveRide.id}
                    onClick={async (e) => {
                      e.stopPropagation();
                      if (cancellingBannerRideId === activeLiveRide.id) return;
                      setCancellingBannerRideId(activeLiveRide.id);
                      try {
                        await StorageService.cancelRide(
                          activeLiveRide.id,
                          'Cancelado pelo passageiro na tela inicial'
                        );
                      } finally {
                        setCancellingBannerRideId(null);
                      }
                    }}
                    style={{
                      backgroundColor: '#FEF2F2',
                      color: '#DC2626',
                      border: '1px solid #FECACA',
                      borderRadius: 999,
                      padding: '8px 11px',
                      fontSize: '0.74rem',
                      fontWeight: 800,
                      whiteSpace: 'nowrap',
                      cursor: cancellingBannerRideId === activeLiveRide.id ? 'wait' : 'pointer'
                    }}
                  >
                    {cancellingBannerRideId === activeLiveRide.id ? '...' : 'Cancelar'}
                  </button>
                )}
                <span style={{
                  backgroundColor: '#111111',
                  color: '#FFFFFF',
                  borderRadius: 999,
                  padding: '8px 13px',
                  fontSize: '0.76rem',
                  fontWeight: 800,
                  whiteSpace: 'nowrap',
                  flexShrink: 0
                }}>
                  Acompanhar
                </span>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── HERO DE BUSCA ESTILO UBER ("PARA ONDE?" + "AGORA") ────────────── */}
      <div style={{ padding: '16px 16px 6px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 12 }}>
          <h1 style={{
            margin: 0,
            fontSize: '1.35rem',
            fontWeight: 800,
            color: '#0F172A',
            letterSpacing: '-0.025em',
            lineHeight: 1.2
          }}>
            {currentUser ? `${getGreeting()}, ${firstName}` : 'Peça sua viagem Kavro'}
          </h1>

          <button
            type="button"
            onClick={() => onStartBooking(origin || undefined, destination || undefined, undefined, { focusField: 'origin' })}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              backgroundColor: '#F3F4F6',
              border: 'none',
              borderRadius: 999,
              padding: '6px 11px',
              fontSize: '0.72rem',
              fontWeight: 700,
              color: '#111827',
              maxWidth: '52%',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              cursor: 'pointer'
            }}
          >
            <MapPin size={12} color="#58B200" style={{ flexShrink: 0 }} />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {origin ? origin.address.split(',')[0] : 'Definir partida'}
            </span>
          </button>
        </div>

        {/* Barra de Pesquisa Icônica Estilo Uber */}
        <div
          onClick={() => onStartBooking(origin || undefined, undefined, undefined, { focusField: 'destination' })}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onStartBooking(origin || undefined, undefined, undefined, { focusField: 'destination' }); }}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: '#EFEFF4',
            borderRadius: 999,
            padding: '7px 7px 7px 16px',
            cursor: 'pointer',
            gap: 10
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>
            <Search size={19} color="#0F172A" strokeWidth={2.6} style={{ flexShrink: 0 }} />
            <span style={{
              fontSize: '1.05rem',
              fontWeight: 800,
              color: '#0F172A',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis'
            }}>
              {destination ? destination.address : 'Para onde?'}
            </span>
          </div>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onStartBooking(origin || undefined, undefined, undefined, { openSchedule: true });
            }}
            style={{
              backgroundColor: '#FFFFFF',
              color: '#0F172A',
              borderRadius: 999,
              border: 'none',
              padding: '8px 13px',
              fontSize: '0.78rem',
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              boxShadow: '0 2px 6px rgba(15, 23, 42, 0.08)',
              flexShrink: 0,
              cursor: 'pointer'
            }}
          >
            <Clock size={14} strokeWidth={2.4} />
            <span>Agora</span>
          </button>
        </div>

        {/* 2 Modalidades do Sistema: Viagem Padrão vs Entregas */}
        {(() => {
          const allCats = normalizeCategoriesFromConfig(config).filter(c => c.active);
          const firstPadraoCat = allCats.find(c => resolveCategoryType(c) !== 'entregas');
          const firstEntregasCat = allCats.find(c => resolveCategoryType(c) === 'entregas');
          return (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8, marginTop: 14, width: '100%', boxSizing: 'border-box' }}>
              <button
                type="button"
                onClick={() => onStartBooking(origin || undefined, destination || undefined, firstPadraoCat?.id || 'kavro_go')}
                style={{
                  width: '100%',
                  minWidth: 0,
                  maxWidth: '100%',
                  overflow: 'hidden',
                  boxSizing: 'border-box',
                  backgroundColor: '#F8FAFC',
                  border: '1px solid #E2E8F0',
                  borderRadius: 16,
                  padding: '11px 10px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'all 0.15s ease'
                }}
              >
                <div style={{
                  width: 36,
                  height: 36,
                  borderRadius: 11,
                  backgroundColor: '#111111',
                  color: '#FFFFFF',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0
                }}>
                  <Car size={18} />
                </div>
                <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
                  <div style={{ fontSize: '0.86rem', fontWeight: 800, color: '#0F172A', lineHeight: 1.15, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    Padrão
                  </div>
                  <div style={{ fontSize: '0.66rem', color: '#64748B', fontWeight: 600, marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    Viagem de passageiros
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => onStartBooking(origin || undefined, destination || undefined, firstEntregasCat?.id || 'kavro_entregas')}
                style={{
                  width: '100%',
                  minWidth: 0,
                  maxWidth: '100%',
                  overflow: 'hidden',
                  boxSizing: 'border-box',
                  backgroundColor: '#F0FDF4',
                  border: '1px solid #BBF7D0',
                  borderRadius: 16,
                  padding: '11px 10px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'all 0.15s ease'
                }}
              >
                <div style={{
                  width: 36,
                  height: 36,
                  borderRadius: 11,
                  backgroundColor: '#15803D',
                  color: '#FFFFFF',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0
                }}>
                  <Package size={18} />
                </div>
                <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 0 }}>
                    <span style={{ fontSize: '0.86rem', fontWeight: 800, color: '#0F172A', lineHeight: 1.15, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      Entregas
                    </span>
                    <span style={{
                      fontSize: '0.54rem',
                      fontWeight: 800,
                      backgroundColor: '#DCFCE7',
                      color: '#166534',
                      padding: '1px 4px',
                      borderRadius: 999,
                      flexShrink: 0
                    }}>
                      NOVO
                    </span>
                  </div>
                  <div style={{ fontSize: '0.66rem', color: '#166534', fontWeight: 600, marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    Envio de pacotes
                  </div>
                </div>
              </button>
            </div>
          );
        })()}
      </div>

      {/* ── LOCAIS SALVOS (ESTILO UBER CHIPS) + RECENTES ──────────────────── */}
      <div style={{ padding: '16px 16px 0 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, overflowX: 'auto', paddingBottom: 4 }}>
          {savedAddresses.length === 0 && (
            <>
              <button
                type="button"
                onClick={() => {
                  setNewSavedLabel('Casa');
                  setIsAddingSavedModal(true);
                }}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  backgroundColor: '#F3F4F6',
                  border: '1px solid #E5E7EB',
                  borderRadius: 999,
                  padding: '7px 12px',
                  fontSize: '0.78rem',
                  fontWeight: 700,
                  color: '#0F172A',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  flexShrink: 0
                }}
              >
                <Home size={14} color="#0F172A" />
                <span>Casa</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setNewSavedLabel('Trabalho');
                  setIsAddingSavedModal(true);
                }}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  backgroundColor: '#F3F4F6',
                  border: '1px solid #E5E7EB',
                  borderRadius: 999,
                  padding: '7px 12px',
                  fontSize: '0.78rem',
                  fontWeight: 700,
                  color: '#0F172A',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  flexShrink: 0
                }}
              >
                <Briefcase size={14} color="#0F172A" />
                <span>Trabalho</span>
              </button>
            </>
          )}
          {savedAddresses.map((addr) => {
            const l = addr.label.toLowerCase();
            const icon = l.includes('casa') || l.includes('resid')
              ? <Home size={14} color="#0F172A" />
              : l.includes('trabalho') || l.includes('empresa')
                ? <Briefcase size={14} color="#0F172A" />
                : l.includes('academia') || l.includes('treino')
                  ? <Dumbbell size={14} color="#0F172A" />
                  : <Star size={14} color="#0F172A" />;

            return (
              <button
                key={addr.id}
                type="button"
                onClick={() => setSelectedSavedAddr(addr)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  backgroundColor: '#F3F4F6',
                  border: '1px solid #E5E7EB',
                  borderRadius: 999,
                  padding: '7px 12px',
                  fontSize: '0.78rem',
                  fontWeight: 700,
                  color: '#0F172A',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  flexShrink: 0
                }}
              >
                {icon}
                <span>{addr.label}</span>
              </button>
            );
          })}

          <button
            type="button"
            onClick={() => setIsAddingSavedModal(true)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              backgroundColor: '#FFFFFF',
              border: '1px solid #CBD5E1',
              borderRadius: 999,
              padding: '7px 12px',
              fontSize: '0.78rem',
              fontWeight: 700,
              color: '#0F172A',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              flexShrink: 0
            }}
          >
            <Plus size={14} color="#58B200" strokeWidth={2.8} />
            <span>Adicionar local</span>
          </button>
        </div>

        {/* Lista limpa de Recentes estilo Uber (sem caixa pesada) */}
        {recentDestinations.length > 0 && (
          <div style={{ marginTop: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Destinos recentes
              </span>
              <button
                type="button"
                onClick={handleClearAllRecents}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#64748B',
                  fontSize: '0.72rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  padding: '2px 4px'
                }}
              >
                Limpar
              </button>
            </div>

            {recentDestinations.slice(0, 4).map((dest, i) => (
              <div
                key={i}
                onClick={() => handleQuickDest(dest)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: '10px 0',
                  borderBottom: '1px solid #F1F5F9',
                  cursor: 'pointer'
                }}
              >
                <div style={{
                  width: 36,
                  height: 36,
                  borderRadius: '50%',
                  backgroundColor: '#F3F4F6',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  marginRight: 12
                }}>
                  <Clock size={16} color="#0F172A" />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '0.88rem', fontWeight: 700, color: '#0F172A', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {dest.reference || dest.address.split(',')[0]}
                  </div>
                  <div style={{ fontSize: '0.74rem', color: '#64748B', marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {dest.address}
                  </div>
                </div>
                <button
                  type="button"
                  title="Remover dos recentes"
                  onClick={(e) => handleRemoveRecent(e, dest.address)}
                  style={{
                    background: 'none',
                    border: 'none',
                    padding: 6,
                    color: '#94A3B8',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginLeft: 6
                  }}
                >
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── PERTO DE VOCÊ: MAPA AO VIVO ESTILO UBER + CTA KAVRO ───────────── */}
      <div style={{ padding: '16px 16px 0 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <h2 style={{ margin: 0, fontSize: '0.96rem', fontWeight: 800, color: '#0F172A', letterSpacing: '-0.015em' }}>
            Perto de você
          </h2>
          <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 5,
            fontSize: '0.71rem',
            fontWeight: 700,
            color: onlineDriversCount > 0 ? '#15803D' : '#64748B'
          }}>
            <span style={{
              width: 7,
              height: 7,
              borderRadius: '50%',
              backgroundColor: onlineDriversCount > 0 ? '#22C55E' : '#94A3B8'
            }} />
            {onlineDriversCount} carro(s) na região
          </span>
        </div>

        <div
          onClick={() => onStartBooking(origin || undefined, destination || undefined)}
          style={{
            position: 'relative',
            height: 176,
            borderRadius: 18,
            overflow: 'hidden',
            border: '1px solid #E5E7EB',
            cursor: 'pointer',
            boxShadow: '0 2px 10px rgba(15, 23, 42, 0.05)'
          }}
        >
          <PassengerLiveMap
            origin={origin}
            destination={destination}
            nearbyDrivers={onlineDrivers
              .filter(d => d.location && typeof d.location.lat === 'number' && typeof d.location.lng === 'number')
              .map(d => ({ id: d.id, lat: d.location!.lat, lng: d.location!.lng }))}
          />
          <div style={{
            position: 'absolute',
            bottom: 10,
            right: 10,
            zIndex: 400,
            pointerEvents: 'none'
          }}>
            <span style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              backgroundColor: '#0F172A',
              color: '#FFFFFF',
              padding: '8px 14px',
              borderRadius: 999,
              fontSize: '0.76rem',
              fontWeight: 800,
              boxShadow: '0 4px 12px rgba(15, 23, 42, 0.25)'
            }}>
              <span>Chamar agora</span>
              <ArrowRight size={14} color="#76D800" />
            </span>
          </div>
        </div>
      </div>

      {/* ── MINHAS VIAGENS & PROTEÇÃO EM ROTA KAVRO (ESTILO UBER/KAVRO) ───── */}
      <div style={{ padding: '14px 16px 0 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div
          onClick={onGoToMyRides}
          style={{
            backgroundColor: '#F8FAFC',
            borderRadius: 16,
            padding: '12px 14px',
            border: '1px solid #E2E8F0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            cursor: 'pointer'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 38,
              height: 38,
              borderRadius: 12,
              backgroundColor: '#FFFFFF',
              border: '1px solid #E2E8F0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <Calendar size={18} color="#0F172A" />
            </div>
            <div>
              <div style={{ fontSize: '0.86rem', fontWeight: 800, color: '#0F172A' }}>Minhas Viagens &amp; Recibos</div>
              <div style={{ fontSize: '0.72rem', color: '#64748B' }}>Acompanhar trajeto e histórico completo</div>
            </div>
          </div>
          <ChevronRight size={17} color="#94A3B8" />
        </div>

        {/* Carrossel horizontal estilo Uber: Favoritos & Recursos de Segurança */}
        <PassengerFeatureCarousel
          config={config}
          currentUser={currentUser || null}
          activeRide={activeLiveRide}
          recentDestinations={recentDestinations}
          onUserChange={(updatedUser) => {
            if (onUserChange) onUserChange(updatedUser);
          }}
          onRequireAuth={onGoToProfile}
        />
      </div>

      {/* ── ÁREA DE PARCEIROS & PATROCINADORES NA HOME DO APP ── */}
      <PartnersSponsorsSection
        items={config.partnerBanners}
        variant="light"
        context="client"
        sectionEnabled={config.partnerShowOnClientHome !== false}
        hideWhenEmpty={Boolean(config.partnerHideEmptyPlaceholder)}
      />

      {/* ── RODAPÉ LGPD & SEGURANÇA DE DADOS (DISCRETO) ── */}
      <div style={{ padding: '14px 20px 4px 20px', textAlign: 'center' }}>
        <button
          type="button"
          onClick={() => setIsTermsOpen(true)}
          style={{
            background: 'none',
            border: 'none',
            fontSize: '0.68rem',
            color: '#94A3B8',
            cursor: 'pointer',
            lineHeight: 1.4,
            padding: '2px 4px',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
          }}
        >
          <Lock size={11} color="#94A3B8" />
          <span>Rotas protegidas para sua segurança •</span>
          <span style={{ textDecoration: 'underline', color: '#64748B', fontWeight: 700 }}>
            Termos &amp; LGPD
          </span>
        </button>
      </div>

      {/* Modal de Termos de Uso e Política de Privacidade (LGPD) */}
      <TermsPrivacyModal
        isOpen={isTermsOpen}
        onClose={() => setIsTermsOpen(false)}
        config={config}
      />

      {/* ── MODAL: AÇÕES PARA ENDEREÇO FIXO SALVO (APLICAR OU EXCLUIR) ── */}
      {selectedSavedAddr && (
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
          onClick={() => setSelectedSavedAddr(null)}
        >
          <div
            style={{
              width: '100%',
              maxWidth: 480,
              backgroundColor: '#ffffff',
              borderRadius: '24px 24px 0 0',
              padding: '24px 20px 32px 20px',
              boxShadow: '0 -4px 24px rgba(0,0,0,0.15)'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{
                  width: 40,
                  height: 40,
                  borderRadius: 12,
                  backgroundColor: 'rgba(118, 216, 0, 0.15)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#15803D'
                }}>
                  <MapPinned size={22} />
                </div>
                <div>
                  <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: '#121A21' }}>
                    {selectedSavedAddr.label}
                  </h3>
                  <p style={{ fontSize: '0.78rem', color: '#64748B', maxWidth: 280, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {selectedSavedAddr.address}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelectedSavedAddr(null)}
                style={{ background: '#F1F5F9', border: 'none', borderRadius: '50%', width: 32, height: 32, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                <X size={16} color="#64748B" />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <button
                onClick={handleApplySavedAsOrigin}
                style={{
                  width: '100%',
                  padding: '14px',
                  borderRadius: 14,
                  border: '1.5px solid #E2E8F0',
                  backgroundColor: '#ffffff',
                  fontSize: '0.9rem',
                  fontWeight: 700,
                  color: '#121A21',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8
                }}
              >
                <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: '#76D800' }} />
                <span>Aplicar como Ponto de Partida</span>
              </button>

              <button
                onClick={handleApplySavedAsDestination}
                className="btn-ios-primary"
                style={{ width: '100%', padding: '14px', fontSize: '0.9rem' }}
              >
                <MapPin size={18} />
                <span>Ir para cá (Destino da Viagem)</span>
              </button>

              <button
                onClick={handleDeleteSavedAddress}
                style={{
                  width: '100%',
                  padding: '12px',
                  borderRadius: 14,
                  border: 'none',
                  backgroundColor: 'rgba(239, 68, 68, 0.08)',
                  color: '#EF4444',
                  fontSize: '0.85rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  marginTop: 4
                }}
              >
                <Trash2 size={16} />
                <span>Excluir este local salvo</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: ADICIONAR NOVO ENDEREÇO FIXO ── */}
      {isAddingSavedModal && (
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
          onClick={() => setIsAddingSavedModal(false)}
        >
          <div
            style={{
              width: '100%',
              maxWidth: 480,
              backgroundColor: '#ffffff',
              borderRadius: '24px 24px 0 0',
              padding: '24px 20px 32px 20px',
              boxShadow: '0 -4px 24px rgba(0,0,0,0.15)'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
              <div>
                <h3 style={{ fontSize: '1.15rem', fontWeight: 800, color: '#121A21' }}>
                  Salvar Endereço Fixo
                </h3>
                <p style={{ fontSize: '0.78rem', color: '#64748B' }}>
                  Acesse sua Casa ou Trabalho com apenas um toque
                </p>
              </div>
              <button
                onClick={() => setIsAddingSavedModal(false)}
                style={{ background: '#F1F5F9', border: 'none', borderRadius: '50%', width: 32, height: 32, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                <X size={16} color="#64748B" />
              </button>
            </div>

            {/* Escolha do Tipo / Rótulo */}
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 700, color: '#475569', marginBottom: 8 }}>
                Identificação do Local
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
                {[
                  { id: 'Casa', icon: <Home size={16} /> },
                  { id: 'Trabalho', icon: <Briefcase size={16} /> },
                  { id: 'Academia', icon: <Dumbbell size={16} /> },
                  { id: 'Outro', icon: <Star size={16} /> }
                ].map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setNewSavedLabel(item.id)}
                    style={{
                      padding: '10px 4px',
                      borderRadius: 12,
                      border: newSavedLabel === item.id ? '2px solid #76D800' : '1.5px solid #E2E8F0',
                      backgroundColor: newSavedLabel === item.id ? 'rgba(118, 216, 0, 0.1)' : '#ffffff',
                      color: newSavedLabel === item.id ? '#121A21' : '#64748B',
                      fontWeight: 700,
                      fontSize: '0.78rem',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: 4,
                      cursor: 'pointer'
                    }}
                  >
                    {item.icon}
                    <span>{item.id}</span>
                  </button>
                ))}
              </div>

              {newSavedLabel === 'Outro' && (
                <input
                  type="text"
                  placeholder="Ex: Escola dos filhos, Casa da mãe..."
                  value={customSavedLabel}
                  onChange={(e) => setCustomSavedLabel(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '11px 14px',
                    borderRadius: 10,
                    border: '1.5px solid #CBD5E1',
                    fontSize: '0.85rem',
                    marginTop: 10
                  }}
                />
              )}
            </div>

            {/* Ação de Selecionar no Mapa */}
            <button
              onClick={() => {
                setPickingType('new_saved');
              }}
              className="btn-ios-primary"
              style={{ width: '100%', padding: '14px', fontSize: '0.95rem' }}
            >
              <Search size={18} />
              <span>Localizar no Mapa / GPS</span>
            </button>
          </div>
        </div>
      )}

      {/* Central de Notificações do Cliente */}
      <NotificationsModal
        isOpen={isNotificationsOpen}
        onClose={() => setIsNotificationsOpen(false)}
        userRole="client"
        onSelectRide={() => {
          onGoToMyRides();
        }}
      />

    </div>
  );
};
