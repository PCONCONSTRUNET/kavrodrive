import React, { Suspense, lazy, useState, useEffect } from 'react';
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { Home, Calendar, Clock, User, MapPin, PhoneCall, ArrowRight, Sparkles, Mail, Lock, Eye, EyeOff } from 'lucide-react';
import { SystemConfig, Ride, LocationPoint, ClientProfile } from './types';
import { StorageService, ACTIVE_PASSENGER_RIDE_STATUSES } from './services/storage';
import { RealtimeService } from './services/realtime';
import { ClientHomeScreen } from './views/ClientHomeScreen';
import { ClientBookingScreen } from './views/ClientBookingScreen';
import { ClientMyRidesScreen } from './views/ClientMyRidesScreen';
import { ClientProfileScreen } from './views/ClientProfileScreen';
import { KavroSecurityGuideModal } from './components/KavroSecurityGuideModal';
import { AdminLoginModal } from './components/AdminLoginModal';
import { PwaInstallBanner } from './components/PwaInstallBanner';
import { PushPermissionPrompt } from './components/PushNotifications';
import { ADMIN_EXTERNAL_ID, clientExternalId, PushService } from './services/push';
import { AuthModal } from './components/AuthModal';
import { ClientWelcomeScreen } from './components/ClientWelcomeScreen';
import { WhatsAppIcon } from './components/WhatsAppIcon';
import { TermsPrivacyModal } from './components/TermsPrivacyModal';
import { PassengerTermsContractModal } from './components/PassengerTermsContractModal';
import { TurnstileWidget, isTurnstileEnabled } from './components/TurnstileWidget';
import { KavroScrollIndicator } from './components/KavroScrollIndicator';
import { getCleanWhatsappNumber } from './utils/format';

function lazyNamed<T extends React.ComponentType<any>>(
  loader: () => Promise<Record<string, any>>,
  exportName: string
): React.LazyExoticComponent<T> {
  return lazy(() => loader().then((m) => ({ default: m[exportName] as T })));
}

const AdminDashboardScreen = lazyNamed(() => import('./views/AdminDashboardScreen'), 'AdminDashboardScreen');
const DriverPortalScreen = lazyNamed(() => import('./views/DriverPortalScreen'), 'DriverPortalScreen');
const LandingScreen = lazyNamed(() => import('./views/LandingScreen'), 'LandingScreen');
const PassengerTrackingScreen = lazyNamed(() => import('./views/PassengerTrackingScreen'), 'PassengerTrackingScreen');
const SosLiveTrackingScreen = lazyNamed(() => import('./views/SosLiveTrackingScreen'), 'SosLiveTrackingScreen');
const PublicFleetScreen = lazyNamed(() => import('./views/PublicFleetScreen'), 'PublicFleetScreen');
const HelpCenterScreen = lazyNamed(() => import('./views/HelpCenterScreen'), 'HelpCenterScreen');
const FamilyInviteScreen = lazyNamed(() => import('./views/FamilyInviteScreen'), 'FamilyInviteScreen');
const CitiesServedScreen = lazyNamed(() => import('./views/CitiesServedScreen'), 'CitiesServedScreen');

const RouteLoadingFallback: React.FC = () => (
  <div
    style={{
      minHeight: '100dvh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 12,
      backgroundColor: '#0B1117',
      color: '#FFFFFF',
      fontFamily: "'Inter', sans-serif",
    }}
  >
    <img src="/logo-horizontal-white.png" alt="KAVRO DRIVE" style={{ height: 28, objectFit: 'contain' }} />
    <div style={{ fontSize: '0.82rem', color: '#94A3B8', fontWeight: 600 }}>Carregando...</div>
  </div>
);

