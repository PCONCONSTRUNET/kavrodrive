import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BadgeCheck,
  BookUser,
  Bookmark,
  Briefcase,
  Camera,
  Car,
  ChevronRight,
  Gift,
  HelpCircle,
  Info,
  Leaf,
  LogIn,
  LogOut,
  Mail,
  MapPin,
  Settings,
  ShieldCheck,
  Smartphone,
  Star,
  User,
  UserPlus,
  Users,
  Wallet
} from 'lucide-react';
import { ClientProfile, LocationPoint, Ride, SystemConfig } from '../types';
import { StorageService } from '../services/storage';
import { compressDataUrlForUpload } from '../utils/imageCompression';
import { AuthModal } from '../components/AuthModal';
import { TrustedContactsModal } from '../components/TrustedContactsModal';
import { FamilyProfileFlowModal } from '../components/FamilyProfileFlowModal';
import { NotificationsModal } from '../components/NotificationsModal';
import { TermsPrivacyModal } from '../components/TermsPrivacyModal';
import { PassengerTermsContractModal } from '../components/PassengerTermsContractModal';
import { PassengerWalletModal } from '../components/PassengerWalletModal';
import { SafetyCenterInitialView, SafetyCenterModal } from '../components/SafetyCenterModal';
import { RideReceiptModal } from '../components/RideReceiptModal';
import { PartnersSponsorsSection } from '../components/PartnersSponsorsSection';
import {
  AccountSubView,
  AccountSubViews,
  SafetyCheckupRing,
  computeSafetyCheckItems,
  formatCo2Saved
} from '../components/AccountSubViews';
import { formatCurrency, formatPhone, formatCPF, isValidCPF, getCleanWhatsappNumber } from '../utils/format';

export const SIMPLE_MODE_STORAGE_KEY = 'kavro_simple_mode';

interface ClientProfileScreenProps {
  onOpenAdminLogin?: () => void;
  config?: SystemConfig;
  currentUser?: ClientProfile | null;
  rides?: Ride[];
  resetKey?: number;
  onUserChange?: (user: ClientProfile | null) => void;
  onGoToMyRides?: () => void;
  onBookDestination?: (point: LocationPoint) => void;
}

