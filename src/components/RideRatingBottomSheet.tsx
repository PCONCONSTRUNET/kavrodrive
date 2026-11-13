import React, { useEffect, useState } from 'react';
import { CheckCircle2, Heart, ShieldCheck, Star, X } from 'lucide-react';
import { Ride } from '../types';
import { StorageService } from '../services/storage';

interface RideRatingBottomSheetProps {
  isOpen: boolean;
  ride: Ride | null;
  raterRole: 'cliente' | 'motorista';
  onClose: () => void;
  onSubmitted?: (result: { stars: number; comment: string; tags: string[]; tipAmount: number }) => void;
}

const PASSENGER_TAGS_HIGH = [
  'Direção segura',
  'Carro impecável',
  'Muito simpático',
  'Ótima rota',
  'Ar-condicionado top'
];

const PASSENGER_TAGS_LOW = [
  'Direção brusca',
  'Limpeza do veículo',
  'Rota ruim',
  'Comportamento',
  'Ar desligado'
];

const DRIVER_TAGS_HIGH = [
  'Pontual no embarque',
  'Muito educado',
  'Ótima conversa',
  'Cuidou do veículo'
];

const DRIVER_TAGS_LOW = [
  'Demorou no embarque',
  'Local difícil de parar',
  'Desrespeitoso',
  'Sujeira / bateu a porta'
];

const STAR_LABELS: Record<number, string> = {
  5: 'Excelente!',
  4: 'Muito boa',
  3: 'Razoável',
  2: 'Abaixo do esperado',
  1: 'Ruim'
};

const TIP_OPTIONS = [0, 2, 5, 10];