// ── TELA DE BOAS-VINDAS (ANTES DO LOGIN) ──────────────────────
const WelcomeScreen: React.FC<{
  config: SystemConfig;
  onOpenAuth: (mode: 'login' | 'register') => void;
  onOpenTerms?: () => void;
}> = ({ config, onOpenAuth, onOpenTerms }) => {
  return (
    <div className="app-container" style={{
      height: '100dvh',
      minHeight: '100dvh',
      maxHeight: '100dvh',
      overflow: 'hidden',
      backgroundColor: '#FEFEFE',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'space-between',
      padding: 'calc(10px + env(safe-area-inset-top, 0px)) 20px calc(16px + env(safe-area-inset-bottom, 0px)) 20px',
      position: 'relative',
    }}>
      {/* Topo com botão WhatsApp */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', flexShrink: 0 }}>
        <a
          href={`https://wa.me/${getCleanWhatsappNumber(config.companyWhatsapp)}?text=Ol%C3%A1%2C%20gostaria%20de%20agendar%20uma%20corrida`}
          target="_blank" rel="noopener noreferrer"
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            backgroundColor: '#FFFFFF', border: '1.5px solid #E2E8F0',
            padding: '6px 13px', borderRadius: 20,
            fontSize: '0.78rem', fontWeight: 600, color: '#121A21', textDecoration: 'none',
            boxShadow: '0 2px 6px rgba(0,0,0,0.04)',
          }}
        >
          <WhatsAppIcon size={17} />
          <span>WhatsApp</span>
        </a>
      </div>

      {/* Centro com a Logo Oficial 02 e Texto Direto/Clean (sem sobra de espaço) */}
      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        padding: '0 8px',
        marginTop: -10,
      }}>
        {/* Logo Oficial KAVRO DRIVE */}
        <img
          src="/logo-02.png"
          alt="KAVRO DRIVE"
          style={{
            width: 220,
            height: 165,
            objectFit: 'contain',
            objectPosition: 'center',
            marginBottom: 14,
          }}
        />

        <h1 style={{
          fontSize: '1.35rem',
          fontWeight: 800,
          color: '#121A21',
          lineHeight: 1.22,
          letterSpacing: '-0.02em',
          marginBottom: 8,
        }}>
          Sua viagem com conforto e pontualidade
        </h1>

        <p style={{
          fontSize: '0.88rem',
          color: '#64748B',
          lineHeight: 1.4,
          maxWidth: 290,
        }}>
          Chame um motorista parceiro próximo de você na hora com Pix, Cartão ou Dinheiro.
        </p>
      </div>

      {/* Botões de Ação */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, flexShrink: 0 }}>
        <button
          onClick={() => onOpenAuth('register')}
          className="btn-ios-primary"
          style={{ width: '100%', padding: '14px', fontSize: '0.96rem', fontWeight: 700 }}
        >
          <span>Criar Conta</span>
          <ArrowRight size={18} />
        </button>

        <button
          onClick={() => onOpenAuth('login')}
          style={{
            width: '100%', padding: '13px',
            backgroundColor: '#FFFFFF',
            border: '1.5px solid #E2E8F0',
            borderRadius: 16, color: '#121A21',
            fontSize: '0.9rem', fontWeight: 700, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
          }}
        >
          <User size={16} color="#76D800" />
          <span>Já tenho conta — Entrar</span>
        </button>

        {/* Rodapé LGPD discreto */}
        <div style={{ textAlign: 'center', marginTop: 2, paddingBottom: 2 }}>
          <button
            type="button"
            onClick={onOpenTerms}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '0.67rem',
              color: '#94A3B8',
              cursor: 'pointer',
              lineHeight: 1.3,
              padding: '2px 4px',
            }}
          >
            🔒 Rotas e GPS gravados para sua segurança •{' '}
            <span style={{ textDecoration: 'underline', color: '#64748B', fontWeight: 700 }}>
              Termos & LGPD
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};

