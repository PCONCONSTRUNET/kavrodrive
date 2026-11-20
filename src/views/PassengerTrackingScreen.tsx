import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  MapPin, Clock, Calendar, AlertCircle,
  Phone, Navigation, ShieldCheck, ShieldAlert, ArrowLeft,
  Copy, Check, Share2, RefreshCw, FileText, Star, MessageSquare, Pencil, ExternalLink, Flag, Package
} from 'lucide-react';
import { Ride, SystemConfig } from '../types';
import { StorageService, canPassengerCancelRide, canPassengerEditRoute } from '../services/storage';
import { RealtimeService } from '../services/realtime';
import { RideChatModal } from '../components/DriverChatModal';
import { WhatsAppIcon } from '../components/WhatsAppIcon';
import { LiveGpsNavigationScreen } from '../components/LiveGpsNavigationScreen';
import { PassengerLiveMap } from '../components/PassengerLiveMap';
import { SosEmergencyModal } from '../components/SosEmergencyModal';
import { RideCheckAlertModal } from '../components/RideCheckAlertModal';
import { TrustedContactsModal } from '../components/TrustedContactsModal';
import { RideReceiptModal } from '../components/RideReceiptModal';
import { RideRatingBottomSheet } from '../components/RideRatingBottomSheet';
import { VehiclePhotoPreview } from '../components/VehiclePhotoPreview';
import { RideSearchingStageCard } from '../components/RideSearchingStageCard';
import { RideCancelModal } from '../components/RideCancelModal';
import { RideEditRouteModal } from '../components/RideEditRouteModal';
import { formatCurrency, formatPhone, formatRideCode, getCleanWhatsappNumber } from '../utils/format';
import { getGoogleMapsRouteUrl, calculateHaversineDistance } from '../utils/geo';
import { resolveCategoryType } from '../utils/categoryEngine';

interface PassengerTrackingScreenProps {
  config: SystemConfig;
  rides: Ride[];
  refreshData: () => void;
}

