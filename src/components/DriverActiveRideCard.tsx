import React, { useEffect, useState } from 'react';
import {
  MessageSquare, Phone, Navigation, Sliders, List, Shield, Package,
  Check, ArrowRight, ArrowUp, CornerUpRight, CornerUpLeft, User, Compass, ExternalLink, Maximize2, X
} from 'lucide-react';
import { Ride, SystemConfig } from '../types';
import { getCategoryById, resolveCategoryType } from '../utils/categoryEngine';
import { getCleanWhatsappNumber } from '../utils/format';
import { getGoogleMapsRouteUrl } from '../utils/geo';
import { RouteStepSummary } from './DriverHomeMap';
import { PaymentMethodIcon, getPaymentMethodLabel } from './PaymentMethodIcon';

interface DriverActiveRideCardProps {
  ride: Ride;
  config: SystemConfig;
  routeInfo?: {
    distanceKm: number;
    durationMin: number;
    step: RouteStepSummary;
  } | null;
  onOpenChat: () => void;
  unreadChatCount?: number;
  onOpenGps: () => void;
  onOpenPreferences?: () => void;
  onOpenSos?: () => void;
  onRecenterMap?: () => void;
  onArrivePickup?: () => void;
  onStartTrip: (boardingPin?: string) => void;
  onInitiateComplete: () => void;
  startTripError?: string | null;
}

