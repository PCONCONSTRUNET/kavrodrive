import React, { useState, useEffect } from 'react';
import {
  MapPin, Search, Clock, ChevronRight, Calendar,
  Home, Briefcase, Star, Navigation, PhoneCall, User,
  Trash2, Plus, X, Check, Dumbbell, MapPinned, MoreVertical, ShieldCheck, Bell, Lock
} from 'lucide-react';
import { LocationPoint, SystemConfig, ClientProfile } from '../types';
import { AddressPickerModal } from '../components/AddressPickerModal';
import { StorageService } from '../services/storage';
import { formatPhone, formatRideCode, getCleanWhatsappNumber } from '../utils/format';
import { WhatsAppIcon } from '../components/WhatsAppIcon';
import { LiveGpsNavigationScreen } from '../components/LiveGpsNavigationScreen';
import { DriverPublicAuditModal } from '../components/DriverPublicAuditModal';
import { PassengerLiveMap } from '../components/PassengerLiveMap';
import { SosEmergencyModal } from '../components/SosEmergencyModal';
import { NotificationsModal } from '../components/NotificationsModal';
import { TermsPrivacyModal } from '../components/TermsPrivacyModal';
import { Ride } from '../types';

interface ClientHomeScreenProps {
  config: SystemConfig;
  currentUser?: ClientProfile | null;
  onStartBooking: (origin?: LocationPoint, destination?: LocationPoint) => void;
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
  onGoToMyRides,
  onGoToProfile,
  onUserChange,
}) => {
  const [origin, setOrigin] = useState<LocationPoint | null>(null);
  const [destination, setDestination] = useState<LocationPoint | null>(null);
  const [pickingType, setPickingType] = useState<'origin' | 'destination' | 'new_saved' | null>(null);
  const [recentDestinations, setRecentDestinations] = useState<LocationPoint[]>([]);
  const [liveTrackingRide, setLiveTrackingRide] = useState<Ride | null>(null);
  const [activeLiveRide, setActiveLiveRide] = useState<Ride | null>(null);
  const [allSystemRides, setAllSystemRides] = useState<Ride[]>(() => StorageService.getRides());
  const [isDriverAuditOpen, setIsDriverAuditOpen] = useState<boolean>(false);
  const [isSosOpen, setIsSosOpen] = useState<boolean>(false);
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
      const allRides = StorageService.getRides();
      setAllSystemRides(allRides);
      const uPhoneClean = (currentUser?.phone || '').replace(/\D/g, '');
      const active = allRides.find(r => {
        const rPhoneClean = (r.clientPhone || '').replace(/\D/g, '');
        const isUserMatch = !currentUser ||
          (uPhoneClean && rPhoneClean && uPhoneClean === rPhoneClean) ||
          (currentUser.id && r.clientId === currentUser.id) ||
          (currentUser.name && r.clientName && r.clientName.trim().toLowerCase() === currentUser.name.trim().toLowerCase());

        return isUserMatch && (
          r.status === 'aguardando_pagamento' ||
          r.status === 'aguardando_confirmacao' ||
          r.status === 'na_fila' ||
          r.status === 'confirmada' ||
          r.status === 'a_caminho' ||
          r.status === 'no_local' ||
          r.status === 'em_andamento'
        );
      });
      setActiveLiveRide(active || null);
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

  return (
    <div
      className="animate-fade-in"
      style={{
        backgroundColor: '#F7F8FA',
        paddingBottom: 16,
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

      {/* ── HEADER ORGANIZADO E COMPACTO (FIXO NO TOPO SEM CORTAR ÍCONES) ── */}
      <div style={{
        position: 'sticky',
        top: 0,
        zIndex: 30,
        backgroundColor: '#ffffff',
        padding: '12px 16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 8,
        borderBottom: '1px solid #F0F2F5',
        width: '100%',
        boxSizing: 'border-box'
      }}>
        <img
          src="/logo-horizontal.png"
          alt="KAVRO DRIVE"
          style={{ height: 36, maxWidth: 145, objectFit: 'contain', flexShrink: 0 }}
        />

        <div style={{ display: 'flex', gap: 7, alignItems: 'center', flexShrink: 0 }}>
          {/* 1. Botão de Emergência SOS */}
          <button
            type="button"
            onClick={() => setIsSosOpen(true)}
            style={{
              height: 32,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 4,
              backgroundColor: '#DC2626',
              color: '#FFFFFF',
              border: 'none',
              padding: '0 11px',
              borderRadius: 999,
              fontSize: '0.75rem',
              fontWeight: 800,
              cursor: 'pointer',
              boxShadow: '0 2px 8px rgba(220, 38, 38, 0.3)',
              whiteSpace: 'nowrap',
              flexShrink: 0
            }}
            title="Central de Emergência SOS"
          >
            <span>🚨 SOS</span>
          </button>

          {/* 2. Botão de Atendimento WhatsApp */}
          <a
            href={`https://wa.me/${getCleanWhatsappNumber(config.companyWhatsapp)}?text=Ol%C3%A1%2C%20gostaria%20de%20agendar%20uma%20corrida`}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              height: 32,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 5,
              backgroundColor: '#F0FDF4',
              border: '1.5px solid #BBF7D0',
              padding: '0 10px',
              borderRadius: 999,
              fontSize: '0.75rem',
              fontWeight: 800,
              color: '#15803D',
              textDecoration: 'none',
              whiteSpace: 'nowrap',
              flexShrink: 0
            }}
          >
            <WhatsAppIcon size={15} />
            <span>WhatsApp</span>
          </a>

          {/* 3. Botão de Notificações do Cliente */}
          <button
            type="button"
            onClick={() => setIsNotificationsOpen(true)}
            style={{
              width: 32,
              height: 32,
              borderRadius: '50%',
              backgroundColor: '#F7F8FA',
              border: '1.5px solid #E2E8F0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#121A21',
              cursor: 'pointer',
              position: 'relative',
              flexShrink: 0
            }}
            title="Notificações e Avisos"
          >
            <Bell size={15} strokeWidth={2.4} />
            {unreadNotifCount > 0 && (
              <span style={{
                position: 'absolute',
                top: -3,
                right: -3,
                backgroundColor: '#EF4444',
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

      {/* ── BANNER CORRIDA AO VIVO (GPS EM TEMPO REAL) ────── */}
      {activeLiveRide && (
        <div style={{
          margin: '12px 16px 0 16px',
          backgroundColor: '#121A21',
          borderRadius: 16,
          padding: '12px 14px',
          border: '1.5px solid #76D800',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          boxShadow: '0 4px 16px rgba(118, 216, 0, 0.25)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
            <div style={{
              width: 36,
              height: 36,
              borderRadius: '50%',
              backgroundColor: 'rgba(118, 216, 0, 0.18)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#76D800',
              flexShrink: 0
            }}>
              <Navigation size={18} />
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: '0.68rem', color: '#76D800', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                {activeLiveRide.status === 'a_caminho' 
                  ? '🚗 MOTORISTA A CAMINHO' 
                  : activeLiveRide.status === 'no_local'
                  ? '📍 MOTORISTA NO LOCAL DE EMBARQUE'
                  : activeLiveRide.status === 'em_andamento'
                  ? '🚀 CORRIDA EM ANDAMENTO'
                  : activeLiveRide.status === 'na_fila'
                  ? '⏳ MOTORISTA FINALIZANDO DESEMBARQUE PRÓXIMO'
                  : activeLiveRide.status === 'aguardando_confirmacao'
                  ? '📡 PROCURANDO MOTORISTA PRÓXIMO'
                  : activeLiveRide.status === 'aguardando_pagamento'
                  ? '💠 AGUARDANDO PAGAMENTO PIX'
                  : '✅ CORRIDA CONFIRMADA'}
              </div>
              <div style={{ fontSize: '0.85rem', color: '#FFFFFF', fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                Viagem {formatRideCode(activeLiveRide)} • R$ {activeLiveRide.totalPrice.toFixed(2)}
              </div>
            </div>
          </div>
          <button
            onClick={() => setLiveTrackingRide(activeLiveRide)}
            style={{
              backgroundColor: '#76D800',
              color: '#121A21',
              border: 'none',
              borderRadius: 10,
              padding: '8px 14px',
              fontSize: '0.80rem',
              fontWeight: 800,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              boxShadow: '0 3px 10px rgba(118, 216, 0, 0.35)',
              flexShrink: 0
            }}
          >
            {activeLiveRide.status === 'a_caminho' || activeLiveRide.status === 'em_andamento' 
              ? 'Acompanhar ao Vivo' 
              : 'Ver no GPS'}
          </button>
        </div>
      )}

      {/* ── BUSCA RÁPIDA ESTILO UBER ("PARA ONDE?" + "AGORA") + MAPA PERTO DE VOCÊ ── */}
      <div style={{ backgroundColor: '#FFFFFF', padding: '14px 16px 16px 16px', borderBottom: '1px solid #F0F2F5' }}>
        {currentUser && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <span style={{ fontSize: '0.84rem', color: '#4B5563', fontWeight: 600 }}>
              {getGreeting()}, <strong style={{ color: '#111111' }}>{firstName}</strong>
            </span>
            <button
              type="button"
              onClick={() => setPickingType('origin')}
              style={{
                background: '#F3F4F6',
                border: 'none',
                borderRadius: 999,
                padding: '4px 10px',
                fontSize: '0.72rem',
                fontWeight: 700,
                color: '#111111',
                maxWidth: '58%',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                cursor: 'pointer'
              }}
            >
              📍 {origin ? origin.address.split(',')[0] : 'Definir partida'}
            </button>
          </div>
        )}

        {/* Campo "Para onde?" Estilo Uber Passageiro */}
        <div
          onClick={() => setPickingType('destination')}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setPickingType('destination'); }}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: '#EFEFF4',
            borderRadius: 999,
            padding: '8px 8px 8px 16px',
            cursor: 'pointer',
            gap: 10,
            marginBottom: 14
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>
            <Search size={19} color="#111111" strokeWidth={2.5} style={{ flexShrink: 0 }} />
            <span style={{
              fontSize: '1.05rem',
              fontWeight: 800,
              color: '#111111',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis'
            }}>
              {destination ? destination.address : 'Para onde?'}
            </span>
          </div>
          <div style={{
            backgroundColor: '#FFFFFF',
            color: '#111111',
            borderRadius: 999,
            padding: '7px 13px',
            fontSize: '0.78rem',
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            gap: 5,
            boxShadow: '0 2px 6px rgba(0,0,0,0.06)',
            flexShrink: 0
          }}>
            <Clock size={14} strokeWidth={2.4} />
            <span>Agora</span>
          </div>
        </div>

        {/* Mini Mapa Ao Vivo com Motoristas na Região (Estilo Uber Home Map Card) */}
        <div
          onClick={() => onStartBooking(origin || undefined, destination || undefined)}
          style={{
            position: 'relative',
            height: 158,
            borderRadius: 16,
            overflow: 'hidden',
            border: '1px solid #E5E7EB',
            cursor: 'pointer'
          }}
        >
          <PassengerLiveMap
            origin={origin}
            destination={destination}
            nearbyDrivers={StorageService.getOnlineDrivers()
              .filter(d => d.location && typeof d.location.lat === 'number' && typeof d.location.lng === 'number')
              .map(d => ({ id: d.id, lat: d.location!.lat, lng: d.location!.lng }))}
          />
          <div style={{
            position: 'absolute',
            bottom: 10,
            left: 10,
            right: 10,
            zIndex: 400,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            pointerEvents: 'none'
          }}>
            <span style={{
              backgroundColor: 'rgba(17,17,17,0.88)',
              color: '#FFFFFF',
              padding: '5px 11px',
              borderRadius: 999,
              fontSize: '0.72rem',
              fontWeight: 700
            }}>
              ● {StorageService.getOnlineDriversCount()} carro(s) na região
            </span>
            <span style={{
              backgroundColor: '#FFFFFF',
              color: '#111111',
              padding: '5px 12px',
              borderRadius: 999,
              fontSize: '0.74rem',
              fontWeight: 800,
              boxShadow: '0 2px 8px rgba(0,0,0,0.18)'
            }}>
              Chamar agora →
            </span>
          </div>
        </div>
      </div>

      {/* ── ATALHOS / ENDEREÇOS FIXOS SALVOS ──────── */}
      <div style={{ padding: '10px 16px 0 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
          <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#64748B', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
            Locais Salvos
          </span>
          <button
            onClick={() => setIsAddingSavedModal(true)}
            style={{
              background: 'none',
              border: 'none',
              color: '#15803D',
              fontSize: '0.74rem',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 4
            }}
          >
            <Plus size={14} />
            <span>Salvar novo</span>
          </button>
        </div>

        <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 2 }}>
          {savedAddresses.map((addr) => {
            const l = addr.label.toLowerCase();
            const icon = l.includes('casa') || l.includes('resid')
              ? <Home size={15} color="#76D800" />
              : l.includes('trabalho') || l.includes('empresa')
                ? <Briefcase size={15} color="#76D800" />
                : l.includes('academia') || l.includes('treino')
                  ? <Dumbbell size={15} color="#76D800" />
                  : <Star size={15} color="#76D800" />;

            return (
              <button
                key={addr.id}
                onClick={() => setSelectedSavedAddr(addr)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 7,
                  backgroundColor: '#ffffff', border: '1.5px solid #E8EAED',
                  borderRadius: 12, padding: '7px 12px',
                  fontSize: '0.80rem', fontWeight: 700, color: '#121A21',
                  cursor: 'pointer', whiteSpace: 'nowrap',
                  boxShadow: '0 2px 6px rgba(0,0,0,0.04)', flexShrink: 0,
                }}
              >
                {icon}
                <span>{addr.label}</span>
              </button>
            );
          })}

          {/* Botão de adicionar na própria barra de rolagem */}
          <button
            onClick={() => setIsAddingSavedModal(true)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              backgroundColor: 'rgba(118, 216, 0, 0.1)', border: '1.5px dashed #76D800',
              borderRadius: 12, padding: '7px 12px',
              fontSize: '0.80rem', fontWeight: 700, color: '#15803D',
              cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
            }}
          >
            <Plus size={14} />
            <span>Adicionar local fixo</span>
          </button>
        </div>
      </div>

      {/* ── RECENTES COM OPÇÃO DE EXCLUSÃO ────────────────── */}
      {recentDestinations.length > 0 && (
        <div style={{
          margin: '16px 20px 0 20px',
          backgroundColor: '#ffffff', borderRadius: 18,
          overflow: 'hidden', boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
        }}>
          <div style={{
            padding: '13px 18px 8px 18px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <Clock size={14} color="#94A3B8" />
              <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748B', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                Recentes ({recentDestinations.length})
              </span>
            </div>
            <button
              onClick={handleClearAllRecents}
              style={{
                background: 'none',
                border: 'none',
                color: '#EF4444',
                fontSize: '0.72rem',
                fontWeight: 600,
                cursor: 'pointer',
                padding: '2px 6px'
              }}
            >
              Limpar tudo
            </button>
          </div>

          {recentDestinations.slice(0, 8).map((dest, i) => (
            <div key={i}>
              {i > 0 && <div style={{ height: 1, backgroundColor: '#F0F2F5', margin: '0 18px' }} />}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: '10px 18px',
                  cursor: 'pointer',
                  transition: 'background-color 0.15s ease'
                }}
                onClick={() => handleQuickDest(dest)}
              >
                <div style={{
                  width: 36, height: 36, borderRadius: 10, backgroundColor: '#F7F8FA',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  marginRight: 14
                }}>
                  <Clock size={16} color="#94A3B8" />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '0.88rem', fontWeight: 600, color: '#121A21', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {dest.reference || dest.address.split(',')[0]}
                  </div>
                  <div style={{ fontSize: '0.74rem', color: '#94A3B8', marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {dest.address}
                  </div>
                </div>

                {/* Botão de Excluir este recente */}
                <button
                  type="button"
                  title="Remover dos recentes"
                  onClick={(e) => handleRemoveRecent(e, dest.address)}
                  style={{
                    background: 'none',
                    border: 'none',
                    padding: 8,
                    color: '#94A3B8',
                    cursor: 'pointer',
                    borderRadius: 8,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginLeft: 6
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = '#EF4444')}
                  onMouseLeave={(e) => (e.currentTarget.style.color = '#94A3B8')}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── BOTÃO AGENDAR (CLEAN & COMPACTO) ────────────────────────────── */}
      <div style={{ padding: '10px 16px 0 16px' }}>
        <button
          onClick={() => onStartBooking(origin || undefined, destination || undefined)}
          style={{
            width: '100%',
            height: 44,
            borderRadius: 13,
            border: 'none',
            background: 'linear-gradient(180deg, #7BE000 0%, #68C400 100%)',
            color: '#121A21',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            fontSize: '0.88rem',
            fontWeight: 800,
            cursor: 'pointer',
            boxShadow: '0 3px 12px rgba(118, 216, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.35)',
            letterSpacing: '-0.01em',
            transition: 'all 0.15s ease'
          }}
        >
          <MapPin size={17} />
          <span>Chamar Motorista Agora</span>
        </button>
      </div>

      {/* ── MINHAS CORRIDAS ──────────────────────────── */}
      <div style={{ padding: '8px 16px 0 16px' }}>
        <div
          onClick={onGoToMyRides}
          style={{
            background: '#ffffff', borderRadius: 13,
            padding: '10px 14px', border: '1px solid #E2E8F0',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            cursor: 'pointer', boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 34, height: 34, borderRadius: 9,
              backgroundColor: 'rgba(118,216,0,0.12)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Calendar size={17} color="#4D9400" />
            </div>
            <div>
              <div style={{ fontSize: '0.84rem', fontWeight: 700, color: '#121A21' }}>Minhas Viagens & Recibos</div>
              <div style={{ fontSize: '0.70rem', color: '#64748B' }}>Acompanhar motorista em tempo real e histórico</div>
            </div>
          </div>
          <ChevronRight size={16} color="#94A3B8" />
        </div>
      </div>

      {/* ── PERFIL DO MOTORISTA & AUDITORIA PÚBLICA DE CORRIDAS FINALIZADAS ── */}
      <div style={{ padding: '8px 16px 0 16px' }}>
        <div
          onClick={() => setIsDriverAuditOpen(true)}
          style={{
            background: '#121A21',
            borderRadius: 14,
            padding: '10px 14px',
            border: '1px solid #2C3E50',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 10,
            cursor: 'pointer',
            boxShadow: '0 3px 10px rgba(15, 23, 42, 0.12)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>
            <div style={{ position: 'relative', flexShrink: 0 }}>
              {config.driverPhoto ? (
                <img
                  src={config.driverPhoto}
                  alt={config.driverName || 'Motorista'}
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: '50%',
                    objectFit: 'cover',
                    border: '1.5px solid #76D800',
                  }}
                />
              ) : (
                <div
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: '50%',
                    backgroundColor: '#1E293B',
                    color: '#76D800',
                    border: '1.5px solid #76D800',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 900,
                    fontSize: '0.95rem',
                  }}
                >
                  {(config.driverName || 'A').charAt(0).toUpperCase()}
                </div>
              )}
              <div
                style={{
                  position: 'absolute',
                  bottom: -1,
                  right: -1,
                  width: 14,
                  height: 14,
                  borderRadius: '50%',
                  backgroundColor: '#16A34A',
                  color: '#FFFFFF',
                  border: '1.5px solid #121A21',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Check size={8} strokeWidth={3} />
              </div>
            </div>

            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span
                  style={{
                    fontSize: '0.58rem',
                    fontWeight: 800,
                    color: '#76D800',
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                  }}
                >
                  🛡️ Motorista Verificado & Auditoria
                </span>
              </div>
              <div
                style={{
                  fontSize: '0.86rem',
                  fontWeight: 800,
                  color: '#FFFFFF',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  lineHeight: 1.2
                }}
              >
                {config.driverName || 'Alisson Santos'} • {formatPhone(config.driverPhone || config.companyPhone)}
              </div>
              <div
                style={{
                  fontSize: '0.68rem',
                  color: '#CBD5E1',
                  fontWeight: 600,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  marginTop: 1,
                }}
              >
                {config.driverCarModel && config.driverPlate
                  ? `🚗 ${config.driverCarBrand ? `${config.driverCarBrand} ` : ''}${config.driverCarModel}${config.driverCarColor ? ` • ${config.driverCarColor}` : ''} (${config.driverPlate})`
                  : '🚗 Transporte Particular Executivo • Ar-Condicionado'}
              </div>
              <div style={{ fontSize: '0.66rem', color: '#76D800', fontWeight: 700, marginTop: 1 }}>
                {allSystemRides.filter((r) => r.status === 'finalizada').length} corridas auditadas • Ver ficha do veículo
              </div>
            </div>
          </div>

          <div
            style={{
              backgroundColor: 'rgba(118, 216, 0, 0.16)',
              color: '#76D800',
              border: '1px solid rgba(118, 216, 0, 0.35)',
              borderRadius: 8,
              padding: '5px 8px',
              fontSize: '0.66rem',
              fontWeight: 800,
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              flexShrink: 0,
            }}
          >
            <ShieldCheck size={12} />
            <span>Auditoria</span>
          </div>
        </div>
      </div>

      {/* ── RODAPÉ LGPD & SEGURANÇA DE DADOS (DISCRETO) ── */}
      <div style={{ padding: '14px 20px 6px 20px', textAlign: 'center' }}>
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
          <span>Rotas e GPS gravados para sua segurança •</span>
          <span style={{ textDecoration: 'underline', color: '#64748B', fontWeight: 700 }}>
            Termos & LGPD
          </span>
        </button>
      </div>

      {/* Modal de Termos de Uso e Política de Privacidade (LGPD) */}
      <TermsPrivacyModal
        isOpen={isTermsOpen}
        onClose={() => setIsTermsOpen(false)}
        config={config}
      />

      {/* Modal de Perfil Público e Auditoria de Corridas Finalizadas */}
      <DriverPublicAuditModal
        isOpen={isDriverAuditOpen}
        onClose={() => setIsDriverAuditOpen(false)}
        config={config}
        rides={allSystemRides}
        isAdminView={false}
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

      {/* Central de Emergência SOS do Cliente (Polícia 190, SAMU 192, Bombeiros 193) */}
      <SosEmergencyModal
        isOpen={isSosOpen}
        onClose={() => setIsSosOpen(false)}
        currentLocationText={origin?.address || destination?.address || 'Lauro Müller e Região - SC'}
        rideId={activeLiveRide?.id}
        driverPhone={config?.driverPhone || config?.companyPhone || config?.companyWhatsapp}
      />

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
