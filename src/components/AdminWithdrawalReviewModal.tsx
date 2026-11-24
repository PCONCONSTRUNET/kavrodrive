import React, { useState } from 'react';
import {
  X, User, Wallet, ShieldCheck, ShieldAlert, AlertTriangle, Check, Copy,
  Phone, Car, FileText, ExternalLink, Ban, CheckCircle2, Clock
} from 'lucide-react';
import {
  DriverPixKey,
  DriverProfile,
  DriverWalletSummary,
  WithdrawalRequest
} from '../types';
import {
  formatCNHPunctuated,
  formatDocument,
  formatPhone,
  formatPixKey,
  formatPlateDisplay
} from '../utils/format';

interface AdminWithdrawalReviewModalProps {
  withdrawal: WithdrawalRequest | null;
  driver: DriverProfile | null;
  wallet?: DriverWalletSummary | null;
  isOpen: boolean;
  onClose: () => void;
  onProcess: (
    withdrawalId: string,
    action: 'approve' | 'reject',
    notes?: string
  ) => Promise<{ ok: boolean; error?: string }>;
  onOpenFullDossier?: (driverId: string, driverName?: string) => void;
}

const formatBRL = (val: number) =>
  `R$ ${Number(val || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const PIX_TYPE_LABELS: Record<string, string> = {
  cpf: 'CPF',
  cnpj: 'CNPJ',
  telefone: 'Telefone / Celular',
  email: 'E-mail',
  aleatoria: 'Chave Aleatória (EVP)',
  evp: 'Chave Aleatória (EVP)'
};

function onlyDigits(value?: string | null): string {
  return String(value || '').replace(/\D/g, '');
}

function normalizePixComparison(value?: string | null, pixType?: string | null): string {
  const raw = String(value || '').trim();
  const type = String(pixType || '').toLowerCase();
  if (type === 'cpf' || type === 'cnpj' || type === 'telefone' || type === 'phone' || type === 'celular') {
    const digits = onlyDigits(raw);
    if (digits) return digits;
  }
  return raw.toLowerCase();
}

function formatApprovalLabel(status?: string): string {
  if (status === 'aprovado') return 'Cadastro Aprovado';
  if (status === 'em_analise') return 'Em Análise KYC';
  if (status === 'correcao_solicitada') return 'Correção Solicitada';
  if (status === 'rejeitado') return 'Cadastro Rejeitado';
  if (status === 'pendente_aprovacao' || status === 'pendente') return 'Cadastro Pendente';
  return status || 'Não informado';
}

export const AdminWithdrawalReviewModal: React.FC<AdminWithdrawalReviewModalProps> = ({
  withdrawal,
  driver,
  wallet,
  isOpen,
  onClose,
  onProcess,
  onOpenFullDossier
}) => {
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [isRejecting, setIsRejecting] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  if (!isOpen || !withdrawal) return null;

  const snap = withdrawal.driverProfileSnapshot;
  const fullName = driver?.name || snap?.name || withdrawal.driverName || 'Motorista';
  const documentRaw = driver?.document || snap?.document || '';
  const phoneRaw = driver?.phone || snap?.phone || '';
  const email = driver?.email || snap?.email || '';
  const cnhRaw = driver?.cnh || snap?.cnh || '';
  const city = driver?.city || snap?.city || '';
  const vehicleBrand = driver?.vehicleBrand || snap?.vehicleBrand || '';
  const vehicleModel = driver?.vehicleModel || snap?.vehicleModel || '';
  const vehiclePlate = driver?.vehiclePlate || snap?.vehiclePlate || '';
  const approvalStatus = driver?.approvalStatus || snap?.approvalStatus || '';
  const financialBlocked = Boolean(driver?.financialBlocked ?? snap?.financialBlocked);
  const efiAccountId = driver?.efiAccountId || snap?.efiAccountId || '';
  const registeredBankName = driver?.bankName || snap?.bankName || '';
  const registeredBankAgency = driver?.bankAgency || snap?.bankAgency || '';
  const registeredBankAccount = driver?.bankAccount || snap?.bankAccount || '';
  const createdAtDriver = driver?.createdAt || snap?.createdAt || '';

  const savedPixKeys: DriverPixKey[] = (() => {
    if (Array.isArray(driver?.pixKeys) && driver.pixKeys.length > 0) return driver.pixKeys;
    if (Array.isArray(snap?.pixKeys) && snap.pixKeys.length > 0) return snap.pixKeys;
    const fallbackKey = driver?.pixKey || snap?.pixKey;
    if (fallbackKey) {
      return [{
        id: 'primary',
        pixType: ((driver?.pixType || snap?.pixType || 'cpf') as DriverPixKey['pixType']),
        pixKey: fallbackKey,
        bankName: registeredBankName,
        holderName: fullName,
        holderDocument: onlyDigits(documentRaw),
        sameOwnershipConfirmed: true,
        isDefault: true,
        createdAt: createdAtDriver || withdrawal.createdAt
      }];
    }
    return [];
  })();

  const reqPixType = String(withdrawal.pixType || 'cpf').toLowerCase();
  const reqPixCmp = normalizePixComparison(withdrawal.pixKey, reqPixType);
  const matchedPixKey = savedPixKeys.find(
    k => normalizePixComparison(k.pixKey, k.pixType) === reqPixCmp
  );

  const ownerDocDigits = onlyDigits(documentRaw);
  const reqPixDigits = onlyDigits(withdrawal.pixKey);
  const holderDocDigits = onlyDigits(matchedPixKey?.holderDocument);

  const isCpfPixKey = reqPixType === 'cpf';
  const cpfMatchesKey = isCpfPixKey && Boolean(ownerDocDigits) && reqPixDigits === ownerDocDigits;
  const cpfMismatchOnKey = isCpfPixKey && Boolean(ownerDocDigits) && Boolean(reqPixDigits) && reqPixDigits !== ownerDocDigits;
  const holderDocMatchesDriver = Boolean(ownerDocDigits) && Boolean(holderDocDigits) && holderDocDigits === ownerDocDigits;
  const holderDocMismatch = Boolean(ownerDocDigits) && Boolean(holderDocDigits) && holderDocDigits !== ownerDocDigits;
  const pixKeyInDriverRecord = Boolean(matchedPixKey) || (
    Boolean(driver?.pixKey || snap?.pixKey) &&
    normalizePixComparison(driver?.pixKey || snap?.pixKey, driver?.pixType || snap?.pixType) === reqPixCmp
  );

  const hasOwnershipWarning = cpfMismatchOnKey || holderDocMismatch || !pixKeyInDriverRecord;
  const isPending = withdrawal.status === 'solicitado' || withdrawal.status === 'processando';
  const netPayout = Number(withdrawal.netPayoutAmount ?? Math.max(0, Number(withdrawal.amount || 0) - Number(withdrawal.feeAmount || 0)));
  const cleanWhatsapp = onlyDigits(phoneRaw);
  const holderNameDisplay = matchedPixKey?.holderName || fullName;
  const holderDocDisplay = matchedPixKey?.holderDocument
    ? formatDocument(matchedPixKey.holderDocument)
    : isCpfPixKey
    ? formatDocument(withdrawal.pixKey)
    : formatDocument(documentRaw);
  const bankDisplay = matchedPixKey?.bankName || registeredBankName || 'Não informado no cadastro';

  const copyValue = (key: string, value?: string | null) => {
    const clean = String(value || '').trim();
    if (!clean) return;
    navigator.clipboard?.writeText(clean).catch(() => {});
    setCopiedField(key);
    window.setTimeout(() => setCopiedField(prev => (prev === key ? null : prev)), 1600);
  };

  const renderCopyBtn = (fieldKey: string, value: string, label = 'Copiar') => {
    const isCopied = copiedField === fieldKey;
    return (
      <button
        type="button"
        onClick={() => copyValue(fieldKey, value)}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          padding: '4px 9px',
          borderRadius: 6,
          border: isCopied ? '1px solid #86EFAC' : '1px solid #CBD5E1',
          backgroundColor: isCopied ? '#F0FDF4' : '#FFFFFF',
          color: isCopied ? '#15803D' : '#334155',
          fontSize: '0.7rem',
          fontWeight: 700,
          cursor: 'pointer',
          whiteSpace: 'nowrap'
        }}
      >
        {isCopied ? <Check size={12} /> : <Copy size={12} />}
        <span>{isCopied ? 'Copiado!' : label}</span>
      </button>
    );
  };

  const handleConfirmApprove = async () => {
    if (isSubmitting) return;
    setActionError(null);
    setIsSubmitting(true);
    const res = await onProcess(withdrawal.id, 'approve');
    setIsSubmitting(false);
    if (!res.ok) {
      setActionError(res.error || 'Falha ao confirmar o repasse PIX.');
      return;
    }
    onClose();
  };

  const handleConfirmReject = async () => {
    if (isSubmitting) return;
    setActionError(null);
    setIsSubmitting(true);
    const res = await onProcess(
      withdrawal.id,
      'reject',
      rejectReason.trim() || 'Dados divergentes ou solicitação recusada pela Central Financeira'
    );
    setIsSubmitting(false);
    if (!res.ok) {
      setActionError(res.error || 'Falha ao recusar a solicitação de saque.');
      return;
    }
    onClose();
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.6)',
        backdropFilter: 'blur(3px)',
        zIndex: 100000,
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
          borderRadius: 14,
          border: '1px solid #CBD5E1',
          boxShadow: '0 24px 48px rgba(15, 23, 42, 0.25)',
          width: '100%',
          maxWidth: 820,
          maxHeight: '92vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden'
        }}
      >
        {/* Cabeçalho */}
        <div style={{
          padding: '16px 22px',
          borderBottom: '1px solid #E2E8F0',
          backgroundColor: '#0F172A',
          color: '#FFFFFF',
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 46,
              height: 46,
              borderRadius: 10,
              backgroundColor: 'rgba(255,255,255,0.12)',
              color: '#FFFFFF',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 800,
              fontSize: '1rem',
              overflow: 'hidden',
              flexShrink: 0,
              border: '1px solid rgba(255,255,255,0.2)'
            }}>
              {driver?.photo ? (
                <img src={driver.photo} alt={fullName} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <span>{fullName.slice(0, 2).toUpperCase()}</span>
              )}
            </div>

            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: '#FFFFFF' }}>
                  Ficha do Motorista — Conferência de Saque PIX
                </h3>
                <span style={{
                  padding: '2px 8px',
                  borderRadius: 999,
                  fontSize: '0.68rem',
                  fontWeight: 800,
                  backgroundColor: isPending ? '#F59E0B' : withdrawal.status === 'pago' ? '#16A34A' : '#DC2626',
                  color: isPending ? '#0F172A' : '#FFFFFF'
                }}>
                  {withdrawal.status === 'solicitado'
                    ? 'PENDENTE'
                    : withdrawal.status === 'processando'
                    ? 'PROCESSANDO'
                    : withdrawal.status === 'pago'
                    ? 'PAGO'
                    : 'RECUSADO'}
                </span>
              </div>
              <div style={{ fontSize: '0.75rem', color: '#CBD5E1', marginTop: 3 }}>
                <strong style={{ color: '#FFFFFF' }}>{fullName}</strong>
                {documentRaw ? ` • CPF: ${formatDocument(documentRaw)}` : ''}
                {` • Pedido ${withdrawal.id}`}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {cleanWhatsapp && (
              <a
                href={`https://wa.me/55${cleanWhatsapp}`}
                target="_blank"
                rel="noreferrer"
                style={{
                  height: 32,
                  padding: '0 10px',
                  borderRadius: 7,
                  border: '1px solid rgba(255,255,255,0.25)',
                  backgroundColor: 'rgba(255,255,255,0.1)',
                  color: '#FFFFFF',
                  fontSize: '0.73rem',
                  fontWeight: 600,
                  textDecoration: 'none',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5
                }}
              >
                <Phone size={13} />
                <span>WhatsApp</span>
              </a>
            )}
            {onOpenFullDossier && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenFullDossier(withdrawal.driverId, fullName);
                }}
                style={{
                  height: 32,
                  padding: '0 10px',
                  borderRadius: 7,
                  border: '1px solid rgba(255,255,255,0.25)',
                  backgroundColor: 'rgba(255,255,255,0.1)',
                  color: '#FFFFFF',
                  fontSize: '0.73rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5
                }}
              >
                <ExternalLink size={13} />
                <span>Dossiê Completo</span>
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Fechar ficha do motorista"
              style={{
                width: 32,
                height: 32,
                borderRadius: 7,
                border: '1px solid rgba(255,255,255,0.2)',
                backgroundColor: 'rgba(255,255,255,0.08)',
                color: '#FFFFFF',
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

        {/* Conteúdo */}
        <div style={{ padding: 20, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Banner de Conferência Automática de Titularidade */}
          <div style={{
            padding: '12px 14px',
            borderRadius: 10,
            border: `1px solid ${hasOwnershipWarning || financialBlocked ? '#FCD34D' : '#86EFAC'}`,
            backgroundColor: hasOwnershipWarning || financialBlocked ? '#FFFBEB' : '#F0FDF4',
            display: 'flex',
            flexDirection: 'column',
            gap: 6
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              fontSize: '0.8rem',
              fontWeight: 800,
              color: hasOwnershipWarning || financialBlocked ? '#92400E' : '#166534'
            }}>
              {hasOwnershipWarning || financialBlocked ? <ShieldAlert size={17} /> : <ShieldCheck size={17} />}
              <span>
                {cpfMismatchOnKey || holderDocMismatch
                  ? 'Atenção: divergência detectada entre o CPF do motorista e a chave PIX!'
                  : financialBlocked
                  ? 'Motorista com bloqueio financeiro ativo no cadastro — revise antes de pagar'
                  : pixKeyInDriverRecord
                  ? 'Titularidade conferida: chave PIX e cadastro do motorista compatíveis'
                  : 'Confira a titularidade: esta chave PIX não está na lista salva atual do motorista'}
              </span>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, fontSize: '0.73rem', color: '#334155' }}>
              <span style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                padding: '2px 8px',
                borderRadius: 6,
                backgroundColor: '#FFFFFF',
                border: '1px solid #E2E8F0'
              }}>
                {cpfMatchesKey || holderDocMatchesDriver ? (
                  <CheckCircle2 size={13} color="#16A34A" />
                ) : cpfMismatchOnKey || holderDocMismatch ? (
                  <AlertTriangle size={13} color="#DC2626" />
                ) : (
                  <Clock size={13} color="#D97706" />
                )}
                {isCpfPixKey
                  ? (cpfMatchesKey
                    ? 'Chave CPF idêntica ao CPF do cadastro'
                    : cpfMismatchOnKey
                    ? 'Chave CPF difere do CPF do cadastro'
                    : 'Compare o CPF do recebedor no banco')
                  : (holderDocMatchesDriver
                    ? 'Documento do titular da chave confere com CPF'
                    : holderDocMismatch
                    ? 'Documento do titular difere do CPF'
                    : `Compare o recebedor (${fullName} • CPF ${formatDocument(documentRaw) || 'não informado'}) no banco antes de enviar`)}
              </span>
              <span style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                padding: '2px 8px',
                borderRadius: 6,
                backgroundColor: '#FFFFFF',
                border: '1px solid #E2E8F0'
              }}>
                {pixKeyInDriverRecord ? <CheckCircle2 size={13} color="#16A34A" /> : <AlertTriangle size={13} color="#D97706" />}
                {pixKeyInDriverRecord ? 'Chave registrada no perfil do motorista' : 'Chave não consta nas chaves salvas atuais'}
              </span>
              {financialBlocked && (
                <span style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  padding: '2px 8px',
                  borderRadius: 6,
                  backgroundColor: '#FEF2F2',
                  border: '1px solid #FECACA',
                  color: '#B91C1C',
                  fontWeight: 700
                }}>
                  <Ban size={13} /> Bloqueio financeiro: {driver?.financialBlockReason || 'Ativo'}
                </span>
              )}
            </div>
          </div>

          {/* 2 Colunas: Ficha Cadastral do Motorista + Dados da Transação PIX */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(310px, 1fr))',
            gap: 14
          }}>
            {/* Bloco 1: Ficha do Motorista */}
            <div style={{
              padding: 16,
              borderRadius: 10,
              border: '1px solid #E2E8F0',
              backgroundColor: '#F8FAFC',
              display: 'flex',
              flexDirection: 'column',
              gap: 12
            }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 8,
                borderBottom: '1px solid #E2E8F0',
                paddingBottom: 8
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.76rem', fontWeight: 800, color: '#0F172A', textTransform: 'uppercase' }}>
                  <User size={15} /> Ficha do Motorista (Cadastro)
                </div>
                <span style={{
                  padding: '2px 7px',
                  borderRadius: 6,
                  fontSize: '0.67rem',
                  fontWeight: 700,
                  backgroundColor: approvalStatus === 'aprovado' ? '#DCFCE7' : '#FEF3C7',
                  color: approvalStatus === 'aprovado' ? '#15803D' : '#B45309'
                }}>
                  {formatApprovalLabel(approvalStatus)}
                </span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: '0.8rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                  <div>
                    <div style={{ fontSize: '0.68rem', color: '#64748B', fontWeight: 600 }}>Nome Completo</div>
                    <div style={{ fontWeight: 800, color: '#0F172A', fontSize: '0.9rem' }}>{fullName}</div>
                  </div>
                  {renderCopyBtn('name', fullName)}
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                  <div>
                    <div style={{ fontSize: '0.68rem', color: '#64748B', fontWeight: 600 }}>CPF do Motorista</div>
                    <div style={{ fontWeight: 800, color: '#0F172A', fontSize: '0.9rem', fontFamily: 'monospace' }}>
                      {formatDocument(documentRaw) || 'Não informado'}
                    </div>
                  </div>
                  {ownerDocDigits ? renderCopyBtn('cpf', ownerDocDigits, 'Copiar CPF') : null}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div>
                    <div style={{ fontSize: '0.68rem', color: '#64748B' }}>Telefone / WhatsApp</div>
                    <div style={{ fontWeight: 600, color: '#0F172A' }}>{formatPhone(phoneRaw) || phoneRaw || '—'}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.68rem', color: '#64748B' }}>CNH</div>
                    <div style={{ fontWeight: 600, color: '#0F172A', fontVariantNumeric: 'tabular-nums' }}>
                      {formatCNHPunctuated(cnhRaw) || '—'}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.68rem', color: '#64748B' }}>E-mail</div>
                    <div style={{ fontWeight: 600, color: '#0F172A', wordBreak: 'break-word' }}>{email || '—'}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.68rem', color: '#64748B' }}>Cidade Base</div>
                    <div style={{ fontWeight: 600, color: '#0F172A' }}>{city || '—'}</div>
                  </div>
                </div>

                {(vehicleBrand || vehicleModel || vehiclePlate) && (
                  <div style={{
                    padding: '8px 10px',
                    borderRadius: 8,
                    backgroundColor: '#FFFFFF',
                    border: '1px solid #E2E8F0',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    fontSize: '0.75rem',
                    color: '#334155'
                  }}>
                    <Car size={14} color="#64748B" />
                    <span>
                      <strong>{vehicleBrand} {vehicleModel}</strong>
                      {vehiclePlate ? ` • Placa ${formatPlateDisplay(vehiclePlate)}` : ''}
                    </span>
                  </div>
                )}

                {wallet && (
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(3, 1fr)',
                    gap: 8,
                    paddingTop: 4
                  }}>
                    <div style={{ padding: '7px 9px', borderRadius: 7, backgroundColor: '#FFFFFF', border: '1px solid #E2E8F0' }}>
                      <div style={{ fontSize: '0.64rem', color: '#64748B' }}>Saldo Pós-Pedido</div>
                      <div style={{ fontSize: '0.8rem', fontWeight: 800, color: '#15803D' }}>{formatBRL(wallet.availableBalance)}</div>
                    </div>
                    <div style={{ padding: '7px 9px', borderRadius: 7, backgroundColor: '#FFFFFF', border: '1px solid #E2E8F0' }}>
                      <div style={{ fontSize: '0.64rem', color: '#64748B' }}>Total Já Sacado</div>
                      <div style={{ fontSize: '0.8rem', fontWeight: 800, color: '#0F172A' }}>{formatBRL(wallet.totalWithdrawn)}</div>
                    </div>
                    <div style={{ padding: '7px 9px', borderRadius: 7, backgroundColor: '#FFFFFF', border: '1px solid #E2E8F0' }}>
                      <div style={{ fontSize: '0.64rem', color: '#64748B' }}>Dívida Pendente</div>
                      <div style={{ fontSize: '0.8rem', fontWeight: 800, color: wallet.debtBalance > 0 ? '#DC2626' : '#0F172A' }}>
                        {formatBRL(wallet.debtBalance)}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Bloco 2: Chave PIX e Dados da Transação */}
            <div style={{
              padding: 16,
              borderRadius: 10,
              border: '1px solid #BFDBFE',
              backgroundColor: '#F8FAFF',
              display: 'flex',
              flexDirection: 'column',
              gap: 12
            }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 8,
                borderBottom: '1px solid #DBEAFE',
                paddingBottom: 8
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.76rem', fontWeight: 800, color: '#1E3A8A', textTransform: 'uppercase' }}>
                  <Wallet size={15} /> Dados para Transação PIX
                </div>
                <span style={{ fontSize: '0.7rem', color: '#475569', fontWeight: 600 }}>
                  {new Date(withdrawal.createdAt).toLocaleString('pt-BR')}
                </span>
              </div>

              {/* Valor Líquido Destacado */}
              <div style={{
                padding: '11px 12px',
                borderRadius: 8,
                backgroundColor: '#FFFFFF',
                border: '1px solid #DBEAFE',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 10
              }}>
                <div>
                  <div style={{ fontSize: '0.68rem', color: '#64748B', fontWeight: 700, textTransform: 'uppercase' }}>
                    Valor Líquido a Transferir
                  </div>
                  <div style={{ fontSize: '1.35rem', fontWeight: 900, color: '#15803D', marginTop: 1 }}>
                    {formatBRL(netPayout)}
                  </div>
                  <div style={{ fontSize: '0.7rem', color: '#64748B', marginTop: 2 }}>
                    Bruto: {formatBRL(withdrawal.amount)}
                    {Number(withdrawal.feeAmount || 0) > 0 ? ` • Taxa: ${formatBRL(Number(withdrawal.feeAmount || 0))}` : ' • Sem taxa de saque'}
                  </div>
                </div>
                {renderCopyBtn('amount', netPayout.toFixed(2), 'Copiar Valor')}
              </div>

              {/* Chave PIX Destino */}
              <div style={{
                padding: '11px 12px',
                borderRadius: 8,
                backgroundColor: '#FFFFFF',
                border: '1px solid #CBD5E1',
                display: 'flex',
                flexDirection: 'column',
                gap: 8
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                  <div>
                    <div style={{ fontSize: '0.68rem', color: '#64748B', fontWeight: 700 }}>
                      Chave PIX ({PIX_TYPE_LABELS[reqPixType] || withdrawal.pixType?.toUpperCase() || 'PIX'})
                    </div>
                    <div style={{ fontSize: '0.92rem', fontWeight: 800, color: '#0F172A', fontFamily: 'monospace', wordBreak: 'break-all', marginTop: 2 }}>
                      {formatPixKey(withdrawal.pixKey, withdrawal.pixType) || withdrawal.pixKey}
                    </div>
                  </div>
                  {renderCopyBtn('pix', withdrawal.pixKey, 'Copiar Chave')}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, paddingTop: 6, borderTop: '1px solid #F1F5F9', fontSize: '0.75rem' }}>
                  <div>
                    <div style={{ fontSize: '0.66rem', color: '#64748B' }}>Titular da Chave</div>
                    <div style={{ fontWeight: 700, color: '#0F172A' }}>{holderNameDisplay}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.66rem', color: '#64748B' }}>CPF/CNPJ na Chave</div>
                    <div style={{ fontWeight: 700, color: '#0F172A', fontFamily: 'monospace' }}>{holderDocDisplay || '—'}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.66rem', color: '#64748B' }}>Banco / Instituição</div>
                    <div style={{ fontWeight: 600, color: '#0F172A' }}>{bankDisplay}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.66rem', color: '#64748B' }}>Agência / Conta</div>
                    <div style={{ fontWeight: 600, color: '#0F172A', fontFamily: 'monospace' }}>
                      {registeredBankAgency || registeredBankAccount
                        ? `${registeredBankAgency || '—'} / ${registeredBankAccount || '—'}`
                        : efiAccountId
                        ? `Efí #${efiAccountId}`
                        : '—'}
                    </div>
                  </div>
                </div>
              </div>

              {/* Chaves PIX cadastradas no perfil (se houver mais de uma) */}
              {savedPixKeys.length > 0 && (
                <div style={{ fontSize: '0.72rem', color: '#475569' }}>
                  <div style={{ fontWeight: 700, color: '#334155', marginBottom: 4 }}>
                    Chave(s) cadastrada(s) no perfil do motorista ({savedPixKeys.length}):
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {savedPixKeys.map(k => {
                      const isThisKey = normalizePixComparison(k.pixKey, k.pixType) === reqPixCmp;
                      return (
                        <div
                          key={k.id || `${k.pixType}:${k.pixKey}`}
                          style={{
                            padding: '5px 8px',
                            borderRadius: 6,
                            backgroundColor: isThisKey ? '#ECFDF5' : '#FFFFFF',
                            border: `1px solid ${isThisKey ? '#86EFAC' : '#E2E8F0'}`,
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            gap: 8
                          }}
                        >
                          <span style={{ fontFamily: 'monospace', wordBreak: 'break-all' }}>
                            <strong>{String(k.pixType || '').toUpperCase()}</strong>: {k.pixKey}
                            {k.bankName ? ` • ${k.bankName}` : ''}
                          </span>
                          {isThisKey && (
                            <span style={{ fontSize: '0.64rem', fontWeight: 800, color: '#15803D', whiteSpace: 'nowrap' }}>
                              EM USO NESTE SAQUE
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Metadados & Rastreabilidade */}
              <div style={{ fontSize: '0.72rem', color: '#64748B', display: 'flex', flexDirection: 'column', gap: 3 }}>
                <div>
                  <FileText size={12} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} />
                  ID Pedido: <strong style={{ fontFamily: 'monospace', color: '#334155' }}>{withdrawal.id}</strong>
                  {withdrawal.ledgerEntryId ? ` • Ledger: ${withdrawal.ledgerEntryId}` : ''}
                </div>
                {withdrawal.payoutProviderTxId && (
                  <div>
                    TXID Repasse ({withdrawal.payoutProvider || 'PIX'}):{' '}
                    <strong style={{ fontFamily: 'monospace', color: '#15803D' }}>{withdrawal.payoutProviderTxId}</strong>
                  </div>
                )}
                {withdrawal.notes && (
                  <div>Obs.: <strong style={{ color: '#334155' }}>{withdrawal.notes}</strong></div>
                )}
              </div>
            </div>
          </div>

          {actionError && (
            <div style={{
              padding: '10px 12px',
              borderRadius: 8,
              backgroundColor: '#FEF2F2',
              border: '1px solid #FECACA',
              color: '#B91C1C',
              fontSize: '0.78rem',
              fontWeight: 700
            }}>
              {actionError}
            </div>
          )}

          {isPending && isRejecting && (
            <div style={{
              padding: 12,
              borderRadius: 10,
              backgroundColor: '#FEF2F2',
              border: '1px solid #FECACA',
              display: 'flex',
              flexDirection: 'column',
              gap: 8
            }}>
              <div style={{ fontSize: '0.76rem', fontWeight: 800, color: '#991B1B' }}>
                Motivo da recusa (o valor bruto de {formatBRL(withdrawal.amount)} será estornado à carteira do motorista):
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <input
                  type="text"
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  placeholder="Ex.: Chave PIX não pertence ao titular / CPF divergente..."
                  disabled={isSubmitting}
                  style={{
                    flex: 1,
                    minWidth: 220,
                    height: 36,
                    padding: '0 10px',
                    borderRadius: 7,
                    border: '1px solid #FCA5A5',
                    backgroundColor: '#FFFFFF',
                    fontSize: '0.78rem'
                  }}
                />
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={handleConfirmReject}
                  style={{
                    height: 36,
                    padding: '0 14px',
                    borderRadius: 7,
                    border: 'none',
                    backgroundColor: '#DC2626',
                    color: '#FFFFFF',
                    fontSize: '0.76rem',
                    fontWeight: 800,
                    cursor: isSubmitting ? 'not-allowed' : 'pointer',
                    opacity: isSubmitting ? 0.7 : 1
                  }}
                >
                  {isSubmitting ? 'Estornando...' : 'Confirmar Recusa e Estorno'}
                </button>
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => setIsRejecting(false)}
                  style={{
                    height: 36,
                    padding: '0 12px',
                    borderRadius: 7,
                    border: '1px solid #CBD5E1',
                    backgroundColor: '#FFFFFF',
                    color: '#334155',
                    fontSize: '0.76rem',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  Voltar
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Rodapé com Ações */}
        <div style={{
          padding: '14px 22px',
          borderTop: '1px solid #E2E8F0',
          backgroundColor: '#F8FAFC',
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 10
        }}>
          <div style={{ fontSize: '0.73rem', color: '#64748B' }}>
            {isPending
              ? 'Verifique Nome Completo, CPF e Chave PIX antes de confirmar a transferência.'
              : `Processado em ${withdrawal.processedAt ? new Date(withdrawal.processedAt).toLocaleString('pt-BR') : '—'}`}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <button
              type="button"
              disabled={isSubmitting}
              onClick={onClose}
              style={{
                height: 36,
                padding: '0 14px',
                borderRadius: 8,
                border: '1px solid #CBD5E1',
                backgroundColor: '#FFFFFF',
                color: '#334155',
                fontSize: '0.78rem',
                fontWeight: 700,
                cursor: 'pointer'
              }}
            >
              Fechar
            </button>

            {isPending && !isRejecting && (
              <>
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => setIsRejecting(true)}
                  style={{
                    height: 36,
                    padding: '0 14px',
                    borderRadius: 8,
                    border: '1px solid #FECACA',
                    backgroundColor: '#FFFFFF',
                    color: '#DC2626',
                    fontSize: '0.78rem',
                    fontWeight: 800,
                    cursor: isSubmitting ? 'not-allowed' : 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6
                  }}
                >
                  <X size={14} /> Recusar e Estornar
                </button>
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={handleConfirmApprove}
                  style={{
                    height: 36,
                    padding: '0 16px',
                    borderRadius: 8,
                    border: 'none',
                    backgroundColor: '#16A34A',
                    color: '#FFFFFF',
                    fontSize: '0.78rem',
                    fontWeight: 800,
                    cursor: isSubmitting ? 'not-allowed' : 'pointer',
                    opacity: isSubmitting ? 0.7 : 1,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    boxShadow: '0 2px 8px rgba(22, 163, 74, 0.25)'
                  }}
                >
                  <Check size={14} /> {isSubmitting ? 'Processando...' : 'Confirmar Pagamento PIX'}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