export const DriverActiveRideCard: React.FC<DriverActiveRideCardProps> = ({
  ride,
  config,
  routeInfo,
  onOpenChat,
  unreadChatCount = 0,
  onOpenGps,
  onOpenPreferences,
  onOpenSos,
  onRecenterMap,
  onArrivePickup,
  onStartTrip,
  onInitiateComplete,
  startTripError,
}) => {
  const [isDetailsExpanded, setIsDetailsExpanded] = useState(false);
  const [showPinPrompt, setShowPinPrompt] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [localPinError, setLocalPinError] = useState('');

  useEffect(() => {
    setIsDetailsExpanded(false);
    setShowPinPrompt(false);
  }, [ride.id, ride.status]);
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
  const cleanRecipientPhone = getCleanWhatsappNumber(del?.recipientPhone || '');
  const cleanPhone = getCleanWhatsappNumber(ride.clientPhone || '');
  const isTripInProgress = ride.status === 'em_andamento';
  const isAtPickup = ride.status === 'no_local';

  const targetAddr = isTripInProgress ? ride.destination.address : ride.origin.address;
  const targetShort = targetAddr.split(',')[0] || targetAddr;
  const targetSub = targetAddr.includes(',') ? targetAddr.split(',').slice(1).join(',').trim() : '';

  const etaMin = routeInfo?.durationMin || (isTripInProgress ? Math.max(2, ride.durationMin || 8) : 6);
  const distKm = routeInfo?.distanceKm || (isTripInProgress ? Math.max(0.3, ride.distanceKm || 2.1) : 1.8);

  const stepMeters = routeInfo?.step?.distanceMeters || 50;
  const currentStreet = routeInfo?.step?.streetName || targetShort;
  const nextStreet = routeInfo?.step?.nextStreetName || targetShort;
  const modifier = routeInfo?.step?.maneuverModifier || '';

  const renderTurnArrow = () => {
    if (modifier.includes('left')) return <CornerUpLeft size={24} color="#FFFFFF" strokeWidth={2.8} />;
    if (modifier.includes('right')) return <CornerUpRight size={24} color="#FFFFFF" strokeWidth={2.8} />;
    return <ArrowUp size={24} color="#FFFFFF" strokeWidth={3} />;
  };

  const clientFirstName = (ride.clientName || 'Passageiro').split(' ')[0];
  const fallbackCommAmt = Math.min(
    ride.totalPrice,
    (ride.totalPrice * (ride.commissionPercent ?? 20)) / 100 + (ride.totalPrice > 0 ? Number(ride.commissionFixed ?? 0) : 0)
  );
  const netEarnings = ride.driverNetAmount ?? Math.max(0, ride.totalPrice - fallbackCommAmt);

  return (
    <>
      {/* =====================================================================
          1. BANNER COMPACTO TURN-BY-TURN NO TOPO (ESTILO UBER DRIVER)
         ===================================================================== */}
      <div style={{
        position: 'fixed',
        top: 'calc(8px + env(safe-area-inset-top, 0px))',
        left: '50%',
        transform: 'translateX(-50%)',
        width: 'calc(100% - 20px)',
        maxWidth: 456,
        zIndex: 70,
        backgroundColor: '#141414',
        color: '#FFFFFF',
        borderRadius: 12,
        boxShadow: '0 6px 20px rgba(0,0,0,0.32)',
        overflow: 'hidden',
        border: '1px solid rgba(255,255,255,0.08)'
      }}>
        {/* Linha principal compacta da manobra */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '8px 12px'
        }}>
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            minWidth: 40,
            flexShrink: 0
          }}>
            {renderTurnArrow()}
            <span style={{ fontSize: '0.76rem', fontWeight: 800, color: '#FFFFFF', marginTop: 1 }}>
              {stepMeters < 1000 ? `${stepMeters} m` : `${(stepMeters / 1000).toFixed(1)} km`}
            </span>
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontSize: '0.95rem',
              fontWeight: 700,
              color: '#FFFFFF',
              lineHeight: 1.2,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis'
            }}>
              {currentStreet}
            </div>
            <div style={{
              fontSize: '0.82rem',
              fontWeight: 600,
              color: '#D1D5DB',
              lineHeight: 1.2,
              marginTop: 1,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis'
            }}>
              <span style={{ fontSize: '0.72rem', color: '#9CA3AF', fontWeight: 500, marginRight: 4 }}>para</span>
              {nextStreet}
            </div>
          </div>
        </div>

        {/* Faixa fina de destino (só expande subendereço ao abrir detalhes) */}
        <div style={{
          backgroundColor: '#1E1E1E',
          borderTop: '1px solid rgba(255,255,255,0.08)',
          padding: '5px 12px',
          display: 'flex',
          alignItems: 'center',
          gap: 8
        }}>
          <div style={{
            width: 7,
            height: 7,
            borderRadius: 1,
            backgroundColor: isTripInProgress ? '#EF4444' : '#16A34A',
            flexShrink: 0
          }} />
          <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
            <div style={{
              fontSize: '0.74rem',
              color: '#E5E7EB',
              fontWeight: 600,
              lineHeight: 1.25,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis'
            }}>
              {isTripInProgress ? `Destino: ${targetShort}` : `Embarque: ${targetShort}`}
            </div>
            {isDetailsExpanded && targetSub && (
              <div style={{
                fontSize: '0.7rem',
                color: '#9CA3AF',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                marginTop: 1
              }}>
                {targetSub}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* =====================================================================
          2. BOTTOM DOCK: CONTROLES RENTES EM BAIXO PARA NÃO ATRAPALHAR O GPS
         ===================================================================== */}
      <div style={{
        position: 'fixed',
        bottom: 0,
        left: '50%',
        transform: 'translateX(-50%)',
        width: '100%',
        maxWidth: 480,
        zIndex: 70,
        pointerEvents: 'none',
        display: 'flex',
        flexDirection: 'column'
      }}>
        {/* Controles Flutuantes em Linha Única rente ao painel inferior */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 12px 8px 12px',
          pointerEvents: 'none'
        }}>
          {/* Esquerda horizontal: Placa 30 LIMITE + Escudo Azul SOS */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, pointerEvents: 'auto' }}>
            <div style={{
              width: 38,
              backgroundColor: '#FFFFFF',
              borderRadius: 7,
              border: '1.5px solid #D1D5DB',
              boxShadow: '0 3px 10px rgba(0,0,0,0.18)',
              padding: '3px 2px',
              textAlign: 'center',
              color: '#111111'
            }}>
              <div style={{ fontSize: '0.92rem', fontWeight: 900, lineHeight: 1 }}>30</div>
              <div style={{ fontSize: '0.46rem', fontWeight: 800, letterSpacing: '0.03em', marginTop: 1 }}>LIMITE</div>
            </div>

            {onOpenSos && isTripInProgress && (
              <button
                type="button"
                onClick={onOpenSos}
                title="Central de Segurança SOS"
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: '50%',
                  backgroundColor: 'rgba(255, 255, 255, 0.80)',
                  backdropFilter: 'blur(16px) saturate(180%)',
                  WebkitBackdropFilter: 'blur(16px) saturate(180%)',
                  border: '1px solid rgba(255, 255, 255, 0.72)',
                  boxShadow: '0 3px 12px rgba(15, 23, 42, 0.16), inset 0 1px 0 rgba(255, 255, 255, 0.8)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer'
                }}
              >
                <Shield size={18} color="#276EF1" fill="#DBEAFE" strokeWidth={2.2} />
              </button>
            )}
          </div>

          {/* Direita horizontal: Centralizar + Pílula escura "Navegar" */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, pointerEvents: 'auto' }}>
            {onRecenterMap && (
              <button
                type="button"
                onClick={onRecenterMap}
                title="Centralizar mapa"
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: '50%',
                  backgroundColor: 'rgba(255, 255, 255, 0.80)',
                  backdropFilter: 'blur(16px) saturate(180%)',
                  WebkitBackdropFilter: 'blur(16px) saturate(180%)',
                  border: '1px solid rgba(255, 255, 255, 0.72)',
                  boxShadow: '0 3px 12px rgba(15, 23, 42, 0.16), inset 0 1px 0 rgba(255, 255, 255, 0.8)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#111111',
                  cursor: 'pointer'
                }}
              >
                <Compass size={18} />
              </button>
            )}

            <a
              href={getGoogleMapsRouteUrl(
                ride.driverLocation
                  ? { address: 'Posição Atual', lat: ride.driverLocation.lat, lng: ride.driverLocation.lng }
                  : ride.origin,
                isTripInProgress ? ride.destination : ride.origin
              )}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                height: 36,
                backgroundColor: '#1E1E1E',
                color: '#FFFFFF',
                padding: '0 12px',
                borderRadius: 999,
                fontSize: '0.78rem',
                fontWeight: 700,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                textDecoration: 'none',
                boxShadow: '0 4px 14px rgba(0,0,0,0.28)'
              }}
            >
              <Navigation size={13} fill="#FFFFFF" color="#FFFFFF" />
              <span>Navegar</span>
              <ExternalLink size={11} color="#9CA3AF" />
            </a>
          </div>
        </div>

        {/* =====================================================================
            3. DOCK INFERIOR ULTRA-COMPACTO ESTILO UBER (BRANCO GLASSMORPHISM)
           ===================================================================== */}
        <div style={{
          backgroundColor: 'rgba(255, 255, 255, 0.80)',
          backdropFilter: 'blur(20px) saturate(180%)',
          WebkitBackdropFilter: 'blur(20px) saturate(180%)',
          borderTop: '1px solid rgba(255, 255, 255, 0.75)',
          borderRadius: '18px 18px 0 0',
          boxShadow: '0 -8px 26px rgba(15, 23, 42, 0.15), inset 0 1px 0 rgba(255, 255, 255, 0.85)',
          padding: '7px 14px calc(10px + env(safe-area-inset-bottom, 0px)) 14px',
          color: '#111111',
          pointerEvents: 'auto'
        }}>
          {/* Handle cinza */}
          <div style={{
            width: 34,
            height: 3.5,
            borderRadius: 999,
            backgroundColor: '#D1D5DB',
            margin: '0 auto 6px auto'
          }} />

          {/* Barra Principal Compacta estilo Uber: [🎚️]  [ 8 min 👤 2,1 km / Encontro com Lucas ]  [≡] */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8
          }}>
            <button
              type="button"
              onClick={() => (onOpenPreferences ? onOpenPreferences() : setIsDetailsExpanded(v => !v))}
              title="Preferências"
              style={{
                width: 36,
                height: 36,
                borderRadius: '50%',
                backgroundColor: '#F3F4F6',
                border: 'none',
                color: '#111111',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                flexShrink: 0
              }}
            >
              <Sliders size={17} />
            </button>

            <div
              onClick={() => setIsDetailsExpanded(v => !v)}
              style={{ textAlign: 'center', flex: 1, cursor: 'pointer', minWidth: 0 }}
            >
              <div style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                fontSize: '1.04rem',
                fontWeight: 800,
                color: '#111111',
                letterSpacing: '-0.02em'
              }}>
                <span>{etaMin} min</span>
                <span style={{
                  width: 18,
                  height: 18,
                  borderRadius: '50%',
                  backgroundColor: isTripInProgress ? '#276EF1' : '#15803D',
                  color: '#FFFFFF',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  {isDelivery ? <Package size={11} color="#FFFFFF" /> : <User size={11} fill="#FFFFFF" color="#FFFFFF" />}
                </span>
                <span>{distKm.toFixed(1).replace('.', ',')} km</span>
              </div>
              <div style={{
                fontSize: '0.78rem',
                color: '#4B5563',
                fontWeight: 600,
                marginTop: 1,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis'
              }}>
                {isDelivery
                  ? isTripInProgress
                    ? `Entregando p/ ${del?.recipientName || clientFirstName}`
                    : isAtPickup
                      ? `Coletar entrega com ${clientFirstName}`
                      : `Coleta • ${clientFirstName}`
                  : isTripInProgress
                    ? `Viagem com ${clientFirstName}`
                    : isAtPickup
                      ? `Aguardando ${clientFirstName}`
                      : `Encontro com ${clientFirstName}`}
              </div>
            </div>

            <button
              type="button"
              onClick={() => setIsDetailsExpanded(v => !v)}
              title={isDetailsExpanded ? 'Ocultar opções' : 'Ver opções e mensagens'}
              style={{
                position: 'relative',
                width: 36,
                height: 36,
                borderRadius: '50%',
                backgroundColor: isDetailsExpanded ? '#111111' : '#F3F4F6',
                border: 'none',
                color: isDetailsExpanded ? '#FFFFFF' : '#111111',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                flexShrink: 0
              }}
            >
              <List size={18} />
              {!isDetailsExpanded && unreadChatCount > 0 && (
                <span style={{
                  position: 'absolute',
                  top: -2,
                  right: -2,
                  minWidth: 16,
                  height: 16,
                  padding: '0 4px',
                  borderRadius: 999,
                  backgroundColor: '#2563EB',
                  color: '#FFFFFF',
                  fontSize: '0.64rem',
                  fontWeight: 900,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  border: '1.5px solid #FFFFFF'
                }}>
                  {unreadChatCount}
                </span>
              )}
            </button>
          </div>

          {/* Drawer expansível sob demanda: Chat, Ligação, GPS Full, Ganho, Entrega */}
          {isDetailsExpanded && (
            <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid #F3F4F6' }}>
              {isDelivery && del && (
                <div style={{
                  marginBottom: 8,
                  padding: '8px 10px',
                  borderRadius: 10,
                  backgroundColor: '#F0FDF4',
                  border: '1px solid #BBF7D0',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 3
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <span style={{ fontSize: '0.76rem', fontWeight: 800, color: '#14532D' }}>
                      📦 {del.itemDescription} ({del.packageSize || 'pequeno'})
                    </span>
                    <span style={{ fontSize: '0.66rem', fontWeight: 800, color: '#15803D', backgroundColor: '#DCFCE7', padding: '2px 7px', borderRadius: 999 }}>
                      {dropoffText}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, fontSize: '0.73rem', color: '#166534', fontWeight: 600 }}>
                    <span>
                      {del.role === 'sender' ? 'Entregar para:' : 'Retirar com:'} <strong>{del.recipientName}</strong>
                    </span>
                    {cleanRecipientPhone && (
                      <a
                        href={`https://wa.me/${cleanRecipientPhone}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          color: '#15803D',
                          fontWeight: 800,
                          textDecoration: 'underline',
                          flexShrink: 0
                        }}
                      >
                        WhatsApp contato
                      </a>
                    )}
                  </div>
                  {del.instructions && (
                    <div style={{ fontSize: '0.7rem', color: '#15803D', fontWeight: 600 }}>
                      Instruções: {del.instructions}
                    </div>
                  )}
                </div>
              )}

              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 8,
                flexWrap: 'wrap'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                  <button
                    type="button"
                    onClick={onOpenChat}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 5,
                      backgroundColor: '#F3F4F6',
                      border: '1px solid #E5E7EB',
                      borderRadius: 999,
                      padding: '6px 11px',
                      color: '#111111',
                      fontSize: '0.75rem',
                      fontWeight: 700,
                      cursor: 'pointer'
                    }}
                  >
                    <MessageSquare size={14} />
                    <span>Mensagem</span>
                    {unreadChatCount > 0 && (
                      <span style={{
                        minWidth: 16,
                        height: 16,
                        padding: '0 4px',
                        borderRadius: 999,
                        backgroundColor: '#2563EB',
                        color: '#FFFFFF',
                        fontSize: '0.66rem',
                        fontWeight: 900,
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}>
                        {unreadChatCount}
                      </span>
                    )}
                  </button>

                  {cleanPhone && (
                    <a
                      href={`https://wa.me/${cleanPhone}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: '50%',
                        backgroundColor: '#F3F4F6',
                        border: '1px solid #E5E7EB',
                        color: '#111111',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        textDecoration: 'none'
                      }}
                      title={isDelivery ? 'Chamar remetente/solicitante' : 'Chamar passageiro'}
                    >
                      <Phone size={14} />
                    </a>
                  )}

                  <button
                    type="button"
                    onClick={onOpenGps}
                    title="Abrir GPS em Tela Cheia"
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: '50%',
                      backgroundColor: '#F3F4F6',
                      border: '1px solid #E5E7EB',
                      color: '#111111',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer'
                    }}
                  >
                    <Maximize2 size={14} />
                  </button>
                </div>

                <div style={{ textAlign: 'right' }}>
                  <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'flex-end', gap: 4, fontSize: '0.68rem', color: '#6B7280', fontWeight: 700 }}>
                    <span>{category.name} •</span>
                    <PaymentMethodIcon method={ride.paymentMethod} size={13} />
                    <span>{getPaymentMethodLabel(ride.paymentMethod, true)}</span>
                  </div>
                  <div style={{ fontSize: '0.84rem', fontWeight: 900, color: '#15803D' }}>
                    Ganho: R$ {netEarnings.toFixed(2).replace('.', ',')}
                  </div>
                </div>
              </div>
            </div>
          )}

          {(localPinError || startTripError) && (
            <div style={{ marginTop: 6, fontSize: '0.72rem', fontWeight: 700, color: '#DC2626', textAlign: 'center' }}>
              {localPinError || startTripError}
            </div>
          )}

          {/* Barra Única de Ação Rente em Baixo (não ocupa o GPS) */}
          <div style={{ display: 'flex', gap: 7, marginTop: 8 }}>
            {!isTripInProgress && !isAtPickup && onArrivePickup && !showPinPrompt && (
              <button
                type="button"
                onClick={onArrivePickup}
                style={{
                  padding: '0 12px',
                  height: 40,
                  borderRadius: 11,
                  backgroundColor: '#F3F4F6',
                  color: '#111111',
                  border: '1px solid #D1D5DB',
                  fontSize: '0.78rem',
                  fontWeight: 800,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap'
                }}
              >
                Cheguei
              </button>
            )}

            {!isTripInProgress ? (
              ride.requiresBoardingPin && showPinPrompt ? (
                <div style={{ flex: 1, display: 'flex', gap: 6, alignItems: 'center' }}>
                  <input
                    type="tel"
                    inputMode="numeric"
                    maxLength={4}
                    value={pinInput}
                    onChange={(e) => {
                      setPinInput(e.target.value.replace(/\D/g, '').slice(0, 4));
                      setLocalPinError('');
                    }}
                    placeholder="PIN"
                    autoFocus
                    style={{
                      width: 86,
                      height: 40,
                      borderRadius: 11,
                      border: '2px solid #2563EB',
                      textAlign: 'center',
                      fontSize: '0.96rem',
                      fontWeight: 900,
                      letterSpacing: '0.16em',
                      color: '#111111',
                      outline: 'none'
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (pinInput.length !== 4) {
                        setLocalPinError('Digite o PIN de 4 dígitos informado.');
                        return;
                      }
                      setLocalPinError('');
                      onStartTrip(pinInput);
                    }}
                    style={{
                      flex: 1,
                      height: 40,
                      borderRadius: 11,
                      backgroundColor: '#15803D',
                      color: '#FFFFFF',
                      border: 'none',
                      fontSize: '0.84rem',
                      fontWeight: 800,
                      cursor: 'pointer',
                      whiteSpace: 'nowrap'
                    }}
                  >
                    {isDelivery ? 'Confirmar Coleta' : 'Confirmar Embarque'}
                  </button>
                  <button
                    type="button"
                    aria-label="Cancelar PIN"
                    onClick={() => {
                      setShowPinPrompt(false);
                      setLocalPinError('');
                    }}
                    style={{
                      width: 36,
                      height: 40,
                      borderRadius: 11,
                      backgroundColor: '#F3F4F6',
                      color: '#4B5563',
                      border: '1px solid #E5E7EB',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      flexShrink: 0
                    }}
                  >
                    <X size={16} />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    if (ride.requiresBoardingPin) {
                      setPinInput('');
                      setLocalPinError('');
                      setShowPinPrompt(true);
                    } else {
                      onStartTrip();
                    }
                  }}
                  style={{
                    flex: 1,
                    height: 40,
                    borderRadius: 11,
                    backgroundColor: '#15803D',
                    color: '#FFFFFF',
                    border: 'none',
                    fontSize: '0.88rem',
                    fontWeight: 800,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                    cursor: 'pointer'
                  }}
                >
                  <ArrowRight size={17} strokeWidth={2.8} />
                  <span>{isDelivery ? 'Iniciar entrega' : `Iniciar ${category.name}`}</span>
                </button>
              )
            ) : (
              <button
                type="button"
                onClick={onInitiateComplete}
                style={{
                  flex: 1,
                  height: 40,
                  borderRadius: 11,
                  backgroundColor: '#DC2626',
                  color: '#FFFFFF',
                  border: 'none',
                  fontSize: '0.88rem',
                  fontWeight: 800,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  cursor: 'pointer'
                }}
              >
                <Check size={18} strokeWidth={3} />
                <span>{isDelivery ? 'Finalizar entrega' : 'Finalizar corrida'}</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  );
};
