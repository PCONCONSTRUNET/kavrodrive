import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { 
  X, Calendar, Clock, MapPin, Phone, MessageSquare, ExternalLink, 
  CheckCircle2, AlertTriangle, Trash2, Check, Copy, Navigation, Shield, DollarSign,
  User, Luggage, Sparkles, Edit2, Lock, FileText, Play
} from 'lucide-react';
import { Ride, RideStatus, PaymentStatus, SystemConfig } from '../types';
import { getGoogleMapsRouteUrl } from '../utils/geo';
import { WhatsAppIcon } from './WhatsAppIcon';
import { RideReceiptModal } from './RideReceiptModal';
import { RideRoutePlaybackModal } from './RideRoutePlaybackModal';
import { formatPhone, formatRideCode } from '../utils/format';

interface RideDetailAdminModalProps {
  ride: Ride | null;
  isOpen: boolean;
  onClose: () => void;
  config: SystemConfig;
  onUpdateStatus: (rideId: string, newStatus: RideStatus) => boolean | void;
  onUpdatePaymentStatus: (rideId: string, newPaymentStatus: PaymentStatus) => void;
  onDeleteRide: (rideId: string) => void;
  onOpenGps?: (ride: Ride) => void;
  onOpenCheckout?: (ride: Ride) => void;
  onEditRide?: (ride: Ride) => void;
}

