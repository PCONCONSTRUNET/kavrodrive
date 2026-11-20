import React, { useState } from 'react';
import {
  ArrowLeft,
  Briefcase,
  Camera,
  Car,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock,
  CreditCard,
  Download,
  ExternalLink,
  FileText,
  Grid3x3,
  HelpCircle,
  Home,
  Leaf,
  Lock,
  LogOut,
  Mail,
  MapPin,
  Mic,
  Navigation,
  Phone,
  Receipt,
  RotateCcw,
  Send,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  Star,
  Trash2,
  User,
  UserCheck,
  UserPlus,
  Wallet,
  XCircle
} from 'lucide-react';
import {
  ClientProfile,
  LocationPoint,
  Ride,
  SystemConfig
} from '../types';
import { StorageService } from '../services/storage';
import { formatCurrency, formatCPF, formatPhone, formatRideCode } from '../utils/format';
import { searchAddressGeocode } from '../utils/geo';
import { clientExternalId } from '../services/push';
import { PushToggleButton } from './PushNotifications';
import { AddressPickerModal } from './AddressPickerModal';
import { SafetyCenterInitialView } from './SafetyCenterModal';
import { WhatsAppIcon } from './WhatsAppIcon';

export type AccountSubView =
  | 'hub'
  | 'help'
  | 'vip'
  | 'safety_checkup'
  | 'sustainability'
  | 'addresses'
  | 'settings'
  | 'simple_mode'
  | 'contacts'
  | 'partner_driver'
  | 'saved_routes'
  | 'corporate'
  | 'manage_account'
  | 'legal';

export interface SafetyCheckItem {
  key: 'pin' | 'trusted' | 'emergency' | 'ridecheck' | 'audio';
  title: string;
  description: string;
  completed: boolean;
  targetView: SafetyCenterInitialView;
  icon: React.ReactNode;
}

export function computeSafetyCheckItems(user: ClientProfile | null): SafetyCheckItem[] {
  const prefs = user?.safetyPreferences;
  const familyOn = Boolean(prefs?.familySafetyEnabled);
  const pinOn = familyOn ? true : prefs?.boardingPinEnabled !== false;
  const rideCheckOn = prefs?.rideCheckEnabled !== false;
  const audioOn = Boolean(prefs?.audioRecordingEnabled);
  const trustedCount = (user?.trustedContacts || []).length;
  const emergencyCount = (user?.emergencyContacts || []).length;

  return [
    {
      key: 'pin',
      title: 'K-Código no embarque',
      description: pinOn ? 'Ativo para validar a placa e o carro certo' : 'Desativado no momento',
      completed: pinOn,
      targetView: 'pin',
      icon: <Grid3x3 size={18} />
    },
    {
      key: 'trusted',
      title: 'Contatos de Confiança',
      description: trustedCount > 0 ? `${trustedCount} contato(s) recebendo sua rota` : 'Adicione quem acompanha suas viagens',
      completed: trustedCount > 0,
      targetView: 'share',
      icon: <UserCheck size={18} />
    },
    {
      key: 'emergency',
      title: 'Contatos de Emergência',
      description: emergencyCount > 0 ? `${emergencyCount} contato(s) para acionamento SOS` : 'Cadastre um contato para emergências',
      completed: emergencyCount > 0,
      targetView: 'emergency',
      icon: <UserPlus size={18} />
    },
    {
      key: 'ridecheck',
      title: 'K-Ajuda (Detecção de paradas)',
      description: rideCheckOn ? 'Monitoramento automático ativo em corridas' : 'Monitoramento desativado',
      completed: rideCheckOn,
      targetView: 'ridecheck',
      icon: <ShieldAlert size={18} />
    },
    {
      key: 'audio',
      title: 'K-Áudio (Gravação segura)',
      description: audioOn ? 'Pronto para gravar áudio durante viagens' : 'Habilite o recurso nas viagens',
      completed: audioOn,
      targetView: 'audio',
      icon: <Mic size={18} />
    }
  ];
}

export const SafetyCheckupRing: React.FC<{ completed: number; total: number }> = ({ completed, total }) => {
  const size = 50;
  const stroke = 5;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const ratio = total > 0 ? Math.max(0, Math.min(1, completed / total)) : 0;
  const dashOffset = circumference * (1 - ratio);

  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#CBD5E1"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#2563EB"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
        />
      </svg>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '0.78rem',
          fontWeight: 900,
          color: '#0F172A'
        }}
      >
        {completed}/{total}
      </div>
    </div>
  );
};

export const AccountSubHeader: React.FC<{
  title: string;
  subtitle?: string;
  onBack: () => void;
}> = ({ title, subtitle, onBack }) => (
  <div
    style={{
      position: 'sticky',
      top: 0,
      zIndex: 25,
      backgroundColor: 'rgba(255, 255, 255, 0.96)',
      backdropFilter: 'blur(10px)',
      borderBottom: '1px solid #F1F5F9',
      padding: '12px 16px',
      display: 'flex',
      alignItems: 'center',
      gap: 12
    }}
  >
    <button
      type="button"
      onClick={onBack}
      aria-label="Voltar para Conta"
      style={{
        width: 36,
        height: 36,
        borderRadius: '50%',
        backgroundColor: '#F3F4F6',
        border: 'none',
        color: '#0F172A',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        flexShrink: 0
      }}
    >
      <ArrowLeft size={19} strokeWidth={2.4} />
    </button>
    <div style={{ minWidth: 0, flex: 1 }}>
      <h2
        style={{
          margin: 0,
          fontSize: '1.15rem',
          fontWeight: 900,
          color: '#0F172A',
          letterSpacing: '-0.02em',
          lineHeight: 1.2
        }}
      >
        {title}
      </h2>
      {subtitle && (
        <p style={{ margin: '2px 0 0 0', fontSize: '0.74rem', color: '#64748B', fontWeight: 500 }}>
          {subtitle}
        </p>
      )}
    </div>
  </div>
);

const cardSurface: React.CSSProperties = {
  backgroundColor: '#FFFFFF',
  borderRadius: 18,
  padding: '16px',
  border: '1px solid #E5E7EB',
  boxShadow: '0 2px 10px rgba(15, 23, 42, 0.04)'
};

const pillActionStyle: React.CSSProperties = {
  width: '100%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 12,
  padding: '14px',
  borderRadius: 14,
  border: '1px solid #E5E7EB',
  backgroundColor: '#F8FAFC',
  cursor: 'pointer',
  textAlign: 'left'
};

interface AccountSubViewsProps {
  subView: Exclude<AccountSubView, 'hub'>;
  currentUser: ClientProfile;
  config: SystemConfig;
  walletBalance: number;
  completedRides: Ride[];
  totalCompletedKm: number;
  estimatedCo2Grams: number;
  safetyItems: SafetyCheckItem[];
  simpleMode: boolean;
  supportUrl: string;
  // Form & upload state passed from ClientProfileScreen
  name: string;
  phone: string;
  email: string;
  documentValue: string;
  hasChanges: boolean;
  savedSuccess: boolean;
  isSubmittingProfileReq: boolean;
  profileReqError: string;
  isUploadingPhoto: boolean;
  photoFeedback: string;
  onNameChange: (v: string) => void;
  onPhoneChange: (v: string) => void;
  onEmailChange: (v: string) => void;
  onDocumentChange: (v: string) => void;
  onSubmitProfile: (e: React.FormEvent) => void;
  onTriggerPhotoPick: () => void;
  onBackToHub: () => void;
  onNavigateSubView: (view: AccountSubView) => void;
  onNavigateRoute: (path: string) => void;
  onUpdateUser: (updated: ClientProfile) => void;
  onOpenWallet: (mode: 'overview' | 'deposit' | 'statement') => void;
  onOpenSafetyCenter: (initialView: SafetyCenterInitialView) => void;
  onOpenTrustedContacts: () => void;
  onOpenSignedContract: () => void;
  onOpenTermsPrivacy: () => void;
  onOpenReceipt: (ride: Ride) => void;
  onToggleSimpleMode: () => void;
  onLogout: () => void;
  onBookDestination?: (point: LocationPoint) => void;
  onGoToMyRides?: () => void;
}