// Componente para a visão do Cliente com abas mobile-first
const ClientApp: React.FC<{
  config: SystemConfig;
  rides: Ride[];
  refreshData: () => void;
}> = ({ config, rides, refreshData }) => {
  const [currentUser, setCurrentUser] = useState<ClientProfile | null>(StorageService.getCurrentUser());
  const [currentTab, setCurrentTab] = useState<'inicio' | 'agendar' | 'minhas_corridas' | 'perfil'>(() =>
    typeof window !== 'undefined' && window.location.search.includes('flow=schedule')
      ? 'agendar'
      : 'inicio'
  );
  const [initialBookingOrigin, setInitialBookingOrigin] = useState<LocationPoint | null>(null);
  const [initialBookingDestination, setInitialBookingDestination] = useState<LocationPoint | null>(null);
  const [initialBookingCategoryId, setInitialBookingCategoryId] = useState<string | null>(null);
  const [initialBookingFocus, setInitialBookingFocus] = useState<'origin' | 'destination' | undefined>(undefined);
  const [initialBookingScheduleOpen, setInitialBookingScheduleOpen] = useState<boolean>(false);
  const [resumedBookingRide, setResumedBookingRide] = useState<Ride | null>(null);
  const [profileResetKey, setProfileResetKey] = useState<number>(0);

  // Restaura Modo Simples na inicialização do app do passageiro
  useEffect(() => {
    try {
      const enabled = localStorage.getItem('kavro_simple_mode') === '1';
      document.documentElement.classList.toggle('kavro-simple-mode', enabled);
    } catch {
      // ignore
    }
  }, []);

  // Controle do modal de Autenticação (Login / Cadastro)
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [authMode, setAuthMode] = useState<'register' | 'login'>('register');
  const [pendingBookingAction, setPendingBookingAction] = useState<(() => void) | null>(null);
  const [isTermsOpen, setIsTermsOpen] = useState(false);

  // Handler ao tentar agendar a partir da home
  const handleStartBookingFromHome = (
    origin?: LocationPoint,
    destination?: LocationPoint,
    categoryId?: string,
    options?: { focusField?: 'origin' | 'destination'; openSchedule?: boolean }
  ) => {
    setResumedBookingRide(null);
    setInitialBookingOrigin(origin || null);
    setInitialBookingDestination(destination || null);
    setInitialBookingCategoryId(categoryId || null);
    setInitialBookingFocus(options?.focusField);
    setInitialBookingScheduleOpen(Boolean(options?.openSchedule));
    setCurrentTab('agendar');
  };

  // Handler para retomar a corrida ativa diretamente na Tela Ao Vivo Unificada da Uber
  const handleResumeActiveRide = (ride: Ride) => {
    setInitialBookingOrigin(null);
    setInitialBookingDestination(null);
    setInitialBookingCategoryId(null);
    setResumedBookingRide(ride);
    setCurrentTab('agendar');
  };

  // Limpa o estado de corrida retomada caso seja cancelada ou finalizada em qualquer fluxo
  useEffect(() => {
    if (!resumedBookingRide) return;
    const handleRideChange = (evt: Event) => {
      const detail = (evt as CustomEvent)?.detail;
      const cancelledIds: string[] = Array.isArray(detail?.alsoCancelledRideIds)
        ? detail.alsoCancelledRideIds
        : [];
      if (
        (detail?.rideId === resumedBookingRide.id && (detail?.status === 'cancelada' || detail?.status === 'finalizada')) ||
        cancelledIds.includes(resumedBookingRide.id)
      ) {
        setResumedBookingRide(null);
        return;
      }
      const latest = StorageService.getRides().find(r => r.id === resumedBookingRide.id);
      if (latest && (latest.status === 'cancelada' || latest.status === 'finalizada')) {
        setResumedBookingRide(null);
      }
    };
    window.addEventListener('up_rides_updated', handleRideChange);
    return () => window.removeEventListener('up_rides_updated', handleRideChange);
  }, [resumedBookingRide]);

  // Garante que o aparelho do cliente seja identificado no OneSignal com o telefone (cli-DDDNUMERO)
  useEffect(() => {
    if (currentUser?.phone) {
      const extId = clientExternalId(currentUser.phone);
      if (extId) {
        PushService.identify('cliente', extId);
      }
    }
  }, [currentUser?.phone]);

  // Sucesso de autenticação
  const handleAuthSuccess = (client: ClientProfile) => {
    setCurrentUser(client);
    setIsAuthModalOpen(false);
    refreshData();
    if (pendingBookingAction) {
      pendingBookingAction();
      setPendingBookingAction(null);
    } else if (typeof window !== 'undefined' && window.location.search.includes('flow=schedule')) {
      setCurrentTab('agendar');
    }
  };

  // Logout
  const handleLogout = () => {
    StorageService.setCurrentUser(null);
    setCurrentUser(null);
    setCurrentTab('inicio');
  };

  // ═══ SE NÃO ESTIVER LOGADO → TELA DE BOAS-VINDAS (ESTILO UBER OFICIAL) ═══
  if (!currentUser) {
    return (
      <>
        <ClientWelcomeScreen
          config={config}
          onAuthSuccess={handleAuthSuccess}
          onOpenTerms={() => setIsTermsOpen(true)}
        />
        <PwaInstallBanner customBottomOffset={20} />
        <PassengerTermsContractModal
          isOpen={isTermsOpen}
          onClose={() => setIsTermsOpen(false)}
          mode="passenger"
          config={config}
        />
      </>
    );
  }

  // ═══ LOGADO → APP COMPLETO COM ABAS ═══
  // Filtrar corridas do usuário logado (com normalização de telefone para evitar falhas de formatação)
  const userPhoneClean = (currentUser?.phone || '').replace(/\D/g, '');
  const userRides = rides.filter(r => {
    const rPhoneClean = (r.clientPhone || '').replace(/\D/g, '');
    return (
      (currentUser?.id && r.clientId === currentUser.id) ||
      (userPhoneClean && rPhoneClean && rPhoneClean === userPhoneClean) ||
      (currentUser?.name && r.clientName && r.clientName.trim().toLowerCase() === currentUser.name.trim().toLowerCase())
    );
  });

  return (
    <div className="app-container">
      {/* Conteúdo da Aba Ativa (estende por trás da barra flutuante transparente) */}
      <div style={{ flex: 1 }}>
        {currentTab === 'inicio' && (
          <ClientHomeScreen
            config={config}
            currentUser={currentUser}
            onStartBooking={handleStartBookingFromHome}
            onOpenActiveRide={handleResumeActiveRide}
            onGoToMyRides={() => setCurrentTab('minhas_corridas')}
            onGoToProfile={() => setCurrentTab('perfil')}
            onUserChange={(user) => {
              setCurrentUser(user);
              refreshData();
            }}
          />
        )}

        {currentTab === 'agendar' && (
          <ClientBookingScreen
            config={config}
            currentUser={currentUser}
            initialOrigin={initialBookingOrigin}
            initialDestination={initialBookingDestination}
            initialCategoryId={initialBookingCategoryId}
            initialFocusField={initialBookingFocus}
            initialOpenSchedule={initialBookingScheduleOpen}
            initialRide={resumedBookingRide}
            onRideBooked={() => {
              refreshData();
            }}
            onBackToHome={() => {
              setResumedBookingRide(null);
              setInitialBookingFocus(undefined);
              setInitialBookingScheduleOpen(false);
              setCurrentTab('inicio');
            }}
          />
        )}

        {currentTab === 'minhas_corridas' && (
          <ClientMyRidesScreen
            rides={userRides}
            config={config}
            onOpenActiveRide={handleResumeActiveRide}
            onBookNewRide={(prefill) => {
              setResumedBookingRide(null);
              setInitialBookingOrigin(prefill?.origin || null);
              setInitialBookingDestination(prefill?.destination || null);
              setInitialBookingCategoryId(prefill?.categoryId || null);
              setCurrentTab('agendar');
            }}
          />
        )}

        {currentTab === 'perfil' && (
          <ClientProfileScreen
            config={config}
            currentUser={currentUser}
            rides={userRides}
            resetKey={profileResetKey}
            onGoToMyRides={() => setCurrentTab('minhas_corridas')}
            onBookDestination={(dest) => handleStartBookingFromHome(undefined, dest)}
            onUserChange={(user) => {
              if (!user) {
                handleLogout();
                return;
              }
              setCurrentUser(user);
              refreshData();
            }}
          />
        )}
      </div>

      {/* BARRA DE NAVEGAÇÃO INFERIOR FLUTUANTE (ocultada durante o fluxo de Viagem/Checkout igual Uber) */}
      {currentTab !== 'agendar' && (
        <nav style={{
        position: 'fixed',
        bottom: 'calc(14px + env(safe-area-inset-bottom, 0px))',
        left: '50%',
        transform: 'translateX(-50%)',
        width: 'calc(100% - 28px)',
        maxWidth: 432,
        borderRadius: 28,
        background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.44) 0%, rgba(255, 255, 255, 0.22) 100%)',
        backdropFilter: 'blur(24px) saturate(210%)',
        WebkitBackdropFilter: 'blur(24px) saturate(210%)',
        border: '1px solid rgba(255, 255, 255, 0.68)',
        padding: '5px 7px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 4,
        zIndex: 50,
        boxShadow: '0 14px 36px rgba(15, 23, 42, 0.18), 0 2px 10px rgba(15, 23, 42, 0.08), inset 0 1.5px 1px rgba(255, 255, 255, 0.92), inset 0 -1px 1px rgba(255, 255, 255, 0.35)',
        boxSizing: 'border-box'
      }}>
        <button
          onClick={() => setCurrentTab('inicio')}
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 2,
            backgroundColor: currentTab === 'inicio' ? 'rgba(255, 255, 255, 0.64)' : 'transparent',
            borderRadius: 22,
            padding: '6px 4px',
            boxShadow: currentTab === 'inicio'
              ? '0 2px 10px rgba(15, 23, 42, 0.08), inset 0 1px 0 rgba(255, 255, 255, 0.9)'
              : 'none',
            border: 'none',
            color: currentTab === 'inicio' ? '#0F172A' : '#334155',
            cursor: 'pointer',
            transition: 'all 0.18s ease'
          }}
        >
          <Home size={20} strokeWidth={currentTab === 'inicio' ? 2.5 : 2} />
          <span style={{ fontSize: '0.67rem', fontWeight: currentTab === 'inicio' ? 800 : 600 }}>
            Início
          </span>
        </button>

        <button
          onClick={() => {
            setResumedBookingRide(null);
            setInitialBookingOrigin(null);
            setInitialBookingDestination(null);
            setInitialBookingCategoryId(null);
            setInitialBookingFocus(undefined);
            setInitialBookingScheduleOpen(false);
            setCurrentTab('agendar');
          }}
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 2,
            backgroundColor: 'transparent',
            borderRadius: 22,
            padding: '6px 4px',
            boxShadow: 'none',
            border: 'none',
            color: '#334155',
            cursor: 'pointer',
            transition: 'all 0.18s ease'
          }}
        >
          <MapPin size={20} strokeWidth={2} />
          <span style={{ fontSize: '0.67rem', fontWeight: 600 }}>
            Viagem
          </span>
        </button>

        <button
          onClick={() => setCurrentTab('minhas_corridas')}
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 2,
            backgroundColor: currentTab === 'minhas_corridas' ? 'rgba(255, 255, 255, 0.64)' : 'transparent',
            borderRadius: 22,
            padding: '6px 4px',
            boxShadow: currentTab === 'minhas_corridas'
              ? '0 2px 10px rgba(15, 23, 42, 0.08), inset 0 1px 0 rgba(255, 255, 255, 0.9)'
              : 'none',
            border: 'none',
            color: currentTab === 'minhas_corridas' ? '#0F172A' : '#334155',
            position: 'relative',
            cursor: 'pointer',
            transition: 'all 0.18s ease'
          }}
        >
          <Clock size={20} strokeWidth={currentTab === 'minhas_corridas' ? 2.5 : 2} />
          <span style={{ fontSize: '0.67rem', fontWeight: currentTab === 'minhas_corridas' ? 800 : 600 }}>
            Atividade
          </span>
          {userRides.some(r => ACTIVE_PASSENGER_RIDE_STATUSES.includes(r.status)) && (
            <div style={{
              position: 'absolute',
              top: 5,
              right: '24%',
              width: 8,
              height: 8,
              borderRadius: '50%',
              backgroundColor: '#16A34A'
            }} />
          )}
        </button>

        <button
          onClick={() => {
            if (currentTab === 'perfil') {
              setProfileResetKey((k) => k + 1);
            } else {
              setCurrentTab('perfil');
            }
          }}
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 2,
            backgroundColor: currentTab === 'perfil' ? 'rgba(255, 255, 255, 0.64)' : 'transparent',
            borderRadius: 22,
            padding: '6px 4px',
            boxShadow: currentTab === 'perfil'
              ? '0 2px 10px rgba(15, 23, 42, 0.08), inset 0 1px 0 rgba(255, 255, 255, 0.9)'
              : 'none',
            border: 'none',
            color: currentTab === 'perfil' ? '#0F172A' : '#334155',
            cursor: 'pointer',
            transition: 'all 0.18s ease'
          }}
        >
          <User size={20} strokeWidth={currentTab === 'perfil' ? 2.5 : 2} />
          <span style={{ fontSize: '0.67rem', fontWeight: currentTab === 'perfil' ? 800 : 600 }}>
            Conta
          </span>
        </button>
        </nav>
      )}

      {/* Banner Inteligente de Instalação PWA (fixado acima da barra flutuante) */}
      {currentTab !== 'agendar' && <PwaInstallBanner customBottomOffset={92} />}

      {/* Pop-up de notificações push do cliente (só com cadastro/telefone) */}
      <PushPermissionPrompt role="cliente" externalId={clientExternalId(currentUser?.phone)} delayMs={4000} />
    </div>
  );
};

