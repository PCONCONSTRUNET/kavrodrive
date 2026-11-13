import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  Car, MapPin, Clock, Calendar, CheckCircle2, AlertCircle, 
  Phone, Navigation, ShieldCheck, ArrowLeft, Printer, 
  Copy, Check, Share2, Sparkles, User, RefreshCw, X, FileText, Play, Star
} from 'lucide-react';
import { Ride, SystemConfig } from '../types';
import { StorageService } from '../services/storage';
import { WhatsAppIcon } from '../components/WhatsAppIcon';
import { LiveGpsNavigationScreen } from '../components/LiveGpsNavigationScreen';
import { PassengerLiveMap } from '../components/PassengerLiveMap';
import { SosEmergencyModal } from '../components/SosEmergencyModal';
import { RideReceiptModal } from '../components/RideReceiptModal';
import { VehiclePhotoPreview } from '../components/VehiclePhotoPreview';
import { MercosulPlateBadge } from '../components/MercosulPlateBadge';
import { formatCurrency, formatPhone, formatRideCode, getCleanWhatsappNumber } from '../utils/format';
import { getGoogleMapsRouteUrl, calculateHaversineDistance } from '../utils/geo';

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
  const [selectedStars, setSelectedStars] = useState<number>(5);
  const [ratingComment, setRatingComment] = useState('');
  const [isSubmittingRating, setIsSubmittingRating] = useState(false);
  const [ratingSavedLocal, setRatingSavedLocal] = useState(false);

  // Busca a corrida correspondente
  const ride =
    rides.find(r => r.id === rideId || formatRideCode(r) === rideId) ||
    StorageService.getRides().find(r => r.id === rideId || formatRideCode(r) === rideId);

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

  // Auto-refresh a cada 3 segundos para pegar status e GPS atualizado do motorista em tempo real
  useEffect(() => {
    const interval = setInterval(async () => {
      await StorageService.syncFromDatabase();
      refreshData();
    }, 3000);
    return () => clearInterval(interval);
  }, [refreshData]);

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

  // Configuração visual de status
  const getStatusInfo = () => {
    switch (ride.status) {
      case 'aguardando_pagamento':
        return {
          step: 1,
          label: 'Aguardando Pagamento PIX',
          color: '#D97706',
          bg: '#FEF3C7',
          desc: 'Aguardando confirmação automática do gateway PIX para acionar o motorista mais próximo.'
        };
      case 'aguardando_confirmacao':
        return {
          step: 1,
          label: 'Procurando Motorista Próximo...',
          color: '#D97706',
          bg: '#FEF3C7',
          desc: 'Sua chamada está tocando para os motoristas parceiros online na sua região.'
        };
      case 'na_fila':
        return {
          step: 2,
          label: 'Motorista Confirmado (Finalizando Corrida Próxima)',
          color: '#D97706',
          bg: '#FEF3C7',
          desc: `🚗 ${ride.driverName || 'Seu motorista'} aceitou sua corrida! Ele está finalizando um desembarque próximo e já seguirá direto até você.`
        };
      case 'confirmada':
        return {
          step: 2,
          label: 'Motorista Confirmado',
          color: '#2563EB',
          bg: '#EFF6FF',
          desc: 'Motorista confirmado! Ele já está preparando o deslocamento até você.'
        };
      case 'a_caminho':
      case 'no_local':
        return {
          step: 3,
          label: ride.status === 'no_local' ? 'Motorista no Local de Embarque' : 'Motorista a Caminho',
          color: '#7C3AED',
          bg: '#F5F3FF',
          desc: 'O motorista está se deslocando até o seu ponto de embarque. Acompanhe no mapa ao vivo!'
        };
      case 'em_andamento':
        return {
          step: 4,
          label: 'Em Viagem',
          color: '#15803D',
          bg: '#DCFCE7',
          desc: 'Viagem em andamento rumo ao seu destino. Boa viagem!'
        };
      case 'finalizada':
        return {
          step: 5,
          label: 'Viagem Concluída',
          color: '#16A34A',
          bg: '#DCFCE7',
          desc: 'Viagem finalizada com sucesso. Obrigado por viajar com a Kavro Drive!'
        };
      case 'cancelada':
        return {
          step: 0,
          label: 'Viagem Cancelada',
          color: '#DC2626',
          bg: '#FEE2E2',
          desc: 'Esta viagem foi cancelada.'
        };
      default:
        return {
          step: 2,
          label: 'Solicitada',
          color: '#2563EB',
          bg: '#EFF6FF',
          desc: 'Corrida ativa.'
        };
    }
  };

  const statusInfo = getStatusInfo();
  const driverPhone = getCleanWhatsappNumber(ride.driverPhone || config.companyWhatsapp || '5548996915303');

  return (
    <div className="animate-fade-in" style={{ minHeight: '100vh', backgroundColor: '#F8FAFC', paddingBottom: 60 }}>
      {/* Topo / Header Executivo */}
      <header style={{
        backgroundColor: '#121A21',
        color: '#FFFFFF',
        padding: '16px 20px',
        position: 'sticky',
        top: 0,
        zIndex: 20,
        boxShadow: '0 4px 20px rgba(0,0,0,0.15)'
      }}>
        <div style={{ maxWidth: 600, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <button
            onClick={() => navigate('/cliente')}
            style={{
              background: 'rgba(255,255,255,0.1)',
              border: 'none',
              borderRadius: 10,
              width: 36,
              height: 36,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#FFFFFF',
              cursor: 'pointer'
            }}
            title="Voltar"
          >
            <ArrowLeft size={18} />
          </button>

          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '0.68rem', color: '#76D800', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              Acompanhamento ao Vivo
            </div>
            <div style={{ fontSize: '1rem', fontWeight: 900, letterSpacing: '-0.01em' }}>
              Viagem {formatRideCode(ride)}
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button
              type="button"
              onClick={() => setIsSosOpen(true)}
              style={{
                backgroundColor: '#DC2626',
                border: '1px solid #FCA5A5',
                borderRadius: 10,
                height: 36,
                padding: '0 9px',
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                color: '#FFFFFF',
                fontWeight: 900,
                fontSize: '0.74rem',
                cursor: 'pointer',
                boxShadow: '0 2px 8px rgba(220, 38, 38, 0.4)'
              }}
              title="Central de Emergência SOS"
            >
              🚨 SOS
            </button>
            <button
              onClick={handleManualRefresh}
              style={{
                background: 'rgba(255,255,255,0.1)',
                border: 'none',
                borderRadius: 10,
                width: 36,
                height: 36,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#FFFFFF',
                cursor: 'pointer'
              }}
              title="Atualizar status agora"
            >
              <RefreshCw size={16} className={isRefreshing ? 'animate-spin' : ''} />
            </button>
            <button
              onClick={handleCopyLink}
              style={{
                background: 'rgba(255,255,255,0.1)',
                border: 'none',
                borderRadius: 10,
                width: 36,
                height: 36,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: copiedLink ? '#76D800' : '#FFFFFF',
                cursor: 'pointer'
              }}
              title="Compartilhar Link da Viagem"
            >
              {copiedLink ? <Check size={16} /> : <Share2 size={16} />}
            </button>
          </div>
        </div>
      </header>

      {/* Mapa Ao Vivo Superior Estilo Uber Viagem */}
      {ride.status !== 'cancelada' && (
        <div style={{ maxWidth: 600, margin: '0 auto', height: 220, position: 'relative' }}>
          <PassengerLiveMap
            origin={ride.origin}
            destination={ride.destination}
            driverPos={ride.driverLocation || null}
          />
        </div>
      )}

      {/* Conteúdo Principal */}
      <main style={{ maxWidth: 600, margin: '-16px auto 0 auto', position: 'relative', zIndex: 10, padding: '16px 14px', backgroundColor: '#FFFFFF', borderRadius: '22px 22px 0 0', display: 'flex', flexDirection: 'column', gap: 14 }}>
        
        {/* CARD 1: Status Atual com Stepper Visual */}
        <div className="card-glass" style={{ padding: '16px', borderRadius: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{
                width: 10,
                height: 10,
                borderRadius: '50%',
                backgroundColor: statusInfo.color,
                boxShadow: `0 0 10px ${statusInfo.color}`
              }} />
              <span style={{ fontSize: '1.05rem', fontWeight: 900, color: '#121A21' }}>
                {statusInfo.label}
              </span>
            </div>
            <span style={{
              fontSize: '0.68rem',
              fontWeight: 800,
              backgroundColor: statusInfo.bg,
              color: statusInfo.color,
              padding: '3px 8px',
              borderRadius: 6
            }}>
              Atualizado ao vivo
            </span>
          </div>

          <p style={{ fontSize: '0.82rem', color: '#475569', lineHeight: 1.45, margin: '0 0 16px 0' }}>
            {statusInfo.desc}
          </p>

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
              {/* Painel de Telemetria em Tempo Real (Timer + Metros até Você + Metros até Destino) */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr 1fr',
                gap: 8,
                marginTop: 16
              }}>
                <div style={{
                  backgroundColor: '#121A21',
                  borderRadius: 12,
                  padding: '8px 10px',
                  color: '#FFFFFF',
                  textAlign: 'center'
                }}>
                  <div style={{ fontSize: '0.58rem', color: '#94A3B8', fontWeight: 800, textTransform: 'uppercase' }}>
                    ⏱ Chegada
                  </div>
                  <div style={{ fontSize: '1rem', fontWeight: 900, color: '#76D800', fontVariantNumeric: 'tabular-nums', marginTop: 2 }}>
                    {formatTimer(liveEtaSeconds)}
                  </div>
                  <div style={{ fontSize: '0.6rem', color: '#CBD5E1', fontWeight: 600 }}>
                    Tempo real
                  </div>
                </div>

                <div style={{
                  backgroundColor: '#F8FAFC',
                  borderRadius: 12,
                  padding: '8px 10px',
                  border: '1px solid #E2E8F0',
                  textAlign: 'center'
                }}>
                  <div style={{ fontSize: '0.58rem', color: '#64748B', fontWeight: 800, textTransform: 'uppercase' }}>
                    📍 Até Você
                  </div>
                  <div style={{ fontSize: '0.95rem', fontWeight: 900, color: '#0F172A', fontVariantNumeric: 'tabular-nums', marginTop: 2 }}>
                    {ride.status === 'em_andamento'
                      ? 'Embarcado'
                      : liveMetersToClient < 1000
                        ? `${liveMetersToClient} m`
                        : `${(liveMetersToClient / 1000).toFixed(1).replace('.', ',')} km`}
                  </div>
                  <div style={{ fontSize: '0.6rem', color: '#64748B', fontWeight: 700 }}>
                    {ride.status === 'em_andamento'
                      ? 'Em viagem'
                      : `${liveMetersToClient.toLocaleString('pt-BR')} m`}
                  </div>
                </div>

                <div style={{
                  backgroundColor: '#F8FAFC',
                  borderRadius: 12,
                  padding: '8px 10px',
                  border: '1px solid #E2E8F0',
                  textAlign: 'center'
                }}>
                  <div style={{ fontSize: '0.58rem', color: '#64748B', fontWeight: 800, textTransform: 'uppercase' }}>
                    🏁 Destino
                  </div>
                  <div style={{ fontSize: '0.95rem', fontWeight: 900, color: '#0F172A', fontVariantNumeric: 'tabular-nums', marginTop: 2 }}>
                    {liveMetersToDest < 1000
                      ? `${liveMetersToDest} m`
                      : `${(liveMetersToDest / 1000).toFixed(1).replace('.', ',')} km`}
                  </div>
                  <div style={{ fontSize: '0.6rem', color: '#64748B', fontWeight: 700 }}>
                    {liveMetersToDest.toLocaleString('pt-BR')} m
                  </div>
                </div>
              </div>

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

        {ride.status === 'finalizada' && (
          <div className="card-glass" style={{ padding: '16px', borderRadius: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <div style={{ fontSize: '0.78rem', fontWeight: 800, color: '#0F172A' }}>
                Avalie sua viagem com {ride.driverName || 'o motorista'}
              </div>
              {(ride.passengerRating || ratingSavedLocal) && (
                <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#15803D', backgroundColor: '#DCFCE7', padding: '2px 8px', borderRadius: 999 }}>
                  Avaliação enviada ★
                </span>
              )}
            </div>

            {ride.passengerRating || ratingSavedLocal ? (
              <div style={{ fontSize: '0.78rem', color: '#475569' }}>
                Nota registrada: <strong style={{ color: '#B45309' }}>{(ride.passengerRating || selectedStars).toFixed(1)} ★</strong>
                {(ride.passengerNotes || ratingComment) && (
                  <span> — "{ride.passengerNotes || ratingComment}"</span>
                )}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {[1, 2, 3, 4, 5].map(st => (
                    <button
                      key={st}
                      type="button"
                      onClick={() => setSelectedStars(st)}
                      style={{ background: 'none', border: 'none', padding: 2, cursor: 'pointer' }}
                    >
                      <Star
                        size={26}
                        fill={st <= selectedStars ? '#F59E0B' : 'none'}
                        color={st <= selectedStars ? '#F59E0B' : '#CBD5E1'}
                      />
                    </button>
                  ))}
                  <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#0F172A', marginLeft: 4 }}>
                    {selectedStars}.0 / 5.0
                  </span>
                </div>
                <input
                  type="text"
                  value={ratingComment}
                  onChange={e => setRatingComment(e.target.value)}
                  placeholder="Comentário opcional sobre a viagem..."
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #CBD5E1', fontSize: '0.8rem', boxSizing: 'border-box' }}
                />
                <button
                  type="button"
                  disabled={isSubmittingRating}
                  onClick={async () => {
                    setIsSubmittingRating(true);
                    try {
                      const res = await fetch(`/api/rides/${encodeURIComponent(ride.id)}/rate`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ raterRole: 'cliente', stars: selectedStars, comment: ratingComment })
                      });
                      if (res.ok) {
                        setRatingSavedLocal(true);
                        await StorageService.syncFromDatabase();
                        refreshData();
                      }
                    } finally {
                      setIsSubmittingRating(false);
                    }
                  }}
                  style={{
                    padding: '9px 14px',
                    borderRadius: 10,
                    border: 'none',
                    backgroundColor: '#0F172A',
                    color: '#FFFFFF',
                    fontSize: '0.82rem',
                    fontWeight: 700,
                    cursor: isSubmittingRating ? 'wait' : 'pointer'
                  }}
                >
                  {isSubmittingRating ? 'Enviando avaliação...' : 'Confirmar Avaliação'}
                </button>
              </div>
            )}
          </div>
        )}

        {/* CARD 2: Dados do Veículo & Motorista Particular */}
        <div className="card-glass" style={{ padding: '16px', borderRadius: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{ fontSize: '0.72rem', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Motorista Particular & Veículo Oficial
            </div>
            <span style={{
              fontSize: '0.66rem',
              fontWeight: 800,
              color: '#16A34A',
              backgroundColor: '#DCFCE7',
              padding: '2px 8px',
              borderRadius: 999,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4
            }}>
              <ShieldCheck size={12} />
              Identificado & Auditado
            </span>
          </div>

          {/* Dados do Motorista */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ position: 'relative', flexShrink: 0 }}>
                {config.driverPhoto ? (
                  <img
                    src={config.driverPhoto}
                    alt={config.driverName || 'Motorista'}
                    style={{
                      width: 50,
                      height: 50,
                      borderRadius: '50%',
                      objectFit: 'cover',
                      border: '2.5px solid #76D800'
                    }}
                  />
                ) : (
                  <div style={{
                    width: 50,
                    height: 50,
                    borderRadius: '50%',
                    backgroundColor: '#121A21',
                    color: '#76D800',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 900,
                    fontSize: '1.2rem',
                    border: '2.5px solid #76D800'
                  }}>
                    {(config.driverName || 'M').charAt(0).toUpperCase()}
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
                  {config.driverName || 'Motorista Particular UP'}
                </div>
                <div style={{ fontSize: '0.74rem', color: '#64748B', marginTop: 1 }}>
                  Kavro Drive • Transporte Particular Executivo
                </div>
                <div style={{ fontSize: '0.72rem', color: '#16A34A', fontWeight: 700, marginTop: 2 }}>
                  {formatPhone(config.driverPhone || config.companyPhone || '(48) 99691-5303')}
                </div>
              </div>
            </div>
          </div>

          {/* Ficha Visual do Carro (Foto Real ou Modelo com Cor Exata e Placa Mercosul) */}
          <div style={{ marginBottom: 12 }}>
            <VehiclePhotoPreview
              photoUrl={config.driverCarPhoto}
              brand={config.driverCarBrand}
              model={config.driverCarModel}
              colorName={config.driverCarColor}
              plate={config.driverPlate}
              category={config.driverCarCategory || 'Sedan Executivo'}
              year={config.driverCarYear}
              size="compact"
              showPlate={Boolean(config.driverPlate?.trim())}
            />
          </div>

          {/* Itens de Conforto e Segurança */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-around',
            backgroundColor: '#F8FAFC',
            padding: '7px 10px',
            borderRadius: 10,
            border: '1px solid #E2E8F0',
            marginBottom: 12,
            fontSize: '0.70rem',
            color: '#475569',
            fontWeight: 700
          }}>
            <span>❄️ Ar-condicionado</span>
            <span>•</span>
            <span>🛡️ Seguro APP</span>
            <span>•</span>
            <span>🧼 Higienizado</span>
          </div>

          {/* Botões de Ação Direta com o Motorista */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <a
              href={`https://wa.me/${driverPhone}?text=Ol%C3%A1,%20sou%20o%20passageiro%20${encodeURIComponent(ride.clientName)}%20sobre%20a%20viagem%20${ride.id}.`}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                backgroundColor: '#25D366',
                color: '#FFFFFF',
                borderRadius: 12,
                padding: '10px 14px',
                textDecoration: 'none',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                fontSize: '0.82rem',
                fontWeight: 800,
                boxShadow: '0 2px 8px rgba(37, 211, 102, 0.25)'
              }}
            >
              <WhatsAppIcon size={18} />
              <span>WhatsApp</span>
            </a>

            <a
              href={`tel:+${driverPhone}`}
              style={{
                backgroundColor: '#FFFFFF',
                border: '1.5px solid #CBD5E1',
                color: '#121A21',
                borderRadius: 12,
                padding: '10px 14px',
                textDecoration: 'none',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                fontSize: '0.82rem',
                fontWeight: 800
              }}
            >
              <Phone size={16} />
              <span>Ligar</span>
            </a>
          </div>
        </div>

        {/* CARD 3: Detalhes do Trajeto & Horário */}
        <div className="card-glass" style={{ padding: '16px', borderRadius: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{ fontSize: '0.72rem', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Trajeto & Horário
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.74rem', color: '#121A21', fontWeight: 800 }}>
              <Calendar size={13} color="#76D800" />
              <span>{ride.date.split('-').reverse().join('/')}</span>
              <span style={{ color: '#94A3B8' }}>•</span>
              <Clock size={13} color="#76D800" />
              <span>{ride.time}</span>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, position: 'relative' }}>
            {/* Ponto de Embarque */}
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
              <div style={{
                width: 24,
                height: 24,
                borderRadius: '50%',
                backgroundColor: '#DCFCE7',
                color: '#15803D',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                marginTop: 2
              }}>
                <MapPin size={14} />
              </div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: '0.68rem', color: '#64748B', fontWeight: 700, textTransform: 'uppercase' }}>
                  Embarque
                </div>
                <div style={{ fontSize: '0.88rem', fontWeight: 700, color: '#121A21' }}>
                  {ride.origin.address}
                </div>
                {ride.origin.reference && (
                  <div style={{ fontSize: '0.72rem', color: '#64748B', marginTop: 2 }}>
                    Ref: {ride.origin.reference}
                  </div>
                )}
              </div>
            </div>

            {/* Linha pontilhada conectora */}
            <div style={{
              width: 2,
              height: 18,
              backgroundColor: '#CBD5E1',
              marginLeft: 11,
              marginTop: -6,
              marginBottom: -6
            }} />

            {/* Ponto de Desembarque */}
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
              <div style={{
                width: 24,
                height: 24,
                borderRadius: '50%',
                backgroundColor: '#121A21',
                color: '#76D800',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                marginTop: 2
              }}>
                <Navigation size={13} />
              </div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: '0.68rem', color: '#64748B', fontWeight: 700, textTransform: 'uppercase' }}>
                  Destino
                </div>
                <div style={{ fontSize: '0.88rem', fontWeight: 700, color: '#121A21' }}>
                  {ride.destination.address}
                </div>
              </div>
            </div>
          </div>

          {/* Métricas da Rota */}
          <div style={{
            marginTop: 14,
            padding: '10px 12px',
            borderRadius: 12,
            backgroundColor: '#F8FAFC',
            border: '1px solid #E2E8F0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: '0.76rem',
            color: '#475569'
          }}>
            <div>
              Distância: <strong>{ride.distanceKm.toFixed(1)} km</strong>
            </div>
            <div>•</div>
            <div>
              Tempo Estimado: <strong>~{ride.durationMin || 30} min</strong>
            </div>
            <div>•</div>
            <a
              href={getGoogleMapsRouteUrl(ride.origin, ride.destination)}
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: '#2563EB', fontWeight: 700, textDecoration: 'none' }}
            >
              Abrir Mapa ➔
            </a>
          </div>
        </div>

        {/* CARD 4: Pagamento & Recibo Oficial */}
        <div className="card-glass" style={{ padding: '16px', borderRadius: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{ fontSize: '0.72rem', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Pagamento & Comprovante
            </div>
            <span style={{
              fontSize: '0.7rem',
              fontWeight: 800,
              padding: '2px 8px',
              borderRadius: 6,
              backgroundColor: ride.paymentStatus === 'pago' ? '#DCFCE7' : '#FEF3C7',
              color: ride.paymentStatus === 'pago' ? '#15803D' : '#B45309'
            }}>
              {ride.paymentStatus === 'pago' ? '✓ Quitado / Pago' : '⏳ Pagamento no Embarque'}
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <div>
              <div style={{ fontSize: '0.72rem', color: '#64748B' }}>Valor Total da Viagem</div>
              <div style={{ fontSize: '1.6rem', fontWeight: 900, color: '#16A34A', letterSpacing: '-0.02em' }}>
                {formatCurrency(ride.totalPrice)}
              </div>
            </div>

            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '0.72rem', color: '#64748B' }}>Forma Escolhida</div>
              <div style={{ fontSize: '0.9rem', fontWeight: 800, color: '#121A21' }}>
                {ride.paymentMethod === 'pix' ? 'PIX Instantâneo' :
                 ride.paymentMethod === 'cartao_credito' ? 'Cartão de Crédito' : 'Dinheiro em Mãos'}
              </div>
            </div>
          </div>

          {/* Se for PIX e não estiver pago ainda, oferece Chave PIX rápida */}
          {ride.paymentMethod === 'pix' && ride.paymentStatus !== 'pago' && (
            <div style={{
              backgroundColor: '#F0FDF4',
              border: '1.5px solid #BBF7D0',
              borderRadius: 12,
              padding: '10px 12px',
              marginBottom: 14
            }}>
              <div style={{ fontSize: '0.74rem', fontWeight: 800, color: '#166534', marginBottom: 4 }}>
                Chave PIX Oficial para Pagamento:
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <span style={{ fontSize: '0.8rem', color: '#14532D', fontWeight: 700, wordBreak: 'break-all' }}>
                  {config.pixKey || 'contato@upmobilidade.com.br'}
                </span>
                <button
                  type="button"
                  onClick={handleCopyPix}
                  style={{
                    backgroundColor: '#16A34A',
                    color: '#FFFFFF',
                    border: 'none',
                    padding: '4px 10px',
                    borderRadius: 8,
                    fontSize: '0.72rem',
                    fontWeight: 800,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    flexShrink: 0
                  }}
                >
                  {copiedPix ? <Check size={12} /> : <Copy size={12} />}
                  <span>{copiedPix ? 'Copiado!' : 'Copiar'}</span>
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
              backgroundColor: '#121A21',
              color: '#FFFFFF',
              border: 'none',
              padding: '12px 16px',
              borderRadius: 12,
              fontSize: '0.88rem',
              fontWeight: 800,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              boxShadow: '0 4px 12px rgba(18, 26, 33, 0.15)'
            }}
          >
            <FileText size={16} color="#76D800" />
            <span>Visualizar Recibo Oficial da Corrida</span>
          </button>
        </div>

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
          driverPhone={config?.driverPhone || config?.companyPhone || config?.companyWhatsapp}
        />
      )}
    </div>
  );
};