function getAddressVisual(label: string) {
  const lower = String(label || '').toLowerCase();
  if (lower.includes('casa') || lower.includes('resid')) {
    return { bg: '#DCFCE7', fg: '#15803D', icon: <Home size={16} /> };
  }
  if (lower.includes('trab') || lower.includes('empres') || lower.includes('escrit')) {
    return { bg: '#DBEAFE', fg: '#1D4ED8', icon: <Briefcase size={16} /> };
  }
  if (lower.includes('acad')) {
    return { bg: '#FEF3C7', fg: '#B45309', icon: <Star size={16} /> };
  }
  return { bg: 'rgba(118, 216, 0, 0.16)', fg: '#3F6212', icon: <MapPin size={16} /> };
}

export function formatCo2Saved(grams: number): string {
  if (!Number.isFinite(grams) || grams <= 0) return '0 g';
  if (grams >= 1000) return `${(grams / 1000).toFixed(1).replace('.', ',')} kg`;
  return `${Math.round(grams)} g`;
}

export const AccountSubViews: React.FC<AccountSubViewsProps> = ({
  subView,
  currentUser,
  config,
  walletBalance,
  completedRides,
  totalCompletedKm,
  estimatedCo2Grams,
  safetyItems,
  simpleMode,
  supportUrl,
  name,
  phone,
  email,
  documentValue,
  hasChanges,
  savedSuccess,
  isSubmittingProfileReq,
  profileReqError,
  isUploadingPhoto,
  photoFeedback,
  onNameChange,
  onPhoneChange,
  onEmailChange,
  onDocumentChange,
  onSubmitProfile,
  onTriggerPhotoPick,
  onBackToHub,
  onNavigateSubView,
  onNavigateRoute,
  onUpdateUser,
  onOpenWallet,
  onOpenSafetyCenter,
  onOpenTrustedContacts,
  onOpenSignedContract,
  onOpenTermsPrivacy,
  onOpenReceipt,
  onToggleSimpleMode,
  onLogout,
  onBookDestination,
  onGoToMyRides
}) => {
  const [showAddAddress, setShowAddAddress] = useState(false);
  const [newAddrLabel, setNewAddrLabel] = useState('');
  const [newAddrText, setNewAddrText] = useState('');
  const [isGeocoding, setIsGeocoding] = useState(false);
  const [isPickingOnMap, setIsPickingOnMap] = useState(false);
  const [mapLabelPreset, setMapLabelPreset] = useState('Favorito');
  const [recentList, setRecentList] = useState<LocationPoint[]>(() =>
    StorageService.getRecentDestinations()
  );

  const savedAddresses = currentUser.savedAddresses || [];
  const safetyScore = safetyItems.filter((item) => item.completed).length;

  const persistSavedAddress = (label: string, point: LocationPoint) => {
    const cleanLabel = label.trim() || 'Favorito';
    const nextItem = {
      id: `addr-${Date.now()}`,
      label: cleanLabel,
      address: point.address,
      lat: point.lat,
      lng: point.lng
    };
    const updatedUser: ClientProfile = {
      ...currentUser,
      savedAddresses: [...savedAddresses, nextItem]
    };
    StorageService.setCurrentUser(updatedUser);
    StorageService.saveClient(updatedUser);
    onUpdateUser(updatedUser);
  };

  const handleAddManualAddress = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAddrLabel.trim() || !newAddrText.trim()) return;
    setIsGeocoding(true);
    let lat = -28.3878;
    let lng = -49.3977;
    try {
      const geo = await searchAddressGeocode(newAddrText.trim());
      if (geo.length > 0) {
        lat = geo[0].lat;
        lng = geo[0].lng;
      }
    } catch {
      // fallback default coordinates
    } finally {
      setIsGeocoding(false);
    }
    persistSavedAddress(newAddrLabel, { address: newAddrText.trim(), lat, lng });
    setNewAddrLabel('');
    setNewAddrText('');
    setShowAddAddress(false);
  };

  const handleDeleteAddress = (id: string) => {
    const updatedUser: ClientProfile = {
      ...currentUser,
      savedAddresses: savedAddresses.filter((a) => a.id !== id)
    };
    StorageService.setCurrentUser(updatedUser);
    StorageService.saveClient(updatedUser);
    onUpdateUser(updatedUser);
  };

  const handlePickPreset = (label: string) => {
    setMapLabelPreset(label);
    setIsPickingOnMap(true);
  };

  const SUBVIEW_META: Record<Exclude<AccountSubView, 'hub'>, { title: string; subtitle?: string }> = {
    manage_account: {
      title: 'Gerenciar conta',
      subtitle: 'Foto, dados cadastrais e segurança de acesso'
    },
    addresses: {
      title: 'Endereços salvos',
      subtitle: 'Casa, trabalho e locais frequentes'
    },
    saved_routes: {
      title: 'Locais e rotas salvas',
      subtitle: 'Favoritos e destinos visitados recentemente'
    },
    contacts: {
      title: 'Contatos',
      subtitle: 'Contatos de confiança e emergência SOS'
    },
    safety_checkup: {
      title: 'Checagem de segurança',
      subtitle: `${safetyScore} de ${safetyItems.length} recursos ativos`
    },
    settings: {
      title: 'Configurações',
      subtitle: 'Notificações, aplicativo e preferências'
    },
    simple_mode: {
      title: 'Modo simples',
      subtitle: 'Leitura ampliada e botões mais confortáveis'
    },
    vip: {
      title: 'Kavro VIP & Benefícios',
      subtitle: 'Seu histórico, pontualidade e meios de pagamento'
    },
    sustainability: {
      title: 'Redução estimada de CO₂',
      subtitle: 'Acompanhe seu impacto nas viagens'
    },
    corporate: {
      title: 'Perfil Corporativo e Recibos',
      subtitle: 'Comprovantes das suas viagens e e-mail'
    },
    help: {
      title: 'Ajuda e Suporte',
      subtitle: 'Atendimento rápido e dúvidas frequentes'
    },
    partner_driver: {
      title: 'Ganhe dinheiro com a Kavro',
      subtitle: 'Dirija passageiros ou faça entregas locais'
    },
    legal: {
      title: 'Jurídico e Privacidade',
      subtitle: 'Termo digital assinado, contrato e LGPD'
    }
  };

  const meta = SUBVIEW_META[subView];

  return (
    <div className="animate-fade-in" style={{ backgroundColor: '#FFFFFF', minHeight: '100%', paddingBottom: 96 }}>
      <AccountSubHeader title={meta.title} subtitle={meta.subtitle} onBack={onBackToHub} />

      <AddressPickerModal
        isOpen={isPickingOnMap}
        onClose={() => setIsPickingOnMap(false)}
        title={`Definir local: ${mapLabelPreset}`}
        onSelect={(point) => {
          persistSavedAddress(mapLabelPreset, point);
          setIsPickingOnMap(false);
        }}
      />

      <div style={{ padding: '16px 16px 24px 16px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* 1. GERENCIAR CONTA (DADOS CADASTRAIS, FOTO & SAIR) */}
        {subView === 'manage_account' && (
          <>
            <div style={{ ...cardSurface, display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ position: 'relative', flexShrink: 0 }}>
                {currentUser.photo ? (
                  <img
                    src={currentUser.photo}
                    alt={currentUser.name}
                    style={{
                      width: 68,
                      height: 68,
                      borderRadius: '50%',
                      objectFit: 'cover',
                      border: '2px solid #0F172A'
                    }}
                  />
                ) : (
                  <div
                    style={{
                      width: 68,
                      height: 68,
                      borderRadius: '50%',
                      backgroundColor: '#111111',
                      color: '#FFFFFF',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '1.55rem',
                      fontWeight: 900
                    }}
                  >
                    {currentUser.name.charAt(0).toUpperCase()}
                  </div>
                )}
              </div>

              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: '1.05rem', fontWeight: 900, color: '#0F172A' }}>
                  {currentUser.name}
                </div>
                <div style={{ fontSize: '0.78rem', color: '#64748B', marginTop: 2 }}>
                  {formatPhone(currentUser.phone)}
                </div>
                <button
                  type="button"
                  disabled={isUploadingPhoto}
                  onClick={onTriggerPhotoPick}
                  style={{
                    marginTop: 8,
                    padding: '6px 12px',
                    borderRadius: 999,
                    border: '1px solid #CBD5E1',
                    backgroundColor: '#F8FAFC',
                    color: '#0F172A',
                    fontSize: '0.75rem',
                    fontWeight: 800,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6
                  }}
                >
                  <Camera size={13} />
                  <span>{isUploadingPhoto ? 'Enviando...' : 'Trocar foto de perfil'}</span>
                </button>
                {photoFeedback && (
                  <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#15803D', marginTop: 4 }}>
                    {photoFeedback}
                  </div>
                )}
              </div>
            </div>

            <div style={cardSurface}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <div>
                  <div style={{ fontSize: '0.94rem', fontWeight: 900, color: '#0F172A' }}>
                    Dados do Cadastro
                  </div>
                  <div style={{ fontSize: '0.72rem', color: '#64748B', marginTop: 2 }}>
                    Trocas de nome, telefone ou e-mail passam por aprovação do Admin Master.
                  </div>
                </div>
                {hasChanges && (
                  <span
                    style={{
                      fontSize: '0.68rem',
                      fontWeight: 800,
                      color: '#B45309',
                      backgroundColor: '#FEF3C7',
                      padding: '3px 8px',
                      borderRadius: 8
                    }}
                  >
                    Editado
                  </span>
                )}
              </div>

              {currentUser.profileChangeRequest?.status === 'pendente' && (
                <div
                  style={{
                    padding: '10px 12px',
                    borderRadius: 12,
                    backgroundColor: '#FFFBEB',
                    border: '1px solid #FDE68A',
                    color: '#92400E',
                    fontSize: '0.76rem',
                    marginBottom: 12
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 800 }}>
                    <Clock size={14} />
                    <span>Solicitação em análise pelo Admin Master</span>
                  </div>
                  <div style={{ marginTop: 3 }}>Seus dados atuais permanecem ativos até a aprovação.</div>
                </div>
              )}

              {currentUser.profileChangeRequest?.status === 'aprovado' && (
                <div
                  style={{
                    padding: '9px 12px',
                    borderRadius: 12,
                    backgroundColor: '#F0FDF4',
                    border: '1px solid #BBF7D0',
                    color: '#166534',
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    marginBottom: 12
                  }}
                >
                  <CheckCircle2 size={14} />
                  <span>Sua última solicitação cadastral foi aprovada.</span>
                </div>
              )}

              {currentUser.profileChangeRequest?.status === 'recusado' && (
                <div
                  style={{
                    padding: '10px 12px',
                    borderRadius: 12,
                    backgroundColor: '#FEF2F2',
                    border: '1px solid #FECACA',
                    color: '#991B1B',
                    fontSize: '0.76rem',
                    marginBottom: 12
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 800 }}>
                    <XCircle size={14} />
                    <span>Alteração recusada pelo Admin Master</span>
                  </div>
                  <div style={{ marginTop: 3 }}>
                    {currentUser.profileChangeRequest.rejectionReason ||
                      'A troca de dados não foi autorizada pela central.'}
                  </div>
                </div>
              )}

              {profileReqError && (
                <div
                  style={{
                    padding: '8px 10px',
                    borderRadius: 10,
                    backgroundColor: '#FEF2F2',
                    border: '1px solid #FECACA',
                    color: '#DC2626',
                    fontSize: '0.76rem',
                    fontWeight: 700,
                    marginBottom: 10
                  }}
                >
                  {profileReqError}
                </div>
              )}

              <form onSubmit={onSubmitProfile} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.73rem', fontWeight: 700, color: '#475569', marginBottom: 4 }}>
                    Nome Completo
                  </label>
                  <div style={{ position: 'relative' }}>
                    <User size={15} color="#94A3B8" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }} />
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => onNameChange(e.target.value)}
                      required
                      style={{
                        width: '100%',
                        padding: '10px 12px 10px 36px',
                        borderRadius: 12,
                        border: '1.5px solid #CBD5E1',
                        fontSize: '0.86rem',
                        color: '#0F172A',
                        fontWeight: 600,
                        backgroundColor: '#F8FAFC'
                      }}
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1.15fr 1fr', gap: 8 }}>
                  <div style={{ minWidth: 0 }}>
                    <label style={{ display: 'block', fontSize: '0.73rem', fontWeight: 700, color: '#475569', marginBottom: 4 }}>
                      WhatsApp / Celular
                    </label>
                    <div style={{ position: 'relative' }}>
                      <Phone size={15} color="#94A3B8" style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)' }} />
                      <input
                        type="tel"
                        inputMode="numeric"
                        value={phone}
                        onChange={(e) => onPhoneChange(formatPhone(e.target.value))}
                        required
                        style={{
                          width: '100%',
                          padding: '10px 10px 10px 33px',
                          borderRadius: 12,
                          border: '1.5px solid #CBD5E1',
                          fontSize: '0.84rem',
                          color: '#0F172A',
                          fontWeight: 600,
                          backgroundColor: '#F8FAFC'
                        }}
                      />
                    </div>
                  </div>

                  <div style={{ minWidth: 0 }}>
                    <label style={{ display: 'block', fontSize: '0.73rem', fontWeight: 700, color: '#475569', marginBottom: 4 }}>
                      CPF *
                    </label>
                    <div style={{ position: 'relative' }}>
                      <CreditCard size={15} color="#94A3B8" style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)' }} />
                      <input
                        type="text"
                        placeholder="000.000.000-00"
                        inputMode="numeric"
                        maxLength={14}
                        value={documentValue}
                        onChange={(e) => onDocumentChange(formatCPF(e.target.value))}
                        style={{
                          width: '100%',
                          padding: '10px 10px 10px 33px',
                          borderRadius: 12,
                          border: '1.5px solid #CBD5E1',
                          fontSize: '0.84rem',
                          color: '#0F172A',
                          fontWeight: 600,
                          backgroundColor: '#F8FAFC'
                        }}
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.73rem', fontWeight: 700, color: '#475569', marginBottom: 4 }}>
                    E-mail para Recibos <span style={{ color: '#94A3B8', fontWeight: 500 }}>(opcional)</span>
                  </label>
                  <div style={{ position: 'relative' }}>
                    <Mail size={15} color="#94A3B8" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }} />
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => onEmailChange(e.target.value)}
                      placeholder="exemplo@gmail.com"
                      style={{
                        width: '100%',
                        padding: '10px 12px 10px 36px',
                        borderRadius: 12,
                        border: '1.5px solid #CBD5E1',
                        fontSize: '0.86rem',
                        color: '#0F172A',
                        fontWeight: 600,
                        backgroundColor: '#F8FAFC'
                      }}
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isSubmittingProfileReq || (!hasChanges && !savedSuccess)}
                  style={{
                    height: 44,
                    borderRadius: 12,
                    marginTop: 4,
                    fontSize: '0.85rem',
                    fontWeight: 800,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 7,
                    cursor: hasChanges && !isSubmittingProfileReq ? 'pointer' : 'default',
                    border: savedSuccess ? '1px solid #86EFAC' : hasChanges ? 'none' : '1px solid #E5E7EB',
                    backgroundColor: savedSuccess ? '#DCFCE7' : hasChanges ? '#111111' : '#F3F4F6',
                    color: savedSuccess ? '#15803D' : hasChanges ? '#FFFFFF' : '#64748B'
                  }}
                >
                  {savedSuccess ? (
                    <>
                      <Check size={16} color="#15803D" />
                      <span>Solicitação Enviada ao Admin Master!</span>
                    </>
                  ) : isSubmittingProfileReq ? (
                    <span>Enviando solicitação...</span>
                  ) : hasChanges ? (
                    <>
                      <Send size={15} />
                      <span>Solicitar Alteração ao Admin Master</span>
                    </>
                  ) : (
                    <>
                      <Lock size={14} color="#94A3B8" />
                      <span>Dados Protegidos (Sem Alterações)</span>
                    </>
                  )}
                </button>
              </form>
            </div>

            <button
              type="button"
              onClick={onLogout}
              style={{
                width: '100%',
                padding: '13px 16px',
                borderRadius: 14,
                border: '1px solid #FECACA',
                backgroundColor: '#FEF2F2',
                color: '#DC2626',
                fontSize: '0.88rem',
                fontWeight: 800,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8
              }}
            >
              <LogOut size={16} />
              <span>Sair da conta neste aparelho</span>
            </button>
          </>
        )}

        {/* 2. ENDEREÇOS SALVOS */}
        {subView === 'addresses' && (
          <>
            <div style={cardSurface}>
              <div style={{ fontSize: '0.88rem', fontWeight: 800, color: '#0F172A', marginBottom: 10 }}>
                Adicionar pelo mapa em 1 toque
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                {(['Casa', 'Trabalho', 'Academia'] as const).map((preset) => {
                  const visual = getAddressVisual(preset);
                  return (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => handlePickPreset(preset)}
                      style={{
                        minWidth: 0,
                        padding: '11px 8px',
                        borderRadius: 12,
                        border: '1px solid #E5E7EB',
                        backgroundColor: '#F8FAFC',
                        cursor: 'pointer',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: 6
                      }}
                    >
                      <span
                        style={{
                          width: 32,
                          height: 32,
                          borderRadius: 10,
                          backgroundColor: visual.bg,
                          color: visual.fg,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center'
                        }}
                      >
                        {visual.icon}
                      </span>
                      <span style={{ fontSize: '0.76rem', fontWeight: 800, color: '#0F172A' }}>
                        + {preset}
                      </span>
                    </button>
                  );
                })}
              </div>

              <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                <button
                  type="button"
                  onClick={() => handlePickPreset('Favorito')}
                  style={{
                    flex: 1,
                    padding: '10px 12px',
                    borderRadius: 12,
                    border: 'none',
                    backgroundColor: '#111111',
                    color: '#FFFFFF',
                    fontSize: '0.8rem',
                    fontWeight: 800,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6
                  }}
                >
                  <MapPin size={15} color="#76D800" />
                  <span>Buscar no Mapa</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowAddAddress((v) => !v)}
                  style={{
                    padding: '10px 14px',
                    borderRadius: 12,
                    border: '1px solid #CBD5E1',
                    backgroundColor: '#FFFFFF',
                    color: '#0F172A',
                    fontSize: '0.8rem',
                    fontWeight: 800,
                    cursor: 'pointer'
                  }}
                >
                  {showAddAddress ? 'Fechar' : 'Digitar'}
                </button>
              </div>

              {showAddAddress && (
                <form
                  onSubmit={handleAddManualAddress}
                  style={{
                    marginTop: 12,
                    padding: 12,
                    borderRadius: 14,
                    backgroundColor: '#F8FAFC',
                    border: '1px solid #E2E8F0',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8
                  }}
                >
                  <input
                    type="text"
                    placeholder="Apelido do local (Ex: Casa de Praia)"
                    value={newAddrLabel}
                    onChange={(e) => setNewAddrLabel(e.target.value)}
                    required
                    style={{
                      width: '100%',
                      padding: '9px 11px',
                      borderRadius: 10,
                      border: '1px solid #CBD5E1',
                      fontSize: '0.84rem',
                      backgroundColor: '#FFFFFF'
                    }}
                  />
                  <input
                    type="text"
                    placeholder="Endereço completo (Rua, número, cidade)"
                    value={newAddrText}
                    onChange={(e) => setNewAddrText(e.target.value)}
                    required
                    style={{
                      width: '100%',
                      padding: '9px 11px',
                      borderRadius: 10,
                      border: '1px solid #CBD5E1',
                      fontSize: '0.84rem',
                      backgroundColor: '#FFFFFF'
                    }}
                  />
                  <button
                    type="submit"
                    disabled={isGeocoding}
                    className="btn-ios-primary"
                    style={{ padding: '11px 16px', fontSize: '0.84rem', borderRadius: 10, boxShadow: 'none' }}
                  >
                    <Check size={15} />
                    <span>{isGeocoding ? 'Localizando...' : 'Salvar Endereço'}</span>
                  </button>
                </form>
              )}
            </div>

            <div style={cardSurface}>
              <div style={{ fontSize: '0.88rem', fontWeight: 800, color: '#0F172A', marginBottom: 10 }}>
                Meus locais salvos ({savedAddresses.length})
              </div>
              {savedAddresses.length === 0 ? (
                <div style={{ fontSize: '0.8rem', color: '#64748B', lineHeight: 1.4 }}>
                  Nenhum endereço salvo ainda. Use os botões acima para salvar Casa, Trabalho ou favoritos.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {savedAddresses.map((addr) => {
                    const visual = getAddressVisual(addr.label);
                    return (
                      <div
                        key={addr.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: 10,
                          padding: '10px 12px',
                          borderRadius: 12,
                          backgroundColor: '#F8FAFC',
                          border: '1px solid #E5E7EB'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>
                          <span
                            style={{
                              width: 34,
                              height: 34,
                              borderRadius: 10,
                              backgroundColor: visual.bg,
                              color: visual.fg,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              flexShrink: 0
                            }}
                          >
                            {visual.icon}
                          </span>
                          <div style={{ minWidth: 0, flex: 1 }}>
                            <div style={{ fontSize: '0.84rem', fontWeight: 800, color: '#0F172A' }}>
                              {addr.label}
                            </div>
                            <div
                              style={{
                                fontSize: '0.73rem',
                                color: '#64748B',
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis'
                              }}
                            >
                              {addr.address}
                            </div>
                          </div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          {onBookDestination && (
                            <button
                              type="button"
                              onClick={() =>
                                onBookDestination({
                                  address: addr.address,
                                  lat: addr.lat,
                                  lng: addr.lng,
                                  reference: addr.label
                                })
                              }
                              title="Pedir viagem para este local"
                              style={{
                                padding: '6px 10px',
                                borderRadius: 999,
                                border: '1px solid #E2E8F0',
                                backgroundColor: '#FFFFFF',
                                color: '#0F172A',
                                fontSize: '0.72rem',
                                fontWeight: 800,
                                cursor: 'pointer'
                              }}
                            >
                              Ir
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => handleDeleteAddress(addr.id)}
                            title="Excluir endereço"
                            style={{
                              background: 'none',
                              border: 'none',
                              padding: 6,
                              cursor: 'pointer'
                            }}
                          >
                            <Trash2 size={15} color="#EF4444" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}

        {/* 3. LOCAIS E ROTAS SALVAS */}
        {subView === 'saved_routes' && (
          <>
            <div style={cardSurface}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <div style={{ fontSize: '0.9rem', fontWeight: 800, color: '#0F172A' }}>
                  Locais Favoritos ({savedAddresses.length})
                </div>
                <button
                  type="button"
                  onClick={() => onNavigateSubView('addresses')}
                  style={{
                    background: '#F3F4F6',
                    border: 'none',
                    borderRadius: 999,
                    padding: '6px 12px',
                    fontSize: '0.74rem',
                    fontWeight: 800,
                    color: '#0F172A',
                    cursor: 'pointer'
                  }}
                >
                  Gerenciar
                </button>
              </div>
              {savedAddresses.length === 0 ? (
                <div style={{ fontSize: '0.78rem', color: '#64748B' }}>
                  Nenhum favorito cadastrado ainda.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {savedAddresses.map((addr) => (
                    <div
                      key={addr.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 8,
                        padding: '8px 10px',
                        borderRadius: 10,
                        backgroundColor: '#F8FAFC'
                      }}
                    >
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontSize: '0.82rem', fontWeight: 800, color: '#0F172A' }}>{addr.label}</div>
                        <div style={{ fontSize: '0.72rem', color: '#64748B', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {addr.address}
                        </div>
                      </div>
                      {onBookDestination && (
                        <button
                          type="button"
                          onClick={() =>
                            onBookDestination({
                              address: addr.address,
                              lat: addr.lat,
                              lng: addr.lng,
                              reference: addr.label
                            })
                          }
                          style={{
                            border: 'none',
                            backgroundColor: '#111111',
                            color: '#FFFFFF',
                            borderRadius: 999,
                            padding: '5px 11px',
                            fontSize: '0.72rem',
                            fontWeight: 800,
                            cursor: 'pointer',
                            flexShrink: 0
                          }}
                        >
                          Solicitar
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div style={cardSurface}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <div style={{ fontSize: '0.9rem', fontWeight: 800, color: '#0F172A' }}>
                  Destinos recentes ({recentList.length})
                </div>
                {recentList.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      StorageService.clearRecentDestinations();
                      setRecentList([]);
                    }}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#DC2626',
                      fontSize: '0.74rem',
                      fontWeight: 700,
                      cursor: 'pointer'
                    }}
                  >
                    Limpar tudo
                  </button>
                )}
              </div>
              {recentList.length === 0 ? (
                <div style={{ fontSize: '0.78rem', color: '#64748B' }}>
                  Seus últimos destinos pesquisados aparecerão aqui para favoritar em 1 toque.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {recentList.map((pt, idx) => (
                    <div
                      key={`${pt.address}-${idx}`}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 10,
                        padding: '9px 11px',
                        borderRadius: 12,
                        backgroundColor: '#F8FAFC',
                        border: '1px solid #E5E7EB'
                      }}
                    >
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#0F172A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {pt.reference || pt.address.split(',')[0]}
                        </div>
                        <div style={{ fontSize: '0.7rem', color: '#64748B', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {pt.address}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => persistSavedAddress(pt.reference || pt.address.split(',')[0] || 'Favorito', pt)}
                        style={{
                          padding: '6px 10px',
                          borderRadius: 999,
                          border: '1px solid #BBF7D0',
                          backgroundColor: '#F0FDF4',
                          color: '#15803D',
                          fontSize: '0.72rem',
                          fontWeight: 800,
                          cursor: 'pointer',
                          flexShrink: 0
                        }}
                      >
                        + Favoritar
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        {/* 4. CONTATOS (CONFIANÇA & EMERGÊNCIA) */}
        {subView === 'contacts' && (
          <>
            <div style={cardSurface}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                  <div
                    style={{
                      width: 38,
                      height: 38,
                      borderRadius: 12,
                      backgroundColor: '#EFF6FF',
                      color: '#2563EB',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0
                    }}
                  >
                    <ShieldCheck size={19} />
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: '0.94rem', fontWeight: 800, color: '#0F172A' }}>
                      Contatos de Confiança
                    </div>
                    <div style={{ fontSize: '0.74rem', color: '#64748B' }}>
                      Recebem o link da sua rota ao vivo automaticamente
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={onOpenTrustedContacts}
                  style={{
                    backgroundColor: '#111111',
                    color: '#FFFFFF',
                    border: 'none',
                    borderRadius: 999,
                    padding: '8px 14px',
                    fontSize: '0.75rem',
                    fontWeight: 800,
                    cursor: 'pointer',
                    flexShrink: 0
                  }}
                >
                  {(currentUser.trustedContacts || []).length > 0 ? 'Gerenciar' : 'Adicionar'}
                </button>
              </div>

              {(currentUser.trustedContacts || []).length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 12 }}>
                  {(currentUser.trustedContacts || []).map((tc) => (
                    <div
                      key={tc.id}
                      style={{
                        padding: '9px 12px',
                        borderRadius: 12,
                        backgroundColor: '#F8FAFC',
                        border: '1px solid #E5E7EB',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between'
                      }}
                    >
                      <div>
                        <div style={{ fontSize: '0.82rem', fontWeight: 800, color: '#0F172A' }}>
                          {tc.name} • {tc.relationship || 'Familiar'}
                        </div>
                        <div style={{ fontSize: '0.72rem', color: '#64748B' }}>
                          {formatPhone(tc.phone)}
                        </div>
                      </div>
                      <Check size={16} color="#16A34A" />
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div style={cardSurface}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                  <div
                    style={{
                      width: 38,
                      height: 38,
                      borderRadius: 12,
                      backgroundColor: '#FEF2F2',
                      color: '#DC2626',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0
                    }}
                  >
                    <UserPlus size={19} />
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: '0.94rem', fontWeight: 800, color: '#0F172A' }}>
                      Contatos de Emergência SOS
                    </div>
                    <div style={{ fontSize: '0.74rem', color: '#64748B' }}>
                      Alertados quando você acionar o botão SOS ou K-Ajuda
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onOpenSafetyCenter('emergency')}
                  style={{
                    backgroundColor: '#F3F4F6',
                    color: '#0F172A',
                    border: '1px solid #CBD5E1',
                    borderRadius: 999,
                    padding: '8px 14px',
                    fontSize: '0.75rem',
                    fontWeight: 800,
                    cursor: 'pointer',
                    flexShrink: 0
                  }}
                >
                  {(currentUser.emergencyContacts || []).length > 0 ? 'Gerenciar' : 'Adicionar'}
                </button>
              </div>

              {(currentUser.emergencyContacts || []).length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 12 }}>
                  {(currentUser.emergencyContacts || []).map((ec) => (
                    <div
                      key={ec.id}
                      style={{
                        padding: '9px 12px',
                        borderRadius: 12,
                        backgroundColor: '#F8FAFC',
                        border: '1px solid #E5E7EB'
                      }}
                    >
                      <div style={{ fontSize: '0.82rem', fontWeight: 800, color: '#0F172A' }}>{ec.name}</div>
                      <div style={{ fontSize: '0.72rem', color: '#64748B' }}>{formatPhone(ec.phone)}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        {/* 5. CHECAGEM DE SEGURANÇA (X/5) */}
        {subView === 'safety_checkup' && (
          <>
            <div style={{ ...cardSurface, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14 }}>
              <div>
                <div style={{ fontSize: '1.05rem', fontWeight: 900, color: '#0F172A' }}>
                  {safetyScore} de {safetyItems.length} itens configurados
                </div>
                <div style={{ fontSize: '0.78rem', color: '#64748B', marginTop: 3, lineHeight: 1.4 }}>
                  Ative todos os recursos abaixo para viajar com máxima proteção na Kavro Drive.
                </div>
              </div>
              <SafetyCheckupRing completed={safetyScore} total={safetyItems.length} />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {safetyItems.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => onOpenSafetyCenter(item.targetView)}
                  style={pillActionStyle}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                    <div
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: 10,
                        backgroundColor: item.completed ? '#DCFCE7' : '#FFFFFF',
                        color: item.completed ? '#15803D' : '#475569',
                        border: '1px solid #E5E7EB',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0
                      }}
                    >
                      {item.completed ? <Check size={17} /> : item.icon}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: '0.88rem', fontWeight: 800, color: '#0F172A' }}>{item.title}</div>
                      <div style={{ fontSize: '0.74rem', color: '#64748B', marginTop: 2 }}>{item.description}</div>
                    </div>
                  </div>
                  <ChevronRight size={17} color="#94A3B8" style={{ flexShrink: 0 }} />
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => onOpenSafetyCenter('hub')}
              className="btn-ios-primary"
              style={{ padding: '13px 18px', fontSize: '0.9rem', borderRadius: 14, boxShadow: 'none' }}
            >
              <ShieldCheck size={17} />
              <span>Abrir Central de Segurança Completa</span>
            </button>
          </>
        )}

        {/* 6. CONFIGURAÇÕES */}
        {subView === 'settings' && (
          <>
            <PushToggleButton role="cliente" externalId={clientExternalId(currentUser.phone)} />

            <div style={cardSurface}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Smartphone size={19} color="#0F172A" />
                  <div>
                    <div style={{ fontSize: '0.88rem', fontWeight: 800, color: '#0F172A' }}>
                      Instalar Aplicativo Kavro Drive
                    </div>
                    <div style={{ fontSize: '0.72rem', color: '#64748B' }}>
                      Adicione o atalho direto na tela inicial do celular
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    localStorage.removeItem('up_pwa_dismissed_until');
                    window.location.reload();
                  }}
                  style={{
                    backgroundColor: '#111111',
                    color: '#FFFFFF',
                    border: 'none',
                    padding: '8px 13px',
                    borderRadius: 10,
                    fontSize: '0.76rem',
                    fontWeight: 800,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 5,
                    flexShrink: 0
                  }}
                >
                  <Download size={14} />
                  <span>Instalar</span>
                </button>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button type="button" onClick={() => onNavigateSubView('addresses')} style={pillActionStyle}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <MapPin size={18} color="#0F172A" />
                  <span style={{ fontSize: '0.88rem', fontWeight: 800, color: '#0F172A' }}>Endereços salvos</span>
                </div>
                <ChevronRight size={17} color="#94A3B8" />
              </button>

              <button type="button" onClick={() => onNavigateSubView('simple_mode')} style={pillActionStyle}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Smartphone size={18} color="#0F172A" />
                  <span style={{ fontSize: '0.88rem', fontWeight: 800, color: '#0F172A' }}>
                    Modo simples ({simpleMode ? 'Ativo' : 'Desativado'})
                  </span>
                </div>
                <ChevronRight size={17} color="#94A3B8" />
              </button>

              <button type="button" onClick={() => onNavigateSubView('manage_account')} style={pillActionStyle}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <User size={18} color="#0F172A" />
                  <span style={{ fontSize: '0.88rem', fontWeight: 800, color: '#0F172A' }}>Dados do cadastro e e-mail</span>
                </div>
                <ChevronRight size={17} color="#94A3B8" />
              </button>
            </div>

            <button
              type="button"
              onClick={onLogout}
              style={{
                width: '100%',
                padding: '13px 16px',
                borderRadius: 14,
                border: '1px solid #FECACA',
                backgroundColor: '#FEF2F2',
                color: '#DC2626',
                fontSize: '0.88rem',
                fontWeight: 800,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8
              }}
            >
              <LogOut size={16} />
              <span>Sair da conta</span>
            </button>
          </>
        )}

        {/* 7. MODO SIMPLES */}
        {subView === 'simple_mode' && (
          <div style={cardSurface}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <div>
                <div style={{ fontSize: '1rem', fontWeight: 900, color: '#0F172A' }}>
                  Interface simplificada
                </div>
                <div style={{ fontSize: '0.78rem', color: '#64748B', marginTop: 4, lineHeight: 1.4 }}>
                  Aumenta o tamanho dos textos e garante áreas de toque mais amplas em todo o aplicativo do passageiro.
                </div>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={simpleMode}
                aria-label="Ativar Modo Simples"
                onClick={onToggleSimpleMode}
                style={{
                  width: 52,
                  height: 30,
                  borderRadius: 999,
                  padding: 3,
                  border: 'none',
                  backgroundColor: simpleMode ? '#16A34A' : '#CBD5E1',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: simpleMode ? 'flex-end' : 'flex-start',
                  cursor: 'pointer',
                  transition: 'all 0.16s ease',
                  flexShrink: 0
                }}
              >
                <span
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: '50%',
                    backgroundColor: '#FFFFFF',
                    boxShadow: '0 1px 4px rgba(0,0,0,0.25)'
                  }}
                />
              </button>
            </div>

            <div
              style={{
                marginTop: 14,
                padding: '10px 12px',
                borderRadius: 12,
                backgroundColor: simpleMode ? '#F0FDF4' : '#F8FAFC',
                border: `1px solid ${simpleMode ? '#BBF7D0' : '#E2E8F0'}`,
                fontSize: '0.78rem',
                fontWeight: 700,
                color: simpleMode ? '#15803D' : '#475569'
              }}
            >
              Status atual: {simpleMode ? 'Modo Simples ativado neste aparelho' : 'Modo Padrão ativo'}
            </div>
          </div>
        )}

        {/* 8. KAVRO VIP & BENEFÍCIOS */}
        {subView === 'vip' && (
          <>
            <div style={cardSurface}>
              <div style={{ fontSize: '0.92rem', fontWeight: 900, color: '#0F172A', marginBottom: 12 }}>
                Seu status de passageiro
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                <div style={{ backgroundColor: '#F8FAFC', borderRadius: 12, padding: '10px 8px', textAlign: 'center' }}>
                  <Car size={16} color="#2563EB" style={{ margin: '0 auto 4px auto' }} />
                  <div style={{ fontSize: '1.05rem', fontWeight: 900, color: '#0F172A' }}>{completedRides.length}</div>
                  <div style={{ fontSize: '0.68rem', color: '#64748B', fontWeight: 600 }}>Viagens</div>
                </div>
                <div style={{ backgroundColor: '#F8FAFC', borderRadius: 12, padding: '10px 8px', textAlign: 'center' }}>
                  <Clock size={16} color="#16A34A" style={{ margin: '0 auto 4px auto' }} />
                  <div style={{ fontSize: '1.05rem', fontWeight: 900, color: '#0F172A' }}>100%</div>
                  <div style={{ fontSize: '0.68rem', color: '#64748B', fontWeight: 600 }}>Pontualidade</div>
                </div>
                <div style={{ backgroundColor: '#F8FAFC', borderRadius: 12, padding: '10px 8px', textAlign: 'center' }}>
                  <Star size={16} color="#F59E0B" style={{ margin: '0 auto 4px auto' }} />
                  <div style={{ fontSize: '1.05rem', fontWeight: 900, color: '#0F172A' }}>5.0</div>
                  <div style={{ fontSize: '0.68rem', color: '#64748B', fontWeight: 600 }}>Avaliação</div>
                </div>
              </div>
            </div>

            <div
              style={{
                borderRadius: 18,
                padding: 18,
                background: 'linear-gradient(145deg, #0B1117 0%, #16222E 100%)',
                color: '#FFFFFF'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#94A3B8' }}>Saldo na Carteira</span>
                <Wallet size={18} color="#76D800" />
              </div>
              <div style={{ fontSize: '1.65rem', fontWeight: 900, color: '#BEF264' }}>
                {formatCurrency(walletBalance)}
              </div>
              <div style={{ fontSize: '0.75rem', color: '#CBD5E1', marginTop: 4 }}>
                Use seu saldo para chamar corridas e entregas com aprovação instantânea (recarga mínima R$ 20,00).
              </div>
              <button
                type="button"
                onClick={() => onOpenWallet('deposit')}
                style={{
                  marginTop: 12,
                  backgroundColor: '#76D800',
                  color: '#0F172A',
                  border: 'none',
                  borderRadius: 999,
                  padding: '9px 16px',
                  fontSize: '0.8rem',
                  fontWeight: 900,
                  cursor: 'pointer'
                }}
              >
                + Adicionar saldo agora
              </button>
            </div>

            <div style={cardSurface}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <div style={{ fontSize: '0.9rem', fontWeight: 800, color: '#0F172A' }}>
                  Cartões salvos ({(currentUser.savedCards || []).length})
                </div>
                <button
                  type="button"
                  onClick={() => onOpenWallet('overview')}
                  style={{
                    background: '#F3F4F6',
                    border: 'none',
                    borderRadius: 999,
                    padding: '6px 12px',
                    fontSize: '0.74rem',
                    fontWeight: 800,
                    color: '#0F172A',
                    cursor: 'pointer'
                  }}
                >
                  Gerenciar
                </button>
              </div>
              {(currentUser.savedCards || []).length === 0 ? (
                <div style={{ fontSize: '0.78rem', color: '#64748B' }}>
                  Nenhum cartão cadastrado. Você pode adicionar dentro da Carteira ou no pagamento da viagem.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {(currentUser.savedCards || []).map((c) => (
                    <div
                      key={c.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '8px 10px',
                        borderRadius: 10,
                        backgroundColor: '#F8FAFC'
                      }}
                    >
                      <span style={{ fontSize: '0.82rem', fontWeight: 800, color: '#0F172A' }}>
                        {c.brand.toUpperCase()} •••• {c.last4}
                      </span>
                      <span style={{ fontSize: '0.72rem', color: '#64748B' }}>
                        {c.expMonth}/{c.expYear}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        {/* 9. SUSTENTABILIDADE / CO2 */}
        {subView === 'sustainability' && (
          <div style={cardSurface}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
              <div
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 14,
                  backgroundColor: '#DCFCE7',
                  color: '#15803D',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                <Leaf size={22} />
              </div>
              <div>
                <div style={{ fontSize: '1.25rem', fontWeight: 900, color: '#0F172A' }}>
                  {formatCo2Saved(estimatedCo2Grams)}
                </div>
                <div style={{ fontSize: '0.76rem', color: '#64748B' }}>
                  Estimativa acumulada de redução em rotas otimizadas
                </div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <div style={{ backgroundColor: '#F8FAFC', borderRadius: 12, padding: 12 }}>
                <div style={{ fontSize: '0.7rem', color: '#64748B', fontWeight: 700 }}>Viagens concluídas</div>
                <div style={{ fontSize: '1.1rem', fontWeight: 900, color: '#0F172A', marginTop: 2 }}>
                  {completedRides.length}
                </div>
              </div>
              <div style={{ backgroundColor: '#F8FAFC', borderRadius: 12, padding: 12 }}>
                <div style={{ fontSize: '0.7rem', color: '#64748B', fontWeight: 700 }}>Distância registrada</div>
                <div style={{ fontSize: '1.1rem', fontWeight: 900, color: '#0F172A', marginTop: 2 }}>
                  {totalCompletedKm.toFixed(1).replace('.', ',')} km
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 10. PERFIL CORPORATIVO E RECIBOS */}
        {subView === 'corporate' && (
          <>
            <div style={cardSurface}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                <div>
                  <div style={{ fontSize: '0.9rem', fontWeight: 800, color: '#0F172A' }}>
                    E-mail para recebimento de recibos
                  </div>
                  <div style={{ fontSize: '0.78rem', color: currentUser.email ? '#0F172A' : '#64748B', marginTop: 3, fontWeight: 600 }}>
                    {currentUser.email || 'Nenhum e-mail cadastrado ainda'}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onNavigateSubView('manage_account')}
                  style={{
                    backgroundColor: '#F3F4F6',
                    border: 'none',
                    borderRadius: 999,
                    padding: '7px 12px',
                    fontSize: '0.74rem',
                    fontWeight: 800,
                    color: '#0F172A',
                    cursor: 'pointer'
                  }}
                >
                  Editar
                </button>
              </div>
            </div>

            <div style={cardSurface}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <div style={{ fontSize: '0.9rem', fontWeight: 800, color: '#0F172A' }}>
                  Recibos de viagens concluídas ({completedRides.length})
                </div>
                {onGoToMyRides && (
                  <button
                    type="button"
                    onClick={onGoToMyRides}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#2563EB',
                      fontSize: '0.74rem',
                      fontWeight: 800,
                      cursor: 'pointer'
                    }}
                  >
                    Ver todas
                  </button>
                )}
              </div>

              {completedRides.length === 0 ? (
                <div style={{ fontSize: '0.78rem', color: '#64748B' }}>
                  Quando você concluir uma corrida, o recibo oficial em PDF/imagem ficará disponível aqui.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {completedRides.slice(0, 8).map((ride) => (
                    <div
                      key={ride.id}
                      style={{
                        padding: '10px 12px',
                        borderRadius: 12,
                        backgroundColor: '#F8FAFC',
                        border: '1px solid #E5E7EB',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 10
                      }}
                    >
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontSize: '0.8rem', fontWeight: 800, color: '#0F172A' }}>
                          {formatRideCode(ride.id)} • {formatCurrency(ride.totalPrice ?? ride.estimatedPrice ?? 0)}
                        </div>
                        <div style={{ fontSize: '0.71rem', color: '#64748B', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {ride.destination?.address || ride.origin?.address}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => onOpenReceipt(ride)}
                        style={{
                          backgroundColor: '#111111',
                          color: '#FFFFFF',
                          border: 'none',
                          borderRadius: 999,
                          padding: '6px 11px',
                          fontSize: '0.72rem',
                          fontWeight: 800,
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                          flexShrink: 0
                        }}
                      >
                        <Receipt size={13} />
                        <span>Recibo</span>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        {/* 11. AJUDA E SUPORTE */}
        {subView === 'help' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <a
              href={supportUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '14px',
                borderRadius: 14,
                backgroundColor: '#F0FDF4',
                border: '1px solid #BBF7D0',
                textDecoration: 'none'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: 10,
                    backgroundColor: '#25D366',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0
                  }}
                >
                  <WhatsAppIcon size={20} />
                </div>
                <div>
                  <div style={{ fontSize: '0.88rem', fontWeight: 800, color: '#166534' }}>
                    Suporte Direto no WhatsApp
                  </div>
                  <div style={{ fontSize: '0.72rem', color: '#15803D' }}>
                    Atendimento rápido com a equipe {config.companyName || 'Kavro Drive'}
                  </div>
                </div>
              </div>
              <ChevronRight size={17} color="#16A34A" />
            </a>

            <button type="button" onClick={() => onNavigateRoute('/ajuda')} style={pillActionStyle}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: 10,
                    backgroundColor: '#111111',
                    color: '#76D800',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                >
                  <HelpCircle size={18} />
                </div>
                <div>
                  <div style={{ fontSize: '0.88rem', fontWeight: 800, color: '#0F172A' }}>
                    Central de Ajuda &amp; FAQ
                  </div>
                  <div style={{ fontSize: '0.72rem', color: '#64748B' }}>
                    Dúvidas sobre corridas, carteira, PIX e segurança
                  </div>
                </div>
              </div>
              <ChevronRight size={17} color="#94A3B8" />
            </button>

            {onGoToMyRides && (
              <button type="button" onClick={onGoToMyRides} style={pillActionStyle}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div
                    style={{
                      width: 38,
                      height: 38,
                      borderRadius: 10,
                      backgroundColor: '#EFF6FF',
                      color: '#2563EB',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}
                  >
                    <RotateCcw size={18} />
                  </div>
                  <div>
                    <div style={{ fontSize: '0.88rem', fontWeight: 800, color: '#0F172A' }}>
                      Objeto esquecido ou corrida recente
                    </div>
                    <div style={{ fontSize: '0.72rem', color: '#64748B' }}>
                      Veja placa, motorista e histórico na aba Atividade
                    </div>
                  </div>
                </div>
                <ChevronRight size={17} color="#94A3B8" />
              </button>
            )}
          </div>
        )}

        {/* 12. GANHE DINHEIRO DIRIGINDO OU FAZENDO ENTREGAS */}
        {subView === 'partner_driver' && (
          <div style={cardSurface}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
              <div
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 14,
                  backgroundColor: '#111111',
                  color: '#76D800',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                <Car size={22} />
              </div>
              <div>
                <div style={{ fontSize: '1rem', fontWeight: 900, color: '#0F172A' }}>
                  Portal do Motorista Parceiro
                </div>
                <div style={{ fontSize: '0.75rem', color: '#64748B' }}>
                  Faça viagens de passageiros e entregas com repasse transparente via PIX.
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14, fontSize: '0.78rem', color: '#334155' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Check size={14} color="#16A34A" />
                <span>Cadastro digital com CNH (EAR), CRLV e verificação biométrica</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Check size={14} color="#16A34A" />
                <span>Escolha entre categoria Padrão ou Entregas no radar</span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => onNavigateRoute('/kavro-drive')}
              className="btn-ios-primary"
              style={{ padding: '13px 16px', fontSize: '0.9rem', borderRadius: 12, boxShadow: 'none' }}
            >
              <Navigation size={16} />
              <span>Acessar Portal do Motorista</span>
            </button>
          </div>
        )}

        {/* 13. JURÍDICO E PRIVACIDADE */}
        {subView === 'legal' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <button type="button" onClick={onOpenSignedContract} style={pillActionStyle}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: 10,
                    backgroundColor: '#F0FDF4',
                    color: '#15803D',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                >
                  <FileText size={18} />
                </div>
                <div>
                  <div style={{ fontSize: '0.88rem', fontWeight: 800, color: '#0F172A' }}>
                    {currentUser.termsSignature?.signed
                      ? `Termo Assinado (${currentUser.termsSignature.validationCode})`
                      : 'Termos e Condições de Uso'}
                  </div>
                  <div style={{ fontSize: '0.72rem', color: '#64748B' }}>
                    {currentUser.termsSignature?.signed
                      ? `Assinado em ${currentUser.termsSignature.signedAtBrasilia} (Brasília)`
                      : 'Visualize o contrato completo do passageiro'}
                  </div>
                </div>
              </div>
              <ChevronRight size={17} color="#94A3B8" />
            </button>

            <button type="button" onClick={onOpenTermsPrivacy} style={pillActionStyle}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: 10,
                    backgroundColor: '#EFF6FF',
                    color: '#2563EB',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                >
                  <ShieldCheck size={18} />
                </div>
                <div>
                  <div style={{ fontSize: '0.88rem', fontWeight: 800, color: '#0F172A' }}>
                    Resumo de Privacidade &amp; Auditoria GPS (LGPD)
                  </div>
                  <div style={{ fontSize: '0.72rem', color: '#64748B' }}>
                    Tratamento de dados em conformidade com a Lei 13.709/2018
                  </div>
                </div>
              </div>
              <ChevronRight size={17} color="#94A3B8" />
            </button>

            <button type="button" onClick={() => onNavigateRoute('/auditoria')} style={pillActionStyle}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: 10,
                    backgroundColor: '#F3F4F6',
                    color: '#0F172A',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                >
                  <ExternalLink size={18} />
                </div>
                <div>
                  <div style={{ fontSize: '0.88rem', fontWeight: 800, color: '#0F172A' }}>
                    Portal de Auditoria Pública
                  </div>
                  <div style={{ fontSize: '0.72rem', color: '#64748B' }}>
                    Consulte viagens, motoristas e comprovantes verificados
                  </div>
                </div>
              </div>
              <ChevronRight size={17} color="#94A3B8" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
