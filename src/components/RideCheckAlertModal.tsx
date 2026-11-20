import React, { useState, useEffect, useRef } from 'react';
import { ShieldAlert, CheckCircle2, PhoneCall, Clock } from 'lucide-react';
import { Ride } from '../types';
import { StorageService } from '../services/storage';

interface RideCheckAlertModalProps {
  ride: Ride | null | undefined;
  viewerRole: 'passageiro' | 'motorista';
  onOpenSos?: () => void;
  onResponded?: () => void;
}

export const RideCheckAlertModal: React.FC<RideCheckAlertModalProps> = ({
  ride,
  viewerRole,
  onOpenSos,
  onResponded
}) => {
  const activeCheck =
    ride &&
    ride.status === 'em_andamento' &&
    ride.rideCheck &&
    ride.rideCheck.status === 'aguardando_resposta'
      ? ride.rideCheck
      : null;

  const [secondsLeft, setSecondsLeft] = useState<number>(60);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const timeoutFiredRef = useRef<string>('');

  const sendDecision = async (decision: 'ok' | 'sos' | 'timeout') => {
    if (!ride?.id || !activeCheck) return;
    setIsSubmitting(true);
    try {
      await fetch(`/api/rides/${encodeURIComponent(ride.id)}/ridecheck/respond`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...StorageService.getAuthHeaders()
        },
        body: JSON.stringify({
          decision,
          role: viewerRole,
          rideCheckId: activeCheck.id
        })
      });
      await StorageService.syncFromDatabase().catch(() => {});
      onResponded?.();
      if (decision === 'sos') {
        onOpenSos?.();
      }
    } catch {
      // Silencioso
    } finally {
      setIsSubmitting(false);
    }
  };

  useEffect(() => {
    if (!activeCheck) return;

    const computeRemaining = () => {
      const expMs = new Date(activeCheck.expiresAt).getTime();
      if (!Number.isFinite(expMs)) return 60;
      return Math.max(0, Math.ceil((expMs - Date.now()) / 1000));
    };

    const initial = computeRemaining();
    setSecondsLeft(initial);

    const timer = setInterval(() => {
      const next = computeRemaining();
      setSecondsLeft(next);
      if (next <= 0 && timeoutFiredRef.current !== activeCheck.id) {
        timeoutFiredRef.current = activeCheck.id;
        void sendDecision('timeout');
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [activeCheck?.id, activeCheck?.expiresAt]);

  if (!activeCheck || !ride) return null;

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      backgroundColor: 'rgba(15, 23, 42, 0.72)',
      backdropFilter: 'blur(4px)',
      zIndex: 100050,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 16
    }}>
      <div style={{
        width: '100%',
        maxWidth: 420,
        backgroundColor: '#FFFFFF',
        borderRadius: 24,
        padding: 20,
        boxShadow: '0 24px 60px rgba(0,0,0,0.35)',
        border: '2px solid #F59E0B'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 44,
              height: 44,
              borderRadius: 14,
              backgroundColor: '#FEF3C7',
              color: '#D97706',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0
            }}>
              <ShieldAlert size={24} />
            </div>
            <div>
              <div style={{ fontSize: '0.7rem', fontWeight: 900, color: '#B45309', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                RideCheck Ativo • Kavro Segurança
              </div>
              <h3 style={{ margin: 0, fontSize: '1.08rem', fontWeight: 900, color: '#111111' }}>
                Está tudo bem na viagem?
              </h3>
            </div>
          </div>

          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            padding: '6px 10px',
            borderRadius: 999,
            backgroundColor: secondsLeft <= 15 ? '#FEE2E2' : '#F1F5F9',
            color: secondsLeft <= 15 ? '#DC2626' : '#0F172A',
            fontWeight: 900,
            fontSize: '0.82rem',
            fontVariantNumeric: 'tabular-nums'
          }}>
            <Clock size={14} />
            <span>{secondsLeft}s</span>
          </div>
        </div>

        <div style={{
          backgroundColor: '#FFFBEB',
          border: '1px solid #FDE68A',
          borderRadius: 14,
          padding: '12px 14px',
          marginBottom: 16
        }}>
          <div style={{ fontSize: '0.86rem', fontWeight: 800, color: '#92400E', marginBottom: 4 }}>
            Notamos uma parada/desvio incomum na rota. Está tudo bem?
          </div>
          <div style={{ fontSize: '0.76rem', color: '#78350F', lineHeight: 1.4 }}>
            Motivo detectado: <strong>{activeCheck.reasonLabel}</strong>
          </div>
          <div style={{ fontSize: '0.7rem', color: '#B45309', fontWeight: 700, marginTop: 6 }}>
            Sem confirmação em {secondsLeft}s, abriremos automaticamente um alerta preventivo na Central SOS e avisaremos os contatos de confiança.
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button
            type="button"
            disabled={isSubmitting}
            onClick={() => void sendDecision('ok')}
            style={{
              width: '100%',
              height: 48,
              borderRadius: 14,
              border: 'none',
              backgroundColor: '#16A34A',
              color: '#FFFFFF',
              fontSize: '0.94rem',
              fontWeight: 800,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              cursor: isSubmitting ? 'not-allowed' : 'pointer'
            }}
          >
            <CheckCircle2 size={19} />
            <span>Sim, está tudo bem</span>
          </button>

          <button
            type="button"
            disabled={isSubmitting}
            onClick={() => void sendDecision('sos')}
            style={{
              width: '100%',
              height: 48,
              borderRadius: 14,
              border: 'none',
              backgroundColor: '#DC2626',
              color: '#FFFFFF',
              fontSize: '0.94rem',
              fontWeight: 800,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              cursor: isSubmitting ? 'not-allowed' : 'pointer'
            }}
          >
            <PhoneCall size={18} />
            <span>Preciso de Ajuda (SOS)</span>
          </button>
        </div>
      </div>
    </div>
  );
};
