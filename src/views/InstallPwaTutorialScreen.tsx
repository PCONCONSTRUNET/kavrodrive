import React, { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import QRCode from 'qrcode';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  Copy,
  Download,
  ExternalLink,
  Laptop,
  MonitorDown,
  MoreVertical,
  PlusSquare,
  Share,
  Smartphone,
} from 'lucide-react';
import { SystemConfig } from '../types';

interface InstallPwaTutorialScreenProps {
  config: SystemConfig;
}

const CURRENT_YEAR = new Date().getFullYear();

type AppTarget = 'passageiro' | 'motorista';
type PlatformTab = 'desktop' | 'android' | 'ios';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

function detectInitialPlatform(): PlatformTab {
  if (typeof navigator === 'undefined') return 'desktop';
  const ua = navigator.userAgent.toLowerCase();
  if (
    /iphone|ipad|ipod/.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  ) {
    return 'ios';
  }
  if (/android/.test(ua)) {
    return 'android';
  }
  return 'desktop';
}

function parseAppTargetFromSearch(search: string): AppTarget {
  const params = new URLSearchParams(search);
  const raw = String(params.get('app') || params.get('role') || '')
    .trim()
    .toLowerCase();
  if (raw === 'motorista' || raw === 'parceiro' || raw === 'driver') {
    return 'motorista';
  }
  return 'passageiro';
}

function syncDocumentManifestForApp(appTarget: AppTarget): void {
  if (typeof document === 'undefined') return;
  const manifestEl = document.getElementById('app-manifest');
  const appleTitleEl = document.getElementById('apple-app-title');
  if (appTarget === 'motorista') {
    manifestEl?.setAttribute('href', '/manifest-driver.json');
    appleTitleEl?.setAttribute('content', 'Kavro Motorista');
  } else {
    manifestEl?.setAttribute('href', '/manifest-client.json');
    appleTitleEl?.setAttribute('content', 'KAVRO DRIVE');
  }
}

const QrInstallBox: React.FC<{ url: string }> = ({ url }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    QRCode.toCanvas(
      canvasRef.current,
      url,
      {
        width: 112,
        margin: 1,
        color: { dark: '#0A0F14', light: '#FFFFFF' },
      },
      () => {}
    );
  }, [url]);

  return (
    <div
      style={{
        width: 124,
        height: 124,
        backgroundColor: '#FFFFFF',
        borderRadius: 10,
        border: '1px solid #E2E8F0',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}
    >
      <canvas ref={canvasRef} style={{ display: 'block', borderRadius: 4 }} />
    </div>
  );
};