// Componente para a Rota do Painel Administrativo Master com login exclusivo Supabase
const DriverRoute: React.FC<{
  rides: Ride[];
  config: SystemConfig;
  refreshData: () => void;
}> = ({ rides, config, refreshData }) => {
  const navigate = useNavigate();
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(StorageService.isAdminAuthenticated());
  const [isLoginModalOpen, setIsLoginModalOpen] = useState<boolean>(false);
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [showAdminPassword, setShowAdminPassword] = useState(false);
  const [adminError, setAdminError] = useState('');
  const [isAdminLoading, setIsAdminLoading] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [turnstileResetKey, setTurnstileResetKey] = useState(0);

  useEffect(() => {
    let active = true;
    localStorage.setItem('up_pwa_role', 'admin');
    document.cookie = 'up_pwa_role=admin; path=/; max-age=31536000; SameSite=Lax';
    const manifestLink = document.getElementById('app-manifest') || document.querySelector('link[rel="manifest"]');
    if (manifestLink) manifestLink.setAttribute('href', '/manifest-admin.json');

    (async () => {
      if (StorageService.isAdminAuthenticated()) {
        const valid = await StorageService.verifyAdminSession();
        if (active) setIsAuthenticated(valid);
      } else if (active) {
        setIsAuthenticated(false);
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  const handleAdminSuccess = () => {
    StorageService.setAdminAuthenticated(true);
    localStorage.setItem('up_pwa_role', 'admin');
    document.cookie = 'up_pwa_role=admin; path=/; max-age=31536000; SameSite=Lax';
    setIsAuthenticated(true);
    setIsLoginModalOpen(false);
    StorageService.syncFromDatabase().catch(() => {});
  };

  const handleExitAdmin = () => {
    StorageService.setAdminAuthenticated(false);
    localStorage.removeItem('up_pwa_role');
    document.cookie = 'up_pwa_role=; path=/; max-age=0; SameSite=Lax';
    setIsAuthenticated(false);
    navigate('/cliente');
  };

  const handleDirectSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAdminError('');

    const cleanEmail = adminEmail.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      setAdminError('Informe seu e-mail administrador.');
      return;
    }
    if (!adminPassword) {
      setAdminError('Digite sua senha.');
      return;
    }
    if (isTurnstileEnabled() && !turnstileToken) {
      setAdminError('Confirme a verificação de segurança anti-robô.');
      return;
    }

    setIsAdminLoading(true);
    const res = await StorageService.loginMasterAdmin(cleanEmail, adminPassword, turnstileToken || undefined);
    setIsAdminLoading(false);

    if (res.ok) {
      handleAdminSuccess();
    } else {
      setAdminError(res.error || 'E-mail ou senha não autorizados.');
      setTurnstileResetKey(k => k + 1);
    }
  };

  if (!isAuthenticated) {
    return (
      <div style={{
        minHeight: '100dvh',
        backgroundColor: '#FFFFFF',
        display: 'flex',
        flexDirection: 'column',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        color: '#000000',
        boxSizing: 'border-box'
      }}>
        <AdminLoginModal
          isOpen={isLoginModalOpen}
          onClose={() => setIsLoginModalOpen(false)}
          onSuccess={handleAdminSuccess}
        />

        {/* Top Bar estilo Uber */}
        <header style={{
          width: '100%',
          height: 60,
          backgroundColor: '#000000',
          color: '#FFFFFF',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 24px',
          boxSizing: 'border-box'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: '1.12rem', fontWeight: 800, letterSpacing: '-0.02em', color: '#FFFFFF' }}>
              Kavro Drive
            </span>
            <span style={{
              backgroundColor: '#27272A',
              color: '#F4F4F5',
              fontSize: '0.68rem',
              fontWeight: 700,
              padding: '3px 8px',
              borderRadius: 6,
              letterSpacing: '0.04em',
              textTransform: 'uppercase'
            }}>
              Painel Master
            </span>
          </div>
          <button
            type="button"
            onClick={() => navigate('/')}
            style={{
              background: 'none',
              border: 'none',
              color: '#D4D4D8',
              fontSize: '0.82rem',
              fontWeight: 600,
              cursor: 'pointer',
              padding: '6px 8px'
            }}
          >
            App Passageiro
          </button>
        </header>

        {/* Área Central Clean estilo Uber */}
        <main style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px 20px 40px',
          boxSizing: 'border-box'
        }}>
          <div style={{
            width: '100%',
            maxWidth: 380,
            boxSizing: 'border-box'
          }}>
            <div style={{ marginBottom: 24 }}>
              <div style={{
                display: 'inline-block',
                fontSize: '0.72rem',
                fontWeight: 700,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                color: '#52525B',
                backgroundColor: '#F3F4F6',
                padding: '4px 10px',
                borderRadius: 999,
                marginBottom: 12
              }}>
                Administração Master
              </div>
              <h1 style={{
                fontSize: '1.65rem',
                fontWeight: 700,
                lineHeight: 1.2,
                letterSpacing: '-0.025em',
                margin: '0 0 8px 0',
                color: '#000000'
              }}>
                Entrar no Painel Master
              </h1>
              <p style={{
                fontSize: '0.9rem',
                color: '#6B7280',
                margin: 0,
                lineHeight: 1.4
              }}>
                Acesso exclusivo com e-mail e senha autorizados
              </p>
            </div>

            <form onSubmit={handleDirectSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{
                height: 50,
                backgroundColor: '#F3F3F3',
                borderRadius: 10,
                border: adminError ? '1.5px solid #DC2626' : '1.5px solid transparent',
                display: 'flex',
                alignItems: 'center',
                padding: '0 14px',
                boxSizing: 'border-box'
              }}>
                <Mail size={18} color="#52525B" style={{ marginRight: 10, flexShrink: 0 }} />
                <input
                  type="email"
                  placeholder="E-mail do administrador"
                  value={adminEmail}
                  autoFocus
                  required
                  onChange={(e) => {
                    setAdminEmail(e.target.value);
                    setAdminError('');
                  }}
                  style={{
                    flex: 1,
                    height: '100%',
                    border: 'none',
                    backgroundColor: 'transparent',
                    fontSize: '0.96rem',
                    fontWeight: 500,
                    color: '#000000',
                    outline: 'none'
                  }}
                />
              </div>

              <div style={{
                height: 50,
                backgroundColor: '#F3F3F3',
                borderRadius: 10,
                border: adminError ? '1.5px solid #DC2626' : '1.5px solid transparent',
                display: 'flex',
                alignItems: 'center',
                padding: '0 14px',
                boxSizing: 'border-box'
              }}>
                <Lock size={18} color="#52525B" style={{ marginRight: 10, flexShrink: 0 }} />
                <input
                  type={showAdminPassword ? 'text' : 'password'}
                  placeholder="Senha de acesso"
                  value={adminPassword}
                  required
                  onChange={(e) => {
                    setAdminPassword(e.target.value);
                    setAdminError('');
                  }}
                  style={{
                    flex: 1,
                    height: '100%',
                    border: 'none',
                    backgroundColor: 'transparent',
                    fontSize: '0.96rem',
                    fontWeight: 500,
                    color: '#000000',
                    outline: 'none'
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowAdminPassword(!showAdminPassword)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#52525B',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    padding: 4
                  }}
                >
                  {showAdminPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>

              <TurnstileWidget theme="light" onVerify={setTurnstileToken} resetKey={turnstileResetKey} />

              {adminError && (
                <div style={{
                  color: '#DC2626',
                  fontSize: '0.82rem',
                  fontWeight: 600,
                  backgroundColor: '#FEF2F2',
                  border: '1px solid #FECACA',
                  borderRadius: 8,
                  padding: '9px 12px',
                  textAlign: 'left'
                }}>
                  {adminError}
                </div>
              )}

              <button
                type="submit"
                disabled={isAdminLoading}
                style={{
                  width: '100%',
                  height: 50,
                  backgroundColor: '#000000',
                  color: '#FFFFFF',
                  border: 'none',
                  borderRadius: 10,
                  fontSize: '0.98rem',
                  fontWeight: 700,
                  cursor: isAdminLoading ? 'wait' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  marginTop: 4,
                  opacity: isAdminLoading ? 0.75 : 1
                }}
              >
                <span>{isAdminLoading ? 'Validando acesso...' : 'Entrar no Painel Master'}</span>
                {!isAdminLoading && <ArrowRight size={17} />}
              </button>
            </form>

            <div style={{
              display: 'flex',
              alignItems: 'center',
              margin: '22px 0',
              gap: 12
            }}>
              <div style={{ flex: 1, height: 1, backgroundColor: '#E5E7EB' }} />
              <span style={{ fontSize: '0.82rem', color: '#9CA3AF', fontWeight: 500 }}>ou</span>
              <div style={{ flex: 1, height: 1, backgroundColor: '#E5E7EB' }} />
            </div>

            <button
              type="button"
              onClick={() => navigate('/kavro-drive')}
              style={{
                width: '100%',
                height: 48,
                backgroundColor: '#F3F3F3',
                color: '#000000',
                border: 'none',
                borderRadius: 10,
                fontSize: '0.92rem',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              Portal do Motorista Parceiro
            </button>
          </div>
        </main>
        <PwaInstallBanner customBottomOffset={20} />
      </div>
    );
  }

  return (
    <>
      <AdminDashboardScreen
        rides={rides}
        config={config}
        onRefreshData={refreshData}
        onExitAdmin={handleExitAdmin}
      />
      <PushPermissionPrompt role="admin" externalId={ADMIN_EXTERNAL_ID} delayMs={1500} />
      <PwaInstallBanner customBottomOffset={74} />
    </>
  );
};

const SecurityGuideRoute: React.FC<{ config: SystemConfig }> = ({ config }) => {
  const navigate = useNavigate();
  const [termsOpen, setTermsOpen] = useState(false);
  const currentUser = StorageService.getCurrentUser();
  return (
    <>
      <KavroSecurityGuideModal
        isOpen
        asPage
        config={config}
        currentUser={currentUser}
        onClose={() => {
          if (window.history.length > 1) {
            navigate(-1);
          } else {
            navigate('/cliente');
          }
        }}
        onSelectFeature={() => navigate('/cliente')}
        onOpenSos={() => navigate('/cliente')}
        onOpenTerms={() => setTermsOpen(true)}
        onNavigateToDriverPortal={() => navigate('/kavro-drive')}
      />
      <TermsPrivacyModal isOpen={termsOpen} onClose={() => setTermsOpen(false)} config={config} />
    </>
  );
};

export const App: React.FC = () => {
  const [config, setConfig] = useState<SystemConfig>(StorageService.getConfig());
  const [rides, setRides] = useState<Ride[]>(StorageService.getRides());
  const location = useLocation();

  const refreshData = () => {
    const nextConfig = StorageService.getConfig();
    setConfig(prev => (JSON.stringify(prev) === JSON.stringify(nextConfig) ? prev : nextConfig));
    setRides(StorageService.getRides());
  };

  useEffect(() => {
    refreshData();
  }, [location.pathname]);

  // Sincronização em tempo real via SSE + fallback seguro de rede (sem precisar fechar/abrir o app)
  useEffect(() => {
    const releaseRealtime = RealtimeService.acquire('app');

    let syncInFlight = false;
    const syncNow = () => {
      if (document.visibilityState === 'hidden' || syncInFlight) return;
      syncInFlight = true;
      StorageService.syncFromDatabase()
        .then(() => {
          refreshData();
        })
        .catch(() => {})
        .finally(() => {
          syncInFlight = false;
        });
    };

    syncNow();

    // Se SSE está conectado, eventos chegam instantaneamente; mantém fallback leve de 12s (ou 2.5s se cair em fallback)
    let pollInterval: number | null = null;
    const resetPollingSpeed = () => {
      if (pollInterval !== null) clearInterval(pollInterval);
      const intervalMs = RealtimeService.isConnected() ? 12000 : 2500;
      pollInterval = window.setInterval(syncNow, intervalMs);
    };
    resetPollingSpeed();

    const handleRealtimeRide = () => syncNow();
    const handleRealtimeGps = (evt: Event) => {
      const detail = (evt as CustomEvent)?.detail;
      if (!detail?.rideId) return;
      const ridesStr = localStorage.getItem('up_mobilidade_rides');
      if (!ridesStr) return;
      try {
        const list: Ride[] = JSON.parse(ridesStr);
        let changed = false;
        const nextList = list.map(r => {
          if (r.id !== detail.rideId) return r;
          changed = true;
          return {
            ...r,
            driverLocation: detail.driverLocation ?? r.driverLocation,
            clientLocation: detail.clientLocation ?? r.clientLocation,
            status: detail.status ?? r.status
          };
        });
        if (changed) {
          localStorage.setItem('up_mobilidade_rides', JSON.stringify(nextList));
          window.dispatchEvent(new CustomEvent('up_rides_updated', { detail: { rideId: detail.rideId } }));
        }
      } catch {
        // ignore
      }
    };

    const handleSynced = () => {
      refreshData();
    };
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') syncNow();
    };

    window.addEventListener('up_realtime_ride', handleRealtimeRide);
    window.addEventListener('up_realtime_driver', handleRealtimeRide);
    window.addEventListener('up_realtime_config', handleRealtimeRide);
    window.addEventListener('up_realtime_gps', handleRealtimeGps);
    window.addEventListener('up_realtime_status', resetPollingSpeed);
    window.addEventListener('up_database_synced', handleSynced);
    window.addEventListener('up_rides_updated', handleSynced);
    window.addEventListener('up_push_received', syncNow);
    window.addEventListener('focus', syncNow);
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      releaseRealtime();
      if (pollInterval !== null) clearInterval(pollInterval);
      window.removeEventListener('up_realtime_ride', handleRealtimeRide);
      window.removeEventListener('up_realtime_driver', handleRealtimeRide);
      window.removeEventListener('up_realtime_config', handleRealtimeRide);
      window.removeEventListener('up_realtime_gps', handleRealtimeGps);
      window.removeEventListener('up_realtime_status', resetPollingSpeed);
      window.removeEventListener('up_database_synced', handleSynced);
      window.removeEventListener('up_rides_updated', handleSynced);
      window.removeEventListener('up_push_received', syncNow);
      window.removeEventListener('focus', syncNow);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, []);

  return (
    <>
    <KavroScrollIndicator />
    <Suspense fallback={<RouteLoadingFallback />}>
      <Routes>
      {/* Rota pública de Rastreamento de Emergência SOS em Tempo Real */}
      <Route
        path="/sos/:sosId"
        element={<SosLiveTrackingScreen config={config} />}
      />
      <Route
        path="/sos"
        element={<SosLiveTrackingScreen config={config} />}
      />

      {/* Rota pública de Acompanhamento ao Vivo & Recibo Oficial da Viagem */}
      <Route
        path="/viagem/:rideId"
        element={<PassengerTrackingScreen config={config} rides={rides} refreshData={refreshData} />}
      />
      <Route
        path="/corrida/:rideId"
        element={<PassengerTrackingScreen config={config} rides={rides} refreshData={refreshData} />}
      />
      <Route
        path="/track/:rideId"
        element={<PassengerTrackingScreen config={config} rides={rides} refreshData={refreshData} />}
      />

      {/* Rota pública de Frota Verificada Multi-Motoristas (somente frota, sem exposição de localizações) */}
      <Route
        path="/frotas"
        element={<PublicFleetScreen config={config} />}
      />
      <Route
        path="/frota"
        element={<PublicFleetScreen config={config} />}
      />

      {/* Rota pública da Central de Ajuda Clean e Guia de Segurança no PWA */}
      <Route
        path="/ajuda"
        element={<HelpCenterScreen config={config} />}
      />
      <Route
        path="/cidades-atendidas"
        element={<CitiesServedScreen config={config} />}
      />
      <Route
        path="/cidades"
        element={<CitiesServedScreen config={config} />}
      />
      <Route
        path="/seguranca"
        element={<SecurityGuideRoute config={config} />}
      />
      <Route
        path="/sobre-seguranca"
        element={<Navigate to="/seguranca" replace />}
      />
      <Route
        path="/familia/convite/:token"
        element={<FamilyInviteScreen config={config} />}
      />
      <Route
        path="/central-de-ajuda"
        element={<Navigate to="/ajuda" replace />}
      />
      <Route
        path="/suporte"
        element={<Navigate to="/ajuda" replace />}
      />

      {/* Landing Page Oficial na Raiz (/) estilo Uber — Desktop e Mobile */}
      <Route
        path="/"
        element={<LandingScreen config={config} />}
      />

      {/* Rotas do App do Passageiro (/cliente e /app) */}
      <Route
        path="/cliente/*"
        element={<ClientApp config={config} rides={rides} refreshData={refreshData} />}
      />
      <Route
        path="/cliente"
        element={<ClientApp config={config} rides={rides} refreshData={refreshData} />}
      />
      <Route
        path="/app/*"
        element={<ClientApp config={config} rides={rides} refreshData={refreshData} />}
      />

      {/* Rotas do App do Motorista Parceiro (Cadastro Uber, Online/Offline, Radar, Minha Carteira) */}
      <Route
        path="/kavro-drive/*"
        element={<DriverPortalScreen rides={rides} config={config} refreshData={refreshData} />}
      />
      <Route
        path="/kavro-drive"
        element={<DriverPortalScreen rides={rides} config={config} refreshData={refreshData} />}
      />
      <Route
        path="/motora/*"
        element={<Navigate to="/kavro-drive" replace />}
      />
      <Route
        path="/motora"
        element={<Navigate to="/kavro-drive" replace />}
      />
      <Route
        path="/motorista/*"
        element={<Navigate to="/kavro-drive" replace />}
      />
      <Route
        path="/motorista"
        element={<Navigate to="/kavro-drive" replace />}
      />
      <Route
        path="/parceiro"
        element={<Navigate to="/kavro-drive" replace />}
      />

      {/* Rota exclusiva do Painel Administrativo Master (/administracion) */}
      <Route
        path="/administracion/*"
        element={<DriverRoute rides={rides} config={config} refreshData={refreshData} />}
      />
      <Route
        path="/administracion"
        element={<DriverRoute rides={rides} config={config} refreshData={refreshData} />}
      />

      {/* Rota 404 dedicada no tema Kavro Drive */}
      <Route
        path="*"
        element={(
          <div style={{ minHeight: '100vh', background: '#0B1117', color: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px', fontFamily: 'Plus Jakarta Sans, Inter, sans-serif' }}>
            <div style={{ maxWidth: '460px', width: '100%', background: '#111820', border: '1px solid #1E293B', borderRadius: '16px', padding: '32px', textAlign: 'center', boxShadow: '0 24px 60px rgba(0,0,0,0.45)' }}>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', background: 'rgba(116,193,101,0.12)', border: '1px solid rgba(116,193,101,0.3)', color: '#74C165', borderRadius: '999px', padding: '4px 12px', fontSize: '12px', fontWeight: 700, letterSpacing: '0.06em', marginBottom: '16px' }}>
                ERRO 404
              </div>
              <h1 style={{ fontSize: '26px', fontWeight: 800, margin: '0 0 10px 0', letterSpacing: '-0.02em' }}>Rota não encontrada</h1>
              <p style={{ fontSize: '14px', color: '#94A3B8', lineHeight: 1.6, margin: '0 0 24px 0' }}>
                O endereço acessado não existe ou foi movido na plataforma Kavro Drive. Escolha um dos destinos abaixo para continuar.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <a href="/" style={{ display: 'block', padding: '12px 16px', borderRadius: '10px', background: '#74C165', color: '#0B1117', fontWeight: 700, fontSize: '14px', textDecoration: 'none' }}>
                  Ir para Página Inicial
                </a>
                <a href="/cliente" style={{ display: 'block', padding: '12px 16px', borderRadius: '10px', background: '#1E293B', color: '#F8FAFC', fontWeight: 600, fontSize: '14px', textDecoration: 'none', border: '1px solid #334155' }}>
                  Solicitar Corrida (App Passageiro)
                </a>
                <a href="/kavro-drive" style={{ display: 'block', padding: '12px 16px', borderRadius: '10px', background: 'transparent', color: '#CBD5E1', fontWeight: 600, fontSize: '14px', textDecoration: 'none', border: '1px solid #334155' }}>
                  Portal do Motorista Parceiro
                </a>
              </div>
            </div>
          </div>
        )}
      />
    </Routes>
    </Suspense>
    </>
  );
};