export const RideRatingBottomSheet: React.FC<RideRatingBottomSheetProps> = ({
  isOpen,
  ride,
  raterRole,
  onClose,
  onSubmitted
}) => {
  const [stars, setStars] = useState<number>(5);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [comment, setComment] = useState<string>('');
  const [tipAmount, setTipAmount] = useState<number>(0);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [submittedDone, setSubmittedDone] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string>('');

  useEffect(() => {
    if (isOpen && ride?.id) {
      setStars(5);
      setSelectedTags([]);
      setComment('');
      setTipAmount(0);
      setIsSubmitting(false);
      setSubmittedDone(false);
      setErrorMsg('');
    }
  }, [isOpen, ride?.id]);

  if (!isOpen || !ride) return null;

  const isClient = raterRole === 'cliente';
  const tagsPool = isClient
    ? stars >= 5
      ? PASSENGER_TAGS_HIGH
      : PASSENGER_TAGS_LOW
    : stars >= 5
      ? DRIVER_TAGS_HIGH
      : DRIVER_TAGS_LOW;

  const targetName = isClient
    ? ride.driverName || 'seu motorista'
    : ride.clientName || 'o passageiro';

  const handleSelectStars = (value: number) => {
    const prevWasHigh = stars >= 5;
    const nextIsHigh = value >= 5;
    setStars(value);
    if (prevWasHigh !== nextIsHigh) {
      setSelectedTags([]);
    }
  };

  const toggleTag = (tag: string) => {
    setSelectedTags(prev =>
      prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
    );
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    setErrorMsg('');
    try {
      const res = await fetch(`/api/rides/${encodeURIComponent(ride.id)}/rate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...StorageService.getAuthHeaders()
        },
        body: JSON.stringify({
          raterRole,
          stars,
          tags: selectedTags,
          comment: comment.trim(),
          tipAmount: isClient ? tipAmount : 0
        })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.ok === false) {
        setErrorMsg(data?.error || 'Não foi possível enviar sua avaliação.');
        setIsSubmitting(false);
        return;
      }

      setSubmittedDone(true);
      await StorageService.syncFromDatabase().catch(() => {});
      setTimeout(() => {
        onSubmitted?.({
          stars,
          comment: comment.trim(),
          tags: selectedTags,
          tipAmount: isClient ? tipAmount : 0
        });
        onClose();
      }, 950);
    } catch {
      setErrorMsg('Falha de conexão ao enviar avaliação. Tente novamente.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      onClick={() => !isSubmitting && onClose()}
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.58)',
        backdropFilter: 'blur(3px)',
        zIndex: 100030,
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
        padding: 0
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 500,
          backgroundColor: '#FFFFFF',
          color: '#111111',
          borderRadius: '28px 28px 0 0',
          padding: '12px 20px calc(28px + env(safe-area-inset-bottom, 0px)) 20px',
          boxShadow: '0 -14px 40px rgba(0, 0, 0, 0.25)',
          borderTop: '1px solid #E5E7EB',
          maxHeight: '88vh',
          overflowY: 'auto',
          boxSizing: 'border-box'
        }}
      >
        {/* Puxador superior */}
        <div style={{
          width: 42,
          height: 4,
          borderRadius: 999,
          backgroundColor: '#CBD5E1',
          margin: '0 auto 14px auto'
        }} />

        {submittedDone ? (
          <div style={{ textAlign: 'center', padding: '24px 8px' }}>
            <div style={{
              width: 58,
              height: 58,
              borderRadius: '50%',
              backgroundColor: '#DCFCE7',
              color: '#15803D',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 12px auto'
            }}>
              <CheckCircle2 size={32} />
            </div>
            <div style={{ fontSize: '1.12rem', fontWeight: 900, color: '#111111' }}>
              Avaliação enviada!
            </div>
            <div style={{ fontSize: '0.82rem', color: '#6B7280', marginTop: 4 }}>
              {isClient && tipAmount > 0
                ? `Obrigado por avaliar e enviar R$ ${tipAmount},00 de gorjeta.`
                : 'Obrigado por ajudar a manter a comunidade Kavro Drive segura.'}
            </div>
          </div>
        ) : (
          <>
            {/* Cabeçalho */}
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, marginBottom: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 11, minWidth: 0 }}>
                <div style={{
                  width: 48,
                  height: 48,
                  borderRadius: '50%',
                  backgroundColor: '#111111',
                  color: '#FFFFFF',
                  overflow: 'hidden',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '1.1rem',
                  fontWeight: 900,
                  flexShrink: 0,
                  border: '2px solid #E5E7EB'
                }}>
                  {isClient && ride.driverPhoto ? (
                    <img src={ride.driverPhoto} alt={targetName} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    targetName.charAt(0).toUpperCase()
                  )}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: '0.72rem', fontWeight: 800, color: '#15803D', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    Viagem finalizada • R$ {(ride.totalPrice || 0).toFixed(2).replace('.', ',')}
                  </div>
                  <div style={{ fontSize: '1.05rem', fontWeight: 900, color: '#111111', letterSpacing: '-0.02em', lineHeight: 1.25 }}>
                    {isClient ? `Avalie ${targetName}` : `Avalie ${targetName}`}
                  </div>
                  {isClient && (ride.driverVehicle || ride.driverPlate) && (
                    <div style={{ fontSize: '0.74rem', color: '#6B7280', marginTop: 1 }}>
                      {ride.driverVehicle || 'Veículo parceiro'}{ride.driverPlate ? ` • ${ride.driverPlate}` : ''}
                    </div>
                  )}
                </div>
              </div>

              <button
                type="button"
                disabled={isSubmitting}
                onClick={onClose}
                aria-label="Avaliar depois"
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: '50%',
                  border: 'none',
                  backgroundColor: '#F3F4F6',
                  color: '#111111',
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

            {/* Seletor 5 Estrelas */}
            <div style={{
              backgroundColor: '#F8FAFC',
              borderRadius: 16,
              padding: '14px 12px',
              border: '1px solid #E2E8F0',
              textAlign: 'center',
              marginBottom: 14
            }}>
              <div style={{ display: 'flex', justifyContent: 'center', gap: 10, marginBottom: 6 }}>
                {[1, 2, 3, 4, 5].map((value) => {
                  const active = value <= stars;
                  return (
                    <button
                      key={value}
                      type="button"
                      onClick={() => handleSelectStars(value)}
                      style={{
                        background: 'none',
                        border: 'none',
                        padding: 4,
                        cursor: 'pointer',
                        transform: active ? 'scale(1.06)' : 'scale(1)',
                        transition: 'transform 0.12s ease'
                      }}
                    >
                      <Star
                        size={34}
                        fill={active ? '#F59E0B' : 'none'}
                        color={active ? '#F59E0B' : '#CBD5E1'}
                        strokeWidth={2}
                      />
                    </button>
                  );
                })}
              </div>
              <div style={{ fontSize: '0.86rem', fontWeight: 800, color: '#111111' }}>
                {stars}.0 ★ — {STAR_LABELS[stars]}
              </div>
            </div>

            {/* Tags Rápidas estilo Uber */}
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: '0.76rem', fontWeight: 800, color: '#374151', marginBottom: 8 }}>
                {stars >= 5 ? 'O que foi ótimo?' : 'O que poderia ser melhor?'}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                {tagsPool.map((tag) => {
                  const selected = selectedTags.includes(tag);
                  return (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => toggleTag(tag)}
                      style={{
                        padding: '7px 12px',
                        borderRadius: 999,
                        border: selected ? '1.5px solid #111111' : '1px solid #E5E7EB',
                        backgroundColor: selected ? '#111111' : '#FFFFFF',
                        color: selected ? '#FFFFFF' : '#374151',
                        fontSize: '0.75rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                        transition: 'all 0.12s ease'
                      }}
                    >
                      {tag}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Gorjeta Opcional para o Motorista (100% repassada) */}
            {isClient && (
              <div style={{
                marginBottom: 14,
                padding: 12,
                borderRadius: 14,
                backgroundColor: '#F0FDF4',
                border: '1px solid #BBF7D0'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.77rem', fontWeight: 800, color: '#15803D', marginBottom: 8 }}>
                  <Heart size={14} fill="#15803D" color="#15803D" />
                  <span>Adicionar gorjeta? (100% vai para o motorista)</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
                  {TIP_OPTIONS.map((amt) => {
                    const selected = tipAmount === amt;
                    return (
                      <button
                        key={amt}
                        type="button"
                        onClick={() => setTipAmount(amt)}
                        style={{
                          height: 36,
                          borderRadius: 10,
                          border: selected ? '1.5px solid #15803D' : '1px solid #D1FAE5',
                          backgroundColor: selected ? '#15803D' : '#FFFFFF',
                          color: selected ? '#FFFFFF' : '#111111',
                          fontSize: '0.76rem',
                          fontWeight: 800,
                          cursor: 'pointer'
                        }}
                      >
                        {amt === 0 ? 'Não' : `R$ ${amt}`}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Comentário opcional */}
            <input
              type="text"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Comentário anônimo opcional..."
              maxLength={220}
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: 11,
                border: '1.5px solid #E5E7EB',
                backgroundColor: '#F9FAFB',
                color: '#111111',
                fontSize: '0.82rem',
                fontWeight: 600,
                boxSizing: 'border-box',
                marginBottom: 10
              }}
            />

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, fontSize: '0.7rem', color: '#6B7280', marginBottom: 12 }}>
              <ShieldCheck size={13} color="#16A34A" />
              <span>Sua avaliação é anônima para {isClient ? 'o motorista' : 'o passageiro'}.</span>
            </div>

            {errorMsg && (
              <div style={{
                marginBottom: 10,
                padding: '8px 10px',
                borderRadius: 9,
                backgroundColor: '#FEF2F2',
                color: '#DC2626',
                fontSize: '0.76rem',
                fontWeight: 700
              }}>
                {errorMsg}
              </div>
            )}

            <button
              type="button"
              disabled={isSubmitting}
              onClick={handleSubmit}
              style={{
                width: '100%',
                height: 48,
                borderRadius: 13,
                border: 'none',
                backgroundColor: '#111111',
                color: '#FFFFFF',
                fontSize: '0.92rem',
                fontWeight: 900,
                cursor: isSubmitting ? 'wait' : 'pointer',
                marginBottom: 8
              }}
            >
              {isSubmitting
                ? 'Enviando avaliação...'
                : isClient && tipAmount > 0
                  ? `Enviar Avaliação + R$ ${tipAmount} Gorjeta`
                  : 'Enviar Avaliação'}
            </button>

            <button
              type="button"
              disabled={isSubmitting}
              onClick={onClose}
              style={{
                width: '100%',
                height: 36,
                borderRadius: 10,
                border: 'none',
                backgroundColor: 'transparent',
                color: '#6B7280',
                fontSize: '0.78rem',
                fontWeight: 700,
                cursor: 'pointer'
              }}
            >
              Avaliar depois
            </button>
          </>
        )}
      </div>
    </div>
  );
};
