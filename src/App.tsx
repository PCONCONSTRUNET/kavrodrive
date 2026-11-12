import React, { useState, useEffect } from 'react';
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { Home, Calendar, Clock, User, MapPin, PhoneCall, ArrowRight, Sparkles } from 'lucide-react';
import { SystemConfig, Ride, LocationPoint, ClientProfile } from './types';
import { StorageService } from './services/storage';
import { ClientHomeScreen } from './views/ClientHomeScreen';
import { ClientBookingScreen } from './views/ClientBookingScreen';
import { ClientMyRidesScreen } from './views/ClientMyRidesScreen';
import { ClientProfileScreen } from './views/ClientProfileScreen';
import { AdminDashboardScreen } from './views/AdminDashboardScreen';
import { DriverPortalScreen } from './views/DriverPortalScreen';
import { PassengerTrackingScreen } from './views/PassengerTrackingScreen';
import { SosLiveTrackingScreen } from './views/SosLiveTrackingScreen';
import { DriverPublicAuditModal } from './components/DriverPublicAuditModal';
import { AdminLoginModal } from './components/AdminLoginModal';
import { PwaInstallBanner } from './components/PwaInstallBanner';
import { PushPermissionPrompt } from './components/PushNotifications';
import { ADMIN_EXTERNAL_ID, clientExternalId, PushService } from './services/push';
import { AuthModal } from './components/AuthModal';
import { ClientWelcomeScreen } from './components/ClientWelcomeScreen';
import { WhatsAppIcon } from './components/WhatsAppIcon';
import { TermsPrivacyModal } from './components/TermsPrivacyModal';
import { PassengerTermsContractModal } from './components/PassengerTermsContractModal';
import { getCleanWhatsappNumber } from './utils/format';

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
  const [currentTab, setCurrentTab] = useState<'inicio' | 'agendar' | 'minhas_corridas' | 'perfil'>('inicio');
  const [initialBookingOrigin, setInitialBookingOrigin] = useState<LocationPoint | null>(null);
  const [initialBookingDestination, setInitialBookingDestination] = useState<LocationPoint | null>(null);

  // Controle do modal de Autenticação (Login / Cadastro)
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [authMode, setAuthMode] = useState<'register' | 'login'>('register');
  const [pendingBookingAction, setPendingBookingAction] = useState<(() => void) | null>(null);
  const [isTermsOpen, setIsTermsOpen] = useState(false);

  // Handler ao tentar agendar a partir da home
  const handleStartBookingFromHome = (origin?: LocationPoint, destination?: LocationPoint) => {
    setInitialBookingOrigin(origin || null);
    setInitialBookingDestination(destination || null);
    setCurrentTab('agendar');
  };

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
      {/* Conteúdo da Aba Ativa */}
      <div style={{ flex: 1, paddingBottom: 60 }}>
        {currentTab === 'inicio' && (
          <ClientHomeScreen
            config={config}
            currentUser={currentUser}
            onStartBooking={handleStartBookingFromHome}
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
            onRideBooked={() => {
              refreshData();
            }}
            onBackToHome={() => setCurrentTab('inicio')}
          />
        )}

        {currentTab === 'minhas_corridas' && (
          <ClientMyRidesScreen
            rides={userRides}
            config={config}
            onBookNewRide={() => {
              setInitialBookingOrigin(null);
              setInitialBookingDestination(null);
              setCurrentTab('agendar');
            }}
          />
        )}

        {currentTab === 'perfil' && (
          <ClientProfileScreen
            currentUser={currentUser}
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

      {/* BARRA DE NAVEGAÇÃO INFERIOR FIXA (Mobile First TabBar) */}
      <nav style={{
        position: 'fixed',
        bottom: 0,
        left: '50%',
        transform: 'translateX(-50%)',
        width: '100%',
        maxWidth: 480,
        backgroundColor: '#121A21',
        borderTop: '1px solid #2C3E50',
        padding: '7px 14px 9px 14px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-around',
        zIndex: 50,
        boxShadow: '0 -4px 20px rgba(0,0,0,0.25)',
      }}>
        <button
          onClick={() => setCurrentTab('inicio')}
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 2,
            background: 'none',
            color: currentTab === 'inicio' ? '#76D800' : '#94A3B8',
            transition: 'all 0.15s ease'
          }}
        >
          <Home size={20} />
          <span style={{ fontSize: '0.68rem', fontWeight: currentTab === 'inicio' ? 700 : 500 }}>
            Início
          </span>
        </button>

        <button
          onClick={() => {
            setInitialBookingOrigin(null);
            setInitialBookingDestination(null);
            setCurrentTab('agendar');
          }}
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 2,
            background: 'none',
            color: currentTab === 'agendar' ? '#76D800' : '#94A3B8',
            transition: 'all 0.15s ease'
          }}
        >
          <MapPin size={20} />
          <span style={{ fontSize: '0.68rem', fontWeight: currentTab === 'agendar' ? 700 : 500 }}>
            Chamar
          </span>
        </button>

        <button
          onClick={() => setCurrentTab('minhas_corridas')}
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 2,
            background: 'none',
            color: currentTab === 'minhas_corridas' ? '#76D800' : '#94A3B8',
            position: 'relative',
            transition: 'all 0.15s ease'
          }}
        >
          <Clock size={20} />
          <span style={{ fontSize: '0.68rem', fontWeight: currentTab === 'minhas_corridas' ? 700 : 500 }}>
            Minhas Viagens
          </span>
          {userRides.some(r => r.status === 'aguardando_pagamento' || r.status === 'aguardando_confirmacao' || r.status === 'na_fila' || r.status === 'confirmada' || r.status === 'a_caminho' || r.status === 'no_local' || r.status === 'em_andamento') && (
            <div style={{
              position: 'absolute',
              top: 0,
              right: 18,
              width: 8,
              height: 8,
              borderRadius: '50%',
              backgroundColor: '#76D800'
            }} />
          )}
        </button>

        <button
          onClick={() => setCurrentTab('perfil')}
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 2,
            background: 'none',
            color: currentTab === 'perfil' ? '#76D800' : '#94A3B8',
            transition: 'all 0.15s ease'
          }}
        >
          <User size={20} />
          <span style={{ fontSize: '0.68rem', fontWeight: currentTab === 'perfil' ? 700 : 500 }}>
            Perfil
          </span>
        </button>
      </nav>

      {/* Banner Inteligente de Instalação PWA (fixado acima da barra inferior) */}
      <PwaInstallBanner customBottomOffset={58} />

      {/* Pop-up de notificações push do cliente (só com cadastro/telefone) */}
      <PushPermissionPrompt role="cliente" externalId={clientExternalId(currentUser?.phone)} delayMs={4000} />
    </div>
  );
};

