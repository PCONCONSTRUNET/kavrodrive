import React, { useState, useEffect, useRef } from 'react';
import {
  RefreshCw, Lock, Unlock, Search, Check, X, Eye, Star, Phone, Car, User, Wallet,
  ShieldCheck, ShieldAlert, Sparkles, AlertTriangle, FileText
} from 'lucide-react';
import {
  DriverProfile,
  DriverWalletSummary,
  FinancialLedgerEntry,
  PaymentTransaction,
  Ride,
  SystemConfig,
  WithdrawalRequest
} from '../types';
import { StorageService } from '../services/storage';
import { AdminKycReviewModal } from './AdminKycReviewModal';
import { DriverTermsContractModal } from './DriverTermsContractModal';
import {
  formatDocument,
  formatPhone,
  formatCNHPunctuated,
  formatPlateDisplay,
  formatPixKey
} from '../utils/format';
import { computeDriverAutoScore } from '../utils/scoringEngine';

interface AdminPlatformFinanceTabProps {
  config: SystemConfig;
  rides?: Ride[];
  initialSection?: 'visao_geral' | 'regras' | 'motoristas' | 'saques' | 'livro_razao';
  onConfigUpdated: (next: SystemConfig) => void;
}

const formatBRL = (val: number) =>
  `R$ ${Number(val || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const getBiometricSummary = (drv?: DriverProfile | null) => {
  const bio = drv?.kyc?.biometricResult;
  if (!bio) return null;
  const similarity = Number(bio.similarityScore ?? bio.similarity ?? 0);
  const isMatch = Boolean(bio.isMatch ?? bio.match ?? (similarity >= 55));
  return { similarity, isMatch };
};

const hasKycDocument = (drv: DriverProfile, kind: 'cnh' | 'selfie') => {
  if (kind === 'cnh') {
    return Boolean(drv.cnhDocumentPhoto || drv.kyc?.cnhDocumentPath || drv.kyc?.cnhDocumentUrl || drv.kyc?.cnhDocInfo);
  }
  return Boolean(drv.selfiePhoto || drv.kyc?.selfiePath || drv.kyc?.selfieUrl || drv.kyc?.selfieDocInfo);
};

export const AdminPlatformFinanceTab: React.FC<AdminPlatformFinanceTabProps> = ({
  config,
  rides = [],
  initialSection = 'visao_geral',
  onConfigUpdated
}) => {
  const isFleetStandaloneView = initialSection === 'motoristas';
  const [subTab, setSubTab] = useState<'visao_geral' | 'regras' | 'motoristas' | 'saques' | 'livro_razao'>(initialSection);
  const [periodFilter, setPeriodFilter] = useState<'diario' | 'semanal' | 'mensal' | 'todos'>('todos');
  const [methodFilter, setMethodFilter] = useState<string>('todos');
  const [statusFilter, setStatusFilter] = useState<string>('todos');
  const [searchQuery, setSearchQuery] = useState('');
  const [driverSearch, setDriverSearch] = useState('');
  const [driverStatusFilter, setDriverStatusFilter] = useState<'todos' | 'em_analise' | 'correcao_solicitada' | 'pendente_aprovacao' | 'aprovado' | 'rejeitado' | 'inadimplentes'>('todos');
  const [reviewingKycDriver, setReviewingKycDriver] = useState<DriverProfile | null>(null);
  const [termsViewerDriver, setTermsViewerDriver] = useState<DriverProfile | null>(null);

  // Estado do Modal de Histórico Completo (Avaliação, Corridas, Saques, Extrato e Cadastro)
  const [selectedDriverId, setSelectedDriverId] = useState<string | null>(null);
  const [driverModalTab, setDriverModalTab] = useState<'resumo' | 'corridas' | 'saques' | 'extrato'>('resumo');

  useEffect(() => {
    setSubTab(initialSection);
  }, [initialSection]);

  const [drivers, setDrivers] = useState<DriverProfile[]>([]);
  const [overview, setOverview] = useState<{
    commissionPercent: number;
    maxDriverDebtLimit: number;
    autoBlockDelinquentDrivers: boolean;
    minWithdrawalAmount: number;
    totalGrossVolume: number;
    totalPlatformCommission: number;
    totalPixVolume: number;
    totalCardVolume: number;
    totalCashVolume: number;
    totalRefunded: number;
    totalPendingDriverDebt: number;
    totalAvailableForDrivers: number;
    delinquentDriversCount: number;
    driverWallets: DriverWalletSummary[];
    transactions: PaymentTransaction[];
    withdrawals: WithdrawalRequest[];
    ledger: FinancialLedgerEntry[];
  } | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const [commPercentStr, setCommPercentStr] = useState(String(config.platformCommissionPercent ?? 20));
  const [debtLimitStr, setDebtLimitStr] = useState(String(config.maxDriverDebtLimit ?? 100));
  const [minWithdrawStr, setMinWithdrawStr] = useState(String(config.minWithdrawalAmount ?? 20));
  const [autoBlockDelinquent, setAutoBlockDelinquent] = useState(config.autoBlockDelinquentDrivers !== false);
  const [rulesSavedMsg, setRulesSavedMsg] = useState('');

  const loadAll = async () => {
    setIsLoading(true);
    const [drvList, fin] = await Promise.all([
      StorageService.fetchDriversList(),
      StorageService.fetchAdminFinanceOverview()
    ]);
    setDrivers(drvList);
    if (fin) {
      setOverview(fin);
      setCommPercentStr(String(fin.commissionPercent ?? config.platformCommissionPercent ?? 20));
      setDebtLimitStr(String(fin.maxDriverDebtLimit ?? config.maxDriverDebtLimit ?? 100));
      setMinWithdrawStr(String(fin.minWithdrawalAmount ?? config.minWithdrawalAmount ?? 20));
    }
    setIsLoading(false);
  };

  const lastDriverDigestRef = useRef('');

  useEffect(() => {
    loadAll();
  }, [rides.length]);

  useEffect(() => {
    const handleDbSync = () => {
      const synced = StorageService.getDrivers();
      setDrivers(synced);
      const digest = synced
        .map(d => `${d.id}:${d.approvalStatus}:${d.kyc?.status || ''}:${d.kyc?.submittedAt || ''}:${d.termsSignature?.signed ? '1' : '0'}`)
        .join('|');
      if (lastDriverDigestRef.current && digest !== lastDriverDigestRef.current) {
        StorageService.fetchAdminFinanceOverview().then(fin => {
          if (fin) setOverview(fin);
        }).catch(() => {});
      }
      lastDriverDigestRef.current = digest;
    };
    window.addEventListener('up_database_synced', handleDbSync);
    return () => window.removeEventListener('up_database_synced', handleDbSync);
  }, []);

  const handleSaveRules = async (e: React.FormEvent) => {
    e.preventDefault();
    const nextConfig: SystemConfig = {
      ...config,
      platformCommissionPercent: Math.max(0, Math.min(100, parseFloat(commPercentStr.replace(',', '.')) || 20)),
      maxDriverDebtLimit: Math.max(0, parseFloat(debtLimitStr.replace(',', '.')) || 100),
      minWithdrawalAmount: Math.max(1, parseFloat(minWithdrawStr.replace(',', '.')) || 20),
      autoBlockDelinquentDrivers: autoBlockDelinquent
    };
    await StorageService.saveConfig(nextConfig);
    onConfigUpdated(nextConfig);
    setRulesSavedMsg('Configurações financeiras atualizadas com sucesso.');
    setTimeout(() => setRulesSavedMsg(''), 3500);
    await loadAll();
  };

  const handleDriverApproval = async (driverId: string, approvalStatus: DriverProfile['approvalStatus']) => {
    await StorageService.adminUpdateDriverStatus(driverId, { approvalStatus });
    await loadAll();
  };

  const handleToggleDriverFinancialBlock = async (driver: DriverProfile, currentlyBlocked: boolean) => {
    await StorageService.adminUpdateDriverStatus(driver.id, {
      financialBlocked: !currentlyBlocked,
      financialBlockReason: !currentlyBlocked ? 'Bloqueado manualmente pela Administração' : ''
    });
    await loadAll();
  };

  const handleProcessWithdrawal = async (id: string, action: 'approve' | 'reject') => {
    const notes = action === 'reject'
      ? window.prompt('Informe o motivo da rejeição (o valor será estornado automaticamente para o saldo do motorista):') || ''
      : 'Repasse PIX efetuado pela Central Financeira';
    await StorageService.adminProcessWithdrawal(id, action, notes);
    await loadAll();
  };

  const handlePaymentAction = async (txId: string, action: 'refund' | 'dispute') => {
    const reason = window.prompt(
      action === 'refund'
        ? 'Confirme o motivo do reembolso integral ao passageiro:'
        : 'Informe o motivo da contestação / chargeback:'
    );
    if (reason === null) return;
    await StorageService.adminPaymentAction(txId, action, reason);
    await loadAll();
  };

  const filterByPeriod = <T extends { createdAt?: string; date?: string }>(items: T[]): T[] => {
    if (periodFilter === 'todos') return items;
    const now = Date.now();
    const msMap = {
      diario: 24 * 60 * 60 * 1000,
      semanal: 7 * 24 * 60 * 60 * 1000,
      mensal: 30 * 24 * 60 * 60 * 1000
    };
    const cutoff = now - msMap[periodFilter];
    return items.filter(i => {
      const raw = i.createdAt || (i.date ? `${i.date}T12:00:00` : '');
      const t = raw ? new Date(raw).getTime() : now;
      return !isNaN(t) ? t >= cutoff : true;
    });
  };

  const currentCommPct = Number(overview?.commissionPercent ?? config.platformCommissionPercent ?? 20);
  const currentDebtLimit = Number(overview?.maxDriverDebtLimit ?? config.maxDriverDebtLimit ?? 100);

  const mergedTransactions: PaymentTransaction[] = React.useMemo(() => {
    const backendTxs = overview?.transactions || [];
    const byRideId = new Map<string, PaymentTransaction>();
    for (const tx of backendTxs) {
      byRideId.set(tx.rideId, tx);
    }

    for (const r of rides) {
      if (!byRideId.has(r.id)) {
        const gross = Number(r.totalPrice || 0);
        const commAmt = Number(r.commissionAmount ?? ((gross * currentCommPct) / 100));
        const netAmt = Number(r.driverNetAmount ?? (gross - commAmt));
        const method = (r.paymentMethod || 'pix') as PaymentTransaction['method'];
        const status: PaymentTransaction['status'] =
          r.status === 'cancelada'
            ? 'reembolsado'
            : r.paymentStatus === 'pago' || r.paymentStatus === 'confirmado' || r.status === 'finalizada'
            ? 'confirmado'
            : r.paymentStatus === 'autorizado'
            ? 'autorizado'
            : 'aguardando';

        byRideId.set(r.id, {
          id: `tx-ride-${r.id}`,
          rideId: r.id,
          rideCode: r.rideCode || `#UP-${String(r.rideNumber || 1).padStart(3, '0')}`,
          driverId: r.driverId || 'drv-default',
          driverName: r.driverName || config.driverName || 'Motorista Parceiro',
          clientId: r.clientId || null,
          clientName: r.clientName || 'Passageiro',
          method,
          status,
          estimatedAmount: gross,
          finalAmount: gross,
          paidAmount: status === 'confirmado' ? gross : 0,
          refundedAmount: status === 'reembolsado' ? gross : 0,
          commissionPercent: Number(r.commissionPercent ?? currentCommPct),
          commissionAmount: Number(commAmt.toFixed(2)),
          driverNetAmount: Number(netAmt.toFixed(2)),
          gatewayTxId: `KAVRO-${r.id.slice(-6).toUpperCase()}`,
          createdAt: r.createdAt || `${r.date}T${r.time || '12:00'}:00.000Z`,
          updatedAt: r.createdAt || new Date().toISOString()
        });
      }
    }

    return Array.from(byRideId.values()).sort((a, b) =>
      String(b.createdAt || '').localeCompare(String(a.createdAt || ''))
    );
  }, [overview?.transactions, rides, currentCommPct, config.driverName]);

  const periodTransactions = filterByPeriod(mergedTransactions);
  const filteredTransactions = periodTransactions.filter(tx => {
    if (methodFilter !== 'todos' && tx.method !== methodFilter) return false;
    if (statusFilter !== 'todos' && tx.status !== statusFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchRide = (tx.rideCode || tx.rideId || '').toLowerCase().includes(q);
      const matchClient = (tx.clientName || '').toLowerCase().includes(q);
      const matchDriver = (tx.driverName || '').toLowerCase().includes(q);
      const matchGw = (tx.gatewayTxId || '').toLowerCase().includes(q);
      if (!matchRide && !matchClient && !matchDriver && !matchGw) return false;
    }
    return true;
  });

  const periodMetrics = React.useMemo(() => {
    const valid = periodTransactions.filter(t => t.status !== 'reembolsado' && t.status !== 'falhou');
    const refunded = periodTransactions.filter(t => t.status === 'reembolsado');

    const gross = valid.reduce((acc, t) => acc + Number(t.finalAmount || 0), 0);
    const platformFee = valid.reduce((acc, t) => acc + Number(t.commissionAmount || 0), 0);
    const driverNet = valid.reduce((acc, t) => acc + Number(t.driverNetAmount || 0), 0);
    const refundedTotal = refunded.reduce((acc, t) => acc + Number(t.refundedAmount || t.finalAmount || 0), 0);

    const pixTxs = valid.filter(t => t.method === 'pix');
    const cardTxs = valid.filter(t => t.method === 'cartao_credito' || t.method === 'cartao_debito');
    const cashTxs = valid.filter(t => t.method === 'dinheiro');

    const pixGross = pixTxs.reduce((acc, t) => acc + t.finalAmount, 0);
    const pixFee = pixTxs.reduce((acc, t) => acc + t.commissionAmount, 0);

    const cardGross = cardTxs.reduce((acc, t) => acc + t.finalAmount, 0);
    const cardFee = cardTxs.reduce((acc, t) => acc + t.commissionAmount, 0);

    const cashGross = cashTxs.reduce((acc, t) => acc + t.finalAmount, 0);
    const cashFee = cashTxs.reduce((acc, t) => acc + t.commissionAmount, 0);

    const avgTicket = valid.length > 0 ? gross / valid.length : 0;

    return {
      ridesCount: valid.length,
      gross,
      platformFee,
      driverNet,
      refundedTotal,
      avgTicket,
      pixCount: pixTxs.length,
      pixGross,
      pixFee,
      cardCount: cardTxs.length,
      cardGross,
      cardFee,
      cashCount: cashTxs.length,
      cashGross,
      cashFee
    };
  }, [periodTransactions]);

  const filteredLedger = filterByPeriod(overview?.ledger || []);

  const filteredDrivers = drivers.filter(drv => {
    const wallet = overview?.driverWallets?.find(w => w.driverId === drv.id);
    if (driverStatusFilter === 'em_analise' && drv.approvalStatus !== 'em_analise') return false;
    if (driverStatusFilter === 'correcao_solicitada' && drv.approvalStatus !== 'correcao_solicitada') return false;
    if (driverStatusFilter === 'pendente_aprovacao' && drv.approvalStatus !== 'pendente_aprovacao' && drv.approvalStatus !== 'pendente') return false;
    if (driverStatusFilter === 'aprovado' && drv.approvalStatus !== 'aprovado') return false;
    if (driverStatusFilter === 'rejeitado' && drv.approvalStatus !== 'rejeitado') return false;
    if (driverStatusFilter === 'inadimplentes' && !drv.financialBlocked && (wallet?.debtBalance || 0) <= 0) return false;
    if (driverSearch.trim()) {
      const q = driverSearch.toLowerCase();
      return (
        (drv.name || '').toLowerCase().includes(q) ||
        (drv.phone || '').toLowerCase().includes(q) ||
        (drv.vehiclePlate || '').toLowerCase().includes(q) ||
        (drv.document || '').toLowerCase().includes(q)
      );
    }
    return true;
  });

  const renderMethodLabel = (method: string) => {
    if (method === 'pix') return 'PIX';
    if (method === 'dinheiro') return 'Dinheiro';
    if (method === 'cartao_credito') return 'Cartão de Crédito';
    if (method === 'cartao_debito') return 'Cartão de Débito';
    return method;
  };

  const renderStatusBadge = (status: string) => {
    const map: Record<string, { bg: string; border: string; color: string; label: string }> = {
      aguardando: { bg: '#FFFBEB', border: '#FDE68A', color: '#B45309', label: 'Aguardando' },
      autorizado: { bg: '#EFF6FF', border: '#BFDBFE', color: '#1D4ED8', label: 'Autorizado' },
      confirmado: { bg: '#F0FDF4', border: '#BBF7D0', color: '#15803D', label: 'Liquidado' },
      pago: { bg: '#F0FDF4', border: '#BBF7D0', color: '#15803D', label: 'Liquidado' },
      parcialmente_pago: { bg: '#FFFBEB', border: '#FDE68A', color: '#B45309', label: 'Parcial' },
      pendente: { bg: '#FFFBEB', border: '#FDE68A', color: '#B45309', label: 'Pendente' },
      falhou: { bg: '#FEF2F2', border: '#FECACA', color: '#B91C1C', label: 'Recusado' },
      reembolsado: { bg: '#F8FAFC', border: '#E2E8F0', color: '#475569', label: 'Estornado' },
      contestado: { bg: '#FEF2F2', border: '#FECACA', color: '#991B1B', label: 'Contestado' }
    };
    const st = map[status] || { bg: '#F8FAFC', border: '#E2E8F0', color: '#475569', label: status };
    return (
      <span style={{
        display: 'inline-block',
        padding: '3px 8px',
        borderRadius: 6,
        backgroundColor: st.bg,
        border: `1px solid ${st.border}`,
        color: st.color,
        fontSize: '0.7rem',
        fontWeight: 600,
        whiteSpace: 'nowrap'
      }}>
        {st.label}
      </span>
    );
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // MODAL DE HISTÓRICO COMPLETO DO MOTORISTA / PARCEIRO (AVALIAÇÃO, CORRIDAS, SAQUES, EXTRATO)
  // ═══════════════════════════════════════════════════════════════════════════
  const selectedDriver = selectedDriverId ? drivers.find(d => d.id === selectedDriverId) || null : null;

  const renderAdminKycReviewModal = () => {
    if (!reviewingKycDriver) return null;
    return (
      <AdminKycReviewModal
        driver={reviewingKycDriver}
        isOpen={!!reviewingKycDriver}
        onClose={() => setReviewingKycDriver(null)}
        onUpdated={async () => {
          setReviewingKycDriver(null);
          await loadAll();
        }}
      />
    );
  };

  const renderDriverFullDossierModal = () => {
    if (!selectedDriver) return null;

    const wallet = overview?.driverWallets?.find(w => w.driverId === selectedDriver.id);
    const driverRides = rides.filter(r =>
      r.driverId === selectedDriver.id ||
      (selectedDriver.id === 'drv-default' && !r.driverId) ||
      (r.driverName && r.driverName.trim().toLowerCase() === selectedDriver.name.trim().toLowerCase())
    );
    const driverTransactions = mergedTransactions.filter(tx =>
      tx.driverId === selectedDriver.id ||
      (selectedDriver.id === 'drv-default' && (!tx.driverId || tx.driverId === 'drv-default')) ||
      (tx.driverName && tx.driverName.trim().toLowerCase() === selectedDriver.name.trim().toLowerCase())
    );
    const driverWithdrawals = (overview?.withdrawals || []).filter(w =>
      w.driverId === selectedDriver.id ||
      (w.driverName && w.driverName.trim().toLowerCase() === selectedDriver.name.trim().toLowerCase())
    );
    const driverLedger = (overview?.ledger || []).filter(l =>
      l.driverId === selectedDriver.id ||
      (l.driverName && l.driverName.trim().toLowerCase() === selectedDriver.name.trim().toLowerCase())
    );

    const validRides = driverRides.filter(r => r.status !== 'cancelada');
    const completedRides = driverRides.filter(r => r.status === 'finalizada');
    const cancelledRides = driverRides.filter(r => r.status === 'cancelada');

    const totalGross = validRides.reduce((acc, r) => acc + Number(r.totalPrice || 0), 0);
    const totalFee = validRides.reduce((acc, r) => acc + Number(r.commissionAmount ?? ((Number(r.totalPrice || 0) * currentCommPct) / 100)), 0);
    const totalNet = validRides.reduce((acc, r) => acc + Number(r.driverNetAmount ?? (Number(r.totalPrice || 0) - ((Number(r.totalPrice || 0) * currentCommPct) / 100))), 0);
    const totalWithdrawn = driverWithdrawals.filter(w => w.status === 'pago').reduce((acc, w) => acc + Number(w.amount || 0), 0);

    const autoScore = computeDriverAutoScore(selectedDriver, driverRides, wallet);
    const ratingVal = autoScore.averageRating;
    const cleanPhone = (selectedDriver.phone || '').replace(/\D/g, '');

    return (
      <div
        onClick={() => setSelectedDriverId(null)}
        style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.55)',
          backdropFilter: 'blur(3px)',
          zIndex: 99999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 16
        }}
      >
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            backgroundColor: '#FFFFFF',
            borderRadius: 12,
            border: '1px solid #CBD5E1',
            boxShadow: '0 24px 48px rgba(15, 23, 42, 0.22)',
            width: '100%',
            maxWidth: 960,
            maxHeight: '90vh',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden'
          }}
        >
          {/* Cabeçalho do Modal */}
          <div style={{
            padding: '18px 24px',
            borderBottom: '1px solid #E2E8F0',
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            backgroundColor: '#FFFFFF'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{
                width: 46,
                height: 46,
                borderRadius: 10,
                backgroundColor: '#0F172A',
                color: '#FFFFFF',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 700,
                fontSize: '1rem',
                overflow: 'hidden',
                flexShrink: 0
              }}>
                {selectedDriver.photo ? (
                  <img src={selectedDriver.photo} alt={selectedDriver.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <span>{(selectedDriver.name || 'M').slice(0, 2).toUpperCase()}</span>
                )}
              </div>

              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <h3 style={{ fontSize: '1.08rem', fontWeight: 700, color: '#0F172A', margin: 0 }}>
                    {selectedDriver.name}
                  </h3>
                  <span style={{
                    padding: '2px 8px',
                    borderRadius: 6,
                    fontSize: '0.68rem',
                    fontWeight: 600,
                    backgroundColor: selectedDriver.approvalStatus === 'aprovado' ? '#F0FDF4' : selectedDriver.approvalStatus === 'pendente_aprovacao' ? '#FFFBEB' : '#FEF2F2',
                    border: `1px solid ${selectedDriver.approvalStatus === 'aprovado' ? '#BBF7D0' : selectedDriver.approvalStatus === 'pendente_aprovacao' ? '#FDE68A' : '#FECACA'}`,
                    color: selectedDriver.approvalStatus === 'aprovado' ? '#15803D' : selectedDriver.approvalStatus === 'pendente_aprovacao' ? '#B45309' : '#B91C1C'
                  }}>
                    {selectedDriver.approvalStatus === 'aprovado' ? 'Cadastro Aprovado' : selectedDriver.approvalStatus === 'pendente_aprovacao' ? 'Aguardando Aprovação' : selectedDriver.approvalStatus}
                  </span>
                  <span style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    padding: '2px 8px',
                    borderRadius: 6,
                    backgroundColor: '#FFFBEB',
                    border: '1px solid #FDE68A',
                    color: '#B45309',
                    fontSize: '0.7rem',
                    fontWeight: 700
                  }}>
                    <Star size={12} fill="#F59E0B" color="#F59E0B" />
                    {ratingVal.toFixed(2)}
                  </span>
                  <span style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    padding: '2px 8px',
                    borderRadius: 6,
                    backgroundColor: autoScore.levelBg,
                    border: `1px solid ${autoScore.levelBorder}`,
                    color: autoScore.levelColor,
                    fontSize: '0.7rem',
                    fontWeight: 700
                  }}>
                    <Sparkles size={11} />
                    {autoScore.score} pts • {autoScore.level}
                  </span>
                </div>
                <div style={{ fontSize: '0.75rem', color: '#64748B', marginTop: 3 }}>
                  CPF: {formatDocument(selectedDriver.document) || '—'} • CNH: {formatCNHPunctuated(selectedDriver.cnh) || '—'} • {selectedDriver.vehicleBrand} {selectedDriver.vehicleModel} ({formatPlateDisplay(selectedDriver.vehiclePlate) || '—'})
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {cleanPhone && (
                <a
                  href={`https://wa.me/55${cleanPhone}`}
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    height: 32,
                    padding: '0 12px',
                    borderRadius: 6,
                    border: '1px solid #CBD5E1',
                    backgroundColor: '#FFFFFF',
                    color: '#0F172A',
                    fontSize: '0.74rem',
                    fontWeight: 600,
                    textDecoration: 'none',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6
                  }}
                >
                  <Phone size={13} />
                  <span>Contatar</span>
                </a>
              )}

              <button
                type="button"
                onClick={() => setSelectedDriverId(null)}
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 6,
                  border: '1px solid #CBD5E1',
                  backgroundColor: '#FFFFFF',
                  color: '#475569',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer'
                }}
              >
                <X size={16} />
              </button>
            </div>
          </div>

          {/* Abas Internas do Modal */}
          <div style={{
            display: 'flex',
            gap: 24,
            padding: '0 24px',
            borderBottom: '1px solid #E2E8F0',
            backgroundColor: '#F8FAFC',
            overflowX: 'auto'
          }}>
            {[
              { id: 'resumo', label: 'Cadastro, Avaliação & Carteira' },
              { id: 'corridas', label: `Histórico de Corridas (${driverRides.length})` },
              { id: 'saques', label: `Saques & Repasses PIX (${driverWithdrawals.length})` },
              { id: 'extrato', label: `Extrato / Livro-Razão (${driverLedger.length})` }
            ].map(tab => {
              const active = driverModalTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setDriverModalTab(tab.id as any)}
                  style={{
                    padding: '12px 2px',
                    background: 'none',
                    border: 'none',
                    borderBottom: active ? '2px solid #0F172A' : '2px solid transparent',
                    color: active ? '#0F172A' : '#64748B',
                    fontWeight: active ? 700 : 500,
                    fontSize: '0.8rem',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                    marginBottom: -1
                  }}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* Corpo Rolável do Modal */}
          <div style={{ padding: 24, overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* ABA 1: RESUMO, AVALIAÇÃO, SALDOS E FICHA CADASTRAL */}
            {driverModalTab === 'resumo' && (
              <>
                {/* 4 KPIs do Motorista */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))',
                  gap: 12
                }}>
                  <div style={{ padding: 14, borderRadius: 8, border: '1px solid #E2E8F0', backgroundColor: '#FFFFFF' }}>
                    <div style={{ fontSize: '0.7rem', color: '#64748B', fontWeight: 600 }}>Saldo Disponível p/ Saque</div>
                    <div style={{ fontSize: '1.35rem', fontWeight: 700, color: '#15803D', marginTop: 4 }}>
                      {formatBRL(wallet?.availableBalance || 0)}
                    </div>
                    <div style={{ fontSize: '0.68rem', color: '#64748B', marginTop: 4 }}>
                      Já sacado: {formatBRL(wallet?.totalWithdrawn || totalWithdrawn)}
                    </div>
                  </div>

                  <div style={{ padding: 14, borderRadius: 8, border: '1px solid #E2E8F0', backgroundColor: '#FFFFFF' }}>
                    <div style={{ fontSize: '0.7rem', color: '#64748B', fontWeight: 600 }}>Ganhos Líquidos em Corridas</div>
                    <div style={{ fontSize: '1.35rem', fontWeight: 700, color: '#0F172A', marginTop: 4 }}>
                      {formatBRL(wallet?.totalNetEarnings || totalNet)}
                    </div>
                    <div style={{ fontSize: '0.68rem', color: '#64748B', marginTop: 4 }}>
                      Bruto movimentado: {formatBRL(wallet?.totalGrossEarnings || totalGross)}
                    </div>
                  </div>

                  <div style={{ padding: 14, borderRadius: 8, border: '1px solid #E2E8F0', backgroundColor: '#FFFFFF' }}>
                    <div style={{ fontSize: '0.7rem', color: '#64748B', fontWeight: 600 }}>Dívida Atual (Dinheiro)</div>
                    <div style={{ fontSize: '1.35rem', fontWeight: 700, color: (wallet?.debtBalance || 0) > 0 ? '#DC2626' : '#0F172A', marginTop: 4 }}>
                      {formatBRL(wallet?.debtBalance || 0)}
                    </div>
                    <div style={{ fontSize: '0.68rem', color: '#64748B', marginTop: 4 }}>
                      Taxas geradas: {formatBRL((wallet?.totalCommissionPaid || 0) + (wallet?.totalCommissionPending || totalFee))}
                    </div>
                  </div>

                  <div style={{ padding: 14, borderRadius: 8, border: '1px solid #E2E8F0', backgroundColor: '#FFFFFF' }}>
                    <div style={{ fontSize: '0.7rem', color: '#64748B', fontWeight: 600 }}>Pontuação & Avaliação Automática</div>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '1.35rem', fontWeight: 700, color: '#0F172A' }}>{autoScore.score} pts</span>
                      <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#B45309' }}>• {ratingVal.toFixed(2)} ★</span>
                    </div>
                    <div style={{ fontSize: '0.68rem', color: '#64748B', marginTop: 4 }}>
                      {autoScore.level} • Concluídas: {completedRides.length} • Canceladas: {cancelledRides.length}
                    </div>
                  </div>
                </div>

                {/* Grid 2 Colunas: Dados Pessoais/CNH e Veículo/Financeiro */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
                  <div style={{ padding: 16, borderRadius: 8, border: '1px solid #E2E8F0', backgroundColor: '#F8FAFC', display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.75rem', fontWeight: 700, color: '#0F172A', textTransform: 'uppercase' }}>
                      <User size={14} /> Dados Cadastrais & Documentação
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, fontSize: '0.78rem' }}>
                      <div>
                        <div style={{ fontSize: '0.68rem', color: '#64748B' }}>Nome Completo</div>
                        <div style={{ fontWeight: 600, color: '#0F172A' }}>{selectedDriver.name}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: '0.68rem', color: '#64748B' }}>Telefone / WhatsApp</div>
                        <div style={{ fontWeight: 600, color: '#0F172A' }}>{formatPhone(selectedDriver.phone) || selectedDriver.phone || '—'}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: '0.68rem', color: '#64748B' }}>CPF</div>
                        <div style={{ fontWeight: 600, color: '#0F172A', fontVariantNumeric: 'tabular-nums' }}>{formatDocument(selectedDriver.document) || '—'}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: '0.68rem', color: '#64748B' }}>Registro CNH & EAR</div>
                        <div style={{ fontWeight: 600, color: '#0F172A', fontVariantNumeric: 'tabular-nums' }}>
                          {formatCNHPunctuated(selectedDriver.cnh) || '—'} • {selectedDriver.cnhHasEar !== false ? 'Com EAR' : 'Sem EAR'}
                        </div>
                      </div>
                      <div>
                        <div style={{ fontSize: '0.68rem', color: '#64748B' }}>CRLV / Licenciamento</div>
                        <div style={{ fontWeight: 600, color: '#0F172A' }}>
                          {selectedDriver.crlvNumber || 'Regular'}
                        </div>
                      </div>
                      <div>
                        <div style={{ fontSize: '0.68rem', color: '#64748B' }}>Cidade Base</div>
                        <div style={{ fontWeight: 600, color: '#0F172A' }}>{selectedDriver.city || 'Lauro Müller - SC'}</div>
                      </div>
                    </div>
                  </div>

                  <div style={{ padding: 16, borderRadius: 8, border: '1px solid #E2E8F0', backgroundColor: '#F8FAFC', display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.75rem', fontWeight: 700, color: '#0F172A', textTransform: 'uppercase' }}>
                      <Car size={14} /> Veículo, Categorias & Recebimento PIX
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, fontSize: '0.78rem' }}>
                      <div>
                        <div style={{ fontSize: '0.68rem', color: '#64748B' }}>Marca / Modelo / Versão</div>
                        <div style={{ fontWeight: 600, color: '#0F172A' }}>
                          {selectedDriver.vehicleBrand} {selectedDriver.vehicleModel} {selectedDriver.vehicleVersion || ''}
                        </div>
                      </div>
                      <div>
                        <div style={{ fontSize: '0.68rem', color: '#64748B' }}>Placa Mercosul</div>
                        <div style={{ fontWeight: 700, color: '#0F172A', fontFamily: 'monospace' }}>{formatPlateDisplay(selectedDriver.vehiclePlate) || '—'}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: '0.68rem', color: '#64748B' }}>Cor / Ano</div>
                        <div style={{ fontWeight: 600, color: '#0F172A' }}>{selectedDriver.vehicleColor} • {selectedDriver.vehicleYear || '2023'}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: '0.68rem', color: '#64748B' }}>Categorias Habilitadas</div>
                        <div style={{ fontWeight: 700, color: '#15803D', fontSize: '0.72rem' }}>
                          {Array.isArray(selectedDriver.eligibleCategories) && selectedDriver.eligibleCategories.length > 0
                            ? selectedDriver.eligibleCategories.map((c: string) => c.toUpperCase().replace('KAVRO_', 'KAVRO ')).join(', ')
                            : 'KAVRO GO'}
                        </div>
                      </div>
                      <div>
                        <div style={{ fontSize: '0.68rem', color: '#64748B' }}>Chave PIX p/ Repasse</div>
                        <div style={{ fontWeight: 600, color: '#0F172A', fontFamily: 'monospace' }}>{formatPixKey(selectedDriver.pixKey, selectedDriver.pixType) || '—'}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: '0.68rem', color: '#64748B' }}>Tipo de Chave</div>
                        <div style={{ fontWeight: 600, color: '#0F172A', textTransform: 'uppercase' }}>{selectedDriver.pixType || 'CPF/Telefone'}</div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Card Contrato & Termos de Uso Assinados Digitalmente */}
                <div style={{
                  padding: 16,
                  borderRadius: 8,
                  border: selectedDriver.termsSignature?.signed ? '1px solid #BBF7D0' : '1px solid #E2E8F0',
                  backgroundColor: selectedDriver.termsSignature?.signed ? '#F0FDF4' : '#FFFFFF',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 10
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.84rem', fontWeight: 700, color: '#0F172A' }}>
                      <FileText size={18} color={selectedDriver.termsSignature?.signed ? '#15803D' : '#64748B'} />
                      <span>Contrato & Termos de Uso — Motorista Parceiro (Assinatura Digital)</span>
                    </div>
                    <span style={{
                      padding: '3px 10px',
                      borderRadius: 6,
                      fontSize: '0.72rem',
                      fontWeight: 700,
                      backgroundColor: selectedDriver.termsSignature?.signed ? '#DCFCE7' : '#FEF3C7',
                      color: selectedDriver.termsSignature?.signed ? '#15803D' : '#B45309'
                    }}>
                      {selectedDriver.termsSignature?.signed ? 'ASSINADO DIGITALMENTE' : 'SEM ASSINATURA REGISTRADA'}
                    </span>
                  </div>

                  {selectedDriver.termsSignature?.signed ? (
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                      gap: 10,
                      fontSize: '0.75rem',
                      backgroundColor: '#FFFFFF',
                      border: '1px solid #DCFCE7',
                      borderRadius: 8,
                      padding: 12
                    }}>
                      <div>
                        <div style={{ fontSize: '0.67rem', color: '#64748B', fontWeight: 600 }}>Motorista / CPF</div>
                        <div style={{ fontWeight: 700, color: '#0F172A' }}>
                          {selectedDriver.termsSignature.driverSnapshot?.name || selectedDriver.name}
                        </div>
                        <div style={{ color: '#475569' }}>
                          CPF {formatDocument(selectedDriver.termsSignature.driverSnapshot?.cpf || selectedDriver.document)}
                        </div>
                      </div>
                      <div>
                        <div style={{ fontSize: '0.67rem', color: '#64748B', fontWeight: 600 }}>Data / Horário (Brasília)</div>
                        <div style={{ fontWeight: 700, color: '#0F172A' }}>
                          {selectedDriver.termsSignature.signedAtBrasilia}
                        </div>
                        <div style={{ color: '#475569' }}>
                          IP: {selectedDriver.termsSignature.technicalEvidence?.ip || 'N/A'}
                        </div>
                      </div>
                      <div>
                        <div style={{ fontSize: '0.67rem', color: '#64748B', fontWeight: 600 }}>Código de Validação</div>
                        <div style={{ fontWeight: 800, fontFamily: 'monospace', color: '#15803D' }}>
                          {selectedDriver.termsSignature.validationCode}
                        </div>
                        <div style={{ fontFamily: 'monospace', fontSize: '0.68rem', color: '#64748B' }}>
                          SHA-256: {selectedDriver.termsSignature.signatureHash.slice(0, 18)}...
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div style={{ fontSize: '0.76rem', color: '#64748B' }}>
                      Cadastro realizado antes da obrigatoriedade do Termo v0.1 ou sem certificado digital anexado.
                    </div>
                  )}

                  <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <button
                      type="button"
                      onClick={() => setTermsViewerDriver(selectedDriver)}
                      style={{
                        height: 34,
                        padding: '0 14px',
                        borderRadius: 6,
                        border: 'none',
                        backgroundColor: selectedDriver.termsSignature?.signed ? '#15803D' : '#0F172A',
                        color: '#FFFFFF',
                        fontSize: '0.76rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6
                      }}
                    >
                      <FileText size={14} />
                      <span>Abrir Termo Assinado / Imprimir PDF</span>
                    </button>
                  </div>
                </div>

                {/* Card de KYC & Biometria Facial Human */}
                <div style={{
                  padding: 16,
                  borderRadius: 8,
                  border: '1px solid #E2E8F0',
                  backgroundColor: '#FFFFFF',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 12
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.84rem', fontWeight: 700, color: '#0F172A' }}>
                      <ShieldCheck size={18} color="#2563EB" />
                      <span>Validação Facial & Documentos KYC (Human Biometrics AI)</span>
                    </div>
                    <span style={{
                      padding: '3px 10px',
                      borderRadius: 6,
                      fontSize: '0.72rem',
                      fontWeight: 700,
                      backgroundColor:
                        selectedDriver.approvalStatus === 'aprovado' ? '#DCFCE7' :
                        selectedDriver.approvalStatus === 'em_analise' ? '#EFF6FF' :
                        selectedDriver.approvalStatus === 'correcao_solicitada' ? '#FFFBEB' : '#FEF2F2',
                      color:
                        selectedDriver.approvalStatus === 'aprovado' ? '#15803D' :
                        selectedDriver.approvalStatus === 'em_analise' ? '#1D4ED8' :
                        selectedDriver.approvalStatus === 'correcao_solicitada' ? '#B45309' : '#DC2626'
                    }}>
                      Status: {selectedDriver.approvalStatus === 'aprovado' ? 'Aprovado' :
                               selectedDriver.approvalStatus === 'em_analise' ? 'Em Análise' :
                               selectedDriver.approvalStatus === 'correcao_solicitada' ? 'Correção Solicitada' :
                               selectedDriver.approvalStatus === 'rejeitado' ? 'Rejeitado' : 'Pendente'}
                    </span>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, fontSize: '0.78rem' }}>
                    {(() => {
                      const bioSummary = getBiometricSummary(selectedDriver);
                      const hasCnh = hasKycDocument(selectedDriver, 'cnh');
                      const hasSelfie = hasKycDocument(selectedDriver, 'selfie');
                      return (
                        <>
                          <div style={{ backgroundColor: '#F8FAFC', padding: '10px 12px', borderRadius: 6, border: '1px solid #E2E8F0' }}>
                            <div style={{ fontSize: '0.68rem', color: '#64748B' }}>Similaridade Facial IA</div>
                            <div style={{ fontWeight: 800, fontSize: '0.92rem', color: bioSummary?.isMatch ? '#15803D' : '#0F172A', marginTop: 2 }}>
                              {bioSummary ? `${bioSummary.similarity}% (${bioSummary.isMatch ? 'Compatível' : 'Atenção'})` : 'Pendente de envio'}
                            </div>
                          </div>
                          <div style={{ backgroundColor: '#F8FAFC', padding: '10px 12px', borderRadius: 6, border: '1px solid #E2E8F0' }}>
                            <div style={{ fontSize: '0.68rem', color: '#64748B' }}>Documento CNH</div>
                            <div style={{ fontWeight: 700, fontSize: '0.82rem', color: hasCnh ? '#15803D' : '#DC2626', marginTop: 2 }}>
                              {hasCnh ? '✓ Armazenado Seguro' : 'Não enviado'}
                            </div>
                          </div>
                          <div style={{ backgroundColor: '#F8FAFC', padding: '10px 12px', borderRadius: 6, border: '1px solid #E2E8F0' }}>
                            <div style={{ fontSize: '0.68rem', color: '#64748B' }}>Selfie Facial</div>
                            <div style={{ fontWeight: 700, fontSize: '0.82rem', color: hasSelfie ? '#15803D' : '#DC2626', marginTop: 2 }}>
                              {hasSelfie ? '✓ Capturada via WebRTC' : 'Não capturada'}
                            </div>
                          </div>
                        </>
                      );
                    })()}
                    <div style={{ backgroundColor: '#F8FAFC', padding: '10px 12px', borderRadius: 6, border: '1px solid #E2E8F0' }}>
                      <div style={{ fontSize: '0.68rem', color: '#64748B' }}>Auditoria & LGPD</div>
                      <div style={{ fontWeight: 700, fontSize: '0.82rem', color: '#475569', marginTop: 2 }}>
                        {selectedDriver.kyc?.auditLogs?.length || 0} registro(s) de log
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 4 }}>
                    <button
                      type="button"
                      onClick={() => setReviewingKycDriver(selectedDriver)}
                      style={{
                        padding: '8px 16px',
                        borderRadius: 6,
                        backgroundColor: '#2563EB',
                        color: '#FFFFFF',
                        border: 'none',
                        fontSize: '0.78rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        boxShadow: '0 2px 8px rgba(37, 99, 235, 0.25)'
                      }}
                    >
                      <Eye size={14} />
                      <span>Abrir Inspeção & Parecer KYC</span>
                    </button>
                  </div>
                </div>

                {/* Painel de Pontuação Automática (Kavro Score) & Reputação */}
                <div style={{ padding: 16, borderRadius: 8, border: '1px solid #E2E8F0', backgroundColor: '#FFFFFF', display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
                    <div>
                      <div style={{ fontSize: '0.86rem', fontWeight: 700, color: '#0F172A', display: 'flex', alignItems: 'center', gap: 7 }}>
                        <Sparkles size={15} color="#0F172A" />
                        Pontuação Automática (Kavro Score) & Desempenho
                      </div>
                      <div style={{ fontSize: '0.73rem', color: '#64748B', marginTop: 2 }}>
                        {autoScore.ratedCount > 0
                          ? `Calculada automaticamente com base em ${autoScore.ratedCount} avaliação(ões), KYC, termos e histórico de viagens`
                          : 'Calculada automaticamente pelo KYC, termo digital, CNH e histórico real de viagens'}
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{
                        padding: '4px 10px',
                        borderRadius: 999,
                        fontSize: '0.74rem',
                        fontWeight: 700,
                        backgroundColor: autoScore.levelBg,
                        border: `1px solid ${autoScore.levelBorder}`,
                        color: autoScore.levelColor
                      }}>
                        Nível {autoScore.level} • {autoScore.score} / {autoScore.maxScore} pts
                      </span>
                      <span style={{ fontSize: '1.02rem', fontWeight: 700, color: '#0F172A' }}>
                        {ratingVal.toFixed(2)} / 5.00 ★
                      </span>
                    </div>
                  </div>

                  {/* Barra de progresso do Score */}
                  <div>
                    <div style={{ height: 8, borderRadius: 999, backgroundColor: '#F1F5F9', overflow: 'hidden', border: '1px solid #E2E8F0' }}>
                      <div style={{
                        width: `${Math.min(100, Math.round((autoScore.score / autoScore.maxScore) * 100))}%`,
                        height: '100%',
                        backgroundColor: autoScore.score >= 880 ? '#2563EB' : autoScore.score >= 740 ? '#D97706' : autoScore.score >= 580 ? '#0F172A' : '#DC2626',
                        borderRadius: 999,
                        transition: 'width 0.3s ease'
                      }} />
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10 }}>
                    <div style={{ padding: '10px 12px', borderRadius: 6, backgroundColor: '#F8FAFC', border: '1px solid #E2E8F0' }}>
                      <div style={{ fontSize: '0.68rem', color: '#64748B' }}>Taxa de Conclusão</div>
                      <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#0F172A', marginTop: 2 }}>
                        {autoScore.completionRate}%
                      </div>
                    </div>
                    <div style={{ padding: '10px 12px', borderRadius: 6, backgroundColor: '#F8FAFC', border: '1px solid #E2E8F0' }}>
                      <div style={{ fontSize: '0.68rem', color: '#64748B' }}>Avaliações 5 Estrelas</div>
                      <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#15803D', marginTop: 2 }}>
                        {autoScore.ratedCount > 0 ? `${autoScore.fiveStarCount} avaliação(ões)` : 'Sem avaliações ainda'}
                      </div>
                    </div>
                    <div style={{ padding: '10px 12px', borderRadius: 6, backgroundColor: '#F8FAFC', border: '1px solid #E2E8F0' }}>
                      <div style={{ fontSize: '0.68rem', color: '#64748B' }}>Cancelamentos</div>
                      <div style={{ fontSize: '0.95rem', fontWeight: 700, color: autoScore.cancelledRides > 0 ? '#DC2626' : '#0F172A', marginTop: 2 }}>
                        {autoScore.cancelledRides} registro(s)
                      </div>
                    </div>
                  </div>

                  {/* Critérios detalhados da pontuação automática */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 8 }}>
                    {autoScore.breakdown.map(item => (
                      <div
                        key={item.id}
                        style={{
                          padding: '8px 10px',
                          borderRadius: 6,
                          backgroundColor: item.positive ? '#F8FAFC' : '#FEF2F2',
                          border: `1px solid ${item.positive ? '#E2E8F0' : '#FECACA'}`,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: 8,
                          fontSize: '0.73rem'
                        }}
                      >
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 600, color: '#0F172A' }}>{item.label}</div>
                          <div style={{ fontSize: '0.66rem', color: '#64748B' }}>{item.detail}</div>
                        </div>
                        <span style={{ fontWeight: 800, color: item.positive ? '#15803D' : '#DC2626', whiteSpace: 'nowrap' }}>
                          {item.points >= 0 ? `+${item.points}` : item.points} pts
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Barra de Ações Cadastrais e Financeiras */}
                <div style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 10,
                  paddingTop: 12,
                  borderTop: '1px solid #E2E8F0'
                }}>
                  <div style={{ fontSize: '0.75rem', color: '#64748B' }}>
                    Cadastrado em: <strong style={{ color: '#0F172A' }}>{new Date(selectedDriver.createdAt).toLocaleDateString('pt-BR')}</strong>
                  </div>

                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {selectedDriver.approvalStatus !== 'aprovado' && (
                      <button
                        type="button"
                        onClick={() => handleDriverApproval(selectedDriver.id, 'aprovado')}
                        style={{
                          padding: '7px 14px',
                          borderRadius: 6,
                          border: 'none',
                          backgroundColor: '#16A34A',
                          color: '#FFFFFF',
                          fontSize: '0.75rem',
                          fontWeight: 600,
                          cursor: 'pointer'
                        }}
                      >
                        Aprovar Motorista
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => handleToggleDriverFinancialBlock(selectedDriver, Boolean(selectedDriver.financialBlocked))}
                      style={{
                        padding: '7px 14px',
                        borderRadius: 6,
                        border: '1px solid #CBD5E1',
                        backgroundColor: '#FFFFFF',
                        color: selectedDriver.financialBlocked ? '#15803D' : '#334155',
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6
                      }}
                    >
                      {selectedDriver.financialBlocked ? <Unlock size={13} /> : <Lock size={13} />}
                      <span>{selectedDriver.financialBlocked ? 'Desbloquear Financeiro' : 'Bloquear Financeiro'}</span>
                    </button>

                    {selectedDriver.approvalStatus === 'aprovado' && (
                      <button
                        type="button"
                        onClick={() => handleDriverApproval(selectedDriver.id, 'suspenso')}
                        style={{
                          padding: '7px 14px',
                          borderRadius: 6,
                          border: '1px solid #FECACA',
                          backgroundColor: '#FFFFFF',
                          color: '#DC2626',
                          fontSize: '0.75rem',
                          fontWeight: 600,
                          cursor: 'pointer'
                        }}
                      >
                        Suspender Cadastro
                      </button>
                    )}
                  </div>
                </div>
              </>
            )}

            {/* ABA 2: HISTÓRICO COMPLETO DE CORRIDAS */}
            {driverModalTab === 'corridas' && (
              <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, overflow: 'hidden' }}>
                {driverRides.length === 0 && driverTransactions.length === 0 ? (
                  <div style={{ padding: '40px 20px', textAlign: 'center', color: '#64748B', fontSize: '0.82rem' }}>
                    Nenhuma corrida registrada para este motorista até o momento.
                  </div>
                ) : (
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.76rem' }}>
                      <thead>
                        <tr style={{ backgroundColor: '#F8FAFC', borderBottom: '1px solid #E2E8F0', color: '#64748B', fontSize: '0.68rem', textTransform: 'uppercase' }}>
                          <th style={{ padding: '10px 14px', fontWeight: 600 }}>Código / Data</th>
                          <th style={{ padding: '10px 12px', fontWeight: 600 }}>Passageiro</th>
                          <th style={{ padding: '10px 12px', fontWeight: 600 }}>Trajeto</th>
                          <th style={{ padding: '10px 12px', fontWeight: 600 }}>Método</th>
                          <th style={{ padding: '10px 12px', fontWeight: 600 }}>Bruto</th>
                          <th style={{ padding: '10px 12px', fontWeight: 600 }}>Taxa</th>
                          <th style={{ padding: '10px 12px', fontWeight: 600 }}>Líquido</th>
                          <th style={{ padding: '10px 12px', fontWeight: 600 }}>Avaliação</th>
                          <th style={{ padding: '10px 14px', fontWeight: 600 }}>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {driverRides.map(r => {
                          const gross = Number(r.totalPrice || 0);
                          const fee = Number(r.commissionAmount ?? ((gross * currentCommPct) / 100));
                          const net = Number(r.driverNetAmount ?? (gross - fee));
                          const orig = typeof r.origin === 'string' ? r.origin : (r.origin?.address || '');
                          const dest = typeof r.destination === 'string' ? r.destination : (r.destination?.address || '');

                          return (
                            <tr key={r.id} style={{ borderBottom: '1px solid #F1F5F9' }}>
                              <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                                <div style={{ fontWeight: 700, color: '#0F172A' }}>{r.rideCode || r.id}</div>
                                <div style={{ fontSize: '0.68rem', color: '#64748B' }}>{r.date} • {r.time}</div>
                              </td>
                              <td style={{ padding: '10px 12px' }}>
                                <div style={{ fontWeight: 600, color: '#0F172A' }}>{r.clientName}</div>
                                <div style={{ fontSize: '0.68rem', color: '#64748B' }}>{r.clientPhone}</div>
                              </td>
                              <td style={{ padding: '10px 12px', maxWidth: 220 }}>
                                <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: '#334155' }}>De: {orig.split(',')[0]}</div>
                                <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: '#64748B' }}>Para: {dest.split(',')[0]}</div>
                              </td>
                              <td style={{ padding: '10px 12px', color: '#334155', fontWeight: 500 }}>
                                {renderMethodLabel(r.paymentMethod || 'pix')}
                              </td>
                              <td style={{ padding: '10px 12px', fontWeight: 600, color: '#0F172A' }}>{formatBRL(gross)}</td>
                              <td style={{ padding: '10px 12px', color: '#64748B' }}>{formatBRL(fee)}</td>
                              <td style={{ padding: '10px 12px', fontWeight: 600, color: '#15803D' }}>{formatBRL(net)}</td>
                              <td style={{ padding: '10px 12px', fontWeight: 600, color: '#B45309' }}>
                                {(r.driverRating || 5.0).toFixed(1)} ★
                              </td>
                              <td style={{ padding: '10px 14px' }}>
                                <span style={{
                                  padding: '2px 7px',
                                  borderRadius: 5,
                                  fontSize: '0.68rem',
                                  fontWeight: 600,
                                  backgroundColor: r.status === 'finalizada' ? '#F0FDF4' : r.status === 'cancelada' ? '#FEF2F2' : '#EFF6FF',
                                  color: r.status === 'finalizada' ? '#15803D' : r.status === 'cancelada' ? '#B91C1C' : '#1D4ED8'
                                }}>
                                  {r.status}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* ABA 3: HISTÓRICO DE SAQUES & REPASSES PIX */}
            {driverModalTab === 'saques' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{
                  padding: '12px 16px',
                  borderRadius: 8,
                  backgroundColor: '#F8FAFC',
                  border: '1px solid #E2E8F0',
                  display: 'flex',
                  flexWrap: 'wrap',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 10
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <Wallet size={16} color="#0F172A" />
                    <span style={{ fontSize: '0.78rem', color: '#334155' }}>
                      Chave PIX cadastrada: <strong style={{ color: '#0F172A', fontFamily: 'monospace' }}>{selectedDriver.pixKey || 'Não informada'}</strong>
                    </span>
                  </div>
                  <div style={{ fontSize: '0.78rem', color: '#334155' }}>
                    Saldo disponível para saque: <strong style={{ color: '#15803D' }}>{formatBRL(wallet?.availableBalance || 0)}</strong>
                  </div>
                </div>

                <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, overflow: 'hidden' }}>
                  {driverWithdrawals.length === 0 ? (
                    <div style={{ padding: '40px 20px', textAlign: 'center', color: '#64748B', fontSize: '0.82rem' }}>
                      Nenhuma solicitação de saque registrada por este motorista.
                    </div>
                  ) : (
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.76rem' }}>
                        <thead>
                          <tr style={{ backgroundColor: '#F8FAFC', borderBottom: '1px solid #E2E8F0', color: '#64748B', fontSize: '0.68rem', textTransform: 'uppercase' }}>
                            <th style={{ padding: '10px 14px', fontWeight: 600 }}>Data Solicitação</th>
                            <th style={{ padding: '10px 12px', fontWeight: 600 }}>Chave PIX Destino</th>
                            <th style={{ padding: '10px 12px', fontWeight: 600 }}>Valor</th>
                            <th style={{ padding: '10px 12px', fontWeight: 600 }}>Status</th>
                            <th style={{ padding: '10px 12px', fontWeight: 600 }}>Observações</th>
                            <th style={{ padding: '10px 14px', fontWeight: 600, textAlign: 'right' }}>Ações</th>
                          </tr>
                        </thead>
                        <tbody>
                          {driverWithdrawals.map(w => (
                            <tr key={w.id} style={{ borderBottom: '1px solid #F1F5F9' }}>
                              <td style={{ padding: '10px 14px', color: '#334155', whiteSpace: 'nowrap' }}>
                                {new Date(w.createdAt).toLocaleString('pt-BR')}
                              </td>
                              <td style={{ padding: '10px 12px', fontFamily: 'monospace', color: '#0F172A' }}>
                                {w.pixType?.toUpperCase()}: {w.pixKey}
                              </td>
                              <td style={{ padding: '10px 12px', fontWeight: 700, color: '#0F172A' }}>
                                {formatBRL(w.amount)}
                              </td>
                              <td style={{ padding: '10px 12px' }}>
                                <span style={{
                                  padding: '2px 8px',
                                  borderRadius: 6,
                                  fontSize: '0.68rem',
                                  fontWeight: 600,
                                  backgroundColor: w.status === 'pago' ? '#F0FDF4' : w.status === 'rejeitado' ? '#FEF2F2' : '#FFFBEB',
                                  color: w.status === 'pago' ? '#15803D' : w.status === 'rejeitado' ? '#B91C1C' : '#B45309'
                                }}>
                                  {w.status.toUpperCase()}
                                </span>
                              </td>
                              <td style={{ padding: '10px 12px', color: '#64748B' }}>
                                {w.notes || '—'}
                              </td>
                              <td style={{ padding: '10px 14px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                                {w.status === 'solicitado' && (
                                  <div style={{ display: 'inline-flex', gap: 6 }}>
                                    <button
                                      type="button"
                                      onClick={() => handleProcessWithdrawal(w.id, 'approve')}
                                      style={{
                                        padding: '4px 10px',
                                        borderRadius: 6,
                                        border: 'none',
                                        backgroundColor: '#16A34A',
                                        color: '#FFFFFF',
                                        fontWeight: 600,
                                        fontSize: '0.7rem',
                                        cursor: 'pointer'
                                      }}
                                    >
                                      Confirmar PIX
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleProcessWithdrawal(w.id, 'reject')}
                                      style={{
                                        padding: '4px 10px',
                                        borderRadius: 6,
                                        border: '1px solid #FECACA',
                                        backgroundColor: '#FFFFFF',
                                        color: '#DC2626',
                                        fontWeight: 600,
                                        fontSize: '0.7rem',
                                        cursor: 'pointer'
                                      }}
                                    >
                                      Recusar
                                    </button>
                                  </div>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ABA 4: EXTRATO DA CARTEIRA / LIVRO-RAZÃO */}
            {driverModalTab === 'extrato' && (
              <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, overflow: 'hidden' }}>
                {driverLedger.length === 0 ? (
                  <div style={{ padding: '40px 20px', textAlign: 'center', color: '#64748B', fontSize: '0.82rem' }}>
                    Nenhum lançamento contábil registrado para este motorista.
                  </div>
                ) : (
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.76rem' }}>
                      <thead>
                        <tr style={{ backgroundColor: '#F8FAFC', borderBottom: '1px solid #E2E8F0', color: '#64748B', fontSize: '0.68rem', textTransform: 'uppercase' }}>
                          <th style={{ padding: '10px 14px', fontWeight: 600 }}>Data / Hora</th>
                          <th style={{ padding: '10px 12px', fontWeight: 600 }}>Tipo</th>
                          <th style={{ padding: '10px 12px', fontWeight: 600 }}>Corrida</th>
                          <th style={{ padding: '10px 12px', fontWeight: 600 }}>Bruto</th>
                          <th style={{ padding: '10px 12px', fontWeight: 600 }}>Taxa</th>
                          <th style={{ padding: '10px 12px', fontWeight: 600 }}>Impacto Carteira</th>
                          <th style={{ padding: '10px 14px', fontWeight: 600 }}>Descrição</th>
                        </tr>
                      </thead>
                      <tbody>
                        {driverLedger.map(entry => (
                          <tr key={entry.id} style={{ borderBottom: '1px solid #F1F5F9' }}>
                            <td style={{ padding: '10px 14px', color: '#64748B', whiteSpace: 'nowrap' }}>
                              {new Date(entry.createdAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                            </td>
                            <td style={{ padding: '10px 12px', fontWeight: 600, color: '#0F172A' }}>{entry.entryType}</td>
                            <td style={{ padding: '10px 12px', color: '#334155' }}>{entry.rideCode || entry.rideId || '—'}</td>
                            <td style={{ padding: '10px 12px', color: '#334155' }}>{formatBRL(entry.grossAmount)}</td>
                            <td style={{ padding: '10px 12px', color: '#64748B' }}>{entry.commissionAmount > 0 ? formatBRL(entry.commissionAmount) : '—'}</td>
                            <td style={{
                              padding: '10px 12px',
                              fontWeight: 700,
                              color: entry.balanceDelta > 0 ? '#15803D' : entry.balanceDelta < 0 ? '#DC2626' : '#475569'
                            }}>
                              {entry.balanceDelta > 0 ? '+' : ''}{formatBRL(entry.balanceDelta)}
                            </td>
                            <td style={{ padding: '10px 14px', color: '#64748B' }}>{entry.description}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  const renderDriverTermsModal = () => (
    <DriverTermsContractModal
      isOpen={Boolean(termsViewerDriver)}
      onClose={() => setTermsViewerDriver(null)}
      mode="admin"
      driver={termsViewerDriver}
      config={config}
    />
  );

  // Se foi aberto pela aba "Motoristas" da barra lateral, exibe a tela dedicada de Gestão de Frota
  if (isFleetStandaloneView) {
    const onlineCount = drivers.filter(d => d.isOnline && d.approvalStatus === 'aprovado').length;
    const pendingCount = drivers.filter(d => d.approvalStatus === 'pendente_aprovacao' || d.approvalStatus === 'pendente').length;
    const inReviewCount = drivers.filter(d => d.approvalStatus === 'em_analise').length;
    const correctionsCount = drivers.filter(d => d.approvalStatus === 'correcao_solicitada').length;
    const approvedCount = drivers.filter(d => d.approvalStatus === 'aprovado').length;
    const rejectedCount = drivers.filter(d => d.approvalStatus === 'rejeitado').length;
    const blockedCount = drivers.filter(d => d.financialBlocked).length;

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {renderDriverFullDossierModal()}
        {renderAdminKycReviewModal()}
        {renderDriverTermsModal()}

        {/* Cabeçalho Limpo da Aba de Motoristas */}
        <div style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          paddingBottom: 14,
          borderBottom: '1px solid #E2E8F0'
        }}>
          <div>
            <h2 style={{ fontSize: '1.15rem', fontWeight: 700, color: '#0F172A', margin: 0, letterSpacing: '-0.01em' }}>
              Frota de Motoristas & Aprovação Cadastral
            </h2>
            <p style={{ fontSize: '0.78rem', color: '#64748B', margin: '2px 0 0 0' }}>
              Clique em qualquer motorista para abrir a ficha completa (Avaliação, Corridas, Saques PIX e Extrato)
            </p>
          </div>

          <button
            type="button"
            onClick={loadAll}
            style={{
              height: 34,
              padding: '0 12px',
              borderRadius: 6,
              border: '1px solid #CBD5E1',
              backgroundColor: '#FFFFFF',
              color: '#334155',
              fontSize: '0.76rem',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6
            }}
          >
            <RefreshCw size={13} className={isLoading ? 'animate-spin' : ''} />
            <span>Atualizar Frota</span>
          </button>
        </div>

        {/* 4 Cards Uniformes da Frota */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
          gap: 14
        }}>
          <div style={{ backgroundColor: '#FFFFFF', borderRadius: 10, padding: '16px 18px', border: '1px solid #E2E8F0' }}>
            <div style={{ fontSize: '0.74rem', fontWeight: 600, color: '#64748B' }}>Total Cadastrados</div>
            <div style={{ fontSize: '1.55rem', fontWeight: 700, color: '#0F172A', marginTop: 6 }}>{drivers.length}</div>
            <div style={{ fontSize: '0.72rem', color: '#64748B', marginTop: 6 }}>Base ativa de parceiros</div>
          </div>

          <div style={{ backgroundColor: '#FFFFFF', borderRadius: 10, padding: '16px 18px', border: '1px solid #E2E8F0' }}>
            <div style={{ fontSize: '0.74rem', fontWeight: 600, color: '#64748B' }}>Online no Radar</div>
            <div style={{ fontSize: '1.55rem', fontWeight: 700, color: '#15803D', marginTop: 6 }}>{onlineCount}</div>
            <div style={{ fontSize: '0.72rem', color: '#64748B', marginTop: 6 }}>Disponíveis para chamadas</div>
          </div>

          <div style={{ backgroundColor: '#FFFFFF', borderRadius: 10, padding: '16px 18px', border: '1px solid #E2E8F0' }}>
            <div style={{ fontSize: '0.74rem', fontWeight: 600, color: '#64748B' }}>Fila de Validação KYC</div>
            <div style={{ fontSize: '1.55rem', fontWeight: 700, color: (inReviewCount + pendingCount + correctionsCount) > 0 ? '#B45309' : '#0F172A', marginTop: 6 }}>
              {inReviewCount + pendingCount + correctionsCount}
            </div>
            <div style={{ fontSize: '0.72rem', color: '#64748B', marginTop: 6 }}>
              {inReviewCount} em análise • {correctionsCount} correções
            </div>
          </div>

          <div style={{ backgroundColor: '#FFFFFF', borderRadius: 10, padding: '16px 18px', border: '1px solid #E2E8F0' }}>
            <div style={{ fontSize: '0.74rem', fontWeight: 600, color: '#64748B' }}>Bloqueados / Inadimplentes</div>
            <div style={{ fontSize: '1.55rem', fontWeight: 700, color: blockedCount > 0 ? '#DC2626' : '#0F172A', marginTop: 6 }}>{blockedCount}</div>
            <div style={{ fontSize: '0.72rem', color: '#64748B', marginTop: 6 }}>Teto de dívida: {formatBRL(currentDebtLimit)}</div>
          </div>
        </div>

        {/* Banner acionável quando há cadastros ou documentos KYC aguardando aprovação */}
        {(inReviewCount > 0 || pendingCount > 0 || correctionsCount > 0) && (
          <div style={{
            backgroundColor: '#EFF6FF',
            border: '1px solid #BFDBFE',
            borderRadius: 10,
            padding: '12px 16px',
            marginBottom: 14,
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 10
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#1E3A8A', fontSize: '0.8rem', fontWeight: 600 }}>
              <ShieldAlert size={18} color="#2563EB" />
              <span>
                Fila de Aprovação Ativa: <strong>{inReviewCount}</strong> com KYC em análise, <strong>{pendingCount}</strong> aguardando documentos e <strong>{correctionsCount}</strong> em correção.
              </span>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {inReviewCount > 0 && (
                <button
                  type="button"
                  onClick={() => setDriverStatusFilter('em_analise')}
                  style={{
                    padding: '6px 12px',
                    borderRadius: 6,
                    border: 'none',
                    backgroundColor: '#1D4ED8',
                    color: '#FFFFFF',
                    fontSize: '0.74rem',
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  Analisar KYC ({inReviewCount})
                </button>
              )}
              {pendingCount > 0 && (
                <button
                  type="button"
                  onClick={() => setDriverStatusFilter('pendente_aprovacao')}
                  style={{
                    padding: '6px 12px',
                    borderRadius: 6,
                    border: '1px solid #93C5FD',
                    backgroundColor: '#FFFFFF',
                    color: '#1E40AF',
                    fontSize: '0.74rem',
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  Ver Pendentes ({pendingCount})
                </button>
              )}
            </div>
          </div>
        )}

        {/* Tabela Corporativa de Motoristas */}
        <div style={{ backgroundColor: '#FFFFFF', borderRadius: 10, border: '1px solid #E2E8F0', overflow: 'hidden' }}>
          <div style={{
            padding: '14px 18px',
            borderBottom: '1px solid #E2E8F0',
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12
          }}>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {[
                { id: 'todos', label: `Todos (${drivers.length})` },
                { id: 'em_analise', label: `Em Análise KYC (${inReviewCount})` },
                { id: 'correcao_solicitada', label: `Correção Solicitada (${correctionsCount})` },
                { id: 'pendente_aprovacao', label: `Pendentes (${pendingCount})` },
                { id: 'aprovado', label: `Aprovados (${approvedCount})` },
                { id: 'rejeitado', label: `Rejeitados (${rejectedCount})` },
                { id: 'inadimplentes', label: `Com Dívida / Bloqueados (${blockedCount})` }
              ].map(f => {
                const active = driverStatusFilter === f.id;
                return (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setDriverStatusFilter(f.id as any)}
                    style={{
                      padding: '6px 12px',
                      borderRadius: 6,
                      border: active ? '1px solid #0F172A' : '1px solid transparent',
                      backgroundColor: active ? '#0F172A' : 'transparent',
                      color: active ? '#FFFFFF' : '#64748B',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                  >
                    {f.label}
                  </button>
                );
              })}
            </div>

            <div style={{ position: 'relative', minWidth: 260, flex: '0 1 320px' }}>
              <Search size={14} color="#94A3B8" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' }} />
              <input
                type="text"
                value={driverSearch}
                onChange={(e) => setDriverSearch(e.target.value)}
                placeholder="Buscar por nome, CPF, telefone ou placa..."
                style={{
                  width: '100%',
                  height: 34,
                  padding: '0 12px 0 32px',
                  borderRadius: 6,
                  border: '1px solid #CBD5E1',
                  fontSize: '0.76rem',
                  color: '#0F172A'
                }}
              />
            </div>
          </div>

          {filteredDrivers.length === 0 ? (
            <div style={{ padding: '40px 20px', textAlign: 'center', color: '#64748B', fontSize: '0.82rem' }}>
              Nenhum motorista encontrado para este filtro.
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.78rem' }}>
                <thead>
                  <tr style={{ backgroundColor: '#F8FAFC', borderBottom: '1px solid #E2E8F0', color: '#64748B', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                    <th style={{ padding: '10px 16px', fontWeight: 600 }}>Motorista</th>
                    <th style={{ padding: '10px 14px', fontWeight: 600 }}>Avaliação</th>
                    <th style={{ padding: '10px 14px', fontWeight: 600 }}>CPF / CNH</th>
                    <th style={{ padding: '10px 14px', fontWeight: 600 }}>Veículo & Placa</th>
                    <th style={{ padding: '10px 14px', fontWeight: 600 }}>Chave PIX</th>
                    <th style={{ padding: '10px 14px', fontWeight: 600 }}>Saldo Livre</th>
                    <th style={{ padding: '10px 14px', fontWeight: 600 }}>Dívida (Dinheiro)</th>
                    <th style={{ padding: '10px 14px', fontWeight: 600 }}>Status</th>
                    <th style={{ padding: '10px 16px', fontWeight: 600, textAlign: 'right' }}>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredDrivers.map(drv => {
                    const wallet = overview?.driverWallets?.find(w => w.driverId === drv.id);
                    const avail = wallet?.availableBalance ?? 0;
                    const debt = wallet?.debtBalance ?? 0;
                    const drvRides = rides.filter(
                      r => r.driverId === drv.id || (r.driverName && r.driverName.trim().toLowerCase() === drv.name.trim().toLowerCase())
                    );
                    const drvScore = computeDriverAutoScore(drv, drvRides, wallet);

                    return (
                      <tr
                        key={drv.id}
                        onClick={() => {
                          setDriverModalTab('resumo');
                          setSelectedDriverId(drv.id);
                        }}
                        style={{ borderBottom: '1px solid #F1F5F9', cursor: 'pointer' }}
                      >
                        <td style={{ padding: '12px 16px', whiteSpace: 'nowrap' }}>
                          <div style={{ fontWeight: 600, color: '#0F172A' }}>{drv.name}</div>
                          <div style={{ fontSize: '0.7rem', color: '#64748B' }}>{formatPhone(drv.phone) || drv.phone}</div>
                        </td>

                        <td style={{ padding: '12px 14px', whiteSpace: 'nowrap' }}>
                          <div style={{ fontWeight: 700, color: '#B45309' }}>
                            {drvScore.averageRating.toFixed(2)} ★
                          </div>
                          <span style={{
                            display: 'inline-block',
                            marginTop: 3,
                            padding: '1px 6px',
                            borderRadius: 4,
                            fontSize: '0.66rem',
                            fontWeight: 700,
                            backgroundColor: drvScore.levelBg,
                            color: drvScore.levelColor,
                            border: `1px solid ${drvScore.levelBorder}`
                          }}>
                            {drvScore.score} pts • {drvScore.level}
                          </span>
                        </td>

                        <td style={{ padding: '12px 14px', fontSize: '0.74rem', color: '#334155', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                          <div>CPF: {formatDocument(drv.document) || '—'}</div>
                          <div style={{ fontSize: '0.68rem', color: '#64748B' }}>CNH: {formatCNHPunctuated(drv.cnh) || '—'}</div>
                        </td>

                        <td style={{ padding: '12px 14px' }}>
                          <div style={{ fontWeight: 600, color: '#0F172A', fontSize: '0.75rem' }}>
                            {drv.vehicleBrand} {drv.vehicleModel} ({drv.vehicleColor})
                          </div>
                          <div style={{ fontSize: '0.7rem', color: '#64748B', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
                            Placa: {formatPlateDisplay(drv.vehiclePlate) || '—'}
                          </div>
                        </td>

                        <td style={{ padding: '12px 14px', fontSize: '0.73rem', color: '#334155', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
                          {formatPixKey(drv.pixKey, drv.pixType) || 'Não informada'}
                        </td>

                        <td style={{ padding: '12px 14px', fontWeight: 600, color: '#15803D', whiteSpace: 'nowrap' }}>
                          {formatBRL(avail)}
                        </td>

                        <td style={{ padding: '12px 14px', fontWeight: 600, color: debt > 0 ? '#DC2626' : '#64748B', whiteSpace: 'nowrap' }}>
                          {formatBRL(debt)}
                        </td>

                        <td style={{ padding: '12px 14px' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-start' }}>
                            <span style={{
                              padding: '2px 8px',
                              borderRadius: 6,
                              fontSize: '0.68rem',
                              fontWeight: 700,
                              backgroundColor:
                                drv.approvalStatus === 'aprovado' ? '#F0FDF4' :
                                drv.approvalStatus === 'em_analise' ? '#EFF6FF' :
                                drv.approvalStatus === 'correcao_solicitada' ? '#FFFBEB' :
                                drv.approvalStatus === 'rejeitado' ? '#FEF2F2' : '#FFFBEB',
                              border: `1px solid ${
                                drv.approvalStatus === 'aprovado' ? '#BBF7D0' :
                                drv.approvalStatus === 'em_analise' ? '#BFDBFE' :
                                drv.approvalStatus === 'correcao_solicitada' ? '#FDE68A' :
                                drv.approvalStatus === 'rejeitado' ? '#FECACA' : '#FDE68A'
                              }`,
                              color:
                                drv.approvalStatus === 'aprovado' ? '#15803D' :
                                drv.approvalStatus === 'em_analise' ? '#1D4ED8' :
                                drv.approvalStatus === 'correcao_solicitada' ? '#B45309' :
                                drv.approvalStatus === 'rejeitado' ? '#B91C1C' : '#B45309'
                            }}>
                              {drv.approvalStatus === 'aprovado' ? 'Aprovado' :
                               drv.approvalStatus === 'em_analise' ? 'Em Análise KYC' :
                               drv.approvalStatus === 'correcao_solicitada' ? 'Correção Solicitada' :
                               drv.approvalStatus === 'rejeitado' ? 'Rejeitado' : 'Pendente'}
                            </span>
                            {(() => {
                              const bioSummary = getBiometricSummary(drv);
                              if (!bioSummary) return null;
                              return (
                                <span style={{
                                  fontSize: '0.65rem',
                                  padding: '1px 6px',
                                  borderRadius: 4,
                                  fontWeight: 700,
                                  backgroundColor: bioSummary.isMatch ? '#DCFCE7' : '#FEE2E2',
                                  color: bioSummary.isMatch ? '#166534' : '#991B1B'
                                }}>
                                  ⚡ {bioSummary.similarity}% Facial IA
                                </span>
                              );
                            })()}
                            {drv.termsSignature?.signed && (
                              <span
                                title={`Certificado ${drv.termsSignature.validationCode} • ${drv.termsSignature.signedAtBrasilia}`}
                                style={{
                                  fontSize: '0.65rem',
                                  padding: '1px 6px',
                                  borderRadius: 4,
                                  fontWeight: 700,
                                  backgroundColor: '#DCFCE7',
                                  color: '#15803D',
                                  border: '1px solid #BBF7D0'
                                }}
                              >
                                ✓ Termo Assinado
                              </span>
                            )}
                            {drv.financialBlocked && (
                              <span style={{ fontSize: '0.64rem', color: '#DC2626', fontWeight: 600 }}>
                                Bloqueado Financeiro
                              </span>
                            )}
                          </div>
                        </td>

                        <td
                          style={{ padding: '12px 16px', textAlign: 'right', verticalAlign: 'middle' }}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
                            {/* Linha 1: Documentos, KYC e Ficha */}
                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'nowrap' }}>
                              <button
                                type="button"
                                onClick={() => setTermsViewerDriver(drv)}
                                style={{
                                  height: 28,
                                  padding: '0 10px',
                                  borderRadius: 6,
                                  border: drv.termsSignature?.signed ? '1px solid #16A34A' : '1px solid #CBD5E1',
                                  backgroundColor: drv.termsSignature?.signed ? '#F0FDF4' : '#F8FAFC',
                                  color: drv.termsSignature?.signed ? '#15803D' : '#475569',
                                  fontSize: '0.71rem',
                                  fontWeight: 700,
                                  cursor: 'pointer',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: 4,
                                  whiteSpace: 'nowrap'
                                }}
                              >
                                <FileText size={12} />
                                <span>{drv.termsSignature?.signed ? 'Termo Assinado' : 'Termo'}</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => setReviewingKycDriver(drv)}
                                style={{
                                  height: 28,
                                  padding: '0 10px',
                                  borderRadius: 6,
                                  border: '1px solid #2563EB',
                                  backgroundColor: '#EFF6FF',
                                  color: '#1D4ED8',
                                  fontSize: '0.71rem',
                                  fontWeight: 700,
                                  cursor: 'pointer',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: 4,
                                  whiteSpace: 'nowrap'
                                }}
                              >
                                <ShieldCheck size={12} />
                                <span>KYC & Biometria</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => {
                                  setDriverModalTab('resumo');
                                  setSelectedDriverId(drv.id);
                                }}
                                style={{
                                  height: 28,
                                  padding: '0 10px',
                                  borderRadius: 6,
                                  border: '1px solid #0F172A',
                                  backgroundColor: '#0F172A',
                                  color: '#FFFFFF',
                                  fontSize: '0.71rem',
                                  fontWeight: 600,
                                  cursor: 'pointer',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: 4,
                                  whiteSpace: 'nowrap'
                                }}
                              >
                                <Eye size={12} />
                                <span>Ver Histórico</span>
                              </button>
                            </div>

                            {/* Linha 2: Decisão de Aprovação / Bloqueio */}
                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'nowrap' }}>
                              {(drv.approvalStatus === 'pendente_aprovacao' || drv.approvalStatus === 'pendente' || drv.approvalStatus === 'em_analise') && (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => handleDriverApproval(drv.id, 'aprovado')}
                                    style={{
                                      height: 28,
                                      padding: '0 12px',
                                      borderRadius: 6,
                                      border: '1px solid #16A34A',
                                      backgroundColor: '#16A34A',
                                      color: '#FFFFFF',
                                      fontSize: '0.71rem',
                                      fontWeight: 700,
                                      cursor: 'pointer',
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: 4,
                                      whiteSpace: 'nowrap'
                                    }}
                                  >
                                    <Check size={12} />
                                    <span>Aprovar</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleDriverApproval(drv.id, 'rejeitado')}
                                    style={{
                                      height: 28,
                                      padding: '0 12px',
                                      borderRadius: 6,
                                      border: '1px solid #FECACA',
                                      backgroundColor: '#FEF2F2',
                                      color: '#DC2626',
                                      fontSize: '0.71rem',
                                      fontWeight: 700,
                                      cursor: 'pointer',
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: 4,
                                      whiteSpace: 'nowrap'
                                    }}
                                  >
                                    <X size={12} />
                                    <span>Recusar</span>
                                  </button>
                                </>
                              )}

                              {drv.approvalStatus === 'aprovado' && (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => handleToggleDriverFinancialBlock(drv, Boolean(drv.financialBlocked))}
                                    style={{
                                      height: 28,
                                      padding: '0 11px',
                                      borderRadius: 6,
                                      border: '1px solid #CBD5E1',
                                      backgroundColor: '#FFFFFF',
                                      color: drv.financialBlocked ? '#15803D' : '#334155',
                                      fontSize: '0.71rem',
                                      fontWeight: 600,
                                      cursor: 'pointer',
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: 4,
                                      whiteSpace: 'nowrap'
                                    }}
                                  >
                                    {drv.financialBlocked ? <Unlock size={12} /> : <Lock size={12} />}
                                    <span>{drv.financialBlocked ? 'Desbloquear' : 'Bloquear'}</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleDriverApproval(drv.id, 'suspenso')}
                                    style={{
                                      height: 28,
                                      padding: '0 11px',
                                      borderRadius: 6,
                                      border: '1px solid #E2E8F0',
                                      backgroundColor: '#F8FAFC',
                                      color: '#64748B',
                                      fontSize: '0.71rem',
                                      fontWeight: 600,
                                      cursor: 'pointer',
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      whiteSpace: 'nowrap'
                                    }}
                                  >
                                    Suspender
                                  </button>
                                </>
                              )}

                              {(drv.approvalStatus === 'suspenso' || drv.approvalStatus === 'rejeitado') && (
                                <button
                                  type="button"
                                  onClick={() => handleDriverApproval(drv.id, 'aprovado')}
                                  style={{
                                    height: 28,
                                    padding: '0 12px',
                                    borderRadius: 6,
                                    border: '1px solid #16A34A',
                                    backgroundColor: '#16A34A',
                                    color: '#FFFFFF',
                                    fontSize: '0.71rem',
                                    fontWeight: 700,
                                    cursor: 'pointer',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: 4,
                                    whiteSpace: 'nowrap'
                                  }}
                                >
                                  <Check size={12} />
                                  <span>Reativar</span>
                                </button>
                              )}
                            </div>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ═══ VISÃO PRINCIPAL: CONSOLE FINANCEIRO, TAXAS & LIVRO-RAZÃO ═══
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {renderDriverFullDossierModal()}
      {renderAdminKycReviewModal()}
      {renderDriverTermsModal()}

      {/* Cabeçalho Limpo + Seletor de Período */}
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12
      }}>
        <div>
          <h2 style={{ fontSize: '1.15rem', fontWeight: 700, color: '#0F172A', margin: 0, letterSpacing: '-0.01em' }}>
            Console Financeiro & Conciliação
          </h2>
          <p style={{ fontSize: '0.78rem', color: '#64748B', margin: '2px 0 0 0' }}>
            Entradas de corridas, retenção de taxas ({currentCommPct}%), saldos dos motoristas e livro-razão
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <div style={{
            display: 'inline-flex',
            backgroundColor: '#F1F5F9',
            padding: 3,
            borderRadius: 8,
            border: '1px solid #E2E8F0'
          }}>
            {[
              { id: 'diario', label: 'Hoje' },
              { id: 'semanal', label: '7 dias' },
              { id: 'mensal', label: '30 dias' },
              { id: 'todos', label: 'Todo o período' }
            ].map(p => {
              const active = periodFilter === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setPeriodFilter(p.id as any)}
                  style={{
                    padding: '5px 11px',
                    borderRadius: 6,
                    border: 'none',
                    backgroundColor: active ? '#FFFFFF' : 'transparent',
                    color: active ? '#0F172A' : '#64748B',
                    fontWeight: active ? 600 : 500,
                    fontSize: '0.74rem',
                    boxShadow: active ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
                    cursor: 'pointer'
                  }}
                >
                  {p.label}
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={loadAll}
            style={{
              height: 32,
              padding: '0 12px',
              borderRadius: 6,
              border: '1px solid #CBD5E1',
              backgroundColor: '#FFFFFF',
              color: '#334155',
              fontSize: '0.74rem',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6
            }}
          >
            <RefreshCw size={13} className={isLoading ? 'animate-spin' : ''} />
            <span>Atualizar</span>
          </button>
        </div>
      </div>

      {/* 4 Cards Executivos Uniformes */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: 14
      }}>
        <div style={{ backgroundColor: '#FFFFFF', borderRadius: 10, padding: '16px 18px', border: '1px solid #E2E8F0', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.74rem', fontWeight: 600, color: '#64748B' }}>Receita da Plataforma ({currentCommPct}%)</span>
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: 700, color: '#0F172A', letterSpacing: '-0.02em' }}>
            {formatBRL(periodMetrics.platformFee)}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: '#64748B', borderTop: '1px solid #F1F5F9', paddingTop: 8 }}>
            <span>Digital: <strong style={{ color: '#0F172A' }}>{formatBRL(periodMetrics.pixFee + periodMetrics.cardFee)}</strong></span>
            <span>Dinheiro: <strong style={{ color: '#0F172A' }}>{formatBRL(periodMetrics.cashFee)}</strong></span>
          </div>
        </div>

        <div style={{ backgroundColor: '#FFFFFF', borderRadius: 10, padding: '16px 18px', border: '1px solid #E2E8F0', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.74rem', fontWeight: 600, color: '#64748B' }}>Volume Bruto (GMV)</span>
            <span style={{ fontSize: '0.7rem', color: '#64748B', fontWeight: 600 }}>{periodMetrics.ridesCount} corrida(s)</span>
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: 700, color: '#0F172A', letterSpacing: '-0.02em' }}>
            {formatBRL(periodMetrics.gross)}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: '#64748B', borderTop: '1px solid #F1F5F9', paddingTop: 8 }}>
            <span>Ticket Médio: <strong style={{ color: '#0F172A' }}>{formatBRL(periodMetrics.avgTicket)}</strong></span>
            <span>Estornos: <strong style={{ color: '#0F172A' }}>{formatBRL(periodMetrics.refundedTotal)}</strong></span>
          </div>
        </div>

        <div style={{ backgroundColor: '#FFFFFF', borderRadius: 10, padding: '16px 18px', border: '1px solid #E2E8F0', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.74rem', fontWeight: 600, color: '#64748B' }}>Líquido Motoristas ({100 - currentCommPct}%)</span>
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: 700, color: '#15803D', letterSpacing: '-0.02em' }}>
            {formatBRL(periodMetrics.driverNet)}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: '#64748B', borderTop: '1px solid #F1F5F9', paddingTop: 8 }}>
            <span>Disponível p/ saque: <strong style={{ color: '#0F172A' }}>{formatBRL(overview?.totalAvailableForDrivers || 0)}</strong></span>
          </div>
        </div>

        <div style={{ backgroundColor: '#FFFFFF', borderRadius: 10, padding: '16px 18px', border: '1px solid #E2E8F0', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.74rem', fontWeight: 600, color: '#64748B' }}>Dívidas Pendentes (Dinheiro)</span>
            <span style={{ fontSize: '0.7rem', color: '#64748B', fontWeight: 600 }}>Teto: {formatBRL(currentDebtLimit)}</span>
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: 700, color: (overview?.totalPendingDriverDebt || 0) > 0 ? '#DC2626' : '#0F172A', letterSpacing: '-0.02em' }}>
            {formatBRL(overview?.totalPendingDriverDebt || 0)}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: '#64748B', borderTop: '1px solid #F1F5F9', paddingTop: 8 }}>
            <span>Motoristas bloqueados: <strong style={{ color: '#0F172A' }}>{overview?.delinquentDriversCount || 0}</strong></span>
          </div>
        </div>
      </div>

      {/* Navegação de Sub-Abas Limpa (Estilo Underline Corporativo) */}
      <div style={{
        display: 'flex',
        gap: 20,
        borderBottom: '1px solid #E2E8F0',
        overflowX: 'auto'
      }}>
        {[
          { id: 'visao_geral', label: 'Entradas de Corridas & Taxas' },
          { id: 'regras', label: `Regras de Comissão & Split (${currentCommPct}%)` },
          { id: 'motoristas', label: `Carteiras dos Motoristas (${drivers.length})` },
          { id: 'saques', label: `Saques & Repasses PIX (${(overview?.withdrawals || []).length})` },
          { id: 'livro_razao', label: `Livro-Razão Contábil (${filteredLedger.length})` }
        ].map(tab => {
          const active = subTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setSubTab(tab.id as any)}
              style={{
                padding: '10px 4px',
                background: 'none',
                border: 'none',
                borderBottom: active ? '2px solid #0F172A' : '2px solid transparent',
                color: active ? '#0F172A' : '#64748B',
                fontWeight: active ? 700 : 500,
                fontSize: '0.8rem',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                marginBottom: -1
              }}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* ═══ SUB-ABA 1: ENTRADAS DE CORRIDAS & TAXAS ═══ */}
      {subTab === 'visao_geral' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
            gap: 14
          }}>
            {[
              { title: 'PIX Dinâmico (Gateway)', count: periodMetrics.pixCount, gross: periodMetrics.pixGross, fee: periodMetrics.pixFee, desc: 'Liquidação via webhook com split automático' },
              { title: 'Cartão (Crédito / Débito)', count: periodMetrics.cardCount, gross: periodMetrics.cardGross, fee: periodMetrics.cardFee, desc: 'Pré-autorizado na solicitação e capturado no fim' },
              { title: 'Dinheiro (Recebido pelo Motorista)', count: periodMetrics.cashCount, gross: periodMetrics.cashGross, fee: periodMetrics.cashFee, desc: 'Taxa lançada como débito na carteira do motorista' }
            ].map((ch, idx) => (
              <div key={idx} style={{
                backgroundColor: '#FFFFFF',
                borderRadius: 10,
                padding: '16px 18px',
                border: '1px solid #E2E8F0',
                display: 'flex',
                flexDirection: 'column',
                gap: 10
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#0F172A' }}>{ch.title}</span>
                  <span style={{ fontSize: '0.7rem', color: '#64748B', fontWeight: 500 }}>{ch.count} viagem(ns)</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <div>
                    <div style={{ fontSize: '0.66rem', color: '#64748B', textTransform: 'uppercase' }}>Volume Bruto</div>
                    <div style={{ fontSize: '1.15rem', fontWeight: 700, color: '#0F172A' }}>{formatBRL(ch.gross)}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '0.66rem', color: '#64748B', textTransform: 'uppercase' }}>Taxa ({currentCommPct}%)</div>
                    <div style={{ fontSize: '1rem', fontWeight: 700, color: '#15803D' }}>{formatBRL(ch.fee)}</div>
                  </div>
                </div>
                <div style={{ fontSize: '0.7rem', color: '#64748B', borderTop: '1px solid #F1F5F9', paddingTop: 8 }}>
                  {ch.desc}
                </div>
              </div>
            ))}
          </div>

          <div style={{ backgroundColor: '#FFFFFF', borderRadius: 10, border: '1px solid #E2E8F0', overflow: 'hidden' }}>
            <div style={{
              padding: '14px 18px',
              borderBottom: '1px solid #E2E8F0',
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12
            }}>
              <div>
                <div style={{ fontSize: '0.88rem', fontWeight: 700, color: '#0F172A' }}>
                  Demonstrativo de Entradas por Corrida
                </div>
                <div style={{ fontSize: '0.73rem', color: '#64748B' }}>
                  Detalhamento de valor bruto, comissão retida pela plataforma e valor líquido do motorista
                </div>
              </div>

              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <div style={{ position: 'relative', minWidth: 220 }}>
                  <Search size={14} color="#94A3B8" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' }} />
                  <input
                    type="text"
                    placeholder="Buscar corrida, passageiro ou motorista..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    style={{
                      width: '100%',
                      height: 34,
                      padding: '0 10px 0 30px',
                      borderRadius: 6,
                      border: '1px solid #CBD5E1',
                      fontSize: '0.75rem'
                    }}
                  />
                </div>

                <select
                  value={methodFilter}
                  onChange={(e) => setMethodFilter(e.target.value)}
                  style={{ height: 34, padding: '0 10px', borderRadius: 6, border: '1px solid #CBD5E1', fontSize: '0.75rem', color: '#334155', backgroundColor: '#FFFFFF' }}
                >
                  <option value="todos">Todos os Métodos</option>
                  <option value="pix">PIX</option>
                  <option value="dinheiro">Dinheiro</option>
                  <option value="cartao_credito">Cartão de Crédito</option>
                  <option value="cartao_debito">Cartão de Débito</option>
                </select>

                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  style={{ height: 34, padding: '0 10px', borderRadius: 6, border: '1px solid #CBD5E1', fontSize: '0.75rem', color: '#334155', backgroundColor: '#FFFFFF' }}
                >
                  <option value="todos">Todos os Status</option>
                  <option value="confirmado">Liquidado</option>
                  <option value="autorizado">Autorizado</option>
                  <option value="aguardando">Aguardando</option>
                  <option value="reembolsado">Estornado</option>
                </select>
              </div>
            </div>

            {filteredTransactions.length === 0 ? (
              <div style={{ padding: '40px 20px', textAlign: 'center', color: '#64748B', fontSize: '0.82rem' }}>
                Nenhuma transação registrada para os filtros selecionados.
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.78rem' }}>
                  <thead>
                    <tr style={{ backgroundColor: '#F8FAFC', borderBottom: '1px solid #E2E8F0', color: '#64748B', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                      <th style={{ padding: '10px 16px', fontWeight: 600 }}>Corrida</th>
                      <th style={{ padding: '10px 14px', fontWeight: 600 }}>Passageiro</th>
                      <th style={{ padding: '10px 14px', fontWeight: 600 }}>Motorista</th>
                      <th style={{ padding: '10px 14px', fontWeight: 600 }}>Método</th>
                      <th style={{ padding: '10px 14px', fontWeight: 600 }}>Entrada Bruta</th>
                      <th style={{ padding: '10px 14px', fontWeight: 600 }}>Taxa ({currentCommPct}%)</th>
                      <th style={{ padding: '10px 14px', fontWeight: 600 }}>Líquido Motorista</th>
                      <th style={{ padding: '10px 14px', fontWeight: 600 }}>Status</th>
                      <th style={{ padding: '10px 16px', fontWeight: 600, textAlign: 'right' }}>Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredTransactions.map(tx => (
                      <tr key={tx.id} style={{ borderBottom: '1px solid #F1F5F9' }}>
                        <td style={{ padding: '12px 16px', whiteSpace: 'nowrap' }}>
                          <div style={{ fontWeight: 700, color: '#0F172A' }}>{tx.rideCode || tx.rideId}</div>
                          <div style={{ fontSize: '0.68rem', color: '#64748B' }}>
                            {new Date(tx.createdAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                          </div>
                        </td>
                        <td style={{ padding: '12px 14px', fontWeight: 500, color: '#0F172A' }}>
                          {tx.clientName || 'Passageiro'}
                        </td>
                        <td style={{ padding: '12px 14px', color: '#334155' }}>
                          {tx.driverName || 'Motorista Parceiro'}
                        </td>
                        <td style={{ padding: '12px 14px', color: '#334155', fontWeight: 500 }}>
                          {renderMethodLabel(tx.method)}
                        </td>
                        <td style={{ padding: '12px 14px', fontWeight: 600, color: '#0F172A', whiteSpace: 'nowrap' }}>
                          {formatBRL(tx.finalAmount)}
                        </td>
                        <td style={{ padding: '12px 14px', fontWeight: 600, color: '#475569', whiteSpace: 'nowrap' }}>
                          {formatBRL(tx.commissionAmount)}
                        </td>
                        <td style={{ padding: '12px 14px', fontWeight: 600, color: '#15803D', whiteSpace: 'nowrap' }}>
                          {formatBRL(tx.driverNetAmount)}
                        </td>
                        <td style={{ padding: '12px 14px' }}>
                          {renderStatusBadge(tx.status)}
                        </td>
                        <td style={{ padding: '12px 16px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                          {tx.status !== 'reembolsado' && (
                            <div style={{ display: 'inline-flex', gap: 6 }}>
                              <button
                                type="button"
                                onClick={() => handlePaymentAction(tx.id, 'refund')}
                                style={{
                                  padding: '4px 8px',
                                  borderRadius: 6,
                                  border: '1px solid #CBD5E1',
                                  backgroundColor: '#FFFFFF',
                                  color: '#475569',
                                  fontSize: '0.68rem',
                                  fontWeight: 600,
                                  cursor: 'pointer'
                                }}
                              >
                                Estornar
                              </button>
                              <button
                                type="button"
                                onClick={() => handlePaymentAction(tx.id, 'dispute')}
                                style={{
                                  padding: '4px 8px',
                                  borderRadius: 6,
                                  border: '1px solid #FECACA',
                                  backgroundColor: '#FFFFFF',
                                  color: '#DC2626',
                                  fontSize: '0.68rem',
                                  fontWeight: 600,
                                  cursor: 'pointer'
                                }}
                              >
                                Contestar
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══ SUB-ABA 2: REGRAS DE COMISSÃO & SPLIT ═══ */}
      {subTab === 'regras' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 16 }}>
          <form
            onSubmit={handleSaveRules}
            style={{
              backgroundColor: '#FFFFFF',
              borderRadius: 10,
              padding: 20,
              border: '1px solid #E2E8F0',
              display: 'flex',
              flexDirection: 'column',
              gap: 16
            }}
          >
            <div>
              <h3 style={{ fontSize: '0.92rem', fontWeight: 700, color: '#0F172A', margin: 0 }}>
                Parâmetros de Comissão e Limite de Inadimplência
              </h3>
              <p style={{ fontSize: '0.74rem', color: '#64748B', margin: '2px 0 0 0' }}>
                Alterações aplicam-se imediatamente ao cálculo de novas corridas
              </p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 600, color: '#334155', marginBottom: 4 }}>
                  Taxa de Comissão da Plataforma (%)
                </label>
                <input
                  type="number"
                  step="0.5"
                  min="0"
                  max="100"
                  value={commPercentStr}
                  onChange={(e) => setCommPercentStr(e.target.value)}
                  style={{ width: '100%', height: 38, padding: '0 12px', borderRadius: 6, border: '1px solid #CBD5E1', fontSize: '0.85rem', fontWeight: 600, color: '#0F172A' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 600, color: '#334155', marginBottom: 4 }}>
                  Limite Máximo de Dívida em Dinheiro (R$)
                </label>
                <input
                  type="number"
                  step="5"
                  min="0"
                  value={debtLimitStr}
                  onChange={(e) => setDebtLimitStr(e.target.value)}
                  style={{ width: '100%', height: 38, padding: '0 12px', borderRadius: 6, border: '1px solid #CBD5E1', fontSize: '0.85rem', fontWeight: 600, color: '#0F172A' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 600, color: '#334155', marginBottom: 4 }}>
                  Valor Mínimo para Solicitação de Saque PIX (R$)
                </label>
                <input
                  type="number"
                  step="5"
                  min="1"
                  value={minWithdrawStr}
                  onChange={(e) => setMinWithdrawStr(e.target.value)}
                  style={{ width: '100%', height: 38, padding: '0 12px', borderRadius: 6, border: '1px solid #CBD5E1', fontSize: '0.85rem', fontWeight: 600, color: '#0F172A' }}
                />
              </div>

              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.76rem', color: '#334155', cursor: 'pointer', paddingTop: 4 }}>
                <input
                  type="checkbox"
                  checked={autoBlockDelinquent}
                  onChange={(e) => setAutoBlockDelinquent(e.target.checked)}
                  style={{ width: 15, height: 15, accentColor: '#0F172A' }}
                />
                <span>Bloquear automaticamente novas chamadas ao atingir o limite de dívida</span>
              </label>
            </div>

            {rulesSavedMsg && (
              <div style={{ padding: '8px 12px', borderRadius: 6, backgroundColor: '#F0FDF4', border: '1px solid #BBF7D0', color: '#15803D', fontSize: '0.75rem', fontWeight: 600 }}>
                {rulesSavedMsg}
              </div>
            )}

            <button
              type="submit"
              style={{
                height: 38,
                borderRadius: 6,
                border: 'none',
                backgroundColor: '#0F172A',
                color: '#FFFFFF',
                fontWeight: 600,
                fontSize: '0.8rem',
                cursor: 'pointer'
              }}
            >
              Salvar Configurações Financeiras
            </button>
          </form>

          <div style={{
            backgroundColor: '#FFFFFF',
            borderRadius: 10,
            padding: 20,
            border: '1px solid #E2E8F0',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            gap: 14
          }}>
            <div>
              <h3 style={{ fontSize: '0.92rem', fontWeight: 700, color: '#0F172A', margin: 0 }}>
                Simulação de Split (Corrida de R$ 50,00)
              </h3>
              <p style={{ fontSize: '0.74rem', color: '#64748B', margin: '2px 0 0 0' }}>
                Demonstrativo contábil aplicado pelo backend a cada corrida
              </p>
            </div>

            {(() => {
              const pct = Math.max(0, Math.min(100, parseFloat(commPercentStr.replace(',', '.')) || 20));
              const sampleFee = (50 * pct) / 100;
              const sampleNet = 50 - sampleFee;
              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: '0.78rem' }}>
                  <div style={{ padding: 12, borderRadius: 8, backgroundColor: '#F8FAFC', border: '1px solid #E2E8F0' }}>
                    <div style={{ fontWeight: 600, color: '#0F172A', marginBottom: 6 }}>Pagamentos Digitais (PIX / Cartão)</div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', color: '#475569', marginBottom: 3 }}>
                      <span>Valor pago pelo passageiro:</span>
                      <strong>R$ 50,00</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', color: '#475569', marginBottom: 3 }}>
                      <span>Taxa retida pela plataforma ({pct}%):</span>
                      <strong>{formatBRL(sampleFee)}</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', color: '#15803D', borderTop: '1px solid #E2E8F0', paddingTop: 6, marginTop: 4 }}>
                      <span>Crédito líquido na carteira do motorista:</span>
                      <strong>{formatBRL(sampleNet)}</strong>
                    </div>
                  </div>

                  <div style={{ padding: 12, borderRadius: 8, backgroundColor: '#F8FAFC', border: '1px solid #E2E8F0' }}>
                    <div style={{ fontWeight: 600, color: '#0F172A', marginBottom: 6 }}>Pagamentos em Dinheiro</div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', color: '#475569', marginBottom: 3 }}>
                      <span>Valor recebido em mãos pelo motorista:</span>
                      <strong>R$ 50,00</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', color: '#DC2626', borderTop: '1px solid #E2E8F0', paddingTop: 6, marginTop: 4 }}>
                      <span>Débito lançado na carteira do motorista ({pct}%):</span>
                      <strong>- {formatBRL(sampleFee)}</strong>
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* ═══ SUB-ABA 3: CARTEIRAS DOS MOTORISTAS ═══ */}
      {subTab === 'motoristas' && (
        <div style={{ backgroundColor: '#FFFFFF', borderRadius: 10, border: '1px solid #E2E8F0', overflow: 'hidden' }}>
          <div style={{ padding: '14px 18px', borderBottom: '1px solid #E2E8F0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
            <div>
              <div style={{ fontSize: '0.88rem', fontWeight: 700, color: '#0F172A' }}>Saldos & Carteiras Individuais</div>
              <div style={{ fontSize: '0.73rem', color: '#64748B' }}>Clique em qualquer motorista para ver Avaliação, Corridas, Saques PIX e Extrato Completo</div>
            </div>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.78rem' }}>
              <thead>
                <tr style={{ backgroundColor: '#F8FAFC', borderBottom: '1px solid #E2E8F0', color: '#64748B', fontSize: '0.7rem', textTransform: 'uppercase' }}>
                  <th style={{ padding: '10px 16px', fontWeight: 600 }}>Motorista</th>
                  <th style={{ padding: '10px 14px', fontWeight: 600 }}>Avaliação</th>
                  <th style={{ padding: '10px 14px', fontWeight: 600 }}>Chave PIX</th>
                  <th style={{ padding: '10px 14px', fontWeight: 600 }}>Saldo Disponível</th>
                  <th style={{ padding: '10px 14px', fontWeight: 600 }}>Recebido em Dinheiro</th>
                  <th style={{ padding: '10px 14px', fontWeight: 600 }}>Taxas Geradas</th>
                  <th style={{ padding: '10px 14px', fontWeight: 600 }}>Dívida Atual</th>
                  <th style={{ padding: '10px 16px', fontWeight: 600, textAlign: 'right' }}>Controle</th>
                </tr>
              </thead>
              <tbody>
                {drivers.map(drv => {
                  const wallet = overview?.driverWallets?.find(w => w.driverId === drv.id);
                  return (
                    <tr
                      key={drv.id}
                      onClick={() => {
                        setDriverModalTab('resumo');
                        setSelectedDriverId(drv.id);
                      }}
                      style={{ borderBottom: '1px solid #F1F5F9', cursor: 'pointer' }}
                    >
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ fontWeight: 600, color: '#0F172A' }}>{drv.name}</div>
                        <div style={{ fontSize: '0.7rem', color: '#64748B' }}>{drv.vehicleModel} • {drv.vehiclePlate}</div>
                      </td>
                      <td style={{ padding: '12px 14px', fontWeight: 700, color: '#B45309' }}>
                        {Number(drv.rating || 5.0).toFixed(2)} ★
                      </td>
                      <td style={{ padding: '12px 14px', color: '#334155', fontSize: '0.74rem' }}>{drv.pixKey || '—'}</td>
                      <td style={{ padding: '12px 14px', fontWeight: 600, color: '#15803D' }}>{formatBRL(wallet?.availableBalance || 0)}</td>
                      <td style={{ padding: '12px 14px', color: '#334155' }}>{formatBRL(wallet?.totalCashReceived || 0)}</td>
                      <td style={{ padding: '12px 14px', color: '#334155' }}>{formatBRL((wallet?.totalCommissionPaid || 0) + (wallet?.totalCommissionPending || 0))}</td>
                      <td style={{ padding: '12px 14px', fontWeight: 600, color: (wallet?.debtBalance || 0) > 0 ? '#DC2626' : '#64748B' }}>{formatBRL(wallet?.debtBalance || 0)}</td>
                      <td
                        style={{ padding: '12px 16px', textAlign: 'right', whiteSpace: 'nowrap' }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div style={{ display: 'inline-flex', gap: 6 }}>
                          <button
                            type="button"
                            onClick={() => {
                              setDriverModalTab('resumo');
                              setSelectedDriverId(drv.id);
                            }}
                            style={{
                              padding: '5px 10px',
                              borderRadius: 6,
                              border: '1px solid #0F172A',
                              backgroundColor: '#0F172A',
                              color: '#FFFFFF',
                              fontSize: '0.72rem',
                              fontWeight: 600,
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4
                            }}
                          >
                            <Eye size={12} />
                            <span>Ver Histórico</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => handleToggleDriverFinancialBlock(drv, Boolean(drv.financialBlocked))}
                            style={{
                              padding: '5px 10px',
                              borderRadius: 6,
                              border: '1px solid #CBD5E1',
                              backgroundColor: '#FFFFFF',
                              color: drv.financialBlocked ? '#15803D' : '#334155',
                              fontSize: '0.72rem',
                              fontWeight: 600,
                              cursor: 'pointer'
                            }}
                          >
                            {drv.financialBlocked ? 'Desbloquear' : 'Bloquear'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ═══ SUB-ABA 4: SAQUES & REPASSES PIX ═══ */}
      {subTab === 'saques' && (
        <div style={{ backgroundColor: '#FFFFFF', borderRadius: 10, border: '1px solid #E2E8F0', overflow: 'hidden' }}>
          <div style={{ padding: '14px 18px', borderBottom: '1px solid #E2E8F0' }}>
            <div style={{ fontSize: '0.88rem', fontWeight: 700, color: '#0F172A' }}>Solicitações de Saque e Repasses PIX</div>
            <div style={{ fontSize: '0.73rem', color: '#64748B' }}>Aprove transferências ou estorne solicitações para a carteira do motorista</div>
          </div>

          {(overview?.withdrawals || []).length === 0 ? (
            <div style={{ padding: '40px 20px', textAlign: 'center', color: '#64748B', fontSize: '0.82rem' }}>
              Nenhuma solicitação de saque registrada.
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.78rem' }}>
                <thead>
                  <tr style={{ backgroundColor: '#F8FAFC', borderBottom: '1px solid #E2E8F0', color: '#64748B', fontSize: '0.7rem', textTransform: 'uppercase' }}>
                    <th style={{ padding: '10px 16px', fontWeight: 600 }}>Data</th>
                    <th style={{ padding: '10px 14px', fontWeight: 600 }}>Motorista</th>
                    <th style={{ padding: '10px 14px', fontWeight: 600 }}>Chave PIX</th>
                    <th style={{ padding: '10px 14px', fontWeight: 600 }}>Valor</th>
                    <th style={{ padding: '10px 14px', fontWeight: 600 }}>Status</th>
                    <th style={{ padding: '10px 16px', fontWeight: 600, textAlign: 'right' }}>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {(overview?.withdrawals || []).map(w => (
                    <tr key={w.id} style={{ borderBottom: '1px solid #F1F5F9' }}>
                      <td style={{ padding: '12px 16px', color: '#64748B', fontSize: '0.72rem' }}>
                        {new Date(w.createdAt).toLocaleString('pt-BR')}
                      </td>
                      <td style={{ padding: '12px 14px', fontWeight: 600, color: '#0F172A' }}>{w.driverName}</td>
                      <td style={{ padding: '12px 14px', color: '#334155', fontFamily: 'monospace', fontSize: '0.74rem' }}>
                        {w.pixType?.toUpperCase()}: {w.pixKey}
                      </td>
                      <td style={{ padding: '12px 14px', fontWeight: 700, color: '#0F172A' }}>{formatBRL(w.amount)}</td>
                      <td style={{ padding: '12px 14px' }}>
                        <span style={{
                          padding: '3px 8px',
                          borderRadius: 6,
                          fontSize: '0.68rem',
                          fontWeight: 600,
                          backgroundColor: w.status === 'pago' ? '#F0FDF4' : w.status === 'rejeitado' ? '#FEF2F2' : '#FFFBEB',
                          border: `1px solid ${w.status === 'pago' ? '#BBF7D0' : w.status === 'rejeitado' ? '#FECACA' : '#FDE68A'}`,
                          color: w.status === 'pago' ? '#15803D' : w.status === 'rejeitado' ? '#B91C1C' : '#B45309'
                        }}>
                          {w.status.toUpperCase()}
                        </span>
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                        {w.status === 'solicitado' && (
                          <div style={{ display: 'inline-flex', gap: 6 }}>
                            <button
                              type="button"
                              onClick={() => handleProcessWithdrawal(w.id, 'approve')}
                              style={{
                                padding: '5px 10px',
                                borderRadius: 6,
                                border: 'none',
                                backgroundColor: '#16A34A',
                                color: '#FFFFFF',
                                fontWeight: 600,
                                fontSize: '0.72rem',
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 4
                              }}
                            >
                              <Check size={12} /> Confirmar PIX
                            </button>
                            <button
                              type="button"
                              onClick={() => handleProcessWithdrawal(w.id, 'reject')}
                              style={{
                                padding: '5px 10px',
                                borderRadius: 6,
                                border: '1px solid #FECACA',
                                backgroundColor: '#FFFFFF',
                                color: '#DC2626',
                                fontWeight: 600,
                                fontSize: '0.72rem',
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 4
                              }}
                            >
                              <X size={12} /> Recusar
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ═══ SUB-ABA 5: LIVRO-RAZÃO CONTÁBIL ═══ */}
      {subTab === 'livro_razao' && (
        <div style={{ backgroundColor: '#FFFFFF', borderRadius: 10, border: '1px solid #E2E8F0', overflow: 'hidden' }}>
          <div style={{ padding: '14px 18px', borderBottom: '1px solid #E2E8F0' }}>
            <div style={{ fontSize: '0.88rem', fontWeight: 700, color: '#0F172A' }}>Livro-Razão Financeiro (Ledger Imutável)</div>
            <div style={{ fontSize: '0.73rem', color: '#64748B' }}>Histórico auditável de créditos, retenções de comissão, abatimentos e repasses</div>
          </div>

          {filteredLedger.length === 0 ? (
            <div style={{ padding: '40px 20px', textAlign: 'center', color: '#64748B', fontSize: '0.82rem' }}>
              Nenhuma movimentação contábil registrada neste período.
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.76rem' }}>
                <thead>
                  <tr style={{ backgroundColor: '#F8FAFC', borderBottom: '1px solid #E2E8F0', color: '#64748B', fontSize: '0.68rem', textTransform: 'uppercase' }}>
                    <th style={{ padding: '10px 16px', fontWeight: 600 }}>Data / Hora</th>
                    <th style={{ padding: '10px 14px', fontWeight: 600 }}>Tipo</th>
                    <th style={{ padding: '10px 14px', fontWeight: 600 }}>Motorista</th>
                    <th style={{ padding: '10px 14px', fontWeight: 600 }}>Corrida</th>
                    <th style={{ padding: '10px 14px', fontWeight: 600 }}>Bruto</th>
                    <th style={{ padding: '10px 14px', fontWeight: 600 }}>Taxa</th>
                    <th style={{ padding: '10px 14px', fontWeight: 600 }}>Impacto Carteira</th>
                    <th style={{ padding: '10px 16px', fontWeight: 600 }}>Descrição</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredLedger.slice(0, 120).map(entry => (
                    <tr key={entry.id} style={{ borderBottom: '1px solid #F1F5F9' }}>
                      <td style={{ padding: '10px 16px', color: '#64748B', whiteSpace: 'nowrap' }}>
                        {new Date(entry.createdAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td style={{ padding: '10px 14px', fontWeight: 600, color: '#0F172A' }}>
                        {entry.entryType}
                      </td>
                      <td style={{ padding: '10px 14px', color: '#334155' }}>
                        {entry.driverName || entry.driverId}
                      </td>
                      <td style={{ padding: '10px 14px', fontWeight: 600, color: '#0F172A' }}>
                        {entry.rideCode || entry.rideId || '—'}
                      </td>
                      <td style={{ padding: '10px 14px', color: '#334155' }}>
                        {formatBRL(entry.grossAmount)}
                      </td>
                      <td style={{ padding: '10px 14px', color: '#475569' }}>
                        {entry.commissionAmount > 0 ? formatBRL(entry.commissionAmount) : '—'}
                      </td>
                      <td style={{
                        padding: '10px 14px',
                        fontWeight: 700,
                        color: entry.balanceDelta > 0 ? '#15803D' : entry.balanceDelta < 0 ? '#DC2626' : '#475569'
                      }}>
                        {entry.balanceDelta > 0 ? '+' : ''}{formatBRL(entry.balanceDelta)}
                      </td>
                      <td style={{ padding: '10px 16px', color: '#64748B', maxWidth: 280 }}>
                        {entry.description}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
