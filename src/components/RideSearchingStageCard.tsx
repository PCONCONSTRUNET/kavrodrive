import React, { useEffect, useState } from 'react';
import { Check, Radio } from 'lucide-react';
import { RideStatus } from '../types';

interface RideSearchingStageCardProps {
  status: RideStatus;
  onlineDriversCount?: number;
  driverName?: string | null;
  isQueued?: boolean;
  compact?: boolean;
}

/** Barra e etapas animadas estilo Uber para busca de motorista e acompanhamento em tempo real */
export const RideSearchingStageCard: React.FC<RideSearchingStageCardProps> = ({
  status,
  onlineDriversCount = 0,
  driverName,
  isQueued = false,
  compact = false,
}) => {
  const isSearching = status === 'aguardando_confirmacao';
  const [elapsedSec, setElapsedSec] = useState(0);

  useEffect(() => {
    if (!isSearching) {
      setElapsedSec(0);
      return;
    }
    setElapsedSec(0);
    const timer = setInterval(() => {
      setElapsedSec(prev => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [isSearching]);

  if (status === 'finalizada' || status === 'cancelada' || status === 'aguardando_pagamento') {
    return null;
  }

  const phases = [
    'Conectando você ao motorista mais próximo...',
    onlineDriversCount > 0
      ? `Enviando seu chamado para ${onlineDriversCount} motorista(s) na região...`
      : 'Localizando motoristas disponíveis na sua região...',
    'Espere um pouco, escolhendo a rota mais rápida...',
    'Aguardando motorista confirmar sua viagem...',
    'Ampliando a busca na região — só mais um instante...'
  ];

  const phaseIdx = elapsedSec >= 16
    ? 4
    : Math.floor((elapsedSec / 4) % 4);

  const mins = Math.floor(elapsedSec / 60);
  const secs = elapsedSec % 60;
  const elapsedLabel = `${mins}:${String(secs).padStart(2, '0')}`;

  const stageStep = isSearching
    ? 2
    : isQueued || status === 'confirmada' || status === 'a_caminho' || status === 'no_local' || status === 'em_andamento'
      ? 3
      : 1;

  const statusHelper = isSearching
    ? phases[phaseIdx]
    : status === 'no_local'
      ? `${driverName || 'Seu motorista'} já está aguardando no embarque.`
      : status === 'em_andamento'
        ? 'Viagem em andamento com monitoramento em tempo real.'
        : isQueued
          ? `${driverName || 'Motorista'} aceitou sua corrida e finalizará o trajeto anterior.`
          : `${driverName || 'Seu motorista'} está se deslocando até você.`;

  return (
    <div style={{ marginTop: compact ? 8 : 10, marginBottom: compact ? 8 : 14 }}>
      {/* Barra deslizante de varredura estilo Uber / progressão ativa */}
      {isSearching ? (
        <div className="kavro-radar-track" aria-hidden="true">
          <div className="kavro-radar-beam" />
        </div>
      ) : (
        <div style={{
          width: '100%',
          height: 4,
          borderRadius: 999,
          backgroundColor: '#E2E8F0',
          overflow: 'hidden'
        }}>
          <div style={{
            width: status === 'em_andamento' ? '100%' : status === 'no_local' ? '85%' : '68%',
            height: '100%',
            borderRadius: 999,
            background: 'linear-gradient(90deg, #16A34A 0%, #76D800 100%)',
            transition: 'width 0.5s ease'
          }} />
        </div>
      )}

      {/* Frase dinâmica estilo Uber + tempo decorrido */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 8,
        marginTop: 8
      }}>
        <div
          key={isSearching ? `phase-${phaseIdx}` : status}
          className="kavro-text-swap"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            fontSize: '0.78rem',
            fontWeight: 600,
            color: isSearching ? '#1D4ED8' : '#15803D',
            minWidth: 0
          }}
        >
          {isSearching && (
            <span style={{
              width: 22,
              height: 22,
              borderRadius: '50%',
              backgroundColor: '#DBEAFE',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0
            }} className="kavro-beacon-amber">
              <Radio size={13} color="#276EF1" />
            </span>
          )}
          <span style={{ lineHeight: 1.3 }}>{statusHelper}</span>
        </div>

        {isSearching && (
          <span style={{
            fontSize: '0.7rem',
            fontWeight: 800,
            color: '#475569',
            backgroundColor: '#F1F5F9',
            padding: '2px 8px',
            borderRadius: 999,
            fontVariantNumeric: 'tabular-nums',
            flexShrink: 0
          }}>
            {elapsedLabel}
          </span>
        )}
      </div>

      {/* Etapas animadas estilo Uber (ocultas no modo compacto para manter o bottom sheet enxuto) */}
      {!compact && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
          gap: 6,
          marginTop: 10
        }}>
          {[
            { step: 1, label: 'Solicitada' },
            { step: 2, label: isSearching ? 'Buscando' : 'Aceita' },
            { step: 3, label: status === 'em_andamento' ? 'Em viagem' : status === 'no_local' ? 'No local' : 'A caminho' }
          ].map((item) => {
            const isDone = stageStep > item.step || (!isSearching && item.step === 2);
            const isActive = stageStep === item.step && (isSearching || item.step === 3);

            return (
              <div
                key={item.step}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 5,
                  padding: '6px 6px',
                  borderRadius: 10,
                  backgroundColor: isDone
                    ? '#F0FDF4'
                    : isActive
                      ? (isSearching ? '#EFF6FF' : '#F0FDF4')
                      : '#F8FAFC',
                  border: isDone
                    ? '1px solid #BBF7D0'
                    : isActive
                      ? (isSearching ? '1px solid #93C5FD' : '1px solid #86EFAC')
                      : '1px solid #E2E8F0',
                  fontSize: '0.68rem',
                  fontWeight: isDone || isActive ? 800 : 600,
                  color: isDone
                    ? '#15803D'
                    : isActive
                      ? (isSearching ? '#1D4ED8' : '#15803D')
                      : '#94A3B8',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden'
                }}
              >
                {isDone ? (
                  <Check size={12} color="#16A34A" strokeWidth={3} style={{ flexShrink: 0 }} />
                ) : isActive ? (
                  <span
                    className={isSearching ? 'kavro-beacon-amber' : 'kavro-beacon-green'}
                    style={{
                      width: 7,
                      height: 7,
                      borderRadius: '50%',
                      backgroundColor: isSearching ? '#2563EB' : '#16A34A',
                      flexShrink: 0
                    }}
                  />
                ) : (
                  <span style={{
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    backgroundColor: '#CBD5E1',
                    flexShrink: 0
                  }} />
                )}
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.label}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
