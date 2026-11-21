import React, { useEffect, useState } from 'react';
import { Calendar, Check, CheckCircle2, Lock, Power, RefreshCw, AlertCircle } from 'lucide-react';
import { SystemConfig } from '../types';
import { StorageService } from '../services/storage';
import {
  DEFAULT_WITHDRAWAL_WEEKDAYS,
  WEEKDAY_OPTIONS,
  evaluateDriverWithdrawalRule,
  normalizeWithdrawalWeekdays
} from '../utils/withdrawalSchedule';

interface WithdrawalScheduleControlCardProps {
  config: SystemConfig;
  onConfigUpdated?: (nextConfig: SystemConfig) => void;
  /** Controlled mode (usado dentro do form de Taxas Financeiras) */
  controlledEnabled?: boolean;
  controlledWeekdays?: number[];
  onChangeEnabled?: (next: boolean) => void;
  onChangeWeekdays?: (next: number[]) => void;
}

export const WithdrawalScheduleControlCard: React.FC<WithdrawalScheduleControlCardProps> = ({
  config,
  onConfigUpdated,
  controlledEnabled,
  controlledWeekdays,
  onChangeEnabled,
  onChangeWeekdays,
}) => {
  const isControlled = onChangeEnabled !== undefined && onChangeWeekdays !== undefined;

  const [draftEnabled, setDraftEnabled] = useState<boolean>(config.driverWithdrawalEnabled !== false);
  const [draftWeekdays, setDraftWeekdays] = useState<number[]>(() =>
    normalizeWithdrawalWeekdays(config.driverWithdrawalWeekdays)
  );
  const [isSaving, setIsSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  useEffect(() => {
    if (isControlled) return;
    setDraftEnabled(config.driverWithdrawalEnabled !== false);
    setDraftWeekdays(normalizeWithdrawalWeekdays(config.driverWithdrawalWeekdays));
  }, [config.driverWithdrawalEnabled, config.driverWithdrawalWeekdays, isControlled]);

  const effectiveEnabled = isControlled ? (controlledEnabled !== false) : draftEnabled;
  const effectiveWeekdays = isControlled
    ? normalizeWithdrawalWeekdays(controlledWeekdays)
    : draftWeekdays;

  const rulePreview = evaluateDriverWithdrawalRule({
    driverWithdrawalEnabled: effectiveEnabled,
    driverWithdrawalWeekdays: effectiveWeekdays,
  });

  const setNextEnabled = (nextVal: boolean) => {
    setFeedback(null);
    if (isControlled) {
      onChangeEnabled?.(nextVal);
    } else {
      setDraftEnabled(nextVal);
    }
  };

  const setNextWeekdays = (nextDays: number[]) => {
    setFeedback(null);
    const sorted = Array.from(new Set(nextDays.filter(d => Number.isInteger(d) && d >= 0 && d <= 6))).sort((a, b) => a - b);
    if (isControlled) {
      onChangeWeekdays?.(sorted);
    } else {
      setDraftWeekdays(sorted);
    }
  };

  const toggleDay = (dayVal: number) => {
    if (effectiveWeekdays.includes(dayVal)) {
      setNextWeekdays(effectiveWeekdays.filter(d => d !== dayVal));
    } else {
      setNextWeekdays([...effectiveWeekdays, dayVal]);
    }
  };

  const handleStandaloneSave = async () => {
    setIsSaving(true);
    setFeedback(null);
    const latest = StorageService.getConfig();
    const nextConfig: SystemConfig = {
      ...latest,
      ...config,
      driverWithdrawalEnabled: effectiveEnabled,
      driverWithdrawalWeekdays: effectiveWeekdays,
    };
    const ok = await StorageService.saveConfig(nextConfig);
    setIsSaving(false);
    if (!ok) {
      setFeedback({ type: 'err', text: 'Não foi possível salvar a programação de saque no servidor.' });
      return;
    }
    onConfigUpdated?.(nextConfig);
    setFeedback({
      type: 'ok',
      text: effectiveEnabled
        ? `Salvo! Botão de saque ativo • Regra atual: ${rulePreview.daysText}.`
        : 'Salvo! Botão de saque dos motoristas desabilitado em todo o sistema.',
    });
    setTimeout(() => setFeedback(null), 5000);
  };

  const hasUnsavedStandaloneDiff =
    !isControlled &&
    (effectiveEnabled !== (config.driverWithdrawalEnabled !== false) ||
      JSON.stringify(effectiveWeekdays) !== JSON.stringify(normalizeWithdrawalWeekdays(config.driverWithdrawalWeekdays)));

  return (
    <div
      style={{
        backgroundColor: '#FFFFFF',
        borderRadius: 12,
        border: '1px solid #E2E8F0',
        padding: 18,
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, paddingBottom: 12, borderBottom: '1px solid #F1F5F9' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          <div style={{ width: 34, height: 34, borderRadius: 9, backgroundColor: '#F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Calendar size={17} color="#0F172A" />
          </div>
          <div>
            <div style={{ fontSize: '0.9rem', fontWeight: 800, color: '#0F172A' }}>
              Dias de Saque &amp; Botão de Saque dos Motoristas
            </div>
            <div style={{ fontSize: '0.73rem', color: '#64748B' }}>
              Defina quais dias da semana o saque PIX fica liberado (padrão: toda Sexta-feira) e habilite/desabilite o botão.
            </div>
          </div>
        </div>

        {/* Toggle Habilitar / Desabilitar Botão de Saque */}
        <button
          type="button"
          onClick={() => setNextEnabled(!effectiveEnabled)}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '8px 14px',
            borderRadius: 999,
            border: `1.5px solid ${effectiveEnabled ? '#86EFAC' : '#FCA5A5'}`,
            backgroundColor: effectiveEnabled ? '#DCFCE7' : '#FEF2F2',
            color: effectiveEnabled ? '#15803D' : '#B91C1C',
            fontSize: '0.78rem',
            fontWeight: 800,
            cursor: 'pointer',
          }}
        >
          {effectiveEnabled ? <Power size={14} /> : <Lock size={14} />}
          <span>{effectiveEnabled ? 'Botão de Saque: HABILITADO' : 'Botão de Saque: DESABILITADO'}</span>
        </button>
      </div>

      {/* Dias da semana permitidos */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#334155' }}>
            Dias da semana liberados para solicitar saque (Horário de Brasília):
          </span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            <button
              type="button"
              onClick={() => setNextWeekdays([...DEFAULT_WITHDRAWAL_WEEKDAYS])}
              style={{
                padding: '4px 10px',
                borderRadius: 999,
                border: '1px solid #CBD5E1',
                backgroundColor: rulePreview.isFridayOnlyDefault ? '#0F172A' : '#F8FAFC',
                color: rulePreview.isFridayOnlyDefault ? '#FFFFFF' : '#334155',
                fontSize: '0.7rem',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Somente Sexta-feira
            </button>
            <button
              type="button"
              onClick={() => setNextWeekdays([1, 2, 3, 4, 5])}
              style={{
                padding: '4px 10px',
                borderRadius: 999,
                border: '1px solid #CBD5E1',
                backgroundColor: JSON.stringify(effectiveWeekdays) === '[1,2,3,4,5]' ? '#0F172A' : '#F8FAFC',
                color: JSON.stringify(effectiveWeekdays) === '[1,2,3,4,5]' ? '#FFFFFF' : '#334155',
                fontSize: '0.7rem',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Seg a Sex
            </button>
            <button
              type="button"
              onClick={() => setNextWeekdays([0, 1, 2, 3, 4, 5, 6])}
              style={{
                padding: '4px 10px',
                borderRadius: 999,
                border: '1px solid #CBD5E1',
                backgroundColor: effectiveWeekdays.length === 7 ? '#0F172A' : '#F8FAFC',
                color: effectiveWeekdays.length === 7 ? '#FFFFFF' : '#334155',
                fontSize: '0.7rem',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Todos os dias
            </button>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(84px, 1fr))', gap: 8 }}>
          {WEEKDAY_OPTIONS.map((day) => {
            const active = effectiveWeekdays.includes(day.value);
            return (
              <button
                key={day.value}
                type="button"
                onClick={() => toggleDay(day.value)}
                style={{
                  padding: '9px 8px',
                  borderRadius: 9,
                  border: active ? '2px solid #0F172A' : '1px solid #CBD5E1',
                  backgroundColor: active ? '#0F172A' : '#FFFFFF',
                  color: active ? '#FFFFFF' : '#475569',
                  fontSize: '0.78rem',
                  fontWeight: 800,
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 2,
                }}
              >
                <span>{day.short}</span>
                <span style={{ fontSize: '0.62rem', opacity: active ? 0.85 : 0.7 }}>
                  {active ? 'Liberado' : 'Bloqueado'}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Resumo ao vivo igual aparece para o Motorista */}
      <div
        style={{
          padding: '10px 12px',
          borderRadius: 9,
          backgroundColor: effectiveEnabled ? '#F8FAFC' : '#FEF2F2',
          border: `1px solid ${effectiveEnabled ? '#E2E8F0' : '#FECACA'}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 10,
          fontSize: '0.77rem',
        }}
      >
        <div>
          <strong style={{ color: '#0F172A' }}>Exibição na Área do Motorista: </strong>
          <span style={{ color: effectiveEnabled ? '#334155' : '#B91C1C', fontWeight: 600 }}>
            {rulePreview.headline}
          </span>
        </div>

        {!isControlled && (
          <button
            type="button"
            onClick={handleStandaloneSave}
            disabled={isSaving}
            style={{
              height: 36,
              padding: '0 14px',
              borderRadius: 8,
              border: 'none',
              backgroundColor: hasUnsavedStandaloneDiff ? '#0F172A' : '#1E293B',
              color: '#FFFFFF',
              fontSize: '0.78rem',
              fontWeight: 700,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              cursor: isSaving ? 'wait' : 'pointer',
              opacity: isSaving ? 0.75 : 1,
            }}
          >
            {isSaving ? <RefreshCw size={14} className="animate-spin" /> : <Check size={14} />}
            <span>{isSaving ? 'Salvando...' : 'Salvar Regra de Saques'}</span>
          </button>
        )}
      </div>

      {feedback && (
        <div
          style={{
            padding: '9px 12px',
            borderRadius: 8,
            backgroundColor: feedback.type === 'ok' ? '#ECFDF5' : '#FEF2F2',
            border: `1px solid ${feedback.type === 'ok' ? '#A7F3D0' : '#FECACA'}`,
            color: feedback.type === 'ok' ? '#065F46' : '#B91C1C',
            fontSize: '0.76rem',
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            gap: 7,
          }}
        >
          {feedback.type === 'ok' ? <CheckCircle2 size={15} /> : <AlertCircle size={15} />}
          <span>{feedback.text}</span>
        </div>
      )}
    </div>
  );
};
