import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, CheckCircle2, RefreshCw, X } from 'lucide-react';
import { Ride, SystemConfig } from '../types';
import {
  StorageService,
  canPassengerCancelRide,
  getEstimatedPassengerCancelFee
} from '../services/storage';
import { formatRideCode } from '../utils/format';

interface RideCancelModalProps {
  isOpen: boolean;
  ride: Ride | null;
  config?: SystemConfig | null;
  onClose: () => void;
  onCancelled: (result: {
    ride?: Ride;
    cancellationFeeApplied: number;
    refundAmount: number;
  }) => void;
}

const RideCancelModalBody: React.FC<{
  ride: Ride;
  config?: SystemConfig | null;
  onClose: () => void;
  onCancelled: RideCancelModalProps['onCancelled'];
}> = ({ ride, config, onClose, onCancelled }) => {
  const [selectedReason, setSelectedReason] = useState<string>('');
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const isWaitingAccept =
    ride.status === 'aguardando_pagamento' ||
    ride.status === 'aguardando_confirmacao' ||
    !ride.driverId;
  const estimatedFee = getEstimatedPassengerCancelFee(ride, config);
  const canCancel = canPassengerCancelRide(ride);

  const reasons = isWaitingAccept
    ? [
        'Demorando para encontrar motorista',
        'Mudei de planos',
        'Informei o endereço errado',
        'Vou trocar a forma de pagamento'
      ]
    : [
        'Motorista está demorando muito',
        'Mudei de planos',
        'Local de embarque incorreto',
        'Não preciso mais da viagem'
      ];

  const handleConfirmCancel = async () => {
    if (submitting || !canCancel) return;
    setSubmitting(true);
    setErrorMsg(null);
    const res = await StorageService.cancelRide(ride.id, selectedReason || undefined);
    setSubmitting(false);
    if (!res.ok) {
      setErrorMsg(res.error || 'Não foi possível cancelar agora. Tente novamente.');
      return;
    }
    onCancelled({
      ride: res.ride,
      cancellationFeeApplied: Number(res.cancellationFeeApplied || 0),
      refundAmount: Number(res.refundAmount || 0)
    });
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 10060,
        backgroundColor: 'rgba(15, 23, 42, 0.62)',
        backdropFilter: 'blur(3px)',
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
      }}
      onClick={() => {
        if (!submitting) onClose();
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 480,
          backgroundColor: '#FFFFFF',
          borderRadius: '22px 22px 0 0',
          padding: '16px 18px calc(20px + env(safe-area-inset-bottom, 0px)) 18px',
          boxShadow: '0 -10px 36px rgba(0,0,0,0.28)',
          boxSizing: 'border-box'
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}>
          <div style={{ width: 38, height: 4, borderRadius: 999, backgroundColor: '#E2E8F0' }} />
        </div>

        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <div style={{ fontSize: '0.7rem', fontWeight: 800, color: '#64748B', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
              {formatRideCode(ride)}
            </div>
            <h3 style={{ margin: '2px 0 0 0', fontSize: '1.14rem', fontWeight: 900, color: '#0F172A' }}>
              {isWaitingAccept ? 'Cancelar solicitação?' : 'Cancelar esta viagem?'}
            </h3>
          </div>
          <button
            type="button"
            disabled={submitting}
            onClick={onClose}
            aria-label="Fechar"
            style={{
              width: 34,
              height: 34,
              borderRadius: '50%',
              border: 'none',
              backgroundColor: '#F1F5F9',
              color: '#0F172A',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: submitting ? 'not-allowed' : 'pointer',
              flexShrink: 0
            }}
          >
            <X size={17} />
          </button>
        </div>

        <div
          style={{
            marginTop: 12,
            padding: '11px 12px',
            borderRadius: 12,
            backgroundColor: estimatedFee > 0 ? '#FEF2F2' : '#F0FDF4',
            border: `1px solid ${estimatedFee > 0 ? '#FECACA' : '#BBF7D0'}`,
            display: 'flex',
            alignItems: 'flex-start',
            gap: 10
          }}
        >
          {estimatedFee > 0 ? (
            <AlertTriangle size={18} color="#DC2626" style={{ flexShrink: 0, marginTop: 1 }} />
          ) : (
            <CheckCircle2 size={18} color="#16A34A" style={{ flexShrink: 0, marginTop: 1 }} />
          )}
          <div style={{ fontSize: '0.78rem', lineHeight: 1.4, color: estimatedFee > 0 ? '#991B1B' : '#166534', fontWeight: 600 }}>
            {isWaitingAccept ? (
              ride.status === 'aguardando_pagamento' ? (
                <span>
                  Nenhum motorista aceitou ainda. O cancelamento é <strong>gratuito (R$ 0,00)</strong> e a cobrança PIX pendente será encerrada.
                </span>
              ) : (
                <span>
                  Nenhum motorista aceitou sua solicitação ainda. Cancelamento <strong>gratuito (R$ 0,00)</strong>, com estorno/liberação automática se houver pré-reserva.
                </span>
              )
            ) : estimatedFee > 0 ? (
              <span>
                O motorista {ride.driverName || 'designado'} já está atendendo seu chamado. Ao cancelar agora será cobrada a taxa de cancelamento de{' '}
                <strong>R$ {estimatedFee.toFixed(2).replace('.', ',')}</strong>.
              </span>
            ) : (
              <span>
                Você pode cancelar a viagem com {ride.driverName || 'o motorista'} agora sem taxa de cancelamento (<strong>R$ 0,00</strong>).
              </span>
            )}
          </div>
        </div>

        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: '0.74rem', fontWeight: 800, color: '#475569', marginBottom: 8 }}>
            Motivo do cancelamento (opcional)
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {reasons.map((reason) => {
              const active = selectedReason === reason;
              return (
                <button
                  key={reason}
                  type="button"
                  disabled={submitting}
                  onClick={() => setSelectedReason(active ? '' : reason)}
                  style={{
                    width: '100%',
                    textAlign: 'left',
                    padding: '10px 12px',
                    borderRadius: 11,
                    border: active ? '1.5px solid #111111' : '1px solid #E2E8F0',
                    backgroundColor: active ? '#F8FAFC' : '#FFFFFF',
                    color: '#0F172A',
                    fontSize: '0.82rem',
                    fontWeight: active ? 800 : 600,
                    cursor: submitting ? 'not-allowed' : 'pointer'
                  }}
                >
                  {reason}
                </button>
              );
            })}
          </div>
        </div>

        {errorMsg && (
          <div
            style={{
              marginTop: 12,
              padding: '9px 11px',
              borderRadius: 10,
              backgroundColor: '#FEF2F2',
              border: '1px solid #FECACA',
              color: '#B91C1C',
              fontSize: '0.78rem',
              fontWeight: 700
            }}
          >
            {errorMsg}
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 16 }}>
          <button
            type="button"
            disabled={submitting || !canCancel}
            onClick={handleConfirmCancel}
            style={{
              width: '100%',
              height: 46,
              borderRadius: 12,
              border: 'none',
              backgroundColor: '#DC2626',
              color: '#FFFFFF',
              fontSize: '0.9rem',
              fontWeight: 800,
              cursor: submitting || !canCancel ? 'not-allowed' : 'pointer',
              opacity: submitting || !canCancel ? 0.7 : 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8
            }}
          >
            {submitting && <RefreshCw size={16} className="animate-spin" />}
            <span>
              {submitting
                ? 'Cancelando...'
                : isWaitingAccept
                  ? 'Sim, cancelar solicitação'
                  : 'Sim, cancelar viagem'}
            </span>
          </button>

          <button
            type="button"
            disabled={submitting}
            onClick={onClose}
            style={{
              width: '100%',
              height: 44,
              borderRadius: 12,
              border: 'none',
              backgroundColor: '#F1F5F9',
              color: '#0F172A',
              fontSize: '0.88rem',
              fontWeight: 800,
              cursor: submitting ? 'not-allowed' : 'pointer'
            }}
          >
            Voltar
          </button>
        </div>
      </div>
    </div>
  );
};

export const RideCancelModal: React.FC<RideCancelModalProps> = ({
  isOpen,
  ride,
  config,
  onClose,
  onCancelled
}) => {
  if (!isOpen || !ride) return null;

  const modalContent = (
    <RideCancelModalBody
      key={ride.id}
      ride={ride}
      config={config}
      onClose={onClose}
      onCancelled={onCancelled}
    />
  );

  if (typeof document !== 'undefined') {
    return createPortal(modalContent, document.body);
  }
  return modalContent;
};