// Componente para a Rota do Motorista / Administrador com tela de PIN se não autenticado
const DriverRoute: React.FC<{
  rides: Ride[];
  config: SystemConfig;
  refreshData: () => void;
}> = ({ rides, config, refreshData }) => {
  const navigate = useNavigate();
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(StorageService.isAdminAuthenticated());
  const [isLoginModalOpen, setIsLoginModalOpen] = useState<boolean>(false);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState(false);

  useEffect(() => {
    setIsAuthenticated(StorageService.isAdminAuthenticated());
    localStorage.setItem('up_pwa_role', 'admin');
    document.cookie = 'up_pwa_role=admin; path=/; max-age=31536000; SameSite=Lax';
    const manifestLink = document.getElementById('app-manifest') || document.querySelector('link[rel="manifest"]');
    if (manifestLink) manifestLink.setAttribute('href', '/manifest-admin.json');
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

  const handleDirectSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanPin = pinInput.trim().toLowerCase();
    if (cleanPin === '1234' || cleanPin === '2026' || cleanPin === 'admin' || cleanPin === '0000' || cleanPin === '9999') {
      StorageService.setAdminPin(cleanPin);
      handleAdminSuccess();
    } else {
      setPinError(true);
      setPinInput('');
    }
  };

  if (!isAuthenticated) {
    return (
      <div style={{
        minHeight: '100dvh',
        background: 'radial-gradient(circle at 50% 0%, #182634 0%, #0B1015 70%)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        color: '#ffffff',
        boxSizing: 'border-box'
      }}>
        <AdminLoginModal
          isOpen={isLoginModalOpen}
          onClose={() => setIsLoginModalOpen(false)}
          onSuccess={handleAdminSuccess}
        />
        <div style={{
          textAlign: 'center',
          maxWidth: 340,
          width: '100%',
          backgroundColor: 'rgba(18, 26, 33, 0.95)',
          border: '1px solid rgba(118, 216, 0, 0.28)',
          borderRadius: 22,
          padding: '24px 20px 22px',
          boxShadow: '0 20px 50px rgba(0,0,0,0.65), 0 0 24px rgba(118, 216, 0, 0.08)',
          backdropFilter: 'blur(12px)',
          boxSizing: 'border-box'
        }}>
          {/* Logo Oficial Kavro Drive */}
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 10,
            marginBottom: 14
          }}>
            <div style={{
              width: 64,
              height: 64,
              borderRadius: 18,
              backgroundColor: '#0D1318',
              border: '1.5px solid rgba(118, 216, 0, 0.45)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 6,
              boxShadow: '0 6px 20px rgba(118, 216, 0, 0.18)'
            }}>
              <img
                src="/pwa-icon-192.png"
                alt="KAVRO DRIVE"
                style={{ width: '100%', height: '100%', objectFit: 'contain', borderRadius: 12 }}
              />
            </div>

            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: '0.78rem', fontWeight: 900, letterSpacing: '0.06em', color: '#E2E8F0' }}>
                KAVRO DRIVE
              </span>
              <span style={{
                backgroundColor: '#76D800',
                color: '#121A21',
                fontSize: '0.62rem',
                fontWeight: 900,
                padding: '2px 7px',
                borderRadius: 6,
                letterSpacing: '0.04em'
              }}>
                MOTORISTA
              </span>
            </div>
          </div>

          <h2 style={{ fontSize: '1.18rem', fontWeight: 800, margin: '0 0 4px 0', letterSpacing: '-0.02em', color: '#FFFFFF' }}>
            Painel Operacional
          </h2>
          <p style={{ color: '#94A3B8', fontSize: '0.78rem', margin: '0 0 16px 0', lineHeight: 1.35 }}>
            Digite seu PIN de segurança para acessar
          </p>

          <form onSubmit={handleDirectSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <input
              type="password"
              inputMode="numeric"
              placeholder="Digite seu PIN"
              value={pinInput}
              autoFocus
              onChange={(e) => {
                const val = e.target.value;
                setPinInput(val);
                setPinError(false);
                const clean = val.trim().toLowerCase();
                if (clean === '1234' || clean === '2026' || clean === '0000' || clean === '9999') {
                  StorageService.setAdminPin(clean);
                  handleAdminSuccess();
                }
              }}
              style={{
                width: '100%',
                height: 46,
                padding: '0 14px',
                borderRadius: 12,
                border: pinError ? '1.5px solid #EF4444' : '1.5px solid #2C3E50',
                backgroundColor: '#16202A',
                color: '#ffffff',
                fontSize: pinInput ? '1.25rem' : '0.9rem',
                fontWeight: 800,
                textAlign: 'center',
                letterSpacing: pinInput ? 8 : 0.5,
                outline: 'none',
                boxSizing: 'border-box',
                transition: 'border-color 0.2s'
              }}
            />

            {pinError && (
              <div style={{ color: '#F87171', fontSize: '0.76rem', fontWeight: 700 }}>
                PIN de acesso inválido. Tente novamente.
              </div>
            )}

            <button
              type="submit"
              className="btn-ios-primary"
              style={{
                width: '100%',
                height: 46,
                padding: '0 16px',
                borderRadius: 12,
                fontSize: '0.92rem',
                fontWeight: 800,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                marginTop: 2
              }}
            >
              <span>Entrar no Painel Master</span>
              <ArrowRight size={16} />
            </button>
            <button
              type="button"
              onClick={() => navigate('/kavro-drive')}
              style={{
                width: '100%',
                height: 40,
                padding: '0 12px',
                borderRadius: 10,
                border: '1px solid #334155',
                backgroundColor: '#0F172A',
                color: '#76D800',
                fontSize: '0.78rem',
                fontWeight: 800,
                cursor: 'pointer',
                marginTop: 4
              }}
            >
              🚗 Sou Motorista Parceiro → Abrir App Motorista
            </button>
          </form>
        </div>
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

  // Sincronização em tempo real com banco de dados Supabase PostgreSQL (sem precisar fechar/abrir o app)
  useEffect(() => {
    const syncNow = () => {
      if (document.visibilityState === 'hidden') return;
      StorageService.syncFromDatabase().then(() => {
        refreshData();
      }).catch(() => {});
    };

    syncNow();

    // Polling inteligente e rápido (a cada 2s) para motorista e cliente receberem confirmações e status na hora
    const pollInterval = setInterval(syncNow, 2000);

    const handleSynced = () => {
      refreshData();
    };
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') syncNow();
    };

    window.addEventListener('up_database_synced', handleSynced);
    window.addEventListener('up_rides_updated', handleSynced);
    window.addEventListener('up_push_received', syncNow);
    window.addEventListener('focus', syncNow);
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      clearInterval(pollInterval);
      window.removeEventListener('up_database_synced', handleSynced);
      window.removeEventListener('up_rides_updated', handleSynced);
      window.removeEventListener('up_push_received', syncNow);
      window.removeEventListener('focus', syncNow);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, []);

  return (
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

      {/* Rota pública de Perfil do Motorista & Auditoria de Corridas Finalizadas */}
      <Route
        path="/auditoria"
        element={
          <DriverPublicAuditModal
            isOpen={true}
            onClose={() => {
              window.location.href = '/cliente';
            }}
            config={config}
            rides={rides}
            isAdminView={false}
          />
        }
      />

      {/* Rota principal do Cliente (em / e em /cliente) */}
      <Route
        path="/"
        element={<ClientApp config={config} rides={rides} refreshData={refreshData} />}
      />
      <Route
        path="/cliente/*"
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

      {/* Rotas do Painel Administrativo Master (/administracion) */}
      <Route
        path="/administracion/*"
        element={<DriverRoute rides={rides} config={config} refreshData={refreshData} />}
      />
      <Route
        path="/administracion"
        element={<DriverRoute rides={rides} config={config} refreshData={refreshData} />}
      />
      <Route
        path="/admin/*"
        element={<Navigate to="/administracion" replace />}
      />
      <Route
        path="/admin"
        element={<Navigate to="/administracion" replace />}
      />
      <Route
        path="/painel"
        element={<Navigate to="/administracion" replace />}
      />
      <Route
        path="/dashboard"
        element={<Navigate to="/administracion" replace />}
      />

      {/* Qualquer rota desconhecida permanece na área do Cliente */}
      <Route
        path="*"
        element={<Navigate to="/" replace />}
      />
    </Routes>
  );
};
