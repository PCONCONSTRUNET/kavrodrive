import React, { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowLeft,
  Wallet,
  Plus,
  ChevronRight,
  ChevronDown,
  Copy,
  Check,
  RefreshCw,
  Clock,
  ArrowDownLeft,
  ArrowUpRight,
  Trash2,
  ShieldCheck,
  Loader2,
  X
} from 'lucide-react';
import {
  ClientProfile,
  ClientWalletEntry,
  ClientWalletSummary,
  SavedCard,
  SystemConfig
} from '../types';
import { calculateCardPassThroughPricing, StorageService } from '../services/storage';
import { showToast, useInlineConfirm } from '../utils/uiFeedback';
import { PaymentMethodIcon } from './PaymentMethodIcon';
import { AddCardModalSheet } from './AddCardModalSheet';

interface PassengerWalletModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: ClientProfile | null;
  config: SystemConfig;
  initialMode?: 'overview' | 'deposit' | 'statement';
  suggestedDepositAmount?: number;
  onRequireAuth?: () => void;
  onWalletUpdated?: (wallet: ClientWalletSummary) => void;
}

const PRESET_AMOUNTS = [20, 50, 100, 200];
const MIN_DEPOSIT_BRL = 20;

const formatBRL = (val: number): string =>
  Number(val || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export const PassengerWalletModal: React.FC<PassengerWalletModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  config,
  initialMode = 'overview',
  suggestedDepositAmount,
  onRequireAuth,
  onWalletUpdated
}) => {
  const [wallet, setWallet] = useState<ClientWalletSummary | null>(null);
  const [loadingWallet, setLoadingWallet] = useState(false);
  const [savedCards, setSavedCards] = useState<SavedCard[]>([]);
  const [selectedCardId, setSelectedCardId] = useState('');

  const [paymentsConfig, setPaymentsConfig] = useState<{
    gatewayProvider: 'efibank' | 'mercadopago' | 'sandbox';
    efiPixActive: boolean;
    mercadopagoPublicKey: string;
    cardFeePassThroughEnabled?: boolean;
    cardFeePassThroughPercent?: number;
  }>({
    gatewayProvider: 'sandbox',
    efiPixActive: false,
    mercadopagoPublicKey: String(import.meta.env.VITE_MERCADOPAGO_PUBLIC_KEY || '').trim(),
    cardFeePassThroughEnabled: config.cardFeePassThroughEnabled,
    cardFeePassThroughPercent: config.cardFeePassThroughPercent
  });

  const [showDepositPanel, setShowDepositPanel] = useState(false);
  const [showStatement, setShowStatement] = useState(false);
  const [showAddCardSheet, setShowAddCardSheet] = useState(false);

  const [depositAmountStr, setDepositAmountStr] = useState('20');
  const [depositMethod, setDepositMethod] = useState<'pix' | 'cartao_credito'>('pix');
  const [depositError, setDepositError] = useState('');
  const [depositSuccessMsg, setDepositSuccessMsg] = useState('');
  const [isProcessingDeposit, setIsProcessingDeposit] = useState(false);

  const [pendingPixEntry, setPendingPixEntry] = useState<ClientWalletEntry | null>(null);
  const [copiedPix, setCopiedPix] = useState(false);
  const [isConfirmingPix, setIsConfirmingPix] = useState(false);
  const { isConfirming, confirmOrArm } = useInlineConfirm();

  const allowApplePay = false;

  const refreshAll = useCallback(async () => {
    if (!currentUser?.id) return;
    setLoadingWallet(true);
    const [wRes, cards] = await Promise.all([
      StorageService.fetchClientWallet(currentUser.id),
      StorageService.getSavedCards(currentUser.id, currentUser.phone)
    ]);
    setLoadingWallet(false);
    if (wRes.ok && wRes.wallet) {
      setWallet(wRes.wallet);
      onWalletUpdated?.(wRes.wallet);
      const stillPending = pendingPixEntry
        ? wRes.wallet.entries.find(e => e.id === pendingPixEntry.id)
        : null;
      if (stillPending && stillPending.status === 'confirmado') {
        setPendingPixEntry(null);
        setDepositSuccessMsg(`Depósito de ${formatBRL(stillPending.amount)} creditado na sua carteira!`);
      }
    }
    setSavedCards(cards);
    if (cards.length > 0 && !selectedCardId) {
      setSelectedCardId(cards[0].id);
    }
  }, [currentUser?.id, currentUser?.phone, onWalletUpdated, pendingPixEntry, selectedCardId]);

  useEffect(() => {
    if (!isOpen) return;
    setDepositError('');
    setDepositSuccessMsg('');
    setPendingPixEntry(null);
    setShowAddCardSheet(false);
    setShowDepositPanel(initialMode === 'deposit');
    setShowStatement(initialMode === 'statement');
    const suggested = Math.max(MIN_DEPOSIT_BRL, Math.ceil(Number(suggestedDepositAmount || MIN_DEPOSIT_BRL)));
    setDepositAmountStr(String(suggested));

    StorageService.fetchPaymentsConfig()
      .then((cfg) =>
        setPaymentsConfig({
          gatewayProvider: cfg.gatewayProvider,
          efiPixActive: cfg.efiPixActive,
          mercadopagoPublicKey: cfg.mercadopagoPublicKey,
          cardFeePassThroughEnabled: cfg.cardFeePassThroughEnabled,
          cardFeePassThroughPercent: cfg.cardFeePassThroughPercent
        })
      )
      .catch(() => {});

    if (currentUser?.id) {
      refreshAll();
    }
  }, [isOpen, currentUser?.id, initialMode, suggestedDepositAmount]);

  // Auto-poll enquanto houver um PIX pendente aberto
  useEffect(() => {
    if (!isOpen || !pendingPixEntry || pendingPixEntry.status !== 'aguardando') return;
    const t = setInterval(() => {
      if (document.visibilityState === 'visible') {
        refreshAll();
      }
    }, 5000);
    return () => clearInterval(t);
  }, [isOpen, pendingPixEntry, refreshAll]);

  const parsedAmount = (() => {
    const clean = depositAmountStr.replace(',', '.').replace(/[^\d.]/g, '');
    const n = parseFloat(clean);
    return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
  })();

  const isAmountValid = parsedAmount >= MIN_DEPOSIT_BRL;
  const effectivePassThroughCfg = {
    cardFeePassThroughEnabled:
      paymentsConfig.cardFeePassThroughEnabled !== undefined
        ? paymentsConfig.cardFeePassThroughEnabled
        : config.cardFeePassThroughEnabled,
    cardFeePassThroughPercent:
      paymentsConfig.cardFeePassThroughPercent !== undefined
        ? paymentsConfig.cardFeePassThroughPercent
        : config.cardFeePassThroughPercent
  };
  const walletCardPricing = calculateCardPassThroughPricing(
    isAmountValid ? parsedAmount : MIN_DEPOSIT_BRL,
    effectivePassThroughCfg,
    'cartao_credito',
    { includeDebitCard: true }
  );

  if (!isOpen) return null;

  const handleOpenDeposit = (method: 'pix' | 'cartao_credito' = 'pix') => {
    if (!currentUser) {
      onClose();
      onRequireAuth?.();
      return;
    }
    setDepositMethod(method);
    setDepositError('');
    setDepositSuccessMsg('');
    setShowDepositPanel(true);
  };

  const handleCreateDeposit = async () => {
    if (!currentUser) {
      onClose();
      onRequireAuth?.();
      return;
    }
    setDepositError('');
    setDepositSuccessMsg('');

    if (!isAmountValid) {
      setDepositError(`O valor mínimo para depósito na carteira é ${formatBRL(MIN_DEPOSIT_BRL)}.`);
      return;
    }

    if (depositMethod === 'cartao_credito' && !selectedCardId) {
      setShowAddCardSheet(true);
      return;
    }

    setIsProcessingDeposit(true);
    const res = await StorageService.topupClientWallet({
      amount: parsedAmount,
      method: depositMethod,
      cardId: depositMethod === 'cartao_credito' ? selectedCardId : undefined
    });

    setIsProcessingDeposit(false);
    if (!res.ok) {
      setDepositError(res.error || 'Não foi possível iniciar o depósito.');
      return;
    }

    if (res.wallet) {
      setWallet(res.wallet);
      onWalletUpdated?.(res.wallet);
    }

    if (res.pending && res.entry) {
      setPendingPixEntry(res.entry);
      return;
    }

    if (res.chargeSummary && res.chargeSummary.cardFeeAmount > 0) {
      setDepositSuccessMsg(
        `Depósito de ${formatBRL(res.chargeSummary.depositAmount)} creditado na sua carteira! (Cobrado ${formatBRL(res.chargeSummary.totalCharged)} no cartão c/ taxa de ${res.chargeSummary.cardFeePercent.toFixed(2).replace('.', ',')}%)`
      );
    } else {
      setDepositSuccessMsg(`Depósito de ${formatBRL(parsedAmount)} creditado na sua carteira!`);
    }
    setShowDepositPanel(false);
  };

  const handleConfirmPendingPix = async () => {
    if (!pendingPixEntry) return;
    setIsConfirmingPix(true);
    setDepositError('');
    const res = await StorageService.confirmClientWalletTopup(pendingPixEntry.id);
    setIsConfirmingPix(false);
    if (!res.ok) {
      setDepositError(res.error || 'Aguardando confirmação do banco...');
      return;
    }
    if (res.wallet) {
      setWallet(res.wallet);
      onWalletUpdated?.(res.wallet);
    }
    setPendingPixEntry(null);
    setShowDepositPanel(false);
    setDepositSuccessMsg(`Depósito PIX de ${formatBRL(res.entry?.amount || parsedAmount)} confirmado!`);
  };

  const handleDeleteCard = async (cardId: string) => {
    if (!confirmOrArm(`del-card-${cardId}`)) return;
    const res = await StorageService.deleteSavedCard(cardId);
    if (res.ok) {
      const next = savedCards.filter(c => c.id !== cardId);
      setSavedCards(next);
      if (selectedCardId === cardId) {
        setSelectedCardId(next[0]?.id || '');
      }
      showToast('Cartão removido da carteira.', 'info');
    } else {
      showToast(res.error || 'Não foi possível remover o cartão.', 'error');
    }
  };

  const currentBalance = Number(wallet?.balance ?? currentUser?.walletBalance ?? 0);
  const pendingBalance = Number(wallet?.pendingBalance ?? 0);
  const entries = wallet?.entries || [];

  return createPortal(
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 10075,
        backgroundColor: '#FFFFFF',
        display: 'flex',
        justifyContent: 'center',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 480,
          height: '100dvh',
          backgroundColor: '#F8FAFC',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          boxShadow: '0 0 40px rgba(15, 23, 42, 0.08)'
        }}
      >
        {/* ── HEADER CLEAN PROFISSIONAL ─────────────────────────────── */}
        <div
          style={{
            padding: 'calc(12px + env(safe-area-inset-top, 0px)) 16px 12px 16px',
            backgroundColor: '#FFFFFF',
            borderBottom: '1px solid #E2E8F0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 10,
            flexShrink: 0
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button
              type="button"
              onClick={onClose}
              aria-label="Voltar"
              style={{
                width: 36,
                height: 36,
                borderRadius: '50%',
                border: '1px solid #E2E8F0',
                backgroundColor: '#F8FAFC',
                color: '#0F172A',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer'
              }}
            >
              <ArrowLeft size={18} />
            </button>
            <div>
              <h2 style={{ margin: 0, fontSize: '1.08rem', fontWeight: 900, color: '#0F172A', lineHeight: 1.2 }}>
                Carteira
              </h2>
              <div style={{ fontSize: '0.71rem', fontWeight: 600, color: '#64748B' }}>
                Saldo Kavro e formas de pagamento
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {currentUser && (
              <button
                type="button"
                onClick={refreshAll}
                disabled={loadingWallet}
                aria-label="Atualizar saldo"
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: '50%',
                  border: '1px solid #E2E8F0',
                  backgroundColor: '#FFFFFF',
                  color: '#0F172A',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer'
                }}
              >
                <RefreshCw size={15} className={loadingWallet ? 'animate-spin' : undefined} />
              </button>
            )}
            <img src="/logo-horizontal.png" alt="KAVRO" style={{ height: 20, objectFit: 'contain' }} />
          </div>
        </div>

        {/* ── CONTEÚDO ROLÁVEL ──────────────────────────────────────── */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 16px calc(28px + env(safe-area-inset-bottom, 0px)) 16px' }}>
          {!currentUser ? (
            <div style={{
              backgroundColor: '#FFFFFF',
              borderRadius: 20,
              padding: 24,
              border: '1px solid #E2E8F0',
              textAlign: 'center'
            }}>
              <Wallet size={36} color="#0F172A" style={{ margin: '0 auto 10px auto' }} />
              <div style={{ fontSize: '1rem', fontWeight: 800, color: '#0F172A' }}>
                Entre na sua conta para usar a Carteira
              </div>
              <p style={{ fontSize: '0.8rem', color: '#64748B', marginTop: 6, marginBottom: 16 }}>
                Deposite a partir de R$ 20,00 via PIX ou Cartão de Crédito e pague suas corridas com 1 toque.
              </p>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onRequireAuth?.();
                }}
                style={{
                  width: '100%',
                  height: 46,
                  borderRadius: 12,
                  border: 'none',
                  backgroundColor: '#0F172A',
                  color: '#FFFFFF',
                  fontWeight: 800,
                  fontSize: '0.9rem',
                  cursor: 'pointer'
                }}
              >
                Entrar ou criar conta
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {/* Feedback de sucesso */}
              {depositSuccessMsg && (
                <div style={{
                  padding: '12px 14px',
                  borderRadius: 14,
                  backgroundColor: '#F0FDF4',
                  border: '1px solid #BBF7D0',
                  color: '#15803D',
                  fontSize: '0.82rem',
                  fontWeight: 800,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8
                }}>
                  <Check size={16} />
                  <span>{depositSuccessMsg}</span>
                </div>
              )}

              {/* ── HERO CARD DE SALDO (INSPIRADO NA CARTEIRA UBER + PALETA KAVRO) */}
              <div style={{
                background: 'linear-gradient(155deg, #0B1117 0%, #15222C 100%)',
                borderRadius: 22,
                padding: '20px 18px',
                color: '#FFFFFF',
                boxShadow: '0 14px 28px rgba(11, 17, 23, 0.18)',
                position: 'relative',
                overflow: 'hidden'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#94A3B8' }}>
                    Saldo Kavro Drive
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowStatement(prev => !prev)}
                    style={{
                      background: 'rgba(255,255,255,0.08)',
                      border: '1px solid rgba(255,255,255,0.14)',
                      borderRadius: 999,
                      padding: '4px 10px',
                      color: '#E2E8F0',
                      fontSize: '0.7rem',
                      fontWeight: 700,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                      cursor: 'pointer'
                    }}
                  >
                    <span>Extrato ({entries.length})</span>
                    <ChevronRight size={13} />
                  </button>
                </div>

                <div style={{ fontSize: '2.15rem', fontWeight: 900, letterSpacing: '-0.03em', color: '#FFFFFF', lineHeight: 1.1 }}>
                  {formatBRL(currentBalance)}
                </div>

                <div style={{ fontSize: '0.74rem', color: '#94A3B8', marginTop: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <ShieldCheck size={14} color="#76D800" />
                  <span>Use nas corridas sem esperar aprovação • Depósito mínimo R$ 20,00</span>
                </div>

                {pendingBalance > 0 && (
                  <div style={{
                    marginTop: 10,
                    padding: '6px 10px',
                    borderRadius: 10,
                    backgroundColor: 'rgba(245, 158, 11, 0.16)',
                    border: '1px solid rgba(251, 191, 36, 0.35)',
                    color: '#FDE68A',
                    fontSize: '0.72rem',
                    fontWeight: 700,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6
                  }}>
                    <Clock size={13} />
                    <span>Depósito PIX pendente: {formatBRL(pendingBalance)}</span>
                  </div>
                )}

                <div style={{ marginTop: 16, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    onClick={() => handleOpenDeposit(depositMethod)}
                    style={{
                      backgroundColor: '#76D800',
                      color: '#0B1117',
                      border: 'none',
                      borderRadius: 999,
                      padding: '10px 18px',
                      fontSize: '0.84rem',
                      fontWeight: 900,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      cursor: 'pointer',
                      boxShadow: '0 6px 16px rgba(118, 216, 0, 0.28)'
                    }}
                  >
                    <Plus size={16} strokeWidth={2.8} />
                    <span>Adicionar saldo</span>
                  </button>
                </div>
              </div>

              {/* ── PAINEL DE DEPÓSITO (MÍNIMO R$ 20,00) ──────────────── */}
              {(showDepositPanel || pendingPixEntry) && (
                <div style={{
                  backgroundColor: '#FFFFFF',
                  borderRadius: 20,
                  padding: 16,
                  border: '1.5px solid #0F172A',
                  boxShadow: '0 10px 24px rgba(15, 23, 42, 0.08)'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                    <div>
                      <div style={{ fontSize: '0.94rem', fontWeight: 900, color: '#0F172A' }}>
                        {pendingPixEntry ? 'Pague o PIX para creditar' : 'Depositar na carteira'}
                      </div>
                      <div style={{ fontSize: '0.72rem', color: '#64748B', fontWeight: 600 }}>
                        {pendingPixEntry
                          ? `Valor: ${formatBRL(pendingPixEntry.amount)}`
                          : 'Valor mínimo de depósito: R$ 20,00'}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setShowDepositPanel(false);
                        setPendingPixEntry(null);
                        setDepositError('');
                      }}
                      aria-label="Fechar depósito"
                      style={{
                        width: 30,
                        height: 30,
                        borderRadius: '50%',
                        border: 'none',
                        backgroundColor: '#F1F5F9',
                        color: '#334155',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer'
                      }}
                    >
                      <X size={15} />
                    </button>
                  </div>

                  {pendingPixEntry ? (
                    <div style={{ textAlign: 'center' }}>
                      {pendingPixEntry.pixQrCode && (
                        <div style={{
                          display: 'inline-block',
                          padding: 10,
                          borderRadius: 16,
                          border: '2px solid #76D800',
                          backgroundColor: '#FFFFFF',
                          marginBottom: 12
                        }}>
                          <img
                            src={pendingPixEntry.pixQrCode}
                            alt="QR Code PIX Carteira"
                            style={{ width: 176, height: 176, display: 'block', borderRadius: 8 }}
                          />
                        </div>
                      )}

                      {pendingPixEntry.pixCopyPaste && (
                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard?.writeText(pendingPixEntry.pixCopyPaste || '');
                            setCopiedPix(true);
                            setTimeout(() => setCopiedPix(false), 2500);
                          }}
                          style={{
                            width: '100%',
                            height: 44,
                            borderRadius: 12,
                            border: 'none',
                            backgroundColor: copiedPix ? '#16A34A' : '#0F172A',
                            color: '#FFFFFF',
                            fontWeight: 800,
                            fontSize: '0.84rem',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 8,
                            cursor: 'pointer'
                          }}
                        >
                          {copiedPix ? <Check size={16} /> : <Copy size={16} />}
                          <span>{copiedPix ? 'Código PIX copiado!' : 'Copiar código PIX (Copia e Cola)'}</span>
                        </button>
                      )}

                      <div style={{ fontSize: '0.73rem', color: '#64748B', marginTop: 10, lineHeight: 1.4 }}>
                        Assim que você pagar no app do seu banco, o saldo cai automaticamente na sua carteira.
                      </div>

                      <button
                        type="button"
                        onClick={handleConfirmPendingPix}
                        disabled={isConfirmingPix}
                        style={{
                          marginTop: 10,
                          width: '100%',
                          height: 40,
                          borderRadius: 10,
                          border: '1px solid #CBD5E1',
                          backgroundColor: '#F8FAFC',
                          color: '#0F172A',
                          fontSize: '0.78rem',
                          fontWeight: 800,
                          cursor: 'pointer'
                        }}
                      >
                        {isConfirmingPix
                          ? 'Verificando pagamento...'
                          : paymentsConfig.efiPixActive
                            ? 'Já paguei — verificar agora'
                            : 'Confirmar pagamento PIX (Teste)'}
                      </button>
                    </div>
                  ) : (
                    <>
                      {/* Chips de valor rápido */}
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 7, marginBottom: 10 }}>
                        {PRESET_AMOUNTS.map((val) => {
                          const active = parsedAmount === val;
                          return (
                            <button
                              key={val}
                              type="button"
                              onClick={() => {
                                setDepositAmountStr(String(val));
                                setDepositError('');
                              }}
                              style={{
                                height: 38,
                                borderRadius: 10,
                                border: active ? '1.5px solid #0F172A' : '1px solid #E2E8F0',
                                backgroundColor: active ? '#0F172A' : '#F8FAFC',
                                color: active ? '#76D800' : '#0F172A',
                                fontSize: '0.8rem',
                                fontWeight: 800,
                                cursor: 'pointer'
                              }}
                            >
                              R$ {val}
                            </button>
                          );
                        })}
                      </div>

                      {/* Campo de valor personalizado */}
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        padding: '0 14px',
                        height: 48,
                        borderRadius: 12,
                        border: isAmountValid ? '1.5px solid #CBD5E1' : '1.5px solid #EF4444',
                        backgroundColor: '#FFFFFF',
                        marginBottom: 10
                      }}>
                        <span style={{ fontSize: '0.96rem', fontWeight: 900, color: '#64748B' }}>R$</span>
                        <input
                          type="text"
                          inputMode="decimal"
                          value={depositAmountStr}
                          onChange={(e) => {
                            setDepositAmountStr(e.target.value.replace(/[^\d.,]/g, ''));
                            setDepositError('');
                          }}
                          placeholder="20,00"
                          style={{
                            flex: 1,
                            border: 'none',
                            outline: 'none',
                            fontSize: '1.15rem',
                            fontWeight: 900,
                            color: '#0F172A'
                          }}
                        />
                        <span style={{ fontSize: '0.69rem', fontWeight: 700, color: isAmountValid ? '#16A34A' : '#DC2626' }}>
                          {isAmountValid ? 'Válido' : 'Mín. R$ 20'}
                        </span>
                      </div>

                      {/* Métodos para depositar */}
                      <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
                        <button
                          type="button"
                          onClick={() => setDepositMethod('pix')}
                          style={{
                            flex: '1 1 auto',
                            padding: '8px 10px',
                            borderRadius: 999,
                            border: depositMethod === 'pix' ? '1.5px solid #0F172A' : '1px solid #E2E8F0',
                            backgroundColor: depositMethod === 'pix' ? '#0F172A' : '#FFFFFF',
                            color: depositMethod === 'pix' ? '#FFFFFF' : '#0F172A',
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 6,
                            fontSize: '0.76rem',
                            fontWeight: 800,
                            cursor: 'pointer'
                          }}
                        >
                          <PaymentMethodIcon method="pix" size={16} />
                          <span>PIX</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => setDepositMethod('cartao_credito')}
                          style={{
                            flex: '1 1 auto',
                            padding: '8px 10px',
                            borderRadius: 999,
                            border: depositMethod === 'cartao_credito' ? '1.5px solid #0F172A' : '1px solid #E2E8F0',
                            backgroundColor: depositMethod === 'cartao_credito' ? '#0F172A' : '#FFFFFF',
                            color: depositMethod === 'cartao_credito' ? '#FFFFFF' : '#0F172A',
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 6,
                            fontSize: '0.76rem',
                            fontWeight: 800,
                            cursor: 'pointer'
                          }}
                        >
                          <PaymentMethodIcon method="cartao_credito" size={16} />
                          <span>Cartão de Crédito (à vista)</span>
                        </button>
                      </div>

                      {depositMethod === 'cartao_credito' && (
                        <div style={{ marginBottom: 12 }}>
                          {savedCards.length === 0 ? (
                            <button
                              type="button"
                              onClick={() => setShowAddCardSheet(true)}
                              style={{
                                width: '100%',
                                padding: '11px 12px',
                                borderRadius: 12,
                                border: '1.5px dashed #94A3B8',
                                backgroundColor: '#F8FAFC',
                                color: '#0F172A',
                                fontSize: '0.8rem',
                                fontWeight: 700,
                                cursor: 'pointer'
                              }}
                            >
                              + Cadastrar cartão seguro para depositar
                            </button>
                          ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                              {savedCards.map(c => (
                                <button
                                  key={c.id}
                                  type="button"
                                  onClick={() => setSelectedCardId(c.id)}
                                  style={{
                                    padding: '10px 12px',
                                    borderRadius: 12,
                                    border: selectedCardId === c.id ? '1.5px solid #0F172A' : '1px solid #E2E8F0',
                                    backgroundColor: selectedCardId === c.id ? '#F8FAFC' : '#FFFFFF',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    cursor: 'pointer'
                                  }}
                                >
                                  <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#0F172A' }}>
                                    {c.brand} •••• {c.last4}
                                  </span>
                                  {selectedCardId === c.id && <Check size={15} color="#16A34A" />}
                                </button>
                              ))}
                              <button
                                type="button"
                                onClick={() => setShowAddCardSheet(true)}
                                style={{
                                  background: 'none',
                                  border: 'none',
                                  textAlign: 'left',
                                  fontSize: '0.75rem',
                                  fontWeight: 700,
                                  color: '#4D7C0F',
                                  padding: '4px 2px',
                                  cursor: 'pointer'
                                }}
                              >
                                + Usar outro cartão
                              </button>
                            </div>
                          )}

                          {walletCardPricing.cardFeeAmount > 0 && (
                            <div
                              style={{
                                marginTop: 10,
                                padding: '10px 12px',
                                borderRadius: 12,
                                backgroundColor: '#EFF6FF',
                                border: '1px solid #BFDBFE',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: 4,
                                fontSize: '0.75rem',
                                color: '#1E3A8A'
                              }}
                            >
                              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <span>Crédito líquido na carteira:</span>
                                <strong>{formatBRL(walletCardPricing.baseAmount)}</strong>
                              </div>
                              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <span>
                                  Taxa do cartão ({walletCardPricing.cardFeePercent.toFixed(2).replace('.', ',')}%):
                                </span>
                                <strong>+ {formatBRL(walletCardPricing.cardFeeAmount)}</strong>
                              </div>
                              <div
                                style={{
                                  display: 'flex',
                                  justifyContent: 'space-between',
                                  paddingTop: 4,
                                  borderTop: '1px solid #BFDBFE',
                                  fontSize: '0.8rem',
                                  color: '#0F172A'
                                }}
                              >
                                <span>Total cobrado no cartão:</span>
                                <strong>{formatBRL(walletCardPricing.totalWithFee)}</strong>
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      <button
                          type="button"
                          onClick={handleCreateDeposit}
                          disabled={isProcessingDeposit || !isAmountValid}
                          style={{
                            width: '100%',
                            height: 46,
                            borderRadius: 12,
                            border: 'none',
                            backgroundColor: isAmountValid ? '#0F172A' : '#E2E8F0',
                            color: isAmountValid ? '#FFFFFF' : '#94A3B8',
                            fontWeight: 800,
                            fontSize: '0.88rem',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 8,
                            cursor: isAmountValid && !isProcessingDeposit ? 'pointer' : 'not-allowed'
                          }}
                        >
                          {isProcessingDeposit ? (
                            <>
                              <Loader2 size={16} className="animate-spin" />
                              <span>Processando depósito...</span>
                            </>
                          ) : (
                            <span>
                              {depositMethod === 'pix'
                                ? `Gerar PIX de ${formatBRL(isAmountValid ? parsedAmount : MIN_DEPOSIT_BRL)}`
                                : walletCardPricing.cardFeeAmount > 0
                                  ? `Depositar ${formatBRL(walletCardPricing.baseAmount)} (Cobrar ${formatBRL(walletCardPricing.totalWithFee)})`
                                  : `Depositar ${formatBRL(walletCardPricing.baseAmount)} no cartão`}
                            </span>
                          )}
                        </button>
                    </>
                  )}

                  {depositError && (
                    <div style={{
                      marginTop: 10,
                      padding: '9px 11px',
                      borderRadius: 10,
                      backgroundColor: '#FEF2F2',
                      border: '1px solid #FECACA',
                      color: '#B91C1C',
                      fontSize: '0.76rem',
                      fontWeight: 700
                    }}>
                      {depositError}
                    </div>
                  )}
                </div>
              )}

              {/* ── SEÇÃO FORMAS DE PAGAMENTO (MODELO CLEAN DA REFERÊNCIA) ── */}
              <div style={{
                backgroundColor: '#FFFFFF',
                borderRadius: 20,
                padding: '16px 16px 12px 16px',
                border: '1px solid #E2E8F0'
              }}>
                <div style={{ fontSize: '0.94rem', fontWeight: 900, color: '#0F172A', marginBottom: 10 }}>
                  Formas de pagamento
                </div>

                {/* PIX */}
                <button
                  type="button"
                  onClick={() => handleOpenDeposit('pix')}
                  style={{
                    width: '100%',
                    padding: '12px 4px',
                    border: 'none',
                    borderBottom: '1px solid #F1F5F9',
                    background: 'transparent',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    cursor: 'pointer',
                    textAlign: 'left'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <PaymentMethodIcon method="pix" size={22} />
                    <div>
                      <div style={{ fontSize: '0.88rem', fontWeight: 700, color: '#0F172A' }}>PIX</div>
                      <div style={{ fontSize: '0.72rem', color: '#64748B' }}>Depositar saldo ou pagar na corrida</div>
                    </div>
                  </div>
                  <ChevronRight size={17} color="#94A3B8" />
                </button>

                {/* Dinheiro */}
                <div
                  style={{
                    padding: '12px 4px',
                    borderBottom: '1px solid #F1F5F9',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <PaymentMethodIcon method="dinheiro" size={22} />
                    <div>
                      <div style={{ fontSize: '0.88rem', fontWeight: 700, color: '#0F172A' }}>Dinheiro</div>
                      <div style={{ fontSize: '0.72rem', color: '#64748B' }}>Pagamento ao motorista no fim da viagem</div>
                    </div>
                  </div>
                </div>

                {/* Cartões cadastrados */}
                <div style={{ paddingTop: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <span style={{ fontSize: '0.76rem', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      Cartões salvos ({savedCards.length})
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowAddCardSheet(true)}
                      style={{
                        border: 'none',
                        background: '#ECFCCB',
                        color: '#3F6212',
                        padding: '5px 10px',
                        borderRadius: 999,
                        fontSize: '0.72rem',
                        fontWeight: 800,
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4
                      }}
                    >
                      <PaymentMethodIcon method="cartao_credito" size={14} />
                      <Plus size={12} />
                      <span>Adicionar cartão</span>
                    </button>
                  </div>

                  {savedCards.length === 0 ? (
                    <div style={{ fontSize: '0.76rem', color: '#94A3B8', padding: '6px 4px' }}>
                      Nenhum cartão salvo ainda.
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {savedCards.map((card) => (
                        <div
                          key={card.id}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '10px 12px',
                            borderRadius: 12,
                            backgroundColor: '#F8FAFC',
                            border: '1px solid #E2E8F0'
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <PaymentMethodIcon method={card.cardType} size={19} />
                            <div>
                              <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#0F172A' }}>
                                {card.brand} •••• {card.last4}
                              </div>
                              <div style={{ fontSize: '0.68rem', color: '#64748B' }}>
                                {card.cardType === 'cartao_debito' ? 'Débito (à vista)' : 'Crédito à vista (1x)'} • Val. {card.expMonth}/{card.expYear}
                              </div>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleDeleteCard(card.id)}
                            aria-label="Excluir cartão"
                            style={{
                              background: isConfirming(`del-card-${card.id}`) ? '#DC2626' : 'none',
                              border: 'none',
                              borderRadius: isConfirming(`del-card-${card.id}`) ? 8 : 0,
                              color: isConfirming(`del-card-${card.id}`) ? '#FFFFFF' : '#EF4444',
                              cursor: 'pointer',
                              padding: isConfirming(`del-card-${card.id}`) ? '5px 9px' : 6,
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4,
                              fontSize: '0.7rem',
                              fontWeight: 800
                            }}
                          >
                            <Trash2 size={14} />
                            {isConfirming(`del-card-${card.id}`) && <span>Remover?</span>}
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* ── EXTRATO DA CARTEIRA ────────────────────────────────── */}
              <div style={{
                backgroundColor: '#FFFFFF',
                borderRadius: 20,
                padding: '14px 16px',
                border: '1px solid #E2E8F0'
              }}>
                <button
                  type="button"
                  onClick={() => setShowStatement(prev => !prev)}
                  style={{
                    width: '100%',
                    border: 'none',
                    background: 'transparent',
                    padding: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    cursor: 'pointer'
                  }}
                >
                  <span style={{ fontSize: '0.92rem', fontWeight: 900, color: '#0F172A' }}>
                    Movimentações da carteira ({entries.length})
                  </span>
                  <ChevronDown
                    size={17}
                    color="#64748B"
                    style={{ transform: showStatement ? 'rotate(180deg)' : 'none', transition: 'transform 0.18s ease' }}
                  />
                </button>

                {showStatement && (
                  <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {entries.length === 0 ? (
                      <div style={{ fontSize: '0.78rem', color: '#94A3B8', padding: '10px 0', textAlign: 'center' }}>
                        Você ainda não possui movimentações na carteira.
                      </div>
                    ) : (
                      entries.map((entry) => {
                        const isCredit = Number(entry.balanceDelta) >= 0;
                        const isPending = entry.status === 'aguardando';
                        return (
                          <div
                            key={entry.id}
                            onClick={() => {
                              if (isPending && entry.paymentMethod === 'pix') {
                                setPendingPixEntry(entry);
                                setShowDepositPanel(true);
                              }
                            }}
                            style={{
                              padding: '10px 12px',
                              borderRadius: 12,
                              backgroundColor: isPending ? '#FFFBEB' : '#F8FAFC',
                              border: isPending ? '1px solid #FDE68A' : '1px solid #E2E8F0',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              gap: 10,
                              cursor: isPending && entry.paymentMethod === 'pix' ? 'pointer' : 'default'
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>
                              <div style={{
                                width: 32,
                                height: 32,
                                borderRadius: '50%',
                                backgroundColor: isPending ? '#FEF3C7' : isCredit ? '#DCFCE7' : '#E2E8F0',
                                color: isPending ? '#B45309' : isCredit ? '#15803D' : '#0F172A',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                flexShrink: 0
                              }}>
                                {isPending ? (
                                  <Clock size={15} />
                                ) : isCredit ? (
                                  <ArrowDownLeft size={16} />
                                ) : (
                                  <ArrowUpRight size={16} />
                                )}
                              </div>
                              <div style={{ minWidth: 0, flex: 1 }}>
                                <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#0F172A' }}>
                                  {entry.description}
                                </div>
                                <div style={{ fontSize: '0.68rem', color: '#64748B', marginTop: 2 }}>
                                  {new Date(entry.createdAt).toLocaleString('pt-BR')} •{' '}
                                  {isPending ? 'Aguardando pagamento (toque p/ abrir QR)' : 'Confirmado'}
                                </div>
                              </div>
                            </div>
                            <div style={{
                              fontSize: '0.86rem',
                              fontWeight: 900,
                              color: isPending ? '#B45309' : isCredit ? '#15803D' : '#0F172A',
                              flexShrink: 0
                            }}>
                              {isCredit ? '+' : '-'}{formatBRL(Math.abs(entry.amount))}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* ── MODAL DE CADASTRO DE CARTÃO DENTRO DA CARTEIRA ──────────── */}
        {showAddCardSheet && currentUser && (
          <AddCardModalSheet
            isOpen
            mode="fullscreen"
            title="Adicionar cartão à Carteira"
            subtitle="Pagamento criptografado à vista (1x, sem parcelamento) para depósitos e corridas Kavro"
            submitLabel="Salvar Cartão na Carteira"
            initialHolderName={currentUser.name || ''}
            initialHolderCpf={currentUser.document || ''}
            clientId={currentUser.id}
            clientPhone={currentUser.phone}
            mercadopagoPublicKey={paymentsConfig.mercadopagoPublicKey}
            onClose={() => setShowAddCardSheet(false)}
            onCardSaved={(savedCard) => {
              setSavedCards((prev) => [savedCard, ...prev]);
              setSelectedCardId(savedCard.id);
              setShowAddCardSheet(false);
            }}
          />
        )}
      </div>
    </div>,
    document.body
  );
};