export const InstallPwaTutorialScreen: React.FC<InstallPwaTutorialScreenProps> = ({
  config,
}) => {
  const navigate = useNavigate();
  const location = useLocation();

  const selectedApp: AppTarget = parseAppTargetFromSearch(location.search);
  const [platformTab, setPlatformTab] = useState<PlatformTab>(() =>
    detectInitialPlatform()
  );
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [isStandalone, setIsStandalone] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return (
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as { standalone?: boolean }).standalone === true ||
      document.referrer.includes('android-app://')
    );
  });
  const [copiedLink, setCopiedLink] = useState(false);
  const [installFeedback, setInstallFeedback] = useState('');
  const [isMobile, setIsMobile] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.innerWidth < 860 : false
  );

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 860);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    syncDocumentManifestForApp(selectedApp);
  }, [selectedApp]);

  useEffect(() => {
    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    const handleAppInstalled = () => {
      setIsStandalone(true);
      setDeferredPrompt(null);
      setInstallFeedback(
        'Aplicativo instalado. O ícone já foi criado no seu dispositivo.'
      );
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    window.addEventListener('appinstalled', handleAppInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const origin =
    typeof window !== 'undefined' && window.location?.origin
      ? window.location.origin
      : 'https://kavrodrive.vercel.app';

  const appMeta =
    selectedApp === 'motorista'
      ? {
          id: 'motorista' as const,
          eyebrow: 'Portal de Motoristas Parceiros',
          name: 'App Parceiro Kavro',
          shortName: 'Kavro Motorista',
          route: '/kavro-drive',
          fullUrl: `${origin}/kavro-drive`,
          displayUrl: `${origin.replace(/^https?:\/\//, '')}/kavro-drive`,
          description:
            'Receba chamados na região, acompanhe o trajeto pelo mapa e gerencie ganhos, carteira e saques em janela própria.',
          ctaLabel: 'Abrir Portal do Motorista',
        }
      : {
          id: 'passageiro' as const,
          eyebrow: 'Aplicativo de Passageiros & Entregas',
          name: 'App Kavro Passageiro',
          shortName: 'Kavro Drive',
          route: '/cliente',
          fullUrl: `${origin}/cliente`,
          displayUrl: `${origin.replace(/^https?:\/\//, '')}/cliente`,
          description:
            'Solicite corridas em Kavro Padrão, agende horários ou envie encomendas via Kavro Entregas diretamente pelo ícone instalado.',
          ctaLabel: 'Abrir App Passageiro',
        };

  const handleSelectApp = (nextApp: AppTarget) => {
    setInstallFeedback('');
    syncDocumentManifestForApp(nextApp);
    navigate(`/instalar?app=${nextApp}`, { replace: true });
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(appMeta.fullUrl);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2500);
    } catch {
      setInstallFeedback(`Copie o endereço: ${appMeta.fullUrl}`);
    }
  };

  const handleTriggerNativeInstall = async () => {
    setInstallFeedback('');
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    if (choice.outcome === 'accepted') {
      setIsStandalone(true);
      setDeferredPrompt(null);
      setInstallFeedback(
        'Instalação confirmada. O atalho oficial aparecerá na área de trabalho ou tela inicial.'
      );
    }
  };

  const containerStyle: React.CSSProperties = {
    width: '100%',
    maxWidth: 1120,
    margin: '0 auto',
    padding: isMobile ? '0 18px' : '0 32px',
    boxSizing: 'border-box',
  };

  const stepGuides: Record<
    PlatformTab,
    Array<{ num: string; title: string; detail: string }>
  > = {
    desktop: [
      {
        num: '01',
        title: `Acesse ${appMeta.displayUrl} no Chrome ou Edge`,
        detail:
          'Abra o endereço oficial no navegador Google Chrome ou Microsoft Edge no Windows, Mac ou Linux.',
      },
      {
        num: '02',
        title: 'Clique no ícone de instalação na barra de endereços',
        detail:
          'No canto direito da barra onde fica o link, clique no ícone de monitor com seta ou no botão "Instalar". Você também pode abrir o menu de 3 pontos (⋮) > "Transmitir, salvar e compartilhar" > "Instalar página como aplicativo...".',
      },
      {
        num: '03',
        title: 'Confirme a criação do aplicativo',
        detail:
          'Na janela que surgir na tela, clique em "Instalar" para confirmar o nome Kavro Drive / Kavro Motorista.',
      },
      {
        num: '04',
        title: 'Atalho fixado na Área de Trabalho',
        detail:
          'O ícone oficial será criado automaticamente na Área de Trabalho e no Menu Iniciar (ou Dock no Mac), abrindo como programa próprio em janela dedicada.',
      },
    ],
    android: [
      {
        num: '01',
        title: `Abra ${appMeta.displayUrl} no Google Chrome`,
        detail:
          'Certifique-se de estar no Google Chrome. Se abriu o link dentro do WhatsApp ou Instagram, toque nos 3 pontos (⋮) e selecione "Abrir no navegador Chrome".',
      },
      {
        num: '02',
        title: 'Acesse o menu superior direito (⋮)',
        detail:
          'Toque nos três pontinhos verticais ao lado da barra de endereço (ou toque no banner "Instalar" caso apareça na parte inferior).',
      },
      {
        num: '03',
        title: 'Escolha "Instalar aplicativo" ou "Adicionar à tela inicial"',
        detail:
          'Dependendo da versão do Android/Chrome, a opção aparecerá com o ícone oficial da Kavro Drive ao lado.',
      },
      {
        num: '04',
        title: 'Confirme em "Instalar"',
        detail:
          'Em poucos segundos o ícone oficial aparecerá junto aos seus aplicativos, abrindo em tela cheia e mantendo sua conta conectada.',
      },
    ],
    ios: [
      {
        num: '01',
        title: `Abra ${appMeta.displayUrl} usando o Safari`,
        detail:
          'No iPhone e iPad, a Apple permite instalar Web Apps apenas através do navegador Safari. Se estiver no WhatsApp, Instagram ou Chrome, toque em Compartilhar > Abrir no Safari.',
      },
      {
        num: '02',
        title: 'Toque no botão Compartilhar do Safari',
        detail:
          'Na barra inferior do Safari (ou no topo em iPads), toque no ícone de quadrado com seta apontando para cima.',
      },
      {
        num: '03',
        title: 'Selecione "Adicionar à Tela de Início"',
        detail:
          'Role a lista de ações para baixo até encontrar o item "Adicionar à Tela de Início" (ícone com sinal "+").',
      },
      {
        num: '04',
        title: 'Toque em "Adicionar" para finalizar',
        detail:
          'Confira o nome do atalho no topo direito e confirme. O ícone da Kavro Drive será fixado diretamente na sua tela de início.',
      },
    ],
  };

  const activeSteps = stepGuides[platformTab];

  return (
    <div
      style={{
        minHeight: '100vh',
        backgroundColor: '#0A0F14',
        color: '#FFFFFF',
        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
        userSelect: 'text',
        overflowX: 'hidden',
      }}
    >
      {/* ═══ CABEÇALHO INSTITUCIONAL ═══ */}
      <header
        style={{
          position: 'sticky',
          top: 0,
          height: 66,
          backgroundColor: 'rgba(10, 15, 20, 0.96)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          zIndex: 80,
          display: 'flex',
          alignItems: 'center',
        }}
      >
        <div
          style={{
            ...containerStyle,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0 }}>
            <button
              type="button"
              onClick={() => navigate('/')}
              style={{
                background: 'none',
                border: 'none',
                padding: 0,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                flexShrink: 0,
              }}
            >
              <img
                src="/logo-horizontal-white.png"
                alt="Kavro Drive"
                style={{ height: isMobile ? 24 : 30, width: 'auto', objectFit: 'contain' }}
              />
            </button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              type="button"
              onClick={() => navigate('/ajuda')}
              style={{
                height: 36,
                padding: '0 12px',
                borderRadius: 8,
                border: '1px solid rgba(255, 255, 255, 0.14)',
                backgroundColor: 'transparent',
                color: '#E2E8F0',
                fontSize: '0.82rem',
                fontWeight: 600,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              Central de Ajuda
            </button>

            <button
              type="button"
              onClick={() => navigate('/')}
              style={{
                height: 36,
                padding: '0 12px',
                borderRadius: 8,
                border: 'none',
                backgroundColor: '#FFFFFF',
                color: '#0A0F14',
                fontSize: '0.82rem',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                whiteSpace: 'nowrap',
              }}
            >
              <ArrowLeft size={14} />
              <span>Site oficial</span>
            </button>
          </div>
        </div>
      </header>

      {/* ═══ SEÇÃO 1: TÍTULO + SELETOR DE APLICATIVO WEB / PWA ═══ */}
      <section
        style={{
          backgroundColor: '#0A0F14',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          paddingTop: isMobile ? 28 : 48,
          paddingBottom: isMobile ? 36 : 56,
        }}
      >
        <div style={containerStyle}>
          <div style={{ maxWidth: 740, marginBottom: isMobile ? 22 : 28 }}>
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                color: '#94A3B8',
                fontSize: '0.74rem',
                fontWeight: 700,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                marginBottom: 12,
              }}
            >
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: 2,
                  backgroundColor: '#76D800',
                  display: 'inline-block',
                }}
              />
              <span>Web App Oficial (PWA)</span>
            </div>

            <h1
              style={{
                fontSize: isMobile ? '1.85rem' : '2.75rem',
                fontWeight: 800,
                lineHeight: 1.1,
                letterSpacing: '-0.03em',
                color: '#FFFFFF',
                marginBottom: 14,
              }}
            >
              Instale a Kavro Drive na tela inicial ou na área de trabalho.
            </h1>

            <p
              style={{
                fontSize: isMobile ? '0.94rem' : '1.02rem',
                lineHeight: 1.6,
                color: '#94A3B8',
              }}
            >
              Atualmente operamos exclusivamente pela web e como aplicativo PWA oficial. Você não
              precisa baixar nada pela Play Store ou App Store: basta fixar o atalho pelo navegador
              para abrir em tela cheia no celular ou como programa no computador.
            </p>
          </div>

          {/* Seletor entre App Passageiro e App Motorista Parceiro */}
          <div
            style={{
              display: 'inline-grid',
              gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
              gap: 4,
              backgroundColor: '#121922',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: 8,
              padding: 4,
              marginBottom: 18,
              width: isMobile ? '100%' : 'auto',
            }}
          >
            {[
              { key: 'passageiro' as const, label: 'App Kavro Passageiro' },
              { key: 'motorista' as const, label: 'App Parceiro (Motorista)' },
            ].map((item) => {
              const active = selectedApp === item.key;
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => handleSelectApp(item.key)}
                  style={{
                    height: 38,
                    padding: isMobile ? '0 10px' : '0 20px',
                    borderRadius: 6,
                    border: 'none',
                    backgroundColor: active ? '#FFFFFF' : 'transparent',
                    color: active ? '#0A0F14' : '#94A3B8',
                    fontSize: isMobile ? '0.78rem' : '0.86rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {item.label}
                </button>
              );
            })}
          </div>

          {/* Card do Aplicativo Selecionado + Botões Diretos */}
          <div
            style={{
              backgroundColor: '#121922',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              borderRadius: 12,
              padding: isMobile ? 16 : 24,
              display: 'flex',
              flexDirection: isMobile ? 'column' : 'row',
              alignItems: isMobile ? 'stretch' : 'center',
              justifyContent: 'space-between',
              gap: isMobile ? 18 : 28,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, flex: 1 }}>
              <div
                style={{
                  width: isMobile ? 52 : 60,
                  height: isMobile ? 52 : 60,
                  borderRadius: 12,
                  backgroundColor: '#FFFFFF',
                  border: '1px solid #E2E8F0',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <img
                  src="/logo-icon.png"
                  alt={appMeta.name}
                  style={{ width: isMobile ? 38 : 44, height: isMobile ? 38 : 44, objectFit: 'contain' }}
                />
              </div>

              <div style={{ minWidth: 0, flex: 1 }}>
                <div
                  style={{
                    fontSize: '0.7rem',
                    fontWeight: 700,
                    letterSpacing: '0.07em',
                    textTransform: 'uppercase',
                    color: '#94A3B8',
                    marginBottom: 4,
                  }}
                >
                  {appMeta.eyebrow}
                </div>
                <h2
                  style={{
                    fontSize: isMobile ? '1.12rem' : '1.3rem',
                    fontWeight: 800,
                    color: '#FFFFFF',
                    marginBottom: 6,
                  }}
                >
                  {appMeta.name}
                </h2>
                <p
                  style={{
                    fontSize: '0.86rem',
                    lineHeight: 1.5,
                    color: '#CBD5E1',
                    marginBottom: 12,
                    maxWidth: 560,
                  }}
                >
                  {appMeta.description}
                </p>

                {/* Endereço oficial + botão copiar */}
                <div
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 8,
                    backgroundColor: '#0A0F14',
                    border: '1px solid rgba(255, 255, 255, 0.12)',
                    borderRadius: 8,
                    padding: '6px 10px',
                    maxWidth: '100%',
                    flexWrap: 'wrap',
                  }}
                >
                  <span
                    style={{
                      fontSize: '0.8rem',
                      fontWeight: 600,
                      color: '#E2E8F0',
                      wordBreak: 'break-all',
                    }}
                  >
                    {appMeta.displayUrl}
                  </span>
                  <button
                    type="button"
                    onClick={handleCopyLink}
                    style={{
                      background: 'rgba(255,255,255,0.08)',
                      border: 'none',
                      borderRadius: 6,
                      color: '#FFFFFF',
                      fontSize: '0.73rem',
                      fontWeight: 600,
                      padding: '4px 8px',
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                    }}
                  >
                    {copiedLink ? <Check size={12} color="#76D800" /> : <Copy size={12} />}
                    <span>{copiedLink ? 'Copiado' : 'Copiar link'}</span>
                  </button>
                </div>

                {/* Botões de ação imediata */}
                <div
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: 10,
                    marginTop: 16,
                  }}
                >
                  {deferredPrompt && !isStandalone && (
                    <button
                      type="button"
                      onClick={handleTriggerNativeInstall}
                      style={{
                        height: 44,
                        padding: '0 20px',
                        borderRadius: 8,
                        border: 'none',
                        backgroundColor: '#76D800',
                        color: '#0A0F14',
                        fontSize: '0.88rem',
                        fontWeight: 800,
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 8,
                      }}
                    >
                      <Download size={16} />
                      <span>Instalar {appMeta.shortName} agora</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => navigate(appMeta.route)}
                    style={{
                      height: 44,
                      padding: '0 20px',
                      borderRadius: 8,
                      border:
                        deferredPrompt && !isStandalone
                          ? '1px solid rgba(255, 255, 255, 0.22)'
                          : 'none',
                      backgroundColor:
                        deferredPrompt && !isStandalone ? 'transparent' : '#76D800',
                      color: deferredPrompt && !isStandalone ? '#FFFFFF' : '#0A0F14',
                      fontSize: '0.88rem',
                      fontWeight: 800,
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 8,
                    }}
                  >
                    <span>{appMeta.ctaLabel}</span>
                    <ArrowRight size={16} />
                  </button>
                </div>

                {isStandalone && (
                  <div
                    style={{
                      marginTop: 12,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      fontSize: '0.8rem',
                      fontWeight: 600,
                      color: '#86EFAC',
                    }}
                  >
                    <CheckCircle2 size={15} />
                    <span>Você já está utilizando a versão Web App instalada neste dispositivo.</span>
                  </div>
                )}

                {installFeedback && (
                  <div
                    style={{
                      marginTop: 10,
                      fontSize: '0.82rem',
                      color: '#86EFAC',
                      fontWeight: 600,
                    }}
                  >
                    {installFeedback}
                  </div>
                )}
              </div>
            </div>

            {/* QR Code para instalação rápida pelo celular quando visto no desktop */}
            {!isMobile && (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 8,
                  paddingLeft: 20,
                  borderLeft: '1px solid rgba(255, 255, 255, 0.1)',
                  flexShrink: 0,
                }}
              >
                <QrInstallBox url={appMeta.fullUrl} />
                <span style={{ fontSize: '0.73rem', color: '#94A3B8', textAlign: 'center', maxWidth: 140 }}>
                  Escaneie com a câmera para abrir no celular
                </span>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ═══ SEÇÃO 2: PASSO A PASSO POR DISPOSITIVO (ÁREA DE TRABALHO, ANDROID E IPHONE) ═══ */}
      <section
        style={{
          backgroundColor: '#FFFFFF',
          color: '#0A0F14',
          paddingTop: isMobile ? 38 : 64,
          paddingBottom: isMobile ? 46 : 72,
          borderBottom: '1px solid #E2E8F0',
        }}
      >
        <div style={containerStyle}>
          <div style={{ marginBottom: isMobile ? 20 : 28 }}>
            <div
              style={{
                fontSize: '0.74rem',
                fontWeight: 700,
                color: '#15803D',
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                marginBottom: 8,
              }}
            >
              Guia passo a passo
            </div>
            <h2
              style={{
                fontSize: isMobile ? '1.55rem' : '2.1rem',
                fontWeight: 800,
                lineHeight: 1.16,
                letterSpacing: '-0.025em',
                color: '#0A0F14',
                marginBottom: 8,
              }}
            >
              Como fixar o atalho conforme o seu dispositivo
            </h2>
            <p style={{ fontSize: '0.94rem', color: '#475569', maxWidth: 660 }}>
              Selecione abaixo onde deseja instalar o aplicativo ({appMeta.name}) para ver o
              procedimento exato.
            </p>
          </div>

          {/* Seletor de Dispositivo / Sistema */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, minmax(0, 1fr))',
              gap: 10,
              marginBottom: isMobile ? 22 : 30,
            }}
          >
            {[
              {
                key: 'desktop' as const,
                title: 'Computador (Área de Trabalho)',
                sub: 'Windows, Mac ou Linux • Chrome e Edge',
                icon: <Laptop size={18} />,
              },
              {
                key: 'android' as const,
                title: 'Celular Android',
                sub: 'Google Chrome e navegadores Chromium',
                icon: <Smartphone size={18} />,
              },
              {
                key: 'ios' as const,
                title: 'iPhone e iPad (iOS)',
                sub: 'Navegador Safari da Apple',
                icon: <Share size={18} />,
              },
            ].map((tab) => {
              const active = platformTab === tab.key;
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setPlatformTab(tab.key)}
                  style={{
                    textAlign: 'left',
                    padding: '14px 16px',
                    borderRadius: 10,
                    border: active ? '1.5px solid #0A0F14' : '1px solid #E2E8F0',
                    backgroundColor: active ? '#0A0F14' : '#F8FAFC',
                    color: active ? '#FFFFFF' : '#0A0F14',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                  }}
                >
                  <div
                    style={{
                      width: 38,
                      height: 38,
                      borderRadius: 8,
                      backgroundColor: active ? '#76D800' : '#E2E8F0',
                      color: '#0A0F14',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    {tab.icon}
                  </div>
                  <div>
                    <div style={{ fontSize: '0.92rem', fontWeight: 700 }}>{tab.title}</div>
                    <div
                      style={{
                        fontSize: '0.76rem',
                        color: active ? '#CBD5E1' : '#64748B',
                        marginTop: 2,
                      }}
                    >
                      {tab.sub}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Grid Principal: Lista Numerada + Ilustração Arquitetônica do Navegador */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: isMobile ? '1fr' : 'minmax(0, 1.1fr) minmax(0, 0.9fr)',
              gap: isMobile ? 20 : 32,
              alignItems: 'start',
            }}
          >
            {/* Etapas detalhadas */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {activeSteps.map((step) => (
                <div
                  key={step.num}
                  style={{
                    backgroundColor: '#F8FAFC',
                    border: '1px solid #E2E8F0',
                    borderRadius: 10,
                    padding: '16px 18px',
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 14,
                  }}
                >
                  <span
                    style={{
                      minWidth: 32,
                      height: 32,
                      borderRadius: 6,
                      backgroundColor: '#0A0F14',
                      color: '#76D800',
                      fontSize: '0.8rem',
                      fontWeight: 800,
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    {step.num}
                  </span>
                  <div>
                    <h3
                      style={{
                        fontSize: '0.98rem',
                        fontWeight: 700,
                        color: '#0A0F14',
                        marginBottom: 4,
                      }}
                    >
                      {step.title}
                    </h3>
                    <p style={{ fontSize: '0.86rem', lineHeight: 1.55, color: '#475569' }}>
                      {step.detail}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            {/* Painel Visual Esquemático da Tela Real do Sistema */}
            <div
              style={{
                backgroundColor: '#0E141B',
                color: '#FFFFFF',
                border: '1px solid #1E293B',
                borderRadius: 12,
                padding: isMobile ? 16 : 22,
              }}
            >
              <div
                style={{
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.07em',
                  color: '#94A3B8',
                  marginBottom: 6,
                }}
              >
                Onde clicar na tela
              </div>
              <div style={{ fontSize: '1.02rem', fontWeight: 700, color: '#FFFFFF', marginBottom: 16 }}>
                {platformTab === 'desktop' && 'Barra de endereços e menu no Chrome / Edge'}
                {platformTab === 'android' && 'Menu superior direito do Google Chrome'}
                {platformTab === 'ios' && 'Barra inferior do navegador Safari'}
              </div>

              {platformTab === 'desktop' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {/* Simulação da barra de endereço Desktop */}
                  <div
                    style={{
                      backgroundColor: '#16202A',
                      border: '1px solid rgba(255,255,255,0.12)',
                      borderRadius: 10,
                      padding: 12,
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        marginBottom: 10,
                      }}
                    >
                      <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: '#475569' }} />
                      <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: '#475569' }} />
                      <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: '#475569' }} />
                    </div>
                    <div
                      style={{
                        backgroundColor: '#0A0F14',
                        border: '1px solid rgba(255,255,255,0.12)',
                        borderRadius: 8,
                        padding: '8px 10px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 8,
                      }}
                    >
                      <span
                        style={{
                          fontSize: '0.78rem',
                          color: '#CBD5E1',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {appMeta.displayUrl}
                      </span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                        <span
                          style={{
                            padding: '4px 8px',
                            borderRadius: 6,
                            backgroundColor: '#76D800',
                            color: '#0A0F14',
                            fontSize: '0.7rem',
                            fontWeight: 800,
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                          }}
                        >
                          <MonitorDown size={13} />
                          <span>Instalar</span>
                        </span>
                        <MoreVertical size={15} color="#94A3B8" />
                      </div>
                    </div>
                  </div>

                  {/* Caminho alternativo no menu */}
                  <div
                    style={{
                      backgroundColor: '#121922',
                      border: '1px solid rgba(255,255,255,0.1)',
                      borderRadius: 10,
                      padding: 14,
                    }}
                  >
                    <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#FFFFFF', marginBottom: 6 }}>
                      Caminho alternativo (Chrome ou Edge)
                    </div>
                    <div style={{ fontSize: '0.8rem', color: '#94A3B8', lineHeight: 1.55 }}>
                      • <strong style={{ color: '#E2E8F0' }}>Google Chrome:</strong> menu{' '}
                      <strong style={{ color: '#E2E8F0' }}>⋮</strong> →{' '}
                      <strong style={{ color: '#E2E8F0' }}>Transmitir, salvar e compartilhar</strong> →{' '}
                      <strong style={{ color: '#76D800' }}>Instalar página como aplicativo...</strong>
                      <br />• <strong style={{ color: '#E2E8F0' }}>Microsoft Edge:</strong> menu{' '}
                      <strong style={{ color: '#E2E8F0' }}>⋯</strong> →{' '}
                      <strong style={{ color: '#E2E8F0' }}>Aplicativos</strong> →{' '}
                      <strong style={{ color: '#76D800' }}>Instalar este site como um aplicativo</strong>
                      <br />• <strong style={{ color: '#E2E8F0' }}>Mac (Safari):</strong> barra superior{' '}
                      <strong style={{ color: '#E2E8F0' }}>Arquivo</strong> →{' '}
                      <strong style={{ color: '#76D800' }}>Adicionar ao Dock</strong>
                    </div>
                  </div>
                </div>
              )}

              {platformTab === 'android' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div
                    style={{
                      backgroundColor: '#16202A',
                      border: '1px solid rgba(255,255,255,0.12)',
                      borderRadius: 10,
                      padding: 12,
                    }}
                  >
                    <div
                      style={{
                        backgroundColor: '#0A0F14',
                        borderRadius: 8,
                        padding: '8px 10px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        marginBottom: 10,
                      }}
                    >
                      <span style={{ fontSize: '0.76rem', color: '#CBD5E1' }}>
                        {appMeta.displayUrl}
                      </span>
                      <span
                        style={{
                          width: 28,
                          height: 28,
                          borderRadius: 6,
                          backgroundColor: '#76D800',
                          color: '#0A0F14',
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <MoreVertical size={15} />
                      </span>
                    </div>

                    <div
                      style={{
                        backgroundColor: '#121922',
                        border: '1px solid rgba(255,255,255,0.1)',
                        borderRadius: 8,
                        padding: 10,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 6,
                      }}
                    >
                      <div style={{ fontSize: '0.76rem', color: '#94A3B8' }}>Compartilhar</div>
                      <div style={{ fontSize: '0.76rem', color: '#94A3B8' }}>Traduzir...</div>
                      <div
                        style={{
                          fontSize: '0.8rem',
                          fontWeight: 700,
                          color: '#0A0F14',
                          backgroundColor: '#76D800',
                          borderRadius: 6,
                          padding: '7px 10px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                        }}
                      >
                        <Download size={14} />
                        <span>Instalar aplicativo / Adicionar à tela inicial</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {platformTab === 'ios' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div
                    style={{
                      backgroundColor: '#16202A',
                      border: '1px solid rgba(255,255,255,0.12)',
                      borderRadius: 10,
                      padding: 12,
                    }}
                  >
                    <div
                      style={{
                        backgroundColor: '#121922',
                        border: '1px solid rgba(255,255,255,0.1)',
                        borderRadius: 8,
                        padding: 10,
                        marginBottom: 10,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 8,
                      }}
                    >
                      <div style={{ fontSize: '0.76rem', color: '#94A3B8' }}>Copiar</div>
                      <div
                        style={{
                          fontSize: '0.8rem',
                          fontWeight: 700,
                          color: '#0A0F14',
                          backgroundColor: '#76D800',
                          borderRadius: 6,
                          padding: '7px 10px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                        }}
                      >
                        <span>Adicionar à Tela de Início</span>
                        <PlusSquare size={15} />
                      </div>
                    </div>

                    <div
                      style={{
                        backgroundColor: '#0A0F14',
                        borderRadius: 8,
                        padding: '8px 14px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-around',
                        color: '#64748B',
                        fontSize: '0.76rem',
                      }}
                    >
                      <span>‹</span>
                      <span>›</span>
                      <span
                        style={{
                          padding: '5px 10px',
                          borderRadius: 6,
                          backgroundColor: '#76D800',
                          color: '#0A0F14',
                          fontWeight: 800,
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                        }}
                      >
                        <Share size={14} />
                        <span>Compartilhar</span>
                      </span>
                      <span>⊡</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Preview do ícone resultante */}
              <div
                style={{
                  marginTop: 14,
                  borderTop: '1px solid rgba(255,255,255,0.1)',
                  paddingTop: 14,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                }}
              >
                <div
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 10,
                    backgroundColor: '#FFFFFF',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  <img
                    src="/logo-icon.png"
                    alt={appMeta.shortName}
                    style={{ width: 32, height: 32, objectFit: 'contain' }}
                  />
                </div>
                <div>
                  <div style={{ fontSize: '0.84rem', fontWeight: 700, color: '#FFFFFF' }}>
                    Ícone: {appMeta.shortName}
                  </div>
                  <div style={{ fontSize: '0.76rem', color: '#94A3B8' }}>
                    Abre diretamente em {appMeta.route} em tela cheia.
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ SEÇÃO 3: ORIENTAÇÃO WHATSAPP / INSTAGRAM & BENEFÍCIOS DO PWA ═══ */}
      <section
        style={{
          backgroundColor: '#F6F7F8',
          color: '#0A0F14',
          paddingTop: isMobile ? 38 : 56,
          paddingBottom: isMobile ? 48 : 68,
        }}
      >
        <div style={containerStyle}>
          {/* Aviso prático sobre navegadores internos (WhatsApp / Instagram) */}
          <div
            style={{
              backgroundColor: '#FFFFFF',
              border: '1px solid #CBD5E1',
              borderRadius: 10,
              padding: isMobile ? 16 : 22,
              marginBottom: 24,
              display: 'flex',
              flexDirection: isMobile ? 'column' : 'row',
              alignItems: isMobile ? 'flex-start' : 'center',
              justifyContent: 'space-between',
              gap: 16,
            }}
          >
            <div>
              <div
                style={{
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.07em',
                  color: '#15803D',
                  marginBottom: 4,
                }}
              >
                Importante se você veio por um link
              </div>
              <h3 style={{ fontSize: '1.02rem', fontWeight: 700, color: '#0A0F14', marginBottom: 4 }}>
                Abriu dentro do WhatsApp ou Instagram e não apareceu "Instalar"?
              </h3>
              <p style={{ fontSize: '0.86rem', color: '#475569', lineHeight: 1.55, maxWidth: 740 }}>
                Os visualizadores internos desses aplicativos bloqueiam a instalação de atalhos.
                Toque no menu de <strong>3 pontos (⋮)</strong> no Android e escolha{' '}
                <strong>"Abrir no navegador"</strong>, ou no iPhone toque no ícone do{' '}
                <strong>Safari / Compartilhar</strong> para abrir fora do WhatsApp.
              </p>
            </div>
            <button
              type="button"
              onClick={handleCopyLink}
              style={{
                height: 40,
                padding: '0 16px',
                borderRadius: 8,
                border: '1px solid #0A0F14',
                backgroundColor: '#0A0F14',
                color: '#FFFFFF',
                fontSize: '0.82rem',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                whiteSpace: 'nowrap',
                flexShrink: 0,
              }}
            >
              <ExternalLink size={14} />
              <span>{copiedLink ? 'Link copiado!' : 'Copiar link para o navegador'}</span>
            </button>
          </div>

          {/* 3 Pilares do Web App PWA */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, minmax(0, 1fr))',
              gap: 14,
            }}
          >
            {[
              {
                title: 'Leve no aparelho',
                text: 'Não consome espaço de armazenamento como aplicativos tradicionais de loja e funciona em qualquer celular moderno.',
              },
              {
                title: 'Sempre atualizado',
                text: 'Melhorias no mapa, tarifas, pagamentos via PIX ou cartão à vista entram no ar instantaneamente sem downloads manuais.',
              },
              {
                title: 'Recursos completos',
                text: 'GPS ao vivo, notificações de viagem, câmera para verificação CNH/KYC e código de embarque funcionam direto pelo Web App.',
              },
            ].map((item) => (
              <div
                key={item.title}
                style={{
                  backgroundColor: '#FFFFFF',
                  border: '1px solid #E2E8F0',
                  borderRadius: 10,
                  padding: '16px 18px',
                }}
              >
                <div style={{ fontSize: '0.94rem', fontWeight: 700, color: '#0A0F14', marginBottom: 6 }}>
                  {item.title}
                </div>
                <div style={{ fontSize: '0.84rem', color: '#475569', lineHeight: 1.55 }}>
                  {item.text}
                </div>
              </div>
            ))}
          </div>

          {/* Rodapé simples com atalhos finais */}
          <div
            style={{
              marginTop: 28,
              paddingTop: 22,
              borderTop: '1px solid #E2E8F0',
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
            }}
          >
            <div style={{ fontSize: '0.82rem', color: '#64748B' }}>
              © {CURRENT_YEAR} {config.companyName || 'Kavro Drive'}. Acesso oficial Web e PWA.
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
              <button
                type="button"
                onClick={() => navigate('/cliente')}
                style={{
                  height: 38,
                  padding: '0 14px',
                  borderRadius: 8,
                  border: 'none',
                  backgroundColor: '#0A0F14',
                  color: '#FFFFFF',
                  fontSize: '0.82rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Abrir App Passageiro
              </button>
              <button
                type="button"
                onClick={() => navigate('/kavro-drive')}
                style={{
                  height: 38,
                  padding: '0 14px',
                  borderRadius: 8,
                  border: '1px solid #CBD5E1',
                  backgroundColor: '#FFFFFF',
                  color: '#0A0F14',
                  fontSize: '0.82rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Abrir Portal Motorista
              </button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};
