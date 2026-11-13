import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  Banknote,
  Calculator,
  Check,
  CheckCircle2,
  CreditCard,
  Layers,
  Percent,
  QrCode,
  RefreshCw,
  ShieldCheck,
  Wallet
} from 'lucide-react';
import { PaymentMethod, SystemConfig } from '../types';
import { StorageService } from '../services/storage';

interface AdminFinancialFeesTabProps {
  config: SystemConfig;
  onConfigUpdated: (nextConfig: SystemConfig) => void;
  embedded?: boolean;
}

const formatBRL = (val: number) =>
  `R$ ${Number(val || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const clampPct = (raw: string, fallback: number): number => {
  const cleaned = String(raw ?? '').replace(',', '.').replace(/[^\d.]/g, '');
  if (!cleaned) return fallback;
  const n = parseFloat(cleaned);
  if (Number.isNaN(n)) return fallback;
  return Math.min(100, Math.max(0, Math.round(n * 100) / 100));
};

const clampMoney = (raw: string, fallback: number, min = 0): number => {
  const cleaned = String(raw ?? '').replace(',', '.').replace(/[^\d.]/g, '');
  if (!cleaned) return fallback;
  const n = parseFloat(cleaned);
  if (Number.isNaN(n)) return fallback;
  return Math.max(min, Math.round(n * 100) / 100);
};

const ALL_METHODS: PaymentMethod[] = ['pix', 'cartao_credito', 'cartao_debito', 'dinheiro'];

export const AdminFinancialFeesTab: React.FC<AdminFinancialFeesTabProps> = ({
  config,
  onConfigUpdated,
  embedded = false
}) => {
  const baseComm = Number(config.platformCommissionPercent ?? 20);

  const [globalCommStr, setGlobalCommStr] = useState(String(baseComm));
  const [pixCommStr, setPixCommStr] = useState(
    String(config.paymentMethodCommissionPercents?.pix ?? baseComm)
  );
  const [creditCommStr, setCreditCommStr] = useState(
    String(config.paymentMethodCommissionPercents?.cartao_credito ?? baseComm)
  );
  const [debitCommStr, setDebitCommStr] = useState(
    String(config.paymentMethodCommissionPercents?.cartao_debito ?? baseComm)
  );
  const [cashCommStr, setCashCommStr] = useState(
    String(config.paymentMethodCommissionPercents?.dinheiro ?? baseComm)
  );

  const [pixGatewayStr, setPixGatewayStr] = useState(String(config.gatewayFeePercents?.pix ?? 0));
  const [creditGatewayStr, setCreditGatewayStr] = useState(
    String(config.gatewayFeePercents?.cartao_credito ?? 0)
  );
  const [debitGatewayStr, setDebitGatewayStr] = useState(
    String(config.gatewayFeePercents?.cartao_debito ?? 0)
  );

  const [withdrawalFeePercentStr, setWithdrawalFeePercentStr] = useState(
    String(config.withdrawalFeePercent ?? 0)
  );
  const [withdrawalFeeFixedStr, setWithdrawalFeeFixedStr] = useState(
    String(config.withdrawalFeeFixed ?? 0)
  );
  const [minWithdrawalStr, setMinWithdrawalStr] = useState(
    String(config.minWithdrawalAmount ?? 20)
  );
  const [cancellationFeeStr, setCancellationFeeStr] = useState(
    String(config.cancellationFeeAmount ?? 0)
  );
  const [maxDebtLimitStr, setMaxDebtLimitStr] = useState(
    String(config.maxDriverDebtLimit ?? 100)
  );
  const [cardSettlementDaysStr, setCardSettlementDaysStr] = useState(
    String(config.cardSettlementDays ?? 0)
  );

  const [activeMethods, setActiveMethods] = useState<PaymentMethod[]>(() =>
    Array.isArray(config.activePaymentMethods) && config.activePaymentMethods.length > 0
      ? config.activePaymentMethods
      : ALL_METHODS
  );
  const [useCategoryOverride, setUseCategoryOverride] = useState<boolean>(
    Boolean(config.useCategoryCommissionOverride)
  );
  const [autoBlockDelinquent, setAutoBlockDelinquent] = useState<boolean>(
    config.autoBlockDelinquentDrivers !== false
  );
  const [cashDeductFirst, setCashDeductFirst] = useState<boolean>(
    config.cashDeductFromBalanceFirst !== false
  );
  const [autoSplitPix, setAutoSplitPix] = useState<boolean>(
    config.autoSplitPixEnabled !== false
  );

  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveFeedback, setSaveFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  // Simulador ao vivo
  const [simRideAmountStr, setSimRideAmountStr] = useState('50');
  const [simMethod, setSimMethod] = useState<'pix' | 'cartao_credito' | 'cartao_debito' | 'dinheiro'>('pix');
  const [simWithdrawAmountStr, setSimWithdrawAmountStr] = useState('100');

  useEffect(() => {
    if (isDirty) return;
    const base = Number(config.platformCommissionPercent ?? 20);
    setGlobalCommStr(String(base));
    setPixCommStr(String(config.paymentMethodCommissionPercents?.pix ?? base));
    setCreditCommStr(String(config.paymentMethodCommissionPercents?.cartao_credito ?? base));
    setDebitCommStr(String(config.paymentMethodCommissionPercents?.cartao_debito ?? base));
    setCashCommStr(String(config.paymentMethodCommissionPercents?.dinheiro ?? base));
    setPixGatewayStr(String(config.gatewayFeePercents?.pix ?? 0));
    setCreditGatewayStr(String(config.gatewayFeePercents?.cartao_credito ?? 0));
    setDebitGatewayStr(String(config.gatewayFeePercents?.cartao_debito ?? 0));
    setWithdrawalFeePercentStr(String(config.withdrawalFeePercent ?? 0));
    setWithdrawalFeeFixedStr(String(config.withdrawalFeeFixed ?? 0));
    setMinWithdrawalStr(String(config.minWithdrawalAmount ?? 20));
    setCancellationFeeStr(String(config.cancellationFeeAmount ?? 0));
    setMaxDebtLimitStr(String(config.maxDriverDebtLimit ?? 100));
    setCardSettlementDaysStr(String(config.cardSettlementDays ?? 0));
    setActiveMethods(
      Array.isArray(config.activePaymentMethods) && config.activePaymentMethods.length > 0
        ? config.activePaymentMethods
        : ALL_METHODS
    );
    setUseCategoryOverride(Boolean(config.useCategoryCommissionOverride));
    setAutoBlockDelinquent(config.autoBlockDelinquentDrivers !== false);
    setCashDeductFirst(config.cashDeductFromBalanceFirst !== false);
    setAutoSplitPix(config.autoSplitPixEnabled !== false);
  }, [config, isDirty]);

  const markDirty = () => {
    if (!isDirty) setIsDirty(true);
    if (saveFeedback) setSaveFeedback(null);
  };

  const toggleMethodEnabled = (method: PaymentMethod) => {
    markDirty();
    setActiveMethods((prev) => {
      const exists = prev.includes(method);
      if (exists && prev.length <= 1) return prev;
      return exists ? prev.filter((m) => m !== method) : [...prev, method];
    });
  };

  const applyGlobalToAll = () => {
    markDirty();
    const val = String(clampPct(globalCommStr, 20));
    setGlobalCommStr(val);
    setPixCommStr(val);
    setCreditCommStr(val);
    setDebitCommStr(val);
    setCashCommStr(val);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setSaveFeedback(null);

    const parsedGlobal = clampPct(globalCommStr, 20);
    const parsedPix = clampPct(pixCommStr, parsedGlobal);
    const parsedCredit = clampPct(creditCommStr, parsedGlobal);
    const parsedDebit = clampPct(debitCommStr, parsedGlobal);
    const parsedCash = clampPct(cashCommStr, parsedGlobal);

    const parsedPixGw = clampPct(pixGatewayStr, 0);
    const parsedCreditGw = clampPct(creditGatewayStr, 0);
    const parsedDebitGw = clampPct(debitGatewayStr, 0);

    const parsedWdPct = clampPct(withdrawalFeePercentStr, 0);
    const parsedWdFixed = clampMoney(withdrawalFeeFixedStr, 0, 0);
    const parsedMinWd = clampMoney(minWithdrawalStr, 20, 1);
    const parsedCancelFee = clampMoney(cancellationFeeStr, 0, 0);
    const parsedMaxDebt = clampMoney(maxDebtLimitStr, 100, 0);
    const parsedCardDays = Math.min(60, Math.max(0, parseInt(cardSettlementDaysStr.replace(/\D/g, ''), 10) || 0));

    const latestConfig = StorageService.getConfig();
    const nextConfig: SystemConfig = {
      ...latestConfig,
      ...config,
      platformCommissionPercent: parsedGlobal,
      paymentMethodCommissionPercents: {
        pix: parsedPix,
        cartao_credito: parsedCredit,
        cartao_debito: parsedDebit,
        dinheiro: parsedCash
      },
      gatewayFeePercents: {
        pix: parsedPixGw,
        cartao_credito: parsedCreditGw,
        cartao_debito: parsedDebitGw
      },
      withdrawalFeePercent: parsedWdPct,
      withdrawalFeeFixed: parsedWdFixed,
      cancellationFeeAmount: parsedCancelFee,
      minWithdrawalAmount: parsedMinWd,
      maxDriverDebtLimit: parsedMaxDebt,
      cardSettlementDays: parsedCardDays,
      useCategoryCommissionOverride: useCategoryOverride,
      autoBlockDelinquentDrivers: autoBlockDelinquent,
      cashDeductFromBalanceFirst: cashDeductFirst,
      autoSplitPixEnabled: autoSplitPix,
      activePaymentMethods: activeMethods.length > 0 ? activeMethods : ALL_METHODS
    };

    const ok = await StorageService.saveConfig(nextConfig);
    setIsSaving(false);

    if (!ok) {
      setSaveFeedback({
        type: 'err',
        text: 'Erro ao salvar no servidor. Verifique seu login de administrador e tente novamente.'
      });
      return;
    }

    setGlobalCommStr(String(parsedGlobal));
    setPixCommStr(String(parsedPix));
    setCreditCommStr(String(parsedCredit));
    setDebitCommStr(String(parsedDebit));
    setCashCommStr(String(parsedCash));
    setPixGatewayStr(String(parsedPixGw));
    setCreditGatewayStr(String(parsedCreditGw));
    setDebitGatewayStr(String(parsedDebitGw));
    setWithdrawalFeePercentStr(String(parsedWdPct));
    setWithdrawalFeeFixedStr(String(parsedWdFixed));
    setMinWithdrawalStr(String(parsedMinWd));
    setCancellationFeeStr(String(parsedCancelFee));
    setMaxDebtLimitStr(String(parsedMaxDebt));
    setCardSettlementDaysStr(String(parsedCardDays));

    setIsDirty(false);
    onConfigUpdated(nextConfig);
    setSaveFeedback({
      type: 'ok',
      text: 'Taxas financeiras salvas e aplicadas em tempo real em todo o sistema (App Passageiro, Motorista e Backend).'
    });
    setTimeout(() => setSaveFeedback(null), 5000);
  };

  const methodCards: Array<{
    id: 'pix' | 'cartao_credito' | 'cartao_debito' | 'dinheiro';
    title: string;
    subtitle: string;
    accent: string;
    bgAccent: string;
    commStr: string;
    setCommStr: (v: string) => void;
    hasGateway: boolean;
    gwStr?: string;
    setGwStr?: (v: string) => void;
    icon: React.ReactNode;
  }> = [
    {
      id: 'pix',
      title: 'PIX (QR Dinâmico)',
      subtitle: 'Split automático e confirmação imediata via webhook',
      accent: '#15803D',
      bgAccent: '#F0FDF4',
      commStr: pixCommStr,
      setCommStr: setPixCommStr,
      hasGateway: true,
      gwStr: pixGatewayStr,
      setGwStr: setPixGatewayStr,
      icon: <QrCode size={16} color="#15803D" />
    },
    {
      id: 'cartao_credito',
      title: 'Cartão de Crédito',
      subtitle: 'Pré-autorização ao solicitar + captura automática no destino',
      accent: '#1D4ED8',
      bgAccent: '#EFF6FF',
      commStr: creditCommStr,
      setCommStr: setCreditCommStr,
      hasGateway: true,
      gwStr: creditGatewayStr,
      setGwStr: setCreditGatewayStr,
      icon: <CreditCard size={16} color="#1D4ED8" />
    },
    {
      id: 'cartao_debito',
      title: 'Cartão de Débito',
      subtitle: 'Cobrança online segura no app do passageiro',
      accent: '#4338CA',
      bgAccent: '#EEF2FF',
      commStr: debitCommStr,
      setCommStr: setDebitCommStr,
      hasGateway: true,
      gwStr: debitGatewayStr,
      setGwStr: setDebitGatewayStr,
      icon: <CreditCard size={16} color="#4338CA" />
    },
    {
      id: 'dinheiro',
      title: 'Dinheiro (Em Mãos)',
      subtitle: 'Comissão descontada do saldo do motorista (Modelo Uber)',
      accent: '#B45309',
      bgAccent: '#FFFBEB',
      commStr: cashCommStr,
      setCommStr: setCashCommStr,
      hasGateway: false,
      icon: <Banknote size={16} color="#B45309" />
    }
  ];

  // Cálculos do simulador ao vivo
  const globalPctPreview = clampPct(globalCommStr, 20);
  const methodPctMap: Record<'pix' | 'cartao_credito' | 'cartao_debito' | 'dinheiro', number> = {
    pix: clampPct(pixCommStr, globalPctPreview),
    cartao_credito: clampPct(creditCommStr, globalPctPreview),
    cartao_debito: clampPct(debitCommStr, globalPctPreview),
    dinheiro: clampPct(cashCommStr, globalPctPreview)
  };
  const gwPctMap: Record<'pix' | 'cartao_credito' | 'cartao_debito' | 'dinheiro', number> = {
    pix: clampPct(pixGatewayStr, 0),
    cartao_credito: clampPct(creditGatewayStr, 0),
    cartao_debito: clampPct(debitGatewayStr, 0),
    dinheiro: 0
  };

  const simGross = clampMoney(simRideAmountStr, 50, 1);
  const simPct = methodPctMap[simMethod];
  const simPlatformFee = Math.round(((simGross * simPct) / 100) * 100) / 100;
  const simDriverNet = Math.round((simGross - simPlatformFee) * 100) / 100;
  const simGwCost = Math.round(((simGross * gwPctMap[simMethod]) / 100) * 100) / 100;
  const simPlatformNet = Math.round((simPlatformFee - simGwCost) * 100) / 100;

  const simWdGross = clampMoney(simWithdrawAmountStr, 100, 1);
  const wdPct = clampPct(withdrawalFeePercentStr, 0);
  const wdFixed = clampMoney(withdrawalFeeFixedStr, 0, 0);
  const simWdFee = Math.round(Math.min(simWdGross, (simWdGross * (wdPct / 100)) + wdFixed) * 100) / 100;
  const simWdNet = Math.round(Math.max(0, simWdGross - simWdFee) * 100) / 100;

  return (
    <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {/* Cabeçalho Dedicado */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 12,
          paddingBottom: embedded ? 12 : 14,
          borderBottom: '1px solid #E2E8F0'
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <h2
              style={{
                fontSize: embedded ? '1rem' : '1.15rem',
                fontWeight: 800,
                color: '#0F172A',
                margin: 0,
                letterSpacing: '-0.01em'
              }}
            >
              Taxas Financeiras &amp; Regras de Cobrança
            </h2>
            {isDirty && (
              <span
                style={{
                  fontSize: '0.68rem',
                  fontWeight: 700,
                  padding: '2px 8px',
                  borderRadius: 999,
                  backgroundColor: '#FFFBEB',
                  border: '1px solid #FDE68A',
                  color: '#B45309'
                }}
              >
                Alterações não salvas
              </span>
            )}
          </div>
          <p style={{ fontSize: '0.78rem', color: '#64748B', margin: '2px 0 0 0' }}>
            Configure aqui as taxas de PIX, Cartão, Dinheiro, Saque e Gateway. Ao salvar, são aplicadas em todo o sistema.
          </p>
        </div>

        <button
          type="submit"
          disabled={isSaving}
          style={{
            height: 38,
            padding: '0 16px',
            borderRadius: 8,
            border: 'none',
            backgroundColor: '#0F172A',
            color: '#FFFFFF',
            fontWeight: 700,
            fontSize: '0.8rem',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            cursor: isSaving ? 'wait' : 'pointer',
            opacity: isSaving ? 0.75 : 1
          }}
        >
          {isSaving ? <RefreshCw size={14} className="animate-spin" /> : <Check size={15} />}
          <span>{isSaving ? 'Salvando...' : 'Salvar e Aplicar no Sistema'}</span>
        </button>
      </div>

      {saveFeedback && (
        <div
          style={{
            padding: '10px 14px',
            borderRadius: 8,
            backgroundColor: saveFeedback.type === 'ok' ? '#F0FDF4' : '#FEF2F2',
            border: `1px solid ${saveFeedback.type === 'ok' ? '#BBF7D0' : '#FECACA'}`,
            color: saveFeedback.type === 'ok' ? '#15803D' : '#B91C1C',
            fontSize: '0.78rem',
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            gap: 8
          }}
        >
          {saveFeedback.type === 'ok' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
          <span>{saveFeedback.text}</span>
        </div>
      )}

      {/* Barra Global Rápida */}
      <div
        style={{
          backgroundColor: '#FFFFFF',
          borderRadius: 10,
          border: '1px solid #E2E8F0',
          padding: '14px 18px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 12
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div
            style={{
              width: 34,
              height: 34,
              borderRadius: 8,
              backgroundColor: '#F1F5F9',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <Percent size={16} color="#0F172A" />
          </div>
          <div>
            <div style={{ fontSize: '0.86rem', fontWeight: 700, color: '#0F172A' }}>
              Taxa Padrão Global da Plataforma (%)
            </div>
            <div style={{ fontSize: '0.72rem', color: '#64748B' }}>
              Usada como referência padrão caso algum meio de pagamento não tenha taxa específica
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <input
              type="text"
              inputMode="decimal"
              value={globalCommStr}
              onChange={(e) => {
                markDirty();
                setGlobalCommStr(e.target.value.replace(/[^\d.,]/g, ''));
              }}
              style={{
                width: 72,
                height: 36,
                padding: '0 8px',
                borderRadius: 6,
                border: '1px solid #CBD5E1',
                fontSize: '0.86rem',
                fontWeight: 700,
                textAlign: 'center',
                color: '#0F172A'
              }}
            />
            <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#475569' }}>%</span>
          </div>
          <button
            type="button"
            onClick={applyGlobalToAll}
            style={{
              height: 36,
              padding: '0 12px',
              borderRadius: 6,
              border: '1px solid #CBD5E1',
              backgroundColor: '#F8FAFC',
              color: '#0F172A',
              fontSize: '0.74rem',
              fontWeight: 700,
              cursor: 'pointer'
            }}
          >
            Aplicar {globalPctPreview}% em PIX, Cartão e Dinheiro
          </button>
        </div>
      </div>

      {/* BLOCO 1: TAXAS POR MEIO DE PAGAMENTO (PIX, CRÉDITO, DÉBITO, DINHEIRO) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 14 }}>
        {methodCards.map((card) => {
          const isEnabled = activeMethods.includes(card.id);
          const pct = clampPct(card.commStr, globalPctPreview);
          const gwPct = card.hasGateway ? clampPct(card.gwStr || '0', 0) : 0;
          const exFee = Math.round(((50 * pct) / 100) * 100) / 100;
          const exDriver = Math.round((50 - exFee) * 100) / 100;

          return (
            <div
              key={card.id}
              style={{
                backgroundColor: '#FFFFFF',
                borderRadius: 10,
                border: isEnabled ? '1px solid #CBD5E1' : '1px solid #E2E8F0',
                padding: 16,
                opacity: isEnabled ? 1 : 0.7,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                gap: 12
              }}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                    <div
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: 8,
                        backgroundColor: card.bgAccent,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0
                      }}
                    >
                      {card.icon}
                    </div>
                    <div>
                      <div style={{ fontSize: '0.84rem', fontWeight: 700, color: '#0F172A' }}>{card.title}</div>
                      <div style={{ fontSize: '0.68rem', color: '#64748B', marginTop: 1 }}>{card.subtitle}</div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => toggleMethodEnabled(card.id)}
                    style={{
                      padding: '4px 10px',
                      borderRadius: 999,
                      border: 'none',
                      backgroundColor: isEnabled ? '#DCFCE7' : '#E2E8F0',
                      color: isEnabled ? '#15803D' : '#475569',
                      fontSize: '0.68rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                      flexShrink: 0
                    }}
                  >
                    {isEnabled ? 'Ativo' : 'Desativado'}
                  </button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 14 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <label style={{ fontSize: '0.73rem', fontWeight: 600, color: '#334155' }}>
                      Comissão Plataforma (%):
                    </label>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={card.commStr}
                        onChange={(e) => {
                          markDirty();
                          card.setCommStr(e.target.value.replace(/[^\d.,]/g, ''));
                        }}
                        style={{
                          width: 68,
                          height: 32,
                          padding: '0 8px',
                          borderRadius: 6,
                          border: '1px solid #CBD5E1',
                          fontSize: '0.84rem',
                          fontWeight: 700,
                          textAlign: 'center',
                          color: '#0F172A'
                        }}
                      />
                      <span style={{ fontSize: '0.76rem', fontWeight: 700, color: '#475569' }}>%</span>
                    </div>
                  </div>

                  {card.hasGateway && card.setGwStr && (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                      <label style={{ fontSize: '0.72rem', fontWeight: 600, color: '#64748B' }}>
                        Taxa Gateway / Maquininha (%):
                      </label>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        <input
                          type="text"
                          inputMode="decimal"
                          value={card.gwStr}
                          onChange={(e) => {
                            markDirty();
                            card.setGwStr?.(e.target.value.replace(/[^\d.,]/g, ''));
                          }}
                          style={{
                            width: 68,
                            height: 30,
                            padding: '0 8px',
                            borderRadius: 6,
                            border: '1px solid #CBD5E1',
                            fontSize: '0.8rem',
                            fontWeight: 600,
                            textAlign: 'center',
                            color: '#334155'
                          }}
                        />
                        <span style={{ fontSize: '0.74rem', fontWeight: 600, color: '#64748B' }}>%</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div
                style={{
                  padding: '8px 10px',
                  borderRadius: 7,
                  backgroundColor: '#F8FAFC',
                  border: '1px solid #E2E8F0',
                  fontSize: '0.7rem',
                  color: '#475569',
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: 6,
                  flexWrap: 'wrap'
                }}
              >
                <span>Em R$ 50:</span>
                <span>
                  Plataforma <strong style={{ color: card.accent }}>{formatBRL(exFee)}</strong> • Motorista{' '}
                  <strong style={{ color: '#0F172A' }}>{formatBRL(exDriver)}</strong>
                  {gwPct > 0 ? ` • GW ${gwPct}%` : ''}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* BLOCO 2: SAQUES, CANCELAMENTO & REGRAS DE CARTEIRA */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 16 }}>
        {/* Taxas de Saque & Cancelamento */}
        <div
          style={{
            backgroundColor: '#FFFFFF',
            borderRadius: 10,
            border: '1px solid #E2E8F0',
            padding: 18,
            display: 'flex',
            flexDirection: 'column',
            gap: 14
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingBottom: 10, borderBottom: '1px solid #F1F5F9' }}>
            <Wallet size={16} color="#0F172A" />
            <div>
              <div style={{ fontSize: '0.88rem', fontWeight: 700, color: '#0F172A' }}>
                Taxas de Repasse (Saque PIX) &amp; Operação
              </div>
              <div style={{ fontSize: '0.71rem', color: '#64748B' }}>
                Aplicadas automaticamente quando o motorista solicita saque no Portal
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 600, color: '#334155', marginBottom: 4 }}>
                Taxa Fixa por Saque PIX (R$)
              </label>
              <input
                type="text"
                inputMode="decimal"
                value={withdrawalFeeFixedStr}
                onChange={(e) => {
                  markDirty();
                  setWithdrawalFeeFixedStr(e.target.value.replace(/[^\d.,]/g, ''));
                }}
                placeholder="0.00"
                style={{
                  width: '100%',
                  height: 36,
                  padding: '0 10px',
                  borderRadius: 6,
                  border: '1px solid #CBD5E1',
                  fontSize: '0.84rem',
                  fontWeight: 600,
                  color: '#0F172A'
                }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 600, color: '#334155', marginBottom: 4 }}>
                Taxa Percentual no Saque (%)
              </label>
              <input
                type="text"
                inputMode="decimal"
                value={withdrawalFeePercentStr}
                onChange={(e) => {
                  markDirty();
                  setWithdrawalFeePercentStr(e.target.value.replace(/[^\d.,]/g, ''));
                }}
                placeholder="0"
                style={{
                  width: '100%',
                  height: 36,
                  padding: '0 10px',
                  borderRadius: 6,
                  border: '1px solid #CBD5E1',
                  fontSize: '0.84rem',
                  fontWeight: 600,
                  color: '#0F172A'
                }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 600, color: '#334155', marginBottom: 4 }}>
                Valor Mínimo p/ Saque PIX (R$)
              </label>
              <input
                type="text"
                inputMode="decimal"
                value={minWithdrawalStr}
                onChange={(e) => {
                  markDirty();
                  setMinWithdrawalStr(e.target.value.replace(/[^\d.,]/g, ''));
                }}
                style={{
                  width: '100%',
                  height: 36,
                  padding: '0 10px',
                  borderRadius: 6,
                  border: '1px solid #CBD5E1',
                  fontSize: '0.84rem',
                  fontWeight: 600,
                  color: '#0F172A'
                }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 600, color: '#334155', marginBottom: 4 }}>
                Taxa de Cancelamento (R$)
              </label>
              <input
                type="text"
                inputMode="decimal"
                value={cancellationFeeStr}
                onChange={(e) => {
                  markDirty();
                  setCancellationFeeStr(e.target.value.replace(/[^\d.,]/g, ''));
                }}
                placeholder="0.00"
                style={{
                  width: '100%',
                  height: 36,
                  padding: '0 10px',
                  borderRadius: 6,
                  border: '1px solid #CBD5E1',
                  fontSize: '0.84rem',
                  fontWeight: 600,
                  color: '#0F172A'
                }}
              />
            </div>
          </div>

          <label
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 8,
              padding: '10px 12px',
              borderRadius: 8,
              backgroundColor: '#F8FAFC',
              border: '1px solid #E2E8F0',
              fontSize: '0.75rem',
              color: '#334155',
              cursor: 'pointer'
            }}
          >
            <input
              type="checkbox"
              checked={useCategoryOverride}
              onChange={(e) => {
                markDirty();
                setUseCategoryOverride(e.target.checked);
              }}
              style={{ width: 15, height: 15, marginTop: 2, accentColor: '#0F172A' }}
            />
            <span>
              <strong>Priorizar taxa individual da categoria</strong> (GO, PLUS, EXEC) acima da taxa por meio de pagamento quando configurada.
            </span>
          </label>
        </div>

        {/* Regras de Dinheiro (Modelo Uber), Dívida & Cartão */}
        <div
          style={{
            backgroundColor: '#FFFFFF',
            borderRadius: 10,
            border: '1px solid #E2E8F0',
            padding: 18,
            display: 'flex',
            flexDirection: 'column',
            gap: 14
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingBottom: 10, borderBottom: '1px solid #F1F5F9' }}>
            <ShieldCheck size={16} color="#0F172A" />
            <div>
              <div style={{ fontSize: '0.88rem', fontWeight: 700, color: '#0F172A' }}>
                Inadimplência (Dinheiro), Cartão &amp; Compensação
              </div>
              <div style={{ fontSize: '0.71rem', color: '#64748B' }}>
                Controle de teto devedor, prazo D+X de cartão e split automático
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 600, color: '#334155', marginBottom: 4 }}>
                Teto Máximo de Dívida em Dinheiro (R$)
              </label>
              <input
                type="text"
                inputMode="decimal"
                value={maxDebtLimitStr}
                onChange={(e) => {
                  markDirty();
                  setMaxDebtLimitStr(e.target.value.replace(/[^\d.,]/g, ''));
                }}
                style={{
                  width: '100%',
                  height: 36,
                  padding: '0 10px',
                  borderRadius: 6,
                  border: '1px solid #CBD5E1',
                  fontSize: '0.84rem',
                  fontWeight: 600,
                  color: '#0F172A'
                }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 600, color: '#334155', marginBottom: 4 }}>
                Liberação do Cartão (Dias • 0 = Imediato)
              </label>
              <input
                type="text"
                inputMode="numeric"
                value={cardSettlementDaysStr}
                onChange={(e) => {
                  markDirty();
                  setCardSettlementDaysStr(e.target.value.replace(/\D/g, '').slice(0, 2));
                }}
                style={{
                  width: '100%',
                  height: 36,
                  padding: '0 10px',
                  borderRadius: 6,
                  border: '1px solid #CBD5E1',
                  fontSize: '0.84rem',
                  fontWeight: 600,
                  color: '#0F172A'
                }}
              />
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.75rem', color: '#334155', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={autoBlockDelinquent}
                onChange={(e) => {
                  markDirty();
                  setAutoBlockDelinquent(e.target.checked);
                }}
                style={{ width: 15, height: 15, accentColor: '#0F172A' }}
              />
              <span>Bloquear novas corridas automaticamente ao atingir o limite de dívida</span>
            </label>

            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.75rem', color: '#334155', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={cashDeductFirst}
                onChange={(e) => {
                  markDirty();
                  setCashDeductFirst(e.target.checked);
                }}
                style={{ width: 15, height: 15, accentColor: '#0F172A' }}
              />
              <span>Modelo Uber: descontar taxa em dinheiro do Saldo Livre antes de gerar dívida</span>
            </label>

            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.75rem', color: '#334155', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={autoSplitPix}
                onChange={(e) => {
                  markDirty();
                  setAutoSplitPix(e.target.checked);
                }}
                style={{ width: 15, height: 15, accentColor: '#0F172A' }}
              />
              <span>Split automático no gateway PIX (separação instantânea plataforma x motorista)</span>
            </label>
          </div>
        </div>
      </div>

      {/* BLOCO 3: SIMULADOR FINANCEIRO EM TEMPO REAL */}
      <div
        style={{
          backgroundColor: '#FFFFFF',
          borderRadius: 10,
          border: '1px solid #E2E8F0',
          padding: 18
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Calculator size={16} color="#0F172A" />
            <div>
              <div style={{ fontSize: '0.88rem', fontWeight: 700, color: '#0F172A' }}>
                Simulador ao Vivo das Taxas Configuradas
              </div>
              <div style={{ fontSize: '0.71rem', color: '#64748B' }}>
                Veja exatamente quanto entra no caixa, quanto custa o gateway e quanto o motorista recebe
              </div>
            </div>
          </div>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              fontSize: '0.7rem',
              fontWeight: 700,
              padding: '4px 9px',
              borderRadius: 999,
              backgroundColor: '#F1F5F9',
              color: '#334155'
            }}
          >
            <Layers size={12} />
            Prioridade atual: {useCategoryOverride ? 'Categoria > Meio de Pagamento' : 'Meio de Pagamento > Global'}
          </span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(290px, 1fr))', gap: 14 }}>
          {/* Simulação de Corrida */}
          <div style={{ padding: 14, borderRadius: 8, backgroundColor: '#F8FAFC', border: '1px solid #E2E8F0' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
              <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#0F172A' }}>Simulação de Corrida</span>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <input
                  type="text"
                  inputMode="decimal"
                  value={simRideAmountStr}
                  onChange={(e) => setSimRideAmountStr(e.target.value.replace(/[^\d.,]/g, ''))}
                  style={{ width: 72, height: 28, padding: '0 8px', borderRadius: 6, border: '1px solid #CBD5E1', fontSize: '0.76rem', fontWeight: 700 }}
                />
                <select
                  value={simMethod}
                  onChange={(e) => setSimMethod(e.target.value as any)}
                  style={{ height: 28, padding: '0 8px', borderRadius: 6, border: '1px solid #CBD5E1', fontSize: '0.74rem', fontWeight: 600 }}
                >
                  <option value="pix">PIX ({methodPctMap.pix}%)</option>
                  <option value="cartao_credito">Crédito ({methodPctMap.cartao_credito}%)</option>
                  <option value="cartao_debito">Débito ({methodPctMap.cartao_debito}%)</option>
                  <option value="dinheiro">Dinheiro ({methodPctMap.dinheiro}%)</option>
                </select>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: '0.76rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: '#475569' }}>
                <span>Pago pelo passageiro:</span>
                <strong style={{ color: '#0F172A' }}>{formatBRL(simGross)}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: '#15803D' }}>
                <span>Comissão Kavro ({simPct}%):</span>
                <strong>{formatBRL(simPlatformFee)}</strong>
              </div>
              {simGwCost > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', color: '#B45309' }}>
                  <span>Custo Gateway ({gwPctMap[simMethod]}%):</span>
                  <strong>- {formatBRL(simGwCost)} (Líq. Kavro: {formatBRL(simPlatformNet)})</strong>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #E2E8F0', paddingTop: 6, marginTop: 2, color: '#0F172A' }}>
                <span>{simMethod === 'dinheiro' ? 'Débito na carteira do motorista:' : 'Crédito na carteira do motorista:'}</span>
                <strong style={{ color: simMethod === 'dinheiro' ? '#DC2626' : '#15803D' }}>
                  {simMethod === 'dinheiro' ? `- ${formatBRL(simPlatformFee)}` : formatBRL(simDriverNet)}
                </strong>
              </div>
            </div>
          </div>

          {/* Simulação de Saque PIX */}
          <div style={{ padding: 14, borderRadius: 8, backgroundColor: '#F8FAFC', border: '1px solid #E2E8F0' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 10 }}>
              <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#0F172A' }}>Simulação de Saque PIX</span>
              <input
                type="text"
                inputMode="decimal"
                value={simWithdrawAmountStr}
                onChange={(e) => setSimWithdrawAmountStr(e.target.value.replace(/[^\d.,]/g, ''))}
                style={{ width: 84, height: 28, padding: '0 8px', borderRadius: 6, border: '1px solid #CBD5E1', fontSize: '0.76rem', fontWeight: 700 }}
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: '0.76rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: '#475569' }}>
                <span>Valor solicitado da carteira:</span>
                <strong style={{ color: '#0F172A' }}>{formatBRL(simWdGross)}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: simWdFee > 0 ? '#B45309' : '#64748B' }}>
                <span>Taxa de saque ({wdPct}% + {formatBRL(wdFixed)}):</span>
                <strong>{simWdFee > 0 ? `- ${formatBRL(simWdFee)}` : 'R$ 0,00 (Grátis)'}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #E2E8F0', paddingTop: 6, marginTop: 2, color: '#0F172A' }}>
                <span>PIX enviado para conta do motorista:</span>
                <strong style={{ color: '#15803D' }}>{formatBRL(simWdNet)}</strong>
              </div>
            </div>
          </div>
        </div>
      </div>
    </form>
  );
};
