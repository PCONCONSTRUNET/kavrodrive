import React, { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  Camera,
  Check,
  CheckCircle2,
  Clock,
  DollarSign,
  Eye,
  FileText,
  Lock,
  Mail,
  MapPin,
  Phone,
  Plus,
  QrCode,
  Send,
  ShieldCheck,
  Star,
  Trash2,
  User,
  Wallet,
  XCircle
} from 'lucide-react';
import { DriverPixKey, DriverProfile, DriverWalletSummary, Ride } from '../types';
import { StorageService } from '../services/storage';
import { compressDataUrlForUpload } from '../utils/imageCompression';
import { formatCPF, formatPhone, formatRideCode } from '../utils/format';
import { DRIVER_TERMS_CONTRACT_ID, DRIVER_TERMS_CONTRACT_VERSION } from '../utils/driverTermsContract';

interface DriverSecondaryTabsProps {
  activeTab: 'ganhos' | 'carteira' | 'perfil';
  currentDriver: DriverProfile;
  wallet: DriverWalletSummary | null;
  completedRides: Ride[];
  todayEarnings: number;
  pixEditType: 'cpf' | 'cnpj' | 'telefone' | 'email' | 'aleatoria';
  pixEditKey: string;
  pixEditBank: string;
  isSavingPix: boolean;
  pixSaveNotice: string;
  onChangeTab: (tab: 'radar' | 'ganhos' | 'carteira' | 'perfil') => void;
  onDriverUpdated: (driver: DriverProfile) => void;
  onOpenWithdrawModal: () => void;
  onOpenDebtPixModal: () => void;
  onPixTypeChange: (next: 'cpf' | 'cnpj' | 'telefone' | 'email' | 'aleatoria') => void;
  onPixKeyChange: (next: string) => void;
  onPixBankChange: (next: string) => void;
  onSavePixKey: (e: React.FormEvent) => void;
  onOpenKycModal: () => void;
  onOpenTermsModal: () => void;
}

const CARD_STYLE: React.CSSProperties = {
  backgroundColor: '#FFFFFF',
  borderRadius: 16,
  padding: '18px',
  border: '1px solid #E5E7EB',
  boxShadow: '0 2px 10px rgba(0, 0, 0, 0.03)'
};

const INPUT_STYLE: React.CSSProperties = {
  width: '100%',
  padding: '11px 12px 11px 38px',
  borderRadius: 10,
  border: '1.5px solid #E5E7EB',
  backgroundColor: '#F9FAFB',
  color: '#111111',
  fontSize: '0.88rem',
  fontWeight: 600,
  outline: 'none',
  boxSizing: 'border-box'
};

