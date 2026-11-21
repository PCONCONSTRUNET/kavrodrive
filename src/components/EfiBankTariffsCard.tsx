import React from 'react';
import { AlertTriangle, Check, Info, Landmark, Sparkles, TrendingUp } from 'lucide-react';

export const EFI_OFFICIAL_RATES = {
  pixReceivePercent: 1.19,
  creditCardCashPercent: 3.49,
  pixPayoutPercent: 1.19,
  pixPayoutMinBrl: 0.50,
  anticipationApproxPercent: 4.0,
} as const;

interface EfiBankTariffsCardProps {
  efiConnected: boolean;
  efiSandbox: boolean;
  sampleRideGross: number;
  commissionPercent: number;
  commissionFixed: number;
  configuredPixGwPercent: number;
  configuredCreditGwPercent: number;
  onApplyStandardGatewayFees?: () => void;
  onApplyWithdrawalEfiFee?: () => void;
  compactHeader?: boolean;
}

const formatBRL = (val: number) =>
  `R$ ${Number(val || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const formatPct = (val: number) =>
  `${Number(val || 0).toFixed(2).replace('.', ',')}%`;

export const EfiBankTariffsCard: React.FC<EfiBankTariffsCardProps> = ({
  efiConnected,
  efiSandbox,
  sampleRideGross,
  commissionPercent,
  commissionFixed,
  configuredPixGwPercent,
  configuredCreditGwPercent,
  onApplyStandardGatewayFees,
  onApplyWithdrawalEfiFee,
  compactHeader = false,
}) => {
  const gross = Math.max(10, Number(sampleRideGross || 50));
  const commAmt = Math.min(gross, Math.round(((gross * (commissionPercent / 100)) + Math.max(0, commissionFixed)) * 100) / 100);
  const driverNet = Math.round(Math.max(0, gross - commAmt) * 100) / 100;

  const effectivePixPct = configuredPixGwPercent > 0 ? configuredPixGwPercent : EFI_OFFICIAL_RATES.pixReceivePercent;
  const effectiveCreditPct = configuredCreditGwPercent > 0 ? configuredCreditGwPercent : EFI_OFFICIAL_RATES.creditCardCashPercent;

  const usingUnconfiguredZero = configuredPixGwPercent === 0 || configuredCreditGwPercent === 0;
  const alreadyMatchesEfi =
    Math.abs(configuredPixGwPercent - EFI_OFFICIAL_RATES.pixReceivePercent) < 0.01 &&
    Math.abs(configuredCreditGwPercent - EFI_OFFICIAL_RATES.creditCardCashPercent) < 0.01;

  const scenarios = [
    {
      label: 'PIX (QR Dinâmico Efí)',
      gwPct: effectivePixPct,
      badge: configuredPixGwPercent > 0 ? `${formatPct(effectivePixPct)} config.` : `${formatPct(EFI_OFFICIAL_RATES.pixReceivePercent)} padrão Efí`,
      accent: '#15803D',
      bg: '#F0FDF4',
    },
    {
      label: 'Cartão de Crédito (1x à vista)',
      gwPct: effectiveCreditPct,
      badge: configuredCreditGwPercent > 0 ? `${formatPct(effectiveCreditPct)} config.` : `${formatPct(EFI_OFFICIAL_RATES.creditCardCashPercent)} padrão Efí`,
      accent: '#1D4ED8',
      bg: '#EFF6FF',
    },
    {
      label: 'Dinheiro (Em mãos)',
      gwPct: 0,
      badge: '0,00% sem gateway',
      accent: '#B45309',
      bg: '#FFFBEB',
    },
  ];

  const minBreakEvenPct = Math.max(effectivePixPct, effectiveCreditPct);
  const commissionLabel = commissionFixed > 0
    ? `${formatPct(commissionPercent)} + ${formatBRL(commissionFixed)}`
    : formatPct(commissionPercent);

  return (
    <div
      style={{
        backgroundColor: '#FFFFFF',
        borderRadius: 12,
        border: '1.5px solid #CBD5E1',
        overflow: 'hidden',
        boxShadow: '0 2px 10px rgba(15, 23, 42, 0.04)',
      }}
    >
      {/* Cabeçalho Efí Bank */}
      <div
        style={{
          background: 'linear-gradient(135deg, #0B1117 0%, #15222C 100%)',
          color: '#FFFFFF',
          padding: compactHeader ? '12px 16px' : '14px 18px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 10,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 9,
              backgroundColor: 'rgba(118, 216, 0, 0.16)',
              border: '1px solid rgba(118, 216, 0, 0.45)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <Landmark size={18} color="#BEF264" />
          </div>
          <div>
            <div style={{ fontSize: '0.92rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span>Taxas Detalhadas da Gateway Efí Bank</span>
              <span
                style={{
                  fontSize: '0.66rem',
                  fontWeight: 800,
                  padding: '2px 8px',
                  borderRadius: 999,
                  backgroundColor: efiConnected ? 'rgba(118, 216, 0, 0.2)' : 'rgba(148, 163, 184, 0.22)',
                  color: efiConnected ? '#BEF264' : '#CBD5E1',
                  border: `1px solid ${efiConnected ? 'rgba(118, 216, 0, 0.45)' : 'rgba(148, 163, 184, 0.35)'}`,
                }}
              >
                {efiConnected ? `API Ativa (${efiSandbox ? 'Homologação' : 'Produção'})` : 'Tabela Oficial Efí PJ'}
              </span>
            </div>
            <div style={{ fontSize: '0.73rem', color: '#94A3B8', marginTop: 2 }}>
              Veja exatamente quanto a Efí desconta por corrida para definir a comissão ideal antes de exibir os valores ao passageiro e motorista.
            </div>
          </div>
        </div>

        {onApplyStandardGatewayFees && (
          <button
            type="button"
            onClick={onApplyStandardGatewayFees}
            style={{
              padding: '8px 13px',
              borderRadius: 9,
              border: 'none',
              backgroundColor: alreadyMatchesEfi ? 'rgba(118, 216, 0, 0.2)' : '#76D800',
              color: alreadyMatchesEfi ? '#BEF264' : '#0F172A',
              fontSize: '0.75rem',
              fontWeight: 800,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            {alreadyMatchesEfi ? <Check size={14} /> : <Sparkles size={14} />}
            <span>
              {alreadyMatchesEfi
                ? 'Padrão Efí aplicado (1,19% / 3,49%)'
                : 'Aplicar Padrão Efí (1,19% PIX • 3,49% Cartão)'}
            </span>
          </button>
        )}
      </div>

      <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Aviso se ainda estiver em 0% */}
        {usingUnconfiguredZero && onApplyStandardGatewayFees && (
          <div
            style={{
              padding: '10px 12px',
              borderRadius: 9,
              backgroundColor: '#FFFBEB',
              border: '1px solid #FDE68A',
              color: '#92400E',
              fontSize: '0.76rem',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: 8,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <AlertTriangle size={15} color="#B45309" style={{ flexShrink: 0 }} />
              <span>
                Sua configuração salva ainda tem taxa gateway em <strong>0%</strong> (PIX: {formatPct(configuredPixGwPercent)} / Cartão: {formatPct(configuredCreditGwPercent)}). As simulações abaixo consideram o padrão oficial da Efí Bank.
              </span>
            </div>
          </div>
        )}

        {/* Grade Detalhada de Tarifas Efí Bank */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(215px, 1fr))', gap: 10 }}>
          <div style={{ padding: '12px 14px', borderRadius: 10, backgroundColor: '#F0FDF4', border: '1px solid #BBF7D0' }}>
            <div style={{ fontSize: '0.68rem', fontWeight: 800, color: '#166534', textTransform: 'uppercase' }}>
              PIX Recebimento (API / QR Dinâmico)
            </div>
            <div style={{ fontSize: '1.28rem', fontWeight: 900, color: '#15803D', marginTop: 3 }}>
              1,19% <span style={{ fontSize: '0.72rem', fontWeight: 700 }}>por corrida PIX</span>
            </div>
            <div style={{ fontSize: '0.71rem', color: '#166534', marginTop: 3, lineHeight: 1.35 }}>
              Em R$ {gross.toFixed(2).replace('.', ',')}, a Efí retém{' '}
              <strong>{formatBRL((gross * EFI_OFFICIAL_RATES.pixReceivePercent) / 100)}</strong>.
              Configurado no sistema: <strong>{formatPct(configuredPixGwPercent)}</strong>.
            </div>
          </div>

          <div style={{ padding: '12px 14px', borderRadius: 10, backgroundColor: '#EFF6FF', border: '1px solid #BFDBFE' }}>
            <div style={{ fontSize: '0.68rem', fontWeight: 800, color: '#1E40AF', textTransform: 'uppercase' }}>
              Cartão de Crédito (1x à vista)
            </div>
            <div style={{ fontSize: '1.28rem', fontWeight: 900, color: '#1D4ED8', marginTop: 3 }}>
              3,49% <span style={{ fontSize: '0.72rem', fontWeight: 700 }}>padrão (31 dias)</span>
            </div>
            <div style={{ fontSize: '0.71rem', color: '#1E40AF', marginTop: 3, lineHeight: 1.35 }}>
              Em R$ {gross.toFixed(2).replace('.', ',')}, a Efí retém{' '}
              <strong>{formatBRL((gross * EFI_OFFICIAL_RATES.creditCardCashPercent) / 100)}</strong>.
              *(Antecipação média ~4%). Configurado: <strong>{formatPct(configuredCreditGwPercent)}</strong>.*
            </div>
          </div>

          <div style={{ padding: '12px 14px', borderRadius: 10, backgroundColor: '#F8FAFC', border: '1px solid #E2E8F0' }}>
            <div style={{ fontSize: '0.68rem', fontWeight: 800, color: '#475569', textTransform: 'uppercase' }}>
              Envio de PIX API (Saque Motorista)
            </div>
            <div style={{ fontSize: '1.22rem', fontWeight: 900, color: '#0F172A', marginTop: 3 }}>
              1,19% <span style={{ fontSize: '0.72rem', fontWeight: 700 }}>(mín. R$ 0,50)</span>
            </div>
            <div style={{ fontSize: '0.71rem', color: '#475569', marginTop: 3, lineHeight: 1.35 }}>
              Tarifa oficial PJ cash-out (`PUT /v3/gn/pix`). Em saque de R$ 100,00 custa{' '}
              <strong>R$ 1,19</strong> (ou R$ 0,50 até R$ 42,00).
            </div>
            {onApplyWithdrawalEfiFee && (
              <button
                type="button"
                onClick={onApplyWithdrawalEfiFee}
                style={{
                  marginTop: 6,
                  padding: '4px 9px',
                  borderRadius: 6,
                  border: '1px solid #CBD5E1',
                  backgroundColor: '#FFFFFF',
                  color: '#0F172A',
                  fontSize: '0.68rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Repassar 1,19% na taxa de saque
              </button>
            )}
          </div>

          <div style={{ padding: '12px 14px', borderRadius: 10, backgroundColor: '#F5F3FF', border: '1px solid #DDD6FE' }}>
            <div style={{ fontSize: '0.68rem', fontWeight: 800, color: '#5B21B6', textTransform: 'uppercase' }}>
              Split Automático Efí &amp; Carteira
            </div>
            <div style={{ fontSize: '1.16rem', fontWeight: 900, color: '#6D28D9', marginTop: 3 }}>
              Sem taxa extra
            </div>
            <div style={{ fontSize: '0.71rem', color: '#5B21B6', marginTop: 3, lineHeight: 1.35 }}>
              Split entre contas Efí usa a tarifa normal do PIX recebido. Saldo Carteira paga{' '}
              <strong>1,19%</strong> na recarga PIX (mín. R$ 20).
            </div>
          </div>
        </div>

        {/* Simulador de Liquidação Real: Quanto entra, quanto vai pro Motorista e quanto sobra para Kavro */}
        <div style={{ border: '1px solid #E2E8F0', borderRadius: 10, overflow: 'hidden' }}>
          <div
            style={{
              padding: '10px 14px',
              backgroundColor: '#F8FAFC',
              borderBottom: '1px solid #E2E8F0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: 8,
            }}
          >
            <div style={{ fontSize: '0.8rem', fontWeight: 800, color: '#0F172A', display: 'flex', alignItems: 'center', gap: 6 }}>
              <TrendingUp size={15} color="#15803D" />
              <span>
                Impacto Real na Corrida de {formatBRL(gross)} (Comissão configurada: {commissionLabel})
              </span>
            </div>
            <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#15803D' }}>
              Motorista já vê na tela: {formatBRL(driverNet)} líquido
            </span>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 580, fontSize: '0.76rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #E2E8F0', color: '#64748B', textAlign: 'left', fontSize: '0.69rem', textTransform: 'uppercase' }}>
                  <th style={{ padding: '9px 14px' }}>Forma de Pagamento</th>
                  <th style={{ padding: '9px 12px' }}>Passageiro Paga</th>
                  <th style={{ padding: '9px 12px' }}>Motorista Vê (Líquido)</th>
                  <th style={{ padding: '9px 12px' }}>Comissão Kavro Bruta</th>
                  <th style={{ padding: '9px 12px' }}>Desconto Efí Bank</th>
                  <th style={{ padding: '9px 14px' }}>Lucro Líquido Real Kavro</th>
                </tr>
              </thead>
              <tbody>
                {scenarios.map((sc) => {
                  const gwCost = Math.round(((gross * sc.gwPct) / 100) * 100) / 100;
                  const netProfit = Math.round((commAmt - gwCost) * 100) / 100;
                  const netPctOfGross = Math.round(((netProfit / gross) * 100) * 100) / 100;
                  const isNegative = netProfit <= 0;
                  return (
                    <tr key={sc.label} style={{ borderBottom: '1px solid #F1F5F9' }}>
                      <td style={{ padding: '10px 14px', fontWeight: 700, color: '#0F172A' }}>
                        <div>{sc.label}</div>
                        <div style={{ fontSize: '0.66rem', color: sc.accent }}>{sc.badge}</div>
                      </td>
                      <td style={{ padding: '10px 12px', fontWeight: 700, color: '#0F172A' }}>{formatBRL(gross)}</td>
                      <td style={{ padding: '10px 12px', fontWeight: 800, color: '#0F172A' }}>{formatBRL(driverNet)}</td>
                      <td style={{ padding: '10px 12px', fontWeight: 700, color: '#334155' }}>{formatBRL(commAmt)}</td>
                      <td style={{ padding: '10px 12px', fontWeight: 700, color: gwCost > 0 ? '#B45309' : '#64748B' }}>
                        {gwCost > 0 ? `- ${formatBRL(gwCost)} (${formatPct(sc.gwPct)})` : 'R$ 0,00'}
                      </td>
                      <td style={{ padding: '10px 14px' }}>
                        <span
                          style={{
                            display: 'inline-block',
                            padding: '3px 9px',
                            borderRadius: 999,
                            fontWeight: 800,
                            backgroundColor: isNegative ? '#FEF2F2' : sc.bg,
                            color: isNegative ? '#DC2626' : sc.accent,
                            border: `1px solid ${isNegative ? '#FECACA' : 'transparent'}`,
                          }}
                        >
                          {formatBRL(netProfit)} ({formatPct(netPctOfGross)})
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Nota técnica honesta sobre API da Efí + recomendação mínima */}
        <div
          style={{
            padding: '10px 12px',
            borderRadius: 9,
            backgroundColor: '#F8FAFC',
            border: '1px solid #E2E8F0',
            fontSize: '0.72rem',
            color: '#475569',
            display: 'flex',
            alignItems: 'flex-start',
            gap: 8,
            lineHeight: 1.45,
          }}
        >
          <Info size={15} color="#475569" style={{ marginTop: 1, flexShrink: 0 }} />
          <div>
            <strong>Como escolher sua comissão:</strong> para nunca empatar ou perder margem no cartão ({formatPct(effectiveCreditPct)}), mantenha a comissão geral acima de{' '}
            <strong style={{ color: '#0F172A' }}>{formatPct(minBreakEvenPct)}</strong> (ex.: <strong>{formatPct(minBreakEvenPct + 12)}</strong> deixa ~12% livres após pagar a Efí no cartão e ~{formatPct(Math.max(0, minBreakEvenPct + 12 - effectivePixPct))} no PIX).
            {' '}<em>Obs.: A API REST da Efí Bank (`/v2/gn/saldo`, `/v2/gn/config`) não expõe sua tabela contratual customizada — exibimos os valores oficiais de `sejaefi.com.br/tarifas`, editáveis na aba de Pagamentos se você negociou condições diferentes.</em>
          </div>
        </div>
      </div>
    </div>
  );
};