export const PassengerTrackingScreen: React.FC<PassengerTrackingScreenProps> = ({
  config,
  rides,
  refreshData
}) => {
  const { rideId } = useParams<{ rideId: string }>();
  const navigate = useNavigate();

  const [copiedPix, setCopiedPix] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [showReceiptModal, setShowReceiptModal] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLiveMapOpen, setIsLiveMapOpen] = useState(false);
  const [isSosOpen, setIsSosOpen] = useState(false);
  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
  const [isEditRouteModalOpen, setIsEditRouteModalOpen] = useState(false);
  const [isTrustedContactsOpen, setIsTrustedContactsOpen] = useState(false);
  const [trackedRide, setTrackedRide] = useState<Ride | null>(null);
  const [isRatingSheetOpen, setIsRatingSheetOpen] = useState(false);
  const [ratingAutoShownId, setRatingAutoShownId] = useState<string>('');
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [unreadChatCount, setUnreadChatCount] = useState(0);

  const trackToken = typeof window !== 'undefined'
    ? String(new URLSearchParams(window.location.search).get('t') || '').trim()
    : '';
  const currentLoggedUser = StorageService.getCurrentUser();
  const isExternalTracking = Boolean(trackToken && !currentLoggedUser);

  // Busca a corrida correspondente (prioriza sessão local; senão usa link assinado /track)
  const ride =
    rides.find(r => r.id === rideId || formatRideCode(r) === rideId) ||
    StorageService.getRides().find(r => r.id === rideId || formatRideCode(r) === rideId) ||
    trackedRide ||
    undefined;
  const canClientCancelThisRide = Boolean(
    !isExternalTracking &&
    currentLoggedUser &&
    StorageService.getClientToken() &&
    (!ride?.clientId || ride.clientId === currentLoggedUser.id) &&
    canPassengerCancelRide(ride)
  );

  useEffect(() => {
    if (!rideId || !trackToken) return;
    let active = true;
    const fetchTracked = async () => {
      try {
        const res = await fetch(
          `/api/rides/${encodeURIComponent(rideId)}/track?t=${encodeURIComponent(trackToken)}`,
          { headers: { ...StorageService.getAuthHeaders() } }
        );
        if (res.ok && active) {
          const data = await res.json();
          if (data?.ok && data.ride) {
            setTrackedRide(data.ride);
          }
        }
      } catch {
        // Silencioso
      }
    };
    fetchTracked();
    const t = setInterval(fetchTracked, 4000);
    return () => {
      active = false;
      clearInterval(t);
    };
  }, [rideId, trackToken]);

  // Abre automaticamente o bottom sheet Uber-style quando a viagem encerra sem avaliação
  useEffect(() => {
    if (
      !isExternalTracking &&
      ride &&
      ride.status === 'finalizada' &&
      !ride.passengerRating &&
      ratingAutoShownId !== ride.id
    ) {
      setIsRatingSheetOpen(true);
      setRatingAutoShownId(ride.id);
    }
  }, [isExternalTracking, ride?.id, ride?.status, ride?.passengerRating, ratingAutoShownId]);

  // Telemetria ao vivo (Timer + Distância em metros até o cliente e até o destino)
  const [liveMetersToClient, setLiveMetersToClient] = useState<number>(Math.round((ride?.distanceKm || 0.5) * 1000));
  const [liveMetersToDest, setLiveMetersToDest] = useState<number>(Math.round((ride?.distanceKm || 1) * 1000));
  const [liveEtaSeconds, setLiveEtaSeconds] = useState<number>((ride?.durationMin || 5) * 60);

  useEffect(() => {
    if (!ride) return;
    const dLat = ride.driverLocation?.lat || ride.origin.lat;
    const dLng = ride.driverLocation?.lng || ride.origin.lng;
    const cLat = ride.clientLocation?.lat || ride.origin.lat;
    const cLng = ride.clientLocation?.lng || ride.origin.lng;

    const mClient =
      dLat && dLng && cLat && cLng
        ? Math.max(0, Math.round(calculateHaversineDistance(dLat, dLng, cLat, cLng) * 1000))
        : 0;
    const mDest =
      dLat && dLng && ride.destination.lat && ride.destination.lng
        ? Math.max(0, Math.round(calculateHaversineDistance(dLat, dLng, ride.destination.lat, ride.destination.lng) * 1000))
        : Math.round((ride.distanceKm || 1) * 1000);

    setLiveMetersToClient(mClient);
    setLiveMetersToDest(mDest);

    const activeMeters = ride.status === 'em_andamento' ? mDest : mClient;
    const spdKmh = ride.driverLocation?.speedKmH || 0;
    const effSpeedMs = spdKmh >= 6 ? spdKmh / 3.6 : 8.33;
    const secs = activeMeters <= 25 ? 0 : Math.max(15, Math.round(activeMeters / effSpeedMs));
    setLiveEtaSeconds(secs);
  }, [
    ride?.driverLocation?.lat,
    ride?.driverLocation?.lng,
    ride?.driverLocation?.speedKmH,
    ride?.clientLocation?.lat,
    ride?.clientLocation?.lng,
    ride?.status,
    ride?.distanceKm
  ]);

  useEffect(() => {
    const t = setInterval(() => {
      setLiveEtaSeconds(prev => (prev > 1 ? prev - 1 : prev));
    }, 1000);
    return () => clearInterval(t);
  }, []);

  const formatTimer = (sec: number) => {
    if (sec <= 0) return '00:00';
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  // Atualização em tempo real via SSE + fallback de polling (sem precisar recarregar)
  useEffect(() => {
    if (!ride?.id) return;
    const handleChatMsg = (evt: Event) => {
      const detail = (evt as CustomEvent)?.detail;
      if (!detail || detail.rideId !== ride.id || !detail.message) return;
      if (detail.message.sender === 'driver' && !isChatOpen) {
        setUnreadChatCount(c => c + 1);
      }
    };
    const handleRealtimeUpdate = () => {
      StorageService.syncFromDatabase().then(refreshData);
    };
    window.addEventListener('up_realtime_chat', handleChatMsg);
    window.addEventListener('up_realtime_ride', handleRealtimeUpdate);

    const intervalMs = RealtimeService.isConnected() ? 10000 : 3000;
    const interval = setInterval(async () => {
      await StorageService.syncFromDatabase();
      refreshData();
    }, intervalMs);
    return () => {
      clearInterval(interval);
      window.removeEventListener('up_realtime_chat', handleChatMsg);
      window.removeEventListener('up_realtime_ride', handleRealtimeUpdate);
    };
  }, [refreshData, ride?.id, isChatOpen]);

  const handleManualRefresh = async () => {
    setIsRefreshing(true);
    await StorageService.syncFromDatabase();
    refreshData();
    setTimeout(() => setIsRefreshing(false), 600);
  };

  const handleCopyPix = () => {
    const pix = config.pixKey || 'contato@upmobilidade.com.br';
    navigator.clipboard.writeText(pix);
    setCopiedPix(true);
    setTimeout(() => setCopiedPix(false), 2000);
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  if (!ride) {
    return (
      <div className="app-container" style={{ minHeight: '100vh', backgroundColor: '#F8FAFC', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, textAlign: 'center' }}>
        <div style={{ width: 64, height: 64, borderRadius: '50%', backgroundColor: '#FEE2E2', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
          <AlertCircle size={32} color="#DC2626" />
        </div>
        <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#121A21', marginBottom: 8 }}>
          Viagem não encontrada
        </h2>
        <p style={{ fontSize: '0.85rem', color: '#64748B', maxWidth: 320, marginBottom: 20 }}>
          O código da viagem informado ({rideId || 'desconhecido'}) não foi localizado ou pode ter sido cancelado.
        </p>
        <button
          onClick={() => navigate('/cliente')}
          className="btn-primary"
          style={{ padding: '12px 24px', fontSize: '0.9rem' }}
        >
          Voltar para o Início
        </button>
      </div>
    );
  }

  const isDeliveryRide =
    ride.serviceType === 'entregas' ||
    Boolean(ride.deliveryDetails) ||
    resolveCategoryType(ride.category || '') === 'entregas';
  const isCancelledRide = ride.status === 'cancelada';
  const isCompletedRide = ride.status === 'finalizada';
  const hasCancellationFee = Number(ride.cancellationFeeApplied || 0) > 0;

  // Configuração visual de status (linguagem formal)
  const getStatusInfo = () => {
    switch (ride.status) {
      case 'aguardando_pagamento':
        return {
          step: 1,
          label: 'Aguardando Confirmação de Pagamento',
          badge: 'Pendente',
          color: '#B45309',
          bg: '#FFFBEB',
          border: '#FDE68A',
          desc: 'Aguardando confirmação automática do pagamento PIX para acionar o motorista parceiro mais próximo.'
        };
      case 'aguardando_confirmacao':
        return {
          step: 1,
          label: isDeliveryRide ? 'Buscando Motorista para Entrega' : 'Buscando Motorista Próximo',
          badge: 'Ao vivo',
          color: '#1D4ED8',
          bg: '#EFF6FF',
          border: '#BFDBFE',
          desc: 'Sua solicitação está sendo encaminhada aos motoristas parceiros disponíveis na região.'
        };
      case 'na_fila':
        return {
          step: 2,
          label: 'Motorista Confirmado na Fila',
          badge: 'Ao vivo',
          color: '#B45309',
          bg: '#FFFBEB',
          border: '#FDE68A',
          desc: `${ride.driverName || 'O motorista'} aceitou sua solicitação e seguirá para o ponto de partida após concluir o atendimento atual.`
        };
      case 'confirmada':
        return {
          step: 2,
          label: 'Motorista Confirmado',
          badge: 'Ao vivo',
          color: '#1D4ED8',
          bg: '#EFF6FF',
          border: '#BFDBFE',
          desc: 'Solicitação aceita. O motorista está se preparando para iniciar o deslocamento até o ponto de partida.'
        };
      case 'a_caminho':
      case 'no_local':
        return {
          step: 3,
          label: ride.status === 'no_local'
            ? (isDeliveryRide ? 'Motorista no Local de Coleta' : 'Motorista no Local de Embarque')
            : (isDeliveryRide ? 'Motorista a Caminho da Coleta' : 'Motorista a Caminho'),
          badge: 'Ao vivo',
          color: '#6D28D9',
          bg: '#F5F3FF',
          border: '#DDD6FE',
          desc: isDeliveryRide
            ? 'O motorista está se deslocando para retirar a encomenda.'
            : 'O motorista está se deslocando até o ponto de embarque.'
        };
      case 'em_andamento':
        return {
          step: 4,
          label: isDeliveryRide ? 'Entrega em Andamento' : 'Viagem em Andamento',
          badge: 'Ao vivo',
          color: '#15803D',
          bg: '#F0FDF4',
          border: '#BBF7D0',
          desc: isDeliveryRide
            ? 'Encomenda em trânsito até o endereço de destino.'
            : 'Trajeto em curso até o endereço de destino.'
        };
      case 'finalizada':
        return {
          step: 5,
          label: isDeliveryRide ? 'Entrega Concluída' : 'Viagem Concluída',
          badge: 'Concluída',
          color: '#15803D',
          bg: '#F0FDF4',
          border: '#BBF7D0',
          desc: 'Serviço finalizado e registrado no histórico oficial da Kavro Drive.'
        };
      case 'cancelada':
        return {
          step: 0,
          label: isDeliveryRide ? 'Entrega Cancelada' : 'Viagem Cancelada',
          badge: 'Encerrada',
          color: '#991B1B',
          bg: '#FEF2F2',
          border: '#FECACA',
          desc: hasCancellationFee
            ? 'Esta solicitação foi cancelada com aplicação de taxa operacional.'
            : 'Esta solicitação foi cancelada e nenhuma cobrança foi aplicada.'
        };
      default:
        return {
          step: 2,
          label: 'Solicitação Ativa',
          badge: 'Ativa',
          color: '#1D4ED8',
          bg: '#EFF6FF',
          border: '#BFDBFE',
          desc: 'Solicitação registrada no sistema.'
        };
    }
  };

  const statusInfo = getStatusInfo();
  const driverPhone = getCleanWhatsappNumber(ride.driverPhone || config.companyWhatsapp || '5548996915303');

  return (
    <div className="animate-fade-in" style={{ minHeight: '100vh', backgroundColor: '#F1F5F9', paddingBottom: 48 }}>
      {/* Cabeçalho Executivo Formal */}
      <header style={{
        backgroundColor: '#0F172A',
        color: '#FFFFFF',
        padding: '12px 16px',
        position: 'sticky',
        top: 0,
        zIndex: 20,
        borderBottom: '1px solid rgba(255,255,255,0.08)',
        boxShadow: '0 2px 12px rgba(15, 23, 42, 0.16)'
      }}>
        <div style={{ maxWidth: 560, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <button
            type="button"
            onClick={() => navigate('/cliente')}
            style={{
              background: 'rgba(255,255,255,0.08)',
              border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: 10,
              width: 36,
              height: 36,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#FFFFFF',
              cursor: 'pointer',
              flexShrink: 0
            }}
            title="Voltar"
          >
            <ArrowLeft size={17} />
          </button>

          <div style={{ textAlign: 'center', flex: 1, minWidth: 0 }}>
            <div style={{
              fontSize: '0.62rem',
              color: isCancelledRide || isCompletedRide ? '#94A3B8' : '#86EFAC',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.09em',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis'
            }}>
              {isCancelledRide
                ? 'Registro de Cancelamento'
                : isCompletedRide
                  ? 'Resumo da Viagem'
                  : 'Acompanhamento em Tempo Real'}
            </div>
            <div style={{
              fontSize: '0.96rem',
              fontWeight: 800,
              letterSpacing: '-0.015em',
              color: '#FFFFFF',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              marginTop: 1
            }}>
              {isDeliveryRide ? 'Entrega' : 'Viagem'} {formatRideCode(ride)}
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
            {ride?.status === 'em_andamento' && (
              <button
                type="button"
                onClick={() => setIsSosOpen(true)}
                style={{
                  backgroundColor: '#DC2626',
                  border: '1px solid #F87171',
                  borderRadius: 10,
                  height: 36,
                  padding: '0 10px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5,
                  color: '#FFFFFF',
                  fontWeight: 800,
                  fontSize: '0.73rem',
                  cursor: 'pointer',
                  letterSpacing: '0.02em'
                }}
                title="Central de Emergência SOS"
              >
                <ShieldAlert size={14} />
                <span>SOS</span>
              </button>
            )}
            <button
              type="button"
              onClick={handleManualRefresh}
              style={{
                background: 'rgba(255,255,255,0.08)',
                border: '1px solid rgba(255,255,255,0.12)',
                borderRadius: 10,
                width: 36,
                height: 36,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#FFFFFF',
                cursor: 'pointer'
              }}
              title="Atualizar status"
            >
              <RefreshCw size={15} className={isRefreshing ? 'animate-spin' : ''} />
            </button>
            <button
              type="button"
              onClick={handleCopyLink}
              style={{
                background: 'rgba(255,255,255,0.08)',
                border: '1px solid rgba(255,255,255,0.12)',
                borderRadius: 10,
                width: 36,
                height: 36,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: copiedLink ? '#86EFAC' : '#FFFFFF',
                cursor: 'pointer'
              }}
              title="Copiar link de acompanhamento"
            >
              {copiedLink ? <Check size={15} /> : <Share2 size={15} />}
            </button>
          </div>
        </div>
      </header>

      {/* Mapa Ao Vivo Superior */}
      {ride.status !== 'cancelada' && (
        <div style={{ maxWidth: 560, margin: '0 auto', height: 220, position: 'relative' }}>
          <PassengerLiveMap
            origin={ride.origin}
            destination={ride.destination}
            driverPos={ride.driverLocation || null}
            searchingPulse={ride.status === 'aguardando_confirmacao'}
          />
        </div>
      )}

      {/* Conteúdo Principal Formal */}
      <main style={{
        maxWidth: 560,
        margin: ride.status !== 'cancelada' ? '-14px auto 0 auto' : '16px auto 0 auto',
        position: 'relative',
        zIndex: 10,
        padding: ride.status !== 'cancelada' ? '16px 14px 20px 14px' : '0 14px 20px 14px',
        backgroundColor: ride.status !== 'cancelada' ? '#F1F5F9' : 'transparent',
        borderRadius: ride.status !== 'cancelada' ? '20px 20px 0 0' : 0,
        display: 'flex',
        flexDirection: 'column',
        gap: 12
      }}>

        {/* CARD 1: Situação Atual */}
        <div style={{
          backgroundColor: '#FFFFFF',
          borderRadius: 16,
          padding: 16,
          border: '1px solid #E2E8F0',
          boxShadow: '0 1px 4px rgba(15, 23, 42, 0.04)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
              <span
                className={ride.status === 'aguardando_confirmacao' ? 'kavro-beacon-amber' : ride.status === 'em_andamento' ? 'kavro-beacon-green' : undefined}
                style={{
                  width: 9,
                  height: 9,
                  borderRadius: '50%',
                  backgroundColor: statusInfo.color,
                  flexShrink: 0
                }}
              />
              <span style={{ fontSize: '1.02rem', fontWeight: 800, color: '#0F172A', letterSpacing: '-0.015em' }}>
                {statusInfo.label}
              </span>
            </div>
            <span style={{
              fontSize: '0.68rem',
              fontWeight: 700,
              backgroundColor: statusInfo.bg,
              color: statusInfo.color,
              border: `1px solid ${statusInfo.border}`,
              padding: '3px 9px',
              borderRadius: 999,
              whiteSpace: 'nowrap',
              flexShrink: 0
            }}>
              {statusInfo.badge}
            </span>
          </div>

          <p style={{ fontSize: '0.82rem', color: '#475569', lineHeight: 1.5, margin: '0 0 12px 0' }}>
            {statusInfo.desc}
          </p>

          {isDeliveryRide && ride.deliveryDetails && (
            <div style={{
              marginBottom: 12,
              padding: '10px 12px',
              borderRadius: 12,
              backgroundColor: '#F8FAFC',
              border: '1px solid #E2E8F0',
              fontSize: '0.78rem',
              color: '#0F172A',
              display: 'flex',
              alignItems: 'flex-start',
              gap: 9
            }}>
              <Package size={16} color="#15803D" style={{ marginTop: 2, flexShrink: 0 }} />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 700 }}>
                  Encomenda: {ride.deliveryDetails.itemDescription} ({ride.deliveryDetails.packageSize || 'pequeno'})
                </div>
                <div style={{ marginTop: 2, color: '#475569', fontSize: '0.74rem' }}>
                  {ride.deliveryDetails.role === 'sender' ? 'Destinatário:' : 'Remetente:'} {ride.deliveryDetails.recipientName} •{' '}
                  {ride.deliveryDetails.dropoffMode === 'portaria'
                    ? 'Na portaria'
                    : ride.deliveryDetails.dropoffMode === 'recepcao'
                      ? 'Recepção / Loja'
                      : 'Em mãos'}
                </div>
              </div>
            </div>
          )}

          {ride.status === 'aguardando_confirmacao' && (
            <RideSearchingStageCard
              status={ride.status}
              onlineDriversCount={StorageService.getOnlineDriversCount()}
              driverName={ride.driverName}
            />
          )}

          {/* Stepper de 5 Etapas */}
          {ride.status !== 'cancelada' && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'relative' }}>
              <div style={{
                position: 'absolute',
                top: 12,
                left: 14,
                right: 14,
                height: 3,
                backgroundColor: '#E2E8F0',
                zIndex: 0
              }}>
                <div style={{
                  height: '100%',
                  backgroundColor: '#16A34A',
                  width: statusInfo.step === 1 ? '0%' :
                         statusInfo.step === 2 ? '25%' :
                         statusInfo.step === 3 ? '50%' :
                         statusInfo.step === 4 ? '75%' : '100%',
                  transition: 'width 0.4s ease'
                }} />
              </div>

              {[
                { s: 1, label: 'Solicitada' },
                { s: 2, label: 'Confirmada' },
                { s: 3, label: 'A Caminho' },
                { s: 4, label: 'Em Viagem' },
                { s: 5, label: 'Concluída' },
              ].map(item => {
                const isPassed = statusInfo.step >= item.s;
                const isCurrent = statusInfo.step === item.s;
                return (
                  <div key={item.s} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, position: 'relative', zIndex: 1 }}>
                    <div style={{
                      width: 26,
                      height: 26,
                      borderRadius: '50%',
                      backgroundColor: isPassed ? '#16A34A' : '#FFFFFF',
                      border: isPassed ? '2px solid #16A34A' : '2px solid #CBD5E1',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: isPassed ? '#FFFFFF' : '#94A3B8',
                      fontSize: '0.7rem',
                      fontWeight: 800,
                      boxShadow: isCurrent ? '0 0 10px rgba(22, 163, 74, 0.4)' : 'none'
                    }}>
                      {isPassed ? '✓' : item.s}
                    </div>
                    <span style={{ fontSize: '0.62rem', fontWeight: isCurrent ? 800 : 600, color: isCurrent ? '#121A21' : '#64748B' }}>
                      {item.label}
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          {(ride.status === 'confirmada' || ride.status === 'a_caminho' || ride.status === 'em_andamento') && (
            <>
              {/* Painel de Telemetria em Tempo Real (Timer + Distância até Coleta/Embarque + Destino) */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr 1fr',
                gap: 8,
                marginTop: 16
              }}>
                <div style={{
                  backgroundColor: '#0F172A',
                  borderRadius: 12,
                  padding: '9px 10px',
                  color: '#FFFFFF',
                  textAlign: 'center'
                }}>
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '0.58rem', color: '#94A3B8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    <Clock size={10} />
                    <span>Chegada</span>
                  </div>
                  <div style={{ fontSize: '1rem', fontWeight: 800, color: '#FFFFFF', fontVariantNumeric: 'tabular-nums', marginTop: 2 }}>
                    {formatTimer(liveEtaSeconds)}
                  </div>
                  <div style={{ fontSize: '0.6rem', color: '#94A3B8', fontWeight: 600 }}>
                    Tempo real
                  </div>
                </div>

                <div style={{
                  backgroundColor: '#F8FAFC',
                  borderRadius: 12,
                  padding: '9px 10px',
                  border: '1px solid #E2E8F0',
                  textAlign: 'center'
                }}>
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '0.58rem', color: '#64748B', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    <MapPin size={10} />
                    <span>{isDeliveryRide ? 'Coleta' : 'Até Você'}</span>
                  </div>
                  <div style={{ fontSize: '0.95rem', fontWeight: 800, color: '#0F172A', fontVariantNumeric: 'tabular-nums', marginTop: 2 }}>
                    {ride.status === 'em_andamento'
                      ? (isDeliveryRide ? 'Coletado' : 'Embarcado')
                      : liveMetersToClient < 1000
                        ? `${liveMetersToClient} m`
                        : `${(liveMetersToClient / 1000).toFixed(1).replace('.', ',')} km`}
                  </div>
                  <div style={{ fontSize: '0.6rem', color: '#64748B', fontWeight: 600 }}>
                    {ride.status === 'em_andamento'
                      ? 'Em trânsito'
                      : `${liveMetersToClient.toLocaleString('pt-BR')} m`}
                  </div>
                </div>

                <div style={{
                  backgroundColor: '#F8FAFC',
                  borderRadius: 12,
                  padding: '9px 10px',
                  border: '1px solid #E2E8F0',
                  textAlign: 'center'
                }}>
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '0.58rem', color: '#64748B', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    <Flag size={10} />
                    <span>Destino</span>
                  </div>
                  <div style={{ fontSize: '0.95rem', fontWeight: 800, color: '#0F172A', fontVariantNumeric: 'tabular-nums', marginTop: 2 }}>
                    {liveMetersToDest < 1000
                      ? `${liveMetersToDest} m`
                      : `${(liveMetersToDest / 1000).toFixed(1).replace('.', ',')} km`}
                  </div>
                  <div style={{ fontSize: '0.6rem', color: '#64748B', fontWeight: 600 }}>
                    {liveMetersToDest.toLocaleString('pt-BR')} m
                  </div>
                </div>
              </div>

              {ride.boardingPin && (ride.status === 'confirmada' || ride.status === 'a_caminho') && (
                <div style={{
                  marginTop: 12,
                  padding: '10px 14px',
                  borderRadius: 12,
                  backgroundColor: '#EFF6FF',
                  border: '1px solid #BFDBFE',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 10
                }}>
                  <div style={{ fontSize: '0.75rem', color: '#1E40AF', fontWeight: 700 }}>
                    {isDeliveryRide
                      ? 'PIN de Segurança: informe ao motorista no ato da coleta'
                      : 'PIN de Embarque: informe ao motorista ao entrar no veículo'}
                  </div>
                  <div style={{
                    fontSize: '1.15rem',
                    fontWeight: 900,
                    letterSpacing: '0.18em',
                    color: '#1E3A8A',
                    backgroundColor: '#FFFFFF',
                    padding: '4px 10px',
                    borderRadius: 8,
                    border: '1px solid #93C5FD',
                    fontVariantNumeric: 'tabular-nums'
                  }}>
                    {ride.boardingPin}
                  </div>
                </div>
              )}

              {!isExternalTracking && (
                <button
                  type="button"
                  onClick={() => setIsTrustedContactsOpen(true)}
                  style={{
                    width: '100%',
                    marginTop: 10,
                    padding: '10px 14px',
                    borderRadius: 12,
                    border: '1px solid #BBF7D0',
                    backgroundColor: '#F0FDF4',
                    color: '#166534',
                    fontSize: '0.8rem',
                    fontWeight: 800,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    cursor: 'pointer'
                  }}
                >
                  <ShieldCheck size={16} color="#16A34A" />
                  <span>
                    Contatos de Confiança ({ride.trustedContactsDispatches?.length || 0} envio(s) nesta corrida)
                  </span>
                </button>
              )}

              <button
                type="button"
                onClick={() => setIsLiveMapOpen(true)}
                className="btn-ios-primary"
                style={{
                  width: '100%',
                  marginTop: 12,
                  padding: '12px 16px',
                  fontSize: '0.88rem',
                  fontWeight: 800,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8
                }}
              >
                <Navigation size={17} />
                <span>Abrir GPS ao Vivo no Mapa</span>
              </button>
            </>
          )}
        </div>

        <LiveGpsNavigationScreen
          ride={ride}
          isOpen={isLiveMapOpen}
          userRole="client"
          onClose={() => setIsLiveMapOpen(false)}
          config={config}
        />

        <RideRatingBottomSheet
          isOpen={isRatingSheetOpen}
          ride={ride}
          raterRole="cliente"
          onClose={() => setIsRatingSheetOpen(false)}
          onSubmitted={() => {
            setIsRatingSheetOpen(false);
            refreshData();
          }}
        />

        {ride.status === 'finalizada' && (
          <div style={{
            backgroundColor: '#FFFFFF',
            borderRadius: 16,
            padding: 16,
            border: '1px solid #E2E8F0',
            boxShadow: '0 1px 4px rgba(15, 23, 42, 0.04)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#0F172A' }}>
                Avaliação do atendimento ({ride.driverName || 'Motorista Parceiro'})
              </div>
              {ride.passengerRating && (
                <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#15803D', backgroundColor: '#F0FDF4', border: '1px solid #BBF7D0', padding: '2px 8px', borderRadius: 999 }}>
                  Enviada ★
                </span>
              )}
            </div>

            {ride.passengerRating ? (
              <div style={{ fontSize: '0.78rem', color: '#475569' }}>
                Nota registrada: <strong style={{ color: '#0F172A' }}>{ride.passengerRating.toFixed(1)} ★</strong>
                {ride.passengerNotes && (
                  <span> — &ldquo;{ride.passengerNotes}&rdquo;</span>
                )}
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setIsRatingSheetOpen(true)}
                style={{
                  width: '100%',
                  padding: '11px 14px',
                  borderRadius: 11,
                  border: 'none',
                  backgroundColor: '#0F172A',
                  color: '#FFFFFF',
                  fontSize: '0.84rem',
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 7,
                  cursor: 'pointer'
                }}
              >
                <Star size={15} fill="#F59E0B" color="#F59E0B" />
                <span>Avaliar Motorista</span>
              </button>
            )}
          </div>
        )}

        {/* CARD 2: Motorista Parceiro & Veículo (somente após aceite real do motorista) */}
        {(ride.driverId || ride.driverName) &&
          ride.status !== 'aguardando_confirmacao' &&
          ride.status !== 'aguardando_pagamento' && (
        <div style={{
          backgroundColor: '#FFFFFF',
          borderRadius: 16,
          padding: 16,
          border: '1px solid #E2E8F0',
          boxShadow: '0 1px 4px rgba(15, 23, 42, 0.04)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Motorista Parceiro &amp; Veículo
            </div>
            <span style={{
              fontSize: '0.67rem',
              fontWeight: 700,
              color: '#166534',
              backgroundColor: '#F0FDF4',
              border: '1px solid #BBF7D0',
              padding: '2px 8px',
              borderRadius: 999,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4
            }}>
              <ShieldCheck size={12} />
              Verificado
            </span>
          </div>

          {/* Dados do Motorista */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ position: 'relative', flexShrink: 0 }}>
                {ride.driverPhoto ? (
                  <img
                    src={ride.driverPhoto}
                    alt={ride.driverName || 'Motorista'}
                    style={{
                      width: 48,
                      height: 48,
                      borderRadius: '50%',
                      objectFit: 'cover',
                      border: '2px solid #E2E8F0'
                    }}
                  />
                ) : (
                  <div style={{
                    width: 48,
                    height: 48,
                    borderRadius: '50%',
                    backgroundColor: '#0F172A',
                    color: '#FFFFFF',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 800,
                    fontSize: '1.1rem',
                    border: '2px solid #E2E8F0'
                  }}>
                    {(ride.driverName || 'M').charAt(0).toUpperCase()}
                  </div>
                )}
                <div style={{
                  position: 'absolute',
                  bottom: -1,
                  right: -1,
                  width: 16,
                  height: 16,
                  borderRadius: '50%',
                  backgroundColor: '#16A34A',
                  color: '#FFFFFF',
                  border: '1.5px solid #FFFFFF',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  <Check size={9} strokeWidth={3} />
                </div>
              </div>

              <div>
                <div style={{ fontSize: '1rem', fontWeight: 900, color: '#121A21', lineHeight: 1.2 }}>
                  {ride.driverName || 'Motorista Parceiro'}
                </div>
                <div style={{ fontSize: '0.74rem', color: '#64748B', marginTop: 1 }}>
                  {ride.driverRating ? `★ ${Number(ride.driverRating).toFixed(2)} • ` : ''}Kavro Drive
                </div>
                {ride.driverPhone && (
                  <div style={{ fontSize: '0.72rem', color: '#16A34A', fontWeight: 700, marginTop: 2 }}>
                    {formatPhone(ride.driverPhone)}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Ficha Visual do Veículo */}
          <div style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 6 }}>
              <span style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                fontSize: '0.66rem',
                fontWeight: 700,
                padding: '3px 9px',
                borderRadius: 999,
                backgroundColor: '#F8FAFC',
                color: '#166534',
                border: '1px solid #BBF7D0'
              }}>
                <Check size={11} />
                <span>Documentação e CRLV regulares</span>
              </span>
            </div>
            <VehiclePhotoPreview
              model={ride.driverVehicle || undefined}
              colorName={ride.driverCarColor || undefined}
              plate={ride.driverPlate || undefined}
              category={ride.categoryName || 'Padrão'}
              size="compact"
              showPlate={Boolean(ride.driverPlate?.trim())}
            />
          </div>

          {/* Especificações de Atendimento */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            flexWrap: 'wrap',
            backgroundColor: '#F8FAFC',
            padding: '7px 10px',
            borderRadius: 10,
            border: '1px solid #E2E8F0',
            marginBottom: 12,
            fontSize: '0.69rem',
            color: '#475569',
            fontWeight: 600
          }}>
            <span>Ar-condicionado</span>
            <span style={{ color: '#CBD5E1' }}>•</span>
            <span>Seguro APP</span>
            <span style={{ color: '#CBD5E1' }}>•</span>
            <span>Veículo vistoriado</span>
          </div>

          {/* Botões de Contato Direto */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
            <button
              type="button"
              onClick={() => {
                setUnreadChatCount(0);
                setIsChatOpen(true);
              }}
              style={{
                backgroundColor: '#0F172A',
                color: '#FFFFFF',
                border: 'none',
                borderRadius: 12,
                padding: '10px 10px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                fontSize: '0.82rem',
                fontWeight: 700,
                cursor: 'pointer',
                position: 'relative'
              }}
            >
              <MessageSquare size={15} />
              <span>Chat</span>
              {unreadChatCount > 0 && (
                <span style={{
                  minWidth: 18,
                  height: 18,
                  padding: '0 5px',
                  borderRadius: 999,
                  backgroundColor: '#2563EB',
                  color: '#FFFFFF',
                  fontSize: '0.7rem',
                  fontWeight: 800,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  {unreadChatCount}
                </span>
              )}
            </button>

            <a
              href={`https://wa.me/${driverPhone}?text=Ol%C3%A1,%20falo%20sobre%20a%20solicita%C3%A7%C3%A3o%20${encodeURIComponent(ride.id)}%20na%20Kavro%20Drive.`}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                backgroundColor: '#16A34A',
                color: '#FFFFFF',
                borderRadius: 12,
                padding: '10px 12px',
                textDecoration: 'none',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                fontSize: '0.82rem',
                fontWeight: 700
              }}
            >
              <WhatsAppIcon size={16} />
              <span>WhatsApp</span>
            </a>

            <a
              href={`tel:+${driverPhone}`}
              style={{
                backgroundColor: '#FFFFFF',
                border: '1px solid #CBD5E1',
                color: '#0F172A',
                borderRadius: 12,
                padding: '10px 12px',
                textDecoration: 'none',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                fontSize: '0.82rem',
                fontWeight: 700
              }}
            >
              <Phone size={15} />
              <span>Ligar</span>
            </a>
          </div>
        </div>
        )}

        {/* CARD 3: Detalhes do Trajeto & Horário */}
        <div style={{
          backgroundColor: '#FFFFFF',
          borderRadius: 16,
          padding: 16,
          border: '1px solid #E2E8F0',
          boxShadow: '0 1px 4px rgba(15, 23, 42, 0.04)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, gap: 8 }}>
            <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Trajeto &amp; Horário
            </div>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.74rem', color: '#334155', fontWeight: 700, whiteSpace: 'nowrap' }}>
              <Calendar size={13} color="#64748B" />
              <span>{ride.date.split('-').reverse().join('/')}</span>
              <span style={{ color: '#CBD5E1' }}>•</span>
              <Clock size={13} color="#64748B" />
              <span>{ride.time}</span>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, position: 'relative' }}>
            {/* Ponto de Origem / Embarque / Coleta */}
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
              <div style={{
                width: 22,
                height: 22,
                borderRadius: '50%',
                backgroundColor: '#F1F5F9',
                border: '1px solid #CBD5E1',
                color: '#0F172A',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                marginTop: 2
              }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', backgroundColor: '#16A34A' }} />
              </div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: '0.67rem', color: '#64748B', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  {isDeliveryRide ? 'Local de Coleta' : 'Embarque'}
                </div>
                <div style={{ fontSize: '0.88rem', fontWeight: 600, color: '#0F172A', lineHeight: 1.35, marginTop: 1 }}>
                  {ride.origin.address}
                </div>
                {ride.origin.reference && (
                  <div style={{ fontSize: '0.72rem', color: '#64748B', marginTop: 2 }}>
                    Ref.: {ride.origin.reference}
                  </div>
                )}
              </div>
            </div>

            {/* Linha conectora vertical */}
            <div style={{
              width: 1.5,
              height: 16,
              backgroundColor: '#CBD5E1',
              marginLeft: 10,
              marginTop: -6,
              marginBottom: -6
            }} />

            {/* Ponto de Destino */}
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
              <div style={{
                width: 22,
                height: 22,
                borderRadius: '50%',
                backgroundColor: '#0F172A',
                color: '#FFFFFF',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                marginTop: 2
              }}>
                <span style={{ width: 6, height: 6, borderRadius: 1, backgroundColor: '#FFFFFF' }} />
              </div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: '0.67rem', color: '#64748B', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  {isDeliveryRide ? 'Endereço de Entrega' : 'Destino'}
                </div>
                <div style={{ fontSize: '0.88rem', fontWeight: 600, color: '#0F172A', lineHeight: 1.35, marginTop: 1 }}>
                  {ride.destination.address}
                </div>
              </div>
            </div>
          </div>

          {/* Métricas Estruturadas da Rota (sem quebras entre número e unidade) */}
          <div style={{
            marginTop: 14,
            paddingTop: 12,
            borderTop: '1px solid #F1F5F9',
            display: 'grid',
            gridTemplateColumns: '1fr 1fr auto',
            gap: 10,
            alignItems: 'center'
          }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: '0.67rem', color: '#64748B', fontWeight: 600 }}>
                Distância
              </div>
              <div style={{ fontSize: '0.86rem', fontWeight: 800, color: '#0F172A', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', marginTop: 1 }}>
                {ride.distanceKm.toFixed(1).replace('.', ',')} km
              </div>
            </div>

            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: '0.67rem', color: '#64748B', fontWeight: 600 }}>
                Tempo estimado
              </div>
              <div style={{ fontSize: '0.86rem', fontWeight: 800, color: '#0F172A', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', marginTop: 1 }}>
                ~{ride.durationMin || 30} min
              </div>
            </div>

            <a
              href={getGoogleMapsRouteUrl(ride.origin, ride.destination)}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                padding: '7px 11px',
                borderRadius: 10,
                backgroundColor: '#F8FAFC',
                border: '1px solid #E2E8F0',
                color: '#1D4ED8',
                fontSize: '0.75rem',
                fontWeight: 700,
                textDecoration: 'none',
                whiteSpace: 'nowrap'
              }}
            >
              <span>Ver mapa</span>
              <ExternalLink size={12} />
            </a>
          </div>
        </div>

        {/* CARD 4: Pagamento & Comprovante */}
        {(() => {
          const isPaidStatus =
            ride.paymentStatus === 'pago' ||
            ride.paymentStatus === 'confirmado' ||
            ride.paymentStatus === 'parcialmente_pago' ||
            ride.paymentStatus === 'parcial';
          const isAuthorizedStatus = ride.paymentStatus === 'autorizado';
          const isRefundedStatus = ride.paymentStatus === 'reembolsado';

          const paymentBadge = isCancelledRide
            ? hasCancellationFee
              ? { label: 'Taxa de cancelamento', bg: '#FEF2F2', color: '#991B1B', border: '#FECACA' }
              : isRefundedStatus
                ? { label: 'Valor estornado', bg: '#F1F5F9', color: '#334155', border: '#CBD5E1' }
                : { label: 'Sem cobrança', bg: '#F1F5F9', color: '#475569', border: '#CBD5E1' }
            : isPaidStatus
              ? { label: 'Pagamento confirmado', bg: '#F0FDF4', color: '#166534', border: '#BBF7D0' }
              : isAuthorizedStatus
                ? { label: 'Pré-autorizado', bg: '#EFF6FF', color: '#1E40AF', border: '#BFDBFE' }
                : ride.paymentMethod === 'dinheiro'
                  ? { label: 'Pagamento ao finalizar', bg: '#F8FAFC', color: '#334155', border: '#CBD5E1' }
                  : { label: 'Aguardando pagamento', bg: '#FFFBEB', color: '#92400E', border: '#FDE68A' };

          const displayAmount = isCancelledRide
            ? (hasCancellationFee ? Number(ride.cancellationFeeApplied) : 0)
            : Number(ride.totalPrice || 0);

          const methodDisplay =
            ride.paymentMethod === 'pix'
              ? 'PIX'
              : ride.paymentMethod === 'cartao_credito'
                ? 'Cartão de Crédito'
                : ride.paymentMethod === 'cartao_debito'
                  ? 'Cartão de Débito'
                  : 'Dinheiro';

          const shouldShowPixCopy =
            !isCancelledRide &&
            !isCompletedRide &&
            !isPaidStatus &&
            ride.paymentMethod === 'pix' &&
            (ride.paymentStatus === 'aguardando' || ride.paymentStatus === 'pendente');

          return (
            <div style={{
              backgroundColor: '#FFFFFF',
              borderRadius: 16,
              padding: 16,
              border: '1px solid #E2E8F0',
              boxShadow: '0 1px 4px rgba(15, 23, 42, 0.04)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, gap: 8 }}>
                <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  Pagamento &amp; Comprovante
                </div>
                <span style={{
                  fontSize: '0.68rem',
                  fontWeight: 700,
                  padding: '3px 9px',
                  borderRadius: 999,
                  backgroundColor: paymentBadge.bg,
                  color: paymentBadge.color,
                  border: `1px solid ${paymentBadge.border}`,
                  whiteSpace: 'nowrap'
                }}>
                  {paymentBadge.label}
                </span>
              </div>

              <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 14, gap: 12 }}>
                <div>
                  <div style={{ fontSize: '0.72rem', color: '#64748B', fontWeight: 600 }}>
                    {isCancelledRide ? 'Valor cobrado' : 'Valor total'}
                  </div>
                  <div style={{
                    fontSize: '1.5rem',
                    fontWeight: 800,
                    color: isCancelledRide ? '#475569' : isPaidStatus ? '#15803D' : '#0F172A',
                    letterSpacing: '-0.02em',
                    fontVariantNumeric: 'tabular-nums',
                    lineHeight: 1.15,
                    marginTop: 2
                  }}>
                    {formatCurrency(displayAmount)}
                  </div>
                  {isCancelledRide && Number(ride.totalPrice || 0) > 0 && (
                    <div style={{ fontSize: '0.7rem', color: '#94A3B8', marginTop: 2 }}>
                      Estimativa original: <span style={{ textDecoration: 'line-through' }}>{formatCurrency(ride.totalPrice)}</span>
                    </div>
                  )}
                </div>

                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '0.72rem', color: '#64748B', fontWeight: 600 }}>
                    Forma de pagamento
                  </div>
                  <div style={{ fontSize: '0.88rem', fontWeight: 700, color: '#0F172A', marginTop: 2 }}>
                    {methodDisplay}
                  </div>
                </div>
              </div>

              {/* Chave PIX exibida apenas quando há pagamento PIX em aberto */}
              {shouldShowPixCopy && (
                <div style={{
                  backgroundColor: '#F8FAFC',
                  border: '1px solid #CBD5E1',
                  borderRadius: 12,
                  padding: '10px 12px',
                  marginBottom: 14
                }}>
                  <div style={{ fontSize: '0.71rem', fontWeight: 700, color: '#475569', marginBottom: 5 }}>
                    Chave PIX oficial para pagamento
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <span style={{ fontSize: '0.79rem', color: '#0F172A', fontWeight: 700, wordBreak: 'break-all', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>
                      {config.pixKey || 'contato@upmobilidade.com.br'}
                    </span>
                    <button
                      type="button"
                      onClick={handleCopyPix}
                      style={{
                        backgroundColor: '#0F172A',
                        color: '#FFFFFF',
                        border: 'none',
                        padding: '6px 10px',
                        borderRadius: 8,
                        fontSize: '0.72rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                        flexShrink: 0
                      }}
                    >
                      {copiedPix ? <Check size={12} /> : <Copy size={12} />}
                      <span>{copiedPix ? 'Copiado' : 'Copiar'}</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Botão de Visualizar Recibo Oficial */}
              <button
                type="button"
                onClick={() => setShowReceiptModal(true)}
                style={{
                  width: '100%',
                  backgroundColor: '#0F172A',
                  color: '#FFFFFF',
                  border: 'none',
                  padding: '12px 16px',
                  borderRadius: 12,
                  fontSize: '0.86rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8
                }}
              >
                <FileText size={16} />
                <span>Visualizar Recibo Oficial</span>
              </button>

          {canClientCancelThisRide && ride && (
            <>
              {canPassengerEditRoute(ride) && (
                <button
                  type="button"
                  onClick={() => setIsEditRouteModalOpen(true)}
                  style={{
                    width: '100%',
                    marginTop: 10,
                    backgroundColor: '#F8FAFC',
                    color: '#1D4ED8',
                    border: '1px solid #BFDBFE',
                    padding: '11px 16px',
                    borderRadius: 12,
                    fontSize: '0.84rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 7
                  }}
                >
                  <Pencil size={15} />
                  <span>Alterar origem ou destino</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => setIsCancelModalOpen(true)}
                style={{
                  width: '100%',
                  marginTop: 10,
                  backgroundColor: '#FEF2F2',
                  color: '#991B1B',
                  border: '1px solid #FECACA',
                  padding: '11px 16px',
                  borderRadius: 12,
                  fontSize: '0.84rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                {ride.status === 'aguardando_pagamento' || ride.status === 'aguardando_confirmacao'
                  ? 'Cancelar solicitação'
                  : 'Cancelar viagem'}
              </button>
            </>
          )}
            </div>
          );
        })()}

      </main>

      {/* MODAL / COMPROVANTE DIGITAL OFICIAL DO PASSAGEIRO (PDF / WHATSAPP) */}
      {showReceiptModal && ride && (
        <RideReceiptModal
          isOpen={showReceiptModal}
          onClose={() => setShowReceiptModal(false)}
          ride={ride}
          config={config}
        />
      )}

      {/* Modal de Emergência SOS */}
      {ride && (
        <SosEmergencyModal
          isOpen={isSosOpen}
          onClose={() => setIsSosOpen(false)}
          currentLocationText={`${ride.origin.address} ➔ ${ride.destination.address}`}
          rideId={ride.id}
          driverPhone={ride.driverPhone || config?.companyWhatsapp || config?.companyPhone}
        />
      )}

      {/* Chat em Tempo Real com o Motorista */}
      {ride && (
        <RideChatModal
          isOpen={isChatOpen}
          ride={ride}
          viewerRole="client"
          onClose={() => setIsChatOpen(false)}
        />
      )}

      {ride && !isExternalTracking && (
        <>
          <TrustedContactsModal
            isOpen={isTrustedContactsOpen}
            onClose={() => setIsTrustedContactsOpen(false)}
            currentUser={currentLoggedUser}
            activeRide={ride}
          />
          <RideCheckAlertModal
            ride={ride}
            viewerRole="passageiro"
            onOpenSos={() => setIsSosOpen(true)}
            onResponded={refreshData}
          />
          <RideCancelModal
            isOpen={isCancelModalOpen}
            ride={ride}
            config={config}
            onClose={() => setIsCancelModalOpen(false)}
            onCancelled={(result) => {
              setIsCancelModalOpen(false);
              if (result.ride) setTrackedRide(result.ride);
              refreshData();
            }}
          />
          <RideEditRouteModal
            isOpen={isEditRouteModalOpen}
            ride={ride}
            config={config}
            onClose={() => setIsEditRouteModalOpen(false)}
            onUpdated={(updated) => {
              setIsEditRouteModalOpen(false);
              setTrackedRide(updated);
              refreshData();
            }}
          />
        </>
      )}
    </div>
  );
};