export const RideDetailAdminModal: React.FC<RideDetailAdminModalProps> = ({
  ride,
  isOpen,
  onClose,
  config,
  onUpdateStatus,
  onUpdatePaymentStatus,
  onDeleteRide,
  onOpenGps,
  onOpenCheckout,
  onEditRide,
}) => {
  const [copied, setCopied] = useState(false);
  const [isReceiptModalOpen, setIsReceiptModalOpen] = useState(false);
  const [isRoutePlaybackOpen, setIsRoutePlaybackOpen] = useState(false);

  if (!isOpen || !ride) return null;

  const rideCode = formatRideCode(ride);

  const handleCopyId = () => {
    navigator.clipboard.writeText(rideCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const cleanPhone = ride.clientPhone.replace(/\D/g, '');
  const whatsappUrl = `https://wa.me/55${cleanPhone}?text=Ol%C3%A1%20${encodeURIComponent(ride.clientName)},%20sou%20seu%20motorista%20da%20UP%20Mobilidade%20sobre%20a%20corrida%20${encodeURIComponent(rideCode)}.`;

  const getStatusBadge = (status: RideStatus) => {
    switch (status) {
      case 'aguardando_confirmacao':
        return { label: 'Aguardando Confirmação', bg: '#FEF3C7', color: '#B45309', border: '#FDE68A', stripe: '#F59E0B' };
      case 'confirmada':
        return { label: 'Confirmada', bg: '#EFF6FF', color: '#1D4ED8', border: '#BFDBFE', stripe: '#2563EB' };
      case 'a_caminho':
        return { label: 'Motorista a Caminho', bg: '#EFF6FF', color: '#1D4ED8', border: '#BFDBFE', stripe: '#2563EB' };
      case 'em_andamento':
        return { label: 'Em Andamento', bg: '#EFF6FF', color: '#1D4ED8', border: '#BFDBFE', stripe: '#2563EB' };
      case 'finalizada':
        return { label: 'Finalizada', bg: '#DCFCE7', color: '#15803D', border: '#BBF7D0', stripe: '#16A34A' };
      case 'cancelada':
        return { label: 'Cancelada', bg: '#FEE2E2', color: '#DC2626', border: '#FECACA', stripe: '#EF4444' };
      default:
        return { label: status, bg: '#F1F5F9', color: '#334155', border: '#E2E8F0', stripe: '#94A3B8' };
    }
  };

  const statusInfo = getStatusBadge(ride.status);

  return createPortal(
    <div
      className="app-fullscreen-modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="app-fullscreen-modal-card">
        {/* Cabeçalho Compacto */}
        <div style={{
          padding: '12px 14px',
          borderBottom: '1px solid #F1F5F9',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: '#ffffff'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              backgroundColor: '#121A21',
              color: '#76D800',
              fontWeight: 800,
              fontSize: '0.84rem',
              padding: '4px 10px',
              borderRadius: 14
            }}>
              <span>{rideCode}</span>
              <button
                type="button"
                onClick={handleCopyId}
                title="Copiar código"
                style={{ background: 'none', border: 'none', color: '#94A3B8', cursor: 'pointer', padding: 0, display: 'flex' }}
              >
                {copied ? <Check size={12} color="#76D800" /> : <Copy size={12} />}
              </button>
            </span>

            <span style={{
              fontSize: '0.7rem',
              fontWeight: 800,
              padding: '3px 8px',
              borderRadius: 12,
              backgroundColor: statusInfo.bg,
              color: statusInfo.color,
              border: `1px solid ${statusInfo.border}`
            }}>
              {statusInfo.label}
            </span>

            {/* Selo de Data no Cabeçalho */}
            <span style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              fontSize: '0.74rem',
              fontWeight: 800,
              padding: '3px 9px',
              borderRadius: 10,
              backgroundColor: '#F0FDF4',
              color: '#15803D',
              border: '1px solid #DCFCE7'
            }}>
              <Calendar size={12} color="#15803D" />
              <span>{ride.date.split('-').reverse().join('/')}</span>
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {onEditRide && ride.isManualBooking ? (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onEditRide(ride);
                }}
                title="Editar dados da corrida manual"
                style={{
                  background: '#F1F5F9',
                  border: 'none',
                  borderRadius: '50%',
                  width: 30,
                  height: 30,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#334155'
                }}
              >
                <Edit2 size={13} />
              </button>
            ) : (
              <span
                title="Agendamento realizado diretamente pelo cliente (Edição restrita)"
                style={{
                  background: '#F8FAFC',
                  border: '1px solid #E2E8F0',
                  borderRadius: '50%',
                  width: 30,
                  height: 30,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#94A3B8'
                }}
              >
                <Lock size={12} />
              </span>
            )}

            <button
              type="button"
              onClick={onClose}
              style={{
                background: '#F1F5F9',
                border: 'none',
                borderRadius: '50%',
                width: 30,
                height: 30,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#64748B'
              }}
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Corpo do Modal Otimizado para Mobile */}
        <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {/* DESTAQUE PRINCIPAL: DATA E HORÁRIO DO AGENDAMENTO */}
          <div style={{
            background: 'linear-gradient(135deg, #0F172A 0%, #1E293B 100%)',
            borderRadius: 14,
            padding: '12px 16px',
            color: '#FFFFFF',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            boxShadow: '0 4px 14px rgba(15, 23, 42, 0.25)',
            border: '1px solid rgba(255, 255, 255, 0.08)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{
                width: 40,
                height: 40,
                borderRadius: 12,
                backgroundColor: 'rgba(118, 216, 0, 0.15)',
                border: '1px solid rgba(118, 216, 0, 0.35)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#76D800',
                flexShrink: 0
              }}>
                <Calendar size={20} />
              </div>
              <div>
                <div style={{ fontSize: '0.64rem', fontWeight: 800, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  Data do Agendamento
                </div>
                <div style={{ fontSize: '1.05rem', fontWeight: 900, color: '#FFFFFF', letterSpacing: '-0.02em', marginTop: 1 }}>
                  {ride.date.split('-').reverse().join('/')}
                </div>
              </div>
            </div>

            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '0.64rem', fontWeight: 800, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Horário Previsto
              </div>
              <div style={{ fontSize: '1.05rem', fontWeight: 900, color: '#76D800', letterSpacing: '-0.02em', display: 'flex', alignItems: 'center', gap: 5, justifyContent: 'flex-end', marginTop: 1 }}>
                <Clock size={15} color="#76D800" />
                <span>{ride.time}</span>
              </div>
            </div>
          </div>
          {/* Banner de Ação Primária do Motorista (Ultra Compacto) */}
          {ride.status === 'aguardando_confirmacao' && (
            <div style={{
              backgroundColor: '#FFFBEB',
              border: '1px solid #FDE68A',
              borderRadius: 12,
              padding: '9px 12px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 10
            }}>
              <div>
                <div style={{ fontSize: '0.8rem', fontWeight: 800, color: '#B45309' }}>
                  Nova Solicitação
                </div>
                <div style={{ fontSize: '0.68rem', color: '#92400E' }}>
                  Confirme para reservar na agenda.
                </div>
              </div>
              <button
                type="button"
                onClick={() => onUpdateStatus(ride.id, 'confirmada')}
                className="btn-primary"
                style={{ padding: '6px 12px', fontSize: '0.78rem', whiteSpace: 'nowrap', borderRadius: 10 }}
              >
                Confirmar
              </button>
            </div>
          )}

          {ride.status === 'confirmada' && (
            <div style={{
              backgroundColor: '#EFF6FF',
              border: '1px solid #BFDBFE',
              borderRadius: 12,
              padding: '9px 12px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 10
            }}>
              <div>
                <div style={{ fontSize: '0.8rem', fontWeight: 800, color: '#1E40AF' }}>
                  Corrida Confirmada
                </div>
                <div style={{ fontSize: '0.68rem', color: '#1E3A8A' }}>
                  Inicie para abrir o GPS em tempo real.
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  const ok = onUpdateStatus(ride.id, 'a_caminho');
                  if (ok !== false && onOpenGps) onOpenGps({ ...ride, status: 'a_caminho' });
                }}
                className="btn-ios-primary"
                style={{
                  padding: '7px 14px',
                  borderRadius: 10,
                  fontSize: '0.78rem',
                  fontWeight: 800,
                  whiteSpace: 'nowrap',
                  margin: 0
                }}
              >
                Iniciar GPS
              </button>
            </div>
          )}

          {(ride.status === 'a_caminho' || ride.status === 'em_andamento') && (
            <div style={{
              backgroundColor: '#121A21',
              borderRadius: 12,
              padding: '9px 12px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 10,
              border: '1px solid #76D800'
            }}>
              <div>
                <div style={{ fontSize: '0.8rem', fontWeight: 800, color: '#76D800' }}>
                  GPS em Tempo Real Ativo
                </div>
                <div style={{ fontSize: '0.68rem', color: '#94A3B8' }}>
                  Velocímetro e navegação ao vivo.
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (onOpenGps) onOpenGps(ride);
                }}
                style={{
                  padding: '7px 13px',
                  borderRadius: 10,
                  backgroundColor: '#76D800',
                  color: '#121A21',
                  fontWeight: 800,
                  fontSize: '0.78rem',
                  border: 'none',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  boxShadow: '0 2px 8px rgba(118, 216, 0, 0.35)'
                }}
              >
                Abrir GPS
              </button>
            </div>
          )}

          {ride.status === 'em_andamento' && (
            <div style={{
              backgroundColor: '#F0FDF4',
              border: '1px solid #BBF7D0',
              borderRadius: 12,
              padding: '9px 12px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 10
            }}>
              <div>
                <div style={{ fontSize: '0.8rem', fontWeight: 800, color: '#15803D' }}>
                  Chegou ao Destino?
                </div>
                <div style={{ fontSize: '0.68rem', color: '#166534' }}>
                  Finalize e receba o pagamento.
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (onOpenCheckout) {
                    onOpenCheckout(ride);
                  } else {
                    onUpdateStatus(ride.id, 'finalizada');
                  }
                }}
                className="btn-primary"
                style={{ padding: '6px 12px', fontSize: '0.78rem', whiteSpace: 'nowrap', borderRadius: 10 }}
              >
                Concluir
              </button>
            </div>
          )}

          {/* Card: Passageiro e Contato Rápido (Compacto) */}
          <div style={{
            background: '#F8FAFC',
            borderRadius: 14,
            border: '1px solid #E2E8F0',
            padding: '10px 12px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{
                  width: 36,
                  height: 36,
                  borderRadius: '50%',
                  backgroundColor: '#121A21',
                  color: '#76D800',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 800,
                  fontSize: '0.95rem',
                  flexShrink: 0
                }}>
                  {ride.clientName ? ride.clientName.charAt(0).toUpperCase() : 'C'}
                </div>
                <div>
                  <div style={{ fontSize: '0.64rem', color: '#64748B', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    Passageiro
                  </div>
                  <div style={{ fontSize: '0.92rem', fontWeight: 800, color: '#121A21', lineHeight: 1.2 }}>
                    {ride.clientName}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#64748B', fontWeight: 600 }}>
                    {formatPhone(ride.clientPhone)}
                  </div>
                </div>
              </div>

              {/* Botões rápidos de WhatsApp Oficial e Ligação */}
              <div style={{ display: 'flex', gap: 6 }}>
                <a
                  href={whatsappUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="WhatsApp"
                  style={{
                    backgroundColor: '#FFFFFF',
                    border: '1.5px solid #25D366',
                    width: 34,
                    height: 34,
                    borderRadius: 10,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    textDecoration: 'none',
                    boxShadow: '0 2px 6px rgba(37, 211, 102, 0.2)'
                  }}
                >
                  <WhatsAppIcon size={20} />
                </a>

                <a
                  href={`tel:${cleanPhone}`}
                  title="Ligar"
                  style={{
                    backgroundColor: '#121A21',
                    color: '#ffffff',
                    width: 34,
                    height: 34,
                    borderRadius: 10,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    textDecoration: 'none',
                    boxShadow: '0 2px 6px rgba(0,0,0,0.1)'
                  }}
                >
                  <Phone size={15} />
                </a>
              </div>
            </div>

            {/* Chips de Passageiros e Bagagem */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8 }}>
              <span style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                backgroundColor: '#FFFFFF',
                border: '1px solid #CBD5E1',
                padding: '2px 7px',
                borderRadius: 6,
                fontSize: '0.68rem',
                fontWeight: 700,
                color: '#334155'
              }}>
                <User size={11} color="#64748B" />
                <span>{ride.passengers} {ride.passengers > 1 ? 'Passageiros' : 'Passageiro'}</span>
              </span>

              <span style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                backgroundColor: '#FFFFFF',
                border: '1px solid #CBD5E1',
                padding: '2px 7px',
                borderRadius: 6,
                fontSize: '0.68rem',
                fontWeight: 700,
                color: ride.hasLuggage ? '#15803D' : '#64748B'
              }}>
                <Luggage size={11} />
                <span>{ride.hasLuggage ? 'Com Malas' : 'Sem Malas'}</span>
              </span>

              {ride.category === 'aeroporto' && (
                <span style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  backgroundColor: '#FEF3C7',
                  border: '1px solid #FDE68A',
                  padding: '2px 7px',
                  borderRadius: 6,
                  fontSize: '0.68rem',
                  fontWeight: 800,
                  color: '#92400E'
                }}>
                  ✈️ Traslado Aeroporto
                </span>
              )}
            </div>

            {ride.notes && (
              <div style={{
                marginTop: 6,
                background: '#ffffff',
                padding: '6px 10px',
                borderRadius: 8,
                border: '1px solid #E2E8F0',
                fontSize: '0.72rem',
                color: '#475569'
              }}>
                <strong>Obs:</strong> {ride.notes}
              </div>
            )}
          </div>

          {/* Card: Trajeto e Rota (Compacto) */}
          <div style={{
            background: '#ffffff',
            borderRadius: 14,
            border: '1px solid #E2E8F0',
            padding: '10px 12px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <div style={{ fontSize: '0.64rem', color: '#64748B', fontWeight: 700, textTransform: 'uppercase' }}>
                Trajeto da Corrida
              </div>
              <div style={{ fontSize: '0.72rem', fontWeight: 800, color: '#4D9400' }}>
                {ride.distanceKm.toFixed(1)} km • ~{ride.durationMin} min
              </div>
            </div>

            {/* Stepper Vertical de Rota Compacto */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {/* Embarque */}
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                <div style={{
                  width: 14,
                  height: 14,
                  borderRadius: '50%',
                  backgroundColor: 'rgba(118, 216, 0, 0.2)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  marginTop: 2
                }}>
                  <div style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: '#76D800' }} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '0.62rem', color: '#64748B', fontWeight: 600 }}>Embarque</div>
                  <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#121A21', lineHeight: 1.25 }}>
                    {ride.origin.address}
                  </div>
                  {ride.origin.reference && (
                    <div style={{ fontSize: '0.65rem', color: '#64748B' }}>Ref: {ride.origin.reference}</div>
                  )}
                </div>
              </div>

              {/* Destino */}
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                <div style={{
                  width: 14,
                  height: 14,
                  borderRadius: '50%',
                  backgroundColor: 'rgba(18, 26, 33, 0.1)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  marginTop: 2
                }}>
                  <MapPin size={9} color="#121A21" />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '0.62rem', color: '#64748B', fontWeight: 600 }}>Destino</div>
                  <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#121A21', lineHeight: 1.25 }}>
                    {ride.destination.address}
                  </div>
                </div>
              </div>
            </div>

            {/* Botão de Rota no Google Maps */}
            <a
              href={getGoogleMapsRouteUrl(ride.origin, ride.destination)}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-secondary"
              style={{
                width: '100%',
                padding: '7px 10px',
                fontSize: '0.78rem',
                textDecoration: 'none',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                marginTop: 8,
                borderRadius: 10
              }}
            >
              <Navigation size={13} color="#76D800" />
              <span>Navegar no Google Maps / Waze</span>
            </a>
          </div>

          {/* Card Integrado: Data, Horário & Financeiro (Estilo Referência Dark Onyx) */}
          {(() => {
            const isPaid = ride.paymentStatus === 'pago';
            const stripeColor = 
              ride.status === 'aguardando_confirmacao' ? '#F59E0B' :
              ride.status === 'confirmada' || ride.status === 'a_caminho' || ride.status === 'em_andamento' ? '#3B82F6' :
              ride.status === 'finalizada' ? '#10B981' :
              '#EF4444';

            const [h, m] = (ride.time || '12:00').split(':').map(Number);
            const totalM = h * 60 + (m || 0) + (ride.durationMin || 30);
            const endH = Math.floor(totalM / 60) % 24;
            const endM = totalM % 60;
            const endTimeStr = `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`;

            return (
              <div style={{
                position: 'relative',
                background: '#161A20',
                borderRadius: 14,
                padding: '12px 14px 12px 18px',
                color: '#ffffff',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                boxShadow: '0 4px 14px rgba(0, 0, 0, 0.28)',
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
                overflow: 'hidden'
              }}>
                {/* Faixa Lateral Colorida (Azul=Confirmada, Laranja=Aguardando, Verde=Finalizada, Vermelho=Cancelada) */}
                <div style={{
                  position: 'absolute',
                  left: 0,
                  top: 0,
                  bottom: 0,
                  width: 5,
                  backgroundColor: stripeColor,
                  borderRadius: '4px 0 0 4px'
                }} />

                {/* Linha Topo: Horário & Duração + Forma de Pagamento */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                    <span style={{ fontSize: '0.9rem', fontWeight: 800, color: '#FFFFFF', letterSpacing: '-0.01em' }}>
                      {ride.time} - {endTimeStr}
                    </span>
                    <span style={{
                      backgroundColor: '#262D38',
                      color: '#94A3B8',
                      fontSize: '0.67rem',
                      fontWeight: 700,
                      padding: '1px 6px',
                      borderRadius: 6,
                      border: '1px solid rgba(255, 255, 255, 0.06)'
                    }}>
                      {ride.durationMin || 30}min
                    </span>
                  </div>

                  {/* Forma de Pagamento em Destaque */}
                  <div style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    padding: '2px 8px',
                    borderRadius: 7,
                    backgroundColor: ride.paymentMethod === 'pix' ? 'rgba(0, 180, 216, 0.15)' : ride.paymentMethod === 'dinheiro' ? 'rgba(245, 158, 11, 0.15)' : 'rgba(59, 130, 246, 0.15)',
                    border: `1px solid ${ride.paymentMethod === 'pix' ? 'rgba(0, 180, 216, 0.35)' : ride.paymentMethod === 'dinheiro' ? 'rgba(245, 158, 11, 0.35)' : 'rgba(59, 130, 246, 0.35)'}`
                  }}>
                    {ride.paymentMethod === 'pix' ? (
                      <img width="14" height="14" src="https://img.icons8.com/fluency/48/pix.png" alt="pix" />
                    ) : ride.paymentMethod === 'dinheiro' ? (
                      <img width="14" height="14" src="https://img.icons8.com/fluency/48/money.png" alt="dinheiro" />
                    ) : (
                      <img width="14" height="14" src="https://img.icons8.com/color/48/bank-card-back-side.png" alt="cartão" />
                    )}
                    <span style={{
                      fontSize: '0.68rem',
                      fontWeight: 800,
                      color: ride.paymentMethod === 'pix' ? '#2DD4BF' : ride.paymentMethod === 'dinheiro' ? '#FCD34D' : '#93C5FD',
                      textTransform: 'uppercase'
                    }}>
                      {ride.paymentMethod === 'pix' ? 'PIX Instantâneo' : ride.paymentMethod === 'dinheiro' ? 'Dinheiro em Espécie' : 'Cartão'}
                    </span>
                  </div>
                </div>

                {/* Linha Meio: Data em Destaque e Passageiro */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                    <span style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 5,
                      fontSize: '0.82rem',
                      fontWeight: 800,
                      color: '#76D800',
                      backgroundColor: 'rgba(118, 216, 0, 0.12)',
                      padding: '2px 8px',
                      borderRadius: 6,
                      border: '1px solid rgba(118, 216, 0, 0.25)'
                    }}>
                      <Calendar size={13} color="#76D800" />
                      <span>{ride.date.split('-').reverse().join('/')}</span>
                    </span>
                    <span style={{ color: '#94A3B8', fontSize: '0.76rem' }}>•</span>
                    <span style={{ color: '#FFFFFF', fontWeight: 700, fontSize: '0.86rem' }}>{ride.clientName}</span>
                  </div>

                  <span style={{
                    fontSize: '0.64rem',
                    fontWeight: 800,
                    padding: '2px 7px',
                    borderRadius: 7,
                    backgroundColor: isPaid ? 'rgba(16, 185, 129, 0.2)' : 'rgba(245, 158, 11, 0.2)',
                    color: isPaid ? '#4ADE80' : '#FCD34D',
                    border: `1px solid ${isPaid ? 'rgba(16, 185, 129, 0.35)' : 'rgba(245, 158, 11, 0.35)'}`
                  }}>
                    {isPaid ? '✓ Pago' : '⏳ A Receber'}
                  </span>
                </div>

                {/* Linha Valor: R$ XX,XX (Falta R$ XX,XX) + Ações */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  paddingTop: 6,
                  borderTop: '1px solid rgba(255, 255, 255, 0.07)',
                  marginTop: 2,
                  flexWrap: 'wrap',
                  gap: 8
                }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, flexWrap: 'wrap' }}>
                    <span style={{
                      fontSize: '1.25rem',
                      fontWeight: 900,
                      color: isPaid ? '#4ADE80' : '#F87171'
                    }}>
                      R$ {ride.totalPrice.toFixed(2)}
                    </span>

                    {!isPaid ? (
                      <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#FB923C' }}>
                        (Falta R$ {ride.totalPrice.toFixed(2)})
                      </span>
                    ) : (
                      <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#34D399' }}>
                        (✓ Pago integralmente)
                      </span>
                    )}
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {onOpenCheckout && !isPaid && (
                      <button
                        type="button"
                        onClick={() => onOpenCheckout(ride)}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                          padding: '5px 10px',
                          borderRadius: 8,
                          backgroundColor: '#10B981',
                          color: '#FFFFFF',
                          border: 'none',
                          fontSize: '0.72rem',
                          fontWeight: 800,
                          cursor: 'pointer'
                        }}
                      >
                        <DollarSign size={13} />
                        <span>Checkout</span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => onUpdatePaymentStatus(ride.id, isPaid ? 'pendente' : 'pago')}
                      style={{
                        background: 'rgba(255, 255, 255, 0.1)',
                        border: '1px solid rgba(255, 255, 255, 0.2)',
                        color: '#ffffff',
                        borderRadius: 8,
                        padding: '5px 9px',
                        fontSize: '0.7rem',
                        fontWeight: 700,
                        cursor: 'pointer'
                      }}
                    >
                      {isPaid ? 'Marcar Pendente' : '✓ Marcar Pago'}
                    </button>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Botão Exclusivo Admin: Replay do Trajeto e Geração de Laudo / Prova vinculado ao ID #UP - 001 */}
          <button
            type="button"
            onClick={() => setIsRoutePlaybackOpen(true)}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              padding: '11px 16px',
              borderRadius: 12,
              background: 'linear-gradient(135deg, #0F172A 0%, #1E293B 100%)',
              color: '#FFFFFF',
              border: '1.5px solid #38BDF8',
              fontSize: '0.84rem',
              fontWeight: 800,
              cursor: 'pointer',
              boxShadow: '0 4px 14px rgba(56, 189, 248, 0.25)',
              transition: 'all 0.15s ease'
            }}
          >
            <Play size={16} color="#38BDF8" fill="#38BDF8" />
            <span>🎥 Auditoria GPS & Laudo de Prova ({rideCode})</span>
          </button>

          {/* Botão de Destaque: Gerar Comprovante do Pagamento / Recibo Oficial */}
          <button
            type="button"
            onClick={() => setIsReceiptModalOpen(true)}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              padding: '11px 16px',
              borderRadius: 12,
              backgroundColor: '#121A21',
              color: '#76D800',
              border: '1.5px solid #76D800',
              fontSize: '0.85rem',
              fontWeight: 800,
              cursor: 'pointer',
              boxShadow: '0 3px 12px rgba(118, 216, 0, 0.25)',
              transition: 'all 0.15s ease'
            }}
          >
            <FileText size={17} color="#76D800" />
            <span>🧾 Gerar Comprovante do Pagamento</span>
          </button>

          {/* Ações de Gestão de Status Compactas */}
          <div style={{ borderTop: '1px solid #F1F5F9', paddingTop: 8 }}>
            <div style={{ fontSize: '0.64rem', color: '#64748B', fontWeight: 700, textTransform: 'uppercase', marginBottom: 6 }}>
              Alterar Status
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
              <button
                type="button"
                onClick={() => onUpdateStatus(ride.id, 'confirmada')}
                style={{
                  padding: '7px 4px',
                  borderRadius: 8,
                  border: ride.status === 'confirmada' ? '2px solid #76D800' : '1px solid #E2E8F0',
                  backgroundColor: ride.status === 'confirmada' ? 'rgba(118, 216, 0, 0.1)' : '#ffffff',
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  color: '#121A21',
                  cursor: 'pointer'
                }}
              >
                Confirmar
              </button>

              <button
                type="button"
                onClick={() => {
                  if (onOpenCheckout) {
                    onOpenCheckout(ride);
                  } else {
                    onUpdateStatus(ride.id, 'finalizada');
                  }
                }}
                style={{
                  padding: '7px 4px',
                  borderRadius: 8,
                  border: ride.status === 'finalizada' ? '2px solid #10B981' : '1px solid #E2E8F0',
                  backgroundColor: ride.status === 'finalizada' ? '#DCFCE7' : '#ffffff',
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  color: '#15803D',
                  cursor: 'pointer'
                }}
              >
                Finalizar
              </button>

              <button
                type="button"
                onClick={() => onUpdateStatus(ride.id, 'cancelada')}
                style={{
                  padding: '7px 4px',
                  borderRadius: 8,
                  border: ride.status === 'cancelada' ? '2px solid #EF4444' : '1px solid #E2E8F0',
                  backgroundColor: ride.status === 'cancelada' ? '#FEE2E2' : '#ffffff',
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  color: '#EF4444',
                  cursor: 'pointer'
                }}
              >
                Cancelar
              </button>
            </div>
          </div>

          {/* Ações Avançadas: Editar (Somente Transações Manuais) e Excluir Corrida */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, paddingTop: 4 }}>
            {onEditRide && ride.isManualBooking ? (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onEditRide(ride);
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  padding: '9px 12px',
                  borderRadius: 10,
                  backgroundColor: '#F1F5F9',
                  border: '1px solid #CBD5E1',
                  color: '#121A21',
                  fontSize: '0.78rem',
                  fontWeight: 800,
                  cursor: 'pointer'
                }}
              >
                <Edit2 size={14} />
                <span>Editar Corrida</span>
              </button>
            ) : (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 5,
                  padding: '9px 12px',
                  borderRadius: 10,
                  backgroundColor: '#F8FAFC',
                  border: '1px solid #E2E8F0',
                  color: '#64748B',
                  fontSize: '0.74rem',
                  fontWeight: 700
                }}
                title="Agendamento feito diretamente pelo cliente via web (Edição restrita a transações manuais)"
              >
                <Lock size={13} color="#94A3B8" />
                <span>Edição Restrita (Cliente)</span>
              </div>
            )}

            <button
              type="button"
              onClick={() => {
                if (window.confirm(`Deseja realmente excluir a corrida ${ride.id} do sistema?`)) {
                  onDeleteRide(ride.id);
                  onClose();
                }
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                padding: '9px 12px',
                borderRadius: 10,
                backgroundColor: '#FEE2E2',
                border: '1px solid #FECACA',
                color: '#DC2626',
                fontSize: '0.78rem',
                fontWeight: 800,
                cursor: 'pointer'
              }}
            >
              <Trash2 size={14} />
              <span>Excluir Corrida</span>
            </button>
          </div>
        </div>
      </div>

      {/* Modal de Comprovante de Pagamento / Recibo Oficial */}
      {ride && (
        <RideReceiptModal
          isOpen={isReceiptModalOpen}
          onClose={() => setIsReceiptModalOpen(false)}
          ride={ride}
          config={config}
        />
      )}

      {/* Modal de Playback e Auditoria em Vídeo/GPS da Rota */}
      {ride && isRoutePlaybackOpen && (
        <RideRoutePlaybackModal
          ride={ride}
          isOpen={isRoutePlaybackOpen}
          onClose={() => setIsRoutePlaybackOpen(false)}
          config={config}
        />
      )}
    </div>,
    document.body
  );
};
