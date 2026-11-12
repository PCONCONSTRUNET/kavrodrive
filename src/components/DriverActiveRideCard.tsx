import React from 'react';
import { MessageSquare, Phone, Navigation, Sliders, List, Shield, Check, ArrowRight } from 'lucide-react';
import { Ride, SystemConfig } from '../types';
import { getCategoryById } from '../utils/categoryEngine';
import { getCleanWhatsappNumber } from '../utils/format';

interface DriverActiveRideCardProps {
  ride: Ride;
  config: SystemConfig;
  onOpenChat: () => void;
  onOpenGps: () => void;
  onStartTrip: () => void;
  onInitiateComplete: () => void;
}

export const DriverActiveRideCard: React.FC<DriverActiveRideCardProps> = ({
  ride,
  config,
  onOpenChat,
  onOpenGps,
  onStartTrip,
  onInitiateComplete,
}) => {
  const category = getCategoryById(ride.category, config);
  const cleanPhone = getCleanWhatsappNumber(ride.clientPhone || '');
  const isTripInProgress = ride.status === 'em_andamento';

  return (
    <div style={{
      position: 'fixed',
      bottom: 0,
      left: '50%',
      transform: 'translateX(-50%)',
      width: '100%',
      maxWidth: 480,
      zIndex: 99980,
      padding: '0 12px calc(12px + env(safe-area-inset-bottom, 0px)) 12px',
      boxSizing: 'border-box'
    }}>
      <div style={{
        backgroundColor: '#161F28',
        borderRadius: 22,
        border: '1px solid #283544',
        boxShadow: '0 10px 40px rgba(0,0,0,0.6)',
        color: '#FFFFFF',
        overflow: 'hidden'
      }}>
        {/* Topo: Instrução de Rota estilo Uber Navigation (Print 2) */}
        <div style={{
          backgroundColor: '#1E293B',
          padding: '12px 16px',
          borderBottom: '1px solid #2D3B4C',
          display: 'flex',
          alignItems: 'center',
          gap: 12
        }}>
          <div style={{
            width: 10,
            height: 10,
            borderRadius: 2,
            backgroundColor: isTripInProgress ? '#EF4444' : '#22C55E',
            flexShrink: 0
          }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: '0.94rem', fontWeight: 800, color: '#FFFFFF', lineHeight: 1.2 }}>
              {isTripInProgress ? `Destino: ${ride.destination.address.split(',')[0] || ride.destination.address}` : `Embarque: ${ride.origin.address.split(',')[0] || ride.origin.address}`}
            </div>
            <div style={{ fontSize: '0.74rem', color: '#94A3B8', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {isTripInProgress ? ride.destination.address : ride.origin.address}
            </div>
          </div>
          <button
            type="button"
            onClick={onOpenGps}
            style={{
              padding: '6px 12px',
              borderRadius: 20,
              backgroundColor: '#FFFFFF',
              color: '#0F172A',
              border: 'none',
              fontSize: '0.74rem',
              fontWeight: 800,
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              cursor: 'pointer',
              flexShrink: 0
            }}
          >
            <Navigation size={12} fill="#0F172A" />
            <span>Navegar</span>
          </button>
        </div>

        {/* Linha de Métricas: Tempo, Distância e Filtros estilo Uber (Print 2) */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 16px',
          borderBottom: '1px solid #232E3B',
          fontSize: '0.88rem',
          fontWeight: 800
        }}>
          <button
            type="button"
            onClick={onOpenGps}
            style={{ background: 'none', border: 'none', color: '#94A3B8', cursor: 'pointer', padding: 4 }}
          >
            <Sliders size={18} />
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#FFFFFF' }}>
            <span>~{isTripInProgress ? (ride.durationMin || 10) : 4} min</span>
            <div style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              backgroundColor: '#22C55E'
            }} />
            <span>{isTripInProgress ? `${ride.distanceKm.toFixed(1)} km` : '1,8 km'}</span>
          </div>

          <div style={{ fontSize: '0.74rem', color: '#22C55E', fontWeight: 800 }}>
            R$ {(ride.driverNetAmount || ride.totalPrice * 0.8).toFixed(2).replace('.', ',')}
          </div>
        </div>

        {/* Linha do Passageiro com Botão de Chat Destacado e Botão de Telefone (Print 2) */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 18px',
          gap: 12
        }}>
          {/* Botão de Chat em Destaque (com o círculo escuro e ícone do Print 2) */}
          <button
            type="button"
            onClick={onOpenChat}
            title="Abrir Chat com o Passageiro"
            style={{
              width: 48,
              height: 48,
              borderRadius: '50%',
              backgroundColor: '#232E3B',
              border: '2px solid #3B4D63',
              color: '#FFFFFF',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              position: 'relative',
              boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
              transition: 'transform 0.15s ease'
            }}
          >
            <MessageSquare size={22} fill="#FFFFFF" color="#FFFFFF" />
            <span style={{
              position: 'absolute',
              top: 2,
              right: 2,
              width: 10,
              height: 10,
              borderRadius: '50%',
              backgroundColor: '#22C55E',
              border: '2px solid #232E3B'
            }} />
          </button>

          {/* Nome do Passageiro Centralizado estilo Print 2 */}
          <div style={{ textAlign: 'center', flex: 1 }}>
            <div style={{ fontSize: '1.2rem', fontWeight: 900, color: '#FFFFFF', letterSpacing: '-0.02em' }}>
              {ride.clientName || 'Passageiro'}
            </div>
            <div style={{ fontSize: '0.74rem', color: '#94A3B8', marginTop: 1 }}>
              {ride.paymentMethod === 'dinheiro' ? '💵 Dinheiro na Chegada' : ride.paymentMethod === 'pix' ? '⚡ PIX Pago' : '💳 Cartão App'}
            </div>
          </div>

          {/* Botão de Perfil / Ligar para Passageiro estilo Print 2 */}
          <a
            href={cleanPhone ? `https://wa.me/${cleanPhone}` : '#'}
            target="_blank"
            rel="noopener noreferrer"
            title="Ligar ou Chamar no WhatsApp"
            style={{
              width: 48,
              height: 48,
              borderRadius: '50%',
              backgroundColor: '#232E3B',
              border: '2px solid #3B4D63',
              color: '#FFFFFF',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              textDecoration: 'none',
              boxShadow: '0 4px 12px rgba(0,0,0,0.3)'
            }}
          >
            <Phone size={20} fill="#FFFFFF" color="#FFFFFF" />
          </a>
        </div>

        {/* Botão de Ação Inferior Grande (Verde / Azul) estilo Print 2 */}
        <div style={{ padding: '0 14px 14px 14px' }}>
          {!isTripInProgress ? (
            <button
              type="button"
              onClick={onStartTrip}
              style={{
                width: '100%',
                height: 52,
                borderRadius: 14,
                backgroundColor: '#00B14F', // Verde brilhante oficial estilo Uber Driver
                color: '#FFFFFF',
                border: 'none',
                fontSize: '1.05rem',
                fontWeight: 900,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 10,
                cursor: 'pointer',
                boxShadow: '0 4px 18px rgba(0, 177, 79, 0.45)',
                letterSpacing: '0.04em'
              }}
            >
              <ArrowRight size={22} strokeWidth={3} />
              <span>INICIAR {category.name?.toUpperCase() || 'KAVRO GO'}</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={onInitiateComplete}
              style={{
                width: '100%',
                height: 52,
                borderRadius: 14,
                backgroundColor: '#22C55E',
                color: '#121A21',
                border: 'none',
                fontSize: '1.05rem',
                fontWeight: 900,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                cursor: 'pointer',
                boxShadow: '0 4px 18px rgba(34, 197, 94, 0.45)',
                letterSpacing: '0.02em'
              }}
            >
              <Check size={24} strokeWidth={3} />
              <span>FINALIZAR CORRIDA (COBRAR)</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