export const ClientProfileScreen: React.FC<ClientProfileScreenProps> = ({
  config: propConfig,
  currentUser: propUser,
  rides: propRides,
  resetKey = 0,
  onUserChange,
  onGoToMyRides,
  onBookDestination
}) => {
  const navigate = useNavigate();
  const [currentUser, setCurrentUser] = useState<ClientProfile | null>(
    propUser !== undefined ? propUser : StorageService.getCurrentUser()
  );
  const [localConfig, setLocalConfig] = useState<SystemConfig>(StorageService.getConfig());
  const config = propConfig || localConfig;

  useEffect(() => {
    const syncCfg = () => setLocalConfig(StorageService.getConfig());
    window.addEventListener('up_database_synced', syncCfg);
    window.addEventListener('up_realtime_config', syncCfg);
    return () => {
      window.removeEventListener('up_database_synced', syncCfg);
      window.removeEventListener('up_realtime_config', syncCfg);
    };
  }, []);
  const [subView, setSubView] = useState<AccountSubView>('hub');

  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [authInitialMode, setAuthInitialMode] = useState<'register' | 'login'>('register');
  const [isTrustedContactsOpen, setIsTrustedContactsOpen] = useState(false);
  const [isFamilyFlowOpen, setIsFamilyFlowOpen] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [walletModalConfig, setWalletModalConfig] = useState<{
    open: boolean;
    initialMode: 'overview' | 'deposit' | 'statement';
  }>({ open: false, initialMode: 'overview' });
  const [safetyModalConfig, setSafetyModalConfig] = useState<{
    open: boolean;
    initialView: SafetyCenterInitialView;
  }>({ open: false, initialView: 'hub' });
  const [isTermsOpen, setIsTermsOpen] = useState(false);
  const [isSignedContractOpen, setIsSignedContractOpen] = useState(false);
  const [receiptRide, setReceiptRide] = useState<Ride | null>(null);

  const [walletBalance, setWalletBalance] = useState<number>(Number(currentUser?.walletBalance || 0));
  const [allRides, setAllRides] = useState<Ride[]>(() => propRides || StorageService.getRides());
  const [unreadNotifCount, setUnreadNotifCount] = useState<number>(() =>
    StorageService.getNotifications().filter((n) => !n.read).length
  );
  const [simpleMode, setSimpleMode] = useState<boolean>(() => {
    try {
      return localStorage.getItem(SIMPLE_MODE_STORAGE_KEY) === '1';
    } catch {
      return false;
    }
  });

  const scrollAppToTop = (behavior: ScrollBehavior) => {
    const scroller = window.document.querySelector('.kavro-mobile-app-scroll');
    if (scroller) scroller.scrollTo({ top: 0, behavior });
    window.scrollTo({ top: 0, behavior });
  };

  // Reset to hub when user taps Conta in bottom navigation bar
  useEffect(() => {
    if (resetKey > 0) {
      setSubView('hub');
      scrollAppToTop('smooth');
    }
  }, [resetKey]);

  // Apply simple mode class to <html>
  useEffect(() => {
    if (typeof window === 'undefined' || !window.document) return;
    window.document.documentElement.classList.toggle('kavro-simple-mode', simpleMode);
    try {
      localStorage.setItem(SIMPLE_MODE_STORAGE_KEY, simpleMode ? '1' : '0');
    } catch {
      // ignore storage quota errors
    }
  }, [simpleMode]);

  useEffect(() => {
    if (Array.isArray(propRides)) {
      setAllRides(propRides);
    }
  }, [propRides]);

  useEffect(() => {
    const updateNotifications = () => {
      setUnreadNotifCount(StorageService.getNotifications().filter((n) => !n.read).length);
    };
    const updateRides = () => {
      setAllRides(StorageService.getRides());
    };
    window.addEventListener('up_notifications_updated', updateNotifications);
    window.addEventListener('up_database_synced', updateNotifications);
    window.addEventListener('up_push_received', updateNotifications);
    window.addEventListener('up_rides_updated', updateRides);
    window.addEventListener('up_database_synced', updateRides);
    return () => {
      window.removeEventListener('up_notifications_updated', updateNotifications);
      window.removeEventListener('up_database_synced', updateNotifications);
      window.removeEventListener('up_push_received', updateNotifications);
      window.removeEventListener('up_rides_updated', updateRides);
      window.removeEventListener('up_database_synced', updateRides);
    };
  }, []);

  // Formulário de edição cadastral (Admin Master approval)
  const [name, setName] = useState(currentUser?.name || '');
  const [phone, setPhone] = useState(currentUser?.phone ? formatPhone(currentUser.phone) : '');
  const [email, setEmail] = useState(currentUser?.email || '');
  const [document, setDocument] = useState(currentUser?.document ? formatCPF(currentUser.document) : '');
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [isSubmittingProfileReq, setIsSubmittingProfileReq] = useState(false);
  const [profileReqError, setProfileReqError] = useState('');
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [photoFeedback, setPhotoFeedback] = useState('');
  const clientPhotoInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!currentUser?.id) {
      setWalletBalance(0);
      return;
    }
    let active = true;
    const syncWallet = async () => {
      const w = await StorageService.fetchClientWallet(currentUser.id);
      if (active && w.ok && w.wallet) {
        setWalletBalance(w.wallet.balance);
      }
    };
    const onWalletEvent = (evt: Event) => {
      const detail = (evt as CustomEvent)?.detail;
      if (detail && typeof detail.balance === 'number') {
        setWalletBalance(detail.balance);
      }
    };
    setWalletBalance(Number(currentUser.walletBalance || 0));
    syncWallet();
    window.addEventListener('up_client_wallet_updated', onWalletEvent);
    return () => {
      active = false;
      window.removeEventListener('up_client_wallet_updated', onWalletEvent);
    };
  }, [currentUser?.id]);

  useEffect(() => {
    if (!currentUser?.id) return;
    let active = true;
    const syncMe = async () => {
      const fresh = await StorageService.fetchClientProfile(currentUser.id);
      if (fresh && active) {
        setCurrentUser(fresh);
        if (onUserChange) onUserChange(fresh);
      }
    };
    syncMe();
    const t = setInterval(() => {
      if (window.document.visibilityState === 'visible') {
        syncMe();
      }
    }, 20000);
    return () => {
      active = false;
      clearInterval(t);
    };
  }, [currentUser?.id]);

  useEffect(() => {
    if (!currentUser) return;
    const pending =
      currentUser.profileChangeRequest?.status === 'pendente'
        ? currentUser.profileChangeRequest.requestedFields
        : null;
    setName(pending?.name || currentUser.name || '');
    setPhone(formatPhone(pending?.phone || currentUser.phone || ''));
    setEmail(pending?.email !== undefined ? pending.email : currentUser.email || '');
    setDocument(formatCPF(pending?.document !== undefined ? pending.document : currentUser.document || ''));
  }, [
    currentUser?.id,
    currentUser?.name,
    currentUser?.phone,
    currentUser?.email,
    currentUser?.document,
    currentUser?.profileChangeRequest?.id,
    currentUser?.profileChangeRequest?.status
  ]);

  useEffect(() => {
    if (propUser !== undefined) {
      setCurrentUser(propUser);
      setName(propUser?.name || '');
      setPhone(propUser?.phone ? formatPhone(propUser.phone) : '');
      setEmail(propUser?.email || '');
      setDocument(propUser?.document ? formatCPF(propUser.document) : '');
    }
  }, [propUser]);

  const completedRides = useMemo(() => {
    if (!currentUser) return [] as Ride[];
    try {
      const uPhoneClean = (currentUser.phone || '').replace(/\D/g, '');
      return allRides.filter((r) => {
        if (r.status !== 'finalizada') return false;
        const rPhoneClean = (r.clientPhone || '').replace(/\D/g, '');
        return (
          (currentUser.id && r.clientId === currentUser.id) ||
          (uPhoneClean && rPhoneClean && rPhoneClean.includes(uPhoneClean.slice(-8))) ||
          (currentUser.name &&
            r.clientName &&
            r.clientName.trim().toLowerCase() === currentUser.name.trim().toLowerCase())
        );
      });
    } catch {
      return [] as Ride[];
    }
  }, [currentUser, allRides]);

  const totalCompletedKm = useMemo(
    () => completedRides.reduce((sum, r) => sum + Math.max(0, Number(r.distanceKm || 0)), 0),
    [completedRides]
  );

  // Conservative estimate: ~45g CO2 saved per km via optimized dispatch vs idle cruising
  const estimatedCo2Grams = useMemo(
    () => (completedRides.length > 0 ? Math.round(totalCompletedKm * 45) : 0),
    [completedRides.length, totalCompletedKm]
  );

  const safetyItems = useMemo(() => computeSafetyCheckItems(currentUser), [currentUser]);
  const safetyScore = useMemo(
    () => safetyItems.filter((item) => item.completed).length,
    [safetyItems]
  );

  const hasChanges = useMemo(() => {
    if (!currentUser) return false;
    const currentName = currentUser.name || '';
    const currentPhone = formatPhone(currentUser.phone || '');
    const currentEmail = currentUser.email || '';
    const currentDoc = currentUser.document ? formatCPF(currentUser.document) : '';
    return (
      name.trim() !== currentName.trim() ||
      phone.trim() !== currentPhone.trim() ||
      email.trim() !== currentEmail.trim() ||
      document.trim() !== currentDoc.trim()
    );
  }, [currentUser, name, phone, email, document]);

  const openSubView = (target: AccountSubView) => {
    setSubView(target);
    scrollAppToTop('auto');
  };

  const syncUser = (updated: ClientProfile) => {
    setCurrentUser(updated);
    if (onUserChange) onUserChange(updated);
  };

  const handleAuthSuccess = (client: ClientProfile) => {
    syncUser(client);
    setName(client.name);
    setPhone(client.phone ? formatPhone(client.phone) : '');
    setEmail(client.email || '');
    setDocument(client.document ? formatCPF(client.document) : '');
  };

  const handleClientPhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !currentUser) return;
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
      const res = await StorageService.uploadClientPhoto(currentUser.id, compressed);
      if (res.ok && res.client) {
        syncUser(res.client);
        setPhotoFeedback('Foto atualizada!');
        setTimeout(() => setPhotoFeedback(''), 3000);
      } else {
        setPhotoFeedback(res.error || 'Erro ao salvar foto.');
      }
    } catch {
      setPhotoFeedback('Imagem inválida.');
    } finally {
      setIsUploadingPhoto(false);
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;
    setProfileReqError('');
    if (!isValidCPF(document)) {
      setProfileReqError('Informe um CPF válido com 11 dígitos.');
      return;
    }
    setIsSubmittingProfileReq(true);
    const res = await StorageService.requestClientProfileChange(currentUser.id, {
      name: name.trim(),
      phone: phone.trim(),
      email: email.trim(),
      document: document.trim()
    });
    setIsSubmittingProfileReq(false);
    if (!res.ok || !res.client) {
      setProfileReqError(res.error || 'Não foi possível enviar a solicitação.');
      return;
    }
    syncUser(res.client);
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 3500);
  };

  const handleLogout = () => {
    if (window.confirm('Deseja realmente sair da sua conta neste aparelho?')) {
      StorageService.setCurrentUser(null);
      setCurrentUser(null);
      setName('');
      setPhone('');
      setEmail('');
      setDocument('');
      setSubView('hub');
      if (onUserChange) onUserChange(null);
    }
  };

  const supportWhatsapp = getCleanWhatsappNumber(config.companyWhatsapp || config.companyPhone || '48996915303');
  const supportUrl = `https://wa.me/${supportWhatsapp}?text=${encodeURIComponent(
    `Olá! Sou o cliente ${currentUser?.name || ''} da ${config.companyName || 'Kavro Drive'} e gostaria de tirar uma dúvida.`
  )}`;

  const savedCount = currentUser?.savedAddresses?.length || 0;
  const brandName = config.companyName || 'Kavro Drive';

  const quickTiles = [
    {
      key: 'help',
      label: 'Ajuda',
      sublabel: 'Suporte & FAQ',
      icon: <HelpCircle size={20} strokeWidth={2.2} color="#0F172A" />,
      badge: null as string | null,
      onClick: () => openSubView('help')
    },
    {
      key: 'wallet',
      label: 'Carteira',
      sublabel: formatCurrency(walletBalance),
      sublabelColor: '#15803D',
      icon: <Wallet size={20} strokeWidth={2.2} color="#0F172A" />,
      badge: null as string | null,
      onClick: () => setWalletModalConfig({ open: true, initialMode: 'overview' })
    },
    {
      key: 'safety',
      label: 'Segurança',
      sublabel: `${safetyScore}/${safetyItems.length} ativos`,
      icon: <ShieldCheck size={20} strokeWidth={2.2} color="#0F172A" />,
      badge: null as string | null,
      onClick: () => setSafetyModalConfig({ open: true, initialView: 'hub' })
    },
    {
      key: 'messages',
      label: 'Mensagens',
      sublabel: unreadNotifCount > 0 ? `${unreadNotifCount} nova(s)` : 'Avisos do app',
      icon: <Mail size={20} strokeWidth={2.2} color="#0F172A" />,
      badge: unreadNotifCount > 0 ? (unreadNotifCount > 9 ? '9+' : String(unreadNotifCount)) : null,
      onClick: () => setIsNotificationsOpen(true)
    }
  ];

  const menuRows: Array<{
    key: string;
    icon: React.ReactNode;
    title: string;
    subtitle?: string;
    onClick: () => void;
  }> = [
    {
      key: 'family',
      icon: <Users size={20} strokeWidth={2} />,
      title: 'Família',
      subtitle:
        currentUser?.accountType === 'teen'
          ? `Supervisionado por ${currentUser.safetyPreferences?.familyGuardianName || 'Responsável Legal'}`
          : 'Gerencie contas para adolescentes (12 a 18 anos)',
      onClick: () => setIsFamilyFlowOpen(true)
    },
    {
      key: 'addresses',
      icon: <MapPin size={20} strokeWidth={2} />,
      title: 'Endereços salvos',
      subtitle: savedCount > 0 ? `${savedCount} local(is) salvo(s) — Casa, trabalho e favoritos` : 'Salve Casa, Trabalho e favoritos',
      onClick: () => openSubView('addresses')
    },
    {
      key: 'settings',
      icon: <Settings size={20} strokeWidth={2} />,
      title: 'Configurações',
      subtitle: 'Notificações push, instalar app e conta',
      onClick: () => openSubView('settings')
    },
    {
      key: 'simple_mode',
      icon: <Smartphone size={20} strokeWidth={2} />,
      title: 'Modo simples',
      subtitle: simpleMode ? 'Ativo — textos maiores e alvos ampliados' : 'Um app simplificado com leitura ampliada',
      onClick: () => openSubView('simple_mode')
    },
    {
      key: 'gift',
      icon: <Gift size={20} strokeWidth={2} />,
      title: 'Adicionar saldo na Carteira',
      subtitle: 'Recarga mínima de R$ 20,00 via PIX ou Cartão de Crédito',
      onClick: () => setWalletModalConfig({ open: true, initialMode: 'deposit' })
    },
    {
      key: 'contacts',
      icon: <BookUser size={20} strokeWidth={2} />,
      title: 'Contatos',
      subtitle: 'Gerencie contatos de confiança e emergência SOS',
      onClick: () => openSubView('contacts')
    },
    {
      key: 'partner',
      icon: <Car size={20} strokeWidth={2} />,
      title: 'Ganhe dinheiro dirigindo ou fazendo entregas',
      onClick: () => openSubView('partner_driver')
    },
    {
      key: 'saved_routes',
      icon: <Bookmark size={20} strokeWidth={2} />,
      title: 'Grupos e rotas salvas',
      onClick: () => openSubView('saved_routes')
    },
    {
      key: 'corporate',
      icon: <Briefcase size={20} strokeWidth={2} />,
      title: 'Perfil Corporativo e Recibos',
      subtitle: 'Comprovantes de viagens e e-mail de recibos',
      onClick: () => openSubView('corporate')
    },
    {
      key: 'manage_account',
      icon: <User size={20} strokeWidth={2} />,
      title: `Gerenciar conta da ${brandName}`,
      subtitle: 'Nome, CPF, WhatsApp, foto de perfil e sair',
      onClick: () => openSubView('manage_account')
    },
    {
      key: 'legal',
      icon: <Info size={20} strokeWidth={2} />,
      title: 'Jurídico',
      subtitle: currentUser?.termsSignature?.signed
        ? `Termo assinado (${currentUser.termsSignature.validationCode}) e LGPD`
        : 'Termos de uso, contrato e privacidade LGPD',
      onClick: () => openSubView('legal')
    }
  ];

  return (
    <div style={{ backgroundColor: '#FFFFFF', minHeight: '100%', maxWidth: 480, margin: '0 auto' }}>
      {/* Hidden input para alteração de foto de perfil acessível em qualquer sub-aba */}
      <input
        ref={clientPhotoInputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={handleClientPhotoChange}
      />

      {/* Modal de Cadastro / Login */}
      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
        onSuccess={handleAuthSuccess}
        initialMode={authInitialMode}
      />

      {/* CASO NÃO ESTEJA LOGADO */}
      {!currentUser ? (
        <div className="animate-fade-in" style={{ padding: '24px 16px 96px 16px' }}>
          <h1 style={{ fontSize: '1.8rem', fontWeight: 900, color: '#0F172A', margin: '0 0 14px 0', letterSpacing: '-0.03em' }}>
            Conta
          </h1>
          <div
            style={{
              padding: '24px 18px',
              backgroundColor: '#F8FAFC',
              border: '1px solid #E5E7EB',
              borderRadius: 20,
              textAlign: 'center'
            }}
          >
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: '50%',
                backgroundColor: 'rgba(118, 216, 0, 0.16)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 12px auto',
                color: '#3F6212'
              }}
            >
              <UserPlus size={26} />
            </div>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: '#0F172A', margin: '0 0 6px 0' }}>
              Acesse sua conta {brandName}
            </h3>
            <p style={{ fontSize: '0.82rem', color: '#64748B', margin: '0 0 18px 0', lineHeight: 1.45 }}>
              Entre ou crie sua conta para gerenciar carteira, contatos de segurança, recibos e endereços favoritos.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <button
                type="button"
                onClick={() => {
                  setAuthInitialMode('register');
                  setIsAuthModalOpen(true);
                }}
                className="btn-ios-primary"
                style={{ padding: '13px 18px', fontSize: '0.92rem' }}
              >
                <UserPlus size={17} />
                <span>Criar Conta em 1 Minuto</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setAuthInitialMode('login');
                  setIsAuthModalOpen(true);
                }}
                className="btn-ios-secondary"
                style={{ padding: '12px 18px', fontSize: '0.88rem' }}
              >
                <LogIn size={16} />
                <span>Já tenho conta — Entrar</span>
              </button>
            </div>
          </div>
        </div>
      ) : subView !== 'hub' ? (
        /* SUB-ABAS DEDICADAS PARA GERENCIAMENTO (ESTILO NAVEGAÇÃO UBER) */
        <AccountSubViews
          subView={subView}
          currentUser={currentUser}
          config={config}
          walletBalance={walletBalance}
          completedRides={completedRides}
          totalCompletedKm={totalCompletedKm}
          estimatedCo2Grams={estimatedCo2Grams}
          safetyItems={safetyItems}
          simpleMode={simpleMode}
          supportUrl={supportUrl}
          name={name}
          phone={phone}
          email={email}
          documentValue={document}
          hasChanges={hasChanges}
          savedSuccess={savedSuccess}
          isSubmittingProfileReq={isSubmittingProfileReq}
          profileReqError={profileReqError}
          isUploadingPhoto={isUploadingPhoto}
          photoFeedback={photoFeedback}
          onNameChange={setName}
          onPhoneChange={setPhone}
          onEmailChange={setEmail}
          onDocumentChange={setDocument}
          onSubmitProfile={handleSaveProfile}
          onTriggerPhotoPick={() => clientPhotoInputRef.current?.click()}
          onBackToHub={() => openSubView('hub')}
          onNavigateSubView={(view) => openSubView(view)}
          onNavigateRoute={(path) => navigate(path)}
          onUpdateUser={syncUser}
          onOpenWallet={(mode) => setWalletModalConfig({ open: true, initialMode: mode })}
          onOpenSafetyCenter={(initialView) => setSafetyModalConfig({ open: true, initialView })}
          onOpenTrustedContacts={() => setIsTrustedContactsOpen(true)}
          onOpenSignedContract={() => setIsSignedContractOpen(true)}
          onOpenTermsPrivacy={() => setIsTermsOpen(true)}
          onOpenReceipt={(ride) => setReceiptRide(ride)}
          onToggleSimpleMode={() => setSimpleMode((prev) => !prev)}
          onLogout={handleLogout}
          onBookDestination={onBookDestination}
          onGoToMyRides={onGoToMyRides}
        />
      ) : (
        /* HUB PRINCIPAL DA ABA CONTA (ESTRUTURA OFICIAL UBER) */
        <div className="animate-fade-in" style={{ padding: '18px 16px calc(112px + env(safe-area-inset-bottom, 0px)) 16px' }}>
          {/* 1. Cabeçalho Uber: Nome em destaque à esquerda + Avaliação/Verificado + Foto circular à direita */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 14,
              marginBottom: 18
            }}
          >
            <div
              role="button"
              tabIndex={0}
              onClick={() => openSubView('manage_account')}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  openSubView('manage_account');
                }
              }}
              style={{ minWidth: 0, flex: 1, cursor: 'pointer' }}
            >
              <h1
                style={{
                  margin: 0,
                  fontSize: '1.68rem',
                  fontWeight: 900,
                  color: '#0F172A',
                  letterSpacing: '-0.03em',
                  lineHeight: 1.15,
                  wordBreak: 'break-word'
                }}
              >
                {currentUser.name}
              </h1>

              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                <span
                  style={{
                    backgroundColor: '#F3F4F6',
                    color: '#0F172A',
                    borderRadius: 999,
                    padding: '4px 10px',
                    fontSize: '0.76rem',
                    fontWeight: 800,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4
                  }}
                >
                  <Star size={12} color="#0F172A" fill="#0F172A" />
                  <span>5.00</span>
                </span>

                <span
                  style={{
                    backgroundColor: '#EFF6FF',
                    color: '#1D4ED8',
                    border: '1px solid #DBEAFE',
                    borderRadius: 999,
                    padding: '4px 10px',
                    fontSize: '0.75rem',
                    fontWeight: 800,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4
                  }}
                >
                  <BadgeCheck size={13} color="#2563EB" />
                  <span>Verificado</span>
                </span>

                {currentUser.accountType === 'teen' && (
                  <span
                    style={{
                      backgroundColor: '#F3E8FF',
                      color: '#7E22CE',
                      borderRadius: 999,
                      padding: '4px 9px',
                      fontSize: '0.72rem',
                      fontWeight: 800
                    }}
                  >
                    Adolescente
                  </span>
                )}
              </div>
            </div>

            <div style={{ position: 'relative', flexShrink: 0 }}>
              <button
                type="button"
                onClick={() => openSubView('manage_account')}
                aria-label="Gerenciar perfil e foto"
                style={{
                  padding: 0,
                  border: 'none',
                  background: 'none',
                  cursor: 'pointer',
                  display: 'block'
                }}
              >
                {currentUser.photo ? (
                  <img
                    src={currentUser.photo}
                    alt={currentUser.name}
                    style={{
                      width: 64,
                      height: 64,
                      borderRadius: '50%',
                      objectFit: 'cover',
                      border: '2px solid #E5E7EB'
                    }}
                  />
                ) : (
                  <div
                    style={{
                      width: 64,
                      height: 64,
                      borderRadius: '50%',
                      backgroundColor: '#111111',
                      color: '#FFFFFF',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '1.5rem',
                      fontWeight: 900,
                      border: '2px solid #E5E7EB'
                    }}
                  >
                    {currentUser.name.charAt(0).toUpperCase()}
                  </div>
                )}
              </button>

              <button
                type="button"
                disabled={isUploadingPhoto}
                onClick={(e) => {
                  e.stopPropagation();
                  clientPhotoInputRef.current?.click();
                }}
                aria-label="Trocar foto de perfil"
                title="Adicionar ou trocar foto"
                style={{
                  position: 'absolute',
                  bottom: -2,
                  right: -2,
                  width: 24,
                  height: 24,
                  borderRadius: '50%',
                  backgroundColor: '#FFFFFF',
                  border: '1.5px solid #D1D5DB',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#111111',
                  boxShadow: '0 2px 6px rgba(0,0,0,0.14)',
                  cursor: 'pointer'
                }}
              >
                <Camera size={12} />
              </button>
            </div>
          </div>

          {photoFeedback && (
            <div
              style={{
                marginBottom: 12,
                padding: '8px 12px',
                borderRadius: 12,
                backgroundColor: '#F0FDF4',
                border: '1px solid #BBF7D0',
                color: '#15803D',
                fontSize: '0.78rem',
                fontWeight: 700
              }}
            >
              {photoFeedback}
            </div>
          )}

          {/* 2. Grade 2x2 de Ações Rápidas (Ajuda, Carteira, Segurança, Mensagens) */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 10,
              marginBottom: 14
            }}
          >
            {quickTiles.map((tile) => (
              <button
                key={tile.key}
                type="button"
                onClick={tile.onClick}
                style={{
                  width: '100%',
                  minWidth: 0,
                  backgroundColor: '#F3F4F6',
                  border: '1px solid #E5E7EB',
                  borderRadius: 16,
                  padding: '13px 14px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 10,
                  cursor: 'pointer',
                  textAlign: 'left',
                  position: 'relative',
                  boxSizing: 'border-box'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 11, minWidth: 0, flex: 1 }}>
                  <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center' }}>
                    {tile.icon}
                  </div>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: '0.94rem', fontWeight: 800, color: '#0F172A', lineHeight: 1.2 }}>
                      {tile.label}
                    </div>
                    <div
                      style={{
                        fontSize: '0.72rem',
                        fontWeight: 700,
                        color: tile.sublabelColor || '#64748B',
                        marginTop: 2,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis'
                      }}
                    >
                      {tile.sublabel}
                    </div>
                  </div>
                </div>

                {tile.badge && (
                  <span
                    style={{
                      backgroundColor: '#DC2626',
                      color: '#FFFFFF',
                      fontSize: '0.64rem',
                      fontWeight: 900,
                      minWidth: 18,
                      height: 18,
                      borderRadius: 9,
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: '0 5px',
                      flexShrink: 0
                    }}
                  >
                    {tile.badge}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* 3. Cartões de Destaque (Kavro VIP, Checagem de Segurança X/5, Redução CO2) */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 18 }}>
            {/* Card 1: Kavro VIP & Benefícios */}
            <button
              type="button"
              onClick={() => openSubView('vip')}
              style={{
                width: '100%',
                backgroundColor: '#F3F4F6',
                border: '1px solid #E5E7EB',
                borderRadius: 16,
                padding: '15px 16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 14,
                cursor: 'pointer',
                textAlign: 'left'
              }}
            >
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: '0.98rem', fontWeight: 800, color: '#0F172A' }}>
                  {brandName} VIP &amp; Benefícios
                </div>
                <div style={{ fontSize: '0.77rem', color: '#64748B', marginTop: 3, lineHeight: 1.35 }}>
                  {completedRides.length} {completedRides.length === 1 ? 'viagem' : 'viagens'} • Cartões, saldo e vantagens
                </div>
              </div>
              <div
                style={{
                  width: 46,
                  height: 46,
                  borderRadius: 14,
                  backgroundColor: '#111111',
                  color: '#76D800',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0
                }}
              >
                <Gift size={24} />
              </div>
            </button>

            {/* Card 2: Checagem de segurança (X/5 real) */}
            <button
              type="button"
              onClick={() => openSubView('safety_checkup')}
              style={{
                width: '100%',
                backgroundColor: '#F3F4F6',
                border: '1px solid #E5E7EB',
                borderRadius: 16,
                padding: '15px 16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 14,
                cursor: 'pointer',
                textAlign: 'left'
              }}
            >
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: '0.98rem', fontWeight: 800, color: '#0F172A' }}>
                  Checagem de segurança
                </div>
                <div style={{ fontSize: '0.77rem', color: '#64748B', marginTop: 3, lineHeight: 1.35 }}>
                  Saiba como fazer viagens mais seguras
                </div>
              </div>
              <SafetyCheckupRing completed={safetyScore} total={safetyItems.length} />
            </button>

            {/* Card 3: Redução estimada de CO2 */}
            <button
              type="button"
              onClick={() => openSubView('sustainability')}
              style={{
                width: '100%',
                backgroundColor: '#F3F4F6',
                border: '1px solid #E5E7EB',
                borderRadius: 16,
                padding: '14px 16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
                cursor: 'pointer',
                textAlign: 'left'
              }}
            >
              <span style={{ fontSize: '0.96rem', fontWeight: 800, color: '#0F172A' }}>
                Redução estimada de CO₂
              </span>
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  fontSize: '0.98rem',
                  fontWeight: 900,
                  color: '#0F172A',
                  flexShrink: 0
                }}
              >
                <Leaf size={17} color="#16A34A" fill="#22C55E" />
                <span>{formatCo2Saved(estimatedCo2Grams)}</span>
              </span>
            </button>
          </div>

          {/* 4. Lista Vertical Organizada Estilo Uber (cada item abre sua própria aba/modal) */}
          <div style={{ borderTop: '1px solid #F1F5F9' }}>
            {menuRows.map((row) => (
              <button
                key={row.key}
                type="button"
                onClick={row.onClick}
                style={{
                  width: '100%',
                  background: 'none',
                  border: 'none',
                  borderBottom: '1px solid #F1F5F9',
                  padding: '15px 4px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 14,
                  cursor: 'pointer',
                  textAlign: 'left'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 15, minWidth: 0, flex: 1 }}>
                  <span style={{ color: '#0F172A', display: 'flex', alignItems: 'center', flexShrink: 0 }}>
                    {row.icon}
                  </span>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#0F172A', lineHeight: 1.28 }}>
                      {row.title}
                    </div>
                    {row.subtitle && (
                      <div style={{ fontSize: '0.76rem', color: '#64748B', marginTop: 2, lineHeight: 1.35 }}>
                        {row.subtitle}
                      </div>
                    )}
                  </div>
                </div>
                <ChevronRight size={17} color="#94A3B8" style={{ flexShrink: 0 }} />
              </button>
            ))}
          </div>

          {/* Área de Parceiros & Patrocinadores na Conta (habilitada pelo Admin) */}
          <div style={{ margin: '12px -16px 0 -16px' }}>
            <PartnersSponsorsSection
              items={config.partnerBanners}
              variant="light"
              area="client_profile"
              sectionEnabled={Boolean(config.partnerShowOnClientProfile)}
              hideWhenEmpty={Boolean(config.partnerHideEmptyPlaceholder)}
            />
          </div>

          {/* 5. Rodapé discreto com Sair da conta */}
          <div style={{ marginTop: 18, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 4px' }}>
            <span style={{ fontSize: '0.72rem', color: '#94A3B8', fontWeight: 600 }}>
              {brandName} • Conta do Passageiro
            </span>
            <button
              type="button"
              onClick={handleLogout}
              style={{
                background: 'none',
                border: 'none',
                padding: '6px 8px',
                fontSize: '0.78rem',
                fontWeight: 800,
                color: '#DC2626',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5
              }}
            >
              <LogOut size={14} />
              <span>Sair da conta</span>
            </button>
          </div>
        </div>
      )}

      {/* MODAIS DE GERENCIAMENTO CONECTADOS */}
      <PassengerTermsContractModal
        isOpen={isSignedContractOpen}
        onClose={() => setIsSignedContractOpen(false)}
        mode="passenger"
        config={config}
        client={currentUser}
      />

      <TermsPrivacyModal
        isOpen={isTermsOpen}
        onClose={() => setIsTermsOpen(false)}
        config={config}
      />

      <TrustedContactsModal
        isOpen={isTrustedContactsOpen}
        onClose={() => setIsTrustedContactsOpen(false)}
        currentUser={currentUser}
        onUpdated={(_, updatedClient) => {
          if (updatedClient) syncUser(updatedClient);
        }}
      />

      <FamilyProfileFlowModal
        isOpen={isFamilyFlowOpen}
        onClose={() => setIsFamilyFlowOpen(false)}
        currentUser={currentUser}
        onRequireAuth={() => {
          setIsFamilyFlowOpen(false);
          setAuthInitialMode('login');
          setIsAuthModalOpen(true);
        }}
        onUserChange={(updatedClient) => syncUser(updatedClient)}
      />

      <NotificationsModal
        isOpen={isNotificationsOpen}
        onClose={() => setIsNotificationsOpen(false)}
        userRole="client"
      />

      <PassengerWalletModal
        isOpen={walletModalConfig.open}
        onClose={() => setWalletModalConfig((prev) => ({ ...prev, open: false }))}
        currentUser={currentUser}
        config={config}
        initialMode={walletModalConfig.initialMode}
        onRequireAuth={() => {
          setAuthInitialMode('login');
          setIsAuthModalOpen(true);
        }}
        onWalletUpdated={(w) => {
          setWalletBalance(w.balance);
          if (currentUser) {
            syncUser({ ...currentUser, walletBalance: w.balance });
          }
        }}
      />

      <SafetyCenterModal
        isOpen={safetyModalConfig.open}
        onClose={() => setSafetyModalConfig((prev) => ({ ...prev, open: false }))}
        config={config}
        currentUser={currentUser}
        initialView={safetyModalConfig.initialView}
        onUserChange={(updatedClient) => syncUser(updatedClient)}
        onRequireAuth={() => {
          setAuthInitialMode('login');
          setIsAuthModalOpen(true);
        }}
        onOpenTerms={() => setIsTermsOpen(true)}
      />

      {receiptRide && (
        <RideReceiptModal
          isOpen={true}
          onClose={() => setReceiptRide(null)}
          ride={receiptRide}
          config={config}
        />
      )}
    </div>
  );
};
