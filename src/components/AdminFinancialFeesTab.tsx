import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  Banknote,
  Calculator,
  Car,
  Check,
  CheckCircle2,
  CreditCard,
  Layers,
  Percent,
  QrCode,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  Wallet
} from 'lucide-react';
import { PaymentMethod, SystemConfig } from '../types';
import { StorageService } from '../services/storage';
import { formatCurrencyValue, parseCurrencyInput, parseCurrencyToFloat } from '../utils/format';
import { PaymentMethodIcon } from './PaymentMethodIcon';
import { WithdrawalScheduleControlCard } from './WithdrawalScheduleControlCard';
import { EfiBankTariffsCard, EFI_OFFICIAL_RATES } from './EfiBankTariffsCard';
import { normalizeWithdrawalWeekdays } from '../utils/withdrawalSchedule';

interface AdminFinancialFeesTabProps {
  config: SystemConfig;
  onConfigUpdated: (nextConfig: SystemConfig) => void;
  onOpenEfiConfig?: () => void;
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
  const text = String(raw ?? '').trim();
  if (!text) return fallback;
  const n = text.includes(',')
    ? parseCurrencyToFloat(text)
    : parseFloat(text.replace(/[^\d.-]/g, ''));
  if (Number.isNaN(n)) return fallback;
  return Math.max(min, Math.round(n * 100) / 100);
};

const ALL_METHODS: PaymentMethod[] = ['pix', 'cartao_credito', 'carteira', 'dinheiro'];

const calcPlatformFee = (gross: number, pct: number, fixed: number): number => {
  if (gross <= 0) return 0;
  const raw = (gross * (pct / 100)) + Math.max(0, fixed);
  return Math.round(Math.min(gross, raw) * 100) / 100;
};

const formatCommissionSummary = (pct: number, fixed: number): string => {
  if (pct > 0 && fixed > 0) return `${pct}% + ${formatBRL(fixed)}`;
  if (fixed > 0) return `${formatBRL(fixed)} fixo`;
  return `${pct}%`;
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  height: 38,
  padding: '0 10px',
  borderRadius: 7,
  border: '1px solid #CBD5E1',
  fontSize: '0.86rem',
  fontWeight: 700,
  color: '#0F172A',
  backgroundColor: '#FFFFFF',
  boxSizing: 'border-box'
};

