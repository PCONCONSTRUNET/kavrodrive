import React, { useState, useEffect } from 'react';
import { X, User, Star, Package } from 'lucide-react';
import { Ride, SystemConfig } from '../types';
import { getCategoryById, resolveCategoryType } from '../utils/categoryEngine';
import { calculateHaversineDistance } from '../utils/geo';
import { playNewRideSound, stopNewRideSound } from '../utils/soundAndVoice';

interface DriverIncomingRideModalProps {
  ride: Ride | null;
  config: SystemConfig;
  driverLocation?: { lat: number; lng: number } | null;
  onAccept: (rideId: string) => void;
  onDecline: (rideId: string) => void;
}

export const DriverIncomingRideModal: React.FC<DriverIncomingRideModalProps> = ({
  ride,
  config,
  driverLocation,
  onAccept,
  onDecline,
}) => {
  const [timeLeft, setTimeLeft] = useState(25);

  useEffect(() => {
    if (!ride) return;
    setTimeLeft(25);
    playNewRideSound({ repeatCount: 3 });
    const timer = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          stopNewRideSound();
          onDecline(ride.id);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => {
      clearInterval(timer);
      stopNewRideSound();
    };
  }, [ride?.id]);

  if (!ride) return null;

  const category = getCategoryById(ride.category, config);
  const isDelivery =
    ride.serviceType === 'entregas' ||
    Boolean(ride.deliveryDetails) ||
    resolveCategoryType(category) === 'entregas';
  const del = ride.deliveryDetails;
  const dropoffText = del?.dropoffMode === 'portaria'
    ? 'Deixar na portaria'
    : del?.dropoffMode === 'recepcao'
      ? 'Recepção / Loja'
      : 'Entregar em mãos';
  const fallbackCommAmt = Math.min(
    ride.totalPrice,
    (ride.totalPrice * (ride.commissionPercent ?? 20)) / 100 + (ride.totalPrice > 0 ? Number(ride.commissionFixed ?? 0) : 0)
  );
  const driverNet = ride.driverNetAmount ?? Math.max(0, ride.totalPrice - fallbackCommAmt);
  const kmEst = (driverNet / Math.max(1, ride.distanceKm || 3)).toFixed(2).replace('.', ',');
  const progressPercent = (timeLeft / 25) * 100;

  const clientFirstName = (ride.clientName || 'Passageiro').split(' ')[0];
  const clientRatingLabel =
    typeof ride.clientRating === 'number' && ride.clientRating > 0
      ? ride.clientRating.toFixed(2).replace('.', ',')
      : 'Novo';

  const hasPickupCoords = Boolean(
    driverLocation &&
    typeof driverLocation.lat === 'number' &&
    typeof driverLocation.lng === 'number' &&
    ride.origin &&
    typeof ride.origin.lat === 'number' &&
    typeof ride.origin.lng === 'number'
  );
  const pickupDistKm = hasPickupCoords
    ? calculateHaversineDistance(driverLocation!.lat, driverLocation!.lng, ride.origin.lat, ride.origin.lng)
    : null;
  const pickupEtaMin = pickupDistKm !== null ? Math.max(1, Math.round(pickupDistKm * 2.5)) : null;

  return (
    <div style={{
      position: 'fixed',
      bottom: 0,
      left: '50%',
      transform: 'translateX(-50%)',
      width: '100%',
      maxWidth: 460,
      zIndex: 99990,
      padding: '0 12px calc(14px + env(safe-area-inset-bottom, 0px)) 12px',
      boxSizing: 'border-box',
      animation: 'slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1)'
    }}>
      <div style={{
        backgroundColor: '#FFFFFF',
        color: '#0F172A',
        borderRadius: 24,
        padding: '18px 20px 20px 20px',
        boxShadow: '0 10px 40px rgba(0,0,0,0.45)',
        position: 'relative',
        overflow: 'hidden'
      }}>
        {/* Barra de Tempo Regressivo estilo Uber */}
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: 4,
          backgroundColor: '#E2E8F0'
        }}>
          <div style={{
            height: '100%',
            width: `${progressPercent}%`,
            backgroundColor: '#2563EB',
            transition: 'width 1s linear'
          }} />
        </div>

        {/* Topo do Card: Badge da Categoria + Exclusivo + Botão Fechar ✕ */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 10
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              backgroundColor: isDelivery ? '#15803D' : '#0F172A',
              color: '#FFFFFF',
              padding: '5px 12px',
              borderRadius: 20,
              fontSize: '0.86rem',
              fontWeight: 800
            }}>
              {isDelivery ? <Package size={14} /> : <User size={14} />}
              <span>{category.name || (isDelivery ? 'Entregas' : 'Padrão')}</span>
            </div>

            <span style={{
              fontSize: '0.8rem',
              fontWeight: 800,
              color: isDelivery ? '#15803D' : '#2563EB'
            }}>
              {isDelivery ? 'Entrega • Produto' : 'Exclusivo'}
            </span>
          </div>

          <button
            type="button"
            onClick={() => {
              stopNewRideSound();
              onDecline(ride.id);
            }}
            style={{
              width: 32,
              height: 32,
              borderRadius: '50%',
              backgroundColor: '#F1F5F9',
              border: 'none',
              color: '#64748B',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer'
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Preço Gigante e Estimativa por KM estilo Uber */}
        <div style={{ marginBottom: 12 }}>
          <div style={{
            fontSize: '2.5rem',
            fontWeight: 900,
            color: '#0F172A',
            letterSpacing: '-0.04em',
            lineHeight: 1
          }}>
            R$ {driverNet.toFixed(2).replace('.', ',')}
          </div>
          <div style={{
            fontSize: '0.86rem',
            color: '#64748B',
            fontWeight: 700,
            marginTop: 4
          }}>
            R$ {kmEst}/km est. (Líquido) • Bruto: R$ {ride.totalPrice.toFixed(2).replace('.', ',')}
          </div>
        </div>

        {/* Avaliação do Passageiro */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          fontSize: '0.84rem',
          fontWeight: 700,
          color: '#334155',
          marginBottom: 16
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <Star size={15} fill="#0F172A" color="#0F172A" />
            <span>{clientRatingLabel} ({clientFirstName})</span>
          </div>
        </div>

        {/* Resumo do Produto / Destinatário quando for Entrega */}
        {isDelivery && del && (
          <div style={{
            backgroundColor: '#F0FDF4',
            border: '1px solid #BBF7D0',
            borderRadius: 14,
            padding: '10px 12px',
            marginBottom: 14,
            display: 'flex',
            flexDirection: 'column',
            gap: 4
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <span style={{ fontSize: '0.78rem', fontWeight: 800, color: '#14532D' }}>
                📦 {del.itemDescription}
              </span>
              <span style={{ fontSize: '0.68rem', fontWeight: 800, color: '#166534', backgroundColor: '#DCFCE7', padding: '2px 7px', borderRadius: 999 }}>
                Porte {del.packageSize || 'pequeno'}
              </span>
            </div>
            <div style={{ fontSize: '0.74rem', color: '#166534', fontWeight: 600 }}>
              {del.role === 'sender' ? 'Entregar para:' : 'Retirar com:'} <strong>{del.recipientName}</strong> • {dropoffText}
            </div>
            {del.instructions && (
              <div style={{ fontSize: '0.72rem', color: '#15803D', fontWeight: 600 }}>
                Obs: {del.instructions}
              </div>
            )}
          </div>
        )}

        {/* Trajeto em Linha Conectada estilo Uber */}
        <div style={{
          position: 'relative',
          paddingLeft: 24,
          marginBottom: 18
        }}>
          {/* Linha vertical conectora */}
          <div style={{
            position: 'absolute',
            left: 5,
            top: 10,
            bottom: 12,
            width: 2,
            backgroundColor: '#0F172A'
          }} />

          {/* Ponto 1: Origem / Embarque / Coleta */}
          <div style={{ position: 'relative', marginBottom: 14 }}>
            <div style={{
              position: 'absolute',
              left: -24,
              top: 3,
              width: 12,
              height: 12,
              borderRadius: '50%',
              backgroundColor: isDelivery ? '#15803D' : '#2563EB',
              border: '2px solid #FFFFFF',
              boxShadow: `0 0 0 2px ${isDelivery ? '#15803D' : '#2563EB'}`
            }} />
            <div style={{ fontSize: '0.78rem', color: '#64748B', fontWeight: 700 }}>
              {pickupDistKm !== null && pickupEtaMin !== null
                ? `~${pickupEtaMin} min (${pickupDistKm.toFixed(1)} km até ${isDelivery ? 'coleta' : 'embarque'})`
                : (isDelivery ? 'Ponto de coleta' : 'Ponto de embarque')}
            </div>
            <div style={{ fontSize: '0.9rem', fontWeight: 800, color: '#0F172A', lineHeight: 1.3 }}>
              {ride.origin.address}
            </div>
          </div>

          {/* Ponto 2: Destino */}
          <div style={{ position: 'relative' }}>
            <div style={{
              position: 'absolute',
              left: -24,
              top: 4,
              width: 12,
              height: 12,
              backgroundColor: '#0F172A'
            }} />
            <div style={{ fontSize: '0.78rem', color: '#64748B', fontWeight: 700 }}>
              ~{ride.durationMin || 12} min ({ride.distanceKm.toFixed(1)} km {isDelivery ? 'entrega' : 'viagem'})
            </div>
            <div style={{ fontSize: '0.9rem', fontWeight: 800, color: '#0F172A', lineHeight: 1.3 }}>
              {ride.destination.address}
            </div>
          </div>
        </div>

        {/* Botão Aceitar Gigante Azul estilo Uber */}
        <button
          type="button"
          onClick={() => {
            stopNewRideSound();
            onAccept(ride.id);
          }}
          style={{
            width: '100%',
            height: 52,
            borderRadius: 14,
            backgroundColor: isDelivery ? '#15803D' : '#2563EB',
            color: '#FFFFFF',
            border: 'none',
            fontSize: '1.15rem',
            fontWeight: 900,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: isDelivery ? '0 4px 18px rgba(21, 128, 61, 0.42)' : '0 4px 18px rgba(37, 99, 235, 0.45)',
            letterSpacing: '-0.01em'
          }}
        >
          {isDelivery ? `Aceitar Entrega (${timeLeft}s)` : `Aceitar (${timeLeft}s)`}
        </button>
      </div>
    </div>
  );
};

