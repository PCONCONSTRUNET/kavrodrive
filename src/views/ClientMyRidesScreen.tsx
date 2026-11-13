import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { 
  Calendar, Clock, MapPin, ChevronRight, 
  ExternalLink, Copy, Check, Navigation, FileText, X, Bell, Play
} from 'lucide-react';
import { Ride, SystemConfig } from '../types';
import { StorageService } from '../services/storage';
import { getGoogleMapsRouteUrl } from '../utils/geo';
import { getCleanWhatsappNumber, formatRideCode } from '../utils/format';
import { WhatsAppIcon } from '../components/WhatsAppIcon';
import { LiveGpsNavigationScreen } from '../components/LiveGpsNavigationScreen';
import { SosEmergencyModal } from '../components/SosEmergencyModal';
import { NotificationsModal } from '../components/NotificationsModal';

interface ClientMyRidesScreenProps {
  rides: Ride[];
  config: SystemConfig;
  onBookNewRide: () => void;
}

export const ClientMyRidesScreen: React.FC<ClientMyRidesScreenProps> = ({
  rides,
  config,
  onBookNewRide,
}) => {
  const [localRides, setLocalRides] = useState<Ride[]>(rides);
  const [selectedRide, setSelectedRide] = useState<Ride | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [liveTrackingRide, setLiveTrackingRide] = useState<Ride | null>(null);
  const [isSosOpen, setIsSosOpen] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
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

  // Atualização direta e em tempo real a partir do Storage / Supabase
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
      if (fresh && (fresh.status !== selectedRide.status || fresh.paymentStatus !== selectedRide.paymentStatus)) {
        setSelectedRide(fresh);
      }
    }
  };

  // Sincronização em tempo real quando o cliente está visualizando Minhas Corridas
  useEffect(() => {
    StorageService.syncFromDatabase().then(() => updateFromStore());

    const handleSync = () => {
      updateFromStore();
    };

    window.addEventListener('up_rides_updated', handleSync);
    window.addEventListener('up_database_synced', handleSync);

    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        StorageService.syncFromDatabase().then(() => updateFromStore());
      }
    }, 1500);

    return () => {
      clearInterval(interval);
      window.removeEventListener('up_rides_updated', handleSync);
      window.removeEventListener('up_database_synced', handleSync);
    };
  }, [selectedRide?.id]);

  // Se a lista de corridas do componente pai atualizar, sincroniza o modal aberto se necessário
  useEffect(() => {
    if (selectedRide) {
      const fresh = rides.find(r => r.id === selectedRide.id);
      if (fresh && (fresh.status !== selectedRide.status || fresh.paymentStatus !== selectedRide.paymentStatus)) {
        setSelectedRide(fresh);
      }
    }
  }, [rides]);

  // Travar scroll do fundo da página quando o modal de detalhes do pedido estiver aberto
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

  const getStatusLabel = (status: Ride['status']) => {
    switch (status) {
      case 'aguardando_confirmacao':
        return { label: 'Aguardando Confirmação', class: 'badge-aguardando_confirmacao' };
      case 'confirmada':
        return { label: 'Confirmada pelo Motorista', class: 'badge-confirmada' };
      case 'a_caminho':
        return { label: 'Motorista a Caminho', class: 'badge-a_caminho' };
      case 'em_andamento':
        return { label: 'Corrida em Andamento', class: 'badge-em_andamento' };
      case 'finalizada':
        return { label: 'Finalizada com Sucesso', class: 'badge-finalizada' };
      case 'cancelada':
        return { label: 'Cancelada', class: 'badge-cancelada' };
      default:
        return { label: status, class: 'badge-finalizada' };
    }
  };

  const handleCopyCode = (id: string) => {
    navigator.clipboard.writeText(id);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="animate-fade-in" style={{ padding: '16px 20px 90px 20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#121A21' }}>Minhas Corridas</h2>
          <p style={{ fontSize: '0.78rem', color: '#64748B' }}>Histórico e agendamentos ativos</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button
            type="button"
            onClick={() => setIsSosOpen(true)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              backgroundColor: '#DC2626',
              color: '#FFFFFF',
              border: 'none',
              padding: '7px 11px',
              borderRadius: 20,
              fontSize: '0.76rem',
              fontWeight: 800,
              cursor: 'pointer',
              boxShadow: '0 2px 8px rgba(220, 38, 38, 0.35)',
              flexShrink: 0
            }}
            title="Central de Emergência SOS"
          >
            <span>🚨 SOS</span>
          </button>

          {/* Botão de Notificações */}
          <button
            type="button"
            onClick={() => setIsNotificationsOpen(true)}
            style={{
              width: 32,
              height: 32,
              borderRadius: '50%',
              backgroundColor: '#FFFFFF',
              border: '1.5px solid #E2E8F0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#121A21',
              cursor: 'pointer',
              position: 'relative',
              flexShrink: 0,
              boxShadow: '0 2px 5px rgba(0,0,0,0.04)'
            }}
            title="Notificações e Avisos"
          >
            <Bell size={16} strokeWidth={2.4} />
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

          <button
            onClick={onBookNewRide}
            className="btn-primary"
            style={{ padding: '8px 14px', fontSize: '0.8rem' }}
          >
            + Novo
          </button>
        </div>
      </div>

      {localRides.length === 0 ? (
        <div className="card-glass" style={{ padding: 36, textAlign: 'center' }}>
          <Calendar size={44} color="#94A3B8" style={{ margin: '0 auto 12px auto' }} />
          <h3 style={{ fontSize: '1rem', color: '#121A21', marginBottom: 6 }}>Nenhuma corrida encontrada</h3>
          <p style={{ fontSize: '0.82rem', color: '#64748B', marginBottom: 18 }}>
            Você ainda não possui viagens agendadas no Kavro Drive.
          </p>
          <button onClick={onBookNewRide} className="btn-primary" style={{ padding: '12px 20px' }}>
            Agendar Minha Primeira Viagem
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {localRides.map((ride) => {
            const statusInfo = getStatusLabel(ride.status);
            const isLive = ride.status === 'a_caminho' || ride.status === 'em_andamento';
            const isConfirmed = ride.status === 'confirmada';

            return (
              <div
                key={ride.id}
                onClick={() => setSelectedRide(ride)}
                className="card-glass"
                style={{
                  padding: 16,
                  cursor: 'pointer',
                  backgroundColor: '#FFFFFF',
                  borderRadius: 16,
                  border: isLive ? '2px solid #111111' : selectedRide?.id === ride.id ? '2px solid #111111' : '1px solid #E5E7EB',
                  boxShadow: isLive ? '0 6px 20px rgba(0, 0, 0, 0.08)' : '0 2px 8px rgba(0, 0, 0, 0.03)',
                  transition: 'all 0.15s ease'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: '0.88rem', fontWeight: 900, color: '#111111' }}>{formatRideCode(ride)}</span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleCopyCode(formatRideCode(ride));
                      }}
                      style={{ background: 'none', border: 'none', color: '#9CA3AF', cursor: 'pointer', padding: 2 }}
                    >
                      {copiedId === formatRideCode(ride) ? <Check size={14} color="#16A34A" /> : <Copy size={14} />}
                    </button>
                  </div>
                  <span className={`badge-status ${statusInfo.class}`}>
                    {statusInfo.label}
                  </span>
                </div>

                {/* Data e Hora */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, fontSize: '0.82rem', color: '#4B5563', marginBottom: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Calendar size={14} color="#111111" />
                    <span>{ride.date.split('-').reverse().join('/')}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Clock size={14} color="#111111" />
                    <span>{ride.time}</span>
                  </div>
                </div>

                {/* Embarque e Destino simplificado */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: '0.82rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: '#16A34A', flexShrink: 0 }} />
                    <span style={{ color: '#374151', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {ride.origin.address}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: '#111111', flexShrink: 0 }} />
                    <span style={{ color: '#334155', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {ride.destination.address}
                    </span>
                  </div>
                </div>

                {/* Valor e Ação */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 14, paddingTop: 10, borderTop: '1px solid #F1F5F9' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ fontSize: '0.98rem', fontWeight: 800, color: '#121A21' }}>
                      R$ {ride.totalPrice.toFixed(2)}
                    </div>
                    {ride.paymentMethod === 'pix' && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, background: '#F8FAFC', border: '1px solid #E2E8F0', padding: '2px 6px', borderRadius: 6 }}>
                        <img width="14" height="14" src="https://img.icons8.com/fluency/48/pix.png" alt="pix" />
                        <span style={{ fontSize: '0.68rem', fontWeight: 700, color: '#475569' }}>PIX</span>
                      </div>
                    )}
                    {ride.paymentMethod === 'cartao_credito' && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, background: '#F8FAFC', border: '1px solid #E2E8F0', padding: '2px 6px', borderRadius: 6 }}>
                        <img width="14" height="14" src="https://img.icons8.com/color/48/bank-card-back-side.png" alt="cartão" />
                        <span style={{ fontSize: '0.68rem', fontWeight: 700, color: '#475569' }}>Cartão</span>
                      </div>
                    )}
                    {ride.paymentMethod === 'dinheiro' && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, background: '#F8FAFC', border: '1px solid #E2E8F0', padding: '2px 6px', borderRadius: 6 }}>
                        <img width="14" height="14" src="https://img.icons8.com/fluency/48/money.png" alt="dinheiro" />
                        <span style={{ fontSize: '0.68rem', fontWeight: 700, color: '#475569' }}>Dinheiro</span>
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.78rem', color: '#111111', fontWeight: 700 }}>
                    <span>Ver detalhes</span>
                    <ChevronRight size={15} />
                  </div>
                </div>

                {/* BOTÃO DIRETO DE VER AO VIVO NO GPS NO PRÓPRIO CARD */}
                {isLive && (
                  <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px dashed #E5E7EB' }}>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setLiveTrackingRide(ride);
                      }}
                      style={{
                        width: '100%',
                        height: 44,
                        backgroundColor: '#111111',
                        color: '#FFFFFF',
                        border: 'none',
                        borderRadius: 10,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 8,
                        fontSize: '0.84rem',
                        fontWeight: 800,
                        cursor: 'pointer'
                      }}
                    >
                      <Navigation size={16} color="#FFFFFF" fill="#FFFFFF" />
                      <span>
                        {ride.status === 'a_caminho' ? 'Motorista a Caminho — Ver ao Vivo' : 'Corrida em Andamento — Acompanhar GPS'}
                      </span>
                    </button>
                  </div>
                )}

                {isConfirmed && (
                  <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px dashed #E5E7EB' }}>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setLiveTrackingRide(ride);
                      }}
                      style={{
                        width: '100%',
                        height: 40,
                        backgroundColor: '#F3F4F6',
                        color: '#111111',
                        border: '1px solid #E5E7EB',
                        borderRadius: 10,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 7,
                        fontSize: '0.80rem',
                        fontWeight: 800,
                        cursor: 'pointer'
                      }}
                    >
                      <Navigation size={14} color="#111111" />
                      <span>Acompanhar Motorista / Rota ao Vivo</span>
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Modal / Sheet de Detalhes da Corrida Selecionada */}
      {selectedRide && createPortal(
        <div 
          className="modal-backdrop"
          onClick={(e) => {
            if (e.target === e.currentTarget) setSelectedRide(null);
          }}
          style={{
            zIndex: 9999,
            alignItems: 'flex-end',
            justifyContent: 'center',
            overscrollBehavior: 'contain'
          }}
        >
          <div
            className="modal-sheet"
            onClick={(e) => e.stopPropagation()}
            style={{
              maxHeight: '88dvh',
              maxWidth: 500,
              width: '100%',
              backgroundColor: '#FFFFFF',
              borderRadius: '24px 24px 0 0',
              boxShadow: '0 -10px 40px rgba(0,0,0,0.25)',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              padding: 0
            }}
          >
            {/* ── CABEÇALHO FIXO DO MODAL ── */}
            <div style={{
              padding: '12px 18px 12px 18px',
              borderBottom: '1px solid #F1F5F9',
              flexShrink: 0,
              backgroundColor: '#FFFFFF'
            }}>
              {/* Grab handle iOS */}
              <div style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: '#CBD5E1', margin: '0 auto 12px auto' }} />

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{
                    backgroundColor: '#121A21',
                    color: '#76D800',
                    fontWeight: 800,
                    fontSize: '0.84rem',
                    padding: '4px 10px',
                    borderRadius: 999
                  }}>
                    {formatRideCode(selectedRide)}
                  </span>
                  <span className={`badge-status ${getStatusLabel(selectedRide.status).class}`}>
                    {getStatusLabel(selectedRide.status).label}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedRide(null)}
                  style={{
                    background: '#F1F5F9',
                    border: 'none',
                    borderRadius: '50%',
                    width: 32,
                    height: 32,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#475569',
                    flexShrink: 0
                  }}
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            {/* ── CORPO COM SCROLL SUAVE INTERNO ── */}
            <div style={{
              flex: 1,
              minHeight: 0,
              overflowY: 'auto',
              WebkitOverflowScrolling: 'touch',
              overscrollBehavior: 'contain',
              touchAction: 'pan-y',
              padding: '14px 18px',
              display: 'flex',
              flexDirection: 'column',
              gap: 10
            }}>
              {/* Horário e Distância */}
              <div style={{
                background: '#F8FAFC',
                padding: '12px 14px',
                borderRadius: 14,
                border: '1px solid #E2E8F0',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between'
              }}>
                <div>
                  <div style={{ fontSize: '0.68rem', color: '#64748B', fontWeight: 700, textTransform: 'uppercase' }}>Data e Horário</div>
                  <div style={{ fontSize: '0.9rem', fontWeight: 800, color: '#0F172A', marginTop: 2 }}>
                    {selectedRide.date.split('-').reverse().join('/')} às {selectedRide.time}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '0.68rem', color: '#64748B', fontWeight: 700, textTransform: 'uppercase' }}>Percurso</div>
                  <div style={{ fontSize: '0.84rem', fontWeight: 800, color: '#4D9400', marginTop: 2 }}>
                    {selectedRide.distanceKm.toFixed(1)} km • ~{selectedRide.durationMin} min
                  </div>
                </div>
              </div>

              {/* Trajeto Completo */}
              <div style={{
                background: '#F8FAFC',
                padding: '12px 14px',
                borderRadius: 14,
                border: '1px solid #E2E8F0'
              }}>
                <div style={{ fontSize: '0.68rem', color: '#64748B', fontWeight: 700, textTransform: 'uppercase', marginBottom: 10 }}>
                  Trajeto da Corrida
                </div>

                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 10 }}>
                  <div style={{
                    width: 18,
                    height: 18,
                    borderRadius: '50%',
                    backgroundColor: 'rgba(118, 216, 0, 0.2)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    marginTop: 2
                  }}>
                    <div style={{ width: 7, height: 7, borderRadius: '50%', backgroundColor: '#76D800' }} />
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: '0.68rem', color: '#64748B', fontWeight: 600 }}>Embarque</div>
                    <div style={{ fontSize: '0.84rem', fontWeight: 700, color: '#0F172A', lineHeight: 1.3 }}>{selectedRide.origin.address}</div>
                    {selectedRide.origin.reference && (
                      <div style={{ fontSize: '0.72rem', color: '#64748B' }}>Ref: {selectedRide.origin.reference}</div>
                    )}
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                  <div style={{
                    width: 18,
                    height: 18,
                    borderRadius: '50%',
                    backgroundColor: 'rgba(18, 26, 33, 0.1)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    marginTop: 2
                  }}>
                    <MapPin size={11} color="#121A21" />
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: '0.68rem', color: '#64748B', fontWeight: 600 }}>Destino</div>
                    <div style={{ fontSize: '0.84rem', fontWeight: 700, color: '#0F172A', lineHeight: 1.3 }}>{selectedRide.destination.address}</div>
                  </div>
                </div>
              </div>

              {/* Card Unificado Clean: Forma de Pagamento + Valor Total */}
              <div style={{
                background: '#FFFFFF',
                borderRadius: 14,
                padding: '12px 14px',
                border: '1.5px solid #E2E8F0',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 10
              }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                    <span style={{ fontSize: '0.68rem', color: '#64748B', fontWeight: 700, textTransform: 'uppercase' }}>
                      Pagamento
                    </span>
                    <span style={{
                      fontSize: '0.64rem',
                      fontWeight: 800,
                      textTransform: 'uppercase',
                      padding: '2px 7px',
                      borderRadius: 999,
                      backgroundColor: selectedRide.paymentStatus === 'pago' ? '#DCFCE7' : '#FEF3C7',
                      color: selectedRide.paymentStatus === 'pago' ? '#15803D' : '#B45309'
                    }}>
                      {selectedRide.paymentStatus === 'pago' ? '✓ Pago' : 'Pendente'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {selectedRide.paymentMethod === 'pix' && (
                      <>
                        <img width="20" height="20" src="https://img.icons8.com/fluency/48/pix.png" alt="pix" />
                        <span style={{ fontWeight: 800, color: '#0F172A', fontSize: '0.86rem' }}>PIX Instantâneo</span>
                      </>
                    )}
                    {selectedRide.paymentMethod === 'cartao_credito' && (
                      <>
                        <img width="20" height="20" src="https://img.icons8.com/color/48/bank-card-back-side.png" alt="cartão" />
                        <span style={{ fontWeight: 800, color: '#0F172A', fontSize: '0.86rem' }}>Cartão de Crédito</span>
                      </>
                    )}
                    {selectedRide.paymentMethod === 'dinheiro' && (
                      <>
                        <img width="20" height="20" src="https://img.icons8.com/fluency/48/money.png" alt="dinheiro" />
                        <span style={{ fontWeight: 800, color: '#0F172A', fontSize: '0.86rem' }}>Dinheiro em mãos</span>
                      </>
                    )}
                  </div>
                </div>

                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontSize: '0.66rem', color: '#64748B', fontWeight: 700, textTransform: 'uppercase' }}>
                    Valor Total
                  </div>
                  <div style={{ fontSize: '1.35rem', fontWeight: 900, color: '#16A34A', lineHeight: 1.1 }}>
                    R$ {selectedRide.totalPrice.toFixed(2).replace('.', ',')}
                  </div>
                </div>
              </div>

              {/* ── BOTÕES DE AÇÃO COMPACTOS E ORGANIZADOS ── */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 2, paddingBottom: 'calc(6px + env(safe-area-inset-bottom, 0px))' }}>
                {/* Botão Principal: GPS ao Vivo em Tempo Real */}
                {(selectedRide.status === 'confirmada' || selectedRide.status === 'a_caminho' || selectedRide.status === 'em_andamento') && (
                  <button
                    type="button"
                    onClick={() => {
                      const target = selectedRide;
                      setSelectedRide(null);
                      setLiveTrackingRide(target);
                    }}
                    style={{
                      backgroundColor: '#111111',
                      color: '#FFFFFF',
                      border: 'none',
                      borderRadius: 10,
                      height: 44,
                      padding: '0 14px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 8,
                      fontSize: '0.88rem',
                      fontWeight: 800,
                      cursor: 'pointer',
                      width: '100%'
                    }}
                  >
                    <Navigation size={17} color="#FFFFFF" />
                    <span>Ver Motorista no GPS em Tempo Real</span>
                  </button>
                )}

                {/* Grade 2 Colunas: WhatsApp + Ver Recibo */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <a
                    href={`https://wa.me/${getCleanWhatsappNumber(config.companyWhatsapp)}?text=Ol%C3%A1,%20sobre%20minha%20reserva%20${selectedRide.id}%20agendada%20para%20${selectedRide.date}%20%C3%A0s%20${selectedRide.time}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      backgroundColor: '#25D366',
                      color: '#FFFFFF',
                      borderRadius: 12,
                      height: 42,
                      padding: '0 10px',
                      textDecoration: 'none',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 6,
                      fontSize: '0.82rem',
                      fontWeight: 800,
                      boxShadow: '0 2px 8px rgba(37, 211, 102, 0.22)'
                    }}
                  >
                    <WhatsAppIcon size={18} />
                    <span>WhatsApp</span>
                  </a>

                  <a
                    href={`/viagem/${selectedRide.id}`}
                    style={{
                      backgroundColor: '#121A21',
                      color: '#FFFFFF',
                      borderRadius: 12,
                      height: 42,
                      padding: '0 10px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 6,
                      fontSize: '0.82rem',
                      fontWeight: 800,
                      textDecoration: 'none'
                    }}
                  >
                    <FileText size={16} color="#76D800" />
                    <span>Recibo & Status</span>
                  </a>
                </div>

                {/* Botão Secundário Compacto: Rota no Google Maps */}
                <a
                  href={getGoogleMapsRouteUrl(selectedRide.origin, selectedRide.destination)}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    backgroundColor: '#F1F5F9',
                    color: '#334155',
                    border: '1px solid #E2E8F0',
                    borderRadius: 12,
                    height: 38,
                    padding: '0 12px',
                    textDecoration: 'none',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                    fontSize: '0.8rem',
                    fontWeight: 700
                  }}
                >
                  <ExternalLink size={14} />
                  <span>Abrir Rota no Google Maps</span>
                </a>
              </div>
            </div>
          </div>
        </div>,
        document.body
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
    </div>
  );
};