export const AdminFinancialFeesTab: React.FC<AdminFinancialFeesTabProps> = ({
  config,
  onConfigUpdated,
  onOpenEfiConfig,
  embedded = false
}) => {
  const [subTab, setSubTab] = useState<'corridas' | 'pagamentos'>('corridas');

  const baseComm = Number(config.platformCommissionPercent ?? 20);
  const baseFixed = Math.max(0, Number(config.platformCommissionFixed ?? 0) || 0);

  // Sub-aba 1: Taxas Base das Corridas
  const [baseFareStr, setBaseFareStr] = useState(formatCurrencyValue(config.baseFare ?? 8));
  const [pricePerKmStr, setPricePerKmStr] = useState(formatCurrencyValue(config.pricePerKm ?? 3.2));
  const [pricePerMinuteStr, setPricePerMinuteStr] = useState(formatCurrencyValue(config.pricePerMinute ?? 0.5));
  const [minimumFareStr, setMinimumFareStr] = useState(formatCurrencyValue(config.minimumFare ?? 15));
  const [nightSurchargeStr, setNightSurchargeStr] = useState(String(config.nightSurchargePercent ?? 20));
  const [cancellationFeeStr, setCancellationFeeStr] = useState(formatCurrencyValue(config.cancellationFeeAmount ?? 0));
  const [globalCommStr, setGlobalCommStr] = useState(String(baseComm));
  const [globalFixedStr, setGlobalFixedStr] = useState(formatCurrencyValue(baseFixed));
  const [useCategoryOverride, setUseCategoryOverride] = useState<boolean>(
    Boolean(config.useCategoryCommissionOverride)
  );

  // Sub-aba 2: Pagamentos, Gateways & Repasses
  const [pixGatewayStr, setPixGatewayStr] = useState(
    String(config.gatewayFeePercents?.pix ?? EFI_OFFICIAL_RATES.pixReceivePercent)
  );
  const [creditGatewayStr, setCreditGatewayStr] = useState(
    String(config.gatewayFeePercents?.cartao_credito ?? EFI_OFFICIAL_RATES.creditCardCashPercent)
  );
  const [paymentsStatus, setPaymentsStatus] = useState<{
    gatewayProvider: 'efibank' | 'mercadopago' | 'sandbox';
    efiEnabled: boolean;
    efiPixActive: boolean;
    efiSplitEnabled: boolean;
    efiDriverPixSendEnabled: boolean;
    efiSandbox: boolean;
  }>({
    gatewayProvider: 'sandbox',
    efiEnabled: false,
    efiPixActive: false,
    efiSplitEnabled: false,
    efiDriverPixSendEnabled: false,
    efiSandbox: false
  });

  useEffect(() => {
    StorageService.fetchPaymentsConfig()
      .then((cfg) =>
        setPaymentsStatus({
          gatewayProvider: cfg.gatewayProvider,
          efiEnabled: cfg.efiEnabled,
          efiPixActive: cfg.efiPixActive,
          efiSplitEnabled: cfg.efiSplitEnabled,
          efiDriverPixSendEnabled: cfg.efiDriverPixSendEnabled,
          efiSandbox: cfg.efiSandbox
        })
      )
      .catch(() => {});
  }, []);

  const [withdrawalFeePercentStr, setWithdrawalFeePercentStr] = useState(
    String(config.withdrawalFeePercent ?? 0)
  );
  const [withdrawalFeeFixedStr, setWithdrawalFeeFixedStr] = useState(
    formatCurrencyValue(config.withdrawalFeeFixed ?? 0)
  );
  const [minWithdrawalStr, setMinWithdrawalStr] = useState(
    formatCurrencyValue(config.minWithdrawalAmount ?? 20)
  );
  const [withdrawalEnabled, setWithdrawalEnabled] = useState<boolean>(
    config.driverWithdrawalEnabled !== false
  );
  const [withdrawalWeekdays, setWithdrawalWeekdays] = useState<number[]>(() =>
    normalizeWithdrawalWeekdays(config.driverWithdrawalWeekdays)
  );
  const [maxDebtLimitStr, setMaxDebtLimitStr] = useState(
    formatCurrencyValue(config.maxDriverDebtLimit ?? 100)
  );
  const [cardSettlementDaysStr, setCardSettlementDaysStr] = useState(
    String(config.cardSettlementDays ?? 0)
  );

  const resolveInitialMethods = (cfg: SystemConfig): PaymentMethod[] => {
    const raw =
      Array.isArray(cfg.activePaymentMethods) && cfg.activePaymentMethods.length > 0
        ? cfg.activePaymentMethods
        : ALL_METHODS;
    const base: PaymentMethod[] = raw.filter((m): m is PaymentMethod =>
      ALL_METHODS.includes(m)
    );
    if (!cfg.walletPaymentDisabled && !base.includes('carteira')) {
      base.push('carteira');
    }
    return base.length > 0 ? base : [...ALL_METHODS];
  };

  const [activeMethods, setActiveMethods] = useState<PaymentMethod[]>(() => resolveInitialMethods(config));
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

  // Simuladores
  const [simRideAmountStr, setSimRideAmountStr] = useState(formatCurrencyValue(50));
  const [simMethod, setSimMethod] = useState<'pix' | 'cartao_credito' | 'carteira' | 'dinheiro'>('pix');
  const [simWithdrawAmountStr, setSimWithdrawAmountStr] = useState(formatCurrencyValue(100));

  useEffect(() => {
    if (isDirty) return;
    const base = Number(config.platformCommissionPercent ?? 20);
    const fixed = Math.max(0, Number(config.platformCommissionFixed ?? 0) || 0);
    setBaseFareStr(formatCurrencyValue(config.baseFare ?? 8));
    setPricePerKmStr(formatCurrencyValue(config.pricePerKm ?? 3.2));
    setPricePerMinuteStr(formatCurrencyValue(config.pricePerMinute ?? 0.5));
    setMinimumFareStr(formatCurrencyValue(config.minimumFare ?? 15));
    setNightSurchargeStr(String(config.nightSurchargePercent ?? 20));
    setCancellationFeeStr(formatCurrencyValue(config.cancellationFeeAmount ?? 0));
    setGlobalCommStr(String(base));
    setGlobalFixedStr(formatCurrencyValue(fixed));
    setUseCategoryOverride(Boolean(config.useCategoryCommissionOverride));

    setPixGatewayStr(String(config.gatewayFeePercents?.pix ?? EFI_OFFICIAL_RATES.pixReceivePercent));
    setCreditGatewayStr(String(config.gatewayFeePercents?.cartao_credito ?? EFI_OFFICIAL_RATES.creditCardCashPercent));
    setWithdrawalFeePercentStr(String(config.withdrawalFeePercent ?? 0));
    setWithdrawalFeeFixedStr(formatCurrencyValue(config.withdrawalFeeFixed ?? 0));
    setMinWithdrawalStr(formatCurrencyValue(config.minWithdrawalAmount ?? 20));
    setWithdrawalEnabled(config.driverWithdrawalEnabled !== false);
    setWithdrawalWeekdays(normalizeWithdrawalWeekdays(config.driverWithdrawalWeekdays));
    setMaxDebtLimitStr(formatCurrencyValue(config.maxDriverDebtLimit ?? 100));
    setCardSettlementDaysStr(String(config.cardSettlementDays ?? 0));
    setActiveMethods(resolveInitialMethods(config));
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

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setSaveFeedback(null);

    const parsedBaseFare = clampMoney(baseFareStr, 8, 0);
    const parsedPerKm = clampMoney(pricePerKmStr, 3.2, 0);
    const parsedPerMin = clampMoney(pricePerMinuteStr, 0.5, 0);
    const parsedMinFare = clampMoney(minimumFareStr, 15, 0);
    const parsedNight = clampPct(nightSurchargeStr, 20);
    const parsedCancelFee = clampMoney(cancellationFeeStr, 0, 0);

    const parsedGlobal = clampPct(globalCommStr, 20);
    const parsedGlobalFixed = clampMoney(globalFixedStr, 0, 0);

    const parsedPixGw = clampPct(pixGatewayStr, 0);
    const parsedCreditGw = clampPct(creditGatewayStr, 0);

    const parsedWdPct = clampPct(withdrawalFeePercentStr, 0);
    const parsedWdFixed = clampMoney(withdrawalFeeFixedStr, 0, 0);
    const parsedMinWd = clampMoney(minWithdrawalStr, 20, 1);
    const parsedMaxDebt = clampMoney(maxDebtLimitStr, 100, 0);
    const parsedCardDays = Math.min(60, Math.max(0, parseInt(cardSettlementDaysStr.replace(/\D/g, ''), 10) || 0));

    const filteredActive = activeMethods.filter((m) => ALL_METHODS.includes(m));
    const finalMethods = filteredActive.length > 0 ? filteredActive : ALL_METHODS;
    const latestConfig = StorageService.getConfig();
    const nextConfig: SystemConfig = {
      ...latestConfig,
      ...config,
      baseFare: parsedBaseFare,
      pricePerKm: parsedPerKm,
      pricePerMinute: parsedPerMin,
      minimumFare: parsedMinFare,
      nightSurchargePercent: parsedNight,
      cancellationFeeAmount: parsedCancelFee,
      platformCommissionPercent: parsedGlobal,
      platformCommissionFixed: parsedGlobalFixed,
      paymentMethodCommissionPercents: {
        pix: parsedGlobal,
        cartao_credito: parsedGlobal,
        carteira: parsedGlobal,
        dinheiro: parsedGlobal
      },
      gatewayFeePercents: {
        pix: parsedPixGw,
        cartao_credito: parsedCreditGw
      },
      withdrawalFeePercent: parsedWdPct,
      withdrawalFeeFixed: parsedWdFixed,
      minWithdrawalAmount: parsedMinWd,
      driverWithdrawalEnabled: withdrawalEnabled,
      driverWithdrawalWeekdays: normalizeWithdrawalWeekdays(withdrawalWeekdays),
      maxDriverDebtLimit: parsedMaxDebt,
      cardSettlementDays: parsedCardDays,
      useCategoryCommissionOverride: useCategoryOverride,
      autoBlockDelinquentDrivers: autoBlockDelinquent,
      cashDeductFromBalanceFirst: cashDeductFirst,
      autoSplitPixEnabled: autoSplitPix,
      applePayDisabled: true,
      walletPaymentDisabled: !finalMethods.includes('carteira'),
      activePaymentMethods: finalMethods
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

    setBaseFareStr(formatCurrencyValue(parsedBaseFare));
    setPricePerKmStr(formatCurrencyValue(parsedPerKm));
    setPricePerMinuteStr(formatCurrencyValue(parsedPerMin));
    setMinimumFareStr(formatCurrencyValue(parsedMinFare));
    setNightSurchargeStr(String(parsedNight));
    setCancellationFeeStr(formatCurrencyValue(parsedCancelFee));
    setGlobalCommStr(String(parsedGlobal));
    setGlobalFixedStr(formatCurrencyValue(parsedGlobalFixed));
    setPixGatewayStr(String(parsedPixGw));
    setCreditGatewayStr(String(parsedCreditGw));
    setWithdrawalFeePercentStr(String(parsedWdPct));
    setWithdrawalFeeFixedStr(formatCurrencyValue(parsedWdFixed));
    setMinWithdrawalStr(formatCurrencyValue(parsedMinWd));
    setMaxDebtLimitStr(formatCurrencyValue(parsedMaxDebt));
    setCardSettlementDaysStr(String(parsedCardDays));

    setIsDirty(false);
    onConfigUpdated(nextConfig);
    setSaveFeedback({
      type: 'ok',
      text: 'Taxas base e regras de pagamento salvas e aplicadas em todo o sistema.'
    });
    setTimeout(() => setSaveFeedback(null), 5000);
  };

  // Prévia em tempo real das Taxas Base das Corridas (exemplo 8 km / 15 min)
  const previewBase = clampMoney(baseFareStr, 8, 0);
  const previewKm = clampMoney(pricePerKmStr, 3.2, 0);
  const previewMin = clampMoney(pricePerMinuteStr, 0.5, 0);
  const previewFloor = clampMoney(minimumFareStr, 15, 0);
  const globalPctPreview = clampPct(globalCommStr, 20);
  const globalFixedPreview = clampMoney(globalFixedStr, 0, 0);
  const generalFeeLabel = formatCommissionSummary(globalPctPreview, globalFixedPreview);

  const sampleRideGross = Math.max(
    previewFloor,
    Math.round((previewBase + 8 * previewKm + 15 * previewMin) * 10) / 10
  );
  const sampleRideComm = calcPlatformFee(sampleRideGross, globalPctPreview, globalFixedPreview);
  const sampleRideDriver = Math.round(Math.max(0, sampleRideGross - sampleRideComm) * 100) / 100;

  const pixGwPreview = clampPct(pixGatewayStr, EFI_OFFICIAL_RATES.pixReceivePercent);
  const creditGwPreview = clampPct(creditGatewayStr, EFI_OFFICIAL_RATES.creditCardCashPercent);

  const handleApplyStandardEfiFees = () => {
    markDirty();
    setPixGatewayStr(String(EFI_OFFICIAL_RATES.pixReceivePercent));
    setCreditGatewayStr(String(EFI_OFFICIAL_RATES.creditCardCashPercent));
    setSaveFeedback({
      type: 'ok',
      text: 'Taxas padrão da Efí Bank (1,19% PIX e 3,49% Cartão à vista) preenchidas! Clique em "Salvar e Aplicar no Sistema".'
    });
  };

  const handleApplyEfiWithdrawalFee = () => {
    markDirty();
    setWithdrawalFeePercentStr(String(EFI_OFFICIAL_RATES.pixPayoutPercent));
    setSaveFeedback({
      type: 'ok',
      text: 'Taxa de envio PIX Efí (1,19%) aplicada no campo de saque PIX! Clique em "Salvar e Aplicar no Sistema".'
    });
  };

  const renderEfiTariffsSection = (grossAmount: number, compactHeader = false) => (
    <EfiBankTariffsCard
      efiConnected={paymentsStatus.efiPixActive || paymentsStatus.efiEnabled}
      efiSandbox={paymentsStatus.efiSandbox}
      sampleRideGross={grossAmount}
      commissionPercent={globalPctPreview}
      commissionFixed={globalFixedPreview}
      configuredPixGwPercent={pixGwPreview}
      configuredCreditGwPercent={creditGwPreview}
      onApplyStandardGatewayFees={handleApplyStandardEfiFees}
      onApplyWithdrawalEfiFee={handleApplyEfiWithdrawalFee}
      compactHeader={compactHeader}
    />
  );

  // Prévia de Pagamentos / Gateways / Saques
  const methodRows: Array<{
    id: 'pix' | 'cartao_credito' | 'carteira' | 'dinheiro';
    title: string;
    subtitle: string;
    accent: string;
    bgAccent: string;
    hasGateway: boolean;
    gwStr?: string;
    setGwStr?: (v: string) => void;
    icon: React.ReactNode;
  }> = [
    {
      id: 'pix',
      title: 'PIX (QR Dinâmico)',
      subtitle: 'Confirmação instantânea via webhook',
      accent: '#15803D',
      bgAccent: '#F0FDF4',
      hasGateway: true,
      gwStr: pixGatewayStr,
      setGwStr: setPixGatewayStr,
      icon: <PaymentMethodIcon method="pix" size={20} />
    },
    {
      id: 'cartao_credito',
      title: 'Cartão de Crédito (À vista)',
      subtitle: 'Somente à vista (1x, sem parcelamento) • Pré-autorização + captura no fim',
      accent: '#1D4ED8',
      bgAccent: '#EFF6FF',
      hasGateway: true,
      gwStr: creditGatewayStr,
      setGwStr: setCreditGatewayStr,
      icon: <PaymentMethodIcon method="cartao_credito" size={22} />
    },
    {
      id: 'carteira',
      title: 'Saldo da Carteira Kavro',
      subtitle: 'Crédito pré-pago depositado pelo passageiro (mín. R$ 20,00)',
      accent: '#3F6212',
      bgAccent: '#ECFCCB',
      hasGateway: false,
      icon: <PaymentMethodIcon method="carteira" size={20} />
    },
    {
      id: 'dinheiro',
      title: 'Dinheiro (Em Mãos)',
      subtitle: 'Taxa lançada/abatida do motorista',
      accent: '#B45309',
      bgAccent: '#FFFBEB',
      hasGateway: false,
      icon: <PaymentMethodIcon method="dinheiro" size={22} />
    }
  ];

  const gwPctMap: Record<'pix' | 'cartao_credito' | 'carteira' | 'dinheiro', number> = {
    pix: clampPct(pixGatewayStr, 0),
    cartao_credito: clampPct(creditGatewayStr, 0),
    carteira: 0,
    dinheiro: 0
  };

  const simGross = clampMoney(simRideAmountStr, 50, 1);
  const simPlatformFee = calcPlatformFee(simGross, globalPctPreview, globalFixedPreview);
  const simDriverNet = Math.round(Math.max(0, simGross - simPlatformFee) * 100) / 100;
  const simGwCost = Math.round(((simGross * gwPctMap[simMethod]) / 100) * 100) / 100;
  const simPlatformNet = Math.round((simPlatformFee - simGwCost) * 100) / 100;

  const simWdGross = clampMoney(simWithdrawAmountStr, 100, 1);
  const wdPct = clampPct(withdrawalFeePercentStr, 0);
  const wdFixed = clampMoney(withdrawalFeeFixedStr, 0, 0);
  const simWdFee = Math.round(Math.min(simWdGross, (simWdGross * (wdPct / 100)) + wdFixed) * 100) / 100;
  const simWdNet = Math.round(Math.max(0, simWdGross - simWdFee) * 100) / 100;

  return (
    <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {/* Cabeçalho + Seletor Direto de Áreas */}
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
              Taxas do Sistema
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
            Dividido em duas áreas simples: valores base das corridas e taxas de pagamentos/gateways.
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

      {/* Abas Claras: Taxas Base das Corridas vs Pagamentos & Gateways */}
      <div
        style={{
          display: 'inline-flex',
          flexWrap: 'wrap',
          gap: 6,
          padding: 5,
          borderRadius: 10,
          backgroundColor: '#F1F5F9',
          border: '1px solid #E2E8F0',
          alignSelf: 'flex-start'
        }}
      >
        <button
          type="button"
          onClick={() => setSubTab('corridas')}
          style={{
            height: 36,
            padding: '0 16px',
            borderRadius: 8,
            border: 'none',
            backgroundColor: subTab === 'corridas' ? '#0F172A' : 'transparent',
            color: subTab === 'corridas' ? '#FFFFFF' : '#475569',
            fontSize: '0.8rem',
            fontWeight: 700,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 7,
            cursor: 'pointer'
          }}
        >
          <Car size={15} />
          <span>1. Taxas Base das Corridas</span>
        </button>

        <button
          type="button"
          onClick={() => setSubTab('pagamentos')}
          style={{
            height: 36,
            padding: '0 16px',
            borderRadius: 8,
            border: 'none',
            backgroundColor: subTab === 'pagamentos' ? '#0F172A' : 'transparent',
            color: subTab === 'pagamentos' ? '#FFFFFF' : '#475569',
            fontSize: '0.8rem',
            fontWeight: 700,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 7,
            cursor: 'pointer'
          }}
        >
          <CreditCard size={15} />
          <span>2. Pagamentos, Gateways &amp; Saques</span>
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

      {/* ===================================================================== */}
      {/* ÁREA 1: TAXAS BASE DAS CORRIDAS (LIMPA E DIRETA)                       */}
      {/* ===================================================================== */}
      {subTab === 'corridas' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Card 1: Tarifa da Corrida */}
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
              <Car size={16} color="#0F172A" />
              <div>
                <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#0F172A' }}>
                  Valores Base das Corridas
                </div>
                <div style={{ fontSize: '0.72rem', color: '#64748B' }}>
                  Defina quanto o passageiro paga por bandeirada, quilômetro rodado e tempo de viagem
                </div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 14 }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.73rem', fontWeight: 600, color: '#334155', marginBottom: 4 }}>
                  Bandeirada / Tarifa Base (R$)
                </label>
                <div style={{ position: 'relative' }}>
                  <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', fontSize: '0.76rem', fontWeight: 700, color: '#64748B', pointerEvents: 'none' }}>R$</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={baseFareStr}
                    onChange={(e) => {
                      markDirty();
                      setBaseFareStr(parseCurrencyInput(e.target.value));
                    }}
                    placeholder="0,00"
                    style={{ ...inputStyle, paddingLeft: 32 }}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.73rem', fontWeight: 600, color: '#334155', marginBottom: 4 }}>
                  Valor por KM (R$)
                </label>
                <div style={{ position: 'relative' }}>
                  <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', fontSize: '0.76rem', fontWeight: 700, color: '#64748B', pointerEvents: 'none' }}>R$</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={pricePerKmStr}
                    onChange={(e) => {
                      markDirty();
                      setPricePerKmStr(parseCurrencyInput(e.target.value));
                    }}
                    placeholder="0,00"
                    style={{ ...inputStyle, paddingLeft: 32 }}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.73rem', fontWeight: 600, color: '#334155', marginBottom: 4 }}>
                  Valor por Minuto (R$)
                </label>
                <div style={{ position: 'relative' }}>
                  <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', fontSize: '0.76rem', fontWeight: 700, color: '#64748B', pointerEvents: 'none' }}>R$</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={pricePerMinuteStr}
                    onChange={(e) => {
                      markDirty();
                      setPricePerMinuteStr(parseCurrencyInput(e.target.value));
                    }}
                    placeholder="0,00"
                    style={{ ...inputStyle, paddingLeft: 32 }}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.73rem', fontWeight: 600, color: '#334155', marginBottom: 4 }}>
                  Tarifa Mínima (R$)
                </label>
                <div style={{ position: 'relative' }}>
                  <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', fontSize: '0.76rem', fontWeight: 700, color: '#64748B', pointerEvents: 'none' }}>R$</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={minimumFareStr}
                    onChange={(e) => {
                      markDirty();
                      setMinimumFareStr(parseCurrencyInput(e.target.value));
                    }}
                    placeholder="0,00"
                    style={{ ...inputStyle, paddingLeft: 32 }}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.73rem', fontWeight: 600, color: '#334155', marginBottom: 4 }}>
                  Adicional Noturno (%)
                </label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={nightSurchargeStr}
                  onChange={(e) => {
                    markDirty();
                    setNightSurchargeStr(e.target.value.replace(/[^\d.,]/g, ''));
                  }}
                  style={inputStyle}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.73rem', fontWeight: 600, color: '#334155', marginBottom: 4 }}>
                  Multa de Cancelamento (R$)
                </label>
                <div style={{ position: 'relative' }}>
                  <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', fontSize: '0.76rem', fontWeight: 700, color: '#64748B', pointerEvents: 'none' }}>R$</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={cancellationFeeStr}
                    onChange={(e) => {
                      markDirty();
                      setCancellationFeeStr(parseCurrencyInput(e.target.value));
                    }}
                    placeholder="0,00"
                    style={{ ...inputStyle, paddingLeft: 32 }}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Card 2: Taxa Geral da Plataforma (Porcentagem + Valor Fixo) */}
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
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
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
                  <div style={{ fontSize: '0.88rem', fontWeight: 700, color: '#0F172A' }}>
                    Taxa Geral da Plataforma (% + Valor Fixo)
                  </div>
                  <div style={{ fontSize: '0.72rem', color: '#64748B' }}>
                    Taxa única aplicada em todas as corridas (PIX, Cartão e Dinheiro): percentual, valor fixo em R$, ou ambos somados.
                  </div>
                </div>
              </div>

              <span
                style={{
                  fontSize: '0.74rem',
                  fontWeight: 700,
                  padding: '5px 11px',
                  borderRadius: 999,
                  backgroundColor: '#F0FDF4',
                  border: '1px solid #BBF7D0',
                  color: '#15803D'
                }}
              >
                Vigente: {generalFeeLabel} por corrida
              </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 14, alignItems: 'end' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.73rem', fontWeight: 600, color: '#334155', marginBottom: 4 }}>
                  Porcentagem sobre a Corrida (%)
                </label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={globalCommStr}
                    onChange={(e) => {
                      markDirty();
                      setGlobalCommStr(e.target.value.replace(/[^\d.,]/g, ''));
                    }}
                    placeholder="20"
                    style={inputStyle}
                  />
                  <span style={{ fontSize: '0.84rem', fontWeight: 700, color: '#475569' }}>%</span>
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.73rem', fontWeight: 600, color: '#334155', marginBottom: 4 }}>
                  + Valor Fixo por Corrida (R$)
                </label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#475569' }}>R$</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={globalFixedStr}
                    onChange={(e) => {
                      markDirty();
                      setGlobalFixedStr(parseCurrencyInput(e.target.value));
                    }}
                    placeholder="0,00"
                    style={inputStyle}
                  />
                </div>
              </div>
            </div>

            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '10px 12px',
                borderRadius: 8,
                backgroundColor: '#F8FAFC',
                border: '1px solid #E2E8F0',
                fontSize: '0.76rem',
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
                style={{ width: 15, height: 15, accentColor: '#0F172A' }}
              />
              <span>
                <strong>Priorizar porcentagem individual da categoria</strong> (GO, PLUS, EXEC) quando configurada (o valor fixo geral continua somado).
              </span>
            </label>
          </div>

          {/* Prévia limpa de corrida padrão */}
          <div
            style={{
              backgroundColor: '#F8FAFC',
              borderRadius: 10,
              border: '1px solid #E2E8F0',
              padding: '14px 18px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: 10
            }}
          >
            <div style={{ fontSize: '0.78rem', color: '#475569', fontWeight: 600 }}>
              Exemplo automático (corrida diurna de <strong>8 km</strong> e <strong>15 min</strong>):
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', fontSize: '0.8rem' }}>
              <span>Passageiro: <strong style={{ color: '#0F172A' }}>{formatBRL(sampleRideGross)}</strong></span>
              <span>Plataforma ({generalFeeLabel}): <strong style={{ color: '#15803D' }}>{formatBRL(sampleRideComm)}</strong></span>
              <span>Motorista: <strong style={{ color: '#0F172A' }}>{formatBRL(sampleRideDriver)}</strong></span>
            </div>
          </div>

          {renderEfiTariffsSection(sampleRideGross, true)}
        </div>
      )}

      {/* ===================================================================== */}
      {/* ÁREA 2: PAGAMENTOS, GATEWAYS & REPASSES (SEPARADA)                     */}
      {/* ===================================================================== */}
      {subTab === 'pagamentos' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Status ao vivo do Gateway de Pagamentos (Efí Bank / Mercado Pago / Sandbox) */}
          <div
            style={{
              background: paymentsStatus.efiPixActive
                ? 'linear-gradient(135deg, #0B1117 0%, #15222C 100%)'
                : '#F8FAFC',
              color: paymentsStatus.efiPixActive ? '#FFFFFF' : '#0F172A',
              borderRadius: 12,
              border: paymentsStatus.efiPixActive ? '1px solid #1E293B' : '1px solid #E2E8F0',
              padding: '14px 18px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: 10
            }}
          >
            <div>
              <div style={{ fontSize: '0.86rem', fontWeight: 800 }}>
                Gateway Ativo:{' '}
                {paymentsStatus.efiPixActive
                  ? `Efí Bank PIX (${paymentsStatus.efiSandbox ? 'Homologação' : 'Produção'})`
                  : paymentsStatus.gatewayProvider === 'mercadopago'
                    ? 'Mercado Pago Conectado'
                    : 'Modo Sandbox / Manual'}
              </div>
              <div style={{ fontSize: '0.73rem', color: paymentsStatus.efiPixActive ? '#94A3B8' : '#64748B', marginTop: 2 }}>
                {paymentsStatus.efiPixActive
                  ? `PIX e Carteira pela Efí Bank${paymentsStatus.efiDriverPixSendEnabled ? ' • Envio de Saque PIX API ativo' : ''}${paymentsStatus.efiSplitEnabled ? ' • Split Efí ativo' : ''}.`
                  : 'Configure a Efí Bank (Certificado .p12, PIX, Split e Repasses) na aba dedicada do Painel Master.'}
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <span
                style={{
                  fontSize: '0.7rem',
                  fontWeight: 800,
                  padding: '4px 10px',
                  borderRadius: 999,
                  backgroundColor: paymentsStatus.efiPixActive ? 'rgba(118, 216, 0, 0.16)' : '#E2E8F0',
                  border: paymentsStatus.efiPixActive ? '1px solid rgba(118, 216, 0, 0.4)' : '1px solid #CBD5E1',
                  color: paymentsStatus.efiPixActive ? '#BEF264' : '#334155'
                }}
              >
                {paymentsStatus.efiPixActive ? 'Efí Bank Conectada' : paymentsStatus.gatewayProvider === 'mercadopago' ? 'Gateway Conectado' : 'Sandbox'}
              </span>
              {onOpenEfiConfig && (
                <button
                  type="button"
                  onClick={onOpenEfiConfig}
                  style={{
                    fontSize: '0.72rem',
                    fontWeight: 800,
                    padding: '5px 11px',
                    borderRadius: 999,
                    backgroundColor: '#76D800',
                    color: '#0F172A',
                    border: 'none',
                    cursor: 'pointer'
                  }}
                >
                  Configurar Efí Bank / Certificado
                </button>
              )}
            </div>
          </div>

          {renderEfiTariffsSection(50, false)}

          {/* Tabela direta: Meios de Pagamento x Comissão x Taxa do Gateway */}
          <div
            style={{
              backgroundColor: '#FFFFFF',
              borderRadius: 10,
              border: '1px solid #E2E8F0',
              overflow: 'hidden'
            }}
          >
            <div style={{ padding: '14px 18px', borderBottom: '1px solid #F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
              <div>
                <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#0F172A' }}>
                  Meios de Pagamento &amp; Taxas de Gateway
                </div>
                <div style={{ fontSize: '0.72rem', color: '#64748B' }}>
                  Ative ou desative os 4 meios aceitos (PIX / Cartão de Crédito / Dinheiro / Saldo da Carteira)
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
                Taxa geral vigente: {generalFeeLabel}
              </span>
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 560 }}>
                <thead>
                  <tr style={{ backgroundColor: '#F8FAFC', borderBottom: '1px solid #E2E8F0', textAlign: 'left' }}>
                    <th style={{ padding: '10px 16px', fontSize: '0.72rem', fontWeight: 700, color: '#475569' }}>Meio de Pagamento</th>
                    <th style={{ padding: '10px 12px', fontSize: '0.72rem', fontWeight: 700, color: '#475569' }}>Status</th>
                    <th style={{ padding: '10px 12px', fontSize: '0.72rem', fontWeight: 700, color: '#475569' }}>Taxa Gateway (%)</th>
                    <th style={{ padding: '10px 16px', fontSize: '0.72rem', fontWeight: 700, color: '#475569' }}>Simulação em R$ 50,00 (Taxa {generalFeeLabel})</th>
                  </tr>
                </thead>
                <tbody>
                  {methodRows.map((row) => {
                    const isEnabled = activeMethods.includes(row.id);
                    const gwPct = row.hasGateway ? clampPct(row.gwStr || '0', 0) : 0;
                    const exFee = calcPlatformFee(50, globalPctPreview, globalFixedPreview);
                    const exDriver = Math.round(Math.max(0, 50 - exFee) * 100) / 100;

                    return (
                      <tr
                        key={row.id}
                        style={{
                          borderBottom: '1px solid #F1F5F9',
                          opacity: isEnabled ? 1 : 0.6
                        }}
                      >
                        <td style={{ padding: '12px 16px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <div
                              style={{
                                width: 32,
                                height: 32,
                                borderRadius: 8,
                                backgroundColor: row.bgAccent,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                flexShrink: 0
                              }}
                            >
                              {row.icon}
                            </div>
                            <div>
                              <div style={{ fontSize: '0.84rem', fontWeight: 700, color: '#0F172A' }}>{row.title}</div>
                              <div style={{ fontSize: '0.69rem', color: '#64748B' }}>{row.subtitle}</div>
                            </div>
                          </div>
                        </td>

                        <td style={{ padding: '12px' }}>
                          <button
                            type="button"
                            onClick={() => toggleMethodEnabled(row.id)}
                            style={{
                              padding: '5px 12px',
                              borderRadius: 999,
                              border: 'none',
                              backgroundColor: isEnabled ? '#DCFCE7' : '#E2E8F0',
                              color: isEnabled ? '#15803D' : '#475569',
                              fontSize: '0.72rem',
                              fontWeight: 700,
                              cursor: 'pointer'
                            }}
                          >
                            {isEnabled ? 'Ativo' : 'Desativado'}
                          </button>
                        </td>

                        <td style={{ padding: '12px' }}>
                          {row.hasGateway && row.setGwStr ? (
                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                              <input
                                type="text"
                                inputMode="decimal"
                                value={row.gwStr}
                                onChange={(e) => {
                                  markDirty();
                                  row.setGwStr?.(e.target.value.replace(/[^\d.,]/g, ''));
                                }}
                                style={{
                                  width: 68,
                                  height: 34,
                                  padding: '0 8px',
                                  borderRadius: 6,
                                  border: '1px solid #CBD5E1',
                                  fontSize: '0.82rem',
                                  fontWeight: 600,
                                  textAlign: 'center',
                                  color: '#334155'
                                }}
                              />
                              <span style={{ fontSize: '0.74rem', fontWeight: 600, color: '#64748B' }}>%</span>
                            </div>
                          ) : (
                            <span style={{ fontSize: '0.74rem', color: '#94A3B8', fontWeight: 600 }}>Sem gateway</span>
                          )}
                        </td>

                        <td style={{ padding: '12px 16px', fontSize: '0.74rem', color: '#475569' }}>
                          Kavro <strong style={{ color: row.accent }}>{formatBRL(exFee)}</strong> • Motorista{' '}
                          <strong style={{ color: '#0F172A' }}>{formatBRL(exDriver)}</strong>
                          {gwPct > 0 ? ` • GW ${gwPct}%` : ''}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* 2 Cards diretos: Saques PIX vs Split & Dívida */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(330px, 1fr))', gap: 16 }}>
            {/* Card A: Saques PIX & Prazo de Cartão */}
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
                    Repasses (Saque PIX) &amp; Liberação Cartão
                  </div>
                  <div style={{ fontSize: '0.71rem', color: '#64748B' }}>
                    Tarifas de transferência quando o motorista saca o saldo no app
                  </div>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 600, color: '#334155', marginBottom: 4 }}>
                    Taxa Fixa por Saque (R$)
                  </label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={withdrawalFeeFixedStr}
                    onChange={(e) => {
                      markDirty();
                      setWithdrawalFeeFixedStr(parseCurrencyInput(e.target.value));
                    }}
                    placeholder="0,00"
                    style={inputStyle}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 600, color: '#334155', marginBottom: 4 }}>
                    Taxa no Saque (%)
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
                    style={inputStyle}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 600, color: '#334155', marginBottom: 4 }}>
                    Valor Mínimo p/ Saque (R$)
                  </label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={minWithdrawalStr}
                    onChange={(e) => {
                      markDirty();
                      setMinWithdrawalStr(parseCurrencyInput(e.target.value));
                    }}
                    placeholder="0,00"
                    style={inputStyle}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 600, color: '#334155', marginBottom: 4 }}>
                    Prazo Cartão (Dias • 0 = na hora)
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={cardSettlementDaysStr}
                    onChange={(e) => {
                      markDirty();
                      setCardSettlementDaysStr(e.target.value.replace(/\D/g, '').slice(0, 2));
                    }}
                    style={inputStyle}
                  />
                </div>
              </div>
            </div>

            {/* Card B: Split & Controle de Inadimplência */}
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
                    Split Gateway &amp; Limite de Dívida (Dinheiro)
                  </div>
                  <div style={{ fontSize: '0.71rem', color: '#64748B' }}>
                    Compensação de comissões em dinheiro e split automático
                  </div>
                </div>
              </div>

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
                    setMaxDebtLimitStr(parseCurrencyInput(e.target.value));
                  }}
                  placeholder="0,00"
                  style={inputStyle}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
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
                  <span>Split automático no gateway PIX (plataforma x motorista)</span>
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
                  <span>Descontar taxa em dinheiro do Saldo Livre antes de gerar dívida</span>
                </label>

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
                  <span>Bloquear motorista em dinheiro ao atingir limite de dívida</span>
                </label>
              </div>
            </div>
          </div>

          <WithdrawalScheduleControlCard
            config={config}
            controlledEnabled={withdrawalEnabled}
            controlledWeekdays={withdrawalWeekdays}
            onChangeEnabled={(next) => {
              markDirty();
              setWithdrawalEnabled(next);
            }}
            onChangeWeekdays={(next) => {
              markDirty();
              setWithdrawalWeekdays(next);
            }}
          />

          {/* Simulador compacto de Pagamento & Saque */}
          <div
            style={{
              backgroundColor: '#FFFFFF',
              borderRadius: 10,
              border: '1px solid #E2E8F0',
              padding: 16
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <Calculator size={16} color="#0F172A" />
              <div style={{ fontSize: '0.86rem', fontWeight: 700, color: '#0F172A' }}>
                Simulador Rápido de Gateway &amp; Saque
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(290px, 1fr))', gap: 14 }}>
              <div style={{ padding: 12, borderRadius: 8, backgroundColor: '#F8FAFC', border: '1px solid #E2E8F0' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '0.76rem', fontWeight: 700, color: '#0F172A' }}>Corrida por Meio</span>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={simRideAmountStr}
                        onChange={(e) => setSimRideAmountStr(parseCurrencyInput(e.target.value))}
                        style={{ width: 88, height: 28, padding: '0 8px', borderRadius: 6, border: '1px solid #CBD5E1', fontSize: '0.76rem', fontWeight: 700 }}
                      />
                      <select
                        value={simMethod}
                        onChange={(e) => setSimMethod(e.target.value as 'pix' | 'cartao_credito' | 'carteira' | 'dinheiro')}
                        style={{ height: 28, padding: '0 8px', borderRadius: 6, border: '1px solid #CBD5E1', fontSize: '0.74rem', fontWeight: 600 }}
                      >
                        <option value="pix">PIX</option>
                        <option value="cartao_credito">Cartão de Crédito</option>
                        <option value="carteira">Saldo da Carteira</option>
                        <option value="dinheiro">Dinheiro</option>
                      </select>
                  </div>
                </div>
                <div style={{ fontSize: '0.75rem', display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#475569' }}>Taxa Geral Kavro ({generalFeeLabel}):</span>
                    <strong style={{ color: '#15803D' }}>{formatBRL(simPlatformFee)}</strong>
                  </div>
                  {simGwCost > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: '#B45309' }}>Taxa Gateway ({gwPctMap[simMethod]}%):</span>
                      <strong style={{ color: '#B45309' }}>- {formatBRL(simGwCost)} (Líq. Kavro: {formatBRL(simPlatformNet)})</strong>
                    </div>
                  )}
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#475569' }}>Motorista:</span>
                    <strong style={{ color: simMethod === 'dinheiro' ? '#DC2626' : '#0F172A' }}>
                      {simMethod === 'dinheiro' ? `- ${formatBRL(simPlatformFee)} (taxa)` : formatBRL(simDriverNet)}
                    </strong>
                  </div>
                </div>
              </div>

              <div style={{ padding: 12, borderRadius: 8, backgroundColor: '#F8FAFC', border: '1px solid #E2E8F0' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
                  <span style={{ fontSize: '0.76rem', fontWeight: 700, color: '#0F172A' }}>Saque PIX do Motorista</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={simWithdrawAmountStr}
                    onChange={(e) => setSimWithdrawAmountStr(parseCurrencyInput(e.target.value))}
                    style={{ width: 88, height: 28, padding: '0 8px', borderRadius: 6, border: '1px solid #CBD5E1', fontSize: '0.76rem', fontWeight: 700 }}
                  />
                </div>
                <div style={{ fontSize: '0.75rem', display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#475569' }}>Taxa ({wdPct}% + {formatBRL(wdFixed)}):</span>
                    <strong style={{ color: simWdFee > 0 ? '#B45309' : '#64748B' }}>
                      {simWdFee > 0 ? `- ${formatBRL(simWdFee)}` : 'Grátis'}
                    </strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#475569' }}>Líquido enviado no PIX:</span>
                    <strong style={{ color: '#15803D' }}>{formatBRL(simWdNet)}</strong>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </form>
  );
};
