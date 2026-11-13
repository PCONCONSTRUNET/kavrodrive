import React, { useState } from 'react';
import {
  MessageSquare, Phone, Navigation, Sliders, List, Shield,
  Check, ArrowRight, ArrowUp, CornerUpRight, CornerUpLeft, User, Compass, ExternalLink
} from 'lucide-react';
import { Ride, SystemConfig } from '../types';
import { getCategoryById } from '../utils/categoryEngine';
import { getCleanWhatsappNumber } from '../utils/format';
import { getGoogleMapsRouteUrl } from '../utils/geo';
import { RouteStepSummary } from './DriverHomeMap';

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
  onStartTrip: () => void;
  onInitiateComplete: () => void;
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
}) => {
  const [isDetailsExpanded, setIsDetailsExpanded] = useState(true);
  const category = getCategoryById(ride.category, config);
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
    if (modifier.includes('left')) return <CornerUpLeft size={30} color="#FFFFFF" strokeWidth={2.8} />;
    if (modifier.includes('right')) return <CornerUpRight size={30} color="#FFFFFF" strokeWidth={2.8} />;
    return <ArrowUp size={30} color="#FFFFFF" strokeWidth={3} />;
  };

  const clientFirstName = (ride.clientName || 'Passageiro').split(' ')[0];
  const netEarnings = ride.driverNetAmount || ride.totalPrice * (1 - (ride.commissionPercent || 20) / 100);

  return (
    <>
      {/* =====================================================================
          1. BANNER ESCURO TURN-BY-TURN NO TOPO (ESTILO PRINT UBER DRIVER)
         ===================================================================== */}
      <div style={{
        position: 'fixed',
        top: 'calc(10px + env(safe-area-inset-top, 0px))',
        left: '50%',
        transform: 'translateX(-50%)',
        width: 'calc(100% - 20px)',
        maxWidth: 456,
        zIndex: 70,
        backgroundColor: '#141414',
        color: '#FFFFFF',
        borderRadius: 14,
        boxShadow: '0 8px 28px rgba(0,0,0,0.35)',
        overflow: 'hidden',
        border: '1px solid rgba(255,255,255,0.08)'
      }}>
        {/* Linha principal da manobra */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 14,
          padding: '12px 14px'
        }}>
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            minWidth: 48,
            flexShrink: 0
          }}>
            {renderTurnArrow()}
            <span style={{ fontSize: '0.88rem', fontWeight: 800, color: '#FFFFFF', marginTop: 2 }}>
              {stepMeters < 1000 ? `${stepMeters} m` : `${(stepMeters / 1000).toFixed(1)} km`}
            </span>
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontSize: '1.08rem',
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
              fontSize: '0.96rem',
              fontWeight: 600,
              color: '#E5E7EB',
              lineHeight: 1.25,
              marginTop: 2,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis'
            }}>
              <span style={{ fontSize: '0.78rem', color: '#9CA3AF', fontWeight: 500, marginRight: 5 }}>para</span>
              {nextStreet}
            </div>
          </div>

          <button
            type="button"
            onClick={onOpenGps}
            title="Abrir Mapa em Tela Cheia"
            style={{
              backgroundColor: 'rgba(255,255,255,0.12)',
              border: 'none',
              borderRadius: 10,
              padding: '7px 10px',
              color: '#FFFFFF',
              fontSize: '0.72rem',
              fontWeight: 700,
              cursor: 'pointer',
              flexShrink: 0
            }}
          >
            GPS Full
          </button>
        </div>

        {/* Divisória + Perto de Endereço */}
        <div style={{
          backgroundColor: '#1E1E1E',
          borderTop: '1px solid rgba(255,255,255,0.08)',
          padding: '9px 14px',
          display: 'flex',
          alignItems: 'flex-start',
          gap: 10
        }}>
          <div style={{
            width: 8,
            height: 8,
            borderRadius: 1,
            backgroundColor: isTripInProgress ? '#EF4444' : '#16A34A',
            marginTop: 5,
            flexShrink: 0
          }} />
          <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
            <div style={{
              fontSize: '0.84rem',
              color: '#F3F4F6',
              fontWeight: 600,
              lineHeight: 1.3,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis'
            }}>
              {isTripInProgress ? `Destino: ${targetShort}` : `Perto de ${targetShort}`}
            </div>
            {targetSub && (
              <div style={{
                fontSize: '0.74rem',
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
          2. BOTTOM STACK: CONTROLES FLUTUANTES + SHEET BRANCA UBER DRIVER
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
        {/* Controles Flutuantes sobre o Mapa (30 LIMITE + 🛡️ esquerda | Centralizar + Navegar direita) */}
        <div style={{
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'space-between',
          padding: '0 14px 12px 14px',
          pointerEvents: 'none'
        }}>
          {/* Esquerda: Placa 30 LIMITE + Escudo Azul SOS */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, pointerEvents: 'auto' }}>
            <div style={{
              width: 44,
              backgroundColor: '#FFFFFF',
              borderRadius: 8,
              border: '2px solid #D1D5DB',
              boxShadow: '0 3px 12px rgba(0,0,0,0.2)',
              padding: '4px 2px',
              textAlign: 'center',
              color: '#111111'
            }}>
              <div style={{ fontSize: '1.05rem', fontWeight: 900, lineHeight: 1 }}>30</div>
              <div style={{ fontSize: '0.52rem', fontWeight: 800, letterSpacing: '0.03em', marginTop: 1 }}>LIMITE</div>
            </div>

            {onOpenSos && (
              <button
                type="button"
                onClick={onOpenSos}
                title="Central de Segurança SOS"
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: '50%',
                  backgroundColor: '#FFFFFF',
                  border: '1px solid #E5E7EB',
                  boxShadow: '0 4px 14px rgba(0,0,0,0.18)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer'
                }}
              >
                <Shield size={21} color="#276EF1" fill="#DBEAFE" strokeWidth={2.2} />
              </button>
            )}
          </div>

          {/* Direita: Botões circulares + Pílula escura "▲ Navegar" */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 10, pointerEvents: 'auto' }}>
            {onRecenterMap && (
              <button
                type="button"
                onClick={onRecenterMap}
                title="Centralizar mapa"
                style={{
                  width: 42,
                  height: 42,
                  borderRadius: '50%',
                  backgroundColor: '#FFFFFF',
                  border: '1px solid #E5E7EB',
                  boxShadow: '0 4px 14px rgba(0,0,0,0.18)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#111111',
                  cursor: 'pointer'
                }}
              >
                <Compass size={20} />
              </button>
            )}

            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
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
                  backgroundColor: '#1E1E1E',
                  color: '#FFFFFF',
                  padding: '10px 16px',
                  borderRadius: 999,
                  fontSize: '0.88rem',
                  fontWeight: 700,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 7,
                  textDecoration: 'none',
                  boxShadow: '0 6px 18px rgba(0,0,0,0.32)'
                }}
              >
                <Navigation size={15} fill="#FFFFFF" color="#FFFFFF" />
                <span>Navegar</span>
                <ExternalLink size={12} color="#9CA3AF" />
              </a>
            </div>
          </div>
        </div>

        {/* =====================================================================
            3. SHEET BRANCA INFERIOR ESTILO UBER (8 min 👤 2,1 km / Encontro com ...)
           ===================================================================== */}
        <div style={{
          backgroundColor: '#FFFFFF',
          borderRadius: '20px 20px 0 0',
          boxShadow: '0 -6px 28px rgba(0,0,0,0.16)',
          padding: '10px 16px calc(14px + env(safe-area-inset-bottom, 0px)) 16px',
          color: '#111111',
          pointerEvents: 'auto'
        }}>
          {/* Handle cinza */}
          <div style={{
            width: 38,
            height: 4,
            borderRadius: 999,
            backgroundColor: '#D1D5DB',
            margin: '0 auto 10px auto'
          }} />

          {/* Barra Principal idêntica ao Print Uber: [🎚️]  [ 8 min 👤 2,1 km / Encontro com Lucas ]  [≡] */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 10
          }}>
            <button
              type="button"
              onClick={() => (onOpenPreferences ? onOpenPreferences() : setIsDetailsExpanded(v => !v))}
              title="Preferências"
              style={{
                width: 40,
                height: 40,
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
              <Sliders size={19} />
            </button>

            <div
              onClick={() => setIsDetailsExpanded(v => !v)}
              style={{ textAlign: 'center', flex: 1, cursor: 'pointer', minWidth: 0 }}
            >
              <div style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 7,
                fontSize: '1.14rem',
                fontWeight: 800,
                color: '#111111',
                letterSpacing: '-0.02em'
              }}>
                <span>{etaMin} min</span>
                <span style={{
                  width: 20,
                  height: 20,
                  borderRadius: '50%',
                  backgroundColor: isTripInProgress ? '#276EF1' : '#15803D',
                  color: '#FFFFFF',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  <User size={12} fill="#FFFFFF" color="#FFFFFF" />
                </span>
                <span>{distKm.toFixed(1).replace('.', ',')} km</span>
              </div>
              <div style={{
                fontSize: '0.84rem',
                color: '#4B5563',
                fontWeight: 600,
                marginTop: 2,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis'
              }}>
                {isTripInProgress
                  ? `Viagem com ${clientFirstName} • R$ ${netEarnings.toFixed(2).replace('.', ',')}`
                  : isAtPickup
                    ? `Aguardando ${clientFirstName} no embarque`
                    : `Encontro com ${clientFirstName}`}
              </div>
            </div>

            <button
              type="button"
              onClick={() => setIsDetailsExpanded(v => !v)}
              title="Ações da corrida"
              style={{
                width: 40,
                height: 40,
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
              <List size={20} />
            </button>
          </div>

          {/* Drawer expansível com Chat, Ligação/WhatsApp e CTA Iniciar/Finalizar */}
          {isDetailsExpanded && (
            <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid #F3F4F6' }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 8,
                marginBottom: 10
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                  <button
                    type="button"
                    onClick={onOpenChat}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      backgroundColor: '#F3F4F6',
                      border: '1px solid #E5E7EB',
                      borderRadius: 999,
                      padding: '8px 14px',
                      color: '#111111',
                      fontSize: '0.8rem',
                      fontWeight: 700,
                      cursor: 'pointer'
                    }}
                  >
                    <MessageSquare size={15} />
                    <span>Mensagem</span>
                    {unreadChatCount > 0 && (
                      <span style={{
                        minWidth: 18,
                        height: 18,
                        padding: '0 5px',
                        borderRadius: 999,
                        backgroundColor: '#2563EB',
                        color: '#FFFFFF',
                        fontSize: '0.7rem',
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
                        width: 36,
                        height: 36,
                        borderRadius: '50%',
                        backgroundColor: '#F3F4F6',
                        border: '1px solid #E5E7EB',
                        color: '#111111',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        textDecoration: 'none'
                      }}
                      title="Chamar passageiro"
                    >
                      <Phone size={15} />
                    </a>
                  )}
                </div>

                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '0.7rem', color: '#6B7280', fontWeight: 700 }}>
                    {category.name} • {ride.paymentMethod === 'dinheiro' ? '💵 Dinheiro' : ride.paymentMethod === 'pix' ? '⚡ PIX' : '💳 Cartão'}
                  </div>
                  <div style={{ fontSize: '0.88rem', fontWeight: 900, color: '#15803D' }}>
                    Ganho: R$ {netEarnings.toFixed(2).replace('.', ',')}
                  </div>
                </div>
              </div>

              {/* Botões principais da etapa */}
              <div style={{ display: 'flex', gap: 8 }}>
                {!isTripInProgress && !isAtPickup && onArrivePickup && (
                  <button
                    type="button"
                    onClick={onArrivePickup}
                    style={{
                      padding: '0 14px',
                      height: 48,
                      borderRadius: 12,
                      backgroundColor: '#F3F4F6',
                      color: '#111111',
                      border: '1px solid #D1D5DB',
                      fontSize: '0.82rem',
                      fontWeight: 800,
                      cursor: 'pointer',
                      whiteSpace: 'nowrap'
                    }}
                  >
                    Cheguei
                  </button>
                )}

                {!isTripInProgress ? (
                  <button
                    type="button"
                    onClick={onStartTrip}
                    style={{
                      flex: 1,
                      height: 48,
                      borderRadius: 12,
                      backgroundColor: '#15803D',
                      color: '#FFFFFF',
                      border: 'none',
                      fontSize: '0.96rem',
                      fontWeight: 800,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 8,
                      cursor: 'pointer'
                    }}
                  >
                    <ArrowRight size={19} strokeWidth={2.8} />
                    <span>Iniciar {category.name}</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={onInitiateComplete}
                    style={{
                      flex: 1,
                      height: 48,
                      borderRadius: 12,
                      backgroundColor: '#DC2626',
                      color: '#FFFFFF',
                      border: 'none',
                      fontSize: '0.96rem',
                      fontWeight: 800,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 8,
                      cursor: 'pointer'
                    }}
                  >
                    <Check size={20} strokeWidth={3} />
                    <span>Finalizar corrida</span>
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
};
