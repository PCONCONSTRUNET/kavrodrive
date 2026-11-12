import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { 
  ShieldAlert, HeartPulse, Flame, Phone, MapPin, 
  X, AlertTriangle, ExternalLink, Radio, CheckCircle2, Loader2, Navigation
} from 'lucide-react';
import { WhatsAppIcon } from './WhatsAppIcon';
import { StorageService } from '../services/storage';
import { formatPhone } from '../utils/format';
import { reverseGeocode } from '../utils/geo';

interface SosEmergencyModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentLocationText?: string;
  rideId?: string;
  driverPhone?: string;
}

const isGenericFallbackAddress = (addr?: string) => {
  if (!addr) return true;
  const lower = addr.toLowerCase();
  return (
    lower.includes('base operacional') ||
    lower.includes('lauro müller e região') ||
    lower.includes('lauro muller e regiao') ||
    lower.startsWith('gps:') ||
    lower.startsWith('coordenadas:')
  );
};

export const SosEmergencyModal: React.FC<SosEmergencyModalProps> = ({
  isOpen,
  onClose,
  currentLocationText,
  rideId,
  driverPhone
}) => {
  const [gpsState, setGpsState] = useState<'locating' | 'locked' | 'error'>('locating');
  const [coords, setCoords] = useState<{ lat: number; lng: number; accuracy: number } | null>(null);
  const [resolvedAddress, setResolvedAddress] = useState<string>('');
  const [isGeocoding, setIsGeocoding] = useState(false);
  const [isBroadcasting, setIsBroadcasting] = useState(false);
  const [activeSosId, setActiveSosId] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const lastGeocodedRef = useRef<string>('');

  const currentUser = StorageService.getCurrentUser();
  const userName = currentUser?.name || 'Passageiro(a) UP';
  const userPhone = currentUser?.phone ? formatPhone(currentUser.phone) : '';

  // Captura e monitora o GPS do aparelho em alta precisão ao abrir o modal
  useEffect(() => {
    if (!isOpen) return;

    setGpsState('locating');
    let watchId: number | null = null;

    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setCoords({
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracy: pos.coords.accuracy || 10
          });
          setGpsState('locked');
        },
        () => {
          setGpsState('error');
        },
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
      );

      watchId = navigator.geolocation.watchPosition(
        (pos) => {
          setCoords({
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracy: pos.coords.accuracy || 10
          });
          setGpsState('locked');
        },
        () => {},
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
      );
    } else {
      setGpsState('error');
    }

    return () => {
      if (watchId !== null && 'geolocation' in navigator) {
        navigator.geolocation.clearWatch(watchId);
      }
    };
  }, [isOpen]);

  // Converte coordenadas reais do GPS em endereço real (Rua, Bairro, Cidade/UF)
  useEffect(() => {
    if (!coords) return;
    const coordKey = `${coords.lat.toFixed(4)},${coords.lng.toFixed(4)}`;
    if (lastGeocodedRef.current === coordKey && resolvedAddress) return;
    lastGeocodedRef.current = coordKey;

    let cancelled = false;
    setIsGeocoding(true);
    reverseGeocode(coords.lat, coords.lng)
      .then((addr) => {
        if (!cancelled && addr && !addr.startsWith('GPS:')) {
          setResolvedAddress(addr);
        }
      })
      .finally(() => {
        if (!cancelled) setIsGeocoding(false);
      });

    return () => {
      cancelled = true;
    };
  }, [coords?.lat, coords?.lng]);

  const effectiveAddress =
    resolvedAddress ||
    (!isGenericFallbackAddress(currentLocationText) ? currentLocationText! : '') ||
    currentLocationText ||
    'Localização via GPS';

  // Transmissão contínua em segundo plano enquanto o alerta estiver ativo
  useEffect(() => {
    if (!isBroadcasting || !activeSosId || !coords) return;

    const postLocation = async () => {
      try {
        await fetch('/api/sos/location', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: activeSosId,
            name: userName,
            phone: userPhone,
            lat: coords.lat,
            lng: coords.lng,
            accuracy: coords.accuracy,
            address: effectiveAddress,
            rideId: rideId || null
          })
        });
      } catch {
        // Ignora erro de rede temporário
      }
    };

    postLocation();
    const interval = setInterval(postLocation, 4000);
    return () => clearInterval(interval);
  }, [isBroadcasting, activeSosId, coords?.lat, coords?.lng, userName, userPhone, effectiveAddress, rideId]);

  if (!isOpen) return null;

  const emergencyContacts = [
    {
      title: 'Polícia Militar',
      number: '190',
      description: 'Emergências policiais, assaltos e segurança imediata',
      bg: '#DC2626',
      border: '#B91C1C',
      lightBg: '#FEE2E2',
      textColor: '#991B1B',
      imageSrc: '/icons/icone-190.png',
    },
    {
      title: 'SAMU (Ambulância)',
      number: '192',
      description: 'Socorro médico de urgência e primeiros socorros',
      bg: '#E11D48',
      border: '#BE123C',
      lightBg: '#FFE4E6',
      textColor: '#9F1239',
      imageSrc: '/icons/icone-samu.png',
    },
    {
      title: 'Corpo de Bombeiros',
      number: '193',
      description: 'Resgate em acidentes de trânsito, traumas e incêndios',
      bg: '#EA580C',
      border: '#C2410C',
      lightBg: '#FFEDD5',
      textColor: '#9A3412',
      imageSrc: '/icons/icone-193.png',
    },
  ];

  const handleShareSosLocation = async () => {
    setIsSending(true);

    let activeCoords = coords;

    // Se ainda não tiver as coordenadas, tenta uma leitura rápida
    if (!activeCoords && 'geolocation' in navigator) {
      try {
        const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: true,
            timeout: 5000,
            maximumAge: 0
          });
        });
        activeCoords = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy || 10
        };
        setCoords(activeCoords);
        setGpsState('locked');
      } catch {
        activeCoords = { lat: -28.3926, lng: -49.3989, accuracy: 40 };
      }
    } else if (!activeCoords) {
      activeCoords = { lat: -28.3926, lng: -49.3989, accuracy: 40 };
    }

    // Garante que o endereço na mensagem seja o endereço real das coordenadas GPS
    let addressDesc = resolvedAddress;
    if (!addressDesc) {
      try {
        const geocoded = await reverseGeocode(activeCoords.lat, activeCoords.lng);
        if (geocoded && !geocoded.startsWith('GPS:')) {
          addressDesc = geocoded;
          setResolvedAddress(geocoded);
        }
      } catch {
        // ignore
      }
    }
    if (!addressDesc) {
      addressDesc = !isGenericFallbackAddress(currentLocationText)
        ? currentLocationText!
        : `${activeCoords.lat.toFixed(5)}, ${activeCoords.lng.toFixed(5)}`;
    }

    // ID curto e limpo para manter o link enxuto (todos os metadados ficam salvos no banco PostgreSQL)
    const sosId = activeSosId || Math.random().toString(36).substring(2, 8);
    setActiveSosId(sosId);
    setIsBroadcasting(true);

    // Salva o alerta imediatamente no backend da Kavro Drive
    try {
      await fetch('/api/sos/location', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: sosId,
          name: userName,
          phone: userPhone,
          lat: activeCoords.lat,
          lng: activeCoords.lng,
          accuracy: activeCoords.accuracy,
          address: addressDesc,
          rideId: rideId || null
        })
      });
    } catch (err) {
      console.warn('[SOS register error]:', err);
    }

    // Links curtos, limpos e bem titulados
    const liveTrackingUrl = `${window.location.origin}/sos/${sosId}`;
    const googleMapsUrl = `https://maps.google.com/?q=${activeCoords.lat.toFixed(5)},${activeCoords.lng.toFixed(5)}`;

    const text =
      `🚨 *ALERTA DE EMERGÊNCIA / SOS - KAVRO DRIVE*\n\n` +
      `⚠️ *Preciso de auxílio urgente neste momento!*\n` +
      `👤 *Solicitante:* ${userName}\n` +
      (userPhone ? `📱 *Contato:* ${userPhone}\n` : '') +
      (rideId ? `🚗 *Viagem UP:* ${rideId}\n` : '') +
      `📍 *Endereço GPS:* ${addressDesc}\n` +
      `🛰️ *Coordenadas:* ${activeCoords.lat.toFixed(5)}, ${activeCoords.lng.toFixed(5)}\n\n` +
      `🔴 *1. Rastreamento ao Vivo e Rota de Socorro:*\n${liveTrackingUrl}\n\n` +
      `🗺️ *2. Abrir Localização no Google Maps:*\n${googleMapsUrl}\n\n` +
      `ℹ️ _O link 1 mostra a posição em tempo real, traça rota até mim e mantém o último ponto salvo caso a internet ou bateria acabe._`;

    setIsSending(false);

    if (navigator.share) {
      // Importante: não enviar 'url' separado pois o texto já contém os links titulados (evita duplicar o link no final)
      navigator.share({
        title: '🚨 ALERTA SOS - Kavro Drive',
        text: text
      }).catch(() => {
        window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`, '_blank');
      });
    } else {
      window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`, '_blank');
    }
  };

  return createPortal(
    <div 
      className="modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 99999,
        backgroundColor: 'rgba(10, 15, 20, 0.82)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
        padding: 0,
        animation: 'fadeIn 0.2s ease-out'
      }}
    >
      <div
        className="modal-sheet"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 480,
          backgroundColor: '#FFFFFF',
          borderRadius: '24px 24px 0 0',
          boxShadow: '0 -10px 45px rgba(220, 38, 38, 0.35)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          maxHeight: '92dvh',
          borderTop: '3px solid #EF4444'
        }}
      >
        {/* CABEÇALHO SOS COM ALERTA VISUAL */}
        <div style={{
          backgroundColor: '#FEF2F2',
          padding: '16px 20px 14px 20px',
          borderBottom: '1px solid #FECACA',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 38,
              height: 38,
              borderRadius: 12,
              backgroundColor: '#EF4444',
              color: '#FFFFFF',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 4px 12px rgba(239, 68, 68, 0.4)'
            }}>
              <AlertTriangle size={20} strokeWidth={2.6} />
            </div>
            <div>
              <h2 style={{ fontSize: '1.08rem', fontWeight: 900, color: '#991B1B', margin: 0, lineHeight: 1.2 }}>
                Central de Emergência & SOS
              </h2>
              <span style={{ fontSize: '0.74rem', color: '#B91C1C', fontWeight: 600 }}>
                Toque para discar imediatamente
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            style={{
              width: 32,
              height: 32,
              borderRadius: '50%',
              backgroundColor: '#FFFFFF',
              border: '1px solid #FECACA',
              color: '#991B1B',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer'
            }}
          >
            <X size={17} />
          </button>
        </div>

        {/* CORPO DO MODAL */}
        <div style={{
          padding: '16px 18px 24px 18px',
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: 12
        }}>
          {/* BARRA DE STATUS DO GPS EM TEMPO REAL */}
          <div style={{
            backgroundColor: gpsState === 'locked' ? '#F0FDF4' : gpsState === 'locating' ? '#FEFCE8' : '#FEF2F2',
            border: `1.5px solid ${gpsState === 'locked' ? '#BBF7D0' : gpsState === 'locating' ? '#FEF08A' : '#FECACA'}`,
            borderRadius: 12,
            padding: '9px 12px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flex: 1 }}>
              {gpsState === 'locked' ? (
                <Radio size={18} color="#15803D" style={{ flexShrink: 0 }} />
              ) : gpsState === 'locating' ? (
                <Loader2 size={18} color="#CA8A04" style={{ flexShrink: 0, animation: 'spin 1s linear infinite' }} />
              ) : (
                <AlertTriangle size={18} color="#DC2626" style={{ flexShrink: 0 }} />
              )}

              <div style={{ minWidth: 0 }}>
                <div style={{
                  fontSize: '0.72rem',
                  fontWeight: 800,
                  color: gpsState === 'locked' ? '#15803D' : gpsState === 'locating' ? '#854D0E' : '#991B1B'
                }}>
                  {gpsState === 'locked'
                    ? `Sinal GPS Fixado (Precisão: ±${Math.round(coords?.accuracy || 10)}m)`
                    : gpsState === 'locating'
                    ? 'Conectando ao Satélite GPS...'
                    : 'Aguardando permissão de GPS'}
                </div>
                {coords && (
                  <div style={{ fontSize: '0.68rem', fontFamily: 'monospace', color: '#64748B', marginTop: 1 }}>
                    {coords.lat.toFixed(5)}, {coords.lng.toFixed(5)}
                  </div>
                )}
              </div>
            </div>

            {coords && (
              <a
                href={`https://maps.google.com/?q=${coords.lat.toFixed(6)},${coords.lng.toFixed(6)}`}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  fontSize: '0.70rem',
                  fontWeight: 800,
                  color: '#2563EB',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 3,
                  textDecoration: 'none',
                  padding: '3px 8px',
                  backgroundColor: '#EFF6FF',
                  borderRadius: 6,
                  border: '1px solid #BFDBFE'
                }}
              >
                <span>Ver Mapa</span>
                <ExternalLink size={12} />
              </a>
            )}
          </div>

          {/* LOCALIZAÇÃO ATUAL PARA INFORMAR AO ATENDENTE */}
          <div style={{
            backgroundColor: '#F8FAFC',
            border: '1.5px dashed #CBD5E1',
            borderRadius: 12,
            padding: '10px 12px',
            display: 'flex',
            alignItems: 'flex-start',
            gap: 8
          }}>
            <MapPin size={17} color="#DC2626" style={{ flexShrink: 0, marginTop: 2 }} />
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: '0.68rem', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Endereço identificado pelo Satélite GPS:
              </div>
              <div style={{ fontSize: '0.84rem', fontWeight: 800, color: '#1E293B', marginTop: 2, lineHeight: 1.3 }}>
                {resolvedAddress
                  ? resolvedAddress
                  : isGeocoding
                  ? 'Identificando rua, bairro e cidade pelo GPS...'
                  : effectiveAddress}
              </div>
              {rideId && (
                <div style={{ fontSize: '0.72rem', color: '#475569', marginTop: 2 }}>
                  Identificador da corrida: <strong>{rideId}</strong>
                </div>
              )}
            </div>
          </div>

          {/* LISTA DE DISCAGEM DE EMERGÊNCIA */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {emergencyContacts.map((contact) => {
              return (
                <a
                  key={contact.number}
                  href={`tel:${contact.number}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '12px 14px',
                    borderRadius: 16,
                    backgroundColor: '#FFFFFF',
                    border: `1.5px solid ${contact.border}`,
                    textDecoration: 'none',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0, flex: 1 }}>
                    <div style={{
                      width: 48,
                      height: 48,
                      borderRadius: 14,
                      backgroundColor: '#FFFFFF',
                      border: `1.5px solid ${contact.border}`,
                      padding: 4,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                      boxShadow: '0 3px 8px rgba(0,0,0,0.1)'
                    }}>
                      <img
                        src={contact.imageSrc}
                        alt={contact.title}
                        style={{
                          width: '100%',
                          height: '100%',
                          objectFit: 'contain'
                        }}
                      />
                    </div>

                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: '0.96rem', fontWeight: 900, color: '#0F172A' }}>
                          {contact.title}
                        </span>
                        <span style={{
                          backgroundColor: contact.lightBg,
                          color: contact.textColor,
                          fontWeight: 900,
                          fontSize: '0.82rem',
                          padding: '1px 8px',
                          borderRadius: 6
                        }}>
                          {contact.number}
                        </span>
                      </div>
                      <div style={{ fontSize: '0.74rem', color: '#64748B', lineHeight: 1.25, marginTop: 2 }}>
                        {contact.description}
                      </div>
                    </div>
                  </div>

                  <div style={{
                    width: 36,
                    height: 36,
                    borderRadius: '50%',
                    backgroundColor: contact.bg,
                    color: '#FFFFFF',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginLeft: 10,
                    flexShrink: 0
                  }}>
                    <Phone size={17} />
                  </div>
                </a>
              );
            })}
          </div>

          {/* BOTÃO RÁPIDO PARA ALERTA VIA WHATSAPP COM RASTREAMENTO AO VIVO E ÚLTIMA LOCALIZAÇÃO */}
          <div style={{ marginTop: 4, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <button
              type="button"
              onClick={handleShareSosLocation}
              disabled={isSending}
              style={{
                width: '100%',
                minHeight: 48,
                borderRadius: 14,
                backgroundColor: '#15803D',
                color: '#FFFFFF',
                border: 'none',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                fontSize: '0.88rem',
                fontWeight: 800,
                cursor: isSending ? 'not-allowed' : 'pointer',
                boxShadow: '0 4px 14px rgba(21, 128, 61, 0.35)',
                opacity: isSending ? 0.75 : 1,
                padding: '10px 14px'
              }}
            >
              {isSending ? (
                <Loader2 size={20} style={{ animation: 'spin 1s linear infinite' }} />
              ) : (
                <WhatsAppIcon size={21} />
              )}
              <span>Enviar Alerta SOS com Link e GPS no WhatsApp</span>
            </button>

            {/* SE O ALERTA JÁ ESTIVER TRANSMITINDO, MOSTRA ATALHO PARA VER O MAPA */}
            {isBroadcasting && activeSosId && (
              <div style={{
                backgroundColor: '#F0FDF4',
                border: '1.5px solid #86EFAC',
                borderRadius: 12,
                padding: '10px 12px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 8
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <div style={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    backgroundColor: '#16A34A',
                    boxShadow: '0 0 8px #16A34A'
                  }} />
                  <span style={{ fontSize: '0.78rem', fontWeight: 800, color: '#166534' }}>
                    Sinal transmitindo em tempo real!
                  </span>
                </div>

                <a
                  href={`/sos/${encodeURIComponent(activeSosId)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    backgroundColor: '#16A34A',
                    color: '#FFFFFF',
                    padding: '5px 10px',
                    borderRadius: 8,
                    fontSize: '0.74rem',
                    fontWeight: 800,
                    textDecoration: 'none',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4
                  }}
                >
                  <span>Abrir Mapa</span>
                  <ExternalLink size={12} />
                </a>
              </div>
            )}
          </div>

          <div style={{
            fontSize: '0.70rem',
            color: '#94A3B8',
            textAlign: 'center',
            lineHeight: 1.3,
            marginTop: 4
          }}>
            O link de socorro conecta ao seu GPS em tempo real. Caso seu celular fique sem sinal de internet ou bateria, o último ponto continuará salvo para o socorro.
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};
