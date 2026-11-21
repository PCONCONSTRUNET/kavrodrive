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
  MoreVertical,
  PlusSquare,
  Share,
  Smartphone,
} from 'lucide-react';
import { SystemConfig } from '../types';

interface InstallPwaTutorialScreenProps {
  config: SystemConfig;
}

type AppTarget = 'passageiro' | 'motorista';
type PlatformTab = 'android' | 'ios';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const CURRENT_YEAR = new Date().getFullYear();

function detectInitialPlatform(): PlatformTab {
  if (typeof navigator === 'undefined') return 'android';
  const ua = navigator.userAgent.toLowerCase();
  if (
    /iphone|ipad|ipod/.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  ) {
    return 'ios';
  }
  return 'android';
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

const QrCompactBox: React.FC<{ url: string }> = ({ url }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    QRCode.toCanvas(
      canvasRef.current,
      url,
      {
        width: 96,
        margin: 1,
        color: { dark: '#0A0F14', light: '#FFFFFF' },
      },
      () => {}
    );
  }, [url]);

  return (
    <div
      style={{
        width: 108,
        height: 108,
        backgroundColor: '#FFFFFF',
        borderRadius: 10,
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
      setInstallFeedback('Aplicativo instalado na tela inicial.');
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
          name: 'Kavro Parceiro (Motorista)',
          shortName: 'Kavro Motorista',
          route: '/kavro-drive',
          fullUrl: `${origin}/kavro-drive`,
          displayUrl: `${origin.replace(/^https?:\/\//, '')}/kavro-drive`,
          ctaLabel: 'Abrir Portal Motorista',
        }
      : {
          name: 'Kavro Passageiro',
          shortName: 'Kavro Drive',
          route: '/cliente',
          fullUrl: `${origin}/cliente`,
          displayUrl: `${origin.replace(/^https?:\/\//, '')}/cliente`,
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
      setTimeout(() => setCopiedLink(false), 2200);
    } catch {
      setInstallFeedback(appMeta.fullUrl);
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
      setInstallFeedback('Atalho instalado no seu dispositivo.');
    }
  };

  const guides: Record<
    PlatformTab,
    {
      label: string;
      hint: string;
      steps: Array<{ num: string; title: string; sub: string }>;
    }
  > = {
    android: {
      label: 'Celular Android (Chrome)',
      hint: 'Se veio pelo WhatsApp/Instagram, toque em ⋮ → Abrir no navegador primeiro.',
      steps: [
        {
          num: '1',
          title: 'Abra este site no Google Chrome',
          sub: `Endereço oficial: ${appMeta.displayUrl}`,
        },
        {
          num: '2',
          title: 'Toque nos 3 pontos (⋮) no alto à direita',
          sub: 'Menu principal do Google Chrome.',
        },
        {
          num: '3',
          title: 'Toque em "Instalar aplicativo"',
          sub: 'Ou "Adicionar à tela inicial" e confirme.',
        },
      ],
    },
    ios: {
      label: 'iPhone e iPad (Safari)',
      hint: 'No iPhone, a Apple só permite instalar pelo navegador Safari.',
      steps: [
        {
          num: '1',
          title: 'Abra o link no navegador Safari',
          sub: `Endereço oficial: ${appMeta.displayUrl}`,
        },
        {
          num: '2',
          title: 'Toque em Compartilhar (□↑)',
          sub: 'Fica na barra inferior do Safari.',
        },
        {
          num: '3',
          title: 'Escolha "Adicionar à Tela de Início"',
          sub: 'Depois toque em "Adicionar" no canto direito.',
        },
      ],
    },
  };

  const currentGuide = guides[platformTab];

  const containerStyle: React.CSSProperties = {
    width: '100%',
    maxWidth: 960,
    margin: '0 auto',
    padding: isMobile ? '0 16px' : '0 28px',
    boxSizing: 'border-box',
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        backgroundColor: '#0A0F14',
        color: '#FFFFFF',
        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
        userSelect: 'text',
      }}
    >
      {/* Cabeçalho simples */}
      <header
        style={{
          height: 60,
          backgroundColor: '#0A0F14',
          borderBottom: '1px solid rgba(255,255,255,0.08)',
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
          }}
        >
          <button
            type="button"
            onClick={() => navigate('/')}
            style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
          >
            <img
              src="/logo-horizontal-white.png"
              alt="Kavro Drive"
              style={{ height: 24, width: 'auto', display: 'block', objectFit: 'contain' }}
            />
          </button>

          <button
            type="button"
            onClick={() => navigate('/')}
            style={{
              height: 34,
              padding: '0 12px',
              borderRadius: 8,
              border: '1px solid rgba(255,255,255,0.16)',
              backgroundColor: 'transparent',
              color: '#FFFFFF',
              fontSize: '0.8rem',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <ArrowLeft size={14} />
            <span>Voltar</span>
          </button>
        </div>
      </header>

      {/* Bloco Superior Compacto: Qual App + Ação Imediata */}
      <section
        style={{
          backgroundColor: '#0A0F14',
          paddingTop: isMobile ? 22 : 34,
          paddingBottom: isMobile ? 26 : 38,
          borderBottom: '1px solid rgba(255,255,255,0.08)',
        }}
      >
        <div style={containerStyle}>
          {/* Alternador Passageiro | Motorista */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
              gap: 4,
              backgroundColor: '#121922',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 8,
              padding: 4,
              maxWidth: isMobile ? '100%' : 360,
              marginBottom: 18,
            }}
          >
            {[
              { key: 'passageiro' as const, label: 'Passageiro' },
              { key: 'motorista' as const, label: 'Motorista' },
            ].map((item) => {
              const active = selectedApp === item.key;
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => handleSelectApp(item.key)}
                  style={{
                    height: 36,
                    borderRadius: 6,
                    border: 'none',
                    backgroundColor: active ? '#FFFFFF' : 'transparent',
                    color: active ? '#0A0F14' : '#94A3B8',
                    fontSize: '0.84rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  {item.label}
                </button>
              );
            })}
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: isMobile ? 'stretch' : 'center',
              justifyContent: 'space-between',
              flexDirection: isMobile ? 'column' : 'row',
              gap: 20,
            }}
          >
            <div style={{ flex: 1 }}>
              <h1
                style={{
                  fontSize: isMobile ? '1.55rem' : '2.1rem',
                  fontWeight: 800,
                  letterSpacing: '-0.025em',
                  lineHeight: 1.15,
                  color: '#FFFFFF',
                  marginBottom: 8,
                }}
              >
                Instalar {appMeta.name}
              </h1>
              <p
                style={{
                  fontSize: isMobile ? '0.88rem' : '0.96rem',
                  color: '#94A3B8',
                  lineHeight: 1.5,
                  marginBottom: 16,
                  maxWidth: 560,
                }}
              >
                Operamos direto na Web e via Web App (PWA), sem baixar em loja. Instale na tela
                inicial do seu celular em 3 passos.
              </p>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                {deferredPrompt && !isStandalone && (
                  <button
                    type="button"
                    onClick={handleTriggerNativeInstall}
                    style={{
                      height: 42,
                      padding: '0 18px',
                      borderRadius: 8,
                      border: 'none',
                      backgroundColor: '#76D800',
                      color: '#0A0F14',
                      fontSize: '0.86rem',
                      fontWeight: 800,
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 7,
                    }}
                  >
                    <Download size={16} />
                    <span>Instalar agora</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => navigate(appMeta.route)}
                  style={{
                    height: 42,
                    padding: '0 18px',
                    borderRadius: 8,
                    border:
                      deferredPrompt && !isStandalone
                        ? '1px solid rgba(255,255,255,0.22)'
                        : 'none',
                    backgroundColor:
                      deferredPrompt && !isStandalone ? 'transparent' : '#76D800',
                    color: deferredPrompt && !isStandalone ? '#FFFFFF' : '#0A0F14',
                    fontSize: '0.86rem',
                    fontWeight: 800,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 7,
                  }}
                >
                  <span>{appMeta.ctaLabel}</span>
                  <ArrowRight size={15} />
                </button>

                <button
                  type="button"
                  onClick={handleCopyLink}
                  style={{
                    height: 42,
                    padding: '0 14px',
                    borderRadius: 8,
                    border: '1px solid rgba(255,255,255,0.16)',
                    backgroundColor: '#121922',
                    color: '#E2E8F0',
                    fontSize: '0.82rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  {copiedLink ? <Check size={14} color="#76D800" /> : <Copy size={14} />}
                  <span>{copiedLink ? 'Link copiado' : 'Copiar link'}</span>
                </button>
              </div>

              {(isStandalone || installFeedback) && (
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
                  <CheckCircle2 size={14} />
                  <span>
                    {installFeedback || 'Este aplicativo já está instalado no aparelho.'}
                  </span>
                </div>
              )}
            </div>

            {!isMobile && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                <QrCompactBox url={appMeta.fullUrl} />
                <span style={{ fontSize: '0.72rem', color: '#94A3B8' }}>
                  Abrir no celular
                </span>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Bloco Principal: Tutorial Simplificado (Abas horizontais + 3 passos curtos) */}
      <section
        style={{
          backgroundColor: '#FFFFFF',
          color: '#0A0F14',
          paddingTop: isMobile ? 24 : 38,
          paddingBottom: isMobile ? 36 : 52,
        }}
      >
        <div style={containerStyle}>
          {/* 2 Abas em uma única linha horizontal (Android e iOS) */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
              gap: 6,
              backgroundColor: '#F1F5F9',
              padding: 4,
              borderRadius: 10,
              marginBottom: 18,
              maxWidth: isMobile ? '100%' : 420,
            }}
          >
            {[
              { key: 'android' as const, label: 'Android', icon: <Smartphone size={15} /> },
              { key: 'ios' as const, label: 'iPhone (iOS)', icon: <Share size={15} /> },
            ].map((tab) => {
              const active = platformTab === tab.key;
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setPlatformTab(tab.key)}
                  style={{
                    height: 38,
                    padding: '0 8px',
                    borderRadius: 7,
                    border: 'none',
                    backgroundColor: active ? '#0A0F14' : 'transparent',
                    color: active ? '#FFFFFF' : '#475569',
                    fontSize: isMobile ? '0.78rem' : '0.84rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {tab.icon}
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: 8,
              marginBottom: 14,
            }}
          >
            <h2 style={{ fontSize: isMobile ? '1.1rem' : '1.25rem', fontWeight: 800, margin: 0 }}>
              {currentGuide.label}
            </h2>
            <span style={{ fontSize: '0.8rem', color: '#475569' }}>{currentGuide.hint}</span>
          </div>

          {/* 3 Passos Diretos + Miniatura Visual */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: isMobile ? '1fr' : 'minmax(0, 1.35fr) minmax(0, 0.85fr)',
              gap: 16,
              alignItems: 'stretch',
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {currentGuide.steps.map((step) => (
                <div
                  key={step.num}
                  style={{
                    border: '1px solid #E2E8F0',
                    backgroundColor: '#F8FAFC',
                    borderRadius: 10,
                    padding: '13px 14px',
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 12,
                  }}
                >
                  <span
                    style={{
                      width: 26,
                      height: 26,
                      borderRadius: 6,
                      backgroundColor: '#0A0F14',
                      color: '#76D800',
                      fontSize: '0.78rem',
                      fontWeight: 800,
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                      marginTop: 1,
                    }}
                  >
                    {step.num}
                  </span>
                  <div>
                    <div style={{ fontSize: '0.92rem', fontWeight: 700, color: '#0A0F14' }}>
                      {step.title}
                    </div>
                    <div style={{ fontSize: '0.82rem', color: '#475569', marginTop: 2, lineHeight: 1.45 }}>
                      {step.sub}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Miniatura compacta mostrando o botão exato */}
            <div
              style={{
                backgroundColor: '#0E141B',
                color: '#FFFFFF',
                borderRadius: 10,
                padding: 16,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                gap: 12,
              }}
            >
              <div>
                <div
                  style={{
                    fontSize: '0.68rem',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.07em',
                    color: '#94A3B8',
                    marginBottom: 8,
                  }}
                >
                  Botão para tocar
                </div>

                {platformTab === 'android' && (
                  <div
                    style={{
                      backgroundColor: '#121922',
                      border: '1px solid rgba(255,255,255,0.1)',
                      borderRadius: 8,
                      padding: 10,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 8,
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        fontSize: '0.75rem',
                        color: '#CBD5E1',
                      }}
                    >
                      <span>{appMeta.displayUrl}</span>
                      <span
                        style={{
                          padding: '3px 6px',
                          borderRadius: 5,
                          backgroundColor: 'rgba(255,255,255,0.1)',
                          display: 'inline-flex',
                        }}
                      >
                        <MoreVertical size={14} />
                      </span>
                    </div>
                    <div
                      style={{
                        padding: '7px 10px',
                        borderRadius: 6,
                        backgroundColor: '#76D800',
                        color: '#0A0F14',
                        fontSize: '0.78rem',
                        fontWeight: 800,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                      }}
                    >
                      <Download size={14} />
                      <span>Instalar aplicativo</span>
                    </div>
                  </div>
                )}

                {platformTab === 'ios' && (
                  <div
                    style={{
                      backgroundColor: '#121922',
                      border: '1px solid rgba(255,255,255,0.1)',
                      borderRadius: 8,
                      padding: 10,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 8,
                    }}
                  >
                    <div
                      style={{
                        padding: '7px 10px',
                        borderRadius: 6,
                        backgroundColor: '#76D800',
                        color: '#0A0F14',
                        fontSize: '0.78rem',
                        fontWeight: 800,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}
                    >
                      <span>Adicionar à Tela de Início</span>
                      <PlusSquare size={14} />
                    </div>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'center',
                        fontSize: '0.74rem',
                        color: '#CBD5E1',
                        gap: 6,
                        alignItems: 'center',
                      }}
                    >
                      <span>Barra do Safari →</span>
                      <Share size={13} color="#76D800" />
                    </div>
                  </div>
                )}
              </div>

              <div
                style={{
                  borderTop: '1px solid rgba(255,255,255,0.1)',
                  paddingTop: 10,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                }}
              >
                <div
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: 8,
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
                    style={{ width: 24, height: 24, objectFit: 'contain' }}
                  />
                </div>
                <div style={{ fontSize: '0.76rem', color: '#CBD5E1', lineHeight: 1.35 }}>
                  <strong style={{ color: '#FFFFFF' }}>{appMeta.shortName}</strong> fica salvo como
                  aplicativo sem ocupar memória.
                </div>
              </div>
            </div>
          </div>

          {/* Rodapé minimalista */}
          <div
            style={{
              marginTop: 24,
              paddingTop: 16,
              borderTop: '1px solid #E2E8F0',
              fontSize: '0.78rem',
              color: '#64748B',
              display: 'flex',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: 8,
            }}
          >
            <span>© {CURRENT_YEAR} {config.companyName || 'Kavro Drive'}</span>
            <span>Acesso oficial Web &amp; PWA</span>
          </div>
        </div>
      </section>
    </div>
  );
};