export const DriverSecondaryTabs: React.FC<DriverSecondaryTabsProps> = ({
  activeTab,
  currentDriver,
  wallet,
  completedRides,
  todayEarnings,
  pixEditType,
  pixEditKey,
  pixEditBank,
  isSavingPix,
  pixSaveNotice,
  onChangeTab,
  onDriverUpdated,
  onOpenWithdrawModal,
  onOpenDebtPixModal,
  onPixTypeChange,
  onPixKeyChange,
  onPixBankChange,
  onSavePixKey,
  onOpenKycModal,
  onOpenTermsModal
}) => {
  const photoInputRef = useRef<HTMLInputElement | null>(null);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [photoFeedback, setPhotoFeedback] = useState('');

  // Formulário de solicitação de alteração cadastral (moderado pelo Admin Master)
  const pendingReq = currentDriver.profileChangeRequest?.status === 'pendente'
    ? currentDriver.profileChangeRequest
    : null;
  const [reqName, setReqName] = useState(pendingReq?.requestedFields?.name || currentDriver.name || '');
  const [reqPhone, setReqPhone] = useState(
    formatPhone(pendingReq?.requestedFields?.phone || currentDriver.phone || '')
  );
  const [reqEmail, setReqEmail] = useState(
    pendingReq?.requestedFields?.email ?? currentDriver.email ?? ''
  );
  const [reqCity, setReqCity] = useState(
    pendingReq?.requestedFields?.city ?? currentDriver.city ?? ''
  );
  const [isSubmittingChange, setIsSubmittingChange] = useState(false);
  const [changeFeedback, setChangeFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  // Gestão de Múltiplas Chaves PIX (Mesma Titularidade) & Filtro de Saques
  const [sameOwnershipChecked, setSameOwnershipChecked] = useState(true);
  const [pixLocalFeedback, setPixLocalFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [isMutatingPixList, setIsMutatingPixList] = useState(false);
  const [showAddPixForm, setShowAddPixForm] = useState(false);
  const [withdrawalFilter, setWithdrawalFilter] = useState<'all' | 'pending' | 'completed' | 'rejected'>('all');

  const ownerDocDigits = String(currentDriver.document || '').replace(/\D/g, '');
  const savedPixKeys: DriverPixKey[] = (() => {
    if (Array.isArray(currentDriver.pixKeys) && currentDriver.pixKeys.length > 0) {
      return currentDriver.pixKeys;
    }
    if (currentDriver.pixKey) {
      return [{
        id: 'pix-primary',
        pixType: currentDriver.pixType || 'cpf',
        pixKey: currentDriver.pixKey,
        bankName: currentDriver.bankName || '',
        holderName: currentDriver.name,
        holderDocument: ownerDocDigits,
        sameOwnershipConfirmed: true,
        isDefault: true,
        createdAt: currentDriver.createdAt
      }];
    }
    return [];
  })();

  const persistPixKeysList = async (nextList: DriverPixKey[], successMsg: string) => {
    setPixLocalFeedback(null);
    setIsMutatingPixList(true);
    const res = await StorageService.updateDriverProfile(currentDriver.id, {
      pixKeys: nextList
    });
    setIsMutatingPixList(false);
    if (res.ok && res.driver) {
      onDriverUpdated(res.driver);
      setPixLocalFeedback({ type: 'ok', text: successMsg });
      setTimeout(() => setPixLocalFeedback(null), 4000);
      return true;
    }
    setPixLocalFeedback({
      type: 'err',
      text: res.error || 'Não foi possível atualizar as chaves PIX. Verifique a titularidade.'
    });
    return false;
  };

  const handleAddSameOwnerPixKey = async (e: React.FormEvent) => {
    e.preventDefault();
    setPixLocalFeedback(null);

    if (savedPixKeys.length >= 5) {
      setPixLocalFeedback({ type: 'err', text: 'Limite máximo de 5 chaves PIX atingido.' });
      return;
    }

    const keyTrimmed = pixEditType === 'cpf' && currentDriver.document
      ? formatCPF(currentDriver.document)
      : pixEditKey.trim();

    if (!keyTrimmed) {
      setPixLocalFeedback({ type: 'err', text: 'Informe a chave PIX que deseja cadastrar.' });
      return;
    }

    if (pixEditType === 'cpf' && ownerDocDigits) {
      if (keyTrimmed.replace(/\D/g, '') !== ownerDocDigits) {
        setPixLocalFeedback({
          type: 'err',
          text: `Chave CPF bloqueada: só é permitido cadastrar seu próprio CPF (${formatCPF(ownerDocDigits)}) por regra de mesma titularidade.`
        });
        return;
      }
    }

    if (!pixEditBank.trim()) {
      setPixLocalFeedback({ type: 'err', text: 'Informe o nome do banco de destino (ex: Nubank, Inter).' });
      return;
    }

    if (!sameOwnershipChecked) {
      setPixLocalFeedback({
        type: 'err',
        text: 'Confirme a declaração de mesma titularidade antes de cadastrar a chave.'
      });
      return;
    }

    const duplicate = savedPixKeys.some(
      k => k.pixType === pixEditType && k.pixKey.trim().toLowerCase() === keyTrimmed.toLowerCase()
    );
    if (duplicate) {
      setPixLocalFeedback({ type: 'err', text: 'Esta chave PIX já está cadastrada na sua conta.' });
      return;
    }

    const newItem: DriverPixKey = {
      id: `pix-${Date.now()}`,
      pixType: pixEditType,
      pixKey: keyTrimmed,
      bankName: pixEditBank.trim(),
      holderName: currentDriver.name,
      holderDocument: ownerDocDigits,
      sameOwnershipConfirmed: true,
      isDefault: savedPixKeys.length === 0,
      createdAt: new Date().toISOString()
    };

    const ok = await persistPixKeysList([...savedPixKeys, newItem], 'Nova chave PIX de mesma titularidade adicionada!');
    if (ok) {
      onPixKeyChange('');
      onPixBankChange('');
      setShowAddPixForm(false);
    }
  };

  const handleSetDefaultPixKey = async (targetId: string) => {
    const nextList = savedPixKeys.map(k => ({
      ...k,
      isDefault: k.id === targetId
    }));
    await persistPixKeysList(nextList, 'Chave PIX padrão para saques atualizada!');
  };

  const handleRemovePixKey = async (targetId: string) => {
    const remaining = savedPixKeys.filter(k => k.id !== targetId);
    if (remaining.length > 0 && !remaining.some(k => k.isDefault)) {
      remaining[0] = { ...remaining[0], isDefault: true };
    }
    await persistPixKeysList(remaining, 'Chave PIX removida da carteira.');
  };

  useEffect(() => {
    const req = currentDriver.profileChangeRequest?.status === 'pendente'
      ? currentDriver.profileChangeRequest
      : null;
    setReqName(req?.requestedFields?.name || currentDriver.name || '');
    setReqPhone(formatPhone(req?.requestedFields?.phone || currentDriver.phone || ''));
    setReqEmail(req?.requestedFields?.email ?? currentDriver.email ?? '');
    setReqCity(req?.requestedFields?.city ?? currentDriver.city ?? '');
  }, [
    currentDriver.id,
    currentDriver.name,
    currentDriver.phone,
    currentDriver.email,
    currentDriver.city,
    currentDriver.profileChangeRequest?.id,
    currentDriver.profileChangeRequest?.status
  ]);

  const handlePhotoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setIsUploadingPhoto(true);
    setPhotoFeedback('');
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error('Falha ao ler imagem.'));
        reader.readAsDataURL(file);
      });
      const compressed = await compressDataUrlForUpload(dataUrl, 640, 0.82);
      const res = await StorageService.updateDriverProfile(currentDriver.id, { photo: compressed });
      if (res.ok && res.driver) {
        onDriverUpdated(res.driver);
        setPhotoFeedback('Foto de perfil atualizada!');
        setTimeout(() => setPhotoFeedback(''), 3000);
      } else {
        setPhotoFeedback('Não foi possível salvar a foto agora.');
      }
    } catch {
      setPhotoFeedback('Arquivo de imagem inválido.');
    } finally {
      setIsUploadingPhoto(false);
    }
  };

  const hasPendingDiff =
    reqName.trim() !== (currentDriver.name || '').trim() ||
    reqPhone.replace(/\D/g, '') !== (currentDriver.phone || '').replace(/\D/g, '') ||
    reqEmail.trim().toLowerCase() !== (currentDriver.email || '').trim().toLowerCase() ||
    reqCity.trim() !== (currentDriver.city || '').trim();

  const handleSubmitChangeRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setChangeFeedback(null);
    if (!hasPendingDiff) {
      setChangeFeedback({ type: 'err', text: 'Altere nome, telefone, e-mail ou cidade antes de enviar.' });
      return;
    }
    setIsSubmittingChange(true);
    const res = await StorageService.requestDriverProfileChange(currentDriver.id, {
      name: reqName.trim(),
      phone: reqPhone.trim(),
      email: reqEmail.trim(),
      city: reqCity.trim()
    });
    setIsSubmittingChange(false);
    if (res.ok && res.driver) {
      onDriverUpdated(res.driver);
      setChangeFeedback({
        type: 'ok',
        text: 'Solicitação enviada! Os dados serão atualizados assim que o Admin Master aprovar.'
      });
    } else {
      setChangeFeedback({
        type: 'err',
        text: res.error || 'Erro ao enviar solicitação de alteração.'
      });
    }
  };

  const finalizedRides = completedRides.filter(r => r.status === 'finalizada');
  const totalEarnedAllTime = finalizedRides.reduce(
    (sum, r) => sum + Number(r.driverNetAmount || r.totalPrice || 0),
    0
  );
  const pcr = currentDriver.profileChangeRequest;

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      backgroundColor: '#F3F4F6',
      color: '#111111',
      zIndex: 60,
      overflowY: 'auto',
      boxSizing: 'border-box',
      paddingBottom: 'calc(28px + env(safe-area-inset-bottom, 0px))'
    }}>
      {/* Top Header Sticky estilo Uber */}
      <div style={{
        position: 'sticky',
        top: 0,
        zIndex: 10,
        backgroundColor: '#FFFFFF',
        borderBottom: '1px solid #E5E7EB',
        padding: 'calc(12px + env(safe-area-inset-top, 0px)) 16px 12px 16px'
      }}>
        <div style={{
          maxWidth: 560,
          margin: '0 auto',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 10
        }}>
          <button
            type="button"
            onClick={() => onChangeTab('radar')}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '8px 12px',
              borderRadius: 999,
              border: '1px solid #E5E7EB',
              backgroundColor: '#F3F4F6',
              color: '#111111',
              fontWeight: 700,
              fontSize: '0.82rem',
              cursor: 'pointer'
            }}
          >
            <ArrowLeft size={15} />
            <span>Mapa</span>
          </button>

          <div style={{ fontWeight: 900, fontSize: '1.02rem', color: '#111111', letterSpacing: '-0.02em' }}>
            {activeTab === 'ganhos' ? 'Ganhos' : activeTab === 'carteira' ? 'Carteira & PIX' : 'Conta do Motorista'}
          </div>

          <div style={{ width: 68 }} />
        </div>

        {/* Sub-navegação limpa entre as 3 abas */}
        <div style={{
          maxWidth: 560,
          margin: '10px auto 0 auto',
          display: 'grid',
          gridTemplateColumns: '1fr 1fr 1fr',
          gap: 6,
          backgroundColor: '#F3F4F6',
          padding: 4,
          borderRadius: 12
        }}>
          {([
            { id: 'ganhos', label: 'Ganhos', icon: DollarSign },
            { id: 'carteira', label: 'Carteira', icon: Wallet },
            { id: 'perfil', label: 'Perfil', icon: User }
          ] as const).map(item => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onChangeTab(item.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  padding: '8px 6px',
                  borderRadius: 9,
                  border: 'none',
                  backgroundColor: isActive ? '#111111' : 'transparent',
                  color: isActive ? '#FFFFFF' : '#4B5563',
                  fontSize: '0.8rem',
                  fontWeight: 800,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
              >
                <Icon size={14} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Container Principal */}
      <div style={{ maxWidth: 560, margin: '0 auto', padding: '16px' }}>
        {/* ============================================================ */}
        {/* ABA GANHOS                                                   */}
        {/* ============================================================ */}
        {activeTab === 'ganhos' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={CARD_STYLE}>
              <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Ganhos de Hoje
              </div>
              <div style={{ fontSize: '2.2rem', fontWeight: 900, color: '#111111', marginTop: 4, letterSpacing: '-0.03em' }}>
                R$ {todayEarnings.toFixed(2).replace('.', ',')}
              </div>
              <div style={{
                marginTop: 12,
                paddingTop: 12,
                borderTop: '1px solid #F3F4F6',
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 10
              }}>
                <div>
                  <div style={{ fontSize: '0.72rem', color: '#6B7280', fontWeight: 600 }}>Viagens concluídas</div>
                  <div style={{ fontSize: '1.05rem', fontWeight: 900, color: '#111111' }}>{finalizedRides.length}</div>
                </div>
                <div>
                  <div style={{ fontSize: '0.72rem', color: '#6B7280', fontWeight: 600 }}>Acumulado total</div>
                  <div style={{ fontSize: '1.05rem', fontWeight: 900, color: '#16A34A' }}>
                    R$ {totalEarnedAllTime.toFixed(2).replace('.', ',')}
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => onChangeTab('carteira')}
                style={{
                  width: '100%',
                  marginTop: 14,
                  height: 44,
                  borderRadius: 10,
                  border: 'none',
                  backgroundColor: '#111111',
                  color: '#FFFFFF',
                  fontWeight: 800,
                  fontSize: '0.88rem',
                  cursor: 'pointer'
                }}
              >
                Abrir Carteira e Sacar via PIX
              </button>
            </div>

            <div style={CARD_STYLE}>
              <div style={{ fontSize: '0.92rem', fontWeight: 900, color: '#111111', marginBottom: 12 }}>
                Últimas Viagens Concluídas
              </div>
              {completedRides.length === 0 ? (
                <div style={{ padding: '24px 8px', textAlign: 'center', color: '#6B7280', fontSize: '0.84rem' }}>
                  Nenhuma viagem concluída registrada ainda. Fique online no mapa para receber chamadas.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {completedRides.slice(0, 20).map(r => (
                    <div
                      key={r.id}
                      style={{
                        padding: '12px',
                        borderRadius: 12,
                        backgroundColor: '#F9FAFB',
                        border: '1px solid #E5E7EB',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        gap: 10
                      }}
                    >
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                          <span style={{ fontSize: '0.72rem', fontWeight: 800, color: '#111111' }}>
                            {formatRideCode(r)}
                          </span>
                          <span style={{
                            fontSize: '0.68rem',
                            fontWeight: 700,
                            padding: '1px 7px',
                            borderRadius: 999,
                            backgroundColor: '#E5E7EB',
                            color: '#374151',
                            textTransform: 'uppercase'
                          }}>
                            {r.paymentMethod}
                          </span>
                        </div>
                        <div style={{
                          fontSize: '0.8rem',
                          fontWeight: 600,
                          color: '#374151',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis'
                        }}>
                          {r.destination?.address || 'Destino urbano'}
                        </div>
                        <div style={{ fontSize: '0.7rem', color: '#6B7280', marginTop: 2 }}>
                          {r.date} {r.time ? `• ${r.time}` : ''}
                        </div>
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <div style={{ fontSize: '0.95rem', fontWeight: 900, color: '#16A34A' }}>
                          R$ {Number(r.driverNetAmount || r.totalPrice || 0).toFixed(2).replace('.', ',')}
                        </div>
                        <div style={{ fontSize: '0.68rem', color: '#6B7280' }}>Líquido</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ============================================================ */}
        {/* ABA CARTEIRA PIX                                             */}
        {/* ============================================================ */}
        {activeTab === 'carteira' && (() => {
          const allWithdrawals = wallet?.withdrawals || [];
          const pendingWithdrawals = allWithdrawals.filter(w => w.status === 'solicitado' || w.status === 'processando');
          const completedWithdrawals = allWithdrawals.filter(w => w.status === 'pago');
          const rejectedWithdrawals = allWithdrawals.filter(w => w.status === 'rejeitado');
          const pendingWithdrawTotal = pendingWithdrawals.reduce((acc, w) => acc + Number(w.amount || 0), 0);

          const filteredWithdrawals = allWithdrawals.filter(w => {
            if (withdrawalFilter === 'pending') return w.status === 'solicitado' || w.status === 'processando';
            if (withdrawalFilter === 'completed') return w.status === 'pago';
            if (withdrawalFilter === 'rejected') return w.status === 'rejeitado';
            return true;
          });

          const formatPixTypeLabel = (t?: string) => {
            if (t === 'cpf') return 'CPF';
            if (t === 'cnpj') return 'CNPJ';
            if (t === 'telefone') return 'Celular';
            if (t === 'email') return 'E-mail';
            return 'Aleatória';
          };

          const getStatusStyle = (status: string) => {
            if (status === 'pago') {
              return { label: 'Concluído', bg: '#DCFCE7', color: '#15803D', border: '#BBF7D0', icon: <CheckCircle2 size={12} /> };
            }
            if (status === 'rejeitado') {
              return { label: 'Rejeitado', bg: '#FEE2E2', color: '#B91C1C', border: '#FECACA', icon: <XCircle size={12} /> };
            }
            if (status === 'processando') {
              return { label: 'Processando', bg: '#DBEAFE', color: '#1D4ED8', border: '#BFDBFE', icon: <Clock size={12} /> };
            }
            return { label: 'Pendente', bg: '#FEF3C7', color: '#B45309', border: '#FDE68A', icon: <Clock size={12} /> };
          };

          const isAddingMode = savedPixKeys.length === 0 || showAddPixForm;

          return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={CARD_STYLE}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                <div>
                  <div style={{ fontSize: '0.74rem', fontWeight: 700, color: '#6B7280', textTransform: 'uppercase' }}>
                    Saldo Disponível p/ Saque
                  </div>
                  <div style={{ fontSize: '2.1rem', fontWeight: 900, color: '#111111', marginTop: 4 }}>
                    R$ {(wallet?.availableBalance || 0).toFixed(2).replace('.', ',')}
                  </div>
                </div>
                {wallet && wallet.debtBalance > 0 && (
                  <div style={{
                    padding: '8px 12px',
                    borderRadius: 12,
                    backgroundColor: '#FEF2F2',
                    border: '1px solid #FECACA',
                    textAlign: 'right'
                  }}>
                    <div style={{ fontSize: '0.68rem', fontWeight: 800, color: '#B91C1C' }}>Taxa Pendente (Dinheiro)</div>
                    <div style={{ fontSize: '0.98rem', fontWeight: 900, color: '#DC2626' }}>
                      R$ {wallet.debtBalance.toFixed(2).replace('.', ',')}
                    </div>
                  </div>
                )}
              </div>

              {/* Mini resumo financeiro da carteira */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: 8,
                marginTop: 12
              }}>
                <div style={{ backgroundColor: '#F9FAFB', borderRadius: 10, padding: '8px 10px', border: '1px solid #E5E7EB' }}>
                  <div style={{ fontSize: '0.66rem', fontWeight: 700, color: '#6B7280' }}>A liberar</div>
                  <div style={{ fontSize: '0.84rem', fontWeight: 800, color: '#111111' }}>
                    R$ {(wallet?.pendingBalance || 0).toFixed(2).replace('.', ',')}
                  </div>
                </div>
                <div style={{ backgroundColor: '#FFFBEB', borderRadius: 10, padding: '8px 10px', border: '1px solid #FDE68A' }}>
                  <div style={{ fontSize: '0.66rem', fontWeight: 700, color: '#B45309' }}>Saques pendentes</div>
                  <div style={{ fontSize: '0.84rem', fontWeight: 800, color: '#92400E' }}>
                    R$ {pendingWithdrawTotal.toFixed(2).replace('.', ',')}
                  </div>
                </div>
                <div style={{ backgroundColor: '#F0FDF4', borderRadius: 10, padding: '8px 10px', border: '1px solid #BBF7D0' }}>
                  <div style={{ fontSize: '0.66rem', fontWeight: 700, color: '#15803D' }}>Já sacado</div>
                  <div style={{ fontSize: '0.84rem', fontWeight: 800, color: '#166534' }}>
                    R$ {(wallet?.totalWithdrawn || 0).toFixed(2).replace('.', ',')}
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
                <button
                  type="button"
                  onClick={onOpenWithdrawModal}
                  style={{
                    flex: 1,
                    height: 44,
                    borderRadius: 10,
                    border: 'none',
                    backgroundColor: '#111111',
                    color: '#FFFFFF',
                    fontWeight: 800,
                    fontSize: '0.88rem',
                    cursor: 'pointer'
                  }}
                >
                  Solicitar Saque PIX
                </button>
                {wallet && wallet.debtBalance > 0 && (
                  <button
                    type="button"
                    onClick={onOpenDebtPixModal}
                    style={{
                      flex: 1,
                      height: 44,
                      borderRadius: 10,
                      border: 'none',
                      backgroundColor: '#DC2626',
                      color: '#FFFFFF',
                      fontWeight: 800,
                      fontSize: '0.86rem',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 6,
                      cursor: 'pointer'
                    }}
                  >
                    <QrCode size={16} />
                    <span>Quitar Dívida PIX</span>
                  </button>
                )}
              </div>
            </div>

            {/* Múltiplas Chaves PIX com Mesma Titularidade */}
            <div style={CARD_STYLE}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, marginBottom: 8 }}>
                <div>
                  <div style={{ fontSize: '0.94rem', fontWeight: 900, color: '#111111' }}>
                    Chaves PIX para Repasses ({savedPixKeys.length}/5)
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#6B7280', marginTop: 2 }}>
                    Cadastre mais de uma chave PIX para receber seus ganhos.
                  </div>
                </div>
                {savedPixKeys.length > 0 && savedPixKeys.length < 5 && (
                  <button
                    type="button"
                    onClick={() => {
                      const opening = !showAddPixForm;
                      setShowAddPixForm(opening);
                      setPixLocalFeedback(null);
                      if (opening) {
                        onPixTypeChange('telefone');
                        onPixKeyChange(currentDriver.phone ? formatPhone(currentDriver.phone) : '');
                        onPixBankChange('');
                      }
                    }}
                    style={{
                      padding: '7px 11px',
                      borderRadius: 9,
                      border: '1px solid #111111',
                      backgroundColor: showAddPixForm ? '#F3F4F6' : '#111111',
                      color: showAddPixForm ? '#111111' : '#FFFFFF',
                      fontSize: '0.75rem',
                      fontWeight: 800,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 5,
                      cursor: 'pointer',
                      flexShrink: 0
                    }}
                  >
                    {showAddPixForm ? <span>Fechar</span> : <><Plus size={14} /><span>Nova Chave</span></>}
                  </button>
                )}
              </div>

              {/* Selo fixo de Mesma Titularidade Obrigatória */}
              <div style={{
                padding: '9px 11px',
                borderRadius: 10,
                backgroundColor: '#F0FDF4',
                border: '1px solid #BBF7D0',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                marginBottom: 12
              }}>
                <ShieldCheck size={16} color="#15803D" style={{ flexShrink: 0 }} />
                <div style={{ fontSize: '0.73rem', color: '#166534', lineHeight: 1.35 }}>
                  <strong>Mesma titularidade obrigatória:</strong> apenas contas em nome de{' '}
                  <strong>{currentDriver.name}</strong> (CPF{' '}
                  <strong>{ownerDocDigits ? formatCPF(ownerDocDigits) : 'cadastrado'}</strong>).
                </div>
              </div>

              {/* Lista das chaves já cadastradas */}
              {savedPixKeys.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: isAddingMode ? 14 : 0 }}>
                  {savedPixKeys.map((item) => (
                    <div
                      key={item.id}
                      style={{
                        padding: '11px 12px',
                        borderRadius: 12,
                        border: item.isDefault ? '1.5px solid #111111' : '1px solid #E5E7EB',
                        backgroundColor: item.isDefault ? '#FAFAFA' : '#FFFFFF',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        gap: 10
                      }}
                    >
                      <div style={{ minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 4 }}>
                          <span style={{
                            fontSize: '0.67rem',
                            fontWeight: 800,
                            padding: '2px 7px',
                            borderRadius: 999,
                            backgroundColor: '#E5E7EB',
                            color: '#1F2937'
                          }}>
                            {formatPixTypeLabel(item.pixType)}
                          </span>
                          {item.isDefault && (
                            <span style={{
                              fontSize: '0.67rem',
                              fontWeight: 800,
                              padding: '2px 8px',
                              borderRadius: 999,
                              backgroundColor: '#DCFCE7',
                              color: '#15803D'
                            }}>
                              Padrão p/ saques
                            </span>
                          )}
                          {item.bankName && (
                            <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#4B5563' }}>
                              • {item.bankName}
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: '0.88rem', fontWeight: 800, color: '#111111', wordBreak: 'break-all' }}>
                          {item.pixKey}
                        </div>
                        <div style={{ fontSize: '0.7rem', color: '#6B7280', marginTop: 2 }}>
                          Titular: {item.holderName || currentDriver.name} • CPF{' '}
                          {item.holderDocument ? formatCPF(item.holderDocument) : formatCPF(ownerDocDigits)}
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                        {!item.isDefault && (
                          <button
                            type="button"
                            disabled={isMutatingPixList}
                            onClick={() => handleSetDefaultPixKey(item.id)}
                            style={{
                              padding: '6px 9px',
                              borderRadius: 8,
                              border: '1px solid #D1D5DB',
                              backgroundColor: '#FFFFFF',
                              color: '#111111',
                              fontSize: '0.7rem',
                              fontWeight: 700,
                              cursor: 'pointer'
                            }}
                          >
                            Definir padrão
                          </button>
                        )}
                        <button
                          type="button"
                          disabled={isMutatingPixList}
                          onClick={() => handleRemovePixKey(item.id)}
                          title="Remover chave PIX"
                          style={{
                            width: 30,
                            height: 30,
                            borderRadius: 8,
                            border: '1px solid #FECACA',
                            backgroundColor: '#FEF2F2',
                            color: '#DC2626',
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            cursor: 'pointer'
                          }}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {(pixLocalFeedback || pixSaveNotice) && (
                <div style={{
                  marginBottom: isAddingMode ? 10 : 0,
                  padding: '8px 10px',
                  borderRadius: 9,
                  backgroundColor: (pixLocalFeedback?.type === 'ok' || pixSaveNotice.includes('sucesso')) ? '#F0FDF4' : '#FEF2F2',
                  border: (pixLocalFeedback?.type === 'ok' || pixSaveNotice.includes('sucesso')) ? '1px solid #BBF7D0' : '1px solid #FECACA',
                  fontSize: '0.76rem',
                  fontWeight: 700,
                  color: (pixLocalFeedback?.type === 'ok' || pixSaveNotice.includes('sucesso')) ? '#15803D' : '#DC2626'
                }}>
                  {pixLocalFeedback?.text || pixSaveNotice}
                </div>
              )}

              {/* Formulário para cadastrar nova chave PIX */}
              {isAddingMode && (
                <form
                  onSubmit={handleAddSameOwnerPixKey}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 10,
                    paddingTop: savedPixKeys.length > 0 ? 12 : 0,
                    borderTop: savedPixKeys.length > 0 ? '1px dashed #E5E7EB' : 'none'
                  }}
                >
                  <div style={{ fontSize: '0.78rem', fontWeight: 800, color: '#111111' }}>
                    {savedPixKeys.length > 0 ? 'Adicionar outra chave PIX (mesmo titular)' : 'Cadastrar chave PIX principal'}
                  </div>

                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {([
                      { id: 'cpf', label: 'CPF (Titular)' },
                      { id: 'telefone', label: 'Celular' },
                      { id: 'email', label: 'E-mail' },
                      { id: 'aleatoria', label: 'Aleatória' }
                    ] as const).map(opt => {
                      const selected = pixEditType === opt.id;
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => {
                            onPixTypeChange(opt.id);
                            if (opt.id === 'cpf' && ownerDocDigits) onPixKeyChange(formatCPF(ownerDocDigits));
                            else if (opt.id === 'telefone' && currentDriver.phone) onPixKeyChange(formatPhone(currentDriver.phone));
                            else if (opt.id === 'email' && currentDriver.email) onPixKeyChange(currentDriver.email);
                            else onPixKeyChange('');
                          }}
                          style={{
                            padding: '6px 12px',
                            borderRadius: 999,
                            border: selected ? '1.5px solid #111111' : '1px solid #E5E7EB',
                            backgroundColor: selected ? '#111111' : '#FFFFFF',
                            color: selected ? '#FFFFFF' : '#374151',
                            fontSize: '0.75rem',
                            fontWeight: 700,
                            cursor: 'pointer'
                          }}
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>

                  <input
                    type="text"
                    placeholder={pixEditType === 'cpf' ? 'CPF do titular' : 'Digite sua chave PIX'}
                    value={pixEditType === 'cpf' && ownerDocDigits ? formatCPF(ownerDocDigits) : pixEditKey}
                    readOnly={pixEditType === 'cpf' && Boolean(ownerDocDigits)}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (pixEditType === 'cpf') onPixKeyChange(formatCPF(val));
                      else if (pixEditType === 'telefone') onPixKeyChange(formatPhone(val));
                      else onPixKeyChange(val);
                    }}
                    style={{
                      ...INPUT_STYLE,
                      paddingLeft: 12,
                      backgroundColor: pixEditType === 'cpf' && ownerDocDigits ? '#F3F4F6' : '#F9FAFB'
                    }}
                  />

                  <input
                    type="text"
                    placeholder="Banco (ex: Nubank, Banco do Brasil, Inter, Itaú)"
                    value={pixEditBank}
                    onChange={(e) => onPixBankChange(e.target.value)}
                    style={{ ...INPUT_STYLE, paddingLeft: 12 }}
                  />

                  <label style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 8,
                    padding: '9px 10px',
                    borderRadius: 10,
                    backgroundColor: '#F9FAFB',
                    border: '1px solid #E5E7EB',
                    fontSize: '0.73rem',
                    color: '#374151',
                    lineHeight: 1.4,
                    cursor: 'pointer'
                  }}>
                    <input
                      type="checkbox"
                      checked={sameOwnershipChecked}
                      onChange={(e) => setSameOwnershipChecked(e.target.checked)}
                      style={{ marginTop: 2, accentColor: '#111111' }}
                    />
                    <span>
                      Declaro que esta chave PIX está vinculada a uma conta bancária de{' '}
                      <strong>mesma titularidade</strong> ({currentDriver.name} • CPF{' '}
                      {ownerDocDigits ? formatCPF(ownerDocDigits) : 'do titular'}).
                    </span>
                  </label>

                  <button
                    type="submit"
                    disabled={isMutatingPixList || isSavingPix}
                    style={{
                      height: 42,
                      borderRadius: 10,
                      border: 'none',
                      backgroundColor: '#111111',
                      color: '#FFFFFF',
                      fontWeight: 800,
                      fontSize: '0.86rem',
                      cursor: 'pointer'
                    }}
                  >
                    {(isMutatingPixList || isSavingPix) ? 'Validando e salvando...' : 'Cadastrar Chave PIX'}
                  </button>
                </form>
              )}
            </div>

            {/* Histórico de Saques (Pendente, Concluído, Rejeitado) */}
            <div style={CARD_STYLE}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                <div>
                  <div style={{ fontSize: '0.94rem', fontWeight: 900, color: '#111111' }}>
                    Histórico de Saques &amp; Repasses
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#6B7280', marginTop: 2 }}>
                    Acompanhe solicitações pendentes, transferências concluídas e eventuais estornos.
                  </div>
                </div>
              </div>

              {/* Pills de filtro por status */}
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
                {([
                  { id: 'all', label: `Todos (${allWithdrawals.length})` },
                  { id: 'pending', label: `Pendentes (${pendingWithdrawals.length})` },
                  { id: 'completed', label: `Concluídos (${completedWithdrawals.length})` },
                  { id: 'rejected', label: `Rejeitados (${rejectedWithdrawals.length})` }
                ] as const).map(tab => {
                  const active = withdrawalFilter === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setWithdrawalFilter(tab.id)}
                      style={{
                        padding: '6px 11px',
                        borderRadius: 999,
                        border: active ? '1.5px solid #111111' : '1px solid #E5E7EB',
                        backgroundColor: active ? '#111111' : '#F9FAFB',
                        color: active ? '#FFFFFF' : '#374151',
                        fontSize: '0.73rem',
                        fontWeight: 700,
                        cursor: 'pointer'
                      }}
                    >
                      {tab.label}
                    </button>
                  );
                })}
              </div>

              {filteredWithdrawals.length === 0 ? (
                <div style={{
                  padding: '22px 14px',
                  borderRadius: 12,
                  backgroundColor: '#F9FAFB',
                  border: '1px dashed #E5E7EB',
                  textAlign: 'center',
                  fontSize: '0.8rem',
                  color: '#6B7280'
                }}>
                  {allWithdrawals.length === 0
                    ? 'Você ainda não realizou nenhuma solicitação de saque PIX.'
                    : 'Nenhum saque encontrado neste filtro.'}
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {filteredWithdrawals.map(wd => {
                    const st = getStatusStyle(wd.status);
                    const dateFormatted = wd.createdAt
                      ? new Date(wd.createdAt).toLocaleString('pt-BR', {
                          day: '2-digit',
                          month: '2-digit',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit'
                        })
                      : '--';
                    return (
                      <div
                        key={wd.id}
                        style={{
                          padding: '12px 13px',
                          borderRadius: 12,
                          border: '1px solid #E5E7EB',
                          backgroundColor: '#FFFFFF',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 6
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                          <div style={{ fontSize: '1rem', fontWeight: 900, color: '#111111' }}>
                            R$ {Number(wd.amount || 0).toFixed(2).replace('.', ',')}
                          </div>
                          <span style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 5,
                            padding: '3px 9px',
                            borderRadius: 999,
                            backgroundColor: st.bg,
                            color: st.color,
                            border: `1px solid ${st.border}`,
                            fontSize: '0.71rem',
                            fontWeight: 800
                          }}>
                            {st.icon}
                            <span>{st.label}</span>
                          </span>
                        </div>

                        <div style={{ fontSize: '0.76rem', color: '#4B5563', display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
                          <span>
                            Chave: <strong>{formatPixTypeLabel(wd.pixType)}</strong> • {wd.pixKey}
                          </span>
                          <span style={{ color: '#6B7280' }}>{dateFormatted}</span>
                        </div>

                        {wd.payoutProviderTxId && (
                          <div style={{ fontSize: '0.71rem', color: '#15803D', fontWeight: 700 }}>
                            Comprovante PIX / ID: {wd.payoutProviderTxId}
                          </div>
                        )}

                        {wd.notes && (
                          <div style={{
                            marginTop: 2,
                            padding: '6px 9px',
                            borderRadius: 8,
                            backgroundColor: wd.status === 'rejeitado' ? '#FEF2F2' : '#F9FAFB',
                            color: wd.status === 'rejeitado' ? '#B91C1C' : '#4B5563',
                            fontSize: '0.72rem',
                            fontWeight: 600,
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6
                          }}>
                            <AlertCircle size={13} style={{ flexShrink: 0 }} />
                            <span>{wd.notes}</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
          );
        })()}

        {/* ============================================================ */}
        {/* ABA PERFIL (UBER LIGHT + FOTO + ALTERAÇÃO VIA ADMIN MASTER)  */}
        {/* ============================================================ */}
        {activeTab === 'perfil' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* Card 1: Cabeçalho com Foto de Perfil editável */}
            <div style={{ ...CARD_STYLE, textAlign: 'center', padding: '22px 18px' }}>
              <input
                ref={photoInputRef}
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={handlePhotoSelect}
              />
              <div style={{ position: 'relative', width: 88, height: 88, margin: '0 auto 12px auto' }}>
                {currentDriver.photo ? (
                  <img
                    src={currentDriver.photo}
                    alt={currentDriver.name}
                    style={{
                      width: 88,
                      height: 88,
                      borderRadius: '50%',
                      objectFit: 'cover',
                      border: '2px solid #111111'
                    }}
                  />
                ) : (
                  <div style={{
                    width: 88,
                    height: 88,
                    borderRadius: '50%',
                    backgroundColor: '#111111',
                    color: '#FFFFFF',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '2rem',
                    fontWeight: 900
                  }}>
                    {currentDriver.name.charAt(0).toUpperCase()}
                  </div>
                )}
                <button
                  type="button"
                  disabled={isUploadingPhoto}
                  onClick={() => photoInputRef.current?.click()}
                  title="Alterar foto de perfil"
                  style={{
                    position: 'absolute',
                    bottom: 0,
                    right: 0,
                    width: 30,
                    height: 30,
                    borderRadius: '50%',
                    backgroundColor: '#FFFFFF',
                    color: '#111111',
                    border: '1.5px solid #D1D5DB',
                    boxShadow: '0 2px 6px rgba(0,0,0,0.16)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer'
                  }}
                >
                  <Camera size={14} />
                </button>
              </div>

              <div style={{ fontSize: '1.2rem', fontWeight: 900, color: '#111111' }}>
                {currentDriver.name}
              </div>
              <div style={{ fontSize: '0.84rem', color: '#6B7280', marginTop: 3 }}>
                {currentDriver.vehicleBrand} {currentDriver.vehicleModel} • {currentDriver.vehiclePlate}
              </div>
              <div style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                marginTop: 8,
                padding: '4px 12px',
                borderRadius: 999,
                backgroundColor: '#F3F4F6',
                color: '#111111',
                fontWeight: 800,
                fontSize: '0.82rem'
              }}>
                <Star size={14} fill="#111111" color="#111111" />
                <span>{(currentDriver.rating || 5).toFixed(2)} Avaliação</span>
              </div>

              <div style={{ marginTop: 10 }}>
                <button
                  type="button"
                  disabled={isUploadingPhoto}
                  onClick={() => photoInputRef.current?.click()}
                  style={{
                    padding: '6px 14px',
                    borderRadius: 999,
                    border: '1px solid #D1D5DB',
                    backgroundColor: '#F9FAFB',
                    color: '#111111',
                    fontSize: '0.76rem',
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  {isUploadingPhoto ? 'Enviando foto...' : currentDriver.photo ? 'Trocar foto de perfil' : 'Adicionar foto de perfil'}
                </button>
                {photoFeedback && (
                  <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#16A34A', marginTop: 6 }}>
                    {photoFeedback}
                  </div>
                )}
              </div>
            </div>

            {/* Card 2: Editar Dados Pessoais (Sujeito à aprovação do Admin Master) */}
            <div style={CARD_STYLE}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, gap: 8 }}>
                <div>
                  <div style={{ fontSize: '0.95rem', fontWeight: 900, color: '#111111' }}>
                    Dados Cadastrais
                  </div>
                  <div style={{ fontSize: '0.74rem', color: '#6B7280', marginTop: 2 }}>
                    Alterações de nome, telefone ou e-mail passam por aprovação do Admin Master.
                  </div>
                </div>
                <Lock size={16} color="#6B7280" style={{ flexShrink: 0 }} />
              </div>

              {pcr?.status === 'pendente' && (
                <div style={{
                  padding: '10px 12px',
                  borderRadius: 10,
                  backgroundColor: '#FFFBEB',
                  border: '1px solid #FDE68A',
                  color: '#92400E',
                  fontSize: '0.78rem',
                  marginBottom: 12
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 800 }}>
                    <Clock size={14} />
                    <span>Aguardando aprovação do Admin Master</span>
                  </div>
                  <div style={{ marginTop: 4, lineHeight: 1.4 }}>
                    Solicitado:{' '}
                    {pcr.requestedFields.name ? `Nome → "${pcr.requestedFields.name}" ` : ''}
                    {pcr.requestedFields.phone ? `• Tel → "${pcr.requestedFields.phone}" ` : ''}
                    {pcr.requestedFields.email !== undefined ? `• E-mail → "${pcr.requestedFields.email || '—'}" ` : ''}
                    {pcr.requestedFields.city !== undefined ? `• Cidade → "${pcr.requestedFields.city}"` : ''}
                  </div>
                </div>
              )}

              {pcr?.status === 'aprovado' && (
                <div style={{
                  padding: '9px 12px',
                  borderRadius: 10,
                  backgroundColor: '#F0FDF4',
                  border: '1px solid #BBF7D0',
                  color: '#166534',
                  fontSize: '0.76rem',
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  marginBottom: 12
                }}>
                  <CheckCircle2 size={14} />
                  <span>Sua alteração cadastral foi aprovada e aplicada pelo Admin Master.</span>
                </div>
              )}

              {pcr?.status === 'recusado' && (
                <div style={{
                  padding: '10px 12px',
                  borderRadius: 10,
                  backgroundColor: '#FEF2F2',
                  border: '1px solid #FECACA',
                  color: '#991B1B',
                  fontSize: '0.77rem',
                  marginBottom: 12
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 800 }}>
                    <XCircle size={14} />
                    <span>Alteração recusada pelo Admin Master</span>
                  </div>
                  <div style={{ marginTop: 3 }}>
                    {pcr.rejectionReason || 'A alteração solicitada não foi autorizada e os dados originais foram mantidos.'}
                  </div>
                </div>
              )}

              <form onSubmit={handleSubmitChangeRequest} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.73rem', fontWeight: 700, color: '#374151', marginBottom: 4 }}>
                    Nome Completo
                  </label>
                  <div style={{ position: 'relative' }}>
                    <User size={15} color="#6B7280" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }} />
                    <input
                      type="text"
                      value={reqName}
                      onChange={(e) => setReqName(e.target.value)}
                      required
                      style={INPUT_STYLE}
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.73rem', fontWeight: 700, color: '#374151', marginBottom: 4 }}>
                      Telefone / WhatsApp
                    </label>
                    <div style={{ position: 'relative' }}>
                      <Phone size={15} color="#6B7280" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }} />
                      <input
                        type="tel"
                        value={reqPhone}
                        onChange={(e) => setReqPhone(formatPhone(e.target.value))}
                        required
                        style={INPUT_STYLE}
                      />
                    </div>
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.73rem', fontWeight: 700, color: '#374151', marginBottom: 4 }}>
                      Cidade Base
                    </label>
                    <div style={{ position: 'relative' }}>
                      <MapPin size={15} color="#6B7280" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }} />
                      <input
                        type="text"
                        value={reqCity}
                        onChange={(e) => setReqCity(e.target.value)}
                        style={INPUT_STYLE}
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.73rem', fontWeight: 700, color: '#374151', marginBottom: 4 }}>
                    E-mail
                  </label>
                  <div style={{ position: 'relative' }}>
                    <Mail size={15} color="#6B7280" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }} />
                    <input
                      type="email"
                      value={reqEmail}
                      onChange={(e) => setReqEmail(e.target.value)}
                      placeholder="motorista@email.com"
                      style={INPUT_STYLE}
                    />
                  </div>
                </div>

                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  padding: '8px 10px',
                  borderRadius: 8,
                  backgroundColor: '#F3F4F6',
                  fontSize: '0.73rem',
                  color: '#4B5563',
                  fontWeight: 600
                }}>
                  <span>CPF: {formatCPF(currentDriver.document) || '—'}</span>
                  <span>CNH: {currentDriver.cnh || '—'}</span>
                </div>

                {changeFeedback && (
                  <div style={{
                    fontSize: '0.78rem',
                    fontWeight: 700,
                    color: changeFeedback.type === 'ok' ? '#15803D' : '#DC2626'
                  }}>
                    {changeFeedback.text}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isSubmittingChange || !hasPendingDiff}
                  style={{
                    height: 44,
                    borderRadius: 10,
                    border: 'none',
                    backgroundColor: hasPendingDiff ? '#111111' : '#E5E7EB',
                    color: hasPendingDiff ? '#FFFFFF' : '#6B7280',
                    fontWeight: 800,
                    fontSize: '0.86rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    cursor: hasPendingDiff ? 'pointer' : 'default'
                  }}
                >
                  {hasPendingDiff ? <Send size={15} /> : <Check size={15} />}
                  <span>
                    {isSubmittingChange
                      ? 'Enviando ao Admin Master...'
                      : hasPendingDiff
                      ? 'Solicitar Alteração ao Admin Master'
                      : 'Dados Sem Alterações Pendentes'}
                  </span>
                </button>
              </form>
            </div>

            {/* Card 3: Verificação KYC & Biometria */}
            <div style={CARD_STYLE}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <ShieldCheck size={18} color="#16A34A" />
                  <span style={{ fontWeight: 900, fontSize: '0.92rem', color: '#111111' }}>
                    Identidade & Biometria KYC
                  </span>
                </div>
                <span style={{
                  fontSize: '0.72rem',
                  fontWeight: 800,
                  padding: '3px 9px',
                  borderRadius: 999,
                  backgroundColor: currentDriver.approvalStatus === 'aprovado' ? '#DCFCE7' : '#FEF3C7',
                  color: currentDriver.approvalStatus === 'aprovado' ? '#15803D' : '#B45309'
                }}>
                  {currentDriver.approvalStatus === 'aprovado' ? 'Aprovado' : 'Em análise'}
                </span>
              </div>
              <div style={{ fontSize: '0.78rem', color: '#6B7280', lineHeight: 1.45, marginBottom: 12 }}>
                Sua identidade foi conferida via modelo open source Human Biometrics comparando CNH e selfie facial.
                {currentDriver.kyc?.biometricResult && (
                  <div style={{ marginTop: 4, color: '#111111', fontWeight: 700 }}>
                    Similaridade registrada: {currentDriver.kyc.biometricResult.similarityScore ?? currentDriver.kyc.biometricResult.similarity ?? 0}%
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={onOpenKycModal}
                style={{
                  width: '100%',
                  height: 42,
                  borderRadius: 10,
                  border: '1px solid #E5E7EB',
                  backgroundColor: '#F3F4F6',
                  color: '#111111',
                  fontWeight: 800,
                  fontSize: '0.84rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  cursor: 'pointer'
                }}
              >
                <Eye size={15} />
                <span>Visualizar CNH & Selfie KYC</span>
              </button>
            </div>

            {/* Card 4: Termos & Contrato Digital */}
            <div style={CARD_STYLE}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <FileText size={18} color="#111111" />
                  <span style={{ fontWeight: 900, fontSize: '0.92rem', color: '#111111' }}>
                    Termos & Contrato Digital
                  </span>
                </div>
                <span style={{
                  fontSize: '0.72rem',
                  fontWeight: 800,
                  padding: '3px 9px',
                  borderRadius: 999,
                  backgroundColor: currentDriver.termsSignature?.signed ? '#DCFCE7' : '#FEF3C7',
                  color: currentDriver.termsSignature?.signed ? '#15803D' : '#B45309'
                }}>
                  {currentDriver.termsSignature?.signed ? 'Assinado' : `Versão ${DRIVER_TERMS_CONTRACT_VERSION}`}
                </span>
              </div>
              <div style={{ fontSize: '0.78rem', color: '#6B7280', lineHeight: 1.45, marginBottom: 12 }}>
                {currentDriver.termsSignature?.signed ? (
                  <>
                    Assinado eletronicamente em <strong style={{ color: '#111111' }}>{currentDriver.termsSignature.signedAtBrasilia}</strong>.
                    <div style={{ fontSize: '0.72rem', color: '#15803D', marginTop: 4, fontFamily: 'monospace', fontWeight: 700 }}>
                      Código: {currentDriver.termsSignature.validationCode}
                    </div>
                  </>
                ) : (
                  <>Instrumento contratual de Motorista Parceiro Kavro Drive ({DRIVER_TERMS_CONTRACT_ID}).</>
                )}
              </div>
              <button
                type="button"
                onClick={onOpenTermsModal}
                style={{
                  width: '100%',
                  height: 42,
                  borderRadius: 10,
                  border: '1px solid #E5E7EB',
                  backgroundColor: '#F3F4F6',
                  color: '#111111',
                  fontWeight: 800,
                  fontSize: '0.84rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  cursor: 'pointer'
                }}
              >
                <Eye size={15} />
                <span>
                  {currentDriver.termsSignature?.signed
                    ? `Ver Termo Assinado (${currentDriver.termsSignature.validationCode})`
                    : 'Visualizar Termos de Uso'}
                </span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
